/**
 * 同一 POI 重複指稱的處理（適用所有影片，不靠逐支影片特例）：
 *
 * 1) **封閉詞表（primary）**：結構化 `locationHints`（＋ segment title 於 polish 階段）列出「要當作實體」的地名；
 *    `surfaceFormsForPlaceDedupe` / `poiSynonymGroupsForPrompt` 對同一 canonical key 給出同義字面，供 prompt 與後處理一致。
 * 2) **生成約束**：拋光／摘要 prompt 要求「每個 synonym group 在 summary+title+text 最多出現一種字面」。
 * 3) **安全網（fallback）**：若模型仍堆砌同義詞，`dedupeRepeatedPlaceNamesInText` 等規則化修剪。
 *
 * 正文開放擷取（extractLikelyPlacePhrasesFromChinese）僅作 hints 漏列時的補洞，不是主要策略。
 */

export function canonicalPlaceSurfaceKey(name: string): string {
  let s = name.replace(/\s+/g, "").replace(/臺/g, "台").toLowerCase();
  s = s.replace(/^jr/, "");
  s = s.replace(/車站$/u, "站").replace(/駅$/u, "站");
  return s;
}

/** 用於在正文搜尋的別名（長度較長者優先匹配）。車站類含 JR／駅／站／車站 常見寫法。 */
export function surfaceFormsForPlaceDedupe(name: string): string[] {
  const trimmed = name.trim();
  const forms = new Set<string>();
  if (trimmed.length >= 2) {
    forms.add(trimmed);
  }
  if (/車站$/u.test(trimmed)) {
    forms.add(trimmed.replace(/車站$/u, "站"));
  }
  if (/駅$/u.test(trimmed)) {
    forms.add(trimmed.replace(/駅$/u, "站"));
    forms.add(trimmed.replace(/駅$/u, "車站"));
  }
  if (/站$/u.test(trimmed) && !/車站$/u.test(trimmed)) {
    forms.add(trimmed.replace(/站$/u, "車站"));
  }

  const stem = trimmed.replace(/^JR\s*/i, "");
  const stationLike =
    /車站$/u.test(stem) || /駅$/u.test(stem) || (/站$/u.test(stem) && !/車站$/u.test(stem));
  if (stationLike) {
    const core = stem.replace(/(車站|駅|站)$/u, "");
    if (core.length >= 1 && core.length <= 14) {
      const snapshot = Array.from(forms);
      for (const s of snapshot) {
        if (s.length >= 2 && !/^JR\s*/i.test(s)) {
          forms.add(`JR${s}`);
        }
      }
      forms.add(`JR${core}站`);
      forms.add(`JR${core}車站`);
      forms.add(`${core}JR站`);
    }
  }

  return Array.from(forms).filter((s) => s.length >= 2 && s.length <= 48);
}

function normalizePlaceScan(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * 偵測合併後文案是否仍混用同一 POI 的多種字面（例如同段同時出現 熊本站 與 熊本車站）。
 * 採用最長優先、由左至右遮蔽匹配，避免 JR熊本車站 被誤判成兩次提及。
 */
export function hasSynonymSurfaceConflict(hints: string[], combined: string): boolean {
  const hay0 = normalizePlaceScan(combined);
  const groups = poiSynonymGroupsForPrompt(hints);
  for (const group of groups) {
    const forms = [...new Set(group)].filter((f) => f.length >= 2);
    if (forms.length < 2) {
      continue;
    }
    let hay = hay0;
    const matchedLiterals = new Set<string>();
    while (true) {
      let bestIdx = -1;
      let bestForm: string | null = null;
      let bestLen = -1;
      const sorted = [...forms].sort(
        (a, b) => normalizePlaceScan(b).length - normalizePlaceScan(a).length,
      );
      for (const f of sorted) {
        const nf = normalizePlaceScan(f);
        const idx = hay.indexOf(nf);
        if (idx >= 0 && (bestIdx < 0 || idx < bestIdx || (idx === bestIdx && nf.length > bestLen))) {
          bestIdx = idx;
          bestForm = f;
          bestLen = nf.length;
        }
      }
      if (bestForm === null || bestIdx < 0) {
        break;
      }
      matchedLiterals.add(bestForm);
      const nf = normalizePlaceScan(bestForm);
      hay = hay.slice(0, bestIdx) + "█".repeat(nf.length) + hay.slice(bestIdx + nf.length);
    }
    if (matchedLiterals.size >= 2) {
      return true;
    }
  }
  return false;
}

function uniqueHintsByCanonical(hints: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hints) {
    const key = canonicalPlaceSurfaceKey(h);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(h.trim());
  }
  return out;
}

