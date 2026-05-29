import type { ChatContext, TripPlanRequest, VideoRecommendation, VideoSummarySegment } from "@/types";
import { poiSynonymGroupsForPrompt } from "@/server/video/segmentPlaceDedupe";
import {
  buildItineraryPolicyBlock,
  buildTravelResearchSystemPrompt,
} from "@/server/ai/policies/travelPlanningPolicy";

export function detectResponseLanguage(
  message: string,
): "traditional-chinese" | "japanese" | "english" {
  if (/[\u3040-\u30ff]/.test(message)) {
    return "japanese";
  }
  if (/[\u3400-\u9fff]/.test(message)) {
    return "traditional-chinese";
  }
  return "english";
}

function formatItineraryContext(context: ChatContext): string | null {
  if (!context.itinerary?.length) {
    return null;
  }

  const lines = context.itinerary.flatMap((day) => {
    const header = [
      `Day ${day.dayNumber}`,
      day.theme ? `theme=${day.theme}` : "",
      day.summary ? `summary=${day.summary}` : "",
    ].filter(Boolean).join(" | ");
    const itemLines = day.items.slice(0, 12).map((item) => {
      const details = [
        `id=${item.id}`,
        `${item.time} ${item.title}`,
        `type=${item.type}`,
        item.transport ? `transport=${item.transport}` : "",
        item.notes ? `notes=${item.notes}` : "",
        item.location?.name ? `location=${item.location.name}` : "",
        item.location?.address ? `address=${item.location.address}` : "",
      ].filter(Boolean).join(" | ");
      return `- ${details}`;
    });
    return [header, ...itemLines];
  });

  return `Current itinerary details:\n${lines.slice(0, 80).join("\n")}`;
}

function formatContext(context?: ChatContext): string {
  if (!context) {
    return "No structured trip context was provided.";
  }

  const parts = [
    `Destination: ${context.destination || "unknown"}`,
    `Days: ${context.days || "unknown"}`,
    `Budget: ${context.budget || "unknown"}`,
    `Interests: ${context.preferences?.interests.join(", ") || "unknown"}`,
    `Pace: ${context.preferences?.pace || "unknown"}`,
    `Transport: ${context.preferences?.transportPreference || "unknown"}`,
  ];

  if (context.tripStartDate) {
    parts.push(`Trip start date (ISO): ${context.tripStartDate}`);
  }
  if (context.tripEndDate) {
    parts.push(`Trip end date (ISO): ${context.tripEndDate}`);
  }

  const itineraryContext = formatItineraryContext(context);
  if (itineraryContext) {
    parts.push(itineraryContext);
  }

  return parts.join("\n");
}

function formatMemoryContext(memoryContext?: string): string {
  if (!memoryContext?.trim()) {
    return "No relevant long-term memory was retrieved.";
  }
  return memoryContext.trim();
}

export function buildChatResearchPlanningPrompt(input: {
  message: string;
  context?: ChatContext;
  memoryContext?: string;
}): { system: string; user: string } {
  return {
    system: [
      buildTravelResearchSystemPrompt(),
      'Top-level shape: { "phase": "research", "toolRequests": array }.',
      "toolRequests may contain 0 to 6 objects. Each object must have a string field type.",
      'Allowed types: "search_place" with fields query (string), optional locationHint (string);',
      '"tavily_search" with field query (string) for local events, road closures, festivals;',
      '"weather_forecast" with optional destination, startDate, endDate (ISO yyyy-mm-dd).',
      "Write query strings in Traditional Chinese when the user message is Chinese.",
      "Do not invent POI names in this phase; only propose search queries.",
    ].join("\n"),
    user: [
      `User message: ${input.message}`,
      "",
      "Trip context:",
      formatContext(input.context),
      "",
      "Relevant long-term memory:",
      formatMemoryContext(input.memoryContext),
    ].join("\n"),
  };
}

