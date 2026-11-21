"use client";

import React, { useState } from "react";
import {
  GitBranch,
  Copy,
  Check,
  Download,
  ShieldCheck,
  Smartphone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  BUILD_APK_WORKFLOW_YML,
  DEPLOY_WEB_WORKFLOW_YML,
  KOTLIN_SERVICE_HIGHLIGHT,
} from "@/lib/projectBlueprints";

export function DevOpsAndBridgeDrawer() {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "deploy-web" | "build-apk" | "android-service"
  >("deploy-web");
  const [copied, setCopied] = useState(false);

  const currentCode =
    activeTab === "deploy-web"
      ? DEPLOY_WEB_WORKFLOW_YML
      : activeTab === "build-apk"
        ? BUILD_APK_WORKFLOW_YML
        : KOTLIN_SERVICE_HIGHLIGHT;

  const currentFilename =
    activeTab === "deploy-web"
      ? "deploy-web.yml"
      : activeTab === "build-apk"
        ? "build-apk.yml"
        : "MediaBridgeListenerService.kt";

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([currentCode], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = currentFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-3xl border border-zinc-800/90 bg-[#121216]/90 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400">
            <GitBranch className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                style={{ fontFamily: "var(--font-display), sans-serif" }}
                className="text-base font-bold text-zinc-50"
              >
                2026 GitHub Actions CI/CD &amp; Android Companion APK Source
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-300">
                <ShieldCheck className="h-3 w-3" /> ZERO DEPRECATED v3 ARTIFACT
                ACTIONS
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Includes <code className="text-zinc-300">.github/workflows/deploy-web.yml</code> (Node 22 + Pages v5/v4),{" "}
              <code className="text-zinc-300">.github/workflows/build-apk.yml</code> (Temurin JDK 21 + Gradle v4 + Upload-Artifact v4), and{" "}
              <code className="text-zinc-300">android/</code> Kotlin module.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700/80 bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
        >
          {expanded ? (
            <>
              <span>Hide Blueprints</span>
              <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              <span>Inspect Workflows &amp; APK Source</span>
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-5 border-t border-zinc-800/80 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("deploy-web")}
                className={`rounded-xl px-3.5 py-2 font-mono text-xs font-semibold transition ${
                  activeTab === "deploy-web"
                    ? "bg-emerald-500 text-zinc-950"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                .github/workflows/deploy-web.yml
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("build-apk")}
                className={`rounded-xl px-3.5 py-2 font-mono text-xs font-semibold transition ${
                  activeTab === "build-apk"
                    ? "bg-emerald-500 text-zinc-950"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                .github/workflows/build-apk.yml
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("android-service")}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 font-mono text-xs font-semibold transition ${
                  activeTab === "android-service"
                    ? "bg-indigo-500 text-white"
                    : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700"
                }`}
              >
                <Smartphone className="h-3.5 w-3.5" />
                MediaBridgeListenerService.kt
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-emerald-500/50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy File
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-indigo-500/50"
              >
                <Download className="h-3.5 w-3.5 text-indigo-400" />
                Download {currentFilename}
              </button>
            </div>
          </div>

          <pre className="mt-4 max-h-[380px] overflow-auto rounded-2xl border border-zinc-800 bg-[#09090B] p-4 font-mono text-xs leading-relaxed text-zinc-200">
            <code>{currentCode}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
