/** v0.7.8.13 (owner's ask 4): a better icon, and a choice of four (or the skin's). */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { iconFor } from '../domain/appIcon';

const ROOT = join(__dirname, '..', '..'), RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const manifest = readFileSync(join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');

describe('which icon', () => {
  it('a choice is that icon; none is Paper (an update never moves it by itself)', () => {
    expect(iconFor('denim', 'refined', false)).toBe('denim');
    expect(iconFor(undefined, 'daylight', true)).toBe('paper');
  });
  it('Match my skin: Collage Denim, Notebook and Plain Paper, Daylight Sky, dark Ink', () => {
    expect([iconFor('skin', 'collage', false), iconFor('skin', 'refined', false), iconFor('skin', 'plain', false), iconFor('skin', 'daylight', false), iconFor('skin', 'collage', true)])
      .toEqual(['denim', 'paper', 'paper', 'sky', 'ink']);
  });
});

describe('the launcher entries', () => {
  it('MainActivity is no longer the launcher; four aliases are, Paper on', () => {
    const main = manifest.slice(manifest.indexOf('<activity android:name=".MainActivity"'), manifest.indexOf('</activity>'));
    expect(main).not.toContain('android.intent.category.LAUNCHER');
    for (const k of ['Paper', 'Denim', 'Ink', 'Sky']) expect(manifest).toContain(`<activity-alias android:name=".Icon${k}" android:targetActivity=".MainActivity" android:enabled="${k === 'Paper'}"`);
  });
  it.each(['paper', 'denim', 'ink', 'sky'])('%s: adaptive icon with a themed (monochrome) layer, a fallback PNG, and the picker picture', (k) => {
    const a = readFileSync(join(RES, 'mipmap-anydpi-v26', `ic_marrow_${k}.xml`), 'utf8');
    expect(a).toContain(`@drawable/ic_marrow_fg_${k}`);
    expect(a).toContain('<monochrome android:drawable="@drawable/ic_marrow_mono"/>');
    expect(existsSync(join(RES, 'mipmap-xxxhdpi', `ic_marrow_${k}.png`))).toBe(true);
    expect(existsSync(join(ROOT, 'assets', 'icons', `${k}.png`))).toBe(true);
  });
  it('the native switch enables one alias and disables the rest, without killing the app', () => {
    const kt = readFileSync(join(ROOT, 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'AppIcons.kt'), 'utf8');
    expect(kt).toContain('PackageManager.DONT_KILL_APP');
    expect(kt).toContain('private const val NS = "app.marginalia.planner"');
    expect(readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8')).toContain("namespace 'app.marginalia.planner'");
  });
});
