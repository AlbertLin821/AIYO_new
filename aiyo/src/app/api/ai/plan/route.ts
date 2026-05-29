import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError, resolveModelForTask } from "@/server/ai/ollamaClient";
import { buildPersonalizedAIContext, type AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { addMemories, formatMemoryContext } from "@/server/memory/mem0Client";
import { retrieveRelevantMemoriesForUser } from "@/server/memory/memoryRetrieval";
import { StructuredOutputError } from "@/server/ai/responseParser";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveTripPayload } from "@/server/data/appStateService";
import { generateTripPlan } from "@/server/services/travelPlannerService";
import { updateTravelPreferencesFromSuggestion } from "@/server/personalization/personalizationService";
import { buildPinsFromTripPlan } from "@/services/mapSync";
import type { TravelPreferences, TripPlanRequest, TripPlanResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** 行程 JSON 會觸發網搜、Mem0 與一或多輪 Ollama；Vercel 等環境需足夠上限才能完成。 */
export const maxDuration = 300;

function normalizePreferences(input: Partial<TravelPreferences> | undefined): TravelPreferences {
  return {
    interests: input?.interests || [],
    pace: input?.pace || "moderate",
    transportPreference: input?.transportPreference || "Transit",
    budget: input?.budget,
    mustVisit: input?.mustVisit || [],
    avoid: input?.avoid || [],
    notes: input?.notes,
  };
}

/** 語音未帶入商店內「目的地」時，從逐字稿粗擷地點，避免再退回預設國外地名。 */
function inferDestinationFromTranscript(transcript: string): string {
  const t = transcript.trim();
  if (!t) {
    return "";
  }
  const tw =
    /(嘉義縣|嘉義市|嘉義|臺北市|台北市|臺北|台北|新北市|新北|桃園市|桃園|臺中市|台中市|臺中|台中|臺南市|台南市|臺南|台南|高雄市|高雄|屏東縣|屏東|宜蘭縣|宜蘭|花蓮縣|花蓮|臺東縣|台東縣|臺東|台東|澎湖縣|澎湖|金門縣|金門|連江縣|馬祖|墾丁|清境|日月潭|阿里山|九份)/;
  const hit = t.match(tw);
  if (hit?.[1]) {
    return hit[1];
  }
  const guided = t.match(/(?:想去|到|去|玩)([^，。\n\s]{2,10})/);
  return guided?.[1]?.trim() || "";
}

function ensurePlanHasEditableItems(plan: TripPlanResult, request: TripPlanRequest): TripPlanResult {
  if (plan.days.some((day) => day.items.length > 0)) {
    return plan;
  }

  const seeds = request.preferences.mustVisit?.length
    ? request.preferences.mustVisit
    : [request.destination];
  const dayCount = Math.max(1, request.days);
  const days =
    plan.days.length > 0
      ? plan.days
      : Array.from({ length: dayCount }, (_, index) => ({
          dayNumber: index + 1,
          theme: `Day ${index + 1}`,
          summary: "",
          items: [],
        }));

  return {
    ...plan,
    days: days.map((day, index) => {
      const title = seeds[index % seeds.length] || request.destination;
      return {
        ...day,
        dayNumber: day.dayNumber || index + 1,
        theme: day.theme || `Day ${day.dayNumber || index + 1}`,
        summary: day.summary || `${request.destination} 行程安排`,
        items: [
          {
            id: `fallback_${day.dayNumber || index + 1}_1`,
            dayNumber: day.dayNumber || index + 1,
            time: index === 0 ? "09:30" : "10:00",
            title,
            type: "attraction",
            notes: "AI 回傳的活動清單為空，已依照你的必訪清單建立可編輯項目。",
            source: "ai",
          },
        ],
      };
    }),
  };
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as Partial<TripPlanRequest> & {
      transcript?: string;
      interests?: string[];
      transportPreference?: string;
    };

    const transcript = body.transcript?.trim();
    const destination =
      body.destination?.trim() ||
      (transcript ? inferDestinationFromTranscript(transcript) : "");
    if (!destination) {
      return NextResponse.json(
        createError("invalid_request", "請提供目的地，或在語音／備註中說明要去的地點。"),
        { status: 400 },
      );
    }
    const days = Math.max(1, Math.min(Number(body.days) || 3, 10));
    const budget = body.budget ? Number(body.budget) : undefined;

    const tripRequest: TripPlanRequest = {
      destination,
      days,
      budget,
      preferences: normalizePreferences(
        body.preferences || {
          interests: body.interests || [],
          transportPreference: body.transportPreference || "Transit",
          pace: "moderate",
          notes: body.transcript,
        },
      ),
      itineraryDraft: body.itineraryDraft,
    };
    const mustVisit = tripRequest.preferences.mustVisit || [];
    const avoid = tripRequest.preferences.avoid || [];

    const { memories } = await retrieveRelevantMemoriesForUser({
      userId,
      query: [
        destination,
        tripRequest.preferences.interests.join(" "),
        mustVisit.join(" "),
        avoid.join(" "),
        tripRequest.preferences.notes || "",
      ]
        .filter(Boolean)
        .join(" "),
    });
    let personalizedContext: AIContextBuildResult | null = null;
    try {
      personalizedContext = await buildPersonalizedAIContext({
        userId,
        currentUserInput: transcript || destination,
        tripRequest,
      });
    } catch {
      personalizedContext = null;
    }

    await updateTravelPreferencesFromSuggestion(userId, {
      destination,
      budget,
      days,
      travelStyle: tripRequest.preferences.interests,
      transportPreference: tripRequest.preferences.transportPreference,
      mustVisit,
      avoid,
      notes: tripRequest.preferences.notes,
    });

    const generated = await generateTripPlan(
      tripRequest,
      [
        formatMemoryContext(memories) ? `[Mem0 長期記憶]\n${formatMemoryContext(memories)}` : "",
        personalizedContext?.text ? `[AIYO 個人化資料]\n${personalizedContext.text}` : "",
      ].filter(Boolean).join("\n\n") || undefined,
    );
    const result = ensurePlanHasEditableItems(generated.plan, tripRequest);

    const existingTrip = await resolveSessionTrip(userId);
    const savedTrip = await saveTripPayload(userId, {
      tripId: existingTrip?.id ?? "",
      title: `${destination} 行程`,
      destination,
      days,
      budget,
      itinerary: result.days,
      pins: buildPinsFromTripPlan(result.days),
      updatedAt: new Date().toISOString(),
    });

    const tripPlanModel = resolveModelForTask("trip-plan");

    try {
      await addMemories({
        userId,
        messages: [
          {
            role: "user",
            content: [
              `I want a trip plan for ${destination}.`,
              `Days: ${days}.`,
              budget ? `Budget TWD: ${budget}.` : "",
              `Interests: ${tripRequest.preferences.interests.join(", ") || "none"}.`,
              `Transport preference: ${tripRequest.preferences.transportPreference}.`,
              `Must visit: ${mustVisit.join(", ") || "none"}.`,
              `Avoid: ${avoid.join(", ") || "none"}.`,
              tripRequest.preferences.notes ? `Notes: ${tripRequest.preferences.notes}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          },
          {
            role: "assistant",
            content: `Created a ${days}-day ${destination} itinerary with summary: ${result.summary}`,
          },
        ],
        metadata: {
          source: "aiyo-trip-plan",
          destination,
          days,
          tripId: savedTrip.tripId,
        },
      });
    } catch {
      // Memory persistence should not block trip planning.
    }

    return NextResponse.json(
      createSuccess(result, {
        tripPlanModel,
        task: "trip-plan",
        planGenerationMode: generated.diagnostics.planGenerationMode,
        parseMode: generated.diagnostics.parseMode,
        retryCount: generated.diagnostics.retryCount,
        ...(process.env.NODE_ENV !== "production" && personalizedContext
          ? { aiContextDebug: personalizedContext.debug }
          : {}),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(
        createError("unauthorized", "Authentication required."),
        { status: 401 },
      );
    }
    if (error instanceof OllamaRequestError) {
      return NextResponse.json(
        createError("ollama_error", `Ollama 連線或模型回應失敗：${error.message}`, error.details),
        { status: 502 },
      );
    }
    if (error instanceof StructuredOutputError) {
      return NextResponse.json(
        createError("model_output_invalid", "模型回傳格式錯誤，這次沒有建立假行程，請再試一次。"),
        { status: 502 },
      );
    }
    return NextResponse.json(
      createError("internal_error", "無法產生行程規劃，請稍後再試。"),
      { status: 500 },
    );
  }
}
