# PulseCast Live — Mobile Media Broadcast PWA & Android Companion Bridge

Real-time **Progressive Web App (PWA) + Lightweight Android Companion Bridge** that broadcasts live mobile media playback to a shareable web link (`/live/<session-id>`) and lets any PC browser view live Now Playing metadata, Last.fm-style scrobble history, listen via optional WebRTC live audio, and dispatch remote playback controls (`play`, `pause`, `next`, `previous`, `seek`, `volume`) back to your phone.

## Key Capabilities

1. **Shareable Session Link & QR Sync (`/live/<session-id>`)**
   - Generates a persistent shareable session URL with an offline SVG/PNG QR Code modal and 1-click Copy button.
   - Real-time low-latency synchronization over Server-Sent Events (`/api/stream?session=<id>`) backed by PostgreSQL (Drizzle ORM), plus standalone Cloudflare Worker (`relay/cloudflare-worker.js`) and Node.js 22 (`relay/node-ws-relay.mjs`) relays for static hosting.

2. **Dual Broadcast Modes**
   - **Mode 1 — System-Wide Android Bridge (`/api/update?session=<id>`):**
     - Accepts live metadata payloads (`title`, `artist`, `album`, `appName`, `isPlaying`, `positionMs`, `durationMs`, `artworkBase64OrUrl`) from **any** Android media player (Spotify, YouTube Music, Apple Music, Poweramp, TIDAL, VLC) via either a **1-rule MacroDroid/Tasker HTTP webhook** or the included **`NotificationListenerService` Android Companion APK (`android/`)**.
     - Executes remote `play`, `pause`, `next`, `previous`, and `seek` commands via `MediaController.TransportControls`.
   - **Mode 2 — Pure Browser Mode:**
     - Plays studio or local audio files (`.mp3`, `.wav`, `.flac`, `.m4a`) directly in the mobile browser tab with `navigator.mediaSession` lockscreen integration and optional **WebRTC live audio streaming** (`Web Audio API` or `navigator.mediaDevices.getDisplayMedia`).

3. **PC Viewer & Remote Controller UI**
   - Dynamic blurred album artwork backdrop, source app pill badge, smooth interpolated live progress scrubber (`elapsed / duration`), remote transport controls, WebRTC audio monitor with live frequency bars, and a **Last.fm-style Scrobble History** feed with **Export JSON** and **Export CSV**.

4. **2026 GitHub Actions CI/CD Workflows (`.github/workflows/`)**
   - **`.github/workflows/deploy-web.yml`:** Builds on Node 22 (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`) with `permissions: { contents: read, pages: write, id-token: write }`.
   - **`.github/workflows/build-apk.yml`:** Builds the Android Companion APK on Temurin JDK 21 (`actions/checkout@v4`, `actions/setup-java@v4`, `gradle/actions/setup-gradle@v4`, `actions/upload-artifact@v4`) and uploads `app/build/outputs/apk/debug/*.apk`.
