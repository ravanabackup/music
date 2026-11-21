import { NextRequest } from "next/server";
import {
  corsHeaders,
  enqueueRemoteCommand,
  popPendingCommands,
} from "@/lib/sessionService";
import {
  sanitizeSessionId,
  serializeCommand,
  serializeSession,
} from "@/lib/realtimeHub";
import type { RemoteActionType } from "@/lib/types";

export const dynamic = "force-dynamic";

const ALLOWED_COMMANDS = new Set<RemoteActionType>([
  "play",
  "pause",
  "toggle",
  "next",
  "previous",
  "seek",
  "volume",
]);

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = sanitizeSessionId(
      req.nextUrl.searchParams.get("session") ??
        req.headers.get("x-session-id") ??
        body.session ??
        body.sessionId
    );

    const rawCmd = String(body.command ?? body.action ?? "")
      .trim()
      .toLowerCase() as RemoteActionType;

    if (!ALLOWED_COMMANDS.has(rawCmd)) {
      return Response.json(
        {
          ok: false,
          error: `Unsupported command '${rawCmd}'. Expected play, pause, toggle, next, previous, seek, or volume.`,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const seekPositionMs =
      typeof body.seekPositionMs === "number"
        ? body.seekPositionMs
        : typeof body.positionMs === "number"
          ? body.positionMs
          : undefined;

    const volume =
      typeof body.volume === "number" ? body.volume : undefined;

    const { commandRow, sessionRow } = await enqueueRemoteCommand(
      sessionId,
      rawCmd,
      {
        seekPositionMs,
        volume,
        source:
          typeof body.source === "string" ? body.source : "pc_remote_ui",
      }
    );

    return Response.json(
      {
        ok: true,
        command: serializeCommand(commandRow),
        state: serializeSession(sessionRow),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("POST /api/command failed:", err);
    return Response.json(
      { ok: false, error: "Failed to dispatch remote command" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sessionId = sanitizeSessionId(
      req.nextUrl.searchParams.get("session") ??
        req.headers.get("x-session-id")
    );
    const pending = await popPendingCommands(sessionId);

    return Response.json(
      {
        ok: true,
        sessionId,
        commands: pending.map(serializeCommand),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("GET /api/command failed:", err);
    return Response.json(
      { ok: false, error: "Failed to poll commands" },
      { status: 500, headers: corsHeaders }
    );
  }
}
