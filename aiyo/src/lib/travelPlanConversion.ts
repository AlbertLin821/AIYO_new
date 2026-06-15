import type { TravelPlanResponse, TripPlanDay, TripPlanItem, TripPlanResult } from "@/types";

const DEFAULT_SPOT_HOURS = [9, 11, 14, 16];
const DEFAULT_MEAL_HOURS = [12, 18];
const TEXT_ITINERARY_TIME_HOURS: Record<string, number> = {
  清晨: 7,
  早餐: 8,
  上午: 9,
  中午: 12,
  午餐: 12,
  下午: 14,
  傍晚: 17,
  晚餐: 18,
  晚上: 19,
  夜間: 20,
};

export type TravelPlanConversionOptions = {
  targetDayCount?: number;
};

function normalizeTimeValue(raw: string | undefined, fallbackHour: number): string {
  if (!raw?.trim()) {
    return `${String(Math.max(0, Math.min(23, fallbackHour))).padStart(2, "0")}:00`;
  }
  const cleaned = raw.trim().replace(".", ":");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return `${String(Math.max(0, Math.min(23, fallbackHour))).padStart(2, "0")}:00`;
  }
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2] || "0")));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return hours * 60 + minutes;
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u3400-\u9fff]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "item"
  );
}

function buildItemId(dayNumber: number, itemIndex: number, title: string): string {
  return `tp_${dayNumber}_${itemIndex + 1}_${slugifyTitle(title)}`;
}

function chineseNumberToInt(value: string): number | undefined {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  const normalized = value.replace(/[兩两]/g, "二");
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") {
    return 10;
  }
  const tenIndex = normalized.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[normalized[tenIndex - 1] || ""] || 0;
    const ones = digits[normalized[tenIndex + 1] || ""] || 0;
    const parsed = tens * 10 + ones;
    return parsed > 0 ? parsed : undefined;
  }
  return digits[normalized];
}

