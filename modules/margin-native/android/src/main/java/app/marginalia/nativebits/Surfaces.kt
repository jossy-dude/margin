package app.marginalia.nativebits

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

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
    try { Widgets.updateAll(app, a, now) } catch (e: Exception) { }
    try { Ticker.arm(app, a, now) } catch (e: Exception) { }
  }

  /** Opens the app at one of its pages (`marginalia://today`, `…/tasks`, `…/alarms`). */
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
    val at = a.nextBoundary(now)
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
    Live.showClass(c, id, cur.title, line, then, cur.end, total, done, "marginalia://today")
    if (was != id) prefs.edit().putString(KEY, id).apply()
  }
}

/* ── widgets ─────────────────────────────────────────────────────────────────────────────────────── */

abstract class MarginWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) { Surfaces.refresh(context) }
  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) { Surfaces.refresh(context) }
  override fun onEnabled(context: Context) { Surfaces.refresh(context) }
}
/** The one home-screen widget: the class that is on, the day's timetable and what is due, on one card. */
class BoardWidget : MarginWidget()

/**
 * v0.8 §4.3: one card that looks like Today's Now card in the current skin. 4×1: the class line; 4×2 (default): the
 * class with its bar and minutes left, then the next two due tasks with tap-to-tick; 4×3: up to five tasks and
 * tomorrow's first class. Every list says how many it left out. Redrawn on class boundaries, task and theme changes.
 */
object Widgets {
  fun any(c: Context): Boolean = AppWidgetManager.getInstance(c).getAppWidgetIds(ComponentName(c, BoardWidget::class.java)).isNotEmpty()

  fun updateAll(c: Context, a: Agenda, now: Long) {
    val mgr = AppWidgetManager.getInstance(c)
    val look = Look.read(c)
    val ticked = WidgetTicks.pending(c)
    for (id in mgr.getAppWidgetIds(ComponentName(c, BoardWidget::class.java))) {
      val h = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
      val size = when { h in 1..99 -> 1; h in 100..199 || h == 0 -> 2; else -> 3 }
      mgr.updateAppWidget(id, card(c, a, now, size, look, ticked))
    }
  }

  private fun card(c: Context, a: Agenda, now: Long, size: Int, look: Look, ticked: Set<String>): RemoteViews {
    val rv = RemoteViews(c.packageName, R.layout.mg_widget_card)
    if (Build.VERSION.SDK_INT >= 31) rv.setColorStateList(R.id.mg_w_root, "setBackgroundTintList", android.content.res.ColorStateList.valueOf(look.card))
    else rv.setInt(R.id.mg_w_root, "setBackgroundColor", look.card)
    for (v in intArrayOf(R.id.mg_w_title, R.id.mg_w_count, R.id.mg_w_when)) rv.setTextColor(v, look.ink)
    for (v in intArrayOf(R.id.mg_w_state, R.id.mg_w_sub, R.id.mg_w_more, R.id.mg_w_tomorrow)) rv.setTextColor(v, look.mut)
    if (Build.VERSION.SDK_INT >= 31) rv.setColorStateList(R.id.mg_w_bar, "setProgressTintList", android.content.res.ColorStateList.valueOf(look.acc))
    rv.setOnClickPendingIntent(R.id.mg_w_class, Surfaces.open(c, "marginalia://today", 51))
    classLine(rv, a, now)
    // tasks: what fits, and how many were left out
    val list = a.todos.filter { it.due > 0L && it.id !in ticked }.sortedBy { it.due }
    val room = when (size) { 1 -> 0; 2 -> 2; else -> 5 }
    rv.removeAllViews(R.id.mg_w_tasks)
    rv.setViewVisibility(R.id.mg_w_tasks, if (room > 0) View.VISIBLE else View.GONE)
    for ((i, t) in list.take(room).withIndex()) rv.addView(R.id.mg_w_tasks, taskRow(c, a, t, now, look, i))
    val left = list.size - minOf(list.size, room)
    rv.setViewVisibility(R.id.mg_w_more, if (room > 0 && (left > 0 || list.isEmpty())) View.VISIBLE else View.GONE)
    rv.setTextViewText(R.id.mg_w_more, when { list.isEmpty() -> if (a.writtenAt == 0L) "Open Margin once to fill this in." else "Nothing due."; else -> "+$left more" })
    rv.setOnClickPendingIntent(R.id.mg_w_more, Surfaces.open(c, "marginalia://tasks", 53))
    // 4×3: tomorrow's first class
    val tmr = if (size >= 3) a.lessons.filter { Agenda.startOfDay(it.start) == Agenda.startOfDay(now) + Agenda.DAY }.minByOrNull { it.start } else null
    rv.setViewVisibility(R.id.mg_w_tomorrow, if (tmr != null) View.VISIBLE else View.GONE)
    if (tmr != null) rv.setTextViewText(R.id.mg_w_tomorrow, "Tomorrow ${Fmt.time(tmr.start, a.hour12)} · ${tmr.title}${if (tmr.room.isNotEmpty()) " · ${tmr.room}" else ""}")
    return rv
  }

