import { NextResponse } from "next/server";
import { createError } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import {
  canAccessChatProgressSession,
  ensureChatProgressSession,
  isChatProgressDone,
  listChatProgressEvents,
  subscribeChatProgress,
} from "@/server/chat/chatProgressStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { sessionId } = await context.params;
    if (!canAccessChatProgressSession(sessionId, userId)) {
      return NextResponse.json(createError("forbidden", "無法訂閱此規劃進度。"), { status: 403 });
    }
    ensureChatProgressSession(sessionId, userId);

    const encoder = new TextEncoder();
    let handleAbort = () => {};
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let unsubscribe = () => {};
        handleAbort = () => {
          closeStream();
        };
        const closeWatcher = setInterval(() => {
          if (isChatProgressDone(sessionId)) {
            closeStream();
          }
        }, 250);

        const sendStep = (payload: unknown) => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(
              encoder.encode(`event: status_step\ndata: ${JSON.stringify(payload)}\n\n`),
            );
          } catch {
            closeStream();
          }
        };

        const closeStream = () => {
          if (closed) {
            return;
          }
          closed = true;
          clearInterval(closeWatcher);
          unsubscribe();
          request.signal.removeEventListener("abort", handleAbort);
          try {
            controller.close();
          } catch {
            /* stream already closed or cancelled */
          }
        };

        request.signal.addEventListener("abort", handleAbort);

        for (const step of listChatProgressEvents(sessionId)) {
          sendStep(step);
        }

        if (isChatProgressDone(sessionId)) {
          closeStream();
          return;
        }

        unsubscribe = subscribeChatProgress(sessionId, (step) => {
          sendStep(step);
          if (isChatProgressDone(sessionId) && step.status === "completed") {
            closeStream();
          }
        });
      },
      cancel() {
        handleAbort();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
  }
}