export function buildItineraryPatchIntentPrompt(input: {
  message: string;
  context?: ChatContext;
}): { system: string; user: string } {
  return {
    system: [
      "You are AIYO itinerary action parser. Output JSON only (no markdown fences).",
      'Shape: { "replyText": string, "assistantActions": array, "proposedChanges": array }.',
      "Step 1: infer what the user wants to do to the EXISTING itinerary (not a full replan).",
      "Step 2: emit ONLY actions from the executable catalog below.",
      "",
      "Executable actions:",
      '- assistantActions itinerary.update_item: { "type": "itinerary.update_item", "payload": { "dayId": "day-N", "itemId": string, "patch": { "title"?: string, "location"?: string, "notes"?: string } } }.',
      '- assistantActions itinerary.add_item/remove_item/reorder_items/replace_day/trip.update_metadata/map.focus_location are allowed when directly requested.',
      '- remove_itinerary_day: { "type": "remove_itinerary_day", "day": number, "reason"?: string } — delete an entire day.',
      '- remove_itinerary_item: { "type": "remove_itinerary_item", "day"?: number, "itemId"?: string, "targetTitle"?: string, "reason"?: string } — remove one activity.',
      '- update_itinerary_item: { "type": "update_itinerary_item", "day"?: number, "itemId"?: string, "targetTitle"?: string, "time"?: "HH:MM", "title"?: string, "locationName"?: string, "notes"?: string, "transport"?: string, "reason"?: string } — rename, retime, or replace one activity.',
      '- add_itinerary_item: { "type": "add_itinerary_item", "day": number, "time"?: "HH:MM", "title": string, "locationName"?: string, "transport"?: string, "notes"?: string, "reason"?: string } — add one activity.',
      "",
      "Rules:",
      "- Prefer itemId from the itinerary context when targeting an existing item.",
      "- For any executable itinerary edit, also emit assistantActions. Keep proposedChanges for backward compatibility when possible.",
      "- If location changes but coordinates are unknown, omit lat/lng; do not reuse old coordinates.",
      "- Use at most 6 assistantActions. Do not emit raw SQL, script, or HTML.",
      "- When the user names a day (第N天; 地N天 is a common typo for 第N天), scope remove/update to that day only.",
      "- Use remove_itinerary_day only for deleting a whole day, not a single POI.",
      "- Do not replan the entire trip; do not add research tool requests.",
      "- If the user is only asking a question, return assistantActions: [] and proposedChanges: [].",
      "- replyText: concise Traditional Chinese confirmation of what will change.",
      "Reply only in Traditional Chinese.",
    ].join("\n"),
    user: [
      `User message: ${input.message}`,
      "",
      "Current trip context:",
      formatContext(input.context),
    ].join("\n"),
  };
}

