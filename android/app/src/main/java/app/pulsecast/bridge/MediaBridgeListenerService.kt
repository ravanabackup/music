package app.pulsecast.bridge

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.service.notification.NotificationListenerService
import android.util.Base64
import kotlinx.coroutines.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

class MediaBridgeListenerService : NotificationListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private var sessionManager: MediaSessionManager? = null
    private var activeControllers: List<MediaController> = emptyList()
    private var sseJob: Job? = null
    private var tickerJob: Job? = null

    private val controllerCallback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) {
            pushCurrentMediaState()
        }

        override fun onPlaybackStateChanged(state: PlaybackState?) {
            pushCurrentMediaState()
        }
    }

    private val sessionsChangedListener =
        MediaSessionManager.OnActiveSessionsChangedListener { controllers ->
            registerControllers(controllers ?: emptyList())
            pushCurrentMediaState()
        }

    override fun onListenerConnected() {
        super.onListenerConnected()
        val component = ComponentName(this, MediaBridgeListenerService::class.java)
        sessionManager = getSystemService(Context.MEDIA_SESSION_SERVICE) as? MediaSessionManager
        try {
            val current = sessionManager?.getActiveSessions(component) ?: emptyList()
            registerControllers(current)
            sessionManager?.addOnActiveSessionsChangedListener(sessionsChangedListener, component)
        } catch (_: SecurityException) {
            BridgePrefs.setLastStatus(this, "Grant Notification Access in Android Settings")
        }

        startCommandStreamLoop()
        startPositionTicker()
        pushCurrentMediaState()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        try {
            sessionManager?.removeOnActiveSessionsChangedListener(sessionsChangedListener)
        } catch (_: Exception) {
        }
        unregisterControllers()
        sseJob?.cancel()
        tickerJob?.cancel()
    }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }

    private fun registerControllers(controllers: List<MediaController>) {
        unregisterControllers()
        activeControllers = controllers
        for (controller in activeControllers) {
            controller.registerCallback(controllerCallback)
        }
    }

    private fun unregisterControllers() {
        for (controller in activeControllers) {
            try {
                controller.unregisterCallback(controllerCallback)
            } catch (_: Exception) {
            }
        }
        activeControllers = emptyList()
    }

    private fun pickPrimaryController(): MediaController? {
        if (activeControllers.isEmpty()) return null
        return activeControllers.firstOrNull {
            it.playbackState?.state == PlaybackState.STATE_PLAYING
        } ?: activeControllers.firstOrNull()
    }

    private fun friendlyAppName(pkg: String): String {
        val lower = pkg.lowercase()
        return when {
            "spotify" in lower -> "Spotify"
            "youtube.music" in lower || "apps.youtube.music" in lower -> "YouTube Music"
            "youtube" in lower -> "YouTube"
            "apple.android.music" in lower -> "Apple Music"
            "tidal" in lower -> "TIDAL"
            "poweramp" in lower -> "Poweramp"
            "soundcloud" in lower -> "SoundCloud"
            "vlc" in lower -> "VLC"
            "pocketcasts" in lower -> "Pocket Casts"
            else -> pkg.substringAfterLast('.').replaceFirstChar { it.uppercase() }
        }
    }

    private fun encodeArtworkDataUri(bitmap: Bitmap?): String? {
        if (bitmap == null) return null
        return try {
            val targetSize = 256
            val scaled = Bitmap.createScaledBitmap(bitmap, targetSize, targetSize, true)
            val out = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 78, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            "data:image/jpeg;base64,$b64"
        } catch (_: Exception) {
            null
        }
    }

    private fun pushCurrentMediaState() {
        if (!BridgePrefs.isEnabled(this)) return
        val baseUrl = BridgePrefs.getServerUrl(this)
        val sessionId = BridgePrefs.getSessionId(this)
        if (baseUrl.isBlank() || sessionId.isBlank()) return

        val controller = pickPrimaryController() ?: return
        val meta = controller.metadata ?: return
        val pb = controller.playbackState

        val title = meta.getString(MediaMetadata.METADATA_KEY_TITLE)
            ?: meta.getString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE)
            ?: return
        val artist = meta.getString(MediaMetadata.METADATA_KEY_ARTIST)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ARTIST)
            ?: "Unknown Artist"
        val album = meta.getString(MediaMetadata.METADATA_KEY_ALBUM) ?: ""
        val durationMs = meta.getLong(MediaMetadata.METADATA_KEY_DURATION).coerceAtLeast(0L)
        val positionMs = (pb?.position ?: 0L).coerceAtLeast(0L)
        val isPlaying = pb?.state == PlaybackState.STATE_PLAYING
        val appName = friendlyAppName(controller.packageName)

        val artBitmap = meta.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
            ?: meta.getBitmap(MediaMetadata.METADATA_KEY_ART)
            ?: meta.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON)
        val artUri = encodeArtworkDataUri(artBitmap)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ALBUM_ART_URI)
            ?: meta.getString(MediaMetadata.METADATA_KEY_ART_URI)

        scope.launch {
            try {
                val payload = JSONObject().apply {
                    put("mode", "android_bridge")
                    put("title", title)
                    put("artist", artist)
                    put("album", album)
                    put("appName", appName)
                    put("isPlaying", isPlaying)
                    put("positionMs", positionMs)
                    put("durationMs", durationMs)
                    if (!artUri.isNullOrBlank()) {
                        put("artworkBase64OrUrl", artUri)
                    }
                }

                val req = Request.Builder()
                    .url("$baseUrl/api/update?session=$sessionId")
                    .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
                    .build()

                httpClient.newCall(req).execute().use { resp ->
                    if (resp.isSuccessful) {
                        val respText = resp.body?.string() ?: "{}"
                        val respJson = JSONObject(respText)
                        val cmds = respJson.optJSONArray("commands") ?: JSONArray()
                        executeRemoteCommands(cmds)
                        BridgePrefs.setLastStatus(
                            this@MediaBridgeListenerService,
                            "Synced: $title — $artist ($appName)"
                        )
                    } else {
                        BridgePrefs.setLastStatus(
                            this@MediaBridgeListenerService,
                            "HTTP ${resp.code} from relay"
                        )
                    }
                }
            } catch (e: Exception) {
                BridgePrefs.setLastStatus(
                    this@MediaBridgeListenerService,
                    "Sync error: ${e.localizedMessage ?: "unreachable"}"
                )
            }
        }
    }

    private fun executeRemoteCommands(commands: JSONArray) {
        val controller = pickPrimaryController() ?: return
        val controls = controller.transportControls
        for (i in 0 until commands.length()) {
            val cmdObj = commands.optJSONObject(i) ?: continue
            executeSingleCommand(controls, controller, cmdObj)
        }
    }

    private fun executeSingleCommand(
        controls: MediaController.TransportControls,
        controller: MediaController,
        cmdObj: JSONObject
    ) {
        when (cmdObj.optString("command").lowercase()) {
            "play" -> controls.play()
            "pause" -> controls.pause()
            "toggle" -> {
                if (controller.playbackState?.state == PlaybackState.STATE_PLAYING) {
                    controls.pause()
                } else {
                    controls.play()
                }
            }
            "next" -> controls.skipToNext()
            "previous" -> controls.skipToPrevious()
            "seek" -> {
                val seekMs = cmdObj.optLong("seekPositionMs", -1L)
                if (seekMs >= 0L) {
                    controls.seekTo(seekMs)
                }
            }
        }
    }

    private fun startPositionTicker() {
        tickerJob?.cancel()
        tickerJob = scope.launch {
            while (isActive) {
                delay(5000L)
                val primary = pickPrimaryController()
                if (primary?.playbackState?.state == PlaybackState.STATE_PLAYING) {
                    pushCurrentMediaState()
                }
            }
        }
    }

    private fun startCommandStreamLoop() {
        sseJob?.cancel()
        sseJob = scope.launch {
            while (isActive) {
                if (!BridgePrefs.isEnabled(this@MediaBridgeListenerService)) {
                    delay(3000L)
                    continue
                }
                val baseUrl = BridgePrefs.getServerUrl(this@MediaBridgeListenerService)
                val sessionId = BridgePrefs.getSessionId(this@MediaBridgeListenerService)
                if (baseUrl.isBlank() || sessionId.isBlank()) {
                    delay(3000L)
                    continue
                }

                try {
                    val req = Request.Builder()
                        .url("$baseUrl/api/stream?session=$sessionId&role=broadcaster")
                        .header("Accept", "text/event-stream")
                        .build()

                    httpClient.newCall(req).execute().use { resp ->
                        val source = resp.body?.source()
                        var currentEvent = ""
                        while (isActive && source != null && !source.exhausted()) {
                            val line = source.readUtf8Line() ?: break
                            if (line.startsWith("event:")) {
                                currentEvent = line.removePrefix("event:").trim()
                            } else if (line.startsWith("data:") && currentEvent == "command") {
                                val jsonStr = line.removePrefix("data:").trim()
                                val cmdObj = JSONObject(jsonStr)
                                val controller = pickPrimaryController()
                                if (controller != null) {
                                    executeSingleCommand(controller.transportControls, controller, cmdObj)
                                }
                            }
                        }
                    }
                } catch (_: Exception) {
                    delay(3500L)
                }
            }
        }
    }
}
