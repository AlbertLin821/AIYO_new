import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 僅允許同站相對路徑，避免 callbackUrl 開放重導。
 */
function safeLoginCallbackUrl(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  if (!pathname.startsWith("/") || pathname.startsWith("//")) {
    return "/";
  }
  if (pathname === "/login") {
    return "/";
  }
  const combined = `${pathname}${search}`;
  if (combined.includes("://") || combined.includes("\\")) {
    return "/";
  }
  return combined;
}

/**
 * 僅首頁、登入等未列於 matcher 的路徑可匿名；matcher 內的路徑需有效 JWT。
 * 未登入導向 /login，callbackUrl 為使用者原本要前往的路徑（含 query），登入後可回到該頁。
 */
export default async function proxy(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (token) {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("callbackUrl", safeLoginCallbackUrl(request));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/itinerary",
    "/itinerary/:path*",
    "/chat",
    "/chat/:path*",
    "/profile",
    "/profile/:path*",
    "/map",
    "/map/:path*",
  ],
};
