package app.marginalia.nativebits

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.CheckBox
import androidx.glance.appwidget.CheckboxDefaults
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextDecoration
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.ConcurrentHashMap
import java.util.Calendar

/**
 * v0.7.7.7–.8 (SPEC §5): the home-screen widgets, in Jetpack Glance.
 *  - Now (2×1): the class on now or next, its countdown and a bar.
 *  - Class (4×1 to 4×3): the same with its room, what comes after, and from 4×3 the one task that most needs you.
 *  - Tasks (4×2 to 4×4, v0.7.7.9): what is due, most urgent first, ticked right there (`TickAction` → `TaskTick`).
 *  (The old widget's "Replaced" stub, D4, lived for one release and went at 0.7.8.)
 *
 * Nothing here starts the JS engine. `Surfaces.refresh` (a new agenda, a skin change, a class boundary, a reboot)
 * calls `Widgets.refresh`. That bumps `version`, which every running Glance session collects, so a widget already on
 * screen recomposes from fresh data (Glance's own `update` only refreshes Glance state, which these widgets don't use),
 * and `updateAll` starts a session for any widget that has none.
 */
object Widgets {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  val version = MutableStateFlow(0L)
  /** Tasks ticked in the last 1.5 s: drawn struck through, then gone (they are in `WidgetTicks` by then). */
  val ticking = ConcurrentHashMap<String, Long>()

  /** The receiver for each kind `pinWidget` accepts. */
  private val RECEIVERS = mapOf(
    "now" to NowWidgetReceiver::class.java, "class" to ClassWidgetReceiver::class.java, "tasks" to TasksWidgetReceiver::class.java,
  )

