package app.marginalia.nativebits

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same fixtures as vault-sync/core/test/classes.test.js: the hub and the phone must agree on every path. */
class FileClassesTest {
  private fun res(name: String) = javaClass.classLoader!!.getResource(name)!!.readText()

  @Test fun everyFixturePath() {
    val fx = JSONObject(res("classes.json"))
    val t = FileClasses.Table(fx.optString("extra"))
    val cases = fx.getJSONArray("cases")
    for (i in 0 until cases.length()) {
      val c = cases.getJSONObject(i)
      val want = FileClasses.Klass(c.getString("cls"), if (c.has("writer")) c.getString("writer") else null)
      assertEquals(c.getString("p"), want, t.of(c.getString("p")))
    }
  }

  @Test fun vaultRulesWin() {
    val t = FileClasses.Table("shared .obsidian/plugins/bone-home/data.json\nlocal Private/**")
    assertEquals("shared", t.of(".obsidian/plugins/bone-home/data.json").cls)
    assertEquals("local", t.of("Private/a/b.md").cls)
  }

  @Test fun whoMayWrite() {
    assertFalse(FileClasses.mayWrite(FileClasses.Klass("plugin"), "phone"))
    assertTrue(FileClasses.mayWrite(FileClasses.Klass("plugin"), "desktop"))
    assertFalse(FileClasses.mayWrite(FileClasses.Klass("single", "phone"), "desktop"))
    assertTrue(FileClasses.mayWrite(FileClasses.Klass("single", "phone"), "phone"))
    assertFalse(FileClasses.mayWrite(FileClasses.Klass("local"), "phone"))
  }
}
