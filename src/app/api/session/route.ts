import { NextRequest } from "next/server";
import {
  corsHeaders,
  getOrCreateSession,
  getRecentCommands,
  getSessionScrobbles,
} from "@/lib/sessionService";
import {
  realtimeHub,
  sanitizeSessionId,
  serializeCommand,
  serializeScrobble,
  serializeSession,
} from "@/lib/realtimeHub";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = sanitizeSessionId(
      req.nextUrl.searchParams.get("session") ??
        req.headers.get("x-session-id")
    );

    const [sessionRow, scrobbleRows, commandRows] = await Promise.all([
      getOrCreateSession(sessionId),
      getSessionScrobbles(sessionId, 100),
      getRecentCommands(sessionId, 12),
    ]);

    return Response.json(
      {
        ok: true,
        sessionId,
        state: serializeSession(sessionRow),
        scrobbles: scrobbleRows.map(serializeScrobble),
        recentCommands: commandRows.map(serializeCommand),
        presence: realtimeHub.getPresence(sessionId),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("GET /api/session failed:", err);
    return Response.json(
      { ok: false, error: "Failed to load session snapshot" },
      { status: 500, headers: corsHeaders }
    );
  }
}