/** Parse travel-plan day labels such as "Day 3", "第3天", or "3". */
export function parseDayLabelToNumber(label: string | undefined, fallbackIndex: number): number {
  const trimmed = label?.trim();
  if (!trimmed) {
    return fallbackIndex + 1;
  }

  const dayWordMatch =
    trimmed.match(/(?:day|第)\s*(\d{1,2})/i) || trimmed.match(/第\s*(\d{1,2})\s*天/u);
  if (dayWordMatch?.[1]) {
    const parsed = Number(dayWordMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(30, parsed);
    }
  }

  const loneNumber = trimmed.match(/^(\d{1,2})$/);
  if (loneNumber?.[1]) {
    const parsed = Number(loneNumber[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(30, parsed);
    }
  }

  return fallbackIndex + 1;
}

function parseTextDayLabelToNumber(label: string, fallbackIndex: number): number {
  const parsed = chineseNumberToInt(label);
  return parsed && parsed > 0 ? Math.min(30, parsed) : fallbackIndex + 1;
}

function buildSpotItem(
  dayNumber: number,
  itemIndex: number,
  spot: { name: string; feature?: string },
): TripPlanItem {
  const title = spot.name.trim() || `行程點 ${itemIndex + 1}`;
  const notes = spot.feature?.trim() || undefined;
  const hour = DEFAULT_SPOT_HOURS[itemIndex % DEFAULT_SPOT_HOURS.length] ?? 9 + itemIndex * 2;
  return {
    id: buildItemId(dayNumber, itemIndex, title),
    dayNumber,
    time: normalizeTimeValue(undefined, hour),
    title,
    type: "attraction",
    notes,
    location: {
      name: title,
      lat: 0,
      lng: 0,
      description: notes || title,
      address: title,
    },
    source: "ai",
  };
}

function buildFoodItem(
  dayNumber: number,
  itemIndex: number,
  food: { name: string; description?: string },
  spotCount: number,
): TripPlanItem {
  const title = food.name.trim() || (itemIndex === 0 ? "午餐" : "晚餐");
  const notes = food.description?.trim() || undefined;
  const mealIndex = itemIndex;
  const hour = DEFAULT_MEAL_HOURS[mealIndex % DEFAULT_MEAL_HOURS.length] ?? 12 + mealIndex * 2;
  return {
    id: buildItemId(dayNumber, spotCount + itemIndex, title),
    dayNumber,
    time: normalizeTimeValue(undefined, hour),
    title,
    type: "restaurant",
    notes,
    location: {
      name: title,
      lat: 0,
      lng: 0,
      description: notes || title,
      address: title,
    },
    source: "ai",
  };
}

function applyDayTransportation(
  items: TripPlanItem[],
  transportation: Array<{ text: string }>,
): TripPlanItem[] {
  if (items.length <= 1 || transportation.length === 0) {
    return items;
  }

  const nextItems = items.map((item) => ({ ...item }));
  for (const segment of transportation) {
    const text = segment.text?.trim();
    if (!text) {
      continue;
    }
    const routeMatch = text.match(/^(.+?)\s*(?:→|->)\s*(.+?)\s*[：:]\s*(.+)$/u);
    if (routeMatch?.[2] && routeMatch[3]) {
      const toTitle = routeMatch[2].trim();
      const transport = routeMatch[3].trim().replace(/，約.+$/u, "").trim();
      const targetIndex = nextItems.findIndex((item, index) => index > 0 && item.title === toTitle);
      if (targetIndex > 0 && transport) {
        nextItems[targetIndex] = { ...nextItems[targetIndex]!, transport };
      }
      continue;
    }
  }
  return nextItems;
}

function convertTravelPlanDay(
  day: TravelPlanResponse["days"][number],
  index: number,
): TripPlanDay {
  const dayNumber = parseDayLabelToNumber(day.day, index);
  const spots = day.spots || [];
  const foods = day.food_recommendations || [];
  const unsortedItems: TripPlanItem[] = [
    ...spots.map((spot, spotIndex) => buildSpotItem(dayNumber, spotIndex, spot)),
    ...foods.map((food, foodIndex) => buildFoodItem(dayNumber, foodIndex, food, spots.length)),
  ];
  const sortedItems = [...unsortedItems].sort((left, right) => timeToMinutes(left.time) - timeToMinutes(right.time));
  const items = applyDayTransportation(
    sortedItems,
    Array.isArray(day.transportation) ? day.transportation : [],
  );

  return {
    dayNumber,
    theme: day.theme?.trim() || `第 ${dayNumber} 天`,
    summary: undefined,
    items,
  };
}

/** Pad missing day numbers up to targetDayCount with empty item lists. */
export function ensureTripPlanDayCount(
  plan: TripPlanResult,
  targetDayCount?: number,
): TripPlanResult {
  const maxExisting = plan.days.reduce((max, day) => Math.max(max, day.dayNumber), 0);
  const normalizedTarget =
    typeof targetDayCount === "number" && targetDayCount > 0
      ? Math.max(1, Math.min(30, Math.floor(targetDayCount)))
      : 0;
  const target = Math.max(maxExisting, normalizedTarget);
  if (target <= 0) {
    return plan;
  }

  const byNumber = new Map(plan.days.map((day) => [day.dayNumber, day]));
  const days: TripPlanDay[] = [];

  for (let dayNumber = 1; dayNumber <= target; dayNumber += 1) {
    const existing = byNumber.get(dayNumber);
    if (existing) {
      days.push({
        ...existing,
        dayNumber,
        items: existing.items.map((item) => ({ ...item, dayNumber })),
      });
      continue;
    }
    days.push({
      dayNumber,
      theme: `Day ${dayNumber}`,
      summary: "尚未安排內容",
      items: [],
    });
  }

  const extras = plan.days
    .filter((day) => day.dayNumber > target)
    .sort((left, right) => left.dayNumber - right.dayNumber)
    .map((day) => ({
      ...day,
      items: day.items.map((item) => ({ ...item, dayNumber: day.dayNumber })),
    }));

  return {
    ...plan,
    days: [...days, ...extras],
  };
}

/** Convert chat travel_plan card payload into editable trip store shape. */
export function travelPlanResponseToTripPlanResult(
  plan: TravelPlanResponse,
  options?: TravelPlanConversionOptions,
): TripPlanResult {
  const days = plan.days.map((day, index) => convertTravelPlanDay(day, index));
  const inferredTarget =
    options?.targetDayCount ??
    Math.max(
      days.reduce((max, day) => Math.max(max, day.dayNumber), 0),
      plan.days.length,
    );

  const result: TripPlanResult = {
    summary: plan.summary?.trim() || plan.title.trim() || "AI 行程提案",
    days,
  };

  return ensureTripPlanDayCount(result, inferredTarget);
}

export function tripPlanHasItems(plan: TripPlanResult): boolean {
  return plan.days.some((day) => day.items.length > 0);
}

type TextDaySection = {
  dayNumber: number;
  theme?: string;
  lines: string[];
};

function normalizeTextItineraryInput(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/\s+(?=(?:Day|第)\s*[\d一二兩两三四五六七八九十]+\s*(?:天)?\s*[：:])/giu, "\n")
    .replace(/\s*[-–—]\s*(?=(?:早餐|上午|午餐|中午|下午|傍晚|晚餐|晚上|夜間))/gu, "\n")
    .replace(/[；;。]\s*(?=(?:早餐|上午|午餐|中午|下午|傍晚|晚餐|晚上|夜間))/gu, "\n");
}

