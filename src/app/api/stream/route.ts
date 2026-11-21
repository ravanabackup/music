import { NextRequest } from "next/server";
import { corsHeaders, getOrCreateSession } from "@/lib/sessionService";
import {
  realtimeHub,
  sanitizeSessionId,
  serializeSession,
} from "@/lib/realtimeHub";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const sessionId = sanitizeSessionId(req.nextUrl.searchParams.get("session"));
  const roleParam = req.nextUrl.searchParams.get("role");
  const role: "viewer" | "broadcaster" =
    roleParam === "broadcaster" ? "broadcaster" : "viewer";
  const clientId = `${role}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

  const initialRow = await getOrCreateSession(sessionId);
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Stream already closed
        }
      };

      // Send initial state and presence immediately
      send("state", serializeSession(initialRow));

      const unsubscribe = realtimeHub.subscribe(
        sessionId,
        clientId,
        role,
        (payload) => {
          send(payload.event, payload.data);
        }
      );

      send("presence", realtimeHub.getPresence(sessionId));

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(`: ping ${new Date().toISOString()}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
        }
      }, 15000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };

      req.signal.addEventListener("abort", () => {
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
    cancel() {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
