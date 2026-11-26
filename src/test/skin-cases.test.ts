/**
 * v0.7.7.6 (SPEC §1 B): a skin is one object, and components ask it, never "which look am I?". This fails on any
 * comparison against a look's name outside `src/tokens/` (the theme builds each skin; the skin files are the
 * skins), and on reading Theme's old Daylight flag (`sky`) from useTheme. The spec's grep was `\bsky\b`, which also
 * hits the `sky` SETTING ('live' | 'still' | 'off') and the Sky component; this tests what the grep meant: the flag.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : []; });
const mine = files(SRC).filter((p) => !relative(SRC, p).startsWith('test') && !relative(SRC, p).startsWith('tokens'));

describe('no skin special cases outside the skins', () => {
  it('nothing compares a look by name', () => {
    const hits = mine.flatMap((p) => readFileSync(p, 'utf8').split('\n').map((l, i) => (/\blook\s*[!=]==/.test(l) ? `${relative(SRC, p)}:${i + 1}` : null)).filter(Boolean));
    expect(hits).toEqual([]);
  });
  it('nothing reads the old Daylight flag off the theme', () => {
    const hits = mine.flatMap((p) => readFileSync(p, 'utf8').split('\n').map((l, i) => (/\{[^}]*\bsky\b[^}]*\}\s*=\s*useTheme\(\)|\b(th|theme)\.sky\b/.test(l) ? `${relative(SRC, p)}:${i + 1}` : null)).filter(Boolean));
    expect(hits).toEqual([]);
  });
  it('every skin is one file', () => {
    expect(readdirSync(join(SRC, 'tokens', 'skins')).sort()).toEqual(['collage.ts', 'daylight.ts', 'original.ts', 'paperBase.ts', 'plain.ts', 'refined.ts', 'types.ts']);
  });
});