function cleanMarkdownInline(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTextItineraryTitle(value: string): string {
  return cleanMarkdownInline(value)
    .replace(/[（(].*?[）)]/g, "")
    .replace(/^(?:推薦|前往|安排|享用|品嚐|搭乘|入住|抵達|欣賞|體驗|漫步於?|可前往)/u, "")
    .replace(/[，,。；;：:].*$/u, "")
    .replace(/\s*(?:附近|周邊|一帶)$/u, "")
    .trim();
}

function isGenericTextItineraryTitle(title: string): boolean {
  const trimmed = cleanMarkdownInline(title);
  if (!trimmed) {
    return true;
  }
  return /^(文化|歷史|自然|娛樂|購物|市區|在地|特色|休閒)(?:公園|市場|商圈|街區|老街|景點|體驗)$/u.test(
    trimmed,
  );
}

function isTimeLabel(value: string): boolean {
  return /^(?:清晨|早上|早餐|上午|中午|午餐|下午|傍晚|晚上|晚餐|夜間|住宿|備案)$/u.test(
    cleanMarkdownInline(value),
  );
}

function inferItemType(line: string, title: string): TripPlanItem["type"] {
  if (/早餐|午餐|晚餐|料理|餐廳|美食|拉麵|燒肉|和牛|小吃|市場/u.test(line)) {
    return "restaurant";
  }
  if (/機場|接送|搭乘|計程車|前往酒店|前往飯店/u.test(line)) {
    return "transport";
  }
  if (/住宿|酒店|飯店/u.test(line) || /酒店|飯店/u.test(title)) {
    return "hotel";
  }
  if (/購物|商店街|百貨|市場/u.test(line)) {
    return "shopping";
  }
  if (/樂園|體驗|纜車|觀景|拍照/u.test(line)) {
    return "activity";
  }
  return "attraction";
}

function inferTimeLabel(line: string): string | undefined {
  const boldLabels = [...line.matchAll(/\*\*([^*]{1,16})\*\*/g)]
    .map((match) => cleanMarkdownInline(match[1] || ""))
    .filter(Boolean);
  const boldTime = boldLabels.find(isTimeLabel);
  if (boldTime) {
    return boldTime;
  }
  const prefix = line.match(/^\s*(?:[-*]|\d+\.)?\s*([^：:]{1,8})[：:]/u)?.[1];
  const cleanedPrefix = prefix ? cleanMarkdownInline(prefix) : "";
  if (cleanedPrefix && isTimeLabel(cleanedPrefix)) {
    return cleanedPrefix;
  }
  const inline = line.match(/(早餐|上午|午餐|中午|下午|傍晚|晚餐|晚上|夜間)/u)?.[1];
  return inline || undefined;
}

function inferTitleFromTextLine(line: string): string | undefined {
  const quotedTitles = [...line.matchAll(/[「『]([^「」『』]{1,40})[」』]/g)]
    .map((match) => cleanTextItineraryTitle(match[1] || ""))
    .filter((title) => title && !isTimeLabel(title) && !isGenericTextItineraryTitle(title));
  const quotedTitle = quotedTitles.find((title) => title.length >= 2);
  if (quotedTitle) {
    return quotedTitle;
  }

  const boldTitles = [...line.matchAll(/\*\*([^*]{1,40})\*\*/g)]
    .map((match) => cleanTextItineraryTitle(match[1] || ""))
    .filter((title) => title && !isTimeLabel(title) && !isGenericTextItineraryTitle(title));
  const boldTitle = boldTitles.find((title) => title.length >= 2);
  if (boldTitle) {
    return boldTitle;
  }

  const placeMatch = cleanMarkdownInline(line).match(
    /([\p{Script=Han}A-Za-z0-9\s]{2,30}?(?:機場|公園|市場|世界|大樓|城|塔|村|商店街|海遊館|道頓堀|明洞|弘大|酒店|飯店|纜車|樂園|水族館|神社|寺|宮|街|站))/u,
  );
  if (placeMatch?.[1]) {
    const candidate = cleanTextItineraryTitle(placeMatch[1]);
    return isGenericTextItineraryTitle(candidate) ? undefined : candidate;
  }

  if (/早餐/u.test(line)) {
    return "早餐";
  }
  if (/午餐|中午/u.test(line)) {
    return "午餐";
  }
  if (/晚餐/u.test(line)) {
    return "晚餐";
  }
  if (/機場|接送/u.test(line)) {
    return "機場接送";
  }
  return undefined;
}

function parseTextItinerarySections(text: string): TextDaySection[] {
  const sections: TextDaySection[] = [];
  for (const rawLine of normalizeTextItineraryInput(text).split("\n")) {
    const line = rawLine.trim();
    const header = line.match(
      /^(?:[-*]\s*)?(?:#{1,6}\s*)?(?:\*\*)?\s*(?:Day|第)\s*([\d一二兩两三四五六七八九十]{1,3})\s*(?:天)?\s*(?:[：:|｜-]\s*(.*?))?(?:\*\*)?\s*$/iu,
    );
    if (header?.[1]) {
      const dayNumber = parseTextDayLabelToNumber(header[1], sections.length);
      const rest = cleanMarkdownInline(header[2] || "");
      const explicitTheme = rest.match(/theme\s*=\s*([^|｜]+)/iu)?.[1]?.trim();
      const theme = cleanTextItineraryTitle(explicitTheme || rest.replace(/^\|/u, ""));
      sections.push({
        dayNumber,
        theme: theme || `Day ${dayNumber}`,
        lines: [line],
      });
      continue;
    }
    sections[sections.length - 1]?.lines.push(line);
  }
  return sections;
}

function textSectionToDay(section: TextDaySection): TripPlanDay {
  const items: TripPlanItem[] = [];
  const seenTitles = new Set<string>();

  for (const line of section.lines) {
    const normalizedLine = cleanMarkdownInline(line);
    const isBulletLine = /^\s*(?:[-*]|\d+\.)\s+/u.test(line);
    const isTimePrefixedLine = /^(?:早餐|上午|午餐|中午|下午|傍晚|晚餐|晚上|夜間)/u.test(normalizedLine);
    if (!isBulletLine && !isTimePrefixedLine) {
      continue;
    }
    if (/^\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:Day|第)\s*[\d一二兩两三四五六七八九十]{1,3}/iu.test(line)) {
      continue;
    }
    if (/^(?:住宿|備案|提醒|請問|是否需要)/u.test(normalizedLine.replace(/^\s*(?:[-*]|\d+\.)\s*/u, ""))) {
      continue;
    }
    const title = inferTitleFromTextLine(line);
    if (!title || seenTitles.has(title)) {
      continue;
    }
    seenTitles.add(title);
    const timeLabel = inferTimeLabel(line);
    const timeHour = timeLabel ? TEXT_ITINERARY_TIME_HOURS[timeLabel] : undefined;
    const fallbackHour =
      timeHour ??
      DEFAULT_SPOT_HOURS[items.length % DEFAULT_SPOT_HOURS.length] ??
      9 + items.length * 2;
    items.push({
      id: buildItemId(section.dayNumber, items.length, title),
      dayNumber: section.dayNumber,
      time: normalizeTimeValue(undefined, fallbackHour),
      title,
      type: inferItemType(line, title),
      notes: cleanMarkdownInline(line).replace(/^\s*(?:[-*]|\d+\.)\s*/u, ""),
      source: "ai",
      confidence: "low",
    });
    if (items.length >= 8) {
      break;
    }
  }

  return {
    dayNumber: section.dayNumber,
    theme: section.theme || `Day ${section.dayNumber}`,
    summary: undefined,
    items,
  };
}

function textSectionToDayLoose(section: TextDaySection): TripPlanDay {
  const items: TripPlanItem[] = [];
  const seenTitles = new Set<string>();

  for (const line of section.lines) {
    if (/^\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:Day|第)\s*[\d一二兩两三四五六七八九十]{1,3}/iu.test(line)) {
      continue;
    }

    const normalizedLine = cleanMarkdownInline(line);
    if (!normalizedLine || /^(?:住宿|備案|提醒|請問|是否需要|已直接替換|已將|收到)/u.test(normalizedLine)) {
      continue;
    }

    const title = inferTitleFromTextLine(line);
    if (!title || seenTitles.has(title)) {
      continue;
    }
    seenTitles.add(title);

    const timeLabel = inferTimeLabel(line);
    const timeHour =
      (timeLabel ? TEXT_ITINERARY_TIME_HOURS[timeLabel] : undefined) ??
      DEFAULT_SPOT_HOURS[items.length % DEFAULT_SPOT_HOURS.length] ??
      9 + items.length * 2;

    items.push({
      id: buildItemId(section.dayNumber, items.length, title),
      dayNumber: section.dayNumber,
      time: normalizeTimeValue(undefined, timeHour),
      title,
      type: inferItemType(line, title),
      notes: normalizedLine,
      source: "ai",
      confidence: "low",
    });
  }

  return {
    dayNumber: section.dayNumber,
    theme: section.theme || `Day ${section.dayNumber}`,
    summary: undefined,
    items,
  };
}

