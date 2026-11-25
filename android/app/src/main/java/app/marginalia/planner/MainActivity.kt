package app.marginalia.planner

import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.ViewTreeObserver

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import app.marginalia.nativebits.Splash
import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    // v0.7.7 (SPEC §6): one splash from tap to Today. The window behind the splash is the last skin's plain paper
    // with NO logo, so if the failsafe lets the splash go before JS is up, nothing jumps or changes size.
    try { window.setBackgroundDrawable(ColorDrawable(paperColor())) } catch (e: Exception) { }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) holdSplash()
  }

  /** Android 12+: keep the system splash up until JS's first frame (`MarginNative.splashDone()`) or 2 s, then fade
   *  it out over 180 ms. Holding = cancelling the window's draws; each cancelled draw schedules the next, so the
   *  flag is checked every frame and costs nothing once it lets go. */
  private fun holdSplash() {
    val started = SystemClock.uptimeMillis()
    val content = findViewById<View>(android.R.id.content) ?: return
    content.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        if (!Splash.done && SystemClock.uptimeMillis() - started < SPLASH_FAILSAFE_MS) return false
        content.viewTreeObserver.removeOnPreDrawListener(this)
        return true
      }
    })
    try {
      splashScreen.setOnExitAnimationListener { v ->
        v.animate().alpha(0f).setDuration(180L).withEndAction { v.remove() }.start()
      }
    } catch (e: Exception) { }
  }

  /** Android 13+: the next launch's splash wears the skin used now (one style per skin, values-v31/splash_styles.xml).
   *  Set on every pause, so a skin changed in this session is what the next cold start shows. */
  override fun onPause() {
    super.onPause()
    if (Build.VERSION.SDK_INT >= 33) try { splashScreen.setSplashScreenTheme(splashTheme()) } catch (e: Exception) { }
  }

  private fun look() = getSharedPreferences("margin_look", MODE_PRIVATE)

  private fun isDark(): Boolean {
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    return when (look().getString("mode", "auto")) { "dark" -> true; "light" -> false; else -> night }
  }

  /** The window behind the splash: the skin's paper, or for Daylight a mid sky colour (the live sky fades in over it). */
  private fun paperColor(): Int {
    val dark = isDark()
    if (look().getString("palette", "") == "daylight") return Color.parseColor(if (dark) "#141B2E" else "#DCE8F5")
    val hex = look().getString(if (dark) "paperDark" else "paperLight", null) ?: if (dark) "#3C352C" else "#FAF4E6"
    return try { Color.parseColor(hex.take(7)) } catch (e: Exception) { if (dark) 0xFF3C352C.toInt() else 0xFFFAF4E6.toInt() }
  }

  private fun splashTheme(): Int {
    val mode = look().getString("mode", "auto")
    return when (look().getString("palette", "refined")) {
      "collage" -> when (mode) { "light" -> R.style.Theme_Splash_Collage_Light; "dark" -> R.style.Theme_Splash_Collage_Dark; else -> R.style.Theme_Splash_Collage }
      "original" -> when (mode) { "light" -> R.style.Theme_Splash_Original_Light; "dark" -> R.style.Theme_Splash_Original_Dark; else -> R.style.Theme_Splash_Original }
      "plain" -> when (mode) { "light" -> R.style.Theme_Splash_Plain_Light; "dark" -> R.style.Theme_Splash_Plain_Dark; else -> R.style.Theme_Splash_Plain }
      "daylight" -> when (mode) { "light" -> R.style.Theme_Splash_Daylight_Light; "dark" -> R.style.Theme_Splash_Daylight_Dark; else -> R.style.Theme_Splash_Daylight }
      else -> when (mode) { "light" -> R.style.Theme_Splash_Refined_Light; "dark" -> R.style.Theme_Splash_Refined_Dark; else -> R.style.Theme_Splash_Refined }
    }
  }

  companion object { private const val SPLASH_FAILSAFE_MS = 2000L }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
