import { createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { cleanupStalePresence, getBootstrapPayload } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  try {
    const { userId } = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId") || undefined;

    let interval: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let lastSnapshotKey: string | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          if (closed) {
            return;
          }
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        };

        const closeStream = () => {
          if (closed) {
            return;
          }
          closed = true;
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
          controller.close();
        };

        const pump = async () => {
          if (closed) {
            return;
          }
          const snapshot = await getBootstrapPayload(userId);
          if (roomId) {
            await cleanupStalePresence(roomId);
          }
          const snapshotPayload = createSuccess(snapshot);
          const nextKey = JSON.stringify(snapshotPayload.data);
          if (nextKey !== lastSnapshotKey) {
            lastSnapshotKey = nextKey;
            send("snapshot", snapshotPayload);
            return;
          }
          send("ping", { ok: true });
        };

        request.signal.addEventListener("abort", closeStream);

        send("connected", { ok: true });
        await pump();
        interval = setInterval(() => {
          void pump();
        }, 2500);
      },
      cancel() {
        closed = true;
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return new Response("event: error\ndata: {\"message\":\"unauthorized\"}\n\n", {
      status: 401,
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  }
}