/**
 * 供 prompt 注入：每個內層陣列為同一實體的可替換字面（站／車站／駅），順序長字優先。
 * 僅使用 `locationHints`，與後處理 dedupe 共用同一套 surface 展開。
 */
export function poiSynonymGroupsForPrompt(hints: string[]): string[][] {
  const unique = uniqueHintsByCanonical(hints.filter((h) => h?.trim()));
  return unique.map((h) =>
    [...surfaceFormsForPlaceDedupe(h)].sort((a, b) => b.length - a.length),
  );
}

/** 從中日文正文粗略擷取可能地名（補齊 locationHints 漏列的重複詞）。 */
const PLACE_CHAR_RE = /[\u3040-\u309F\u30A0-\u30FF\u3400-\u9FFF々〆]/u;

/** 向左擴張時遇到這些字即停止，避免吞進「從熊本…」「走路去…」整句。 */
const SOFT_BREAK_BEFORE_PLACE =
  /[的得地在於與及和從由對向為是以著着過進去行走跑搭乘直達往來到位距離在這該它最若倘\s，、；：・]/u;

/** 由長至短掃描後綴；較長者先匹配可避免「車」內的「站」等誤切。 */
const PLACE_SUFFIX_SCAN: Array<{ suf: string; maxLeft: number; skip?: (text: string, idx: number) => boolean }> = [
  { suf: "巴士總站", maxLeft: 18 },
  { suf: "神社", maxLeft: 16 },
  { suf: "車站", maxLeft: 14 },
  { suf: "駅", maxLeft: 14 },
  { suf: "總站", maxLeft: 14, skip: (t, i) => i >= 2 && t.slice(i - 2, i) === "巴士" },
  { suf: "公園", maxLeft: 16 },
  { suf: "高原", maxLeft: 14 },
  { suf: "城", maxLeft: 14 },
  { suf: "寺", maxLeft: 14 },
  { suf: "宮", maxLeft: 14 },
  { suf: "岳", maxLeft: 14 },
  { suf: "亭", maxLeft: 12 },
  { suf: "里", maxLeft: 12 },
  { suf: "原", maxLeft: 12 },
  {
    suf: "站",
    maxLeft: 14,
    skip: (t, i) =>
      (i >= 1 && (t[i - 1] === "車" || t[i - 1] === "车")) ||
      (i >= 2 && t.slice(i - 2, i) === "巴士"),
  },
];

/** @returns slice [left, suffixStartIdx + suffixLen) — 後綴本體固定保留，僅向左擴張前綴。 */
function slicePhraseWithSuffix(
  text: string,
  suffixStartIdx: number,
  suffixLen: number,
  maxLeft: number,
): string {
  let left = suffixStartIdx;
  let steps = 0;
  while (left > 0 && steps < maxLeft) {
    const ch = text[left - 1];
    if (SOFT_BREAK_BEFORE_PLACE.test(ch)) {
      break;
    }
    if (!PLACE_CHAR_RE.test(ch)) {
      break;
    }
    left -= 1;
    steps += 1;
  }
  return text.slice(left, suffixStartIdx + suffixLen);
}

/** 取後綴前、由右往左最多 maxCore 個中日文字，再剥掉常見的「市區／城区」前綴（熊本類句子）。 */
function clipTrailingNamedSuffix(
  phrase: string,
  suffix: string,
  minCore: number,
  maxCore: number,
): string {
  if (!phrase.endsWith(suffix)) {
    return phrase;
  }
  const before = phrase.slice(0, -suffix.length);
  const seq = [...before];
  let tail = "";
  for (let i = seq.length - 1; i >= 0 && tail.length < maxCore; i--) {
    const ch = seq[i];
    if (!PLACE_CHAR_RE.test(ch)) {
      break;
    }
    tail = ch + tail;
  }
  if (tail.length < minCore) {
    return phrase;
  }
  tail = tail.replace(/^(市區|城区)/u, "");
  if (tail.length < minCore) {
    return phrase;
  }
  return `${tail}${suffix}`;
}

