"""以 Ollama 對字幕做語意切段、段落摘要與旅遊關鍵詞彙整（可分段處理長片）。"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from ollama_client import ollama_chat

logger = logging.getLogger(__name__)

_CHUNK_CHARS_DEFAULT = max(4096, int(os.getenv("OLLAMA_OUTLINE_CHUNK_CHARS", "28000")))
_MAX_CHUNKS = max(1, int(os.getenv("OLLAMA_OUTLINE_MAX_CHUNKS", "32")))
_SUMMARY_MAX_CHARS = max(1, int(os.getenv("OLLAMA_OUTLINE_SUMMARY_MAX_CHARS", "50")))


def _seg_end(seg: dict[str, Any]) -> float:
    if seg.get("end") is not None:
        return float(seg["end"])
    return float(seg["start"]) + float(seg.get("duration") or 0.0)


def _traditional_tw_convert(text: str) -> str:
    if not text:
        return text


def _limit_summary_chars(text: str, max_chars: int = _SUMMARY_MAX_CHARS) -> str:
    """限制段落摘要長度，避免模型偶發超字數。"""
    s = (text or "").strip()
    if len(s) <= max_chars:
        return s
    return s[:max_chars].rstrip()
    try:
        import zhconv

        return zhconv.convert(text, "zh-tw")
    except Exception:
        return text


def timeline_and_anchors(segments: list[dict[str, Any]]) -> tuple[str, list[float]]:
    lines: list[str] = []
    boundaries: list[float] = []
    for seg in segments:
        s = float(seg["start"])
        e = _seg_end(seg)
        txt = (seg.get("text") or "").strip()
        lines.append(f"[{s:.3f}-{e:.3f}] {txt}")
        boundaries.append(round(s, 3))
        boundaries.append(round(e, 3))

    uniq: list[float] = []
    seen: set[float] = set()
    for t in sorted(boundaries):
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    timeline = "\n".join(lines)
    return timeline, uniq


def _chunk_segments_by_chars(
    segments: list[dict[str, Any]], max_chars: int
) -> list[list[dict[str, Any]]]:
    chunks: list[list[dict[str, Any]]] = []
    buf: list[dict[str, Any]] = []
    acc = 0
    for seg in segments:
        piece = len((seg.get("text") or "")) + 1
        if buf and acc + piece > max_chars:
            chunks.append(buf)
            buf = []
            acc = 0
        buf.append(seg)
        acc += piece
    if buf:
        chunks.append(buf)
    return chunks[:_MAX_CHUNKS]


_JSON_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL | re.IGNORECASE)


def parse_llm_json(content: str) -> dict[str, Any]:
    raw = content.strip()
    m = _JSON_FENCE_RE.match(raw)
    if m:
        raw = m.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        brace = raw.find("{")
        if brace >= 0:
            return json.loads(raw[brace:])
        raise


def _snap_boundary(t: float, anchors_sorted: list[float]) -> float:
    if not anchors_sorted:
        return t
    best = anchors_sorted[0]
    best_d = abs(best - t)
    for x in anchors_sorted:
        d = abs(x - t)
        if d < best_d:
            best_d = d
            best = x
    return best


def validate_and_snap_paragraphs(
    raw: list[dict[str, Any]],
    anchors: list[float],
    chunk_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    t_lo = float(chunk_segments[0]["start"]) if chunk_segments else 0.0
    t_hi = _seg_end(chunk_segments[-1]) if chunk_segments else 0.0

    anchors_s = sorted(anchors)
    out: list[dict[str, Any]] = []
    for p in raw:
        try:
            s = float(p.get("start", 0))
            e = float(p.get("end", 0))
        except (TypeError, ValueError):
            continue
        summary = p.get("summary")
        if not isinstance(summary, str) or not summary.strip():
            continue
        s = _snap_boundary(s, anchors_s)
        e = _snap_boundary(e, anchors_s)
        if s >= e:
            continue
        s = max(s, t_lo)
        e = min(e, t_hi)
        if s >= e:
            continue
        summary_tw = _traditional_tw_convert(summary.strip())
        out.append({"start": s, "end": e, "summary": _limit_summary_chars(summary_tw)})

    out.sort(key=lambda x: x["start"])
    return out


_MERGE_MERGE_TOLERANCE = float(os.getenv("OLLAMA_OUTLINE_MERGE_TOLERANCE", "3.0"))


def merge_adjacent_paragraphs(paragraphs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not paragraphs:
        return []
    merged: list[dict[str, Any]] = [dict(paragraphs[0])]
    for cur in paragraphs[1:]:
        prev = merged[-1]
        if cur["start"] <= prev["end"] + _MERGE_MERGE_TOLERANCE:
            prev["end"] = max(prev["end"], cur["end"])
            if cur["summary"] not in prev["summary"]:
                prev["summary"] = (prev["summary"].rstrip() + "；" + cur["summary"]).strip("；")
        else:
            merged.append(dict(cur))
    return merged


_SYSTEM_PROMPT = """你是繁體中文（台灣用字）的影片字幕分析助理。你只輸出一個合法 JSON（不要程式碼區塊、不要前綴後綴說明）。

