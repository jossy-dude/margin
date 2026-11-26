package app.marginalia.nativebits

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color

/**
 * The app's skin, outside the app (v0.8 §4.3, §4.4): the widget and the alarm page wear the colours the owner chose.
 * JS writes them on every theme change (`MarginNative.setLook`, SharedPreferences "margin_look"); this reads them,
 * resolving "auto" against the phone's own dark mode. Defaults are the Notebook look's, so an install that never ran
 * the app still draws something.
 */
data class Look(val dark: Boolean, val paper: Int, val card: Int, val ink: Int, val mut: Int, val acc: Int, val deck: Int, val deckInk: Int,
  /** v0.7.6 (widget): the deck's quiet ink, a "late" ink that reads on the deck, and whether the skin is Plain (no hatch, one font). */
  val deckMut: Int = deckInk, val deckBad: Int = 0xFFF4998A.toInt(), val plain: Boolean = false,
  /** v0.7.7.8 (SPEC §5): the skin's id, the widget's bar on its own surface, "late" on a card, the sky mode, and D3's
   *  Skin / Phone colour choice. */
  val id: String = "", val bar: Int = deckInk, val bad: Int = 0xFF9C3322.toInt(), val sky: String = "live", val phone: Boolean = false) {
  val daylight: Boolean get() = id == "daylight"

  companion object {
    private fun col(hex: String?, dflt: Int): Int = try { if (hex.isNullOrEmpty()) dflt else Color.parseColor(hex.take(7)) } catch (e: Exception) { dflt }
    fun read(c: Context): Look {
      val p = c.getSharedPreferences("margin_look", Context.MODE_PRIVATE)
      val night = (c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
      val dark = when (p.getString("mode", "auto")) { "dark" -> true; "light" -> false; else -> night }
      val k = if (dark) "Dark" else "Light"
      val id = p.getString("look", "") ?: ""
      val plain = id == "plain"
      val sky = p.getString("sky", "live") ?: "live"
      val phone = p.getString("widget", "skin") == "phone"
      return if (dark) Look(true, col(p.getString("paper$k", null), 0xFF3C352C.toInt()), col(p.getString("card$k", null), 0xFF433D35.toInt()),
        col(p.getString("ink$k", null), 0xFFF2EAD8.toInt()), col(p.getString("mut$k", null), 0xFFBCB19C.toInt()), col(p.getString("acc$k", null), 0xFFE3AA82.toInt()),
        col(p.getString("deck$k", null), 0xFFF2EAD8.toInt()), col(p.getString("deckInk$k", null), 0xFF2B2620.toInt()),
        col(p.getString("deckMut$k", null), 0xFF665B4B.toInt()), col(p.getString("deckBad$k", null), 0xFF9C3322.toInt()), plain,
        id, col(p.getString("bar$k", null), 0xFF2B2620.toInt()), col(p.getString("bad$k", null), 0xFFF4998A.toInt()), sky, phone)
      else Look(false, col(p.getString("paper$k", null), 0xFFFAF4E6.toInt()), col(p.getString("card$k", null), 0xFFFFFBF1.toInt()),
        col(p.getString("ink$k", null), 0xFF2A241C.toInt()), col(p.getString("mut$k", null), 0xFF665B4B.toInt()), col(p.getString("acc$k", null), 0xFF8A4B27.toInt()),
        col(p.getString("deck$k", null), 0xFF2A241C.toInt()), col(p.getString("deckInk$k", null), 0xFFFAF4E6.toInt()),
        col(p.getString("deckMut$k", null), 0xFFD9CDB4.toInt()), col(p.getString("deckBad$k", null), 0xFFF4998A.toInt()), plain,
        id, col(p.getString("bar$k", null), 0xFFFAF4E6.toInt()), col(p.getString("bad$k", null), 0xFF9C3322.toInt()), sky, phone)
    }
  }
}