/** 將「從熊本車站」裁成「熊本車站」等，並統一「市區熊本站」→「熊本站」類尾端。 */
function clipExtractedPhrase(phrase: string): string {
  const orderedSuffixes = [
    "巴士總站",
    "車站",
    "駅",
    "神社",
    "公園",
    "高原",
    "城",
    "寺",
    "宮",
    "岳",
    "總站",
    "亭",
    "里",
    "原",
    "站",
  ] as const;
  for (const suf of orderedSuffixes) {
    if (!phrase.endsWith(suf)) {
      continue;
    }
    if (suf === "巴士總站") {
      const before = phrase.slice(0, -suf.length);
      const coreMatch = before.match(/([\u3040-\u309F\u30A0-\u30FF\u3400-\u9FFF]{2,18})$/u);
      return coreMatch ? `${coreMatch[1]}${suf}` : phrase;
    }
    if (suf === "亭") {
      return clipTrailingNamedSuffix(phrase, suf, 1, 8);
    }
    if (suf === "總站" && phrase.endsWith("巴士總站")) {
      continue;
    }
    if (suf === "城" || suf === "寺" || suf === "宮" || suf === "岳" || suf === "原") {
      return clipTrailingNamedSuffix(phrase, suf, 2, 10);
    }
    if (suf === "公園" || suf === "高原" || suf === "神社") {
      return clipTrailingNamedSuffix(phrase, suf, 2, 14);
    }
    if (suf === "里") {
      return clipTrailingNamedSuffix(phrase, suf, 2, 10);
    }
    /** 車站：右側最多 4 字核心 + 剥市區，保留「熊本」「大阪」級站名 */
    if (suf === "車站" || suf === "駅" || suf === "站") {
      return clipTrailingNamedSuffix(phrase, suf, 2, 4);
    }
    return clipTrailingNamedSuffix(phrase, suf, 2, 14);
  }
  return phrase;
}

export function extractLikelyPlacePhrasesFromChinese(text: string): string[] {
  const keys = new Set<string>();
  const phrases: string[] = [];

  for (const { suf, maxLeft, skip } of PLACE_SUFFIX_SCAN) {
    let start = 0;
    while (start <= text.length) {
      const idx = text.indexOf(suf, start);
      if (idx < 0) {
        break;
      }
      if (skip?.(text, idx)) {
        start = idx + 1;
        continue;
      }
      const end = idx + suf.length;
      const after = text[end];
      if (after && PLACE_CHAR_RE.test(after)) {
        start = idx + 1;
        continue;
      }
      let phrase = slicePhraseWithSuffix(text, idx, suf.length, maxLeft).trim();
      phrase = clipExtractedPhrase(phrase);
      if (phrase.length >= 2 && phrase.length <= 36) {
        const k = canonicalPlaceSurfaceKey(phrase);
        if (!keys.has(k)) {
          keys.add(k);
          phrases.push(phrase);
        }
      }
      start = idx + 1;
    }
  }

  return phrases;
}

function mergeDedupeHintSources(
  hints: string[],
  title: string | undefined,
  body: string,
): string[] {
  const merged = [
    ...hints,
    ...(title?.trim() ? extractLikelyPlacePhrasesFromChinese(title) : []),
    ...extractLikelyPlacePhrasesFromChinese(body),
  ].map((s) => s.trim());
  return uniqueHintsByCanonical(merged);
}

function collapseAfterDedupe(s: string): string {
  return s
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, " ")
        .replace(/^[,，、・\s]+|[,，、・\s]+$/gu, "")
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join("\n")
    .trim();
}

function scanPhrasesLongestFirst(groups: { forms: string[] }[]): string[] {
  const set = new Set<string>();
  for (const g of groups) {
    for (const f of g.forms) {
      if (f.length >= 2) {
        set.add(f);
      }
    }
  }
  return Array.from(set).sort((a, b) => b.length - a.length);
}

function lineCanonicalKeys(line: string, phrasesSorted: string[]): Set<string> {
  const keys = new Set<string>();
  for (const p of phrasesSorted) {
    if (line.includes(p)) {
      keys.add(canonicalPlaceSurfaceKey(p));
    }
  }
  return keys;
}

/** 刪除「已提過該景點」的極短列（避免留下「從」「直達」等殘行）。 */
function dedupeMinimalLinesBySeenPlaces(lines: string[], phrasesSorted: string[]): string[] {
  const seenMinimalCanon = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const keys = lineCanonicalKeys(line, phrasesSorted);
    const cjkChars = line.match(/[\u4e00-\u9fff々〆\u3040-\u30ff]/g) ?? [];
    const minimal = cjkChars.length <= 12 && line.length <= 26;

    if (keys.size > 0 && minimal && [...keys].every((k) => seenMinimalCanon.has(k))) {
      continue;
    }
    if (keys.size > 0 && minimal) {
      keys.forEach((k) => seenMinimalCanon.add(k));
    }
    out.push(line);
  }
  return out;
}