時間範圍 [start,end]（秒）必須對齊使用者在字幕時間軸中提供的邊界：每一段的 start 必須等於某一條字幕列的開始秒數；每一段的 end 必須等於某一條字幕列的結束秒數。段落需涵蓋完整語意、依主題／場景／情緒轉折區分（含整部影片上下文），且在同一批字幕內須不重疊、時間遞增。

travel_keywords（本字幕批次可見）：列出此批字幕文中出現的旅遊相關詞彙（景點、地名、區域、店家、市集、步道、特色美食或料理名稱等）；去明顯重複項，使用台灣繁體。"""


def _user_prompt_for_chunk(timeline: str, t_chunk_start: float, t_chunk_end: float) -> str:
    return f"""以下時間軸中，各方括號數字為「秒」（僅來自原始字幕）。
僅為「此片段時間範圍」內的內容產出 paragraphs：{t_chunk_start:.3f} 秒 ≤ 區間 ≤ {t_chunk_end:.3f} 秒。
若片段內可再細分主題可多段；語意強烈相關請合為一段。
每段 summary 必須使用繁體中文，且最多 {_SUMMARY_MAX_CHARS} 字（超過請自行精簡）。
travel_keywords：僅從這批字幕字面可見內提取（台灣繁體）。

輸出 JSON 格式：
{{"paragraphs":[{{"start":數字,"end":數字,"summary":"段落大意"}}],"travel_keywords":["詞",...]}}

