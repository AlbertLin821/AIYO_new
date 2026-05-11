import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { ensureProfile, toUserProfile, updateProfile } from "@/server/data/appStateService";
import type { User } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const user = await ensureProfile(userId);
    const profile = toUserProfile({
      name: user.name,
      email: user.email,
      preferences: user.profile?.preferences,
      budget: user.profile?.budget,
      destination: user.profile?.destination,
    });
    return NextResponse.json(createSuccess(profile));
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
    const body = (await request.json()) as Partial<User> & { welcomeCompleted?: boolean };
    const profile = await updateProfile(userId, body);
    return NextResponse.json(createSuccess(profile));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to update profile."), { status: 500 });
  }
}