export function textItineraryToTripPlanResult(
  text: string,
  options?: TravelPlanConversionOptions,
): TripPlanResult | null {
  const sections = parseTextItinerarySections(text);
  if (!sections.length) {
    return null;
  }
  const days = sections.map(textSectionToDay).filter((day) => day.items.length > 0);
  const resolvedDays =
    days.length > 0 ? days : sections.map(textSectionToDayLoose).filter((day) => day.items.length > 0);
  if (!resolvedDays.length) {
    return null;
  }
  return ensureTripPlanDayCount(
    {
      summary: "AI 文字行程",
      days: resolvedDays,
    },
    options?.targetDayCount,
  );
}

export function applyTextItineraryCorrections(
  plan: TripPlanResult,
  correctionTexts: string[],
): TripPlanResult {
  const replacements: Array<{ from: string; to: string }> = [];
  for (const text of correctionTexts) {
    if (/請問|希望我|或是/u.test(text)) {
      continue;
    }
    for (const match of text.matchAll(/[「『]([^」』]{2,30})[」』].{0,24}(?:替換為|換成|改成)[*「『]*([^*」』。；;，,\n]{2,30})/gu)) {
      const from = cleanTextItineraryTitle(match[1] || "");
      const to = cleanTextItineraryTitle(match[2] || "");
      if (from && to && from !== to && !/^上述/u.test(to)) {
        replacements.push({ from, to });
      }
    }
  }
  if (!replacements.length) {
    return plan;
  }

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const replacement = replacements.find((entry) => item.title === entry.from);
        if (!replacement) {
          return item;
        }
        return {
          ...item,
          id: buildItemId(day.dayNumber, day.items.indexOf(item), replacement.to),
          title: replacement.to,
          notes: item.notes?.replaceAll(replacement.from, replacement.to),
        };
      }),
    })),
  };
}
