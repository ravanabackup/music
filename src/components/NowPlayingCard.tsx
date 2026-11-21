"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Disc3,
  Smartphone,
  Globe,
  Headphones,
  RotateCcw,
  RotateCw,
  Activity,
} from "lucide-react";
import type {
  PlaybackState,
  RemoteActionType,
  WebRTCSignalMessage,
} from "@/lib/types";
import { formatDuration } from "@/lib/demoTracks";

interface NowPlayingCardProps {
  state: PlaybackState;
  onSendCommand: (
    command: RemoteActionType,
    options?: { seekPositionMs?: number; volume?: number }
  ) => Promise<void>;
  lastCommandFeedback: string | null;
  latestWebrtcSignal: WebRTCSignalMessage | null;
}

function getAppBadgeStyle(appName: string): string {
  const lower = appName.toLowerCase();
  if (lower.includes("spotify")) {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }
  if (lower.includes("youtube")) {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (lower.includes("apple")) {
    return "border-pink-500/40 bg-pink-500/15 text-pink-300";
  }
  if (lower.includes("poweramp") || lower.includes("tidal")) {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  return "border-indigo-500/40 bg-indigo-500/15 text-indigo-300";
}

export function NowPlayingCard({
  state,
  onSendCommand,
  lastCommandFeedback,
  latestWebrtcSignal,
}: NowPlayingCardProps) {
  const [livePositionMs, setLivePositionMs] = useState<number>(
    state.positionMs
  );
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragValueMs, setDragValueMs] = useState(0);
  const [localVolume, setLocalVolume] = useState(state.volume ?? 85);

  // WebRTC Live Audio Listener state
  const [listeningWebrtc, setListeningWebrtc] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState<string>("Idle");
  const [spectrumBars, setSpectrumBars] = useState<number[]>(
    Array(20).fill(12)
  );
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const viewerIdRef = useRef<string>(
    `viewer-${Math.random().toString(36).slice(2, 9)}`
  );

  // Compute server clock offset to keep interpolated playback accurate across devices
  const clockOffsetRef = useRef<number>(0);
  useEffect(() => {
    if (state.serverNow) {
      clockOffsetRef.current =
        new Date(state.serverNow).getTime() - Date.now();
    }
    setLivePositionMs(state.positionMs);
    setLocalVolume(state.volume ?? 85);
  }, [state]);

  // Smooth 100ms live progress interpolation
  useEffect(() => {
    if (!state.isPlaying) {
      setLivePositionMs(state.positionMs);
      return;
    }

    const updatedAtMs = new Date(state.positionUpdatedAt).getTime();
    const tick = () => {
      const approxServerNow = Date.now() + clockOffsetRef.current;
      const elapsed = Math.max(0, approxServerNow - updatedAtMs);
      const nextPos =
        state.durationMs > 0
          ? Math.min(state.durationMs, state.positionMs + elapsed)
          : state.positionMs + elapsed;
      setLivePositionMs(nextPos);
    };

    tick();
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [
    state.isPlaying,
    state.positionMs,
    state.durationMs,
    state.positionUpdatedAt,
  ]);

  // Subtle animated visualizer bars (driven by WebAudio Analyser when WebRTC stream is active, or cadence pulse when playing)
  useEffect(() => {
    if (!state.isPlaying && !listeningWebrtc) {
      setSpectrumBars(Array(20).fill(10));
      return;
    }
    const interval = setInterval(() => {
      setSpectrumBars((prev) =>
        prev.map((_, idx) => {
          const wave =
            Math.sin(Date.now() / 180 + idx * 0.65) * 28 +
            Math.cos(Date.now() / 110 - idx * 0.4) * 20;
          return Math.max(12, Math.min(96, Math.round(48 + wave)));
        })
      );
    }, 90);
    return () => clearInterval(interval);
  }, [state.isPlaying, listeningWebrtc]);

  // Handle incoming WebRTC signaling messages when PC Viewer is listening
  useEffect(() => {
    if (!listeningWebrtc || !latestWebrtcSignal) return;
    if (latestWebrtcSignal.senderId === viewerIdRef.current) return;

    const handleSignal = async () => {
      const pc = peerRef.current;
      if (!pc) return;

      if (latestWebrtcSignal.type === "offer" && latestWebrtcSignal.sdp) {
        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription(latestWebrtcSignal.sdp)
          );
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await fetch(`/api/webrtc?session=${encodeURIComponent(state.sessionId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "answer",
              sdp: pc.localDescription,
              senderId: viewerIdRef.current,
            }),
          });
          setWebrtcStatus("Connected Live Audio");
        } catch {
          setWebrtcStatus("Handshake retry...");
        }
      } else if (
        latestWebrtcSignal.type === "candidate" &&
        latestWebrtcSignal.candidate
      ) {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate(latestWebrtcSignal.candidate)
          );
        } catch {
          // ignore duplicate candidate
        }
      } else if (latestWebrtcSignal.type === "hangup") {
        setWebrtcStatus("Broadcaster stopped audio");
      }
    };

    void handleSignal();
  }, [latestWebrtcSignal, listeningWebrtc, state.sessionId]);

  const toggleWebrtcListen = async () => {
    if (listeningWebrtc) {
      peerRef.current?.close();
      peerRef.current = null;
      setListeningWebrtc(false);
      setWebrtcStatus("Idle");
      return;
    }

    setListeningWebrtc(true);
    setWebrtcStatus("Connecting to stream...");

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerRef.current = pc;

    pc.ontrack = (evt) => {
      if (remoteAudioRef.current && evt.streams[0]) {
        remoteAudioRef.current.srcObject = evt.streams[0];
        remoteAudioRef.current.play().catch(() => {});
        setWebrtcStatus("Live WebRTC Audio Active");
      }
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        fetch(`/api/webrtc?session=${encodeURIComponent(state.sessionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "candidate",
            candidate: evt.candidate.toJSON(),
            senderId: viewerIdRef.current,
          }),
        }).catch(() => {});
      }
    };

    // Check if an offer already exists or request a fresh offer from the broadcaster
    try {
      const resp = await fetch(
        `/api/webrtc?session=${encodeURIComponent(state.sessionId)}`
      );
      const data = await resp.json();
      if (data.offer) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await fetch(
          `/api/webrtc?session=${encodeURIComponent(state.sessionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "answer",
              sdp: pc.localDescription,
              senderId: viewerIdRef.current,
            }),
          }
        );
        setWebrtcStatus("Connected Live Audio");
      }

      // Also ask active broadcaster to send a fresh offer for this viewer
      await fetch(
        `/api/webrtc?session=${encodeURIComponent(state.sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "request-offer",
            senderId: viewerIdRef.current,
          }),
        }
      );
    } catch {
      setWebrtcStatus("Waiting for broadcaster...");
    }
  };

  const displayedPosMs = isDraggingSeek ? dragValueMs : livePositionMs;
  const safeDurationMs = Math.max(1, state.durationMs || 1);
  const progressPercent = Math.min(
    100,
    Math.max(0, (displayedPosMs / safeDurationMs) * 100)
  );

  const artworkSrc = state.artworkBase64OrUrl || "/covers/neon-drift.jpg";

  const handleRelativeSeek = (deltaMs: number) => {
    const nextPos = Math.max(
      0,
      Math.min(state.durationMs || 300000, displayedPosMs + deltaMs)
    );
    setLivePositionMs(nextPos);
    void onSendCommand("seek", { seekPositionMs: nextPos });
  };

  return (
    <section className="relative overflow-hidden rounded-3xl border border-zinc-800/90 bg-[#121216]/95 p-6 shadow-2xl sm:p-8">
      {/* Dynamic Blurred Album Artwork Backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-12 z-0 opacity-30 blur-3xl transition-all duration-700"
        style={{
          backgroundImage: `url("${artworkSrc}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-[#09090B]/70 via-[#121216]/85 to-[#09090B]/95"
      />

      <div className="relative z-10">
        {/* Top Metadata Telemetry Row */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            {/* Source App Pill Badge */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${getAppBadgeStyle(
                state.appName
              )}`}
            >
              <Disc3
                className={`h-3.5 w-3.5 ${
                  state.isPlaying ? "animate-spin" : ""
                }`}
              />
              {state.appName}
            </span>

            {/* Mode Badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/80 px-3 py-1 text-xs font-medium text-zinc-300">
              {state.mode === "browser_audio" ? (
                <>
                  <Globe className="h-3.5 w-3.5 text-indigo-400" />
                  Pure Browser Mode
                </>
              ) : (
                <>
                  <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
                  Android System Bridge
                </>
              )}
            </span>

            {/* Play State Pill */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase ${
                state.isPlaying
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  state.isPlaying
                    ? "animate-pulse bg-emerald-400"
                    : "bg-amber-400"
                }`}
              />
              {state.isPlaying ? "NOW PLAYING" : "PAUSED"}
            </span>
          </div>

          {lastCommandFeedback && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
              {lastCommandFeedback}
            </div>
          )}
        </div>

        {/* Main Centerpiece Grid: Album Art + Track Details + Transport */}
        <div className="grid grid-cols-1 items-center gap-7 md:grid-cols-12">
          {/* Album Art Container */}
          <div className="md:col-span-5">
            <div className="group relative mx-auto aspect-square max-w-[290px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.65)]">
              <img
                src={artworkSrc}
                alt={`${state.title} — ${state.artist}`}
                className={`h-full w-full object-cover transition-transform duration-700 ${
                  state.isPlaying ? "scale-[1.02]" : "scale-100 opacity-90"
                }`}
              />

              {/* Subtle Bottom Spectrum Overlay */}
              <div className="absolute inset-x-0 bottom-0 flex h-14 items-end justify-center gap-1 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-3">
                {spectrumBars.map((heightPct, i) => (
                  <span
                    key={i}
                    style={{ height: `${Math.round((heightPct / 100) * 32)}px` }}
                    className={`w-1.5 rounded-full transition-all duration-100 ${
                      state.isPlaying
                        ? "bg-emerald-400/90"
                        : "bg-zinc-600/60"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Track Metadata + Scrubber + Remote Controls */}
          <div className="flex flex-col justify-between md:col-span-7">
            <div>
              <h1
                style={{ fontFamily: "var(--font-display), sans-serif" }}
                className="text-2xl leading-tight font-bold tracking-tight text-zinc-50 sm:text-3xl"
              >
                {state.title}
              </h1>
              <p className="mt-1.5 text-base font-medium text-zinc-300 sm:text-lg">
                {state.artist}
              </p>
              {state.album && (
                <p className="mt-1 text-sm text-zinc-400">{state.album}</p>
              )}
            </div>

            {/* Live Progress Bar & Seek Scrubber */}
            <div className="mt-7">
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-x-0 h-2 overflow-hidden rounded-full bg-zinc-800/90">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-100"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(1000, state.durationMs)}
                  value={Math.min(
                    Math.max(0, Math.round(displayedPosMs)),
                    Math.max(1000, state.durationMs)
                  )}
                  aria-label="Seek track playback position"
                  onMouseDown={() => {
                    setIsDraggingSeek(true);
                    setDragValueMs(livePositionMs);
                  }}
                  onTouchStart={() => {
                    setIsDraggingSeek(true);
                    setDragValueMs(livePositionMs);
                  }}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setIsDraggingSeek(true);
                    setDragValueMs(val);
                  }}
                  onMouseUp={(e) => {
                    const val = Number(
                      (e.target as HTMLInputElement).value
                    );
                    setIsDraggingSeek(false);
                    setLivePositionMs(val);
                    void onSendCommand("seek", { seekPositionMs: val });
                  }}
                  onTouchEnd={(e) => {
                    const val = Number(
                      (e.target as HTMLInputElement).value
                    );
                    setIsDraggingSeek(false);
                    setLivePositionMs(val);
                    void onSendCommand("seek", { seekPositionMs: val });
                  }}
                  className="pulse-slider relative z-10 h-5 w-full"
                />
              </div>

              <div className="mt-1.5 flex items-center justify-between font-mono text-xs tabular-nums text-zinc-400">
                <span className="text-zinc-200">
                  {formatDuration(displayedPosMs)}
                </span>
                <span>{formatDuration(state.durationMs)}</span>
              </div>
            </div>

            {/* Remote Playback Transport Buttons */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 sm:gap-3.5">
                <button
                  type="button"
                  onClick={() => void onSendCommand("previous")}
                  title="Remote Previous Track"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700/80 bg-zinc-900/90 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-95"
                >
                  <SkipBack className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleRelativeSeek(-10000)}
                  title="Seek -10s"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void onSendCommand(state.isPlaying ? "pause" : "play")
                  }
                  title={state.isPlaying ? "Remote Pause" : "Remote Play"}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500 text-zinc-950 shadow-[0_0_28px_rgba(16,185,129,0.45)] transition hover:bg-emerald-400 active:scale-95"
                >
                  {state.isPlaying ? (
                    <Pause className="h-6 w-6 fill-current" />
                  ) : (
                    <Play className="ml-0.5 h-6 w-6 fill-current" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleRelativeSeek(10000)}
                  title="Seek +10s"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100 active:scale-95"
                >
                  <RotateCw className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => void onSendCommand("next")}
                  title="Remote Next Track"
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-700/80 bg-zinc-900/90 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-95"
                >
                  <SkipForward className="h-5 w-5" />
                </button>
              </div>

              {/* Remote Volume Control */}
              <div className="flex items-center gap-2 rounded-xl border border-zinc-800/90 bg-zinc-950/70 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextV = localVolume > 0 ? 0 : 80;
                    setLocalVolume(nextV);
                    void onSendCommand("volume", { volume: nextV });
                  }}
                  className="text-zinc-400 hover:text-zinc-100"
                  title="Mute / Unmute Remote Volume"
                >
                  {localVolume === 0 ? (
                    <VolumeX className="h-4 w-4 text-rose-400" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-emerald-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={localVolume}
                  aria-label="Remote volume"
                  onChange={(e) => setLocalVolume(Number(e.target.value))}
                  onMouseUp={() =>
                    void onSendCommand("volume", { volume: localVolume })
                  }
                  onTouchEnd={() =>
                    void onSendCommand("volume", { volume: localVolume })
                  }
                  className="pulse-slider w-20"
                />
                <span className="w-7 text-right font-mono text-[11px] text-zinc-400">
                  {localVolume}%
                </span>
              </div>
            </div>

            {/* WebRTC Live Audio Stream Receiver Bar */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800/90 bg-zinc-950/80 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                    state.webrtcActive || listeningWebrtc
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-zinc-900 text-zinc-400"
                  }`}
                >
                  <Headphones className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                    <span>WebRTC Live Audio Stream</span>
                    {state.webrtcActive && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 font-mono text-[10px] text-indigo-300">
                        <Activity className="h-3 w-3" /> ON AIR
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    {listeningWebrtc
                      ? webrtcStatus
                      : state.webrtcActive
                        ? "Mobile browser is broadcasting live WebRTC audio — click Tune In!"
                        : "Optional zero-lag WebRTC audio monitor when Pure Browser Mode broadcasts audio"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void toggleWebrtcListen()}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  listeningWebrtc
                    ? "border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                    : "border border-indigo-500/40 bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30"
                }`}
              >
                {listeningWebrtc ? "Disconnect Audio" : "Tune In (WebRTC)"}
              </button>
              <audio ref={remoteAudioRef} className="hidden" autoPlay playsInline />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
