package app.marginalia.nativebits

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * v0.7.8.4 (SPEC §9.9): task and exam reminders ring natively. JS still plans WHEN (`domain/reminders.ts`: quiet hours,
 * classes, "not after the due time") and hands the list over with `planTaskRings`; Kotlin arms an exact alarm for each
 * and posts the notification itself, so its two actions run with no JS:
 *  - **Done**: `TaskTick.tick` marks the task in Marrow's database and patches its note line (shared fixtures with JS),
 *    which goes out through the sync engine at once when the desktop is reachable.
 *  - **Snooze 10 min**: the same notification again in ten minutes.
 * The list is kept, so a reboot, a clock change or an app update arms it again (TickReceiver).
 */
object TaskRings {
  private const val PREFS = "margin_task_rings"
  const val ACTION_RING = "app.marginalia.nativebits.TASK_RING"
  const val ACTION_DONE = "app.marginalia.nativebits.TASK_DONE"
  const val ACTION_SNOOZE = "app.marginalia.nativebits.TASK_SNOOZE"
  /** expo-notifications' task channel (services/notifications.ts CH.tasks): one channel, one sound setting. */
  const val CHANNEL = "tasks_v2"
  const val SNOOZE_MS = 10 * 60_000L

  /** One ring: the plan item's id, when, what it says, and the task it is for ("" when Done does not apply). */
  data class Ring(val id: String, val at: Long, val title: String, val body: String, val task: String) {
    fun json(): JSONObject = JSONObject().put("id", id).put("at", at).put("title", title).put("body", body).put("task", task)
  }

  fun parse(json: String): List<Ring> {
    val a = try { JSONArray(json) } catch (e: Exception) { return emptyList() }
    return (0 until a.length()).mapNotNull { i ->
      val o = a.optJSONObject(i) ?: return@mapNotNull null
      val id = o.optString("id"); if (id.isEmpty()) return@mapNotNull null
      Ring(id, o.optLong("at"), o.optString("title", "Task"), o.optString("body", ""), o.optString("task", ""))
    }
  }

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private fun load(c: Context) = parse(prefs(c).getString("rings", "[]") ?: "[]")

  /** The plan from JS: the old rings are cancelled, the new ones armed. */
  fun plan(c: Context, json: String) {
    val app = c.applicationContext
    for (r in load(app)) cancel(app, r)
    val rings = parse(json)
    prefs(app).edit().putString("rings", JSONArray(rings.map { it.json() }).toString()).apply()
    arm(app, rings)
  }
  /** After a reboot, a clock change or an update: every ring still ahead, again. */
  fun rearm(c: Context) = arm(c.applicationContext, load(c))

  private fun arm(c: Context, rings: List<Ring>) {
    val now = System.currentTimeMillis()
    for (r in rings) if (r.at > now) set(c, r.at, intent(c, r, ACTION_RING, 0))
  }
  private fun cancel(c: Context, r: Ring) {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(intent(c, r, ACTION_RING, 0))
  }
  private fun set(c: Context, at: Long, pi: PendingIntent) {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
    else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
  }
  private fun code(r: Ring, slot: Int) = (r.id.hashCode() and 0x0FFFFFFF) * 4 + slot
  internal fun intent(c: Context, r: Ring, action: String, slot: Int): PendingIntent {
    val i = Intent(c, TaskRingReceiver::class.java).setAction(action).putExtra("ring", r.json().toString())
    return PendingIntent.getBroadcast(c, code(r, slot), i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  fun noteId(r: Ring) = 0x5000 + (r.id.hashCode() and 0x0FFFFFF)

  private fun channel(c: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL, "Tasks", NotificationManager.IMPORTANCE_HIGH))
  }

  /** The notification: title, body, a tap that opens To-do, Done (when it is a task) and Snooze 10 min. */
  fun show(c: Context, r: Ring) {
    channel(c)
    @Suppress("DEPRECATION")
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, CHANNEL) else Notification.Builder(c).setPriority(Notification.PRIORITY_HIGH)
    b.setSmallIcon(Live.smallIcon(c)).setContentTitle(r.title).setContentText(r.body).setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER).setWhen(r.at).setShowWhen(true)
      .setContentIntent(Surfaces.open(c, "marrow://tasks", 0x6000 + (r.id.hashCode() and 0xFFFF)))
    if (r.task.isNotEmpty()) b.addAction(Notification.Action.Builder(null, "Done", intent(c, r, ACTION_DONE, 1)).build())
    b.addAction(Notification.Action.Builder(null, "Snooze 10 min", intent(c, r, ACTION_SNOOZE, 2)).build())
    try { (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(noteId(r), b.build()) } catch (e: SecurityException) { }
  }

  fun snooze(c: Context, r: Ring, now: Long = System.currentTimeMillis()) = set(c, now + SNOOZE_MS, intent(c, r.copy(at = now + SNOOZE_MS), ACTION_RING, 3))
}

class TaskRingReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val r = TaskRings.parse("[${intent.getStringExtra("ring") ?: return}]").firstOrNull() ?: return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    when (intent.action) {
      TaskRings.ACTION_RING -> TaskRings.show(context, r)
      TaskRings.ACTION_SNOOZE -> { nm.cancel(TaskRings.noteId(r)); TaskRings.snooze(context, r) }
      TaskRings.ACTION_DONE -> {
        nm.cancel(TaskRings.noteId(r))
        val pending = goAsync()
        Thread {
          try { TaskTick.tick(context, r.task); Surfaces.refresh(context) } catch (e: Exception) { } finally { pending.finish() }
        }.start()
      }
    }
  }
}
