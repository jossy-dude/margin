package app.marginalia.nativebits

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * v0.7.7.7 (SPEC §5): the home-screen widgets, in Jetpack Glance. This release only proves the toolchain: one empty
 * Now widget that says "Marrow", and the old widget's stub. Now and Class fill in at 0.7.7.8, Tasks at 0.7.7.9.
 *
 * Nothing here starts the JS engine. `Surfaces.refresh` (a new agenda, a class boundary, a reboot) calls
 * `Widgets.refresh`, which redraws every placed widget from what the app already wrote.
 */
object Widgets {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  /** The receiver for each kind `pinWidget` accepts. */
  private val RECEIVERS = mapOf("now" to NowWidgetReceiver::class.java)

  fun refresh(c: Context) {
    val app = c.applicationContext
    scope.launch {
      try { NowWidget().updateAll(app) } catch (e: Exception) { }
      try { ReplacedWidget().updateAll(app) } catch (e: Exception) { }
    }
  }

  /** Is at least one of the new widgets on a home screen? (The old widget's stub doesn't count.) */
  fun any(c: Context): Boolean {
    val mgr = AppWidgetManager.getInstance(c)
    return RECEIVERS.values.any { mgr.getAppWidgetIds(ComponentName(c, it)).isNotEmpty() }
  }

  /** Asks the launcher to place a widget; false when this launcher can't (then the person long-presses instead). */
  fun pin(c: Context, kind: String): Boolean {
    val mgr = AppWidgetManager.getInstance(c)
    if (!mgr.isRequestPinAppWidgetSupported) return false
    val cls = RECEIVERS[kind] ?: return false
    return try { mgr.requestPinAppWidget(ComponentName(c, cls), null, null) } catch (e: Exception) { false }
  }

  /** Opens the app at one of its pages (`marrow://today`, `…/tasks`). */
  fun open(c: Context, link: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}

/** The card every widget sits on: the system's corner radius (API 31+, `mg_widget_radius`), a tap opens Today. */
@Composable
private fun Card(c: Context, content: @Composable () -> Unit) {
  Box(
    modifier = GlanceModifier.fillMaxSize().appWidgetBackground().cornerRadius(R.dimen.mg_widget_radius)
      .background(GlanceTheme.colors.widgetBackground).padding(12.dp)
      .clickable(actionStartActivity(Widgets.open(c, "marrow://today"))),
    contentAlignment = Alignment.CenterStart,
  ) { content() }
}

/** Now (2×1): the class on now or next. In 0.7.7.7 it only says "Marrow", to prove the Glance build. */
class NowWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent {
      GlanceTheme {
        Card(context) {
          Text("Marrow", style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 16.sp, fontWeight = FontWeight.Medium), maxLines = 1)
        }
      }
    }
  }
}
class NowWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = NowWidget()
}

/**
 * D4: the old widget, kept for one release so a placed copy says what happened instead of "Can't load widget".
 * Its receiver keeps the old class name (`BoardWidget`), which is what the launcher remembers. Gone at 0.7.8.
 */
class ReplacedWidget : GlanceAppWidget() {
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent {
      GlanceTheme {
        Card(context) {
          Text(
            "Replaced. Long-press to add the new Marrow widget.",
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 14.sp),
            maxLines = 2,
          )
        }
      }
    }
  }
}
class BoardWidget : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = ReplacedWidget()
}
