import { POST as canonicalPost } from "@/app/api/videos/summarize/route";
import { deprecatedRouteAlias } from "@/server/http/deprecatedRouteAlias";

export const POST = deprecatedRouteAlias(canonicalPost, "/api/videos/summarize");
