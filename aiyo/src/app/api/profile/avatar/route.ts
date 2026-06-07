import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const formData = await request.formData();
    const file = formData.get("avatar");

    if (!(file instanceof File)) {
      return NextResponse.json(createError("invalid_request", "請選擇要上傳的圖片。"), { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        createError("invalid_request", "僅支援 JPG、PNG 或 WebP 格式。"),
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        createError("invalid_request", "圖片大小需在 2MB 以內。"),
        { status: 400 },
      );
    }

    const ext = extensionForMime(file.type);
    const avatarsDir = path.join(process.cwd(), "public", "avatars");
    await mkdir(avatarsDir, { recursive: true });

    const filename = `${userId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(avatarsDir, filename), buffer);

    const imageUrl = `/avatars/${filename}?v=${Date.now()}`;
    await prisma.user.update({
      where: { id: userId },
      data: { image: imageUrl },
    });

    return NextResponse.json(createSuccess({ image: imageUrl }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "頭像上傳失敗，請稍後再試。"), { status: 500 });
  }
}
