"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Radio,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  RefreshCw,
  Download,
  Smartphone,
  Users,
  X,
  Sparkles,
} from "lucide-react";
import type { PresenceSummary } from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface ShareSessionHeaderProps {
  sessionId: string;
  onChangeSession: (newSessionId: string) => void;
  connected: boolean;
  latencyMs: number;
  presence: PresenceSummary;
  isDedicatedLiveRoute?: boolean;
}

export function ShareSessionHeader({
  sessionId,
  onChangeSession,
  connected,
  latencyMs,
  presence,
  isDedicatedLiveRoute = false,
}: ShareSessionHeaderProps) {
  const [origin, setOrigin] = useState<string>("https://pulsecast.live");
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [customInput, setCustomInput] = useState(sessionId);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [pwaInstalledToast, setPwaInstalledToast] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    setCustomInput(sessionId);
  }, [sessionId]);

  const shareUrl = `${origin}/live/${sessionId}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(shareUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: "#10B981",
        light: "#09090B",
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [shareUrl]);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy
      const el = document.createElement("textarea");
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateRandomSession = () => {
    const token = Math.random().toString(36).slice(2, 8);
    const nextId = `pulse-${token}`;
    onChangeSession(nextId);
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } else {
      setPwaInstalledToast(true);
      setTimeout(() => setPwaInstalledToast(false), 3500);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#09090B]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Brand Identity */}
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="group flex items-center gap-2.5 focus:outline-none"
            >
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.18)]">
                <Radio className="h-4.5 w-4.5 text-emerald-400 transition-transform group-hover:scale-110" />
                {connected && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                    className="text-base font-bold tracking-tight text-zinc-50"
                  >
                    PulseCast
                  </span>
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-emerald-400 uppercase">
                    {isDedicatedLiveRoute ? "LIVE VIEWER" : "STUDIO PWA"}
                  </span>
                </div>
                <p className="hidden text-[11px] text-zinc-400 sm:block">
                  Real-Time Mobile Media Bridge &amp; Remote
                </p>
              </div>
            </a>
          </div>

          {/* Shareable Session Link Bar */}
          <div className="flex flex-1 items-center justify-center">
            <div className="flex w-full max-w-xl items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/90 p-1.5 shadow-inner">
              <div className="hidden items-center gap-1.5 rounded-lg bg-zinc-950 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 md:flex">
                <span
                  className={`h-2 w-2 rounded-full ${
                    connected ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                <span>SHARE LINK</span>
              </div>

              <div
                onClick={handleCopyLink}
                title="Click to copy Shareable Session Link"
                className="flex-1 cursor-pointer truncate px-2 font-mono text-xs text-zinc-200 hover:text-emerald-300"
              >
                {shareUrl}
              </div>

              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 active:scale-95"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                title="Show QR Code & Session Settings"
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-800/90 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">QR</span>
              </button>

              {!isDedicatedLiveRoute && (
                <a
                  href={`/live/${sessionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open Dedicated Shareable PC Viewer Link in new tab"
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700/80 bg-zinc-800/90 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-indigo-500/50 hover:text-indigo-300"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Right Status & PWA Install */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 font-mono text-[11px] text-zinc-300 lg:flex">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span>{Math.max(1, presence.totalConnections)} online</span>
              <span className="text-zinc-600">•</span>
              <span className="text-emerald-400">{latencyMs}ms</span>
            </div>

            <button
              type="button"
              onClick={handleInstallPwa}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:bg-zinc-800"
            >
              <Smartphone className="h-3.5 w-3.5 text-emerald-400" />
              <span>Install PWA</span>
            </button>
          </div>
        </div>

        {pwaInstalledToast && (
          <div className="border-t border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-center text-xs text-emerald-200">
            <Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />
            PWA Manifest &amp; Service Worker active — use your browser&apos;s{" "}
            <strong>Install App / Add to Home Screen</strong> menu on PC or
            Android!
          </div>
        )}
      </header>

      {/* QR Code & Session Switcher Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-[#121216] p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                  className="text-lg font-bold text-zinc-50"
                >
                  Shareable Live Session QR
                </h3>
                <p className="text-xs text-zinc-400">
                  Scan on PC or Android to sync Now Playing &amp; remote
                  controls across any network.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center rounded-2xl border border-zinc-800/90 bg-[#09090B] p-5">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR Code for ${shareUrl}`}
                  className="h-56 w-56 rounded-xl border border-emerald-500/20"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center text-xs text-zinc-500">
                  Generating QR...
                </div>
              )}

              <p className="mt-3 break-all text-center font-mono text-xs text-emerald-400">
                {shareUrl}
              </p>

              <div className="mt-4 flex w-full gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied Link
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Share Link
                    </>
                  )}
                </button>
                {qrDataUrl && (
                  <a
                    href={qrDataUrl}
                    download={`pulsecast-${sessionId}-qr.png`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-xs font-medium text-zinc-200 hover:border-zinc-500"
                  >
                    <Download className="h-4 w-4" />
                    PNG
                  </a>
                )}
              </div>
            </div>

            {/* Session ID Customizer */}
            <div className="mt-5 border-t border-zinc-800/80 pt-4">
              <label className="block text-xs font-medium text-zinc-300">
                Switch or Create Custom Session ID
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="pulse-studio-room"
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const cleaned = customInput
                      .trim()
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, "");
                    if (cleaned) {
                      onChangeSession(cleaned);
                      setShowQrModal(false);
                    }
                  }}
                  className="rounded-xl bg-indigo-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-400"
                >
                  Join
                </button>
                <button
                  type="button"
                  onClick={handleGenerateRandomSession}
                  title="Generate fresh random session ID"
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
