import type { TravelAgentKnownPreferences, TravelPace } from "@/types";

export function localizePreferenceLabel(value: string): string {
  const map: Record<string, string> = {
    food: "美食",
    shopping: "購物",
    nature: "自然景觀",
    culture: "文化",
    history: "歷史",
    relaxed: "輕鬆步調",
    balanced: "適中步調",
    moderate: "適中步調",
    intensive: "充實緊湊",
  };
  return map[value] || value;
}

export function formatBudgetLevelLabel(budgetLevel?: string): string {
  if (budgetLevel === "high") {
    return "高預算";
  }
  if (budgetLevel === "medium") {
    return "中等預算";
  }
  if (budgetLevel === "low") {
    return "低預算";
  }
  return "";
}

export function formatPaceLabel(pace?: TravelPace | string): string {
  if (pace === "relaxed") {
    return "輕鬆步調";
  }
  if (pace === "intensive") {
    return "充實緊湊";
  }
  if (pace === "moderate" || pace === "balanced") {
    return "適中步調";
  }
  return "";
}

export function formatPreferenceSummary(preferences: TravelAgentKnownPreferences): string {
  const parts = [
    formatBudgetLevelLabel(preferences.budgetLevel) ||
      (preferences.budget ? `預算約 ${preferences.budget}` : ""),
    preferences.travelStyle?.length
      ? preferences.travelStyle.map(localizePreferenceLabel).join("、")
      : "",
    formatPaceLabel(preferences.pace),
    preferences.transportPreference,
    preferences.foodPreferences?.length ? `飲食偏好：${preferences.foodPreferences.join("、")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("、") : "你之前的旅遊偏好";
}

export type PreferenceDetailRow = {
  label: string;
  value: string;
};

export function buildPreferenceDetailRows(
  preferences: TravelAgentKnownPreferences,
  options?: {
    currentDestination?: string;
    currentDays?: number;
  },
): PreferenceDetailRow[] {
  const rows: PreferenceDetailRow[] = [];

  if (preferences.destination) {
    const sameAsCurrent =
      options?.currentDestination &&
      preferences.destination.trim() === options.currentDestination.trim();
    rows.push({
      label: sameAsCurrent ? "目的地" : "上次目的地",
      value: preferences.destination,
    });
  }

  if (preferences.days) {
    const sameAsCurrent = options?.currentDays && preferences.days === options.currentDays;
    rows.push({
      label: sameAsCurrent ? "天數" : "上次天數",
      value: `${preferences.days} 天`,
    });
  }

  const budgetLabel =
    formatBudgetLevelLabel(preferences.budgetLevel) ||
    (preferences.budget ? `約 ${preferences.budget} 元` : "");
  if (budgetLabel) {
    rows.push({ label: "預算等級", value: budgetLabel });
  }

  if (preferences.travelStyle?.length) {
    rows.push({
      label: "旅遊風格",
      value: preferences.travelStyle.map(localizePreferenceLabel).join("、"),
    });
  }

  const paceLabel = formatPaceLabel(preferences.pace);
  if (paceLabel) {
    rows.push({ label: "行程步調", value: paceLabel });
  }

  if (preferences.transportPreference) {
    rows.push({ label: "交通偏好", value: preferences.transportPreference });
  }

  if (preferences.accommodationPreference) {
    rows.push({ label: "住宿偏好", value: preferences.accommodationPreference });
  }

  if (preferences.companionType) {
    rows.push({ label: "同行類型", value: preferences.companionType });
  }

  if (preferences.foodPreferences?.length) {
    rows.push({ label: "飲食偏好", value: preferences.foodPreferences.join("、") });
  }

  if (preferences.mustVisit?.length) {
    rows.push({ label: "必去", value: preferences.mustVisit.join("、") });
  }

  if (preferences.avoid?.length || preferences.avoidances?.length) {
    rows.push({
      label: "避免",
      value: (preferences.avoid || preferences.avoidances || []).join("、"),
    });
  }

  if (preferences.notes) {
    rows.push({ label: "備註", value: preferences.notes });
  }

  return rows;
}

export function hasMeaningfulReusablePreferences(preferences?: {
  destination?: string;
  days?: number;
  budget?: number;
  budgetLevel?: string;
  travelStyle?: string[];
  transportPreference?: string;
  accommodationPreference?: string;
  companionType?: string;
  foodPreferences?: string[];
  pace?: string;
  notes?: string;
}): boolean {
  if (!preferences) {
    return false;
  }
  return Boolean(
    preferences.budget ||
      preferences.budgetLevel ||
      preferences.travelStyle?.length ||
      preferences.transportPreference ||
      preferences.accommodationPreference ||
      preferences.companionType ||
      preferences.foodPreferences?.length ||
      preferences.pace ||
      preferences.notes,
  );
}

export function isPreferenceOverrideMessage(message: string): boolean {
  const normalized = message.trim();
  return /^這次想改成[:：]/u.test(normalized) || /^這次想重新填寫偏好/u.test(normalized);
}

export function buildPreferenceOverrideMessage(preferences: TravelAgentKnownPreferences): string {
  const parts = [
    formatBudgetLevelLabel(preferences.budgetLevel),
    preferences.travelStyle?.length
      ? preferences.travelStyle.map(localizePreferenceLabel).join("、")
      : "",
    formatPaceLabel(preferences.pace),
    preferences.transportPreference,
    preferences.accommodationPreference,
    preferences.companionType,
    preferences.foodPreferences?.length ? `飲食偏好：${preferences.foodPreferences.join("、")}` : "",
  ].filter(Boolean);
  return parts.length ? `這次想改成：${parts.join("、")}` : "這次想重新填寫偏好";
}
