package app.marginalia.nativebits

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/** v0.7.7.8 (SPEC §5 Tests): the widgets' states, urgency order and layout choice, on the JVM in CI. */
class WidgetModelTest {
  companion object {
    @BeforeClass @JvmStatic fun zone() { TimeZone.setDefault(TimeZone.getTimeZone("Asia/Manila")) }
  }

  /** 2026-11-26 (a Thursday) at h:m, local time. */
  private fun at(h: Int, m: Int, dayOffset: Int = 0): Long {
    val c = Calendar.getInstance()
    c.set(2026, Calendar.NOVEMBER, 26 + dayOffset, h, m, 0); c.set(Calendar.MILLISECOND, 0)
    return c.timeInMillis
  }
  private fun lesson(t: String, h: Int, m: Int, h2: Int, m2: Int, room: String = "B-12", who: String = "Reyes", day: Int = 0) =
    Lesson("$t@$h", at(h, m, day), at(h2, m2, day), t, room, who)
  private fun agenda(lessons: List<Lesson>, todos: List<Todo> = emptyList()) = Agenda(at(6, 0), false, true, lessons, todos, emptyList())

  private val day = listOf(
    lesson("Database Systems", 9, 0, 9, 50, "L-4", "Nkemi"),
    lesson("Computer Programming · Lab", 10, 55, 11, 45, "LAB301"),
    lesson("Intro to Economics", 13, 15, 14, 5),
  )

  @Test fun emptyWhenNeverOpened() {
    val v = WidgetModel.classView(Agenda.EMPTY, at(9, 10))
    assertEquals(WidgetModel.Kind.EMPTY, v.kind)
    assertEquals("Open Marrow to set up your week", v.state)
    assertNull(v.progress)
  }

  @Test fun nowCountsToTheEndWithABarAndWhatComesAfter() {
    val v = WidgetModel.classView(agenda(day), at(9, 25))
    assertEquals(WidgetModel.Kind.NOW, v.kind)
    assertEquals("Now · until 09:50", v.state)
    assertEquals("Database Systems", v.title)
    assertEquals("L-4 · Nkemi", v.place)
    assertEquals(at(9, 50), v.target)
    assertEquals(0.5f, v.progress!!, 0.001f)
    assertEquals("Then Computer Programming · Lab 10:55 · LAB301", v.footer)
  }

  @Test fun lastClassOfTheDay() {
    assertEquals("Last class of the day", WidgetModel.classView(agenda(day), at(13, 30)).footer)
  }

  @Test fun nextCountsToTheStartWithNoBar() {
    val v = WidgetModel.classView(agenda(day), at(10, 0))
    assertEquals(WidgetModel.Kind.NEXT, v.kind)
    assertEquals("Next · 10:55", v.state)
    assertEquals(at(10, 55), v.target)
    assertNull(v.progress)
    assertEquals("Then Intro to Economics 13:15 · B-12", v.footer)
  }

  @Test fun doneForTodayPointsAtTomorrow() {
    val tomorrow = lesson("Database Systems", 9, 0, 9, 50, day = 1)
    val v = WidgetModel.classView(agenda(day + tomorrow), at(15, 0))
    assertEquals(WidgetModel.Kind.NONE, v.kind)
    assertEquals("Done for today", v.state)
    assertEquals("Next: Tomorrow 09:00 · Database Systems", v.footer)
  }

  @Test fun noClassToday() {
    val v = WidgetModel.classView(agenda(listOf(lesson("Database Systems", 9, 0, 9, 50, day = 4))), at(9, 0))
    assertEquals("No class today", v.state)
  }

  @Test fun twelveHourLabels() {
    val a = Agenda(at(6, 0), true, true, day, emptyList(), emptyList())
    assertEquals("Now · until 1:05 PM", WidgetModel.classView(Agenda(at(6, 0), true, true, listOf(lesson("X", 12, 0, 13, 5)), emptyList(), emptyList()), at(12, 30)).state)
    assertEquals("Next · 9:00 AM", WidgetModel.classView(a, at(8, 0)).state)
  }

  @Test fun urgencyLateFirstThenDuePulledByPriority() {
    val now = at(12, 0)
    val todos = listOf(
      Todo("soon", "Soon", at(18, 0), "", ""),
      Todo("late", "Late", at(8, 0), "", ""),
      Todo("important", "Important", at(23, 0), "", "", priority = 2), // 23:00 − 12 h = 11:00, before 18:00
      Todo("later", "Later", at(10, 0, 2), "", ""),
    )
    assertEquals(listOf("late", "important", "soon", "later"), WidgetModel.urgent(agenda(day, todos), now, n = 4).map { it.id })
    assertEquals(listOf("important"), WidgetModel.urgent(agenda(day, todos), now, skip = setOf("late")).map { it.id })
  }

  @Test fun dueLinesAreAbsolute() {
    val now = at(12, 0)
    assertEquals("16:00", WidgetModel.dueLine(Todo("a", "A", at(16, 0), "", ""), now, false))
    assertEquals("Late · 08:00", WidgetModel.dueLine(Todo("b", "B", at(8, 0), "", ""), now, false))
    assertEquals("Tomorrow 09:00", WidgetModel.dueLine(Todo("c", "C", at(9, 0, 1), "", ""), now, false))
  }

  @Test fun layoutByHeight() {
    val tight = WidgetModel.classLayout(50f)
    assertFalse(tight.state); assertFalse(tight.big)
    assertTrue(WidgetModel.classLayout(70f).state)
    assertFalse(WidgetModel.classLayout(70f).place)
    val twoRows = WidgetModel.classLayout(110f)
    assertTrue(twoRows.place); assertTrue(twoRows.big); assertFalse(twoRows.footer); assertFalse(twoRows.task)
    assertTrue(WidgetModel.classLayout(150f).footer)
    assertFalse(WidgetModel.classLayout(150f).task)
    assertTrue(WidgetModel.classLayout(200f).task)
    /* a 4×3 (≈ 180 dp) at 1.3× text is chosen by 180 / 1.3 ≈ 138: no task row, so nothing clips */
    assertFalse(WidgetModel.classLayout(180f / 1.3f).task)
    assertFalse(WidgetModel.nowStacked(70f)); assertTrue(WidgetModel.nowStacked(110f))
  }

  @Test fun taskRowsFitUnderTheHeader() {
    assertEquals(1, WidgetModel.taskRows(110f)) // 4×2
    assertEquals(2, WidgetModel.taskRows(170f)) // 4×3
    assertEquals(4, WidgetModel.taskRows(260f)) // 4×4
    assertEquals(4, WidgetModel.taskRows(600f))
    assertEquals(1, WidgetModel.taskRows(40f))
  }

  @Test fun skyFollowsTheAppsKeyframes() {
    assertEquals("night", WidgetModel.skyAt(4 * 60 + 59))
    assertEquals("dawn", WidgetModel.skyAt(5 * 60))
    assertEquals("morning", WidgetModel.skyAt(7 * 60))
    assertEquals("noon", WidgetModel.skyAt(11 * 60))
    assertEquals("afternoon", WidgetModel.skyAt(14 * 60))
    assertEquals("dusk", WidgetModel.skyAt(17 * 60 + 30))
    assertEquals("night", WidgetModel.skyAt(21 * 60))
    assertEquals("noon", WidgetModel.skyFor("still", false, 21 * 60))
    assertEquals("night", WidgetModel.skyFor("off", true, 12 * 60))
    assertEquals(60, WidgetModel.nextSkyEdge(6 * 60))
    assertEquals(480, WidgetModel.nextSkyEdge(1260)) // 21:00 → 05:00 the next day
  }
}
