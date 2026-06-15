import { getRegionalTransitOptions } from "@/lib/tripTransportRegion";

export type PlanningTransportPreference =
  | "public_transport"
  | "self_drive"
  | "charter_or_tour"
  | "walking"
  | "bicycling"
  | "ai_recommend";

export type SegmentTransportMode =
  | "Driving"
  | "Walking"
  | "Bicycling"
  | "Transit"
  | "Transit (MRT)"
  | "Transit (THSR)"
  | "Transit (TRA)"
  | "Transit (JR)"
  | "Transit (Metro)"
  | "Transit (Metro KR)"
  | "Transit (MTR)";

function containsCjk(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

export function normalizePlanningTransportPreference(
  value?: string | null,
): PlanningTransportPreference | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "public_transport" ||
    normalized === "public transport" ||
    normalized === "transit" ||
    normalized === "大眾運輸" ||
    normalized === "大众运输"
  ) {
    return "public_transport";
  }
  if (
    normalized === "self_drive" ||
    normalized === "self drive" ||
    normalized === "driving" ||
    normalized === "drive" ||
    normalized === "自駕" ||
    normalized === "自驾" ||
    normalized === "開車" ||
    normalized === "开车"
  ) {
    return "self_drive";
  }
  if (
    normalized === "charter_or_tour" ||
    normalized === "charter or tour" ||
    normalized === "包車" ||
    normalized === "包车" ||
    normalized === "一日遊" ||
    normalized === "一日游"
  ) {
    return "charter_or_tour";
  }
  if (normalized === "walking" || normalized === "walk" || normalized === "步行") {
    return "walking";
  }
  if (
    normalized === "bicycling" ||
    normalized === "bicycle" ||
    normalized === "bike" ||
    normalized === "自行車" ||
    normalized === "脚踏车" ||
    normalized === "腳踏車"
  ) {
    return "bicycling";
  }
  if (normalized === "ai_recommend" || normalized.includes("ai 建議")) {
    return "ai_recommend";
  }
  return null;
}

export function inferPlanningTransportPreference(destination: string): Exclude<PlanningTransportPreference, "ai_recommend"> {
  const normalized = destination.trim().toLowerCase();
  if (!normalized) {
    return "public_transport";
  }

  if (
    /澎湖|金門|馬祖|墾丁|阿蘇|北海道|沖繩|okinawa|hokkaido|九州|熊本|鹿兒島|宮崎|富良野|美瑛|queenstown|紐西蘭南島|冰島|penghu|kinmen|matsu/u.test(
      normalized,
    )
  ) {
    return "self_drive";
  }

  if (/單車|骑车|騎車|腳踏車|自行車|bike|bicycle/.test(normalized)) {
    return "bicycling";
  }

  return "public_transport";
}

function findPreferredTransitLabel(destination: string): SegmentTransportMode {
  const normalized = destination.trim().toLowerCase();
  const regional = getRegionalTransitOptions(destination).map((option) => option.value);

  if (regional.includes("Transit (MTR)") && /香港|hong kong/.test(normalized)) {
    return "Transit (MTR)";
  }
  if (regional.includes("Transit (Metro KR)") && /首爾|首尔|seoul|釜山|busan|韓國|韩国|korea/.test(normalized)) {
    return "Transit (Metro KR)";
  }
  if (regional.includes("Transit (Metro)") && /東京|tokyo|大阪|osaka|京都|kyoto|日本|japan/.test(normalized)) {
    return "Transit (Metro)";
  }
  if (regional.includes("Transit (JR)") && /北海道|hokkaido|九州|熊本|福岡|fukuoka|名古屋|nagoya|日本|japan/.test(normalized)) {
    return "Transit (JR)";
  }
  if (regional.includes("Transit (MRT)") && /台北|臺北|taipei|高雄|kaohsiung|台中|taichung|桃園|taoyuan/.test(normalized)) {
    return "Transit (MRT)";
  }
  if (regional.includes("Transit (TRA)") && /花蓮|hualien|台東|taitung|宜蘭|yilan/.test(normalized)) {
    return "Transit (TRA)";
  }
  return "Transit";
}

export function resolvePlanningTransportPreference(
  value: string | null | undefined,
  destination: string,
): Exclude<PlanningTransportPreference, "ai_recommend"> {
  const normalized = normalizePlanningTransportPreference(value);
  if (!normalized || normalized === "ai_recommend") {
    return inferPlanningTransportPreference(destination);
  }
  return normalized;
}

export function transportPreferenceToSegmentMode(
  preference: string | null | undefined,
  destination: string,
): SegmentTransportMode {
  switch (resolvePlanningTransportPreference(preference, destination)) {
    case "self_drive":
    case "charter_or_tour":
      return "Driving";
    case "walking":
      return "Walking";
    case "bicycling":
      return "Bicycling";
    case "public_transport":
    default:
      return findPreferredTransitLabel(destination);
  }
}

export function inferTransportModeForDistance(input: {
  destination: string;
  preferredTransport?: string | null;
  distanceKm?: number;
}): string {
  const preferred = normalizePlanningTransportPreference(input.preferredTransport);
  if (preferred && preferred !== "ai_recommend") {
    return transportPreferenceToSegmentMode(preferred, input.destination);
  }

  const distanceKm = typeof input.distanceKm === "number" && Number.isFinite(input.distanceKm)
    ? input.distanceKm
    : undefined;
  const inferred = inferPlanningTransportPreference(input.destination);
  if (inferred === "public_transport" && distanceKm !== undefined && distanceKm <= 2.4 && containsCjk(input.destination)) {
    return "Walking";
  }

  return transportPreferenceToSegmentMode(inferred, input.destination);
}