  fun refresh(c: Context) {
    val app = c.applicationContext
    version.value = version.value + 1
    scope.launch {
      try { NowWidget().updateAll(app) } catch (e: Exception) { }
      try { ClassWidget().updateAll(app) } catch (e: Exception) { }
      try { TasksWidget().updateAll(app) } catch (e: Exception) { }
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

  fun minutesOfDay(now: Long): Int { val k = Calendar.getInstance(); k.timeInMillis = now; return k.get(Calendar.HOUR_OF_DAY) * 60 + k.get(Calendar.MINUTE) }
}

/* ── what a widget is drawn from ─────────────────────────────────────────────────────────────────── */

private class Data(val look: Look, val agenda: Agenda, val now: Long)

/** The agenda and the skin, read again whenever `Widgets.version` moves. */
@Composable
private fun rememberData(): Data {
  val c = LocalContext.current
  val v by Widgets.version.collectAsState()
  return remember(v) { Data(Look.read(c), Agenda.read(c), System.currentTimeMillis()) }
}

/**
 * The widget's colours (D3). Skin: a paper skin's deck, or Daylight's sky as an opaque gradient (the sky's stops under
 * the app's pane, `mg_sky_*`, built by widget-sky.test.ts). Phone: Material You. A never-opened install also gets the
 * phone's neutral colours, since there is no skin yet.
 */
private class Paint(
  val fill: GlanceModifier, val ink: ColorProvider, val mut: ColorProvider, val bar: ColorProvider, val track: ColorProvider, val bad: ColorProvider,
  /** the "+" on the bar colour */
  val onBar: ColorProvider,
)

private fun fixed(argb: Int, alpha: Float = 1f) = ColorProvider(Color(argb).copy(alpha = alpha))

@Composable
private fun paint(d: Data): Paint {
  val l = d.look
  if (l.phone || d.agenda.writtenAt == 0L) {
    val m = GlanceTheme.colors
    return Paint(GlanceModifier.background(m.widgetBackground), m.onSurface, m.onSurfaceVariant, m.primary, m.surfaceVariant, m.error, m.onPrimary)
  }
  if (l.daylight) {
    val key = WidgetModel.skyFor(l.sky, l.dark, Widgets.minutesOfDay(d.now))
    return Paint(GlanceModifier.background(ImageProvider(skyRes(l.dark, key))), fixed(l.ink), fixed(l.mut), fixed(l.bar), fixed(l.ink, 0.18f), fixed(l.bad), fixed(0xFF14181F.toInt()))
  }
  return Paint(GlanceModifier.background(fixed(l.deck)), fixed(l.deckInk), fixed(l.deckMut), fixed(l.bar), fixed(l.deckInk, 0.22f), fixed(l.deckBad), fixed(l.deck))
}

private fun skyRes(dark: Boolean, key: String): Int = if (dark) when (key) {
  "dawn" -> R.drawable.mg_sky_dark_dawn; "morning" -> R.drawable.mg_sky_dark_morning; "noon" -> R.drawable.mg_sky_dark_noon
  "afternoon" -> R.drawable.mg_sky_dark_afternoon; "dusk" -> R.drawable.mg_sky_dark_dusk; else -> R.drawable.mg_sky_dark_night
} else when (key) {
  "dawn" -> R.drawable.mg_sky_light_dawn; "morning" -> R.drawable.mg_sky_light_morning; "noon" -> R.drawable.mg_sky_light_noon
  "afternoon" -> R.drawable.mg_sky_light_afternoon; "dusk" -> R.drawable.mg_sky_light_dusk; else -> R.drawable.mg_sky_light_night
}

/* ── shared pieces ───────────────────────────────────────────────────────────────────────────────── */

private fun style(color: ColorProvider, size: Int, strong: Boolean = false, strike: Boolean = false) =
  TextStyle(color = color, fontSize = size.sp, fontWeight = if (strong) FontWeight.Medium else FontWeight.Normal,
    textDecoration = if (strike) TextDecoration.LineThrough else TextDecoration.None)

/** The height the layout is chosen by: dp over the font scale, so larger text picks a roomier layout's smaller sibling. */
@Composable
private fun effectiveHeight(): Float = LocalSize.current.height.value / LocalContext.current.resources.configuration.fontScale.coerceAtLeast(1f)

/** The card: the system's corner radius (API 31+; `mg_widget_radius`), the skin's surface, a tap opens `link`. */
@Composable
private fun Card(p: Paint, link: String, pad: Int, content: @Composable () -> Unit) {
  val c = LocalContext.current
  Box(
    modifier = p.fill.fillMaxSize().appWidgetBackground().cornerRadius(R.dimen.mg_widget_radius).padding(pad.dp)
      .clickable(actionStartActivity(Widgets.open(c, link))),
    contentAlignment = Alignment.CenterStart,
  ) { content() }
}

/** The countdown: a system Chronometer counting to `target` (Glance has none of its own). */
@Composable
private fun Countdown(target: Long, now: Long, size: Float, color: ColorProvider) {
  val c = LocalContext.current
  val rv = RemoteViews(c.packageName, R.layout.mg_chrono)
  rv.setChronometer(R.id.mg_chrono, SystemClock.elapsedRealtime() + (target - now), null, true)
  rv.setChronometerCountDown(R.id.mg_chrono, true)
  rv.setTextColor(R.id.mg_chrono, color.getColor(c).toArgb())
  rv.setTextViewTextSize(R.id.mg_chrono, TypedValue.COMPLEX_UNIT_SP, size)
  AndroidRemoteViews(rv)
}

@Composable
private fun Bar(p: Paint, progress: Float, thick: Int) {
  LinearProgressIndicator(progress = progress, modifier = GlanceModifier.fillMaxWidth().height(thick.dp).cornerRadius((thick / 2).dp), color = p.bar, backgroundColor = p.track)
}

@Composable
private fun EmptyState(p: Paint, size: Int) {
  Text(WidgetModel.EMPTY_LINE, style = style(p.ink, size), maxLines = 2)
}

/* ── Now (2×1) ───────────────────────────────────────────────────────────────────────────────────── */

class NowWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent { GlanceTheme { NowContent() } }
  }
}
class NowWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = NowWidget()
}

