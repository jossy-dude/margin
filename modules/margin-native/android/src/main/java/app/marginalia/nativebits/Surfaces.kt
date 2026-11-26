package app.marginalia.nativebits

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * Everything Margin shows outside the app — the widgets and the pinned class notification — is redrawn from
 * the agenda by one call, `Surfaces.refresh`. It runs when JS hands over a new agenda, when a class starts or
 * ends (`Ticker`), when a widget is added or resized, and after a reboot, a clock change or an update.
 */
object Surfaces {
  fun refresh(c: Context) {
    val app = c.applicationContext
    val a = Agenda.read(app)
    val now = System.currentTimeMillis()
    try { ClassPin.update(app, a, now) } catch (e: Exception) { }
    try { Widgets.refresh(app) } catch (e: Exception) { }
    try { Ticker.arm(app, a, now) } catch (e: Exception) { }
  }

  /** Opens the app at one of its pages (`marrow://today`, `…/tasks`, `…/alarms`). */
  fun open(c: Context, link: String, code: Int): PendingIntent {
    val i = Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}

/** Wakes the surfaces at the next moment they change. One alarm at a time; each wake arms the next. */
object Ticker {
  private const val ACTION_TICK = "app.marginalia.nativebits.TICK"
  private const val ACTION_SOFT = "app.marginalia.nativebits.SOFT_TICK"

  private fun pi(c: Context, action: String, code: Int): PendingIntent =
    PendingIntent.getBroadcast(c, code, Intent(c, TickReceiver::class.java).setAction(action), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun arm(c: Context, a: Agenda, now: Long) {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    /* v0.7.7.8: Daylight's widget wears the sky of the hour, so it also wakes (without waking the phone's screen) at
       the next keyframe edge. */
    val look = Look.read(c)
    val skyEdge = if (look.daylight && look.sky == "live" && !look.phone) now + WidgetModel.nextSkyEdge(Widgets.minutesOfDay(now)) * 60_000L else Long.MAX_VALUE
    val at = minOf(a.nextBoundary(now), skyEdge)
    val hard = pi(c, ACTION_TICK, 41)
    try {
      if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, hard)
      else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, hard)
    } catch (e: SecurityException) {
      am.set(AlarmManager.RTC_WAKEUP, at, hard)
    }
    /* While a class runs, its progress bar is nudged along every few minutes. This one never wakes the phone:
       a bar nobody is looking at does not need to move. */
    val soft = pi(c, ACTION_SOFT, 42)
    if (a.current(now) != null) am.set(AlarmManager.RTC, now + 4 * 60_000L, soft) else am.cancel(soft)
  }
}

class TickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    Surfaces.refresh(context)
    /* The sync service starts at boot (it may not start later from a network change) and piggybacks a short
       catch-up on each class boundary that already wakes the phone (SYNC_ANDROID.md §4). */
    try { SyncService.ensure(context, catchup = intent.action != Intent.ACTION_BOOT_COMPLETED) } catch (e: Exception) { }
    /* A reboot, a clock or timezone change, or an update of the app drops every alarm that was set. */
    val act = intent.action ?: return
    if (act == Intent.ACTION_BOOT_COMPLETED || act == Intent.ACTION_TIME_CHANGED || act == Intent.ACTION_TIMEZONE_CHANGED || act == Intent.ACTION_MY_PACKAGE_REPLACED) {
      try { AlarmClock.arm(context.applicationContext) } catch (e: Exception) { }
    }
  }
}

/** The pinned notification for the class that is running: its name, room, time left and what comes after. */
object ClassPin {
  private const val PREFS = "margin_native_pin"
  private const val KEY = "pinned"

  fun update(c: Context, a: Agenda, now: Long) {
    val prefs = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val was = prefs.getString(KEY, null)
    val cur = if (a.pinClass) a.current(now) else null
    val id = if (cur != null) "class:${cur.key}" else null
    if (was != null && was != id) { Live.hide(c, was); Live.forget(c, was) }
    if (cur == null || id == null) { if (was != null) prefs.edit().remove(KEY).apply(); return }
    val next = a.lessons.filter { it.start >= cur.end }.minByOrNull { it.start }
    val line = listOf(cur.room, "until ${Fmt.time(cur.end, a.hour12)}").filter { it.isNotEmpty() }.joinToString(" · ")
    val then = if (next != null && Agenda.startOfDay(next.start) == Agenda.startOfDay(now))
      "Then ${next.title} at ${Fmt.time(next.start, a.hour12)}${if (next.room.isNotEmpty()) " · ${next.room}" else ""}"
    else "Last class of the day"
    val total = ((cur.end - cur.start) / 60_000L).toInt().coerceAtLeast(1)
    val done = ((now - cur.start) / 60_000L).toInt().coerceIn(0, total)
    Live.showClass(c, id, cur.title, line, then, cur.end, total, done, "marrow://today")
    if (was != id) prefs.edit().putString(KEY, id).apply()
  }
}

/** Tasks ticked on a widget, until Marrow's JS takes them (`widgetTicks()`). The Tasks widget (0.7.7.9) writes here. */
object WidgetTicks {
  private const val PREFS = "margin_widget_ticks"
  fun pending(c: Context): Set<String> = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("ids", emptySet()) ?: emptySet()
  fun add(c: Context, id: String) { val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); p.edit().putStringSet("ids", pending(c) + id).apply() }
  fun take(c: Context): Set<String> { val s = pending(c); c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("ids").apply(); return s }
}
