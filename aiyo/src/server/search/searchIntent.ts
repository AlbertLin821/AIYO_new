const SEARCH_INTENT_KEYWORDS = [
  "最新",
  "推薦",
  "景點",
  "美食",
  "餐廳",
  "咖啡廳",
  "活動",
  "門票",
  "交通",
  "營業時間",
  "評價",
  "地址",
  "怎麼去",
  "附近",
  "近期",
  "今年",
  "2026",
  "local events",
  "restaurant",
  "attraction",
  "itinerary",
  "opening hours",
];

export function shouldUseWebSearch(userMessage: string): boolean {
  const text = userMessage.trim().toLowerCase();
  if (!text) {
    return false;
  }
  return SEARCH_INTENT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}
