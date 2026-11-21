#!/usr/bin/env node
/**
 * PulseCast Standalone Node.js 22 HTTP + SSE + Webhook Relay Server
 * Zero external dependencies — run with `node relay/node-ws-relay.mjs`
 */
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const sessions = new Map();

function getRoom(sessionId) {
  if (!sessions.has(sessionId)) {
    const now = new Date().toISOString();
    sessions.set(sessionId, {
      state: {
        sessionId,
        mode: "android_bridge",
        title: "Neon Drift (Midnight Expressway)",
        artist: "Kuroshio & Analog Syndicate",
        album: "Late Night Telemetry Vol. IV",
        appName: "Spotify",
        isPlaying: false,
        positionMs: 38000,
        durationMs: 214000,
        artworkBase64OrUrl: "/covers/neon-drift.jpg",
        volume: 85,
        webrtcActive: false,
        positionUpdatedAt: now,
        updatedAt: now,
        serverNow: now,
      },
      scrobbles: [],
      pendingCommands: [],
      clients: new Set(),
    });
  }
  return sessions.get(sessionId);
}

function broadcast(room, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of room.clients) {
    res.write(payload);
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const sessionId = (url.searchParams.get("session") || "pulse-demo-live")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
  const room = getRoom(sessionId);

  if (url.pathname === "/api/stream" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    room.clients.add(res);
    res.write(`event: state\ndata: ${JSON.stringify(room.state)}\n\n`);
    req.on("close", () => room.clients.delete(res));
    return;
  }

  const readBody = () =>
    new Promise((resolve) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch {
          resolve({});
        }
      });
    });

  if (url.pathname === "/api/update" && req.method === "POST") {
    const body = await readBody();
    const now = new Date().toISOString();
    room.state = {
      ...room.state,
      ...body,
      artworkBase64OrUrl:
        body.artworkBase64OrUrl || body.artworkUrl || room.state.artworkBase64OrUrl,
      positionUpdatedAt: now,
      updatedAt: now,
      serverNow: now,
    };
    const last = room.scrobbles[0];
    if (!last || last.title !== room.state.title || last.artist !== room.state.artist) {
      const scrobble = {
        id: Date.now(),
        sessionId,
        title: room.state.title,
        artist: room.state.artist,
        album: room.state.album,
        appName: room.state.appName,
        durationMs: room.state.durationMs,
        artworkUrl: room.state.artworkBase64OrUrl,
        playedAt: now,
      };
      room.scrobbles.unshift(scrobble);
      broadcast(room, "scrobble", scrobble);
    }
    broadcast(room, "state", room.state);
    const commands = room.pendingCommands.splice(0, 20);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, state: room.state, commands }));
    return;
  }

  if (url.pathname === "/api/command" && req.method === "POST") {
    const body = await readBody();
    const cmd = {
      id: Date.now(),
      sessionId,
      command: body.command,
      seekPositionMs: body.seekPositionMs ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    room.pendingCommands.push(cmd);
    broadcast(room, "command", cmd);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, command: cmd, state: room.state }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      ok: true,
      sessionId,
      state: room.state,
      scrobbles: room.scrobbles,
      presence: { viewers: room.clients.size, broadcasters: 1, totalConnections: room.clients.size },
    })
  );
});

server.listen(PORT, () => {
  console.log(`PulseCast Relay listening on http://0.0.0.0:${PORT}`);
});
