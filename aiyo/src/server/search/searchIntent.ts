import type { ChatContext, SearchDecision, SearchNeed, TravelAgentKnownPreferences, TravelSearchContext } from "@/types";
import type { WebSearchResult } from "@/server/search/searxngClient";

const AI_SEARCH_PROVIDERS = ["serper", "tavily"] as const;

type SearchIntentInput = {
  message: string;
  context?: ChatContext;
  preferences?: TravelAgentKnownPreferences;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function currentYear(): string {
  return String(new Date().getFullYear());
}

function isCasualOrPlanningOnly(text: string): boolean {
  return (
    /^(你好|嗨|哈囉|哈啰|hello|hi|你可以幫我做什麼|你能做什麼|可以做什麼|謝謝|感謝)[！!。.\s]*$/iu.test(text) ||
    /(?:我想去|想去|我要去).{0,18}(?:玩|旅遊|旅行|自由行)?\s*[\d一二兩两三四五六七八九十]+\s*(?:天|日)/u.test(text) ||
    /(?:第一次|適合嗎|會不會太趕|親子旅遊|根據我的偏好|沿用|照之前|調整節奏|輕鬆一點|排鬆一點)/u.test(text)
  );
}

function inferSearchNeed(text: string): SearchNeed {
  if (/營業時間|營業到幾點|開到幾點|還有開|現在.*開|公休|臨時休館|休館/u.test(text)) {
    return "opening_hours";
  }
  if (/票價|門票|入場費|價格|多少錢|預約/u.test(text)) {
    return "ticket_price";
  }
  if (/活動|祭典|市集|展覽|節慶|這個月|下週|下周|近期/u.test(text)) {
    return "events";
  }
  if (/天氣|降雨|氣溫|颱風|下雨/u.test(text)) {
    return "weather";
  }
  if (/交通|怎麼去|怎麼到|到.*怎麼|地鐵|巴士|公車|JR|步行|開車|比較快|封路|交通狀況|交通管制/u.test(text)) {
    return "transportation";
  }
  if (/官方|公告|官網|政府|交通局|旅遊局/u.test(text)) {
    return "official_source";
  }
  if (/附近有沒有|附近|店家|仍營業|最新熱門|最新推薦|2026\s*最新|最新/u.test(text)) {
    return "fresh_info";
  }
  if (/地址|評價|店家資訊|place details|opening hours|local events/i.test(text)) {
    return "place_details";
  }
  return "none";
}

function needReason(need: SearchNeed): string {
  switch (need) {
    case "opening_hours":
      return "使用者詢問營業時間、公休或即時開放狀態，需要最新外部資料。";
    case "ticket_price":
      return "使用者詢問票價、門票或預約資訊，需要最新外部資料。";
    case "events":
      return "使用者詢問近期活動、祭典、市集或展覽，需要最新外部資料。";
    case "weather":
      return "使用者詢問天氣或近期氣象，需要最新外部資料。";
    case "transportation":
      return "使用者詢問交通路線或交通狀況，需要外部資料輔助。";
    case "official_source":
      return "使用者要求官方資訊或公告，需要查官方來源。";
    case "fresh_info":
      return "使用者詢問最新、附近或仍營業資訊，需要外部資料。";
    case "place_details":
      return "使用者詢問特定地點細節，需要外部資料輔助。";
    case "general_web_research":
      return "使用者要求一般網路研究。";
    default:
      return "不需要外部搜尋，可先用使用者 context 與一般旅遊知識回答。";
  }
}

function destinationFromInput(input: SearchIntentInput): string {
  const scopeLabel = input.context?.destinationScope?.canonicalLabel?.trim();
  if (scopeLabel) {
    return scopeLabel;
  }
  return input.context?.destination || input.preferences?.destination || "";
}

export function buildTravelSearchQuery(input: SearchIntentInput, searchNeed: SearchNeed): string {
  const text = normalizeText(input.message);
  const destination = destinationFromInput(input);
  const dates = [input.context?.tripStartDate, input.context?.tripEndDate].filter(Boolean).join(" ");
  const style = input.preferences?.travelStyle?.slice(0, 3).join(" ") || "";
  const prefix = destination && !text.includes(destination) ? destination : "";
  const year = currentYear();

  const suffixByNeed: Record<SearchNeed, string> = {
    none: "",
    fresh_info: `最新 官方 ${year}`,
    place_details: "地點資訊 官方",
    opening_hours: "今日 營業時間 官方",
    ticket_price: `門票 票價 官方 ${year}`,
    events: `活動 祭典 官方 ${year}`,
    weather: "天氣 預報",
    transportation: "交通 地鐵 步行 官方",
    official_source: `官方 公告 ${year}`,
    general_web_research: `旅遊 官方 ${year}`,
  };

  return [prefix, text, dates, style, suffixByNeed[searchNeed]]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function decideSearchIntent(input: SearchIntentInput): SearchDecision {
  const text = normalizeText(input.message);
  if (!text) {
    return {
      shouldSearch: false,
      searchNeed: "none",
      reason: "空訊息不搜尋。",
      providers: [...AI_SEARCH_PROVIDERS],
      freshnessRequired: false,
    };
  }
  const searchNeed = inferSearchNeed(text);
  if (searchNeed === "none" || isCasualOrPlanningOnly(text)) {
    return {
      shouldSearch: false,
      searchNeed: "none",
      reason: needReason("none"),
      providers: [...AI_SEARCH_PROVIDERS],
      freshnessRequired: false,
    };
  }
  return {
    shouldSearch: true,
    searchNeed,
    reason: needReason(searchNeed),
    query: buildTravelSearchQuery(input, searchNeed),
    providers: [...AI_SEARCH_PROVIDERS],
    freshnessRequired: searchNeed !== "transportation" && searchNeed !== "place_details",
    maxResults: 5,
  };
}

export function shouldUseWebSearch(userMessage: string): boolean {
  return decideSearchIntent({ message: userMessage }).shouldSearch;
}

function sourceQualityScore(result: WebSearchResult): number {
  const url = result.url.toLowerCase();
  const title = result.title.toLowerCase();
  let score = result.score || 0;
  if (/\.(gov|go\.jp|go\.kr|gov\.tw|gov\.uk|gov\.sg)\b/.test(url)) score += 8;
  if (/official|公式|官方|官網|交通局|旅遊局|観光|觀光|政府|museum|airport|metro|railway/.test(url + " " + title)) score += 5;
  if (/google\.com\/travel|maps\.google|klook|kkday|tripadvisor/.test(url)) score += 2;
  if (/blog|medium|痞客邦|pixnet|內容農場|top10|懶人包/.test(url + " " + title)) score -= 3;
  return score;
}

export function toTravelSearchContext(input: {
  provider: "serper" | "tavily";
  query: string;
  searchNeed: SearchNeed;
  results: WebSearchResult[];
  maxResults?: number;
}): TravelSearchContext {
  const max = Math.min(5, Math.max(1, input.maxResults ?? 5));
  const results = [...input.results]
    .sort((a, b) => sourceQualityScore(b) - sourceQualityScore(a))
    .slice(0, max)
    .map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content?.slice(0, 500),
      source: result.engine,
      publishedAt: result.publishedDate || undefined,
    }));

  return {
    provider: input.provider,
    query: input.query,
    searchNeed: input.searchNeed,
    results,
    usedAt: new Date().toISOString(),
  };
}

export function formatTravelSearchContextForPrompt(context: TravelSearchContext): string {
  if (!context.results.length) {
    return "";
  }
  return [
    `[搜尋結果]`,
    `provider: ${context.provider}`,
    `searchNeed: ${context.searchNeed}`,
    `query: ${context.query}`,
    ...context.results.map((result, index) =>
      [
        `${index + 1}. ${result.title}`,
        result.url ? `URL: ${result.url}` : "",
        result.snippet ? `摘要: ${result.snippet}` : "",
        result.publishedAt ? `日期: ${result.publishedAt}` : "",
      ].filter(Boolean).join("\n"),
    ),
  ].join("\n");
}
