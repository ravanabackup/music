"use client";

import React, { useMemo, useState } from "react";
import {
  History,
  FileJson,
  FileSpreadsheet,
  Search,
  Trash2,
  Clock,
  Music2,
} from "lucide-react";
import type { ScrobbleItem } from "@/lib/types";
import { formatDuration, formatRelativeTime } from "@/lib/demoTracks";

interface ScrobbleHistoryPanelProps {
  sessionId: string;
  scrobbles: ScrobbleItem[];
  onClearHistory: () => Promise<void>;
}

export function ScrobbleHistoryPanel({
  sessionId,
  scrobbles,
  onClearHistory,
}: ScrobbleHistoryPanelProps) {
  const [filterText, setFilterText] = useState("");

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return scrobbles;
    return scrobbles.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q) ||
        s.album.toLowerCase().includes(q) ||
        s.appName.toLowerCase().includes(q)
    );
  }, [scrobbles, filterText]);

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      sessionId,
      totalScrobbles: scrobbles.length,
      scrobbles,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulsecast-scrobbles-${sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? "");
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "id",
      "playedAt",
      "title",
      "artist",
      "album",
      "appName",
      "durationMs",
      "sessionId",
    ].join(",");
    const rows = scrobbles.map((s) =>
      [
        escapeCsv(s.id),
        escapeCsv(s.playedAt),
        escapeCsv(s.title),
        escapeCsv(s.artist),
        escapeCsv(s.album),
        escapeCsv(s.appName),
        escapeCsv(s.durationMs),
        escapeCsv(s.sessionId),
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pulsecast-scrobbles-${sessionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="flex h-full flex-col rounded-3xl border border-zinc-800/90 bg-[#121216]/95 p-5 shadow-xl sm:p-6">
      {/* Header + Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
            <History className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2
                style={{ fontFamily: "var(--font-display), sans-serif" }}
                className="text-base font-bold text-zinc-50"
              >
                Scrobble History
              </h2>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[11px] text-zinc-300">
                {scrobbles.length}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Live Last.fm-style playback log with source app telemetry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
          >
            <FileJson className="h-3.5 w-3.5 text-emerald-400" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-indigo-500/50 hover:text-indigo-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-indigo-400" />
            Export CSV
          </button>
          {scrobbles.length > 0 && (
            <button
              type="button"
              onClick={() => void onClearHistory()}
              title="Clear session scrobble log"
              className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/70 p-1.5 text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="relative mt-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter scrobbles by track, artist, or source app..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/90 py-2 pr-3 pl-9 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
        />
      </div>

      {/* Live Scrobble List */}
      <div className="mt-4 max-h-[420px] flex-1 space-y-2 overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
            <Music2 className="h-7 w-7 text-zinc-600" />
            <p className="mt-2 text-xs font-medium text-zinc-400">
              No scrobbles recorded yet
            </p>
            <p className="mt-1 max-w-xs text-[11px] text-zinc-500">
              Start playing in Pure Browser Mode or send an Android Bridge
              webhook to populate your live scrobble feed.
            </p>
          </div>
        ) : (
          filtered.map((item, idx) => {
            const exactTime = new Date(item.playedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return (
              <div
                key={item.id}
                className={`group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition ${
                  idx === 0
                    ? "border-emerald-500/25 bg-emerald-500/[0.04]"
                    : "border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700/80 hover:bg-zinc-900/80"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                    <img
                      src={item.artworkUrl || "/covers/neon-drift.jpg"}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                    {idx === 0 && (
                      <span className="absolute right-1 bottom-1 h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-zinc-100">
                        {item.title}
                      </p>
                    </div>
                    <p className="truncate text-xs text-zinc-400">
                      {item.artist}
                      {item.album ? (
                        <span className="text-zinc-500"> • {item.album}</span>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="rounded-md border border-zinc-700/80 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                    {item.appName}
                  </span>
                  <div
                    title={`Played at ${exactTime} (${formatDuration(
                      item.durationMs
                    )})`}
                    className="flex items-center gap-1 font-mono text-[11px] text-zinc-500"
                  >
                    <Clock className="h-3 w-3" />
                    <span>{formatRelativeTime(item.playedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