字幕時間軸：
{timeline}
"""


async def outline_one_chunk(
    *,
    model: str,
    segments: list[dict[str, Any]],
    temperature: float | None,
    num_ctx: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    timeline, anchors = timeline_and_anchors(segments)
    t_chunk_start = float(segments[0]["start"]) if segments else 0.0
    t_chunk_end = _seg_end(segments[-1]) if segments else 0.0

    user_text = _user_prompt_for_chunk(timeline, t_chunk_start, t_chunk_end)
    options: dict[str, Any] = {}
    if temperature is not None:
        options["temperature"] = temperature
    if num_ctx is not None:
        options["num_ctx"] = num_ctx

    content = await ollama_chat(
        model=model,
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ],
        json_mode=True,
        options=options or None,
    )

    parsed = parse_llm_json(content)
    raw_paragraphs = parsed.get("paragraphs") or []
    if not isinstance(raw_paragraphs, list):
        raw_paragraphs = []

    paragraphs = validate_and_snap_paragraphs(
        raw_paragraphs if isinstance(raw_paragraphs, list) else [],
        anchors,
        segments,
    )

    keywords_raw = parsed.get("travel_keywords") or []
    kw_list: list[str] = []
    if isinstance(keywords_raw, list):
        for k in keywords_raw:
            if isinstance(k, str) and k.strip():
                kw_list.append(_traditional_tw_convert(k.strip()))

    return paragraphs, kw_list


_MERGE_MERGE_FINAL_SYSTEM = """你是繁體中文（台灣用字）助理。使用者會提供整部影片切段後的段落摘要草稿與零散旅遊關鍵詞。請：
1）合併「語意上可直接銜接、且時間緊鄰／重疊」的段落，輸出最終不重疊的 paragraphs（同一 JSON 結構）。
2）start/end 仍需為使用者提供的時間表中出現過的數字（完全一致，不可發明新時間）。
3）每段 summary 必須為繁體中文且最多 50 字（超過請改寫精簡）。
4）travel_keywords 需去重並盡可能涵蓋全片旅遊相關名詞（來自草稿與零散詞）。
只輸出 JSON。"""


async def finalize_merged_outline(
    *,
    model: str,
    coarse_paragraphs: list[dict[str, Any]],
    all_keywords: list[str],
    anchors: list[float],
    segments: list[dict[str, Any]],
    timeline_short: str,
    temperature: float | None,
    num_ctx: int | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    """分批後可選的第二階：合併段落與統整 travel_keywords。"""
    if not coarse_paragraphs:
        return [], dedupe_keywords(all_keywords)

    draft_lines = []
    for p in coarse_paragraphs:
        draft_lines.append(
            f"[{float(p['start']):.3f}-{float(p['end']):.3f}] {p.get('summary', '')}"
        )
    anchors_str = ", ".join(str(a) for a in sorted(set(anchors))[:600])
    if len(set(anchors)) > 600:
        anchors_str += " ..."

    body = (
        "【段落草稿】\n"
        + "\n".join(draft_lines)
        + "\n\n【零散關鍵詞】\n"
        + "、".join(all_keywords[:500])
        + "\n\n【允許時間邊界（節錄若過長請仍只使用這些時間值）】\n"
        + anchors_str
        + "\n\n【時間軸（若需對照語意銜接，節錄）】\n"
        + timeline_short[:32000]
    )

    options: dict[str, Any] = {}
    if temperature is not None:
        options["temperature"] = temperature
    if num_ctx is not None:
        options["num_ctx"] = num_ctx

    content = await ollama_chat(
        model=model,
        messages=[
            {"role": "system", "content": _MERGE_MERGE_FINAL_SYSTEM},
            {"role": "user", "content": body},
        ],
        json_mode=True,
        options=options or None,
    )
    parsed = parse_llm_json(content)
    raw_paragraphs = parsed.get("paragraphs") or []
    anchors_s = sorted(set(anchors))
    paragraphs = validate_and_snap_paragraphs(
        raw_paragraphs if isinstance(raw_paragraphs, list) else [],
        anchors_s,
        segments,
    )
    if not paragraphs:
        merged = merge_adjacent_paragraphs(sorted(coarse_paragraphs, key=lambda x: x["start"]))
        kw = parsed.get("travel_keywords") or []
        kws = normalize_keyword_list(kw) if kw else dedupe_keywords(all_keywords)
        return merged, kws

    kws_raw = parsed.get("travel_keywords") or []
    kws = normalize_keyword_list(kws_raw)
    if not kws:
        kws = dedupe_keywords(all_keywords)
    paragraphs = merge_adjacent_paragraphs(paragraphs)
    return paragraphs, kws


def normalize_keyword_list(kws: Any) -> list[str]:
    if not isinstance(kws, list):
        return []
    out: list[str] = []
    for k in kws:
        if isinstance(k, str) and k.strip():
            out.append(_traditional_tw_convert(k.strip()))
    return dedupe_keywords(out)


def dedupe_keywords(words: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for w in words:
        key = w.casefold().strip().lower()
        if key not in seen and w.strip():
            seen.add(key)
            out.append(w.strip())
    return out


async def run_transcript_outline(
    *,
    model: str,
    segments: list[dict[str, Any]],
    temperature: float | None = None,
    num_ctx: int | None = None,
) -> dict[str, Any]:
    """回傳 { paragraphs: [...], travel_keywords: [...], chunked: bool }。"""
    if not segments:
        return {"paragraphs": [], "travel_keywords": [], "chunked": False}

    timeline_full, anchors = timeline_and_anchors(segments)
    chars = len(timeline_full)
    max_chars = _CHUNK_CHARS_DEFAULT

    chunks = [segments]
    chunked = chars > max_chars
    if chunked:
        chunks = _chunk_segments_by_chars(segments, max_chars)
        logger.info("字幕分段處理 Ollama outline：共 %s 個 chunk（每塊至多約 %s 字元）", len(chunks), max_chars)

    all_paragraphs: list[dict[str, Any]] = []
    all_keywords: list[str] = []

    for ch in chunks:
        paras, kws = await outline_one_chunk(
            model=model,
            segments=ch,
            temperature=temperature,
            num_ctx=num_ctx,
        )
        all_paragraphs.extend(paras)
        all_keywords.extend(kws)

    all_paragraphs.sort(key=lambda x: x["start"])
    all_paragraphs = merge_adjacent_paragraphs(all_paragraphs)
    merged_keywords = dedupe_keywords(all_keywords)

    if chunked and len(all_paragraphs) > 1:
        timeline_short = timeline_full if len(timeline_full) <= 40000 else timeline_full[:40000]
        try:
            merged_p, merged_k = await finalize_merged_outline(
                model=model,
                coarse_paragraphs=all_paragraphs,
                all_keywords=merged_keywords,
                anchors=anchors,
                segments=segments,
                timeline_short=timeline_short,
                temperature=temperature,
                num_ctx=num_ctx,
            )
            if merged_p:
                all_paragraphs = merged_p
            merged_keywords = merged_k if merged_k else merged_keywords
        except Exception:
            logger.exception("finalize_merged_outline 失敗，回傳分段合併結果")

    return {
        "paragraphs": all_paragraphs,
        "travel_keywords": merged_keywords,
        "chunked": chunked,
    }
