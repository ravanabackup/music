package app.pulsecast.bridge

import android.content.Context

object BridgePrefs {
    private const val PREFS_NAME = "pulsecast_bridge_prefs"
    private const val KEY_SERVER_URL = "server_url"
    private const val KEY_SESSION_ID = "session_id"
    private const val KEY_ENABLED = "bridge_enabled"
    private const val KEY_LAST_STATUS = "last_status"

    fun getServerUrl(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SERVER_URL, "https://pulsecast.example.com") ?: ""
    }

    fun getSessionId(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_SESSION_ID, "pulse-demo-live") ?: "pulse-demo-live"
    }

    fun isEnabled(context: Context): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getBoolean(KEY_ENABLED, true)
    }

    fun getLastStatus(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(KEY_LAST_STATUS, "Idle — waiting for active media session") ?: ""
    }

    fun saveConfig(context: Context, serverUrl: String, sessionId: String, enabled: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SERVER_URL, serverUrl.trim().trimEnd('/'))
            .putString(KEY_SESSION_ID, sessionId.trim())
            .putBoolean(KEY_ENABLED, enabled)
            .apply()
    }

    fun setLastStatus(context: Context, status: String) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LAST_STATUS, status)
            .apply()
    }
}
