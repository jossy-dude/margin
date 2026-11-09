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
/** The class that is on now, or the next one: name, room, time left. */
class NextClassWidget : MarginWidget()
/** The day's timetable. */
class TodayWidget : MarginWidget()
/** What is due. */
class TasksWidget : MarginWidget()

object Widgets {
  /** True when at least one Margin widget is on a home screen. */
  fun any(c: Context): Boolean {
    val mgr = AppWidgetManager.getInstance(c)
    return listOf(NextClassWidget::class.java, TodayWidget::class.java, TasksWidget::class.java).any { mgr.getAppWidgetIds(ComponentName(c, it)).isNotEmpty() }
  }

  fun updateAll(c: Context, a: Agenda, now: Long) {
    val mgr = AppWidgetManager.getInstance(c)
    for (id in mgr.getAppWidgetIds(ComponentName(c, NextClassWidget::class.java))) mgr.updateAppWidget(id, nextClass(c, a, now))
    for (id in mgr.getAppWidgetIds(ComponentName(c, TodayWidget::class.java))) mgr.updateAppWidget(id, today(c, a, now, rowsFor(mgr, id, 44, 42)))
    for (id in mgr.getAppWidgetIds(ComponentName(c, TasksWidget::class.java))) mgr.updateAppWidget(id, tasks(c, a, now, rowsFor(mgr, id, 44, 42)))
  }

