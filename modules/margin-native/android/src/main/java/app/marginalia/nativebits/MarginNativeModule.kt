package app.marginalia.nativebits

import android.app.NotificationManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
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
    Events("onSyncStatus", "onBridgeRows", "onSyncTimer")

    OnCreate {
      SyncEngine.init(context)
      SyncEngine.onStatus = { sendEvent("onSyncStatus", mapOf("json" to it.toString())) }
      SyncEngine.onBridgeRows = { sendEvent("onBridgeRows", mapOf("json" to it)) }
      SyncEngine.onTimer = { sendEvent("onSyncTimer", mapOf("json" to it)) }
    }
    OnDestroy { SyncEngine.onStatus = null; SyncEngine.onBridgeRows = null; SyncEngine.onTimer = null }

    /* ── sync with the desktop (v0.7, SYNC_ANDROID.md) ──────────────────────────────────────────── */
    /** Pairing text from the hub's QR (or "8 words|vaultId|hubId|addr"). Returns "" on success, else a sentence. */
    Function("syncPair") { text: String -> SyncEngine.init(context); val err = SyncEngine.pair(text); if (err == null) SyncService.ensure(context); err ?: "" }
    Function("syncForget") { SyncEngine.forget(); SyncService.stop(context); true }
    /** The vault folder (SAF tree URI) and its Obsidian name, from settings. */
    Function("syncConfigure") { vaultUri: String, vaultName: String -> SyncEngine.init(context); SyncEngine.configure(vaultUri.ifEmpty { null }, vaultName.ifEmpty { null }); true }
    Function("syncStart") { SyncService.ensure(context); SyncEngine.paired }
    Function("syncStatus") { SyncEngine.init(context); SyncEngine.statusJson().toString() }
    /** Margin's own bridge rows (tasks, events, sessions) as JSON; JS debounces (750 ms). */
    Function("syncPushBridge") { json: String -> SyncEngine.pushBridge(json); true }
    Function("syncTimer") { json: String -> SyncEngine.timer(json); true }
    /** Rows that arrived while JS was not running: [{kind, json}], removed once read. */
    Function("syncInbox") {
      SyncEngine.init(context)
      val arr = org.json.JSONArray()
      for ((k, j) in SyncStore.get(context).takeInbox()) arr.put(org.json.JSONObject().put("kind", k).put("json", j))
      arr.toString()
    }
    /** A fresh 6-digit code for phone Obsidian (margin-bridge asks for it once). */
    Function("syncObsidianCode") { SyncEngine.init(context); SyncEngine.obsidianCode() }
    Function("syncNetworks") { SyncNet.describe() }

    Function("sdkInt") { Build.VERSION.SDK_INT }

    /* ── the pinned live countdown ─────────────────────────────────────────────────────────────── */
    Function("canPromote") { Live.canPromote(context) }
    Function("showLive") { id: String, title: String, text: String, endAt: Double, link: String ->
      Live.show(context, id, title, text, endAt.toLong(), link)
    }
    Function("hideLive") { id: String -> Live.hide(context, id) }
    Function("wasDismissed") { id: String -> Live.wasDismissed(context, id) }

    /* ── the agenda: widgets, the pinned class, alarms ──────────────────────────────────────────── */
    /** JS hands over what it knows (`src/domain/agenda.ts`); every surface outside the app is redrawn from it. */
    Function("setAgenda") { json: String ->
      Agenda.write(context, json)
      Surfaces.refresh(context)
      AlarmClock.arm(context.applicationContext).toDouble()
    }
    /** When the next alarm rings, in ms; 0 when none is set. */
    Function("nextAlarmAt") { (AlarmClock.next(context, System.currentTimeMillis())?.at ?: 0L).toDouble() }
    Function("canExactAlarm") { AlarmClock.canExact(context) }
    Function("canFullScreen") { AlarmClock.canFullScreen(context) }
    /** Ring now, exactly as a real alarm would: the way to hear it and see the alarm screen before trusting it. */
    Function("ringNow") { label: String ->
      try {
        val i = Intent(context, AlarmService::class.java).setAction(AlarmService.ACTION_RING).putExtra("id", "preview").putExtra("label", label).putExtra("snooze", 5).putExtra("vib", true)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(i) else context.startService(i)
        /* N6: a test ring always opens the alarm screen too (the app is in front, so it may), so it can be
           stopped there by Dismiss, a double tap, a volume key, or by leaving it. */
        context.startActivity(Intent(context, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          .putExtra("id", "preview").putExtra("label", label).putExtra("snooze", 5))
        true
      } catch (e: Exception) { false }
    }
    /* ── alarm tones (N6/R10): list, choose, a 10 s preview that can always be stopped ── */
    /** The id of the alarm ringing right now, or "" (test report #1: the app must be able to stop it). */
    Function("alarmRinging") { AlarmService.ringingId ?: "" }
    Function("stopAlarm") { AlarmService.stopRinging(context) }
    Function("alarmTones") { AlarmTones.list(context) }
    Function("alarmTone") { AlarmTones.chosen(context) }
    Function("chooseAlarmTone") { id: String -> AlarmTones.choose(context, id); true }
    Function("previewTone") { id: String -> AlarmTones.play(context, id) }
    Function("stopPreview") { AlarmTones.stop(); true }
    /** Opens the system page where full-screen alarms (kind "fullscreen") or exact alarms ("exact") are allowed. */
    Function("openAlarmSettings") { kind: String ->
      val action = when {
        kind == "fullscreen" && Build.VERSION.SDK_INT >= 34 -> Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
        kind == "exact" && Build.VERSION.SDK_INT >= 31 -> Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
        else -> Settings.ACTION_APPLICATION_DETAILS_SETTINGS
      }
      try { context.startActivity(Intent(action, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true } catch (e: Exception) { false }
    }
    /** Is at least one Margin widget on a home screen? */
    Function("hasWidgets") { Widgets.any(context) }
    /** Asks the launcher to add a widget ("next", "today" or "tasks"). False when this launcher cannot. */
    Function("pinWidget") { kind: String ->
      if (Build.VERSION.SDK_INT < 26) return@Function false
      val mgr = AppWidgetManager.getInstance(context)
      if (!mgr.isRequestPinAppWidgetSupported) return@Function false
      try { mgr.requestPinAppWidget(ComponentName(context, BoardWidget::class.java), null, null) } catch (e: Exception) { false }
    }

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
