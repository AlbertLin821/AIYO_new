import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * 僅首頁、登入等未列於 matcher 的路徑可匿名；matcher 內的路徑需有效 JWT。
 * 未登入導向 /login，且 callbackUrl 固定為 /，與「登入後先回首頁再顯示歡迎引導」一致。
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
  url.searchParams.set("callbackUrl", "/");
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
