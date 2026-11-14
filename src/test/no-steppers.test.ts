/**
 * v0.7 R7 (DESIGN.md D-9 Field, C8): no steppers anywhere. A number is typed (`NumberField`), a time is typed or
 * dragged (`TimeField`), a level is a slider. A stepper is a pair of buttons labelled − and + (or a component named
 * Stepper); this sweep reads every screen, sheet and kit file for one.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === 'test' ? [] : files(p);
  return /\.tsx?$/.test(n) ? [p] : [];
});

it('no − / + button pair and no Stepper component in src/', () => {
  const found: string[] = [];
  for (const f of files(SRC)) {
    const s = readFileSync(f, 'utf8'), rel = relative(SRC, f);
    if (/label=["'{]+\s*["']?[−–-]["']?\s*[}"']/.test(s) && /label=["'{]+\s*["']?\+["']?\s*[}"']/.test(s)) found.push(`${rel}: − and + buttons`);
    if (/\b(function|const|class)\s+Stepper\b|<Stepper\b/.test(s)) found.push(`${rel}: a Stepper component`);
  }
  expect(found).toEqual([]);
});
