import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError } from "@/server/ai/ollamaClient";
import { StructuredOutputError } from "@/server/ai/responseParser";
import { requireSessionUser } from "@/server/auth";
import { ensureCurrentTrip, saveTripPayload } from "@/server/data/appStateService";
import { generateTripPlan } from "@/server/services/travelPlannerService";
import { buildPinsFromTripPlan } from "@/services/mapSync";
import type { TravelPreferences, TripPlanRequest } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePreferences(input: Partial<TravelPreferences> | undefined): TravelPreferences {
  return {
    interests: input?.interests || [],
    pace: input?.pace || "moderate",
    transportPreference: input?.transportPreference || "Train",
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

export async function POST(request: Request) {
  try {
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
          transportPreference: body.transportPreference || "Train",
          pace: "moderate",
          notes: body.transcript,
        },
      ),
      itineraryDraft: body.itineraryDraft,
    };

    const result = await generateTripPlan(tripRequest);

    try {
      const { userId } = await requireSessionUser();
      const currentTrip = await ensureCurrentTrip(userId);
      await saveTripPayload(userId, {
        tripId: currentTrip.id,
        title: `${destination} 行程`,
        destination,
        days,
        budget,
        itinerary: result.days,
        pins: buildPinsFromTripPlan(result.days),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Planner remains functional even if the user is not authenticated.
    }

    return NextResponse.json(createSuccess(result));
  } catch (error) {
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
