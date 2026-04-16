import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { ensureProfile, updateProfile } from "@/server/data/appStateService";
import type { User } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const user = await ensureProfile(userId);
    return NextResponse.json(
      createSuccess({
        name: user.name || user.email.split("@")[0],
        email: user.email,
        travelPreferences: ((user.profile?.preferences as { interests?: string[] } | null)?.interests || []),
        budget: user.profile?.budget || 0,
        destination: user.profile?.destination?.trim() || "",
        travelDays: 3,
        preferredTransport: ((user.profile?.preferences as { preferredTransport?: string } | null)?.preferredTransport || "Train"),
        travelPace: ((user.profile?.preferences as { pace?: User["travelPace"] } | null)?.pace || "moderate"),
        interests: ((user.profile?.preferences as { interests?: string[] } | null)?.interests || []),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to load profile."), { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as Partial<User>;
    const profile = await updateProfile(userId, body);
    return NextResponse.json(createSuccess(profile));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to update profile."), { status: 500 });
  }
}
