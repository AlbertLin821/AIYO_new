import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      ok: true,
      database: "ok",
    });
  } catch (error) {
    console.error("[health] Database check failed", error);

    return NextResponse.json(
      {
        ok: false,
        database: "error",
      },
      { status: 503 },
    );
  }
}
