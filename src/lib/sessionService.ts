import { db } from "@/db";
import { ensurePulseSchema } from "@/db/ensureSchema";
import {
  sessions,
  scrobbles,
  remoteCommands,
  type SessionRow,
  type ScrobbleRow,
  type RemoteCommandRow,
} from "@/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import {
  realtimeHub,
  serializeSession,
  serializeScrobble,
  serializeCommand,
} from "@/lib/realtimeHub";
import type { BroadcastMode, RemoteActionType } from "@/lib/types";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Id",
};

export async function getOrCreateSession(
  sessionId: string
): Promise<SessionRow> {
  await ensurePulseSchema();

  const existing = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const now = new Date();
  const [created] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      mode: "android_bridge",
      title: "Neon Drift (Midnight Expressway)",
      artist: "Kuroshio & Analog Syndicate",
      album: "Late Night Telemetry Vol. IV",
      appName: "Spotify",
      isPlaying: false,
      positionMs: 38000,
      durationMs: 214000,
      artworkUrl: "/covers/neon-drift.jpg",
      volume: 85,
      webrtcActive: false,
      positionUpdatedAt: now,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) {
    // Seed 3 realistic initial scrobbles so the Last.fm history panel is immediately rich & export-ready
    const t1 = new Date(now.getTime() - 14 * 60 * 1000);
    const t2 = new Date(now.getTime() - 8 * 60 * 1000);
    const t3 = new Date(now.getTime() - 3 * 60 * 1000);
    await db.insert(scrobbles).values([
      {
        sessionId,
        title: "Orbital Bloom",
        artist: "Solstice Telemetry",
        album: "Prismatic Horizons",
        appName: "YouTube Music",
        durationMs: 246000,
        artworkUrl: "/covers/orbital-bloom.jpg",
        playedAt: t1,
      },
      {
        sessionId,
        title: "Velvet Echoes in Studio B",
        artist: "Miles & The Amber Quartet",
        album: "Tape Saturation Sessions",
        appName: "Poweramp",
        durationMs: 198000,
        artworkUrl: "/covers/velvet-echoes.jpg",
        playedAt: t2,
      },
      {
        sessionId,
        title: "Neon Drift (Midnight Expressway)",
        artist: "Kuroshio & Analog Syndicate",
        album: "Late Night Telemetry Vol. IV",
        appName: "Spotify",
        durationMs: 214000,
        artworkUrl: "/covers/neon-drift.jpg",
        playedAt: t3,
      },
    ]);
    return created;
  }

  const [fallback] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  return fallback;
}

export interface UpdateSessionInput {
  mode?: BroadcastMode;
  title?: string;
  artist?: string;
  album?: string;
  appName?: string;
  isPlaying?: boolean;
  positionMs?: number;
  durationMs?: number;
  artworkBase64OrUrl?: string;
  volume?: number;
  webrtcActive?: boolean;
}

