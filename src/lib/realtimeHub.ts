import { EventEmitter } from "events";
import type {
  PlaybackState,
  ScrobbleItem,
  RemoteCommandItem,
  StreamEventPayload,
  PresenceSummary,
  BroadcastMode,
  RemoteActionType,
} from "@/lib/types";
import type { SessionRow, ScrobbleRow, RemoteCommandRow } from "@/db/schema";

interface ClientRegistration {
  clientId: string;
  role: "viewer" | "broadcaster";
}

class PulseRealtimeHub {
  private emitter = new EventEmitter();
  private presence = new Map<string, Map<string, ClientRegistration>>();

  constructor() {
    this.emitter.setMaxListeners(500);
  }

  public subscribe(
    sessionId: string,
    clientId: string,
    role: "viewer" | "broadcaster",
    listener: (payload: StreamEventPayload) => void
  ): () => void {
    const channel = `session:${sessionId}`;
    let sessionClients = this.presence.get(sessionId);
    if (!sessionClients) {
      sessionClients = new Map();
      this.presence.set(sessionId, sessionClients);
    }
    sessionClients.set(clientId, { clientId, role });

    this.emitter.on(channel, listener);
    this.publishPresence(sessionId);

    return () => {
      this.emitter.off(channel, listener);
      const current = this.presence.get(sessionId);
      if (current) {
        current.delete(clientId);
        if (current.size === 0) {
          this.presence.delete(sessionId);
        }
      }
      this.publishPresence(sessionId);
    };
  }

  public publish(sessionId: string, payload: StreamEventPayload): void {
    this.emitter.emit(`session:${sessionId}`, payload);
  }

  public getPresence(sessionId: string): PresenceSummary {
    const sessionClients = this.presence.get(sessionId);
    if (!sessionClients) {
      return { viewers: 0, broadcasters: 0, totalConnections: 0 };
    }
    let viewers = 0;
    let broadcasters = 0;
    for (const c of sessionClients.values()) {
      if (c.role === "broadcaster") broadcasters++;
      else viewers++;
    }
    return {
      viewers,
      broadcasters,
      totalConnections: viewers + broadcasters,
    };
  }

  private publishPresence(sessionId: string): void {
    this.publish(sessionId, {
      event: "presence",
      data: this.getPresence(sessionId),
    });
  }
}

const globalForHub = globalThis as typeof globalThis & {
  __pulseRealtimeHub?: PulseRealtimeHub;
};

export const realtimeHub =
  globalForHub.__pulseRealtimeHub ?? new PulseRealtimeHub();

if (process.env.NODE_ENV !== "production") {
  globalForHub.__pulseRealtimeHub = realtimeHub;
}

export function serializeSession(row: SessionRow): PlaybackState {
  return {
    sessionId: row.id,
    mode: (row.mode === "browser_audio"
      ? "browser_audio"
      : "android_bridge") as BroadcastMode,
    title: row.title,
    artist: row.artist,
    album: row.album,
    appName: row.appName,
    isPlaying: row.isPlaying,
    positionMs: row.positionMs,
    durationMs: row.durationMs,
    artworkBase64OrUrl: row.artworkUrl,
    volume: row.volume,
    webrtcActive: row.webrtcActive,
    positionUpdatedAt: row.positionUpdatedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    serverNow: new Date().toISOString(),
  };
}

export function serializeScrobble(row: ScrobbleRow): ScrobbleItem {
  return {
    id: row.id,
    sessionId: row.sessionId,
    title: row.title,
    artist: row.artist,
    album: row.album,
    appName: row.appName,
    durationMs: row.durationMs,
    artworkUrl: row.artworkUrl,
    playedAt: row.playedAt.toISOString(),
  };
}

export function serializeCommand(row: RemoteCommandRow): RemoteCommandItem {
  return {
    id: row.id,
    sessionId: row.sessionId,
    command: row.command as RemoteActionType,
    seekPositionMs: row.seekPositionMs ?? null,
    volume: row.volume ?? null,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

export function sanitizeSessionId(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 64);
  return cleaned || "pulse-demo-live";
}
