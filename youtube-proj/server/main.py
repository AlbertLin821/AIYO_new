"""
YouTube Info API Backend
Uses yt-dlp for metadata, youtube-transcript-api for subtitles,
and faster-whisper (model configurable via WHISPER_MODEL) for AI transcription fallback.
"""

import re
import os
import json
import time
import asyncio
import logging
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager


_cuda_dll_paths_registered = False


def _register_windows_cuda_dll_paths() -> None:
    """Windows：pip 安裝的 CUDA 元件在 site-packages。CTranslate2（faster-whisper）需要 cuBLAS 12（cublas64_12.dll）。

    僅 os.add_dll_directory 在 uvicorn --reload 子行程／載入順序下仍可能找不到 DLL，
    因此一併將各 nvidia/*/bin 前置到 PATH，並預載入 cublas64_12.dll。
    """
    global _cuda_dll_paths_registered
    if os.name != "nt" or _cuda_dll_paths_registered:
        return
    import importlib.util
    import site
    import sys
    from pathlib import Path

    log = logging.getLogger(__name__)
    bin_dirs: list[Path] = []

    def _append_spec_bins(mod: str) -> None:
        try:
            spec = importlib.util.find_spec(mod)
            if not spec or not spec.submodule_search_locations:
                return
            for loc in spec.submodule_search_locations:
                candidate = Path(loc) / "bin"
                if candidate.is_dir():
                    bin_dirs.append(candidate.resolve())
        except Exception:
            pass

    for mod in (
        "nvidia.cublas",
        "nvidia.cuda_nvrtc",
        "nvidia.cudnn",
        "nvidia.cufft",
        "nvidia.curand",
        "nvidia.cusolver",
        "nvidia.cusparse",
    ):
        _append_spec_bins(mod)

    roots: list[Path] = []
    try:
        roots.extend(Path(p).resolve() for p in site.getsitepackages())
    except Exception:
        pass
    try:
        us = site.getusersitepackages()
        if us:
            roots.append(Path(us).resolve())
    except Exception:
        pass
    sp = (Path(sys.prefix) / "Lib" / "site-packages").resolve()
    if sp.is_dir():
        roots.append(sp)

    seen_roots: set[Path] = set()
    for root in roots:
        if root in seen_roots or not root.is_dir():
            continue
        seen_roots.add(root)
        try:
            for candidate in root.glob("nvidia/*/bin"):
                if candidate.is_dir():
                    bin_dirs.append(candidate.resolve())
        except OSError:
            pass
        ct_pkg = root / "ctranslate2"
        if (ct_pkg / "ctranslate2.dll").is_file():
            bin_dirs.append(ct_pkg.resolve())

    ordered_unique: list[str] = []
    seen_dir: set[str] = set()
    for b in bin_dirs:
        d = str(b)
        if d not in seen_dir:
            seen_dir.add(d)
            ordered_unique.append(d)
            try:
                os.add_dll_directory(d)
            except OSError as e:
                log.warning("add_dll_directory 失敗（%s）：%s", d, e)

    if ordered_unique:
        os.environ["PATH"] = os.pathsep.join(ordered_unique) + os.pathsep + os.environ.get(
            "PATH", ""
        )

    try:
        import ctypes

        cublas = sp / "nvidia" / "cublas" / "bin" / "cublas64_12.dll"
        if cublas.is_file():
            ctypes.WinDLL(str(cublas))
    except OSError as e:
        log.warning(
            "無法預載入 cublas64_12.dll（GPU 轉錄可能失敗）；請確認已 pip 安裝 nvidia-cublas-cu12：%s",
            e,
        )

    _cuda_dll_paths_registered = True


_register_windows_cuda_dll_paths()

import torch
from faster_whisper import WhisperModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

import httpx

