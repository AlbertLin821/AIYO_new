import {
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
  const { sessionId } = await context.params;
  ensureChatProgressSession(sessionId);

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
}
