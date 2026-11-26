package app.marginalia.nativebits

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import expo.modules.kotlin.Promise
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

  override fun definition() = ModuleDefinition {
    Name("MarginNative")
    Events("onSyncStatus", "onBridgeRows", "onSyncTimer", "onVaultChanged")

    OnCreate {
      SyncEngine.init(context)
      SyncEngine.onStatus = { sendEvent("onSyncStatus", mapOf("json" to it.toString())) }
      SyncEngine.onBridgeRows = { sendEvent("onBridgeRows", mapOf("json" to it)) }
      SyncEngine.onTimer = { sendEvent("onSyncTimer", mapOf("json" to it)) }
      SyncEngine.onVaultChanged = { sendEvent("onVaultChanged", mapOf("json" to it)) }
    }
    OnDestroy { SyncEngine.onStatus = null; SyncEngine.onBridgeRows = null; SyncEngine.onTimer = null; SyncEngine.onVaultChanged = null }

    /* ── sync with the desktop (v0.7, SYNC_ANDROID.md) ──────────────────────────────────────────── */
    /** Pairing text from the hub's QR (or "8 words|vaultId|hubId|addr"). Returns "" on success, else a sentence. */
    Function("syncPair") { text: String -> SyncEngine.init(context); val err = SyncEngine.pair(text); if (err == null) SyncService.ensure(context); err ?: "" }
    Function("syncForget") { SyncEngine.forget(); SyncService.stop(context); true }
    /** v0.8 (S9): Kotlin owns the vault folder. JS sets it only when the owner picks one; an empty value is ignored,
     *  so a start-up before settings load can never erase it. */
    Function("syncConfigure") { vaultUri: String, vaultName: String -> SyncEngine.init(context); if (vaultUri.isNotEmpty()) SyncEngine.setVault(vaultUri, vaultName.ifEmpty { null }); true }
    /** v0.8 §4.2: scan the desktop's pairing QR. "" = cancelled, "error:…" = the scanner is not available. */
    AsyncFunction("scanQr") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) { promise.resolve("error:no screen"); return@AsyncFunction }
      try {
        val opts = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(activity, opts).startScan()
          .addOnSuccessListener { promise.resolve(it.rawValue ?: "") }
          .addOnCanceledListener { promise.resolve("") }
          .addOnFailureListener { promise.resolve("error:${it.message ?: "scanner failed"}") }
      } catch (e: Exception) { promise.resolve("error:${e.message ?: "scanner failed"}") }
    }
    Function("syncVaultUri") { SyncEngine.init(context); SyncEngine.vaultUri() ?: "" }
    /** The last 200 sync events, newest first (the sync page's log). */
    Function("syncEvents") { SyncEngine.init(context); SyncEngine.store.eventsJson() }

    /* ── the vault for Margin's own data (v0.8 §1.5): task lines and generated notes, through the one writer ── */
    AsyncFunction("vaultFiles") { known: String, only: String -> SyncEngine.init(context); SyncLocal.vaultFiles(known, only) }
    AsyncFunction("vaultRead") { path: String -> SyncEngine.init(context); SyncLocal.vaultRead(path) ?: "" }
    AsyncFunction("vaultEdit") { path: String, expect: String, text: String -> SyncEngine.init(context); try { SyncLocal.vaultEdit(path, expect, text) } catch (e: Exception) { "error:${e.message ?: "failed"}" } }
    Function("vaultChanges") { SyncEngine.init(context); SyncLocal.vaultChanges() }
    Function("syncStart") { SyncService.ensure(context); SyncEngine.paired }
    Function("syncStatus") { SyncEngine.init(context); SyncEngine.statusJson().toString() }
    /** Retired in v0.8 (D4): task lines travel in the notes. Kept so an older JS bundle does not fail. */
    Function("syncPushBridge") { _: String -> true }
    Function("syncTimer") { json: String -> SyncEngine.timer(json); true }
    /** Send the phone's changes now (and connect first if needed); v0.7.1. */
    Function("syncNow") { SyncEngine.init(context); SyncService.ensure(context); SyncFiles.scanNow(); true }
    Function("syncClearErrors") { SyncEngine.init(context); SyncEngine.clearErrors(); true }
    Function("planTaskRings") { json: String -> TaskRings.plan(context, json); true }
    Function("syncDismissError") { at: Double -> SyncEngine.init(context); SyncEngine.dismissError(at.toLong()); true }
    Function("syncClashDone") { at: Double -> SyncEngine.init(context); SyncEngine.clashDone(at.toLong()); true }
    Function("syncHold") { op: String -> SyncEngine.init(context); SyncFiles.answerHold(if (op == "apply") "apply" else "cancel"); true }
    /** Rows that arrived while JS was not running: [{kind, json}], removed once read. */
    Function("syncInbox") {
      SyncEngine.init(context)
      val arr = org.json.JSONArray()
      for ((k, j) in SyncStore.get(context).takeInbox()) arr.put(org.json.JSONObject().put("kind", k).put("json", j))
      arr.toString()
    }
    /** A fresh 6-digit code for phone Obsidian (margin-bridge asks for it once). */
    Function("syncObsidianCode") { SyncEngine.init(context); SyncLocal.obsidianCode() }
    Function("syncNetworks") { SyncNet.describe() }

    Function("sdkInt") { Build.VERSION.SDK_INT }

    /* ── the look outside the app (v0.8 §2.2, §4.3, §4.4): the splash, the widget and the alarm page wear the skin ── */
    /** `json`: {mode: light|dark|auto, paperLight, paperDark, …tokens}. Read synchronously at the next launch. */
    Function("setLook") { json: String ->
      val o = org.json.JSONObject(json)
      val e = context.getSharedPreferences("margin_look", Context.MODE_PRIVATE).edit()
      val keys = o.keys(); while (keys.hasNext()) { val k = keys.next(); e.putString(k, o.optString(k)) }
      e.apply(); Surfaces.refresh(context); true
    }
    /** v0.7.7: Today's first frame is up; MainActivity lets the system splash go (SPEC §6). */
    Function("splashDone") { Splash.done = true; true }
    /** True when the APK carries the fonts (assets/fonts), so JS need not load them at start-up. */
    Function("fontsEmbedded") { try { (context.assets.list("fonts") ?: emptyArray()).any { it.startsWith("Caveat_500Medium") } } catch (e: Exception) { false } }

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
    /** Tasks ticked on the widget since JS last asked (v0.8 §4.3), as a JSON array of task ids; each is returned once. */
    Function("widgetTicks") { org.json.JSONArray(WidgetTicks.take(context).toList()).toString() }
    /** Is at least one Marrow widget on a home screen? */
    Function("hasWidgets") { Widgets.any(context) }
    /** Asks the launcher to add a widget ("now", "class", "tasks"). False when this launcher cannot. */
    Function("pinWidget") { kind: String -> if (Build.VERSION.SDK_INT < 26) false else Widgets.pin(context, kind) }
    /** v0.7.7.7 (SPEC §5): redraw the widgets after a task, timetable or skin change, without waiting for a tick. */
    Function("refreshWidgets") { Widgets.refresh(context); true }
  }
}
