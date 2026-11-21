import { NextRequest } from "next/server";
import {
  corsHeaders,
  getOrCreateSession,
  popPendingCommands,
  updateSessionPlayback,
} from "@/lib/sessionService";
import {
  sanitizeSessionId,
  serializeCommand,
  serializeScrobble,
  serializeSession,
} from "@/lib/realtimeHub";
import type { BroadcastMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function parseBool(val: unknown): boolean | undefined {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const lower = val.trim().toLowerCase();
    if (["true", "1", "playing", "yes", "on"].includes(lower)) return true;
    if (["false", "0", "paused", "stopped", "no", "off"].includes(lower))
      return false;
  }
  return undefined;
}

function parseNum(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawSession =
      req.nextUrl.searchParams.get("session") ??
      req.headers.get("x-session-id") ??
      body.session ??
      body.sessionId;
    const sessionId = sanitizeSessionId(rawSession);

    const artworkBase64OrUrl =
      body.artworkBase64OrUrl ??
      body.artworkUrl ??
      body.artworkBase64 ??
      body.artwork;

    const mode: BroadcastMode | undefined =
      body.mode === "browser_audio" || body.mode === "android_bridge"
        ? body.mode
        : undefined;

    const { session, newScrobble, pendingCommands } =
      await updateSessionPlayback(sessionId, {
        mode,
        title: typeof body.title === "string" ? body.title : undefined,
        artist: typeof body.artist === "string" ? body.artist : undefined,
        album: typeof body.album === "string" ? body.album : undefined,
        appName:
          typeof body.appName === "string"
            ? body.appName
            : typeof body.packageName === "string"
              ? body.packageName
              : undefined,
        isPlaying: parseBool(body.isPlaying ?? body.playing),
        positionMs: parseNum(body.positionMs ?? body.position),
        durationMs: parseNum(body.durationMs ?? body.duration),
        artworkBase64OrUrl:
          typeof artworkBase64OrUrl === "string"
            ? artworkBase64OrUrl
            : undefined,
        volume: parseNum(body.volume),
        webrtcActive: parseBool(body.webrtcActive),
      });

    return Response.json(
      {
        ok: true,
        sessionId,
        state: serializeSession(session),
        scrobble: newScrobble ? serializeScrobble(newScrobble) : null,
        commands: pendingCommands.map(serializeCommand),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("POST /api/update failed:", err);
    return Response.json(
      { ok: false, error: "Failed to process media update" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sessionId = sanitizeSessionId(
      sp.get("session") ?? req.headers.get("x-session-id")
    );

    // Support 1-line GET webhook updates from MacroDroid / Tasker if metadata query params are supplied
    const hasMetadataParams =
      sp.has("title") ||
      sp.has("artist") ||
      sp.has("isPlaying") ||
      sp.has("positionMs");

    if (hasMetadataParams) {
      const { session, newScrobble, pendingCommands } =
        await updateSessionPlayback(sessionId, {
          title: sp.get("title") ?? undefined,
          artist: sp.get("artist") ?? undefined,
          album: sp.get("album") ?? undefined,
          appName: sp.get("appName") ?? undefined,
          isPlaying: parseBool(sp.get("isPlaying")),
          positionMs: parseNum(sp.get("positionMs")),
          durationMs: parseNum(sp.get("durationMs")),
          artworkBase64OrUrl: sp.get("artworkBase64OrUrl") ?? undefined,
        });

      return Response.json(
        {
          ok: true,
          sessionId,
          state: serializeSession(session),
          scrobble: newScrobble ? serializeScrobble(newScrobble) : null,
          commands: pendingCommands.map(serializeCommand),
        },
        { headers: corsHeaders }
      );
    }

    const session = await getOrCreateSession(sessionId);
    const shouldPop = sp.get("pollCommands") === "true";
    const pending = shouldPop ? await popPendingCommands(sessionId) : [];

    return Response.json(
      {
        ok: true,
        sessionId,
        state: serializeSession(session),
        commands: pending.map(serializeCommand),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("GET /api/update failed:", err);
    return Response.json(
      { ok: false, error: "Failed to read session update" },
      { status: 500, headers: corsHeaders }
    );
  }
}
