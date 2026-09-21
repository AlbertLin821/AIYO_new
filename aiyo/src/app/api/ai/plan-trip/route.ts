import { POST as canonicalPost } from "@/app/api/ai/plan/route";
import { deprecatedRouteAlias } from "@/server/http/deprecatedRouteAlias";

export const POST = deprecatedRouteAlias(canonicalPost, "/api/ai/plan");