export function buildChatPrompt(
  message: string,
  context?: ChatContext,
  memoryContext?: string,
  researchDigest?: string,
  webSearchDigest?: string,
) {
  const hasResearch = Boolean(researchDigest?.trim());
  const hasWebSearch = Boolean(webSearchDigest?.trim());
  return {
    system: [
      "You are AIYO, a professional, natural, friendly, and concise travel planning assistant.",
      hasResearch
        ? "You MUST output JSON only with this exact shape: { \"replyText\": string, \"assistantActions\": array, \"proposedChanges\": array }."
        : "Prefer output JSON with shape { \"replyText\": string, \"assistantActions\": array, \"proposedChanges\": array } when possible; otherwise reply in concise plain Traditional Chinese.",
      hasResearch
        ? 'assistantActions may include itinerary.add_item, itinerary.update_item, itinerary.remove_item, itinerary.reorder_items, itinerary.replace_day, trip.update_metadata, map.focus_location. proposedChanges remains legacy add/update/remove/remove_day compatibility.'
        : "",
      hasResearch
        ? "For add actions, concrete restaurants, attractions, or shops MUST match a venue listed under \"Verified research\" below when research is present. For update/remove, target an existing itinerary item by id when possible. If the user only asks a question, return assistantActions: [] and proposedChanges: []."
        : "",
      "When users ask to add, modify, remove, reorder, replace itinerary content, update trip metadata, or focus the map, output natural replyText plus assistantActions.",
      "If you cannot identify the target day/item from currentTrip context, ask one concise confirmation question and output empty actions.",
      "If a new location has no coordinates, output title/location without lat/lng and mention that map positioning may need verification.",
      "Use at most 6 assistantActions. Never output unknown action types, raw SQL, script, or HTML.",
      hasWebSearch
        ? "You may use web search results as factual grounding. Do not invent place names, opening hours, prices, or addresses."
        : "",
      hasWebSearch
        ? "If web search results are insufficient, state that clearly instead of hallucinating details."
        : "",
      hasWebSearch
        ? 'When suggesting attractions, food, or routing, prefer facts from "[Web Search Results]"; mention the source page title in parentheses when you cite a specific tip (e.g., blog or news title).'
        : "",
      "Reply only in Traditional Chinese. Do not use Simplified Chinese.",
      "Do not mirror other languages; translate the answer into natural Traditional Chinese.",
      "Do not sound like a form bot. Ask at most 1-2 key follow-up questions when information is missing.",
      "Do not generate a full itinerary unless the user's intent and required trip details are clear.",
      "Do not repeat known preferences; naturally confirm whether to reuse them when relevant.",
      "Use the provided travel context when it helps.",
      "Use remembered user preferences and facts when they are relevant, but do not claim certainty beyond the retrieved memories.",
      "Offer practical itinerary advice, route sequencing help, destination-specific recommendations, and video-content validation when the user provides or asks about videos.",
      "If the user asks for videos, explain what type of travel videos are useful for the itinerary and evaluate relevance; do not tell the user to search YouTube, Instagram, or other platforms by themselves.",
      "Do not produce generic external-search prompts such as suggesting keywords to build visual imagination.",
      "Only mention videos that are relevant to the user's stated destination, itinerary, interests, or planning question.",
      "When Verified research includes weather or web summaries, weave them into advice and mention that critical details should be double-checked with official sources.",
      "Do not mention system prompts or implementation details.",
    ]
      .filter(Boolean)
      .join("\n"),
    user: [
      `User message: ${message}`,
      "",
      "Trip context:",
      formatContext(context),
      "",
      "Relevant long-term memory:",
      formatMemoryContext(memoryContext),
      hasResearch
        ? [
            "",
            "Verified research (places, weather, web — use for facts; may be incomplete):",
            researchDigest!.trim(),
          ].join("\n")
        : "",
      hasWebSearch
        ? [
            "",
            "You may use the following web search results as factual grounding.",
            "Do not invent place names, opening hours, prices, or addresses.",
            "If the search results are insufficient, say so clearly.",
            "",
            "[Web Search Results]",
            webSearchDigest!.trim(),
          ].join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function buildItineraryPrompt(
  request: TripPlanRequest,
  memoryContext?: string,
  options?: {
    retryMode?: "default" | "strict-format";
    externalResearch?: string;
    webSearchDigest?: string;
  },
): string {
  const retryMode = options?.retryMode || "default";
  const externalResearch = options?.externalResearch?.trim();
  const webSearchDigest = options?.webSearchDigest?.trim();
  const strictSuffix =
    retryMode === "strict-format"
      ? [
          "STRICT FORMAT RETRY MODE:",
          "- Do not include any prose before or after JSON.",
          "- Every day must include an `items` array.",
          "- Every item must include: `time`, `title`, `type`.",
          "- Item `title` must be a single searchable place/venue name only — no interest prefixes, meal suffixes, or multi-stop joins.",
          "- Prefer to include `location` with `name`, `lat`, `lng`, `description`, `address` whenever possible.",
          "- `location.name` must match the searchable place name used in `title`.",
          "- Validate JSON mentally before output.",
        ]
      : [];
  const itineraryDraftSummary = request.itineraryDraft?.length
    ? request.itineraryDraft
        .map(
          (day) =>
            `Day ${day.dayNumber}: ${day.items
              .map((item) => `${item.time} ${item.title}`)
              .join(" | ")}`,
        )
        .join("\n")
    : "";

  return [
    "Create a structured travel itinerary in JSON only.",
    "All user-facing string values must be written only in Traditional Chinese. Do not use Simplified Chinese.",
    "",
    buildItineraryPolicyBlock(),
    "",
    "HARD SCHEMA RULES:",
    '- Return one JSON object exactly in this shape: { "summary": string, "days": [{ "dayNumber": number, "theme": string, "summary": string, "items": [{ "id": string, "time": "HH:MM", "title": string, "type": "attraction|restaurant|transport|hotel|activity|shopping", "transport": string, "notes": string, "location": { "name": string, "lat": number, "lng": number, "description": string, "address": string }, "sourceTitle"?: string, "sourceUrl"?: string, "sourceSnippet"?: string, "confidence"?: "high"|"medium"|"low" }] }], "warnings": string[] }',
    "- Output raw JSON only, no markdown fences.",
    "",
    "QUALITY RULES:",
    "- Each day should contain 4 to 7 items.",
    "- Item times must be chronological within each day.",
    "- Keep route flow realistic and spatially coherent.",
    "- `transport` should align with transport preference unless a clear local reason requires a change.",
    "- For every item after the first located stop of a day, `transport` means how to travel from the previous stop to this item. Prefer concrete modes such as 大眾運輸、步行、開車、計程車、JR、地鐵、巴士.",
    "- Do not invent travel minutes. The system will attach provider-backed route duration after JSON generation.",
    "- `mustVisit` places must be covered in the nearest appropriate day(s).",
    "- `avoid` terms must not appear in `title`, `notes`, or `location.name`.",
    "- Prefer complete `location` objects (name, lat, lng, description, address). If unknown, you may omit `location` for that item instead of inventing nonsense.",
    "",
    "TITLE & LOCATION RULES (critical for map geocoding):",
    "- Each item `title` must be ONE searchable place or venue name only (Google Maps style), e.g. `湧湧座`, `熊本城`, `林聰明砂鍋魚頭`.",
    "- NEVER prefix item titles with interest/theme labels. Bad: `歷史文化體驗 湧湧座`. Good: title=`湧湧座`, theme=`歷史文化體驗`.",
    "- NEVER suffix item titles with meal or activity wrappers. Bad: `湧湧座 周邊午餐`, `熊本城 晚餐與散步`. Good: title=`某某餐廳` or `午餐`, notes=`於湧湧座附近用餐`.",
    "- NEVER put multiple stops in one title. Bad: `熊本城・白川水源`. Create separate items instead.",
    "- For `type: restaurant`, prefer a concrete restaurant/shop name. If no specific venue is known, use `午餐` or `晚餐` as title and describe the area in `notes`.",
    "- When `location` is present, `location.name` must equal the searchable place name (same as `title` for attractions/activities, or the restaurant name for meals).",
    "- Put interests, pace, and route style in `theme` / `summary` / `notes` — not inside `title`.",
    "",
    "DESTINATION CONSTRAINTS:",
    `Destination: ${request.destination}`,
    `Days: ${request.days}`,
    `Budget TWD: ${request.budget || "not specified"}`,
    request.tripStartDate ? `Trip start date (ISO): ${request.tripStartDate}` : "",
    request.tripEndDate ? `Trip end date (ISO): ${request.tripEndDate}` : "",
    `Interests: ${request.preferences.interests.join(", ") || "none"}`,
    `Pace: ${request.preferences.pace}`,
    `Transport preference: ${request.preferences.transportPreference}`,
    `Must visit: ${request.preferences.mustVisit?.join(", ") || "none"}`,
    `Avoid: ${request.preferences.avoid?.join(", ") || "none"}`,
    request.preferences.notes ? `Notes: ${request.preferences.notes}` : "",
    itineraryDraftSummary
      ? `Existing itinerary draft to revise/preserve when reasonable:\n${itineraryDraftSummary}`
      : "",
    `Relevant long-term memory: ${formatMemoryContext(memoryContext)}`,
    "",
    "SELF-CHECK BEFORE FINAL OUTPUT:",
    "- Valid JSON parseable by a strict parser.",
    "- `days` length matches requested number of days.",
    "- `mustVisit` covered and `avoid` excluded.",
    "- Times are sorted and types are from allowed enum.",
    "- Every item title is a single searchable place/venue name with no interest prefix, meal suffix, or `・` multi-stop join.",
    ...(itineraryDraftSummary
      ? [
          "- This request includes an existing itinerary draft. Edit and preserve useful structure when possible instead of rewriting everything from scratch.",
          "- Keep unchanged day flow when the user's latest instruction does not require modifying that part.",
        ]
      : []),
    ...(externalResearch
      ? [
          "",
          "VERIFIED RESEARCH (use for real POI names, weather hints, events; confirm critical details officially):",
          externalResearch,
          "",
          "Each item `location.name` (when present) MUST correspond to a concrete venue or place name found in VERIFIED RESEARCH or be omitted — do not invent fictional businesses.",
        ]
      : []),
    ...(webSearchDigest
      ? [
          "",
          "WEB SEARCH FACTUAL GROUNDING:",
          "Do not invent place names, opening hours, prices, or addresses.",
          "Prefer places and restaurants appearing in [Web Search Results].",
          "If search results are insufficient, say \"目前搜尋資料不足\" in summary or warnings.",
          "[Web Search Results]",
          webSearchDigest,
          "When possible, include sourceTitle/sourceUrl/sourceSnippet for each itinerary item.",
        ]
      : []),
    ...strictSuffix,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMapPlanningPrompt(request: TripPlanRequest): string {
  return [
    "Summarize the best map-sync view for the trip.",
    "Reply only in Traditional Chinese. Do not use Simplified Chinese.",
    `Destination: ${request.destination}`,
    `Days: ${request.days}`,
    `Interests: ${request.preferences.interests.join(", ") || "none"}`,
  ].join("\n");
}

export function buildVideoSummaryPrompt(input: {
  title: string;
  description: string;
  destination?: string;
  transcriptSegments: Array<
    Pick<VideoSummarySegment, "timestamp" | "text" | "startSeconds" | "endSeconds">
  >;
  retryMode?: boolean;
}): string {
  return [
    "You summarize travel videos and extract itinerary-ready place hints.",
    "All user-facing string values must be written only in Traditional Chinese. Do not use Simplified Chinese.",
    "Use transcript chunks as the sole source for summary and segment text; do not invent details from the title or description alone.",
    "Only use the description as supporting metadata when a transcript chunk is clearly incomplete for that time range.",
    "Return valid JSON only. Do not wrap the JSON in markdown.",
    'Use this exact shape: { "title": string, "summary": string, "segments": [{ "timestamp": string, "startSeconds": number, "endSeconds": number, "title": string, "text": string, "highlights": string[], "locationHints": string[] }], "extractedLocations": string[] }',
    `Video title: ${input.title}`,
    `Destination hint: ${input.destination || "unknown"}`,
    `Description metadata: ${input.description || "none"}`,
    "Transcript chunks:",
    ...input.transcriptSegments.map(
      (segment) =>
        `- ${segment.timestamp} (${segment.startSeconds ?? 0}-${segment.endSeconds ?? 0}s): ${segment.text}`,
    ),
    "Requirements:",
    "- Summary must be one Traditional Chinese sentence within 40 Chinese characters. Do not paste transcript wording.",
    "- Produce 3 to 8 segments using only timestamps that exist in the transcript chunks.",
    "- Each segment must focus on a concrete POI, shop, stall, restaurant, food item, market, night market, cafe, landmark, or attraction that is actually mentioned near that timestamp.",
    "- If one chunk mentions multiple concrete places or foods, split them into smaller segments instead of merging them into a broad city-food segment.",
    "- Each segment title must be a complete, readable headline (full official-style name when the transcript gives it), not a generic theme.",
    "- Use fully qualified place names suitable for Google Maps search (e.g. 嘉義文化路夜市、臺南武聖夜市), never vague tokens alone such as 夜市、老街、小吃、附近、這裡、當地.",
    "- Food names must be specific (e.g. 嘉義火雞肉飯、林聰明沙鍋魚頭); if the transcript only implies a dish without a verifiable name, omit it or mark the segment note as （資訊不足） rather than inventing a shop name.",
    "- Each segment text must state what the place is, why it matters for travelers, and how it fits an itinerary (time-of-day, pacing, or connection to the next stop).",
    "- Never use half-sentences, oral filler, or clipped transcript fragments as the segment title (for example fragments ending mid-thought or with 然後、就是、那個、這邊).",
    "- Each segment text must be a concise 1 to 2 sentence synthesis of that time range, within 60 Chinese characters, not verbatim transcript.",
    "- Do not repeat the same POI name (or synonymous variants such as X站 vs X車站 vs X駅 vs JR+X站) multiple times in one segment text; mention it at most once, then use 該站／該景點／此區 or omit the name if locationHints already identify it.",
    "- CLOSED-VOCAB per segment: locationHints should list each POI once with ONE chosen spelling (prefer transcript wording). Title + text must use that same spelling—never alternate 站／車站／駅／JR〇〇站 for the same stop inside one segment.",
    "- Each segment highlights array must contain 1 to 3 concise concrete notable details from that same time range.",
    "- Prefer segments about attractions, restaurants, food, landmarks, viewpoints, shopping streets, or photo spots.",
    "- Extract only specific place names, restaurants, food spots, stalls, attractions, landmarks, markets, parks, stations, or districts when actually mentioned in transcript chunks.",
    "- Final extractedLocations must contain canonical place names only.",
    "- Never output transcript fragments as place names.",
    "- Never output routing phrases as place names.",
    "- Remove prefixes like 從, 到, 前往, 直達, 可直達, 距離, 位在, 靠近, 走路去 before deciding the place name.",
    "- Collapse equivalent station names into one canonical name.",
    "- If a candidate is a city, country, or generic region, reject it.",
    "- If a candidate is only a food dish and not a named shop, reject it.",
    "- If unsure, omit the place instead of guessing.",
    "- Do not put broad destinations or search phrases in extractedLocations or locationHints: 台灣, 北部, 中部, 南部, 東部, 嘉義, 嘉義市, 嘉義縣, 台北, 台北市, 新北, 桃園, 台中, 台南, 高雄, 日本, 韓國, 大阪, 東京, 嘉義美食, 台南景點, 高雄旅遊.",
    "- Destination hint is only context. If the transcript only says the city name, omit it from extractedLocations.",
    "- Every segment should include at least one locationHint when a concrete place/food/shop is present in that same time range.",
    "- locationHints must be names actually spoken or shown in that chunk; do not infer from title or destination.",
    "- Timestamp must point to the chunk where the name is actually mentioned.",
    input.retryMode
      ? "- The previous answer was too generic or malformed. Be concrete and transcript-grounded."
      : "- Avoid generic phrases like 'destination planning context' or 'trip overview' unless the transcript explicitly says so.",
  ].join("\n");
}

export const buildVideoSegmentPrompt = buildVideoSummaryPrompt;

export function buildVideoFinalSummaryPrompt(input: {
  title: string;
  destination?: string;
  draft: {
    summary: string;
    segments: Array<Pick<VideoSummarySegment, "timestamp" | "title" | "text" | "highlights" | "locationHints">>;
    extractedLocations: string[];
  };
}): string {
  return [
    "You are the final editor for a travel-video summary.",
    "All user-facing string values must be written only in Traditional Chinese. Do not use Simplified Chinese.",
    "Refine the draft into a high-quality itinerary-ready JSON summary without inventing new places or moments.",
    "Return valid JSON only. Do not wrap the JSON in markdown.",
    'Use this exact shape: { "title": string, "summary": string, "segments": [{ "timestamp": string, "title": string, "text": string, "highlights": string[], "locationHints": string[] }], "extractedLocations": string[] }',
    `Video title: ${input.title}`,
    `Destination hint: ${input.destination || "unknown"}`,
    "Draft summary JSON:",
    JSON.stringify(input.draft),
    "closed_vocab_synonym_groups_by_timestamp (each segment's locationHints only; inner arrays are ONE entity—use at most one literal per array across that segment's title+text):",
    JSON.stringify(
      Object.fromEntries(
        input.draft.segments.map((s) => [
          s.timestamp,
          poiSynonymGroupsForPrompt(s.locationHints ?? []),
        ]),
      ),
    ),
    "Requirements:",
    "- Keep all timestamps from the draft exactly unchanged.",
    "- Summary must be one Traditional Chinese sentence within 40 Chinese characters.",
    "- Segment text should be concise, specific, useful for travel planning, and within 60 Chinese characters.",
    "- Each segment title must read as a full headline (complete noun phrase or official-style venue name), never a clipped transcript fragment or oral filler.",
    "- Prefer map-ready strings: full POI / night market / restaurant names as spoken or as official signage (good for geocoding). Ban vague-only labels: 夜市、老街、小吃、附近、這裡、周邊、當地 作為唯一名稱.",
    "- Food must be named concretely when known; otherwise drop the food clause instead of guessing.",
    "- Segment text should explain what the stop is, why it is worth visiting, and itinerary relevance (meal slot, walking cluster, transit hub).",
    "- Avoid repeating the same place label or synonymous variants (e.g. 熊本站、熊本車站、JR熊本站) within one segment; single mention only.",
    "- CLOSED-VOCAB: Use `closed_vocab_synonym_groups_by_timestamp[timestamp]` — each inner array is ONE POI; across that segment's title and text, mention at most ONE string from each inner array.",
    "- Keep only real attractions, restaurants, food spots, stalls, landmarks, markets, parks, stations, cafes, districts, or photo spots in extractedLocations and locationHints.",
    "- Final extractedLocations must contain canonical place names only.",
    "- Never output transcript fragments as place names.",
    "- Never output routing phrases as place names.",
    "- Remove prefixes like 從, 到, 前往, 直達, 可直達, 距離, 位在, 靠近, 走路去 before deciding the place name.",
    "- Collapse equivalent station names into one canonical name.",
    "- If a candidate is a city, country, generic region, or only a food dish without a named shop, reject it.",
    "- If unsure, omit the place instead of guessing.",
    "- Remove broad destinations and category phrases such as 嘉義, 嘉義市, 嘉義美食, 台南景點, 高雄旅遊, 台灣, 日本, 大阪, 東京.",
    "- Do not add locations that are not already in the draft.",
  ].join("\n");
}

export function buildLocationFilteringPrompt(input: {
  title: string;
  destination?: string;
  summary: string;
  segmentTexts: string[];
  transcriptChunks: string[];
  candidateLocations: string[];
}): string {
  return [
    "You filter travel-video location candidates.",
    "All explanatory text and place descriptions must be written only in Traditional Chinese. Keep exact proper-noun place names when needed.",
    "Keep only specific real POIs: attractions, shops, restaurants, stalls, cafes, stations, markets, temples, parks, museums, neighborhoods, named food streets, or landmarks.",
    "Final extractedLocations must contain canonical place names only.",
    "Never output transcript fragments as place names.",
    "Never output routing phrases as place names.",
    "Remove prefixes like 從, 到, 前往, 直達, 可直達, 距離, 位在, 靠近, 走路去 before deciding the place name.",
    "Collapse equivalent station names into one canonical name.",
    "If a candidate is a city, country, generic region, or only a food dish without a named shop, reject it.",
    "If unsure, omit the place instead of guessing.",
    "Reject generic phrases, entire countries, vague areas, city/county-only names, destination-only names, and non-place concepts.",
    "Reject these broad examples unless part of a longer concrete POI name: 台灣, 北部, 中部, 南部, 東部, 嘉義, 嘉義市, 嘉義縣, 台北, 台北市, 新北, 桃園, 台中, 台南, 高雄, 日本, 韓國, 大阪, 東京, 嘉義美食, 台南景點, 高雄旅遊.",
    "Use transcript chunks, summary text, and key-moment text together.",
    "Return valid JSON only.",
    'Use this exact shape: { "acceptedLocations": string[], "rejectedLocations": string[] }',
    `Video title: ${input.title}`,
    `Destination hint: ${input.destination || "unknown"}`,
    `Summary: ${input.summary || "none"}`,
    `Key moments: ${input.segmentTexts.join(" | ") || "none"}`,
    `Transcript chunks: ${input.transcriptChunks.join(" | ") || "none"}`,
    `Candidate locations: ${input.candidateLocations.join(" | ") || "none"}`,
  ].join("\n");
}

export function buildVideoMomentPolishingPrompt(input: {
  title: string;
  destination?: string;
  language?: "traditional-chinese" | "english";
  moments: Array<{
    id: string;
    timestamp: string;
    startSeconds: number;
    endSeconds: number;
    title: string;
    text: string;
    summary?: string;
    locationHints: string[];
    foods?: string[];
    confidence?: number;
  }>;
}): string {
  const isZh = (input.language || "traditional-chinese") === "traditional-chinese";
  return [
    "You are a moment text polisher for travel videos.",
    "Return valid JSON only.",
    'Output schema: { "moments": [{ "id": string, "timestamp": string, "startSeconds": number, "endSeconds": number, "title": string, "text": string, "summary": string, "locationHints": string[], "foods": string[] }] }',
    `Video title: ${input.title}`,
    `Destination hint: ${input.destination || "unknown"}`,
    `Output language: ${isZh ? "Traditional Chinese" : "English"}`,
    "Rules:",
    "- Preserve id, timestamp, startSeconds, endSeconds exactly.",
    "- Preserve locationHints and foods; do not add new POIs.",
    "- Do not invent timestamps or places.",
    "- Do not dump transcript lines.",
    "- Final extractedLocations and visible place names must contain canonical place names only.",
    "- Never output transcript fragments or routing phrases as place names.",
    "- Remove prefixes like 從, 到, 前往, 直達, 可直達, 距離, 位在, 靠近, 走路去 before deciding the place name.",
    "- Collapse equivalent station names into one canonical name.",
    "- If a candidate is a city, country, generic region, or only a food dish without a named shop, reject it.",
    "- If unsure, omit the place instead of guessing.",
    "- Title must be a complete, publication-ready headline (full venue or dish name when known), not a transcript fragment or oral filler.",
    "- Expand titles and summaries to use fully qualified names when hints already contain them (e.g. merge 夜市 into 嘉義文化路夜市 if hints justify it); never output standalone vague words (夜市、老街、小吃 alone) as the title.",
    "- Summary (and text when used) must say what is featured, why travelers care, and how it fits a day plan; mention concrete dishes only when tied to a named POI or dish in hints/foods.",
    "- Never repeat the same POI string or synonymous variants (X站 vs X車站 vs X駅 vs JR+X站) inside summary/title/text for one moment; use one wording once—after that use 該站／該景點 or omit since locationHints already carry the map-ready name.",
    "- CLOSED-VOCAB RULE: Consult `closed_vocab_synonym_groups_by_id[momentId]`. Each inner array lists literal strings that denote ONE geographic entity. Across that moment's title + summary + text combined, mention at most ONE string from each inner array (pick one spelling and stick to it). Do not cycle synonyms.",
    "- If `closed_vocab_synonym_groups_by_id` maps your moment id to empty arrays, still avoid synonymous duplicates using common sense (站／車站／駅).",
    "- If the transcript only gives an unclear nickname, keep a short literal label plus 「（待查證）」 rather than inventing a formal business name.",
    isZh
      ? "- Title 長度盡量 22 字內，text/summary 80 字內。"
      : "- Keep title reasonably short, and text/summary concise.",
    "closed_vocab_synonym_groups_by_id (derived only from each moment's locationHints; same grouping as server-side dedupe):",
    JSON.stringify(
      Object.fromEntries(
        input.moments.map((m) => [
          m.id,
          poiSynonymGroupsForPrompt(m.locationHints ?? []),
        ]),
      ),
    ),
    "Input moments:",
    JSON.stringify(input.moments),
  ].join("\n");
}

export function buildSummaryPrompt(input: {
  url?: string;
  title?: string;
  destination?: string;
}): string {
  return [
    "Summarize a travel video from metadata only.",
    "Reply only in Traditional Chinese. Do not use Simplified Chinese.",
    `URL: ${input.url || "unknown"}`,
    `Title: ${input.title || "unknown"}`,
    `Destination hint: ${input.destination || "unknown"}`,
    "Return a concise summary and notable segments.",
  ].join("\n");
}

export function buildRecommendationPrompt(input: {
  destination?: string;
  keyword?: string;
  videos: VideoRecommendation[];
}): string {
  return [
    "Rank the candidate travel videos for the user intent.",
    "All user-facing string values must be written only in Traditional Chinese. Do not use Simplified Chinese.",
    `Destination: ${input.destination || "unknown"}`,
    `Keyword: ${input.keyword || "unknown"}`,
    `Candidates: ${input.videos.map((video) => video.title).join(" | ")}`,
  ].join("\n");
}
