export function generateMacroDroidMacroJson(origin: string, sessionId: string): string {
  const endpoint = `${origin}/api/update?session=${sessionId}`;
  return JSON.stringify(
    {
      macroName: `PulseCast Live Sync (${sessionId})`,
      description:
        "1-Rule System-Wide Android Media Webhook for PulseCast. Broadcasts Spotify, YouTube Music, Apple Music, Poweramp, or any active Android player.",
      isEnabled: true,
      triggers: [
        {
          type: "MusicPlayingTrigger",
          options: ["Any Media Application", "Track Changed", "Play/Pause State Changed"],
        },
      ],
      actions: [
        {
          type: "HttpRequestAction",
          method: "POST",
          url: endpoint,
          contentType: "application/json",
          bodyJson: {
            mode: "android_bridge",
            title: "[media_track_name]",
            artist: "[media_artist]",
            album: "[media_album]",
            appName: "[media_app_name]",
            isPlaying: "[media_is_playing]",
            positionMs: "[media_position_ms]",
            durationMs: "[media_duration_ms]",
          },
          saveResponseToDictionary: "pulse_resp",
        },
      ],
    },
    null,
    2
  );
}

export function generateCurlSnippet(origin: string, sessionId: string): string {
  return `curl -X POST "${origin}/api/update?session=${sessionId}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Midnight City",
    "artist": "M83",
    "album": "Hurry Up, We Are Dreaming",
    "appName": "Spotify",
    "isPlaying": true,
    "positionMs": 48200,
    "durationMs": 243000,
    "artworkBase64OrUrl": "${origin}/covers/neon-drift.jpg"
  }'`;
}

export const DEPLOY_WEB_WORKFLOW_YML = `name: Build & Deploy PulseCast PWA to GitHub Pages

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    name: Build Static PWA Bundle
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Setup GitHub Pages configuration
        id: pages
        uses: actions/configure-pages@v5

      - name: Install dependencies
        run: npm ci

      - name: Build static PWA export for GitHub Pages
        env:
          GITHUB_PAGES: 'true'
          NEXT_PUBLIC_BASE_PATH: \${{ steps.pages.outputs.base_path }}
          NEXT_PUBLIC_RELAY_URL: \${{ vars.PULSECAST_RELAY_URL || '' }}
        run: node scripts/build-gh-pages.mjs

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    name: Deploy to GitHub Pages
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy artifact to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4`;

export const BUILD_APK_WORKFLOW_YML = `name: Build Android Companion Bridge APK

on:
  push:
    branches:
      - main
    paths:
      - 'android/**'
      - '.github/workflows/build-apk.yml'
  pull_request:
    paths:
      - 'android/**'
      - '.github/workflows/build-apk.yml'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  build-apk:
    name: Assemble Debug APK (JDK 21 + Gradle 8.10)
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup JDK 21 (Temurin)
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'

      - name: Setup Gradle 8.10.2
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.10.2'

      - name: Ensure Gradle Wrapper & Assemble Debug APK
        working-directory: android
        run: |
          if [ ! -f "./gradlew" ] || [ ! -f "./gradle/wrapper/gradle-wrapper.jar" ]; then
            gradle wrapper --gradle-version 8.10.2
          fi
          chmod +x ./gradlew
          ./gradlew assembleDebug --no-daemon --stacktrace
          mkdir -p "\${GITHUB_WORKSPACE}/app/build/outputs/apk/debug"
          cp -f app/build/outputs/apk/debug/*.apk "\${GITHUB_WORKSPACE}/app/build/outputs/apk/debug/"

      - name: Upload Companion Debug APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: pulsecast-android-companion-debug-apk
          path: app/build/outputs/apk/debug/*.apk
          if-no-files-found: error
          retention-days: 30`;

export const KOTLIN_SERVICE_HIGHLIGHT = `// android/app/src/main/java/app/pulsecast/bridge/MediaBridgeListenerService.kt
class MediaBridgeListenerService : NotificationListenerService() {
    // Captures ANY active Android media session (Spotify, YouTube Music, Apple Music, Poweramp, VLC)
    override fun onListenerConnected() {
        val component = ComponentName(this, MediaBridgeListenerService::class.java)
        sessionManager = getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
        val controllers = sessionManager?.getActiveSessions(component) ?: emptyList()
        registerControllers(controllers)
        sessionManager?.addOnActiveSessionsChangedListener(sessionsChangedListener, component)
        startCommandStreamLoop() // Listens to /api/stream?session=<id>&role=broadcaster
    }

    // Executes remote commands sent from the PC Viewer UI
    private fun executeSingleCommand(
        controls: MediaController.TransportControls,
        controller: MediaController,
        cmdObj: JSONObject
    ) {
        when (cmdObj.optString("command").lowercase()) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "next" -> controls.skipToNext()
            "previous" -> controls.skipToPrevious()
            "seek" -> controls.seekTo(cmdObj.optLong("seekPositionMs", 0L))
        }
    }
}`;
