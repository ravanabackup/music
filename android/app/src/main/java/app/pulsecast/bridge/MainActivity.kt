package app.pulsecast.bridge

import android.content.ComponentName
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.widget.*
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var statusValueView: TextView
    private lateinit var permissionBadgeView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val density = resources.displayMetrics.density
        fun dp(v: Int): Int = (v * density).toInt()

        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#09090B"))
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(36), dp(24), dp(36))
        }

        val titleText = TextView(this).apply {
            text = "PulseCast Bridge"
            textSize = 26f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FAFAFA"))
        }

        val subtitleText = TextView(this).apply {
            text = "System-wide Android MediaSession broadcaster & PC remote listener"
            textSize = 14f
            setTextColor(Color.parseColor("#A1A1AA"))
            setPadding(0, dp(6), 0, dp(20))
        }

        permissionBadgeView = TextView(this).apply {
            textSize = 13f
            setPadding(dp(14), dp(10), dp(14), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#18181B"))
                setStroke(dp(1), Color.parseColor("#27272A"))
            }
        }

        val grantBtn = Button(this).apply {
            text = "Open Android Notification Listener Access"
            isAllCaps = false
            setTextColor(Color.parseColor("#09090B"))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#10B981"))
            }
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }

        val grantParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(12)
            bottomMargin = dp(24)
        }

        val urlLabel = TextView(this).apply {
            text = "PulseCast Web / Relay Base URL"
            textSize = 13f
            setTextColor(Color.parseColor("#E4E4E7"))
        }

        val urlInput = EditText(this).apply {
            setText(BridgePrefs.getServerUrl(this@MainActivity))
            hint = "https://your-pulsecast-host.app"
            setHintTextColor(Color.parseColor("#71717A"))
            setTextColor(Color.parseColor("#FAFAFA"))
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#18181B"))
                setStroke(dp(1), Color.parseColor("#27272A"))
            }
        }

        val sessionLabel = TextView(this).apply {
            text = "Shareable Session ID"
            textSize = 13f
            setTextColor(Color.parseColor("#E4E4E7"))
            setPadding(0, dp(16), 0, 0)
        }

        val sessionInput = EditText(this).apply {
            setText(BridgePrefs.getSessionId(this@MainActivity))
            hint = "pulse-demo-live"
            setHintTextColor(Color.parseColor("#71717A"))
            setTextColor(Color.parseColor("#10B981"))
            typeface = Typeface.MONOSPACE
            inputType = InputType.TYPE_CLASS_TEXT
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#18181B"))
                setStroke(dp(1), Color.parseColor("#27272A"))
            }
        }

        val enableSwitch = Switch(this).apply {
            text = "Broadcast Active Android Media Playback"
            isChecked = BridgePrefs.isEnabled(this@MainActivity)
            setTextColor(Color.parseColor("#FAFAFA"))
            setPadding(0, dp(18), 0, dp(18))
        }

        val saveBtn = Button(this).apply {
            text = "Save & Sync Session"
            isAllCaps = false
            setTextColor(Color.parseColor("#FAFAFA"))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#6366F1"))
            }
            setOnClickListener {
                BridgePrefs.saveConfig(
                    this@MainActivity,
                    urlInput.text.toString(),
                    sessionInput.text.toString(),
                    enableSwitch.isChecked
                )
                Toast.makeText(
                    this@MainActivity,
                    "Bridge session saved! Play music in Spotify, YouTube Music, or any player.",
                    Toast.LENGTH_SHORT
                ).show()
                refreshStatus()
            }
        }

        statusValueView = TextView(this).apply {
            textSize = 12f
            typeface = Typeface.MONOSPACE
            setTextColor(Color.parseColor("#A1A1AA"))
            gravity = Gravity.START
            setPadding(dp(14), dp(14), dp(14), dp(14))
            background = GradientDrawable().apply {
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#121216"))
                setStroke(dp(1), Color.parseColor("#27272A"))
            }
        }

        val statusParams = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = dp(20)
        }

        container.addView(titleText)
        container.addView(subtitleText)
        container.addView(permissionBadgeView)
        container.addView(grantBtn, grantParams)
        container.addView(urlLabel)
        container.addView(urlInput)
        container.addView(sessionLabel)
        container.addView(sessionInput)
        container.addView(enableSwitch)
        container.addView(saveBtn)
        container.addView(statusValueView, statusParams)

        scroll.addView(container)
        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    private fun hasNotificationAccess(): Boolean {
        val cn = ComponentName(this, MediaBridgeListenerService::class.java)
        val flat = Settings.Secure.getString(contentResolver, "enabled_notification_listeners")
        return flat != null && flat.contains(cn.flattenToString())
    }

    private fun refreshStatus() {
        val granted = hasNotificationAccess()
        if (granted) {
            permissionBadgeView.text = "● Notification Listener Access: GRANTED"
            permissionBadgeView.setTextColor(Color.parseColor("#10B981"))
        } else {
            permissionBadgeView.text = "● Notification Listener Access: REQUIRED"
            permissionBadgeView.setTextColor(Color.parseColor("#F59E0B"))
        }
        statusValueView.text = "Telemetry: ${BridgePrefs.getLastStatus(this)}"
    }
}
