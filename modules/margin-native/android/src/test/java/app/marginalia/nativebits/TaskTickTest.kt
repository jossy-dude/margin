package app.marginalia.nativebits

import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** v0.7.7.9 (SPEC §5 Tests): TaskTick.kt writes what JS `patchLine` writes, byte for byte (tick-lines.json, from Jest). */
class TaskTickTest {
  private fun res(name: String) = javaClass.classLoader!!.getResource(name)!!.readText()

  @Test fun everySharedLine() {
    val fx = JSONArray(res("tick-lines.json"))
    for (i in 0 until fx.length()) {
      val f = fx.getJSONObject(i)
      assertEquals(f.getString("why"), f.getString("want"), TaskTick.done(f.getString("line"), f.getString("today")))
    }
  }

  @Test fun idempotent() {
    val fx = JSONArray(res("tick-lines.json"))
    for (i in 0 until fx.length()) {
      val want = fx.getJSONObject(i).getString("want")
      assertEquals(want, TaskTick.done(want, "2026-11-26"))
    }
  }

  @Test fun findsTheLineByItsBlockId() {
    val note = listOf("# Week", "", "- [ ] A ^a", "- [ ] B 📅 2026-11-27 ^b", "").joinToString("\n")
    assertEquals(listOf("# Week", "", "- [ ] A ^a", "- [x] B 📅 2026-11-27 ✅ 2026-11-26 ^b", "").joinToString("\n"), TaskTick.inNote(note, "b", "2026-11-26"))
    assertNull(TaskTick.inNote(note, "missing", "2026-11-26"))
    assertNull(TaskTick.inNote("- [x] Done ✅ 2026-11-01 ^d", "d", "2026-11-26"))
  }

  @Test fun aRepeatingLineIsLeftToJs() {
    assertNull(TaskTick.inNote("- [ ] Water 🔁 every week 📅 2026-11-26 ^w", "w", "2026-11-26"))
  }
}
