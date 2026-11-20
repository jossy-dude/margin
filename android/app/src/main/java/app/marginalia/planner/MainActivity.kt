package app.marginalia.planner

import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.os.Build
import android.os.Bundle
import android.view.Gravity

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)
    // v0.8 §2.2: one look from tap to Today. The window shows the logo on the paper of the skin used last (written
    // by the app on every theme change, `MarginNative.setLook`), and JS draws nothing until Today is ready, so there
    // is no white flash, no default paper and no spinner screen in between.
    try { window.setBackgroundDrawable(splashLayer()) } catch (e: Exception) { }
  }

  private fun splashLayer(): Drawable {
    val look = getSharedPreferences("margin_look", MODE_PRIVATE)
    val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    val dark = when (look.getString("mode", "auto")) { "dark" -> true; "light" -> false; else -> night }
    val hex = look.getString(if (dark) "paperDark" else "paperLight", null) ?: if (dark) "#3C352C" else "#FAF4E6"
    val bg = ColorDrawable(try { Color.parseColor(hex.take(7)) } catch (e: Exception) { if (dark) 0xFF3C352C.toInt() else 0xFFFAF4E6.toInt() })
    @Suppress("DEPRECATION") val logo = resources.getDrawable(R.drawable.splashscreen_logo)
    return LayerDrawable(arrayOf(bg, logo)).apply { setLayerGravity(1, Gravity.CENTER) }
  }

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
