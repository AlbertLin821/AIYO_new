/** Shared destination/day sniffing for client stores and server trip profile (no "use client"). */

import { matchDestinationInPlanningText } from "@/lib/planningDestinationMatcher";

export type PlanningSignalUpdate = {
  destination?: string;
  days?: number;
};

export function extractDestinationFromPlanningText(text: string): string | undefined {
  return matchDestinationInPlanningText(text);
}

/** Parse 「三天」「五日」等（不含預算「元」、序數「第一天」誤判）。 */
export function extractDayCountFromPlanningText(normalized: string): number | undefined {
  const arabicMatch =
    normalized.match(/(?<![第\d])(\d{1,2})\s*(?:天|日)(?!幣)/) ||
    normalized.match(/(?:for|stay|trip)\s+(\d{1,2})\s+days?/i);
  if (arabicMatch?.[1]) {
    return Math.max(1, Math.min(Number(arabicMatch[1]), 30));
  }

  const chineseMatch = normalized.match(/(?<![第\d])([一二三四五六七八九十兩廿卅]{1,3})\s*天/);
  if (!chineseMatch?.[1]) {
    return undefined;
  }

  const parsed = parseChineseCardinalDays(chineseMatch[1]);
  return parsed !== undefined ? Math.max(1, Math.min(parsed, 30)) : undefined;
}

function parseChineseCardinalDays(fragment: string): number | undefined {
  const trimmed = fragment.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.max(1, Math.min(n, 30)) : undefined;
  }

  const digit: Record<string, number> = {
    "〇": 0,
    "零": 0,
    "一": 1,
    "二": 2,
    "兩": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };

  if (trimmed === "十") {
    return 10;
  }
  if (trimmed === "廿") {
    return 20;
  }
  if (trimmed === "卅") {
    return 30;
  }
  if (trimmed === "二十") {
    return 20;
  }
  if (trimmed === "三十") {
    return 30;
  }

  if (trimmed.length === 1) {
    const v = digit[trimmed];
    if (v !== undefined && v >= 1) {
      return v;
    }
  }

  if (trimmed.startsWith("十") && trimmed.length === 2) {
    const u = digit[trimmed[1]];
    if (u !== undefined) {
      return Math.min(10 + u, 30);
    }
  }
  if (trimmed.startsWith("廿") && trimmed.length === 2) {
    const u = digit[trimmed[1]];
    if (u !== undefined) {
      return Math.min(20 + u, 30);
    }
  }
  if (trimmed.startsWith("二十") && trimmed.length === 3) {
    const u = digit[trimmed[2]];
    if (u !== undefined) {
      return Math.min(20 + u, 30);
    }
  }
  if (trimmed.startsWith("三十") && trimmed.length === 3) {
    const u = digit[trimmed[2]];
    if (u !== undefined) {
      return Math.min(30 + u, 30);
    }
  }

  const tenIndex = trimmed.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digit[trimmed[tenIndex - 1] || ""] || 0;
    const ones = digit[trimmed[tenIndex + 1] || ""] || 0;
    const result = tens * 10 + ones;
    return result > 0 ? result : undefined;
  }
  return digit[trimmed];
}

export function inferPlanningUpdateFromTexts(texts: string[]): PlanningSignalUpdate {
  const combined = texts.filter(Boolean).join("\n");
  if (!combined.trim()) {
    return {};
  }

  const update: PlanningSignalUpdate = {};
  const destination = extractDestinationFromPlanningText(combined);
  if (destination) {
    update.destination = destination;
  }

  for (const chunk of texts) {
    const days = chunk ? extractDayCountFromPlanningText(chunk.trim()) : undefined;
    if (days !== undefined) {
      update.days = days;
      break;
    }
  }

  return update;
}
