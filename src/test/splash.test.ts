import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* v0.7.7 (SPEC §6): one splash from tap to Today. These pin the pieces that only CI's Gradle compiles: the system
   splash is held until JS's first frame (2 s failsafe), the window behind it is plain paper with no logo, the
   next launch's splash wears the last skin (Android 13+), the icon is a vector M, and the PNG card is gone. */
const ROOT = join(__dirname, '..', '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const activity = read('android', 'app', 'src', 'main', 'java', 'app', 'marginalia', 'planner', 'MainActivity.kt');
const SKINS = ['Collage', 'Refined', 'Original', 'Plain', 'Daylight'];

describe('splash (0.7.7)', () => {
  it('holds the system splash until splashDone or a 2 s failsafe, then fades it over 180 ms', () => {
    expect(activity).toMatch(/if \(!Splash\.done && SystemClock\.uptimeMillis\(\) - started < SPLASH_FAILSAFE_MS\) return false/);
    expect(activity).toContain('SPLASH_FAILSAFE_MS = 2000L');
    expect(activity).toMatch(/setOnExitAnimationListener[\s\S]*setDuration\(180L\)[\s\S]*v\.remove\(\)/);
    expect(read('modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'MarginNativeModule.kt'))
      .toContain('Function("splashDone") { Splash.done = true; true }');
  });

  it('paints the window as plain paper, never the logo again (no size jump if the failsafe fires)', () => {
    expect(activity).toContain('window.setBackgroundDrawable(ColorDrawable(paperColor()))');
    expect(activity).not.toMatch(/LayerDrawable|splashscreen_logo/);
  });

  it('picks the next launch\'s splash from the skin on every pause (Android 13+)', () => {
    expect(activity).toMatch(/override fun onPause\(\)[\s\S]*SDK_INT >= 33[\s\S]*setSplashScreenTheme\(splashTheme\(\)\)/);
    const styles = readFileSync(join(RES, 'values-v31', 'splash_styles.xml'), 'utf8');
    for (const k of SKINS) for (const suf of ['', '.Light', '.Dark']) {
      expect(styles).toContain(`<style name="Theme.Splash.${k}${suf}" parent="AppTheme">`);
      expect(activity).toContain(`R.style.Theme_Splash_${k}${suf.replace('.', '_')}`);
    }
  });

  it('gives Daylight a mid-sky splash, not flat grey paper', () => {
    expect(readFileSync(join(RES, 'values', 'splash_colors.xml'), 'utf8')).toContain('<color name="splash_daylight_light">#DCE8F5</color>');
    expect(readFileSync(join(RES, 'values', 'splash_colors.xml'), 'utf8')).toContain('<color name="splash_daylight_dark">#141B2E</color>');
    expect(activity).toMatch(/"daylight"\) return Color\.parseColor\(if \(dark\) "#141B2E" else "#DCE8F5"\)/);
  });

  it('uses a vector M (with a night twin) and ships no splash PNG', () => {
    for (const ic of ['ic_splash_pen', 'ic_splash_day']) {
      expect(existsSync(join(RES, 'drawable', `${ic}.xml`))).toBe(true);
      expect(existsSync(join(RES, 'drawable-night', `${ic}.xml`))).toBe(true);
    }
    const pngs = readdirSync(RES).flatMap((d) => (d.startsWith('drawable') ? readdirSync(join(RES, d)).filter((f) => f.startsWith('splashscreen_logo')) : []));
    expect(pngs).toEqual([]);
    expect(readFileSync(join(RES, 'values-v31', 'styles.xml'), 'utf8')).toContain('@drawable/ic_splash_pen');
  });

  it('says MARROW in the onboarding corner', () => {
    const ob = read('src', 'onboarding', 'Onboarding.tsx');
    expect(ob).toContain('>MARROW</Txt>');
    expect(ob).not.toContain('>MARGIN</Txt>');
  });

  it('turns on Metro inlineRequires and reaches each page through a getter (E7)', () => {
    expect(read('metro.config.js')).toMatch(/inlineRequires: true/);
    expect(read('src', 'App.tsx')).toMatch(/guarded\('Stats', \(\) => StatsScreen\)/);
  });
});
