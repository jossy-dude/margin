/**
 * v0.6 (owner: "the mascot is glitchy" on the first run, "loading is very bad"). React Native's Android
 * `Image` fades every bitmap in over 300 ms unless told otherwise. Scrap is ~20 separate bitmaps, so on a
 * phone his pieces arrived one fade at a time and every mood change faded the new mouth in from nothing;
 * the paper art and texture tiles did the same on every page. The web build has no fade, so only this pin
 * can hold it: every `<Image>` in the app is drawn at once.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? (n === 'test' ? [] : files(p)) : /\.tsx?$/.test(n) ? [p] : []; });

it('every <Image> in the app draws without the Android fade-in', () => {
  const bad: string[] = [];
  for (const f of files(join(__dirname, '..'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/<Image\b[^>]*>/g)) if (!m[0].includes('fadeDuration={0}')) bad.push(`${f.split('/src/')[1]}: ${m[0].slice(0, 60)}`);
  }
  expect(bad).toEqual([]);
});
