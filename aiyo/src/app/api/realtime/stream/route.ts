import { createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { cleanupStalePresence, getBootstrapPayload } from "@/server/data/appStateService";
import { getRoomTripRevision } from "@/server/realtime/revisionEnvelope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  try {
    const { userId } = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId") || undefined;
    const roomTrip = roomId ? await getRoomTripRevision(userId, roomId) : null;

    let tickHandle: ReturnType<typeof setTimeout> | null = null;
    let lifetimeHandle: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let lastSnapshotKey: string | null = null;
    let lastRevision: number | null = null;
    let tickCount = 0;
    let pumpInFlight = false;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          if (closed) {
            return;
          }
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
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
          if (tickHandle !== null) {
            clearTimeout(tickHandle);
            tickHandle = null;
          }
          if (lifetimeHandle !== null) {
            clearTimeout(lifetimeHandle);
            lifetimeHandle = null;
          }
          try {
            controller.close();
          } catch {
            /* already closed or errored */
          }
        };

        const pump = async () => {
          if (closed || pumpInFlight) {
            return;
          }
          pumpInFlight = true;
          try {
            tickCount += 1;
            if (roomId && tickCount > 1) {
              const current = await getRoomTripRevision(userId, roomId);
              const revisionChanged = lastRevision !== current.revision;
              if (revisionChanged) {
                lastRevision = current.revision;
                send("revision", current);
              }
              if (tickCount % 4 !== 0) {
                if (!revisionChanged) send("ping", { ok: true });
                return;
              }
            }
            const snapshot = await getBootstrapPayload(userId);
            if (roomTrip && snapshot.trip?.tripId !== roomTrip.tripId) {
              send("ping", { ok: true });
              return;
            }
            if (roomId) {
              await cleanupStalePresence(roomId);
            }
            const snapshotPayload = createSuccess(snapshot);
            if (snapshot.trip) lastRevision = snapshot.trip.revision ?? 0;
            const nextKey = JSON.stringify(snapshotPayload.data);
            if (nextKey !== lastSnapshotKey) {
              lastSnapshotKey = nextKey;
              send("snapshot", snapshotPayload);
              return;
            }
            send("ping", { ok: true });
          } catch (err) {
            const message = err instanceof Error ? err.message : "unknown_error";
            if (["missing_user", "unauthorized", "forbidden", "not_found"].includes(message)) {
              send("error", {
                ok: false,
                code: message,
              });
              closeStream();
              return;
            }
            console.error("[realtime/stream] pump failed:", message);
            // 保持連線並送出一則可恢復的訊息，避免未處理拒絕直接撕毀 chunked 回應
            send("tick_failed", {
              ok: false,
              retry: true,
            });
          } finally {
            pumpInFlight = false;
          }
        };

        const scheduleNextTick = () => {
          if (closed) {
            return;
          }
          tickHandle = setTimeout(() => {
            tickHandle = null;
            void (async () => {
              await pump();
              scheduleNextTick();
            })();
          }, 2500);
        };

        request.signal.addEventListener("abort", closeStream);
        lifetimeHandle = setTimeout(closeStream, 5 * 60_000);

        send("connected", { ok: true });
        await pump();
        scheduleNextTick();
      },
      cancel() {
        closed = true;
        if (tickHandle !== null) {
          clearTimeout(tickHandle);
          tickHandle = null;
        }
        if (lifetimeHandle !== null) {
          clearTimeout(lifetimeHandle);
          lifetimeHandle = null;
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const code = error instanceof Error && error.message === "forbidden" ? "forbidden" : "unauthorized";
    return new Response(`event: error\ndata: {"message":"${code}"}\n\n`, {
      status: code === "forbidden" ? 403 : 401,
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  }
}
