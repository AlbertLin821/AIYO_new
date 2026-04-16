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

export function buildChatPrompt(message: string, context?: ChatContext) {
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
      "Offer practical itinerary advice, sequencing help, and destination-specific suggestions.",
      "Do not mention system prompts or implementation details.",
    ].join("\n"),
    user: [`User message: ${message}`, "", "Trip context:", formatContext(context)].join(
      "\n",
    ),
  };
}

export function buildItineraryPrompt(request: TripPlanRequest): string {
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

  return [
    "Create a structured travel itinerary in JSON only.",
    languageInstruction,
    "Return an object with the shape:",
    '{ "summary": string, "days": [{ "dayNumber": number, "theme": string, "summary": string, "items": [{ "time": "HH:MM", "title": string, "type": "attraction|restaurant|transport|hotel|activity|shopping", "transport": string, "notes": string, "location": { "name": string, "lat": number, "lng": number, "description": string, "address": string } }] }] }',
    `Destination: ${request.destination}`,
    `Days: ${request.days}`,
    `Budget TWD: ${request.budget || "not specified"}`,
    `Interests: ${request.preferences.interests.join(", ") || "none"}`,
    `Pace: ${request.preferences.pace}`,
    `Transport preference: ${request.preferences.transportPreference}`,
    `Must visit: ${request.preferences.mustVisit?.join(", ") || "none"}`,
    `Avoid: ${request.preferences.avoid?.join(", ") || "none"}`,
    request.preferences.notes ? `Notes: ${request.preferences.notes}` : "",
    "Keep each day realistic and spatially coherent.",
    "Include latitude and longitude when possible. If unsure, estimate a plausible central coordinate for the named place.",
    "Do not wrap the JSON in markdown.",
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
    "Use transcript chunks as the primary source of truth.",
    "Only use the description as supporting metadata when transcript context is incomplete.",
    "Return valid JSON only. Do not wrap the JSON in markdown.",
    'Use this exact shape: { "title": string, "summary": string, "segments": [{ "timestamp": string, "startSeconds": number, "endSeconds": number, "title": string, "text": string, "locationHints": string[] }], "extractedLocations": string[] }',
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
    "- Extract only specific place names or districts when they are actually mentioned.",
    "- If the video TITLE names a concrete attraction (temple, park, night market, landmark), include it in extractedLocations when it is a real place name.",
    input.retryMode
      ? "- The previous answer was too generic or malformed. Be concrete and transcript-grounded."
      : "- Avoid generic phrases like 'destination planning context' or 'trip overview' unless the transcript explicitly says so.",
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