@Composable
private fun NowContent() {
  val d = rememberData(); val p = paint(d); val v = WidgetModel.classView(d.agenda, d.now)
  Card(p, "marrow://today", 12) {
    when (v.kind) {
      WidgetModel.Kind.EMPTY -> EmptyState(p, 14)
      WidgetModel.Kind.NONE -> Column {
        Text(v.state, style = style(p.ink, 16, strong = true), maxLines = 1)
        if (v.footer.isNotEmpty()) Text(v.footer, style = style(p.mut, 12), maxLines = 1)
      }
      else -> if (WidgetModel.nowStacked(effectiveHeight())) Column(modifier = GlanceModifier.fillMaxWidth()) {
        Text(v.state, style = style(p.mut, 12), maxLines = 1)
        Text(v.title, style = style(p.ink, 16, strong = true), maxLines = 1)
        Countdown(v.target, d.now, 22f, p.ink)
        v.progress?.let { Spacer(GlanceModifier.height(6.dp)); Bar(p, it, 4) }
      } else Column(modifier = GlanceModifier.fillMaxWidth()) {
        /* the name gets the whole width; the bar (or "Next · 10:55") shares the second line with the countdown */
        Text(v.title, style = style(p.ink, 14, strong = true), maxLines = 1)
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
          Box(modifier = GlanceModifier.defaultWeight()) {
            val prog = v.progress
            if (prog != null) Bar(p, prog, 4) else Text(v.state, style = style(p.mut, 12), maxLines = 1)
          }
          Spacer(GlanceModifier.width(8.dp))
          Countdown(v.target, d.now, 18f, p.ink)
        }
      }
    }
  }
}

/* ── Class (4×1, 4×2, 4×3) ───────────────────────────────────────────────────────────────────────── */

class ClassWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent { GlanceTheme { ClassContent() } }
  }
}
class ClassWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = ClassWidget()
}

@Composable
private fun ClassContent() {
  val d = rememberData(); val p = paint(d); val v = WidgetModel.classView(d.agenda, d.now)
  val lay = WidgetModel.classLayout(effectiveHeight())
  Card(p, "marrow://today", 14) {
    if (v.kind == WidgetModel.Kind.EMPTY) { EmptyState(p, 14); return@Card }
    Column(modifier = GlanceModifier.fillMaxWidth()) {
      if (v.kind == WidgetModel.Kind.NONE) {
        Text(v.state, style = style(p.ink, if (lay.big) 20 else 18, strong = true), maxLines = 1)
        if (v.footer.isNotEmpty()) Text(v.footer, style = style(p.mut, 14), maxLines = 1)
      } else {
        if (lay.state) {
          /* the name gets the whole width (a big countdown beside it cut "Database Systems" at 250 dp); state and
             room sit beside the countdown */
          Text(v.title, style = style(p.ink, if (lay.big) 20 else 18, strong = true), maxLines = 1)
          Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.defaultWeight()) {
              Text(v.state, style = style(p.mut, 12), maxLines = 1)
              if (lay.place && v.place.isNotEmpty()) Text(v.place, style = style(p.mut, 14), maxLines = 1)
            }
            Spacer(GlanceModifier.width(12.dp))
            Countdown(v.target, d.now, if (lay.big) 28f else 22f, p.ink)
          }
        } else Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
          Text(v.title, style = style(p.ink, 16, strong = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
          Spacer(GlanceModifier.width(8.dp))
          Countdown(v.target, d.now, 20f, p.ink)
        }
        v.progress?.let { Spacer(GlanceModifier.height(8.dp)); Bar(p, it, if (lay.big) 6 else 4) }
        if (lay.footer) { Spacer(GlanceModifier.height(8.dp)); Text(v.footer, style = style(p.mut, 14), maxLines = 1) }
      }
      if (lay.task) WidgetModel.urgent(d.agenda, d.now, hidden(LocalContext.current)).firstOrNull()?.let { t ->
        Spacer(GlanceModifier.height(8.dp))
        TaskRow(p, t, d)
      }
    }
  }
}