function normLineCompact(s: string): string {
  return s.replace(/\s/g, "");
}

/** 較長行會移除較早放入、且為其嚴格子字串的短行；新行若已被既有長行涵蓋則略過。 */
function replaceSubstringRedundantLinesOrdered(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    const n = normLineCompact(line);
    if (!n.length) {
      continue;
    }
    for (let i = result.length - 1; i >= 0; i--) {
      const pn = normLineCompact(result[i]);
      if (pn.length < n.length && n.includes(pn)) {
        result.splice(i, 1);
      }
    }
    const containedInExisting = result.some((k) => {
      const nk = normLineCompact(k);
      return nk.length > n.length && nk.includes(n);
    });
    if (containedInExisting) {
      continue;
    }
    result.push(line);
  }
  return result;
}

/** 去掉無地名訊號的極短殘句（例如字符級刪除後僅剩「它就在」）。 */
function dropLinesWithoutPlaceSignal(lines: string[], phrasesSorted: string[]): string[] {
  return lines.filter((line) => {
    if (phrasesSorted.some((p) => line.includes(p))) {
      return true;
    }
    const cjk = (line.match(/[\u4e00-\u9fff々〆\u3040-\u30ff]/g) ?? []).length;
    return cjk >= 10;
  });
}

/** 去掉字符級去重後只剩一兩個連接字的殘行。 */
function pruneOrphanFillerLines(lines: string[]): string[] {
  return lines.filter((line) => {
    const t = line.trim();
    if (!t) {
      return false;
    }
    const cjk = (t.match(/[\u4e00-\u9fff々〆\u3040-\u30ff]/g) ?? []).length;
    if (
      cjk <= 2 &&
      /^[從由直達它可走進距離是可最棒的是再到於在和與或乃亦又\s，、]+$/u.test(t)
    ) {
      return false;
    }
    return true;
  });
}

function finalizeDedupedBody(
  working: string,
  phrasesSorted: string[],
  fallbackRaw: string,
): string {
  let lines = collapseAfterDedupe(working)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  lines = dedupeMinimalLinesBySeenPlaces(lines, phrasesSorted);
  lines = replaceSubstringRedundantLinesOrdered(lines);
  lines = dropLinesWithoutPlaceSignal(lines, phrasesSorted);
  lines = pruneOrphanFillerLines(lines);
  const collapsed = collapseAfterDedupe(lines.join("\n"));
  return collapsed.length > 0 ? collapsed : fallbackRaw;
}

export type DedupePlaceOptions = {
  /** 片段標題：其中的地名一併納入對齊與去重（不改標題本身）。 */
  title?: string;
};

/**
 * @param text 段落正文
 * @param hints 該片段的 locationHints（與從正文／標題推斷的詞合併後對齊）
 */
export function dedupeRepeatedPlaceNamesInText(
  text: string,
  hints: string[],
  options?: DedupePlaceOptions,
): string {
  const raw = text?.trim();
  if (!raw) {
    return text;
  }

  const hintList = mergeDedupeHintSources(hints, options?.title, raw);
  if (!hintList.length) {
    return text;
  }

  const groups = hintList.map((hint) => ({
    canonical: canonicalPlaceSurfaceKey(hint),
    forms: surfaceFormsForPlaceDedupe(hint).sort((a, b) => b.length - a.length),
  }));

  const phrasesSorted = scanPhrasesLongestFirst(groups);

  const seenCanonical = new Set<string>();
  let i = 0;
  const removals: Array<{ start: number; end: number }> = [];

  while (i < raw.length) {
    let best: { start: number; end: number; canonical: string } | null = null;
    for (const group of groups) {
      for (const form of group.forms) {
        if (raw.startsWith(form, i)) {
          const end = i + form.length;
          if (!best || end - i > best.end - best.start) {
            best = { start: i, end, canonical: group.canonical };
          }
        }
      }
    }
    if (best) {
      if (seenCanonical.has(best.canonical)) {
        removals.push({ start: best.start, end: best.end });
      } else {
        seenCanonical.add(best.canonical);
      }
      i = best.end;
    } else {
      i += 1;
    }
  }

  let out = raw;
  if (removals.length) {
    removals.sort((a, b) => b.start - a.start);
    for (const r of removals) {
      out = out.slice(0, r.start) + out.slice(r.end);
    }
  }

  return finalizeDedupedBody(out, phrasesSorted, raw);
}
