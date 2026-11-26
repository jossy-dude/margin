package app.marginalia.nativebits

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * v0.7.8.13 (owner's ask 4): the app icon, chosen in Settings. The launcher entry is one of four activity-aliases of
 * MainActivity (android/app/src/main/AndroidManifest.xml: IconPaper, IconDenim, IconInk, IconSky); choosing one enables
 * it and disables the others, without killing the app. The aliases live in the app's namespace, which is not the
 * application id (app.marginalia.planner vs app.marrow).
 */
object AppIcons {
  val NAMES = listOf("paper", "denim", "ink", "sky")
  private const val NS = "app.marginalia.planner"
  private fun component(c: Context, name: String) = ComponentName(c.packageName, "$NS.Icon${name.replaceFirstChar { it.uppercase() }}")

  /** Turn `name` on and the rest off. False for a name that is not one of the four, or a launcher that refuses. */
  fun set(c: Context, name: String): Boolean {
    if (name !in NAMES) return false
    val pm = c.packageManager
    return try {
      // the new one first, so there is never a moment with no launcher entry at all
      pm.setComponentEnabledSetting(component(c, name), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      for (n in NAMES) if (n != name) pm.setComponentEnabledSetting(component(c, n), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
      true
    } catch (e: Exception) { false }
  }

  /** The icon in use: the enabled alias ("paper" when none was ever switched: its manifest default). */
  fun current(c: Context): String {
    val pm = c.packageManager
    for (n in NAMES) {
      val st = try { pm.getComponentEnabledSetting(component(c, n)) } catch (e: Exception) { continue }
      if (st == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) return n
    }
    return "paper"
  }
}
