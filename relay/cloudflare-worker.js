/**
 * PulseCast Lightweight Edge Sync Relay (Cloudflare Worker + Durable Object)
 * Supports WebSockets (/ws?session=<id>) + REST (/api/update, /api/session, /api/command, /api/stream)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-Id",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const sessionId =
      (url.searchParams.get("session") || "pulse-demo-live")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") || "pulse-demo-live";

    const id = env.PULSE_SESSIONS.idFromName(sessionId);
    const stub = env.PULSE_SESSIONS.get(id);
    return stub.fetch(request);
  },
};

export class PulseSessionRoom {
  constructor(state) {
    this.state = state;
    this.sockets = new Set();
    this.playback = null;
    this.scrobbles = [];
    this.pendingCommands = [];
  }

  broadcast(event, data) {
    const msg = JSON.stringify({ event, data });
    for (const ws of this.sockets) {
      try {
        ws.send(msg);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("session") || "pulse-demo-live";

    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.add(server);
      if (this.playback) {
        server.send(JSON.stringify({ event: "state", data: this.playback }));
      }
      server.addEventListener("message", (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          if (parsed.type === "command") {
            this.pendingCommands.push(parsed.data);
            this.broadcast("command", parsed.data);
          } else if (parsed.type === "webrtc") {
            this.broadcast("webrtc", parsed.data);
          }
        } catch {}
      });
      server.addEventListener("close", () => this.sockets.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/api/update" && request.method === "POST") {
      const body = await request.json();
      const now = new Date().toISOString();
      this.playback = {
        sessionId,
        mode: body.mode || "android_bridge",
        title: body.title || "Untitled Track",
        artist: body.artist || "Unknown Artist",
        album: body.album || "",
        appName: body.appName || "Android Media",
        isPlaying: Boolean(body.isPlaying),
        positionMs: Number(body.positionMs || 0),
        durationMs: Number(body.durationMs || 0),
        artworkBase64OrUrl: body.artworkBase64OrUrl || "",
        volume: Number(body.volume ?? 85),
        webrtcActive: Boolean(body.webrtcActive),
        positionUpdatedAt: now,
        updatedAt: now,
        serverNow: now,
      };
      const last = this.scrobbles[0];
      if (!last || last.title !== this.playback.title || last.artist !== this.playback.artist) {
        const scrobble = {
          id: Date.now(),
          sessionId,
          title: this.playback.title,
          artist: this.playback.artist,
          album: this.playback.album,
          appName: this.playback.appName,
          durationMs: this.playback.durationMs,
          artworkUrl: this.playback.artworkBase64OrUrl,
          playedAt: now,
        };
        this.scrobbles.unshift(scrobble);
        this.scrobbles = this.scrobbles.slice(0, 100);
        this.broadcast("scrobble", scrobble);
      }
      this.broadcast("state", this.playback);
      const commands = this.pendingCommands.splice(0, 20);
      return Response.json(
        { ok: true, state: this.playback, commands },
        { headers: CORS_HEADERS }
      );
    }

    if (url.pathname === "/api/command" && request.method === "POST") {
      const body = await request.json();
      const cmd = {
        id: Date.now(),
        sessionId,
        command: body.command,
        seekPositionMs: body.seekPositionMs ?? null,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      this.pendingCommands.push(cmd);
      this.broadcast("command", cmd);
      return Response.json({ ok: true, command: cmd }, { headers: CORS_HEADERS });
    }

    return Response.json(
      {
        ok: true,
        sessionId,
        state: this.playback,
        scrobbles: this.scrobbles,
      },
      { headers: CORS_HEADERS }
    );
  }
}
