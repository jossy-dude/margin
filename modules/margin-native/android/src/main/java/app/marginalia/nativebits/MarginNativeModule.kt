package app.marginalia.nativebits

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Margin's own Android bits. Everything here is a thin, total wrapper over a platform API: no call throws
 * into JS for an expected condition (no permission, an old Android), it answers false instead, so the JS
 * side can say honestly what happened.
 */
class MarginNativeModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }
  private val nm: NotificationManager
    get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  override fun definition() = ModuleDefinition {
    Name("MarginNative")

    Function("sdkInt") { Build.VERSION.SDK_INT }

    /* ── the pinned live countdown ─────────────────────────────────────────────────────────────── */
    Function("canPromote") { Live.canPromote(context) }
    Function("showLive") { id: String, title: String, text: String, endAt: Double, link: String ->
      Live.show(context, id, title, text, endAt.toLong(), link)
    }
    Function("hideLive") { id: String -> Live.hide(context, id) }
    Function("wasDismissed") { id: String -> Live.wasDismissed(context, id) }

    /* ── Do Not Disturb for a focus session ────────────────────────────────────────────────────── */
    Function("hasPolicyAccess") { nm.isNotificationPolicyAccessGranted }
    Function("interruptionFilter") { nm.currentInterruptionFilter }
    /** Alarms only, so the end-of-focus alarm still rings. On Android 15+ the system turns this into an
     *  app-owned mode rather than the global switch; the JS copy says so. False without access. */
    Function("silence") {
      if (!nm.isNotificationPolicyAccessGranted) return@Function false
      try { nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALARMS); true } catch (e: Exception) { false }
    }
    /** Put back the filter that was on before, but only if nobody changed it in the meantime. */
    Function("restore") { previous: Int ->
      if (!nm.isNotificationPolicyAccessGranted) return@Function false
      if (nm.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALARMS) return@Function false
      try { nm.setInterruptionFilter(previous); true } catch (e: Exception) { false }
    }
    Function("openPolicySettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (intent.resolveActivity(context.packageManager) == null) return@Function false
      try { context.startActivity(intent); true } catch (e: Exception) { false }
    }
  }
}