/** Tasks ticked on a widget that JS hasn't taken yet, except the ones still showing their strike. */
private fun hidden(c: Context): Set<String> = WidgetTicks.pending(c) - Widgets.ticking.keys

/**
 * One task, 48 dp: a check box that ticks it at once (`TickAction`), its title and due line (red when late); the rest
 * of the row opens To-do. A ticked row shows struck through for 1.5 s, then leaves.
 */
@Composable
private fun TaskRow(p: Paint, t: Todo, d: Data) {
  val c = LocalContext.current
  val struck = Widgets.ticking.containsKey(t.id)
  Row(modifier = GlanceModifier.fillMaxWidth().height(48.dp), verticalAlignment = Alignment.CenterVertically) {
    CheckBox(
      checked = struck,
      onCheckedChange = actionRunCallback<TickAction>(actionParametersOf(TickAction.ID to t.id)),
      colors = CheckboxDefaults.colors(checkedColor = p.ink, uncheckedColor = p.mut),
    )
    Spacer(GlanceModifier.width(8.dp))
    Column(
      modifier = GlanceModifier.defaultWeight().clickable(actionStartActivity(Widgets.open(c, "marrow://tasks"))),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Text(t.title, style = style(if (struck) p.mut else p.ink, 16, strike = struck), maxLines = 1)
      Text(WidgetModel.dueLine(t, d.now, d.agenda.hour12), style = style(if (t.due < d.now && !struck) p.bad else p.mut, 12), maxLines = 1)
    }
  }
}

/** The tick: struck through at once, done natively (database + note), gone after 1.5 s. */
class TickAction : ActionCallback {
  override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
    val id = parameters[ID] ?: return
    Widgets.ticking[id] = System.currentTimeMillis()
    Widgets.refresh(context)
    withContext(Dispatchers.IO) { TaskTick.tick(context, id) }
    delay(1500)
    Widgets.ticking.remove(id)
    Widgets.refresh(context)
  }
  companion object { val ID = ActionParameters.Key<String>("id") }
}

/* ── Tasks (4×2, 4×3, 4×4) ───────────────────────────────────────────────────────────────────────── */

class TasksWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact
  override suspend fun provideGlance(context: Context, id: GlanceId) {
    provideContent { GlanceTheme { TasksContent() } }
  }
}
class TasksWidgetReceiver : GlanceAppWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = TasksWidget()
}

@Composable
private fun TasksContent() {
  val d = rememberData(); val p = paint(d); val c = LocalContext.current
  Card(p, "marrow://tasks", 14) {
    if (d.agenda.writtenAt == 0L) { EmptyState(p, 14); return@Card }
    val all = WidgetModel.urgent(d.agenda, d.now, hidden(c), n = Int.MAX_VALUE)
    Column(modifier = GlanceModifier.fillMaxSize()) {
      /* header 32 dp: "To do · 5" (the count replaces a "+N more" line, which cost a row's room) and "+" */
      Row(modifier = GlanceModifier.fillMaxWidth().height(32.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(if (all.isEmpty()) "To do" else "To do · ${all.size}", style = style(p.ink, 16, strong = true), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        Box(
          modifier = GlanceModifier.width(48.dp).height(32.dp).cornerRadius(16.dp).background(p.bar)
            .clickable(actionStartActivity(Widgets.open(c, "marrow://add/task"))),
          contentAlignment = Alignment.Center,
        ) { Text("+", style = style(p.onBar, 20, strong = true)) }
      }
      Spacer(GlanceModifier.height(4.dp))
      if (all.isEmpty()) Text(WidgetModel.NOTHING_DUE, style = style(p.mut, 14), maxLines = 1)
      else { for (t in all.take(WidgetModel.taskRows(effectiveHeight()))) TaskRow(p, t, d) }
    }
  }
}
