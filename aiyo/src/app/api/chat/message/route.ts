import { POST as sharedPost } from "@/app/api/ai/chat/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return sharedPost(request);
}
