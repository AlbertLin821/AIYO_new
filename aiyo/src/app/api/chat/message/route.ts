import { POST as sharedPost } from "@/app/api/ai/chat/route";
import { deprecatedRouteAlias } from "@/server/http/deprecatedRouteAlias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = deprecatedRouteAlias(sharedPost, "/api/ai/chat");
