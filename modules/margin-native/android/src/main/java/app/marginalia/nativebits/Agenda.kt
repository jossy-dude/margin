package app.marginalia.nativebits

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * The agenda: what the app's JS side knows, written down for the parts of Margin that run without it —
 * the home-screen widgets, the pinned class notification and the alarms. JS writes one JSON document
 * (`src/domain/agenda.ts`) whenever the planner changes; everything here only reads it.
 *
 * It holds the next two weeks of classes as concrete instants (cancelled ones already left out), the open
 * tasks by due date, and the alarm rules. Reading is total: a missing or damaged document is an empty agenda.
 */
class Lesson(val key: String, val start: Long, val end: Long, val title: String, val room: String, val who: String)
class Todo(val id: String, val title: String, val due: Long, val subject: String, val kind: String)
class AlarmRule(
  val id: String, val label: String, val hour: Int, val minute: Int, val days: BooleanArray,
  /** Concrete instants, for an alarm that follows the timetable ("before my first class"). Empty for a clock alarm. */
  val at: LongArray, val snoozeMin: Int, val vibrate: Boolean, val on: Boolean,
)

class Agenda(
  val writtenAt: Long, val hour12: Boolean, val pinClass: Boolean,
  val lessons: List<Lesson>, val todos: List<Todo>, val alarms: List<AlarmRule>,
) {
  /** The class running at `now`, if any. With two at once, the one that started last. */
  fun current(now: Long): Lesson? = lessons.filter { it.start <= now && now < it.end }.maxByOrNull { it.start }
  /** The first class that starts after `now`. */
  fun next(now: Long): Lesson? = lessons.filter { it.start > now }.minByOrNull { it.start }
  /** The classes of the local day that contains `now`. */
  fun today(now: Long): List<Lesson> {
    val a = startOfDay(now); val b = a + DAY
    return lessons.filter { it.start in a until b }.sortedBy { it.start }
  }
  /** The next moment anything on a surface changes: a class starts or ends, or the day turns. */
  fun nextBoundary(now: Long): Long {
    var best = startOfDay(now) + DAY + 1000L
    for (l in lessons) {
      if (l.start > now && l.start < best) best = l.start
      if (l.end > now && l.end < best) best = l.end
    }
    return best
  }

  companion object {
    const val DAY = 86_400_000L
    private const val PREFS = "margin_agenda"
    private const val KEY = "json"
    val EMPTY = Agenda(0L, false, true, emptyList(), emptyList(), emptyList())

    fun startOfDay(ms: Long): Long {
      val c = Calendar.getInstance()
      c.timeInMillis = ms
      c.set(Calendar.HOUR_OF_DAY, 0); c.set(Calendar.MINUTE, 0); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      return c.timeInMillis
    }

    fun write(c: Context, json: String) {
      c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
    }

    fun read(c: Context): Agenda {
      val raw = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return EMPTY
      return try { parse(JSONObject(raw)) } catch (e: Exception) { EMPTY }
    }

    private fun arr(o: JSONObject, k: String): JSONArray = o.optJSONArray(k) ?: JSONArray()

    private fun parse(o: JSONObject): Agenda {
      val lessons = ArrayList<Lesson>()
      val ls = arr(o, "classes")
      for (i in 0 until ls.length()) {
        val x = ls.optJSONObject(i) ?: continue
        val s = x.optLong("s", 0L); val e = x.optLong("e", 0L)
        if (e <= s) continue
        lessons.add(Lesson(x.optString("k", "c$i"), s, e, x.optString("t", "Class"), x.optString("r", ""), x.optString("w", "")))
      }
      val todos = ArrayList<Todo>()
      val ts = arr(o, "tasks")
      for (i in 0 until ts.length()) {
        val x = ts.optJSONObject(i) ?: continue
        todos.add(Todo(x.optString("id", "t$i"), x.optString("t", "Task"), x.optLong("d", 0L), x.optString("s", ""), x.optString("k", "")))
      }
      val alarms = ArrayList<AlarmRule>()
      val al = arr(o, "alarms")
      for (i in 0 until al.length()) {
        val x = al.optJSONObject(i) ?: continue
        val days = BooleanArray(7)
        val ds = arr(x, "days")
        for (d in 0 until 7) days[d] = ds.optBoolean(d, false)
        val ats = arr(x, "at")
        val at = LongArray(ats.length()) { ats.optLong(it, 0L) }
        alarms.add(AlarmRule(
          x.optString("id", "a$i"), x.optString("label", ""), x.optInt("h", 7).coerceIn(0, 23), x.optInt("m", 0).coerceIn(0, 59),
          days, at, x.optInt("snooze", 10).coerceIn(1, 60), x.optBoolean("vib", true), x.optBoolean("on", true),
        ))
      }
      return Agenda(o.optLong("at", 0L), o.optBoolean("h12", false), o.optBoolean("pinClass", true), lessons, todos, alarms)
    }
  }
}

/** Times of day and short dates, in the app's own 12/24-hour choice. */
object Fmt {
  private val DAYS = arrayOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
  private val MONTHS = arrayOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
  private fun cal(ms: Long): Calendar { val c = Calendar.getInstance(); c.timeInMillis = ms; return c }
  private fun two(n: Int) = if (n < 10) "0$n" else "$n"

  fun time(ms: Long, h12: Boolean): String {
    val c = cal(ms); val h = c.get(Calendar.HOUR_OF_DAY); val m = c.get(Calendar.MINUTE)
    if (!h12) return "${two(h)}:${two(m)}"
    val hh = if (h % 12 == 0) 12 else h % 12
    return "$hh:${two(m)} ${if (h < 12) "AM" else "PM"}"
  }
  fun hm(hour: Int, minute: Int, h12: Boolean): String {
    if (!h12) return "${two(hour)}:${two(minute)}"
    val hh = if (hour % 12 == 0) 12 else hour % 12
    return "$hh:${two(minute)} ${if (hour < 12) "AM" else "PM"}"
  }
  /** "Tue 10 Nov" */
  fun date(ms: Long): String { val c = cal(ms); return "${DAYS[c.get(Calendar.DAY_OF_WEEK) - 1]} ${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}" }
  /** "today", "tomorrow", or the weekday — for a moment relative to now. */
  fun day(ms: Long, now: Long): String {
    val d = ((Agenda.startOfDay(ms) - Agenda.startOfDay(now) + Agenda.DAY / 2) / Agenda.DAY).toInt()
    return when {
      d == 0 -> "today"
      d == 1 -> "tomorrow"
      d == -1 -> "yesterday"
      d in 2..6 -> DAYS[cal(ms).get(Calendar.DAY_OF_WEEK) - 1]
      else -> { val c = cal(ms); "${c.get(Calendar.DAY_OF_MONTH)} ${MONTHS[c.get(Calendar.MONTH)]}" }
    }
  }
  /** How late or how soon, in the app's short form: "3 h late", "in 2 d", "in 40 min". */
  fun due(due: Long, now: Long): String {
    val late = due < now
    val min = Math.abs(due - now) / 60_000L
    val span = when {
      min < 60 -> "$min min"
      min < 60 * 24 -> "${min / 60} h"
      else -> "${min / (60 * 24)} d"
    }
    return if (late) "$span late" else "in $span"
  }
  fun span(minutes: Long): String = if (minutes >= 60) "${minutes / 60} h ${minutes % 60} min" else "$minutes min"
}
