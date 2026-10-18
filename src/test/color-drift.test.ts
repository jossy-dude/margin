import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { palettes } from '../tokens/theme';

/**
 * Colour-drift guard.
 *
 * Three separate release-blocking bugs in this project were the same mistake: a colour literal
 * pasted into a component instead of read from the palette.
 *   BUG-005  src/ui/clock/faces.ts, src/screens/Focus.tsx — refined hexes, so the dial and the
 *            break sticker ignored `palette: 'original'`
 *   BUG-009  src/services/notifications.ts — the accent was hardcoded to REFINED.light.acc
 *   BUG-019b src/screens/Focus.tsx — '#1B1712', a hand-picked tone with no token behind it
 *
 * Each was found by a human reading a diff, not by a test. This closes the class: any hex literal
 * outside the token file is a failure, so the fourth one cannot be merged silently.
 */

const SRC = join(__dirname, '..');

/** The only file allowed to contain colour literals. */
const TOKEN_FILE = 'tokens/theme.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== 'test') walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

// 3, 4, 6 or 8 hex digits, optionally 3/4-digit shorthand. Anchored so it cannot match a
// numeric literal, a bitmask, or a hex-ish substring of an identifier.
const HEX = /#[0-9a-fA-F]{3,4}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/;

describe('no colour literals outside the token file', () => {
  const files = walk(SRC);

  it('walks a non-trivial number of source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.filter((f) => !f.endsWith(TOKEN_FILE)))('%s has no hardcoded hex colour', (file) => {
    const rel = file.slice(SRC.length + 1);
    const src = readFileSync(file, 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: i + 1, text: line.trim() }))
      // Ignore comment-only lines: prose may legitimately name a colour.
      .filter(({ text }) => HEX.test(text) && !/^(\*|\/\/|\/\*)/.test(text))
      .map(({ line, text }) => `  ${rel}:${line}  ${text.slice(0, 100)}`);

    if (offenders.length) {
      // `expect` in this repo takes no message argument, so raise the detail directly.
      throw new Error(
        `hardcoded colour literal(s) — read the palette instead:\n${offenders.join('\n')}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * The second half of the same guard: the palette is not the only place contrast is decided. A palette can
 * hold a token pair that fails 4.5:1 and still be *correct* — `COORDINATION.md` §4 forbids re-valuing a
 * palette — and the obligation then falls on whoever paints text on that surface. Three such pairs are live
 * and all three were missed until `qa/FINDINGS-UNSTATED.md` F-06 measured them:
 *
 *   mut  on hl   4.02 in original.dark   — an important note's subject line  (screens/Today.tsx)
 *   warn on hl   4.40 in original.light  — the Task sheet's "Tight" box      (sheets/forms.tsx)
 *   mut  on desk 4.03 in original.light  — the Focus dial bed's numerals     (ui/onboard/art.tsx)
 *
 * So this asserts the rule at the use site, which is the only place it can be asserted without editing a
 * palette: **a surface that fails for `mut` takes `ink`.** It reads the three sources rather than the token
 * file, in the same spirit as `card.test.ts`, so the table in `ui.test.ts` and the code cannot drift apart.
 */
describe('a surface whose muted pair fails is painted with ink, not muted', () => {
  const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

  it('an important note prints its subject in ink, because mut on hl is 4.02 in original.dark', () => {
    const src = read('screens/Today.tsx');
    // the highlight fill and the ink-on-highlight text are one expression, so they cannot disagree
    expect(src).toContain("fill={n.priority >= 2 ? c.hl : c.card}");
    expect(src).toContain("c={n.priority >= 2 ? c.ink : 'mut'}");
    expect(src).not.toMatch(/c\.hl[\s\S]{0,400}c="mut"/);
  });

  it('the Tight box prints ink on the highlight and keeps the warning on its stroke', () => {
    const src = read('sheets/forms.tsx');
    const tight = src.slice(src.indexOf('fill={c.hl} stroke={c.warn}'));
    expect(tight.slice(0, 220)).toContain('fill={c.hl} stroke={c.warn}');
    // the words are ink; `warn` must not appear as the text colour inside that card
    expect(tight.slice(0, 220)).not.toMatch(/c="warn"/);
    expect(tight.slice(0, 220)).toMatch(/<Txt f="bold" s=\{19\}>/);
  });

  it('the dial bed numerals are ink, because mut on desk is 4.03 in original.light', () => {
    const src = read('ui/onboard/art.tsx');
    // anchor on the bed fill the numerals sit inside: the knurled ring painted with `bed` (= `c.desk`)
    const start = src.indexOf('<Path d={BED_RING} fill={bed}');
    expect(start).toBeGreaterThan(-1);
    const bed = src.slice(start, src.indexOf('</Svg>', start));
    expect(bed).toMatch(/SText[^>]*fill=\{c\.ink\}/);
    expect(bed).not.toMatch(/SText[^>]*fill=\{c\.mut\}/);
  });
});

describe('the native window background follows the dark palette', () => {
  const NIGHT = join(SRC, '../android/app/src/main/res/values-night/colors.xml');
  const DAY = join(SRC, '../android/app/src/main/res/values/colors.xml');

  it('defines the night variant at all (BUG-019a: cold start flashed cream)', () => {
    expect(() => readFileSync(NIGHT, 'utf8')).not.toThrow();
  });

  it('uses the refined dark paper so a cold start cannot flash a light window', () => {
    const night = readFileSync(NIGHT, 'utf8');
    expect(night).toContain(`<color name="activityBackground">${palettes.refined.dark.paper}</color>`);
    // The day variant must be the light paper, or the two are not a light/dark pair.
    expect(readFileSync(DAY, 'utf8')).toContain(
      `<color name="activityBackground">${palettes.refined.light.paper}</color>`,
    );
  });

  it('never paints the window pure white', () => {
    expect(readFileSync(DAY, 'utf8')).not.toMatch(/splashscreen_background">#FFFFFF/);
    expect(readFileSync(NIGHT, 'utf8')).not.toMatch(/splashscreen_background">#FFFFFF/);
  });
});