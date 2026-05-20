import type { PersistedTripPayload } from "@/types";

function esc(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** 產生可分享／備份的 Markdown（無外部套件）。 */
export function buildTripMarkdown(trip: PersistedTripPayload): string {
  const lines: string[] = [];
  const title = trip.title?.trim() || "行程";
  lines.push(`# ${esc(title)}`);
  lines.push("");
  if (trip.destination?.trim()) {
    lines.push(`**目的地：** ${trip.destination.trim()}`);
  }
  if (trip.days) {
    lines.push(`**天數：** ${trip.days}`);
  }
  if (trip.budget != null && trip.budget > 0) {
    lines.push(`**預算：** ${trip.budget}`);
  }
  lines.push(`**更新：** ${trip.updatedAt || ""}`);
  lines.push("");

  const sortedDays = [...trip.itinerary].sort((a, b) => a.dayNumber - b.dayNumber);
  for (const day of sortedDays) {
    lines.push(`## 第 ${day.dayNumber} 天`);
    if (day.theme?.trim()) {
      lines.push(`*${day.theme.trim()}*`);
    }
    if (day.summary?.trim()) {
      lines.push("");
      lines.push(day.summary.trim());
    }
    lines.push("");
    if (!day.items.length) {
      lines.push("*（尚無項目）*");
      lines.push("");
      continue;
    }
    lines.push("| 時間 | 項目 |      類型 | 備註 |");
    lines.push("| --- | --- | --- | --- |");
    const items = [...day.items].sort((a, b) => (a.time || "").localeCompare(b.time || "", "zh-Hant"));
    for (const item of items) {
      const notes = [item.notes, item.location?.name].filter(Boolean).join(" · ");
      lines.push(
        `| ${esc(item.time || "—")} | ${esc(item.title || "")} | ${esc(item.type || "")} | ${esc(notes || "—")} |`,
      );
    }
    lines.push("");
  }

  if (trip.pins?.length) {
    lines.push("## 地圖標記");
    for (const pin of trip.pins) {
      lines.push(`- **${pin.name}** — ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}${pin.address ? ` · ${pin.address}` : ""}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*由 AIYO 匯出*");
  return lines.join("\n");
}
