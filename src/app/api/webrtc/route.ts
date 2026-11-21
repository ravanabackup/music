import { NextRequest } from "next/server";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { corsHeaders, getOrCreateSession } from "@/lib/sessionService";
import {
  realtimeHub,
  sanitizeSessionId,
  serializeSession,
} from "@/lib/realtimeHub";
import type { WebRTCSignalMessage } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = sanitizeSessionId(
      req.nextUrl.searchParams.get("session") ?? body.session ?? body.sessionId
    );
    await getOrCreateSession(sessionId);

    const type = body.type as WebRTCSignalMessage["type"];
    const senderId = String(body.senderId ?? "peer");

    const message: WebRTCSignalMessage = {
      type,
      sdp: body.sdp,
      candidate: body.candidate,
      senderId,
      timestamp: new Date().toISOString(),
    };

    if (type === "offer") {
      const [updated] = await db
        .update(sessions)
        .set({
          webrtcActive: true,
          webrtcOffer: JSON.stringify(body.sdp ?? null),
          webrtcAnswer: null,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();
      if (updated) {
        realtimeHub.publish(sessionId, {
          event: "state",
          data: serializeSession(updated),
        });
      }
    } else if (type === "answer") {
      await db
        .update(sessions)
        .set({
          webrtcAnswer: JSON.stringify(body.sdp ?? null),
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId));
    } else if (type === "hangup") {
      const [updated] = await db
        .update(sessions)
        .set({
          webrtcActive: false,
          webrtcOffer: null,
          webrtcAnswer: null,
          webrtcCandidates: null,
          updatedAt: new Date(),
        })
        .where(eq(sessions.id, sessionId))
        .returning();
      if (updated) {
        realtimeHub.publish(sessionId, {
          event: "state",
          data: serializeSession(updated),
        });
      }
    }

    realtimeHub.publish(sessionId, {
      event: "webrtc",
      data: message,
    });

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error("POST /api/webrtc failed:", err);
    return Response.json(
      { ok: false, error: "WebRTC signaling error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = sanitizeSessionId(req.nextUrl.searchParams.get("session"));
    const sessionRow = await getOrCreateSession(sessionId);
    return Response.json(
      {
        ok: true,
        webrtcActive: sessionRow.webrtcActive,
        offer: sessionRow.webrtcOffer
          ? JSON.parse(sessionRow.webrtcOffer)
          : null,
        answer: sessionRow.webrtcAnswer
          ? JSON.parse(sessionRow.webrtcAnswer)
          : null,
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("GET /api/webrtc failed:", err);
    return Response.json(
      { ok: false, error: "Failed to read WebRTC signaling state" },
      { status: 500, headers: corsHeaders }
    );
  }
}
