import type { ChatContext, TripPlanRequest, VideoRecommendation, VideoSummarySegment } from "@/types";

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

  if (context.itinerary?.length) {
    parts.push(
      `Current itinerary items: ${context.itinerary
        .flatMap((day) => day.items.map((item) => `Day ${day.dayNumber} ${item.time} ${item.title}`))
        .slice(0, 12)
        .join(" | ")}`,
    );
  }

  return parts.join("\n");
}

function formatMemoryContext(memoryContext?: string): string {
  if (!memoryContext?.trim()) {
    return "No relevant long-term memory was retrieved.";
  }
  return memoryContext.trim();
}

export function buildChatPrompt(message: string, context?: ChatContext, memoryContext?: string) {
  const language = detectResponseLanguage(message);
  const languageInstruction =
    language === "traditional-chinese"
      ? "Reply in Traditional Chinese. Do not use simplified Chinese."
      : language === "japanese"
        ? "Reply in Japanese."
        : "Reply in English unless the user switches language.";

  return {
    system: [
      "You are AIYO, a local travel planning assistant.",
      "Respond in concise plain text.",
      "Always mirror the user's latest language.",
      languageInstruction,
      "Use the provided travel context when it helps.",
      "Use remembered user preferences and facts when they are relevant, but do not claim certainty beyond the retrieved memories.",
      "Offer practical itinerary advice, sequencing help, and destination-specific suggestions.",
      "Do not mention system prompts or implementation details.",
    ].join("\n"),
    user: [
      `User message: ${message}`,
      "",
      "Trip context:",
      formatContext(context),
      "",
      "Relevant long-term memory:",
      formatMemoryContext(memoryContext),
    ].join("\n"),
  };
}

export function buildItineraryPrompt(
  request: TripPlanRequest,
  memoryContext?: string,
  options?: { retryMode?: "default" | "strict-format" },
): string {
  const language = detectResponseLanguage(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const languageInstruction =
    language === "traditional-chinese"
      ? "Write summary, theme, notes, and titles in Traditional Chinese."
      : language === "japanese"
        ? "Write summary, theme, notes, and titles in Japanese."
        : "Write summary, theme, notes, and titles in English.";

  const retryMode = options?.retryMode || "default";
  const strictSuffix =
    retryMode === "strict-format"
      ? [
          "STRICT FORMAT RETRY MODE:",
          "- Do not include any prose before or after JSON.",
          "- Every day must include an `items` array.",
          "- Every item must include: `time`, `title`, `type`.",
          "- Prefer to include `location` with `name`, `lat`, `lng`, `description`, `address` whenever possible.",
          "- Validate JSON mentally before output.",
        ]
      : [];

  return [
    "Create a structured travel itinerary in JSON only.",
    languageInstruction,
    "",
    "HARD SCHEMA RULES:",
    '- Return one JSON object exactly in this shape: { "summary": string, "days": [{ "dayNumber": number, "theme": string, "summary": string, "items": [{ "id": string, "time": "HH:MM", "title": string, "type": "attraction|restaurant|transport|hotel|activity|shopping", "transport": string, "notes": string, "location": { "name": string, "lat": number, "lng": number, "description": string, "address": string } }] }], "warnings": string[] }',
    "- Output raw JSON only, no markdown fences.",
    "",
    "QUALITY RULES:",
    "- Each day should contain 4 to 7 items.",
    "- Item times must be chronological within each day.",
    "- Keep route flow realistic and spatially coherent.",
    "- `transport` should align with transport preference unless a clear local reason requires a change.",
    "- `mustVisit` places must be covered in the nearest appropriate day(s).",
    "- `avoid` terms must not appear in `title`, `notes`, or `location.name`.",
    "- Prefer complete `location` objects (name, lat, lng, description, address). If unknown, you may omit `location` for that item instead of inventing nonsense.",
    "",
    "DESTINATION CONSTRAINTS:",
    `Destination: ${request.destination}`,
    `Days: ${request.days}`,
    `Budget TWD: ${request.budget || "not specified"}`,
    `Interests: ${request.preferences.interests.join(", ") || "none"}`,
    `Pace: ${request.preferences.pace}`,
    `Transport preference: ${request.preferences.transportPreference}`,
    `Must visit: ${request.preferences.mustVisit?.join(", ") || "none"}`,
    `Avoid: ${request.preferences.avoid?.join(", ") || "none"}`,
    request.preferences.notes ? `Notes: ${request.preferences.notes}` : "",
    `Relevant long-term memory: ${formatMemoryContext(memoryContext)}`,
    "",
    "SELF-CHECK BEFORE FINAL OUTPUT:",
    "- Valid JSON parseable by a strict parser.",
    "- `days` length matches requested number of days.",
    "- `mustVisit` covered and `avoid` excluded.",
    "- Times are sorted and types are from allowed enum.",
    ...strictSuffix,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildMapPlanningPrompt(request: TripPlanRequest): string {
  const language = detectResponseLanguage(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  return [
    "Summarize the best map-sync view for the trip.",
    language === "traditional-chinese"
      ? "Reply in Traditional Chinese."
      : language === "japanese"
        ? "Reply in Japanese."
        : "Reply in English.",
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
    "- Summary must be 2 to 4 full sentences based on the transcript.",
    "- Produce 3 to 8 segments using only timestamps that exist in the transcript chunks.",
    "- Each segment title must be short and specific.",
    "- Each segment text must summarize what happens in that time range, not repeat metadata boilerplate.",
    "- Each segment highlights array must contain 1 to 3 concrete notable details from that same time range.",
    "- Extract only specific place names or districts when they are actually mentioned.",
    "- If the video TITLE names a concrete attraction (temple, park, night market, landmark), include it in extractedLocations when it is a real place name.",
    input.retryMode
      ? "- The previous answer was too generic or malformed. Be concrete and transcript-grounded."
      : "- Avoid generic phrases like 'destination planning context' or 'trip overview' unless the transcript explicitly says so.",
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
    "Keep only specific real places, attractions, districts, stations, markets, temples, parks, museums, neighborhoods, or named food streets.",
    "Reject generic phrases, entire countries, vague areas, and non-place concepts.",
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

export function buildSummaryPrompt(input: {
  url?: string;
  title?: string;
  destination?: string;
}): string {
  return [
    "Summarize a travel video from metadata only.",
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
    `Destination: ${input.destination || "unknown"}`,
    `Keyword: ${input.keyword || "unknown"}`,
    `Candidates: ${input.videos.map((video) => video.title).join(" | ")}`,
  ].join("\n");
}