  /** How many rows fit: the widget's height in dp, less its header, over one row. */
  private fun rowsFor(mgr: AppWidgetManager, id: Int, header: Int, row: Int): Int {
    val h = mgr.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0)
    if (h <= 0) return 3
    return ((h - header) / row).coerceIn(1, 10)
  }

  private fun countdown(rv: RemoteViews, id: Int, target: Long, now: Long) {
    rv.setChronometer(id, SystemClock.elapsedRealtime() + (target - now), null, true)
    rv.setChronometerCountDown(id, true)
  }

  private fun nextClass(c: Context, a: Agenda, now: Long): RemoteViews {
    val rv = RemoteViews(c.packageName, R.layout.mg_widget_next)
    rv.setOnClickPendingIntent(R.id.mg_root, Surfaces.open(c, "marginalia://today", 51))
    val cur = a.current(now)
    val next = a.next(now)
    val l = cur ?: next
    if (l == null) {
      rv.setTextViewText(R.id.mg_state, "Margin")
      rv.setTextViewText(R.id.mg_room, "")
      rv.setTextViewText(R.id.mg_title, if (a.writtenAt == 0L) "Open Margin once to fill this in" else "No classes coming up")
      rv.setViewVisibility(R.id.mg_count_row, View.GONE)
      rv.setViewVisibility(R.id.mg_when, View.GONE)
      rv.setViewVisibility(R.id.mg_bar, View.GONE)
      rv.setTextViewText(R.id.mg_after, "")
      return rv
    }
    rv.setTextViewText(R.id.mg_title, l.title)
    rv.setTextViewText(R.id.mg_room, l.room)
    if (cur != null) {
      rv.setTextViewText(R.id.mg_state, "Now")
      rv.setViewVisibility(R.id.mg_count_row, View.VISIBLE)
      rv.setViewVisibility(R.id.mg_when, View.GONE)
      countdown(rv, R.id.mg_count, cur.end, now)
      rv.setTextViewText(R.id.mg_unit, "left")
      val total = ((cur.end - cur.start) / 60_000L).toInt().coerceAtLeast(1)
      rv.setViewVisibility(R.id.mg_bar, View.VISIBLE)
      rv.setProgressBar(R.id.mg_bar, total, ((now - cur.start) / 60_000L).toInt().coerceIn(0, total), false)
      val then = a.lessons.filter { it.start >= cur.end && Agenda.startOfDay(it.start) == Agenda.startOfDay(now) }.minByOrNull { it.start }
      rv.setTextViewText(R.id.mg_after, if (then != null) "Then ${then.title} · ${Fmt.time(then.start, a.hour12)}" else "Last class of the day")
    } else {
      val soon = l.start - now <= 3 * 3_600_000L
      rv.setTextViewText(R.id.mg_state, if (Agenda.startOfDay(l.start) == Agenda.startOfDay(now)) "Next up" else "Next · ${Fmt.day(l.start, now)}")
      rv.setViewVisibility(R.id.mg_bar, View.GONE)
      if (soon) {
        rv.setViewVisibility(R.id.mg_count_row, View.VISIBLE)
        rv.setViewVisibility(R.id.mg_when, View.GONE)
        countdown(rv, R.id.mg_count, l.start, now)
        rv.setTextViewText(R.id.mg_unit, "until it starts")
      } else {
        rv.setViewVisibility(R.id.mg_count_row, View.GONE)
        rv.setViewVisibility(R.id.mg_when, View.VISIBLE)
        rv.setTextViewText(R.id.mg_when, Fmt.time(l.start, a.hour12))
      }
      rv.setTextViewText(R.id.mg_after, "${Fmt.time(l.start, a.hour12)} – ${Fmt.time(l.end, a.hour12)}${if (l.who.isNotEmpty()) " · ${l.who}" else ""}")
    }
    return rv
  }

  private fun today(c: Context, a: Agenda, now: Long, rows: Int): RemoteViews {
    val rv = RemoteViews(c.packageName, R.layout.mg_widget_today)
    rv.setOnClickPendingIntent(R.id.mg_root, Surfaces.open(c, "marginalia://today", 52))
    rv.removeAllViews(R.id.mg_rows)
    /* Today, while anything of it is left; after the last bell, the next day that has classes. */
    var day = now
    var list = a.today(now)
    if (list.none { it.end > now }) {
      val n = a.next(now)
      if (n != null) { day = n.start; list = a.today(n.start) } else list = emptyList()
    }
    val isToday = Agenda.startOfDay(day) == Agenda.startOfDay(now)
    rv.setTextViewText(R.id.mg_date, if (isToday) Fmt.date(day) else "${Fmt.day(day, now).replaceFirstChar { it.uppercase() }} · ${Fmt.date(day)}")
    rv.setTextViewText(R.id.mg_count, when (list.size) { 0 -> ""; 1 -> "1 class"; else -> "${list.size} classes" })
    if (list.isEmpty()) {
      rv.setViewVisibility(R.id.mg_empty, View.VISIBLE)
      rv.setTextViewText(R.id.mg_empty, if (a.writtenAt == 0L) "Open Margin once to fill this in." else "No classes coming up.")
      return rv
    }
    rv.setViewVisibility(R.id.mg_empty, View.GONE)
    /* When they do not all fit, start at the first class that is not over yet. */
    var from = 0
    if (list.size > rows) { from = list.indexOfFirst { it.end > now }.coerceAtLeast(0); if (from + rows > list.size) from = list.size - rows }
    val ink = c.getColor(R.color.mg_ink)
    val mut = c.getColor(R.color.mg_mut)
    for (l in list.drop(from).take(rows)) {
      val row = RemoteViews(c.packageName, R.layout.mg_row_class)
      val live = isToday && l.start <= now && now < l.end
      val over = isToday && l.end <= now
      row.setTextViewText(R.id.mg_r_start, Fmt.time(l.start, a.hour12))
      row.setTextViewText(R.id.mg_r_end, Fmt.time(l.end, a.hour12))
      row.setTextViewText(R.id.mg_r_title, l.title)
      row.setTextViewText(R.id.mg_r_sub, listOf(l.room, l.who).filter { it.isNotEmpty() }.joinToString(" · "))
      row.setTextColor(R.id.mg_r_start, if (over) mut else ink)
      row.setTextColor(R.id.mg_r_title, if (over) mut else ink)
      row.setInt(R.id.mg_r_root, "setBackgroundResource", if (live) R.drawable.mg_row_now else 0)
      row.setViewVisibility(R.id.mg_r_live, if (live) View.VISIBLE else View.GONE)
      rv.addView(R.id.mg_rows, row)
    }
    return rv
  }

  private fun tasks(c: Context, a: Agenda, now: Long, rows: Int): RemoteViews {
    val rv = RemoteViews(c.packageName, R.layout.mg_widget_tasks)
    rv.setOnClickPendingIntent(R.id.mg_root, Surfaces.open(c, "marginalia://tasks", 53))
    rv.setOnClickPendingIntent(R.id.mg_add, Surfaces.open(c, "marginalia://add/task", 54))
    rv.removeAllViews(R.id.mg_rows)
    val list = a.todos.filter { it.due > 0L }.sortedBy { it.due }
    val late = list.count { it.due < now }
    rv.setTextViewText(R.id.mg_count, when { late > 0 -> "$late overdue"; list.isEmpty() -> ""; list.size == 1 -> "1 open"; else -> "${list.size} open" })
    rv.setTextColor(R.id.mg_count, c.getColor(if (late > 0) R.color.mg_bad else R.color.mg_mut))
    if (list.isEmpty()) {
      rv.setViewVisibility(R.id.mg_empty, View.VISIBLE)
      rv.setTextViewText(R.id.mg_empty, if (a.writtenAt == 0L) "Open Margin once to fill this in." else "Nothing due. Nice.")
      return rv
    }
    rv.setViewVisibility(R.id.mg_empty, View.GONE)
    val bad = c.getColor(R.color.mg_bad)
    val mut = c.getColor(R.color.mg_mut)
    for (t in list.take(rows)) {
      val row = RemoteViews(c.packageName, R.layout.mg_row_task)
      row.setTextViewText(R.id.mg_r_title, t.title)
      row.setTextViewText(R.id.mg_r_sub, t.subject)
      row.setViewVisibility(R.id.mg_r_sub, if (t.subject.isEmpty()) View.GONE else View.VISIBLE)
      val overdue = t.due < now
      row.setTextViewText(R.id.mg_r_due, if (overdue) Fmt.due(t.due, now) else "${Fmt.day(t.due, now)} ${Fmt.time(t.due, a.hour12)}")
      row.setTextColor(R.id.mg_r_due, if (overdue) bad else mut)
      rv.addView(R.id.mg_rows, row)
    }
    return rv
  }
}
