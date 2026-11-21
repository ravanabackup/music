"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MonitorSpeaker, Smartphone, Radio } from "lucide-react";
import { ShareSessionHeader } from "@/components/ShareSessionHeader";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { ScrobbleHistoryPanel } from "@/components/ScrobbleHistoryPanel";
import { MobileBroadcasterPanel } from "@/components/MobileBroadcasterPanel";
import { DevOpsAndBridgeDrawer } from "@/components/DevOpsAndBridgeDrawer";
import type {
  PlaybackState,
  PresenceSummary,
  RemoteActionType,
  RemoteCommandItem,
  ScrobbleItem,
  WebRTCSignalMessage,
} from "@/lib/types";

interface PulseCastWorkspaceProps {
  initialSessionId?: string;
  isDedicatedLiveRoute?: boolean;
}

const DEFAULT_PLAYBACK_STATE = (sessionId: string): PlaybackState => {
  const now = new Date().toISOString();
  return {
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
  };
};

export function PulseCastWorkspace({
  initialSessionId,
  isDedicatedLiveRoute = false,
}: PulseCastWorkspaceProps) {
  const [sessionId, setSessionId] = useState<string>(
    initialSessionId || "pulse-live-studio"
  );
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() =>
    DEFAULT_PLAYBACK_STATE(initialSessionId || "pulse-live-studio")
  );
  const [scrobbles, setScrobbles] = useState<ScrobbleItem[]>([]);
  const [recentCommands, setRecentCommands] = useState<RemoteCommandItem[]>([]);
  const [incomingCommand, setIncomingCommand] =
    useState<RemoteCommandItem | null>(null);
  const [latestWebrtcSignal, setLatestWebrtcSignal] =
    useState<WebRTCSignalMessage | null>(null);
  const [presence, setPresence] = useState<PresenceSummary>({
    viewers: 1,
    broadcasters: 0,
    totalConnections: 1,
  });
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState(14);
  const [lastCommandFeedback, setLastCommandFeedback] = useState<string | null>(
    null
  );
  const [showBroadcasterInLiveRoute, setShowBroadcasterInLiveRoute] =
    useState(!isDedicatedLiveRoute);

  const bcRef = useRef<BroadcastChannel | null>(null);

  // Restore or initialize unique persistent session ID on root or /live/<id> SPA fallback
  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
      return;
    }
    if (typeof window !== "undefined") {
      const liveMatch = window.location.pathname.match(/\/live\/([a-zA-Z0-9_-]+)/);
      if (liveMatch?.[1]) {
        const cleanedLive = liveMatch[1].toLowerCase().slice(0, 64);
        setSessionId(cleanedLive);
        return;
      }
      const urlSession = new URLSearchParams(window.location.search).get(
        "session"
      );
      if (urlSession) {
        const cleaned = urlSession
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 64);
        if (cleaned) {
          setSessionId(cleaned);
          localStorage.setItem("pulsecast_session_id", cleaned);
          return;
        }
      }
      const saved = localStorage.getItem("pulsecast_session_id");
      if (saved) {
        setSessionId(saved);
      } else {
        const generated = `pulse-${Math.random().toString(36).slice(2, 8)}`;
        localStorage.setItem("pulsecast_session_id", generated);
        setSessionId(generated);
      }
    }
  }, [initialSessionId]);

  const handleSessionChange = (nextId: string) => {
    const cleaned = nextId
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 64);
    if (!cleaned) return;
    if (typeof window !== "undefined") {
      localStorage.setItem("pulsecast_session_id", cleaned);
      if (isDedicatedLiveRoute) {
        window.history.pushState({}, "", `/live/${cleaned}`);
      }
    }
    setSessionId(cleaned);
  };

  // Update browser tab title dynamically with live Now Playing track
  useEffect(() => {
    if (typeof document !== "undefined") {
      const prefix = playbackState.isPlaying ? "▶ " : "";
      document.title = `${prefix}${playbackState.title} — ${playbackState.artist} | PulseCast`;
    }
  }, [playbackState.title, playbackState.artist, playbackState.isPlaying]);

  // Hydrate initial session snapshot + open real-time SSE stream
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const hydrate = async () => {
      const t0 = performance.now();
      try {
        const resp = await fetch(
          `/api/session?session=${encodeURIComponent(sessionId)}`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        const rtt = Math.max(4, Math.round(performance.now() - t0));
        if (cancelled) return;
        setLatencyMs(rtt);
        if (data.state) setPlaybackState(data.state);
        if (Array.isArray(data.scrobbles)) setScrobbles(data.scrobbles);
        if (Array.isArray(data.recentCommands))
          setRecentCommands(data.recentCommands);
        if (data.presence) setPresence(data.presence);
      } catch {
        // Offline / static fallback
      }
    };

    void hydrate();

    // Open SSE stream
    const es = new EventSource(
      `/api/stream?session=${encodeURIComponent(sessionId)}&role=viewer`
    );

    es.onopen = () => {
      if (!cancelled) setConnected(true);
    };

    es.onerror = () => {
      if (!cancelled) setConnected(false);
    };

    es.addEventListener("state", (evt) => {
      try {
        const nextState = JSON.parse((evt as MessageEvent).data) as PlaybackState;
        setPlaybackState(nextState);
        setConnected(true);
      } catch {}
    });

    es.addEventListener("scrobble", (evt) => {
      try {
        const item = JSON.parse((evt as MessageEvent).data) as ScrobbleItem;
        setScrobbles((prev) => {
          if (prev.some((s) => s.id === item.id)) return prev;
          return [item, ...prev].slice(0, 100);
        });
      } catch {}
    });

    es.addEventListener("command", (evt) => {
      try {
        const cmd = JSON.parse((evt as MessageEvent).data) as RemoteCommandItem;
        setIncomingCommand(cmd);
        setRecentCommands((prev) => {
          if (prev.some((c) => c.id === cmd.id)) return prev;
          return [cmd, ...prev].slice(0, 15);
        });
      } catch {}
    });

    es.addEventListener("webrtc", (evt) => {
      try {
        const sig = JSON.parse(
          (evt as MessageEvent).data
        ) as WebRTCSignalMessage;
        setLatestWebrtcSignal(sig);
      } catch {}
    });

    es.addEventListener("presence", (evt) => {
      try {
        const p = JSON.parse((evt as MessageEvent).data) as PresenceSummary;
        setPresence(p);
      } catch {}
    });

    // Local BroadcastChannel fallback for static GitHub Pages same-device tabs
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(`pulsecast-${sessionId}`);
      bcRef.current = bc;
      bc.onmessage = (e) => {
        if (e.data?.type === "state") setPlaybackState(e.data.payload);
        if (e.data?.type === "command") setIncomingCommand(e.data.payload);
      };
    }

    return () => {
      cancelled = true;
      es.close();
      bcRef.current?.close();
    };
  }, [sessionId]);

  const handleSendCommand = useCallback(
    async (
      command: RemoteActionType,
      options?: { seekPositionMs?: number; volume?: number }
    ) => {
      const t0 = performance.now();
      try {
        const resp = await fetch(
          `/api/command?session=${encodeURIComponent(sessionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              command,
              seekPositionMs: options?.seekPositionMs,
              volume: options?.volume,
            }),
          }
        );
        const rtt = Math.max(3, Math.round(performance.now() - t0));
        setLatencyMs(rtt);

        if (resp.ok) {
          const data = await resp.json();
          if (data.state) setPlaybackState(data.state);
          setLastCommandFeedback(
            `Sent ${command.toUpperCase()} → Phone (${rtt}ms)`
          );
        } else {
          throw new Error("API unreachable");
        }
      } catch {
        // Static mode fallback via BroadcastChannel
        const fallbackCmd: RemoteCommandItem = {
          id: Date.now(),
          sessionId,
          command,
          seekPositionMs: options?.seekPositionMs ?? null,
          volume: options?.volume ?? null,
          status: "delivered",
          source: "pc_viewer",
          createdAt: new Date().toISOString(),
        };
        setIncomingCommand(fallbackCmd);
        bcRef.current?.postMessage({ type: "command", payload: fallbackCmd });
        setLastCommandFeedback(`Dispatched ${command.toUpperCase()} locally`);
      }

      setTimeout(() => {
        setLastCommandFeedback((prev) => (prev ? null : prev));
      }, 2600);
    },
    [sessionId]
  );

  const handleClearHistory = useCallback(async () => {
    try {
      await fetch(`/api/scrobbles?session=${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      setScrobbles([]);
    } catch {
      setScrobbles([]);
    }
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-50">
      <ShareSessionHeader
        sessionId={sessionId}
        onChangeSession={handleSessionChange}
        connected={connected}
        latencyMs={latencyMs}
        presence={presence}
        isDedicatedLiveRoute={isDedicatedLiveRoute}
      />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Live Session Context Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs text-zinc-300">
            <MonitorSpeaker className="h-4 w-4 text-emerald-400" />
            <span>
              Viewing Live Session{" "}
              <strong className="font-mono text-emerald-400">
                {sessionId}
              </strong>{" "}
              — PC remote controls sync directly back to your phone&apos;s
              active media player.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowBroadcasterInLiveRoute((prev) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
          >
            {showBroadcasterInLiveRoute ? (
              <>
                <Radio className="h-3.5 w-3.5 text-emerald-400" />
                Focus PC Viewer Only
              </>
            ) : (
              <>
                <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                Open Mobile Broadcaster / Webhook Setup
              </>
            )}
          </button>
        </div>

        {/* Top Primary Grid: PC Viewer Now Playing + Last.fm Scrobble History */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <NowPlayingCard
              state={playbackState}
              onSendCommand={handleSendCommand}
              lastCommandFeedback={lastCommandFeedback}
              latestWebrtcSignal={latestWebrtcSignal}
            />
          </div>
          <div className="xl:col-span-5">
            <ScrobbleHistoryPanel
              sessionId={sessionId}
              scrobbles={scrobbles}
              onClearHistory={handleClearHistory}
            />
          </div>
        </div>

        {/* Dual-Mode Broadcaster Console (Pure Browser Audio + System-Wide Android Bridge) */}
        {showBroadcasterInLiveRoute && (
          <MobileBroadcasterPanel
            sessionId={sessionId}
            incomingCommand={incomingCommand}
            recentCommands={recentCommands}
            latestWebrtcSignal={latestWebrtcSignal}
          />
        )}

        {/* 2026 GitHub Actions CI/CD & Android Companion APK Source Inspector */}
        <DevOpsAndBridgeDrawer />
      </main>
    </div>
  );
}