export async function updateSessionPlayback(
  sessionId: string,
  input: UpdateSessionInput
): Promise<{
  session: SessionRow;
  newScrobble: ScrobbleRow | null;
  pendingCommands: RemoteCommandRow[];
}> {
  const current = await getOrCreateSession(sessionId);
  const now = new Date();

  const nextTitle =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim()
      : current.title;
  const nextArtist =
    typeof input.artist === "string" && input.artist.trim().length > 0
      ? input.artist.trim()
      : current.artist;
  const nextAlbum =
    typeof input.album === "string" ? input.album.trim() : current.album;
  const nextAppName =
    typeof input.appName === "string" && input.appName.trim().length > 0
      ? input.appName.trim()
      : current.appName;
  const nextIsPlaying =
    typeof input.isPlaying === "boolean" ? input.isPlaying : current.isPlaying;
  const nextDurationMs =
    typeof input.durationMs === "number" && Number.isFinite(input.durationMs)
      ? Math.max(0, Math.round(input.durationMs))
      : current.durationMs;
  const nextPositionMs =
    typeof input.positionMs === "number" && Number.isFinite(input.positionMs)
      ? Math.max(
          0,
          nextDurationMs > 0
            ? Math.min(Math.round(input.positionMs), nextDurationMs)
            : Math.round(input.positionMs)
        )
      : current.positionMs;
  const nextArtwork =
    typeof input.artworkBase64OrUrl === "string" &&
    input.artworkBase64OrUrl.trim().length > 0
      ? input.artworkBase64OrUrl.trim()
      : current.artworkUrl;
  const nextMode: BroadcastMode =
    input.mode === "browser_audio" || input.mode === "android_bridge"
      ? input.mode
      : (current.mode as BroadcastMode);
  const nextVolume =
    typeof input.volume === "number" && Number.isFinite(input.volume)
      ? Math.max(0, Math.min(100, Math.round(input.volume)))
      : current.volume;
  const nextWebrtcActive =
    typeof input.webrtcActive === "boolean"
      ? input.webrtcActive
      : current.webrtcActive;

  const [updated] = await db
    .update(sessions)
    .set({
      mode: nextMode,
      title: nextTitle,
      artist: nextArtist,
      album: nextAlbum,
      appName: nextAppName,
      isPlaying: nextIsPlaying,
      positionMs: nextPositionMs,
      durationMs: nextDurationMs,
      artworkUrl: nextArtwork,
      volume: nextVolume,
      webrtcActive: nextWebrtcActive,
      positionUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  // Check if we should record a new Last.fm-style scrobble
  let newScrobble: ScrobbleRow | null = null;
  const latestScrobble = await db
    .select()
    .from(scrobbles)
    .where(eq(scrobbles.sessionId, sessionId))
    .orderBy(desc(scrobbles.playedAt), desc(scrobbles.id))
    .limit(1);

  const trackChanged =
    latestScrobble.length === 0 ||
    latestScrobble[0].title.toLowerCase() !== nextTitle.toLowerCase() ||
    latestScrobble[0].artist.toLowerCase() !== nextArtist.toLowerCase();

  if (trackChanged && nextTitle.trim().length > 0) {
    const [inserted] = await db
      .insert(scrobbles)
      .values({
        sessionId,
        title: nextTitle,
        artist: nextArtist,
        album: nextAlbum,
        appName: nextAppName,
        durationMs: nextDurationMs,
        artworkUrl: nextArtwork,
        playedAt: now,
      })
      .returning();
    newScrobble = inserted ?? null;
  }

  // Broadcast live state & scrobble over real-time SSE hub
  realtimeHub.publish(sessionId, {
    event: "state",
    data: serializeSession(updated),
  });

  if (newScrobble) {
    realtimeHub.publish(sessionId, {
      event: "scrobble",
      data: serializeScrobble(newScrobble),
    });
  }

  // Fetch and deliver any pending remote commands for MacroDroid / Tasker / Companion APK
  const pending = await popPendingCommands(sessionId);

  return {
    session: updated,
    newScrobble,
    pendingCommands: pending,
  };
}

export async function popPendingCommands(
  sessionId: string
): Promise<RemoteCommandRow[]> {
  await ensurePulseSchema();
  const pending = await db
    .select()
    .from(remoteCommands)
    .where(
      and(
        eq(remoteCommands.sessionId, sessionId),
        eq(remoteCommands.status, "pending")
      )
    )
    .orderBy(remoteCommands.id)
    .limit(20);

  if (pending.length > 0) {
    const ids = pending.map((c) => c.id);
    await db
      .update(remoteCommands)
      .set({ status: "delivered" })
      .where(inArray(remoteCommands.id, ids));
  }

  return pending;
}

export async function enqueueRemoteCommand(
  sessionId: string,
  command: RemoteActionType,
  options?: {
    seekPositionMs?: number;
    volume?: number;
    source?: string;
  }
): Promise<{ commandRow: RemoteCommandRow; sessionRow: SessionRow }> {
  const current = await getOrCreateSession(sessionId);
  const now = new Date();

  const [cmdRow] = await db
    .insert(remoteCommands)
    .values({
      sessionId,
      command,
      seekPositionMs:
        typeof options?.seekPositionMs === "number"
          ? Math.max(0, Math.round(options.seekPositionMs))
          : null,
      volume:
        typeof options?.volume === "number"
          ? Math.max(0, Math.min(100, Math.round(options.volume)))
          : null,
      status: "pending",
      source: options?.source ?? "pc_viewer",
      createdAt: now,
    })
    .returning();

  // Compute interpolated position right now so pause/play/seek feel instantaneous on the PC viewer
  let interpolatedPos = current.positionMs;
  if (current.isPlaying) {
    const elapsed = Math.max(
      0,
      now.getTime() - current.positionUpdatedAt.getTime()
    );
    interpolatedPos =
      current.durationMs > 0
        ? Math.min(current.durationMs, current.positionMs + elapsed)
        : current.positionMs + elapsed;
  }

  let nextIsPlaying = current.isPlaying;
  let nextPositionMs = interpolatedPos;
  let nextVolume = current.volume;

  if (command === "play") {
    nextIsPlaying = true;
  } else if (command === "pause") {
    nextIsPlaying = false;
  } else if (command === "toggle") {
    nextIsPlaying = !current.isPlaying;
  } else if (command === "seek" && typeof options?.seekPositionMs === "number") {
    nextPositionMs = Math.max(
      0,
      current.durationMs > 0
        ? Math.min(Math.round(options.seekPositionMs), current.durationMs)
        : Math.round(options.seekPositionMs)
    );
  } else if (command === "volume" && typeof options?.volume === "number") {
    nextVolume = Math.max(0, Math.min(100, Math.round(options.volume)));
  }

  const [updatedSession] = await db
    .update(sessions)
    .set({
      isPlaying: nextIsPlaying,
      positionMs: nextPositionMs,
      volume: nextVolume,
      positionUpdatedAt: now,
      updatedAt: now,
    })
    .where(eq(sessions.id, sessionId))
    .returning();

  realtimeHub.publish(sessionId, {
    event: "command",
    data: serializeCommand(cmdRow),
  });

  realtimeHub.publish(sessionId, {
    event: "state",
    data: serializeSession(updatedSession),
  });

  return { commandRow: cmdRow, sessionRow: updatedSession };
}

export async function getSessionScrobbles(
  sessionId: string,
  limit = 100
): Promise<ScrobbleRow[]> {
  await ensurePulseSchema();
  return db
    .select()
    .from(scrobbles)
    .where(eq(scrobbles.sessionId, sessionId))
    .orderBy(desc(scrobbles.playedAt), desc(scrobbles.id))
    .limit(limit);
}

export async function getRecentCommands(
  sessionId: string,
  limit = 15
): Promise<RemoteCommandRow[]> {
  await ensurePulseSchema();
  return db
    .select()
    .from(remoteCommands)
    .where(eq(remoteCommands.sessionId, sessionId))
    .orderBy(desc(remoteCommands.id))
    .limit(limit);
}
