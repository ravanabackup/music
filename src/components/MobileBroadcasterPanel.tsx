"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Smartphone,
  Globe,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Upload,
  Radio,
  Copy,
  Check,
  Send,
  Download,
  Terminal,
  Sparkles,
  Wifi,
  ScreenShare,
} from "lucide-react";
import {
  ANDROID_WEBHOOK_PRESETS,
  STUDIO_DEMO_TRACKS,
  formatDuration,
  getSynthesizedTrackAudioUrl,
  type DemoTrack,
} from "@/lib/demoTracks";
import {
  generateCurlSnippet,
  generateMacroDroidMacroJson,
} from "@/lib/projectBlueprints";
import type {
  RemoteCommandItem,
  WebRTCSignalMessage,
} from "@/lib/types";

interface BrowserPlaylistItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  durationMs: number;
  customAudioUrl?: string;
  synthSpec?: DemoTrack;
}

interface MobileBroadcasterPanelProps {
  sessionId: string;
  incomingCommand: RemoteCommandItem | null;
  recentCommands: RemoteCommandItem[];
  latestWebrtcSignal: WebRTCSignalMessage | null;
}

export function MobileBroadcasterPanel({
  sessionId,
  incomingCommand,
  recentCommands,
  latestWebrtcSignal,
}: MobileBroadcasterPanelProps) {
  const [activeSubMode, setActiveSubMode] = useState<
    "browser_audio" | "android_bridge"
  >("browser_audio");
  const [origin, setOrigin] = useState("https://pulsecast.live");
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Pure Browser Audio state
  const [playlist, setPlaylist] = useState<BrowserPlaylistItem[]>(() =>
    STUDIO_DEMO_TRACKS.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      artworkUrl: t.artworkUrl,
      durationMs: t.durationMs,
      synthSpec: t,
    }))
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [browserIsPlaying, setBrowserIsPlaying] = useState(false);
  const [browserPosMs, setBrowserPosMs] = useState(0);
  const [browserDurMs, setBrowserDurMs] = useState(
    STUDIO_DEMO_TRACKS[0].durationMs
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastHandledCommandIdRef = useRef<number | null>(null);

  // WebRTC Broadcaster state
  const [webrtcBroadcasting, setWebrtcBroadcasting] = useState(false);
  const [webrtcSourceLabel, setWebrtcSourceLabel] = useState<string>("");
  const broadcasterIdRef = useRef<string>(
    `broadcaster-${Math.random().toString(36).slice(2, 9)}`
  );
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaElemSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Android Webhook Simulator custom fields
  const [customTitle, setCustomTitle] = useState("Midnight City");
  const [customArtist, setCustomArtist] = useState("M83");
  const [customAlbum, setCustomAlbum] = useState("Hurry Up, We're Dreaming");
  const [customApp, setCustomApp] = useState("Spotify");
  const [webhookSending, setWebhookSending] = useState(false);
  const [webhookFeedback, setWebhookFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const currentTrack = playlist[currentIndex] ?? playlist[0];

  const pushBrowserMetadata = useCallback(
    async (
      track: BrowserPlaylistItem,
      isPlaying: boolean,
      posMs: number,
      durMs: number,
      webrtcActiveOverride?: boolean
    ) => {
      try {
        await fetch(`/api/update?session=${encodeURIComponent(sessionId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "browser_audio",
            title: track.title,
            artist: track.artist,
            album: track.album,
            appName: "Mobile Browser PWA",
            isPlaying,
            positionMs: Math.round(posMs),
            durationMs: Math.round(durMs || track.durationMs),
            artworkBase64OrUrl: track.artworkUrl,
            webrtcActive:
              typeof webrtcActiveOverride === "boolean"
                ? webrtcActiveOverride
                : webrtcBroadcasting,
          }),
        });
      } catch {
        // Ignore transient network hiccups
      }
    },
    [sessionId, webrtcBroadcasting]
  );

  // Prepare audio element source whenever currentTrack changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const src =
      currentTrack.customAudioUrl ??
      (currentTrack.synthSpec
        ? getSynthesizedTrackAudioUrl(currentTrack.synthSpec)
        : "");

    if (src && audio.src !== src) {
      const shouldAutoPlay = browserIsPlaying;
      audio.src = src;
      audio.load();
      setBrowserPosMs(0);
      setBrowserDurMs(currentTrack.durationMs);
      if (shouldAutoPlay) {
        audio
          .play()
          .then(() => {
            void pushBrowserMetadata(
              currentTrack,
              true,
              0,
              currentTrack.durationMs
            );
          })
          .catch(() => setBrowserIsPlaying(false));
      }
    }
  }, [currentIndex, currentTrack, browserIsPlaying, pushBrowserMetadata]);

  // Wire navigator.mediaSession metadata & hardware media controls
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    if (!currentTrack) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album,
        artwork: [
          {
            src: currentTrack.artworkUrl,
            sizes: "512x512",
            type: "image/jpeg",
          },
        ],
      });

      navigator.mediaSession.playbackState = browserIsPlaying
        ? "playing"
        : "paused";

      navigator.mediaSession.setActionHandler("play", () => {
        void toggleBrowserPlay(true);
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        void toggleBrowserPlay(false);
      });
      navigator.mediaSession.setActionHandler("previoustrack", () => {
        handlePrevTrack();
      });
      navigator.mediaSession.setActionHandler("nexttrack", () => {
        handleNextTrack();
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (audioRef.current && typeof details.seekTime === "number") {
          audioRef.current.currentTime = details.seekTime;
          setBrowserPosMs(details.seekTime * 1000);
          void pushBrowserMetadata(
            currentTrack,
            !audioRef.current.paused,
            details.seekTime * 1000,
            (audioRef.current.duration || 24) * 1000
          );
        }
      });
    } catch {
      // Ignore unsupported mediaSession handlers on older browsers
    }
  });

  const toggleBrowserPlay = async (forcePlay?: boolean) => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    const targetPlay =
      typeof forcePlay === "boolean" ? forcePlay : audio.paused;

    if (targetPlay) {
      if (!audio.src && currentTrack.synthSpec) {
        audio.src = getSynthesizedTrackAudioUrl(currentTrack.synthSpec);
      }
      if (audioCtxRef.current?.state === "suspended") {
        await audioCtxRef.current.resume();
      }
      try {
        await audio.play();
        setBrowserIsPlaying(true);
        await pushBrowserMetadata(
          currentTrack,
          true,
          audio.currentTime * 1000,
          (audio.duration || currentTrack.durationMs / 1000) * 1000
        );
      } catch {
        setBrowserIsPlaying(false);
      }
    } else {
      audio.pause();
      setBrowserIsPlaying(false);
      await pushBrowserMetadata(
        currentTrack,
        false,
        audio.currentTime * 1000,
        (audio.duration || currentTrack.durationMs / 1000) * 1000
      );
    }
  };

  const handleNextTrack = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = (prev + 1) % playlist.length;
      const nextItem = playlist[next];
      if (nextItem) {
        void pushBrowserMetadata(
          nextItem,
          browserIsPlaying,
          0,
          nextItem.durationMs
        );
      }
      return next;
    });
  }, [playlist, browserIsPlaying, pushBrowserMetadata]);

  const handlePrevTrack = useCallback(() => {
    setCurrentIndex((prev) => {
      const next = (prev - 1 + playlist.length) % playlist.length;
      const nextItem = playlist[next];
      if (nextItem) {
        void pushBrowserMetadata(
          nextItem,
          browserIsPlaying,
          0,
          nextItem.durationMs
        );
      }
      return next;
    });
  }, [playlist, browserIsPlaying, pushBrowserMetadata]);

  // Execute incoming Remote Commands from PC Viewer directly on Browser Player!
  useEffect(() => {
    if (!incomingCommand) return;
    if (lastHandledCommandIdRef.current === incomingCommand.id) return;
    lastHandledCommandIdRef.current = incomingCommand.id;

    const audio = audioRef.current;
    if (!audio) return;

    if (incomingCommand.command === "play") {
      void toggleBrowserPlay(true);
    } else if (incomingCommand.command === "pause") {
      void toggleBrowserPlay(false);
    } else if (incomingCommand.command === "toggle") {
      void toggleBrowserPlay(audio.paused);
    } else if (incomingCommand.command === "next") {
      handleNextTrack();
    } else if (incomingCommand.command === "previous") {
      handlePrevTrack();
    } else if (
      incomingCommand.command === "seek" &&
      typeof incomingCommand.seekPositionMs === "number"
    ) {
      audio.currentTime = incomingCommand.seekPositionMs / 1000;
      setBrowserPosMs(incomingCommand.seekPositionMs);
    } else if (
      incomingCommand.command === "volume" &&
      typeof incomingCommand.volume === "number"
    ) {
      audio.volume = Math.max(0, Math.min(1, incomingCommand.volume / 100));
    }
  });

  // WebRTC PeerConnection Offer Helper
  const sendOfferForStream = useCallback(
    async (stream: MediaStream) => {
      pcRef.current?.close();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          fetch(`/api/webrtc?session=${encodeURIComponent(sessionId)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "candidate",
              candidate: evt.candidate.toJSON(),
              senderId: broadcasterIdRef.current,
            }),
          }).catch(() => {});
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await fetch(`/api/webrtc?session=${encodeURIComponent(sessionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "offer",
          sdp: pc.localDescription,
          senderId: broadcasterIdRef.current,
        }),
      });
    },
    [sessionId]
  );

  // Listen for WebRTC answer or viewer request-offer
  useEffect(() => {
    if (!webrtcBroadcasting || !latestWebrtcSignal) return;
    if (latestWebrtcSignal.senderId === broadcasterIdRef.current) return;

    const handle = async () => {
      if (
        latestWebrtcSignal.type === "request-offer" &&
        activeStreamRef.current
      ) {
        await sendOfferForStream(activeStreamRef.current);
      } else if (
        latestWebrtcSignal.type === "answer" &&
        latestWebrtcSignal.sdp &&
        pcRef.current
      ) {
        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(latestWebrtcSignal.sdp)
          );
        } catch {
          // ignore duplicate answer
        }
      } else if (
        latestWebrtcSignal.type === "candidate" &&
        latestWebrtcSignal.candidate &&
        pcRef.current
      ) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(latestWebrtcSignal.candidate)
          );
        } catch {
          // ignore
        }
      }
    };

    void handle();
  }, [latestWebrtcSignal, webrtcBroadcasting, sendOfferForStream]);

  const startWebAudioWebrtcBroadcast = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const dest = ctx.createMediaStreamDestination();
      source.connect(ctx.destination);
      source.connect(dest);
      audioCtxRef.current = ctx;
      mediaElemSourceRef.current = source;
      streamDestRef.current = dest;
    }

    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    const stream = streamDestRef.current!.stream;
    activeStreamRef.current = stream;
    setWebrtcBroadcasting(true);
    setWebrtcSourceLabel("Web Audio API Player Stream");
    await sendOfferForStream(stream);
    if (audio.paused) {
      await toggleBrowserPlay(true);
    } else if (currentTrack) {
      await pushBrowserMetadata(
        currentTrack,
        true,
        audio.currentTime * 1000,
        (audio.duration || 24) * 1000,
        true
      );
    }
  };

  const startDisplayMediaBroadcast = async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      if (displayStream.getAudioTracks().length === 0) {
        for (const t of displayStream.getTracks()) t.stop();
        setWebhookFeedback(
          "Tip: Enable 'Share tab audio' in the browser prompt to broadcast live audio."
        );
        return;
      }
      activeStreamRef.current = displayStream;
      setWebrtcBroadcasting(true);
      setWebrtcSourceLabel("Tab / System Audio (getDisplayMedia)");
      await sendOfferForStream(displayStream);
    } catch {
      // User cancelled capture dialog
    }
  };

  const stopWebrtcBroadcast = async () => {
    pcRef.current?.close();
    pcRef.current = null;
    setWebrtcBroadcasting(false);
    setWebrtcSourceLabel("");
    await fetch(`/api/webrtc?session=${encodeURIComponent(sessionId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hangup",
        senderId: broadcasterIdRef.current,
      }),
    }).catch(() => {});
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const parts = baseName.split(" - ");
    const artist = parts.length > 1 ? parts[0].trim() : "Local Mobile Library";
    const title =
      parts.length > 1 ? parts.slice(1).join(" - ").trim() : baseName;

    const newItem: BrowserPlaylistItem = {
      id: `local-${Date.now()}`,
      title,
      artist,
      album: "Direct Browser Audio",
      artworkUrl: "/covers/orbital-bloom.jpg",
      durationMs: 180000,
      customAudioUrl: url,
    };

    setPlaylist((prev) => [newItem, ...prev]);
    setCurrentIndex(0);
    setBrowserIsPlaying(true);
  };

  const fireAndroidWebhook = async (payload: {
    title: string;
    artist: string;
    album: string;
    appName: string;
    durationMs: number;
    positionMs: number;
    isPlaying: boolean;
    artworkBase64OrUrl: string;
  }) => {
    setWebhookSending(true);
    try {
      const resp = await fetch(
        `/api/update?session=${encodeURIComponent(sessionId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "android_bridge",
            ...payload,
          }),
        }
      );
      const data = await resp.json();
      const cmdCount = Array.isArray(data.commands) ? data.commands.length : 0;
      setWebhookFeedback(
        `POST /api/update → 200 OK • Synced "${payload.title}" (${payload.appName}) • ${cmdCount} queued cmd(s) delivered`
      );
    } catch {
      setWebhookFeedback("Webhook request failed");
    } finally {
      setWebhookSending(false);
    }
  };

  const downloadMacroDroidTemplate = () => {
    const json = generateMacroDroidMacroJson(origin, sessionId);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulsecast-${sessionId}.macro.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const webhookEndpoint = `${origin}/api/update?session=${sessionId}`;

  return (
    <section className="rounded-3xl border border-zinc-800/90 bg-[#121216]/95 p-5 shadow-xl sm:p-6">
      {/* Hidden HTML5 Audio Element for Pure Browser Mode */}
      <audio
        ref={audioRef}
        loop={false}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          setBrowserPosMs(el.currentTime * 1000);
          if (el.duration && Number.isFinite(el.duration)) {
            setBrowserDurMs(el.duration * 1000);
          }
        }}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          if (el.duration && Number.isFinite(el.duration)) {
            setBrowserDurMs(el.duration * 1000);
          }
        }}
        onEnded={() => {
          handleNextTrack();
        }}
      />

      {/* Dual-Mode Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4.5 w-4.5 text-emerald-400" />
            <h2
              style={{ fontFamily: "var(--font-display), sans-serif" }}
              className="text-lg font-bold text-zinc-50"
            >
              Mobile Broadcaster &amp; Bridge Console
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">
            Broadcast live playback from this browser tab OR connect any Android
            media app via System Bridge
          </p>
        </div>

        <div className="inline-flex rounded-2xl border border-zinc-800 bg-zinc-950 p-1">
          <button
            type="button"
            onClick={() => setActiveSubMode("browser_audio")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeSubMode === "browser_audio"
                ? "bg-emerald-500 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Pure Browser Mode
          </button>
          <button
            type="button"
            onClick={() => setActiveSubMode("android_bridge")}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
              activeSubMode === "android_bridge"
                ? "bg-emerald-500 text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            Android System Bridge
          </button>
        </div>
      </div>

      {activeSubMode === "browser_audio" ? (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: HTML5 Audio + MediaSession Broadcaster Deck */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <img
                    src={currentTrack?.artworkUrl || "/covers/neon-drift.jpg"}
                    alt={currentTrack?.title}
                    className="h-14 w-14 rounded-xl border border-white/10 object-cover"
                  />
                  <div>
                    <span className="inline-block rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                      HTML5 AUDIO + MEDIASESSION API
                    </span>
                    <h3 className="mt-1 text-sm font-bold text-zinc-100">
                      {currentTrack?.title}
                    </h3>
                    <p className="text-xs text-zinc-400">
                      {currentTrack?.artist}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevTrack}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-zinc-200 hover:bg-zinc-800"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleBrowserPlay()}
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500 text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-400"
                  >
                    {browserIsPlaying ? (
                      <Pause className="h-5 w-5 fill-current" />
                    ) : (
                      <Play className="ml-0.5 h-5 w-5 fill-current" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleNextTrack}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-zinc-200 hover:bg-zinc-800"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Local Broadcaster Progress */}
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{
                      width: `${Math.min(
                        100,
                        (browserPosMs / Math.max(1, browserDurMs)) * 100
                      )}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between font-mono text-[11px] text-zinc-400">
                  <span>{formatDuration(browserPosMs)}</span>
                  <span>
                    Broadcasting live to{" "}
                    <strong className="text-emerald-400">
                      /live/{sessionId}
                    </strong>
                  </span>
                  <span>{formatDuration(browserDurMs)}</span>
                </div>
              </div>
            </div>

            {/* Track Selector + Local MP3/FLAC File Loader */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300">
                  Studio &amp; Local Audio Queue
                </span>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-300">
                  <Upload className="h-3.5 w-3.5 text-emerald-400" />
                  Load MP3 / WAV / FLAC
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleLocalFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {playlist.slice(0, 6).map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setCurrentIndex(idx);
                      setBrowserIsPlaying(true);
                      void pushBrowserMetadata(
                        item,
                        true,
                        0,
                        item.durationMs
                      );
                    }}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition ${
                      idx === currentIndex
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                    }`}
                  >
                    <img
                      src={item.artworkUrl}
                      alt={item.title}
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-100">
                        {item.title}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {item.artist}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: WebRTC Live Audio Broadcast Controls */}
          <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-300">
                  <Wifi className="h-3 w-3" /> WEBRTC LIVE AUDIO RELAY
                </span>
                {webrtcBroadcasting && (
                  <span className="font-mono text-[11px] text-emerald-400">
                    ● ON AIR
                  </span>
                )}
              </div>

              <h3 className="mt-3 text-sm font-bold text-zinc-100">
                Optional Live Audio Stream to PC
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                Stream real-time stereo audio alongside Now Playing metadata to
                any PC viewing{" "}
                <code className="text-emerald-300">/live/{sessionId}</code>{" "}
                using Web Audio API or{" "}
                <code className="text-indigo-300">getDisplayMedia</code>.
              </p>

              {webrtcBroadcasting && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 font-mono text-[11px] text-emerald-300">
                  Active Source: {webrtcSourceLabel}
                </div>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {!webrtcBroadcasting ? (
                <>
                  <button
                    type="button"
                    onClick={() => void startWebAudioWebrtcBroadcast()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400"
                  >
                    <Wifi className="h-4 w-4" />
                    Broadcast Player Audio (WebRTC)
                  </button>
                  <button
                    type="button"
                    onClick={() => void startDisplayMediaBroadcast()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-indigo-500/50"
                  >
                    <ScreenShare className="h-4 w-4 text-indigo-400" />
                    Broadcast Tab / System Audio (getDisplayMedia)
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void stopWebrtcBroadcast()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/25"
                >
                  Stop WebRTC Audio Broadcast
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* System-Wide Android Bridge Mode */
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Endpoint + MacroDroid/Tasker 1-Rule Setup + cURL */}
          <div className="space-y-4 lg:col-span-7">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/90 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-emerald-400 uppercase">
                  REST Webhook Endpoint (MacroDroid / Tasker / Companion APK)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(webhookEndpoint).catch(() => {});
                    setCopiedWebhook(true);
                    setTimeout(() => setCopiedWebhook(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-200 hover:border-emerald-500/50"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" /> Copy URL
                    </>
                  )}
                </button>
              </div>

              <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-800/80 bg-[#09090B] px-3 py-2 font-mono text-xs text-zinc-100">
                POST {webhookEndpoint}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadMacroDroidTemplate}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download 1-Rule MacroDroid Template (.json)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard
                      .writeText(generateCurlSnippet(origin, sessionId))
                      .catch(() => {});
                    setCopiedCurl(true);
                    setTimeout(() => setCopiedCurl(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-xs font-medium text-zinc-200 hover:border-indigo-500/50"
                >
                  <Terminal className="h-3.5 w-3.5 text-indigo-400" />
                  {copiedCurl ? "Copied cURL!" : "Copy cURL Webhook"}
                </button>
              </div>
            </div>

            {/* 1-Click Android App Webhook Presets */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                  1-Click Android Media Webhook Simulator
                </span>
                <span className="text-[11px] text-zinc-500">
                  Tests live /api/update sync &amp; scrobbling
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ANDROID_WEBHOOK_PRESETS.map((preset) => (
                  <button
                    key={`${preset.appName}-${preset.title}`}
                    type="button"
                    disabled={webhookSending}
                    onClick={() => void fireAndroidWebhook(preset)}
                    className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-left transition hover:border-emerald-500/40 hover:bg-zinc-900"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-100">
                        {preset.title}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {preset.artist}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                      {preset.appName}
                    </span>
                  </button>
                ))}
              </div>

              {webhookFeedback && (
                <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 font-mono text-[11px] text-emerald-300">
                  {webhookFeedback}
                </div>
              )}
            </div>
          </div>

          {/* Right: Custom Webhook Payload Sender + Incoming Remote Command Queue */}
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <h3 className="text-xs font-semibold text-zinc-200">
                Send Custom Media Payload
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Track Title"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={customArtist}
                  onChange={(e) => setCustomArtist(e.target.value)}
                  placeholder="Artist"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={customAlbum}
                  onChange={(e) => setCustomAlbum(e.target.value)}
                  placeholder="Album"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={customApp}
                  onChange={(e) => setCustomApp(e.target.value)}
                  placeholder="App (e.g. Spotify)"
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                disabled={webhookSending}
                onClick={() =>
                  void fireAndroidWebhook({
                    title: customTitle || "Untitled",
                    artist: customArtist || "Unknown Artist",
                    album: customAlbum,
                    appName: customApp || "Android Media",
                    durationMs: 215000,
                    positionMs: 18000,
                    isPlaying: true,
                    artworkBase64OrUrl: "/covers/velvet-echoes.jpg",
                  })
                }
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-500 py-2 text-xs font-semibold text-white transition hover:bg-indigo-400"
              >
                <Send className="h-3.5 w-3.5" />
                POST to /api/update?session={sessionId}
              </button>
            </div>

            {/* Incoming Remote Commands Telemetry */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">
                  Remote Commands Sent from PC
                </span>
                <span className="font-mono text-[10px] text-zinc-500">
                  SSE + /api/command
                </span>
              </div>
              <div className="mt-2.5 max-h-36 space-y-1.5 overflow-y-auto">
                {recentCommands.length === 0 ? (
                  <p className="py-3 text-center text-[11px] text-zinc-500">
                    Click Play, Pause, Next, Previous, or Seek on the Now
                    Playing card to see remote commands arrive here in real time.
                  </p>
                ) : (
                  recentCommands.slice(0, 6).map((cmd) => (
                    <div
                      key={cmd.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-2.5 py-1.5 font-mono text-[11px]"
                    >
                      <span className="text-emerald-400 uppercase">
                        {cmd.command}
                        {cmd.seekPositionMs !== null
                          ? ` (${formatDuration(cmd.seekPositionMs)})`
                          : ""}
                      </span>
                      <span className="text-zinc-500">
                        {new Date(cmd.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