from ollama_client import ollama_base_url, ollama_list_models
from transcript_outline import run_transcript_outline
from youtube_transcript_api import YouTubeTranscriptApi
import yt_dlp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 並行：擷取詮釋資料／字幕；GPU 轉錄同時最多 N 個（避免 VRAM 耗盡）
_MAX_GPU_TRANSCRIBES = max(1, int(os.getenv("MAX_GPU_TRANSCRIBES", "2")))
_BATCH_POOL_WORKERS = max(
    4,
    min(
        32,
        int(os.getenv("BATCH_POOL_WORKERS", str(min(16, (os.cpu_count() or 4) * 2)))),
    ),
)
_WHISPER_BEAM_SIZE = max(1, int(os.getenv("WHISPER_BEAM_SIZE", "1")))
_gpu_transcribe_sem = threading.BoundedSemaphore(_MAX_GPU_TRANSCRIBES)
_batch_executor = ThreadPoolExecutor(max_workers=_BATCH_POOL_WORKERS, thread_name_prefix="yt_batch")
_whisper_model_lock = threading.Lock()


@asynccontextmanager
async def _app_lifespan(_app: FastAPI):
    yield
    _batch_executor.shutdown(wait=True, cancel_futures=False)


app = FastAPI(title="YouTube Info API", lifespan=_app_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Global state ─────────────────────────────────────────────

class TranscriptionState:
    progress: float = 0.0
    status: str = "idle"
    current_task: str = ""

trans_state = TranscriptionState()


def _resolve_whisper_model_name() -> str:
    """GPU 預設 turbo（速度快，適合高階顯卡）；CPU 預設 small。環境變數 WHISPER_MODEL 可覆寫。"""
    override = os.getenv("WHISPER_MODEL", "").strip()
    if override:
        return override
    return "turbo" if torch.cuda.is_available() else "small"


# Lazy-load model to save memory until first use
_whisper_model = None
_WHISPER_MODEL_NAME = _resolve_whisper_model_name()
logger.info(
    "Whisper 模型：%s（環境變數 WHISPER_MODEL 可指定，例如 small、medium、distil-large-v2、turbo）",
    _WHISPER_MODEL_NAME,
)

def get_whisper_model() -> WhisperModel:
    """單例延遲載入；必須加鎖，否則批次並行時兩條執行緒會各建一份模型，易 OOM 致行程崩潰、前端 502。"""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _whisper_model_lock:
        if _whisper_model is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "int8" if device == "cpu" else "float16"
            logger.info(f"Loading Whisper '{_WHISPER_MODEL_NAME}' on {device} ({compute_type})")
            _whisper_model = WhisperModel(
                _WHISPER_MODEL_NAME,
                device=device,
                compute_type=compute_type,
                download_root=os.path.join(os.getenv("TEMP", tempfile.gettempdir()), "whisper-models"),
            )
    return _whisper_model


# ── Request models ───────────────────────────────────────────

class YouTubeRequest(BaseModel):
    url: str
    language: str = "zh-TW"


class YouTubeBatchRequest(BaseModel):
    urls: list[str]
    language: str = "zh-TW"


class WhisperRequest(BaseModel):
    url: str
    language: str = "zh-TW"
    word_timestamps: bool = False


class TranscriptOutlineRequest(BaseModel):
    model: str
    segments: list[dict]
    temperature: float | None = None
    num_ctx: int | None = None


# ── Helpers ──────────────────────────────────────────────────

def extract_video_id(url: str) -> str:
    """Extract video ID from various YouTube URL formats."""
    patterns = [
        r"(?:v=|/v/|youtu\.be/|embed/|shorts/|live/)([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError("無法從網址中提取影片 ID")


def format_timestamp(seconds: float) -> str:
    """Format seconds to SRT timestamp HH:MM:SS,mmm."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_duration(seconds: int) -> str:
    """Convert seconds to HH:MM:SS format."""
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def segments_to_srt(segments: list[dict], word_timestamps: bool = False) -> str:
    """Convert segment list to SRT format."""
    lines: list[str] = []
    for idx, seg in enumerate(segments, 1):
        start_ts = format_timestamp(seg["start"])
        end_ts = format_timestamp(seg["start"] + seg["duration"])
        lines.append(f"{idx}\n{start_ts} --> {end_ts}\n{seg['text']}\n")
    return "\n".join(lines)


def traditional_tw_convert(text: str) -> str:
    """將字串規範為台灣繁體中文（簡繁、常用異體詞；拉丁字元大致保留）。"""
    if not text:
        return text
    try:
        import zhconv

        return zhconv.convert(text, "zh-tw")
    except Exception:
        return text


def _transcript_full_text_separator(transcript_blob: dict) -> str:
    if transcript_blob.get("word_timestamps"):
        return " "
    tu = transcript_blob.get("transcript_used") or ""
    if "AI Generated" in tu or "Faster-Whisper" in tu or "Whisper" in tu:
        return " "
    return "\n"


def transcript_to_traditional_tw(transcript_blob: dict) -> dict:
    """所有對外字幕內容統一為繁體（台灣用字）。"""
    if not isinstance(transcript_blob, dict):
        return transcript_blob

    ft_raw = transcript_blob.get("full_text")
    content = transcript_blob.get("transcript_content")

    if not transcript_blob.get("subtitles_available"):
        if isinstance(ft_raw, str) and ft_raw.strip():
            return {**transcript_blob, "full_text": traditional_tw_convert(ft_raw)}
        return transcript_blob

    if not content:
        ft = ft_raw if isinstance(ft_raw, str) else ""
        return {**transcript_blob, "full_text": traditional_tw_convert(ft)}

    new_content: list[dict] = []
    for seg in content:
        d = dict(seg)
        txt = d.get("text")
        if isinstance(txt, str) and txt:
            d["text"] = traditional_tw_convert(txt)
        new_content.append(d)
    sep = _transcript_full_text_separator({**transcript_blob, "transcript_content": new_content})
    texts = [(s.get("text") or "") for s in new_content]
    rebuilt = sep.join(texts)
    return {
        **transcript_blob,
        "transcript_content": new_content,
        "full_text": traditional_tw_convert(rebuilt),
    }


def segments_to_vtt(segments: list[dict]) -> str:
    """Convert segment list to WebVTT format."""
    def vtt_timestamp(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"

    lines = ["WEBVTT\n"]
    for seg in segments:
        start_ts = vtt_timestamp(seg["start"])
        end_ts = vtt_timestamp(seg["start"] + seg["duration"])
        lines.append(f"{start_ts} --> {end_ts}\n{seg['text']}\n")
    return "\n".join(lines)


# ── Metadata ─────────────────────────────────────────────────

def fetch_metadata(video_id: str) -> dict:
    """Fetch video metadata using yt-dlp."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "no_color": True,
        "extract_flat": False,
        "socket_timeout": 25,
        "retries": 2,
        "fragment_retries": 2,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    duration_seconds = info.get("duration", 0) or 0

    return {
        "title": info.get("title", "N/A"),
        "description": info.get("description", "N/A"),
        "channel": info.get("uploader", "N/A"),
        "channel_id": info.get("uploader_id", "N/A"),
        "channel_url": info.get("uploader_url", "N/A"),
        "publish_date": info.get("upload_date", "N/A"),
        "tags": info.get("tags", []) or [],
        "category_id": info.get("categories", ["N/A"]),
        "thumbnail_url": info.get("thumbnail", "N/A"),
        "duration_seconds": duration_seconds,
        "duration_formatted": format_duration(duration_seconds),
        "view_count": info.get("view_count", 0) or 0,
        "like_count": info.get("like_count", 0) or 0,
    }


# ── Native transcript ────────────────────────────────────────

def fetch_transcript(video_id: str, language: str = "auto") -> dict:
    """
    以 youtube-transcript-api 取得官方字幕。
    優先順序：使用者指定語言 > zh-TW > zh-Hant > zh-HK > zh > en > 其他可用軌。
    成功擷取後，內容一律再經 transcript_to_traditional_tw 轉為台灣繁體。
    """
    preferred_langs = ["zh-TW", "zh-Hant", "zh-HK", "zh", "en"]
    if language and language != "auto":
        preferred_langs = [language] + preferred_langs

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_list = ytt_api.list(video_id)

        # Collect available transcript info
        available = []
        for t in transcript_list:
            available.append({
                "language": t.language,
                "language_code": t.language_code,
                "is_generated": t.is_generated,
                "is_translatable": t.is_translatable,
            })

        searched_transcripts = transcript_list._search_transcripts  # type: ignore
        if not searched_transcripts and not transcript_list._generated_transcripts:  # type: ignore
            raise Exception("No transcripts found")

        # Try to find preferred language transcript
        fetched = None
        used_language = None

        # First try manually created transcripts
        for lang in preferred_langs:
            try:
                transcript = transcript_list.find_manually_created_transcript([lang])
                fetched = transcript.fetch()
                used_language = f"{transcript.language} ({transcript.language_code}) [手動建立]"
                break
            except Exception:
                continue

        # Then try generated transcripts
        if fetched is None:
            for lang in preferred_langs:
                try:
                    transcript = transcript_list.find_generated_transcript([lang])
                    fetched = transcript.fetch()
                    used_language = f"{transcript.language} ({transcript.language_code}) [自動產生]"
                    break
                except Exception:
                    continue

        # Try translation to preferred language
        if fetched is None and preferred_langs:
            for t in transcript_list:
                if t.is_translatable:
                    try:
                        translated = t.translate(preferred_langs[0])
                        fetched = translated.fetch()
                        used_language = f"翻譯自 {t.language} → {preferred_langs[0]} [自動翻譯]"
                        break
                    except Exception:
                        continue

        # Fallback: any available transcript
        if fetched is None:
            for t in transcript_list:
                try:
                    fetched = t.fetch()
                    used_language = f"{t.language} ({t.language_code})"
                    break
                except Exception:
                    continue

        if fetched is None:
            return {
                "subtitles_available": True,
                "available_languages": available,
                "transcript_used": None,
                "transcript_content": [],
                "full_text": "",
                "error": "找到字幕列表但無法擷取任何字幕內容",
            }

        # Build transcript content with end timestamps
        snippets = []
        full_text_parts = []
        for item in fetched:
            snippet = {
                "start": round(item.start, 3),
                "end": round(item.start + item.duration, 3),
                "duration": round(item.duration, 3),
                "text": item.text,
            }
            snippets.append(snippet)
            full_text_parts.append(item.text)

        blob = {
            "subtitles_available": True,
            "available_languages": available,
            "transcript_used": used_language,
            "transcript_content": snippets,
            "full_text": "\n".join(full_text_parts),
            "word_timestamps": False,
        }
        return transcript_to_traditional_tw(blob)

    except Exception as e:
        error_msg = str(e)
        if "disabled" in error_msg.lower() or "no transcripts" in error_msg.lower():
            return {
                "subtitles_available": False,
                "available_languages": [],
                "transcript_used": None,
                "transcript_content": [],
                "full_text": "",
                "error": "此影片沒有可用的字幕",
            }
        return {
            "subtitles_available": False,
            "available_languages": [],
            "transcript_used": None,
            "transcript_content": [],
            "full_text": "",
            "error": f"字幕擷取錯誤: {error_msg}",
        }


# ── AI transcription ─────────────────────────────────────────

def transcribe_video(
    video_id: str,
    language: str = "auto",
    word_timestamps: bool = False,
) -> dict:
    """
    Download audio and transcribe using Faster-Whisper (see WHISPER_MODEL / _WHISPER_MODEL_NAME).
    Reports progress via global state. GPU 同時執行數由 MAX_GPU_TRANSCRIBES 限制。
    """
    _gpu_transcribe_sem.acquire()
    try:
        return _transcribe_video_impl(video_id, language, word_timestamps)
    finally:
        _gpu_transcribe_sem.release()


def _transcribe_video_impl(
    video_id: str,
    language: str = "auto",
    word_timestamps: bool = False,
) -> dict:
    url = f"https://www.youtube.com/watch?v={video_id}"

    trans_state.progress = 0.0
    trans_state.status = "downloading"
    trans_state.current_task = f"下載影片音軌 ({video_id})"

    whisper_lang = None
    if language and language != "auto":
        whisper_lang = language[:2]  # Take language code prefix

    with tempfile.TemporaryDirectory() as tmpdir:
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": os.path.join(tmpdir, "audio.%(ext)s"),
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "quiet": True,
            "no_warnings": True,
            "socket_timeout": 30,
            "retries": 2,
            "fragment_retries": 2,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                files = os.listdir(tmpdir)
                mp3_file = next((f for f in files if f.endswith(".mp3")), None)
                if not mp3_file:
                    raise Exception("音訊下載失敗，請確認已安裝 FFmpeg")
                audio_path = os.path.join(tmpdir, mp3_file)

            trans_state.progress = 0.2
            trans_state.status = "loading_model"
            trans_state.current_task = "載入 Whisper 模型中..."

            model = get_whisper_model()

            trans_state.progress = 0.35
            trans_state.status = "transcribing"
            trans_state.current_task = "AI 轉錄中..."

            segments_iter, info = model.transcribe(
                audio_path,
                beam_size=_WHISPER_BEAM_SIZE,
                language=whisper_lang,
                word_timestamps=word_timestamps,
                vad_filter=True,
                vad_parameters={"min_silence_duration_ms": 500},
                initial_prompt=(
                    "以下為影片語音內容，請以台灣慣用之繁體中文與標點書寫逐字稿。"
                ),
            )

            collected: list = []
            full_text_parts: list[str] = []

            for segment in segments_iter:
                trans_state.progress = 0.35 + 0.55 * (segment.end / max(segment.end, 1))

                if word_timestamps and hasattr(segment, "words") and segment.words:
                    for word in segment.words:
                        word_snippet = {
                            "start": round(word.start, 3),
                            "end": round(word.end, 3),
                            "duration": round(word.end - word.start, 3),
                            "text": word.word,
                            "probability": round(word.probability, 3) if hasattr(word, "probability") else None,
                        }
                        collected.append(word_snippet)
                        full_text_parts.append(word.word)
                else:
                    snippet = {
                        "start": round(segment.start, 3),
                        "end": round(segment.end, 3),
                        "duration": round(segment.end - segment.start, 3),
                        "text": segment.text.strip(),
                    }
                    collected.append(snippet)
                    full_text_parts.append(segment.text.strip())

            trans_state.progress = 1.0
            trans_state.status = "complete"

            detected_lang = getattr(info, "language", "unknown") or "unknown"

            blob = {
                "subtitles_available": True,
                "available_languages": [{
                    "language": f"AI Generated (Whisper {_WHISPER_MODEL_NAME})",
                    "language_code": detected_lang,
                    "is_generated": True,
                    "is_translatable": False,
                }],
                "transcript_used": f"AI Generated (Faster-Whisper {_WHISPER_MODEL_NAME}) — Detected: {detected_lang}",
                "transcript_content": collected,
                "full_text": " ".join(full_text_parts),
                "word_timestamps": word_timestamps,
            }
            return transcript_to_traditional_tw(blob)

        except Exception as e:
            trans_state.progress = 0.0
            trans_state.status = "error"
            logger.exception(f"Transcription failed for {video_id}")
            return {
                "subtitles_available": False,
                "available_languages": [],
                "transcript_used": None,
                "transcript_content": [],
                "full_text": "",
                "error": f"AI 字幕產生失敗: {str(e)}",
            }


_MAX_BATCH_URLS = max(1, min(100, int(os.getenv("MAX_BATCH_URLS", "40"))))


def process_youtube_url_safe(raw_url: str, language: str) -> dict:
    """單一網址完整流程（含無字幕時 AI 轉錄）。回傳 dict 含 success；失敗時 error。"""
    url = (raw_url or "").strip()
    if not url:
        return {"success": False, "input": raw_url or "", "error": "空白網址"}
    try:
        video_id = extract_video_id(url)
    except ValueError as e:
        return {"success": False, "input": url, "error": str(e)}
    try:
        metadata = fetch_metadata(video_id)
    except Exception as e:
        logger.exception("fetch_metadata failed")
        return {"success": False, "input": url, "error": f"無法取得影片資訊: {str(e)}"}

    transcript_data = fetch_transcript(video_id, language=language)
    if not transcript_data["subtitles_available"]:
        ai_transcript = transcribe_video(video_id, language=language, word_timestamps=False)
        if ai_transcript["subtitles_available"]:
            transcript_data = ai_transcript

    return {
        "success": True,
        "video_id": video_id,
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "metadata": metadata,
        "transcript": transcript_data,
    }


# ── API endpoints ────────────────────────────────────────────

@app.post("/api/youtube-info")
async def get_youtube_info(request: YouTubeRequest):
    result = await asyncio.to_thread(process_youtube_url_safe, request.url, request.language)
    if not result["success"]:
        err = result.get("error", "")
        status = 400 if ("無法從網址" in err or "空白" in err) else 500
        raise HTTPException(status_code=status, detail=err)
    return {
        "video_id": result["video_id"],
        "url": result["url"],
        "metadata": result["metadata"],
        "transcript": result["transcript"],
    }


@app.post("/api/youtube-info/batch")
async def get_youtube_info_batch(request: YouTubeBatchRequest):
    urls = [u.strip() for u in request.urls if u and str(u).strip()]
    if not urls:
        raise HTTPException(status_code=400, detail="至少需要一個有效網址")
    if len(urls) > _MAX_BATCH_URLS:
        raise HTTPException(
            status_code=400,
            detail=f"一次最多 {_MAX_BATCH_URLS} 個網址",
        )

    loop = asyncio.get_event_loop()
    tasks = [
        loop.run_in_executor(
            _batch_executor,
            process_youtube_url_safe,
            u,
            request.language,
        )
        for u in urls
    ]
    results = await asyncio.gather(*tasks)
    return {"results": results}


@app.post("/api/transcribe")
async def get_ai_transcription(request: WhisperRequest):
    try:
        video_id = extract_video_id(request.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    transcript_data = await asyncio.to_thread(
        transcribe_video,
        video_id,
        request.language,
        request.word_timestamps,
    )

    return {
        "video_id": video_id,
        "transcript": transcript_data,
    }


@app.get("/api/transcript/srt")
async def export_srt(
    video_id: str = Query(..., description="YouTube video ID"),
    use_ai: bool = Query(False, description="Use AI transcription if native unavailable"),
    language: str = Query("zh-TW", description="字幕軌優先順序語言"),
    word_timestamps: bool = Query(False, description="Use word-level timestamps"),
):
    """Export transcript as SRT file."""
    transcript_data = await asyncio.to_thread(fetch_transcript, video_id, language)

    if not transcript_data["subtitles_available"] and use_ai:
        transcript_data = await asyncio.to_thread(
            transcribe_video,
            video_id,
            language,
            word_timestamps,
        )

    if not transcript_data["transcript_content"]:
        raise HTTPException(status_code=404, detail="無可用字幕內容")

    srt_content = segments_to_srt(transcript_data["transcript_content"], word_timestamps)
    body = srt_content.encode("utf-8")
    return Response(
        content=body,
        media_type="application/x-subrip; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{video_id}.srt"'},
    )


@app.get("/api/transcript/vtt")
async def export_vtt(
    video_id: str = Query(..., description="YouTube video ID"),
    use_ai: bool = Query(False, description="Use AI transcription if native unavailable"),
    language: str = Query("zh-TW", description="字幕軌優先順序語言"),
):
    """Export transcript as WebVTT file."""
    transcript_data = await asyncio.to_thread(fetch_transcript, video_id, language)

    if not transcript_data["subtitles_available"] and use_ai:
        transcript_data = await asyncio.to_thread(transcribe_video, video_id, language, False)

    if not transcript_data["transcript_content"]:
        raise HTTPException(status_code=404, detail="無可用字幕內容")

    vtt_content = segments_to_vtt(transcript_data["transcript_content"])
    body = vtt_content.encode("utf-8")
    return Response(
        content=body,
        media_type="text/vtt; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{video_id}.vtt"'},
    )


@app.get("/api/transcript/json")
async def export_json(
    video_id: str = Query(..., description="YouTube video ID"),
    use_ai: bool = Query(False, description="Use AI transcription if native unavailable"),
    language: str = Query("zh-TW", description="字幕軌優先順序語言"),
):
    """Export full transcript as JSON file."""
    transcript_data = await asyncio.to_thread(fetch_transcript, video_id, language)

    if not transcript_data["subtitles_available"] and use_ai:
        transcript_data = await asyncio.to_thread(transcribe_video, video_id, language, False)

    body = transcript_data["full_text"].encode("utf-8")
    return Response(
        content=body,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{video_id}.txt"'},
    )


_ollama_models_cache: tuple[float, list[dict]] | None = None
_OLLAMA_MODELS_CACHE_TTL_SEC = max(0.0, float(os.getenv("OLLAMA_MODELS_CACHE_TTL_SEC", "45")))


@app.get("/api/ollama/models")
async def get_ollama_models():
    """列出本機 Ollama 已安裝模型（來自 GET /api/tags）。

    無法連線時仍回 200（ollama_reachable=false），避免前端／瀏覽器主控台將「未啟動 Ollama」當成代理錯誤。
    """
    global _ollama_models_cache
    now = time.monotonic()
    if (
        _ollama_models_cache is not None
        and _OLLAMA_MODELS_CACHE_TTL_SEC > 0
        and (now - _ollama_models_cache[0]) < _OLLAMA_MODELS_CACHE_TTL_SEC
    ):
        models = _ollama_models_cache[1]
    else:
        try:
            models = await ollama_list_models()
        except httpx.TimeoutException:
            return {
                "models": [],
                "ollama_reachable": False,
                "detail": "連線至 Ollama 逾時，請確認 OLLAMA_HOST 設定與服務狀態",
            }
        except httpx.ConnectError as e:
            base = ollama_base_url()
            logger.warning(
                "後端對 Ollama 連線失敗（已嘗試 %s；請與 uvicorn **同一終端機** 執行 curl %s/api/tags 比對）：%s",
                base,
                base,
                e,
            )
            return {
                "models": [],
                "ollama_reachable": False,
                "detail": (
                    f"無法連線至 Ollama（後端請求 URL：{base}）。"
                    "通常為該終端機下仍連不到監聽位址（請在同視窗確認 curl 可連）、"
                    "或環境變數 **OLLAMA_HOST** 設錯。"
                ),
            }
        except httpx.HTTPError as e:
            logger.warning("GET Ollama /api/tags 失敗：%s", e)
            return {
                "models": [],
                "ollama_reachable": False,
                "detail": f"讀取 Ollama 模型清單失敗: {str(e)}",
            }
        _ollama_models_cache = (now, models)

    simplified = []
    for m in models:
        if isinstance(m, dict) and isinstance(m.get("name"), str):
            simplified.append({
                "name": m["name"],
                "size": m.get("size"),
                "modified_at": m.get("modified_at"),
            })

    return {"models": simplified, "ollama_reachable": True}


@app.post("/api/ollama/transcript/outline")
async def post_transcript_outline(request: TranscriptOutlineRequest):
    """請 Ollama 依語意分段字幕並產生段落大意與全片旅遊相關關鍵詞。"""
    name = (request.model or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="請選擇或輸入 Ollama 模型名稱")
    segs = request.segments or []
    if not segs:
        raise HTTPException(status_code=400, detail="至少需要一段 subtitles segments")

    try:
        result = await run_transcript_outline(
            model=name,
            segments=segs,
            temperature=request.temperature,
            num_ctx=request.num_ctx,
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Ollama 回應逾時，可嘗試較短片長、換較輕模型，或調高逾時環境設定",
        )
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail="無法連線至 Ollama，請確認服務正在執行",
        )
    except httpx.HTTPError as e:
        logger.warning("Ollama chat 失敗：%s", e)
        raise HTTPException(status_code=502, detail=f"Ollama 請求失敗: {str(e)}")
    except json.JSONDecodeError as e:
        logger.warning("Ollama 回傳非合法 JSON：%s", e)
        raise HTTPException(
            status_code=422,
            detail="模型回傳無法解析為 JSON，請改試其他較強模型或調整 prompting",
        )
    except Exception as e:
        logger.exception("Ollama 段落概要處理未預期錯誤")
        raise HTTPException(status_code=500, detail=str(e))

    return result


@app.get("/api/transcribe/progress")
async def get_transcribe_progress():
    """Get current transcription progress."""
    return {
        "progress": trans_state.progress,
        "status": trans_state.status,
        "current_task": trans_state.current_task,
    }


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "whisper_model": _WHISPER_MODEL_NAME,
        "whisper_beam_size": _WHISPER_BEAM_SIZE,
        "cuda_available": torch.cuda.is_available(),
        "max_gpu_transcribes": _MAX_GPU_TRANSCRIBES,
        "batch_pool_workers": _BATCH_POOL_WORKERS,
        "max_batch_urls": _MAX_BATCH_URLS,
    }