  private fun classLine(rv: RemoteViews, a: Agenda, now: Long) {
    val cur = a.current(now); val next = a.next(now); val l = cur ?: next
    if (l == null) {
      rv.setTextViewText(R.id.mg_w_state, "Margin"); rv.setTextViewText(R.id.mg_w_title, if (a.writtenAt == 0L) "Open Margin once" else "No classes coming up")
      rv.setViewVisibility(R.id.mg_w_count, View.GONE); rv.setViewVisibility(R.id.mg_w_when, View.GONE); rv.setViewVisibility(R.id.mg_w_bar, View.GONE)
      rv.setTextViewText(R.id.mg_w_sub, ""); return
    }
    rv.setTextViewText(R.id.mg_w_title, l.title)
    if (cur != null) {
      rv.setTextViewText(R.id.mg_w_state, "Now")
      rv.setViewVisibility(R.id.mg_w_count, View.VISIBLE); rv.setViewVisibility(R.id.mg_w_when, View.GONE)
      rv.setChronometer(R.id.mg_w_count, SystemClock.elapsedRealtime() + (cur.end - now), null, true); rv.setChronometerCountDown(R.id.mg_w_count, true)
      val total = ((cur.end - cur.start) / 60_000L).toInt().coerceAtLeast(1)
      rv.setViewVisibility(R.id.mg_w_bar, View.VISIBLE); rv.setProgressBar(R.id.mg_w_bar, total, ((now - cur.start) / 60_000L).toInt().coerceIn(0, total), false)
      val then = a.lessons.filter { it.start >= cur.end && Agenda.startOfDay(it.start) == Agenda.startOfDay(now) }.minByOrNull { it.start }
      val left = ((cur.end - now) / 60_000L).coerceAtLeast(0)
      rv.setTextViewText(R.id.mg_w_sub, listOf(cur.room, "$left min left", if (then != null) "then ${then.title} ${Fmt.time(then.start, a.hour12)}" else "last class today").filter { it.isNotEmpty() }.joinToString(" · "))
    } else {
      val today = Agenda.startOfDay(l.start) == Agenda.startOfDay(now)
      rv.setTextViewText(R.id.mg_w_state, if (today) "Next" else Fmt.day(l.start, now).replaceFirstChar { it.uppercase() })
      rv.setViewVisibility(R.id.mg_w_bar, View.GONE)
      if (today && l.start - now <= 3 * 3_600_000L) {
        rv.setViewVisibility(R.id.mg_w_count, View.VISIBLE); rv.setViewVisibility(R.id.mg_w_when, View.GONE)
        rv.setChronometer(R.id.mg_w_count, SystemClock.elapsedRealtime() + (l.start - now), null, true); rv.setChronometerCountDown(R.id.mg_w_count, true)
      } else {
        rv.setViewVisibility(R.id.mg_w_count, View.GONE); rv.setViewVisibility(R.id.mg_w_when, View.VISIBLE); rv.setTextViewText(R.id.mg_w_when, Fmt.time(l.start, a.hour12))
      }
      rv.setTextViewText(R.id.mg_w_sub, listOf(l.room, "${Fmt.time(l.start, a.hour12)}–${Fmt.time(l.end, a.hour12)}", l.who).filter { it.isNotEmpty() }.joinToString(" · "))
    }
  }

  private fun taskRow(c: Context, a: Agenda, t: Todo, now: Long, look: Look, i: Int): RemoteViews {
    val row = RemoteViews(c.packageName, R.layout.mg_row_tick)
    row.setTextViewText(R.id.mg_t_title, t.title); row.setTextColor(R.id.mg_t_title, look.ink)
    val overdue = t.due < now
    row.setTextViewText(R.id.mg_t_due, if (overdue) Fmt.due(t.due, now) else "${Fmt.day(t.due, now)} ${Fmt.time(t.due, a.hour12)}")
    row.setTextColor(R.id.mg_t_due, if (overdue) c.getColor(R.color.mg_bad) else look.mut)
    if (Build.VERSION.SDK_INT >= 31) {
      // tap-to-tick: the box records the tick here; Margin's JS marks the task done on its next start
      val pi = android.app.PendingIntent.getBroadcast(c, 6000 + (t.id.hashCode() and 0xfff), Intent(c, WidgetTickReceiver::class.java).putExtra("id", t.id),
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE)
      row.setCompoundButtonChecked(R.id.mg_t_box, false)
      row.setOnCheckedChangeResponse(R.id.mg_t_box, RemoteViews.RemoteResponse.fromPendingIntent(pi))
    } else row.setViewVisibility(R.id.mg_t_box, View.GONE)
    row.setOnClickPendingIntent(R.id.mg_t_root, Surfaces.open(c, "marginalia://tasks", 60 + i))
    return row
  }
}

/** Tasks ticked on the widget, until Margin's JS takes them (`widgetTicks()`). */
object WidgetTicks {
  private const val PREFS = "margin_widget_ticks"
  fun pending(c: Context): Set<String> = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet("ids", emptySet()) ?: emptySet()
  fun add(c: Context, id: String) { val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); p.edit().putStringSet("ids", pending(c) + id).apply() }
  fun take(c: Context): Set<String> { val s = pending(c); c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("ids").apply(); return s }
}
class WidgetTickReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    WidgetTicks.add(context, id)
    Surfaces.refresh(context)
  }
}
