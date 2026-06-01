import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { buildPersonalizedAIContext } from "@/server/ai/aiContextBuilder";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveTripPayload } from "@/server/data/appStateService";
import {
  getTravelPreferenceSuggestion,
  toTripPlanPreferences,
  updateTravelPreferencesFromSuggestion,
  type TravelPreferenceSuggestion,
} from "@/server/personalization/personalizationService";
import { generateTripPlan } from "@/server/services/travelPlannerService";
import { buildPinsFromTripPlan } from "@/services/mapSync";
import type { TripPlanRequest } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as {
      preferences?: TravelPreferenceSuggestion["preferences"];
      savePreferences?: boolean;
    };
    const previous = await getTravelPreferenceSuggestion(userId);
    const existingTrip = await resolveSessionTrip(userId);
    const preferences = {
      ...previous.preferences,
      ...(body.preferences || {}),
    };
    const destination = preferences.destination?.trim();
    if (!destination) {
      return NextResponse.json(createError("invalid_request", "缺少可套用的目的地。"), { status: 400 });
    }
    const days = Math.max(1, Math.min(Number(preferences.days) || 3, 10));
    const tripRequest: TripPlanRequest = {
      destination,
      days,
      budget: preferences.budget,
      preferences: toTripPlanPreferences({
        ...previous,
        preferences,
      }),
    };

    if (body.savePreferences !== false) {
      await updateTravelPreferencesFromSuggestion(userId, preferences);
    }

    const personalizedContext = await buildPersonalizedAIContext({
      userId,
      currentUserInput: `套用偏好產生 ${destination} ${days} 天行程`,
      tripRequest,
      tripId: existingTrip?.id,
    });

    const generated = await generateTripPlan(
      tripRequest,
      [
        "使用者已選擇套用先前偏好。",
        `偏好來源：${previous.source.join(", ") || "user_profile"}`,
        personalizedContext.promptContextText,
        preferences.notes || "",
      ].filter(Boolean).join("\n"),
    );
    const saved = await saveTripPayload(userId, {
      tripId: existingTrip?.id ?? "",
      title: `${destination} 行程`,
      destination,
      days,
      budget: preferences.budget,
      itinerary: generated.plan.days,
      pins: buildPinsFromTripPlan(generated.plan.days),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json(
      createSuccess({
        tripId: saved.tripId,
        plan: generated.plan,
        appliedPreferences: preferences,
        preferenceSources: previous.source,
        aiContextDebug: process.env.NODE_ENV !== "production" ? personalizedContext.debug : undefined,
        diagnostics: generated.diagnostics,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "無法套用先前偏好產生行程。"), { status: 500 });
  }
}
