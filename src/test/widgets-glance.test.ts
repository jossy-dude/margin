/**
 * v0.7.7.7 (SPEC §5): the widgets move to Jetpack Glance. Gradle compiles it only in CI, so this holds the build's
 * shape still: the Compose compiler at the project's Kotlin version, Glance 1.2.0, the Now receiver and the old
 * widget's one-release stub (D4), and none of the old RemoteViews widget left in the repo.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

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
  it('Now is 2×1', () => {
    const xml = read(MAIN, 'res', 'xml', 'mg_widget_now.xml');
    expect(xml).toContain('android:targetCellWidth="2"');
    expect(xml).toContain('android:targetCellHeight="1"');
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
    expect(w).toContain('mapOf("now" to NowWidgetReceiver::class.java)');
  });
});
