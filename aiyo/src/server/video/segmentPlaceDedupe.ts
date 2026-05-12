/**
 * 移除段落中對同一景點的重複指稱（例如「熊本站」「熊本車站」輪流出現）。
 * 保留第一次出現，後續符合 surface key 的片段刪除並整理換行／空白。
 */

export function canonicalPlaceSurfaceKey(name: string): string {
  let s = name.replace(/\s+/g, "").replace(/臺/g, "台").toLowerCase();
  s = s.replace(/車站$/u, "站").replace(/駅$/u, "站");
  return s;
}

/** 用於在正文搜尋的別名（長度較長者優先匹配）。 */
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
  return Array.from(forms).filter((s) => s.length >= 2);
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

/**
 * @param text 段落正文（title 請勿傳入：標題通常必須保留完整地名）
 * @param hints 該片段的 locationHints（已列出的景點毋需在正文反覆拼寫）
 */
export function dedupeRepeatedPlaceNamesInText(text: string, hints: string[]): string {
  const raw = text?.trim();
  if (!raw) {
    return text;
  }

  const hintList = uniqueHintsByCanonical(hints);
  if (!hintList.length) {
    return text;
  }

  const groups = hintList.map((hint) => ({
    canonical: canonicalPlaceSurfaceKey(hint),
    forms: surfaceFormsForPlaceDedupe(hint).sort((a, b) => b.length - a.length),
  }));

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

  if (!removals.length) {
    return text;
  }

  removals.sort((a, b) => b.start - a.start);
  let out = raw;
  for (const r of removals) {
    out = out.slice(0, r.start) + out.slice(r.end);
  }
  const collapsed = collapseAfterDedupe(out);
  return collapsed.length > 0 ? collapsed : raw;
}
