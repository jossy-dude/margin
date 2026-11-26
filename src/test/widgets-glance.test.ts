/**
 * v0.7.7.7 (SPEC §5): the widgets move to Jetpack Glance. Gradle compiles it only in CI, so this holds the build's
 * shape still: the Compose compiler at the project's Kotlin version, Glance 1.2.0, the Now receiver and the old
 * widget's one-release stub (D4), and none of the old RemoteViews widget left in the repo.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { widgetBar } from '../tokens/widget';

const MOD = join(__dirname, '..', '..', 'modules', 'margin-native', 'android');
const MAIN = join(MOD, 'src', 'main');
const KT = join(MAIN, 'java', 'app', 'marginalia', 'nativebits');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

describe('Glance toolchain', () => {
  const gradle = read(MOD, 'build.gradle');
  it('applies the Compose compiler at the root Kotlin version and turns compose on', () => {
    expect(gradle).toContain('org.jetbrains.kotlin.plugin.compose.gradle.plugin:${kotlinVersion}');
    expect(gradle).toContain("apply plugin: 'org.jetbrains.kotlin.plugin.compose'");
    expect(gradle).toMatch(/buildFeatures \{\s*compose true\s*\}/);
  });
  it('uses Glance 1.2.0', () => {
    expect(gradle).toContain("androidx.glance:glance-appwidget:1.2.0");
    expect(gradle).toContain("androidx.glance:glance-material3:1.2.0");
  });
});

describe('the widgets in the manifest', () => {
  const manifest = read(MAIN, 'AndroidManifest.xml');
  it('declares Now and the old widget stub, each with its provider', () => {
    expect(manifest).toContain('app.marginalia.nativebits.NowWidgetReceiver');
    expect(manifest).toContain('@xml/mg_widget_now');
    expect(manifest).toContain('app.marginalia.nativebits.BoardWidget');
    expect(manifest).toContain('@xml/mg_widget_board');
  });
  it('drops the old tick receiver', () => {
    expect(manifest).not.toContain('WidgetTickReceiver');
  });
  it('the providers use Glance\'s loading layout, not an old RemoteViews card', () => {
    for (const f of ['mg_widget_now.xml', 'mg_widget_board.xml']) {
      const xml = read(MAIN, 'res', 'xml', f);
      expect(xml).toContain('@layout/glance_default_loading_layout');
      expect(xml).not.toMatch(/mg_widget_card|mg_widget_preview/);
    }
  });
  it('declares Class (4×2 by default)', () => {
    expect(manifest).toContain('app.marginalia.nativebits.ClassWidgetReceiver');
    const xml = read(MAIN, 'res', 'xml', 'mg_widget_class.xml');
    expect(xml).toContain('android:targetCellWidth="4"');
    expect(xml).toContain('android:targetCellHeight="2"');
    expect(xml).toContain('android:updatePeriodMillis="0"');
  });
  it('declares Tasks (4×2 by default, up to 4×4)', () => {
    expect(manifest).toContain('app.marginalia.nativebits.TasksWidgetReceiver');
    const xml = read(MAIN, 'res', 'xml', 'mg_widget_tasks.xml');
    expect(xml).toContain('android:targetCellHeight="2"');
    expect(xml).toContain('android:updatePeriodMillis="0"');
  });
  it.each([['mg_widget_now.xml', 'mg_preview_now'], ['mg_widget_class.xml', 'mg_preview_class'], ['mg_widget_tasks.xml', 'mg_preview_tasks']])('%s has a static preview that exists (%s)', (f, img) => {
    expect(read(MAIN, 'res', 'xml', f)).toContain(`android:previewImage="@drawable/${img}"`);
    expect(existsSync(join(MAIN, 'res', 'drawable-nodpi', `${img}.png`))).toBe(true);
  });
  it('Now is 2×1', () => {
    const xml = read(MAIN, 'res', 'xml', 'mg_widget_now.xml');
    expect(xml).toContain('android:targetCellWidth="2"');
    expect(xml).toContain('android:targetCellHeight="1"');
  });
});

describe('the skin reaches the widget (setLook, v0.7.7.8)', () => {
  const ctx = readFileSync(join(__dirname, '..', 'ui', 'theme-context.tsx'), 'utf8');
  it('sends the bar, late ink, sky mode and D3 choice', () => {
    for (const k of ['barLight:', 'barDark:', 'badLight:', 'badDark:', 'sky: skyMode', 'widget: widgetColors']) expect(ctx).toContain(k);
  });
  it('Look reads them back', () => {
    const l = read(KT, 'Look.kt');
    for (const k of ['"bar$k"', '"bad$k"', '"sky"', '"widget"']) expect(l).toContain(k);
  });
});

describe('no old widget file is left (SPEC §5 Done when)', () => {
  it.each([
    join(KT, 'Gauge.kt'),
    join(MAIN, 'res', 'layout', 'mg_widget_card.xml'),
    join(MAIN, 'res', 'layout', 'mg_widget_card_plain.xml'),
    join(MAIN, 'res', 'layout', 'mg_row_tick.xml'),
    join(MAIN, 'res', 'drawable', 'mg_widget_card.xml'),
    join(MAIN, 'res', 'drawable', 'mg_widget_preview.xml'),
    join(MAIN, 'res', 'drawable', 'mg_hatch.xml'),
    join(MAIN, 'res', 'drawable', 'mg_pill.xml'),
    join(MAIN, 'res', 'drawable', 'mg_dash.xml'),
    join(MAIN, 'res', 'drawable-nodpi', 'mg_hatch_tile.png'),
    join(__dirname, '..', '..', 'tools', 'widget-layouts.py'),
  ])('%s is gone', (f) => { expect(existsSync(f)).toBe(false); });
  it('no widget fonts', () => {
    const dir = join(MAIN, 'res', 'font');
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
  it('Surfaces.kt draws no RemoteViews widget; it hands off to Widgets.refresh', () => {
    const s = read(KT, 'Surfaces.kt');
    expect(s).not.toMatch(/RemoteViews|AppWidgetProvider|Gauge\./);
    expect(s).toContain('Widgets.refresh(app)');
  });
});

describe('Widgets.kt', () => {
  const w = read(KT, 'Widgets.kt');
  it('Now and the stub are Glance widgets with their receivers', () => {
    expect(w).toContain('class NowWidget : GlanceAppWidget()');
    expect(w).toContain('class NowWidgetReceiver : GlanceAppWidgetReceiver()');
    expect(w).toContain('class BoardWidget : GlanceAppWidgetReceiver()');
    expect(w).toContain('Replaced. Long-press to add the new Marrow widget.');
  });
  it('uses the system corner radius (mg_widget_radius → system_app_widget_background_radius on 31+)', () => {
    expect(w).toContain('cornerRadius(R.dimen.mg_widget_radius)');
    expect(read(MAIN, 'res', 'values-v31', 'mg_dimens.xml')).toContain('@android:dimen/system_app_widget_background_radius');
  });
  it('pins only kinds it knows', () => {
    expect(w).toContain('"now" to NowWidgetReceiver::class.java, "class" to ClassWidgetReceiver::class.java, "tasks" to TasksWidgetReceiver::class.java');
  });
  it('running sessions recompose from fresh data: a version flow, not Glance state (v0.7.7.8)', () => {
    expect(w).toContain('val version = MutableStateFlow(0L)');
    expect(w).toContain('val v by Widgets.version.collectAsState()');
    expect(w).toContain('remember(v) { Data(Look.read(c), Agenda.read(c), System.currentTimeMillis()) }');
  });
  it('the countdown is a system Chronometer counting down, sized per layout', () => {
    expect(w).toContain('rv.setChronometerCountDown(R.id.mg_chrono, true)');
    const x = read(MAIN, 'res', 'layout', 'mg_chrono.xml');
    expect(x).toContain('<Chronometer');
    expect(x).toContain('android:fontFeatureSettings="tnum"');
  });
  it('D3: skin colours, Material You for "phone" and for a never-opened install', () => {
    expect(w).toContain('if (l.phone || d.agenda.writtenAt == 0L)');
    expect(w).toContain('GlanceModifier.background(ImageProvider(skyRes(l.dark, key)))');
  });
  it('lays out by height over the font scale, so 1.3× text never clips', () => {
    expect(w).toContain('LocalSize.current.height.value / LocalContext.current.resources.configuration.fontScale');
    expect(w).toContain('override val sizeMode: SizeMode = SizeMode.Exact');
  });
  it('no text under 12 sp', () => {
    const sizes = [...w.matchAll(/style\(p\.\w+, (\d+)/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(5);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

describe('widgetBar: the bar shows on the widget surface (v0.7.7.8)', () => {
  it('Daylight keeps the now amber', () => { expect(widgetBar('#E8961E', '#2B3038', '#F4F5F7', true)).toBe('#E8961E'); });
  it('a paper accent that vanishes on its deck falls back to the deck ink', () => {
    expect(widgetBar('#8A4B27', '#2A241C', '#FAF4E6', false)).toBe('#FAF4E6');
  });
  it('an accent with 3:1 on the deck stays', () => { expect(widgetBar('#9BBBE0', '#17181A', '#ECEBE7', false)).toBe('#9BBBE0'); });
});

describe('the native tick (v0.7.7.9, SPEC §5 "Tick from the widget")', () => {
  const w = read(KT, 'Widgets.kt'), tt = read(KT, 'TaskTick.kt');
  it('a check box runs TickAction with the task id; the row strikes for 1.5 s, then leaves', () => {
    expect(w).toContain('onCheckedChange = actionRunCallback<TickAction>(actionParametersOf(TickAction.ID to t.id))');
    expect(w).toContain('Widgets.ticking[id] = System.currentTimeMillis()');
    expect(w).toContain('delay(1500)');
    expect(w).toContain('strike = struck');
  });
  it('TaskTick records for JS, marks the database row done, and patches the note through vaultEdit', () => {
    expect(tt).toContain('WidgetTicks.add(app, id)');
    expect(tt).toContain('File(File(c.filesDir, "SQLite"), "marginalia.db")');
    expect(tt).toContain('"id = ? AND (status IS NULL OR status <> 2)"');
    expect(tt).toContain('SyncLocal.vaultEdit(path, Seal.hash(cur.toByteArray()), next)');
  });
  it('the database name and folder are what JS opens (expo-sqlite: files/SQLite)', () => {
    expect(readFileSync(join(__dirname, '..', 'data', 'sqliteExpo.ts'), 'utf8')).toContain("openDatabaseAsync('marginalia.db')");
  });
  it('rows and the Class widget skip ticks JS has not taken, except the ones still striking', () => {
    expect(w).toContain('WidgetTicks.pending(c) - Widgets.ticking.keys');
  });
  it('a 48 dp "+" opens Add task; the header counts instead of a "+N more" line', () => {
    expect(w).toContain('"marrow://add/task"');
    expect(w).toContain('"To do · ${all.size}"');
  });
});
