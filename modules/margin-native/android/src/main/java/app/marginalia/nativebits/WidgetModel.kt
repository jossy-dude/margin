package app.marginalia.nativebits

/**
 * v0.7.7.8 (SPEC §5): what the Now and Class widgets say, worked out with no Android in it, so the JVM tests in CI
 * hold it (`WidgetModelTest`). The widgets only lay this out.
 *
 * Labels use absolute times ("until 10:55"), which never go stale between redraws; the only moving thing is the
 * countdown, a system Chronometer counting to `target`.
 */
object WidgetModel {
  enum class Kind { EMPTY, NOW, NEXT, NONE }

  class ClassView(
    val kind: Kind,
    /** "Now · until 10:55", "Next · 10:00", "No class today", "Done for today", or the empty state's line. */
    val state: String,
    /** The class's name ("Computer Programming · Lab"), empty when there is none. */
    val title: String,
    /** "LAB301 · Reyes" */
    val place: String,
    /** The countdown's moment: the end of the class on now, the start of the next; 0 for none. */
    val target: Long,
    /** How far through the class (0..1); null hides the bar. */
    val progress: Float?,
    /** "Then Economics 10:55 · B-12", "Last class of the day", or "Next: Tomorrow 09:00 · Database Systems". */
    val footer: String,
  )

  const val EMPTY_LINE = "Open Marrow to set up your week"

  fun classView(a: Agenda, now: Long): ClassView {
    if (a.writtenAt == 0L) return ClassView(Kind.EMPTY, EMPTY_LINE, "", "", 0L, null, "")
    val h12 = a.hour12
    val today = a.today(now)
    val cur = a.current(now)
    if (cur != null) {
      val total = (cur.end - cur.start).toFloat().coerceAtLeast(1f)
      return ClassView(Kind.NOW, "Now · until ${Fmt.time(cur.end, h12)}", cur.title, place(cur), cur.end,
        ((now - cur.start) / total).coerceIn(0f, 1f), then(today, cur, h12))
    }
    val next = a.next(now)
    if (next != null && Agenda.startOfDay(next.start) == Agenda.startOfDay(now)) {
      return ClassView(Kind.NEXT, "Next · ${Fmt.time(next.start, h12)}", next.title, place(next), next.start, null, then(today, next, h12))
    }
    val state = if (today.isEmpty()) "No class today" else "Done for today"
    val footer = if (next == null) "" else "Next: ${Fmt.day(next.start, now).replaceFirstChar { it.uppercase() }} ${Fmt.time(next.start, h12)} · ${next.title}"
    return ClassView(Kind.NONE, state, "", "", 0L, null, footer)
  }

  fun place(l: Lesson): String = listOf(l.room, l.who).filter { it.isNotEmpty() }.joinToString(" · ")

  /** The class after `l` today, or that `l` is the last one. */
  private fun then(today: List<Lesson>, l: Lesson, h12: Boolean): String {
    val after = today.filter { it.start >= l.end }.minByOrNull { it.start } ?: return "Last class of the day"
    return "Then ${after.title} ${Fmt.time(after.start, h12)}${if (after.room.isNotEmpty()) " · ${after.room}" else ""}"
  }

  /** The tasks that most need you, most urgent first (late, then due time pulled earlier by priority). */
  fun urgent(a: Agenda, now: Long, skip: Set<String> = emptySet(), n: Int = 1): List<Todo> =
    a.todos.filter { it.id !in skip }.sortedBy { it.urgency(now) }.take(n)

  /** A task's due line, absolute so it never goes stale: "16:00", "Tue 09:00", "Late · Mon 23:59". */
  fun dueLine(t: Todo, now: Long, h12: Boolean): String {
    val day = Fmt.day(t.due, now)
    val at = if (day == "today") Fmt.time(t.due, h12) else "${day.replaceFirstChar { it.uppercase() }} ${Fmt.time(t.due, h12)}"
    return if (t.due < now) "Late · $at" else at
  }

  /**
   * The layout a widget gets for its height. `h` is the height in dp divided by the font scale, so 1.3× text picks the
   * layout a smaller widget would, instead of clipping. The name always has a line of its own; each step adds a line
   * only when the sum fits (padding 14 + 14; name 18–20 sp ≈ 23–26 dp; state 12 sp ≈ 16 and room 14 sp ≈ 19 beside a
   * 22–28 sp countdown ≈ 27–34; bar 4–6 + gap 8; footer ≈ 19 + 8; task row 48 + 8):
   *   4×1 tight  < 64: name and countdown on one row, bar            ≈ 58
   *   4×1        < 100: name / state + countdown, bar                ≈ 92
   *   4×2        < 132: name / state, room + countdown, bar          ≈ 103
   *   4×2 tall   < 190: + "Then Economics 10:55 · B-12"              ≈ 130
   *   4×3 and up      : + the one task that most needs you           ≈ 186
   */
  class ClassLayout(val state: Boolean, val place: Boolean, val footer: Boolean, val task: Boolean, val big: Boolean)
  fun classLayout(h: Float): ClassLayout = when {
    h < 64f -> ClassLayout(state = false, place = false, footer = false, task = false, big = false)
    h < 100f -> ClassLayout(state = true, place = false, footer = false, task = false, big = false)
    h < 132f -> ClassLayout(state = true, place = true, footer = false, task = false, big = true)
    h < 190f -> ClassLayout(state = true, place = true, footer = true, task = false, big = true)
    else -> ClassLayout(state = true, place = true, footer = true, task = true, big = true)
  }
  /** Tasks: the rows that fit under the 32 dp header (padding 28, gap 4, 48 dp a row), one to four. */
  fun taskRows(h: Float): Int = ((h - 28f - 32f - 4f) / 48f).toInt().coerceIn(1, 4)
  const val NOTHING_DUE = "Nothing due. Enjoy it."

  /** Now (2×1) stacks state, name, countdown and bar once there is room (≈ 97 dp); below that, the name over a row of
   *  bar (or "Next · 10:55") and countdown (≈ 64 dp). */
  fun nowStacked(h: Float): Boolean = h >= 100f

  /** Daylight's sky keyframe at a minute of the day; the app's `skyAt` (src/tokens/v2.ts), edge for edge. */
  fun skyAt(minutes: Int): String {
    val m = ((minutes % 1440) + 1440) % 1440
    return when {
      m < 300 || m >= 1260 -> "night"
      m < 420 -> "dawn"
      m < 660 -> "morning"
      m < 840 -> "noon"
      m < 1050 -> "afternoon"
      else -> "dusk"
    }
  }
  /** The sky the widget shows: the clock's keyframe when `live`, noon or night when `still` or `off`. */
  fun skyFor(mode: String, dark: Boolean, minutes: Int): String =
    if (mode == "live") skyAt(minutes) else if (dark) "night" else "noon"
  /** Minutes until the next keyframe edge, so the widget's sky turns with the app's. */
  fun nextSkyEdge(minutes: Int): Int {
    val m = ((minutes % 1440) + 1440) % 1440
    return (intArrayOf(300, 420, 660, 840, 1050, 1260, 1740).first { it > m }) - m
  }
}
