import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createError, createSuccess } from "@/lib/api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    const name = body.name?.trim() || null;
    const email = normalizeEmail(body.email ?? "");
    const password = body.password ?? "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        createError("invalid_request", "請輸入有效的電子郵件。"),
        { status: 400 },
      );
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        createError("invalid_request", "密碼至少需要 8 個字元。"),
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        createError("email_exists", "此電子郵件已被註冊。請直接登入。"),
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        profile: {
          create: {
            budget: null,
            destination: null,
            preferences: {
              interests: [],
              preferredTransport: "",
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    return NextResponse.json(createSuccess(user), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        createError("email_exists", "此電子郵件已被註冊。請直接登入。"),
        { status: 409 },
      );
    }

    return NextResponse.json(
      createError("internal_error", "註冊失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}

