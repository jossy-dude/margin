import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOUR_LH, hourTop } from '../ui/fit';

const week = readFileSync(join(__dirname, '..', 'screens', 'Week.tsx'), 'utf8');
/** The grid as the device draws it: `start` 08:00, `end` 16:00, `PX` 0.95 — Week.tsx:17-18. */
const PX = 0.95, START = 8 * 60, END = 16 * 60, H = (END - START) * PX, HOURS = (END - START) / 60;

describe("Week hour scale: no label may hang below the grid (BUG-027)", () => {
  it('the shipped formula put the last label 9 dp below the grid, which is what the border sliced', () => {
    // As shipped, every label sat at `i * 60 * PX - 5`, i.e. centred on its own rule line. The final
    // rule is the grid's bottom edge at y = H, so the last label was centred there and half of it hung
    // below the grid — 465 against a grid 456 tall — and the card's hand-drawn border ran straight
    // through the glyph. This is the defect stated as arithmetic, so the test cannot drift from it.
    const shippedLastTop = HOURS * 60 * PX - 5;
    expect(shippedLastTop + HOUR_LH).toBeGreaterThan(H);
    expect(shippedLastTop + HOUR_LH - H).toBeCloseTo(9, 5);
  });

  it('no label hangs below the grid any more — that is the whole defect', () => {
    // Note the bound is the *bottom* edge only. The first label legitimately sits at -5, half above the
    // grid, because it is centred on its rule line at y = 0 and the day-header row is above it in the
    // card. That is by design and was never clipped; only the last label ran off the far end.
    for (let i = 0; i <= HOURS; i++) {
      const top = hourTop(i, H, PX);
      expect(top).toBeGreaterThanOrEqual(-5);
      expect(top + HOUR_LH).toBeLessThanOrEqual(H);
    }
  });

  it('the last label keeps clear of the bottom edge rather than touching it', () => {
    expect(H - (hourTop(HOURS, H, PX) + HOUR_LH)).toBeGreaterThanOrEqual(2);
  });

  it('no other label moves — the fix touches the last row only', () => {
    // A clamp that shifted every label would "fix" the clip and quietly change the whole axis. Each
    // label before the last must keep its old `i * 60 * PX - 5` position exactly.
    for (let i = 0; i < HOURS; i++) expect(hourTop(i, H, PX)).toBe(i * 60 * PX - 5);
  });

  it('labels stay in order and evenly spaced, so the scale still reads as a scale', () => {
    const tops = Array.from({ length: HOURS + 1 }, (_, i) => hourTop(i, H, PX));
    for (let i = 1; i < tops.length; i++) expect(tops[i]!).toBeGreaterThan(tops[i - 1]!);
    // Every step but the last is one hour of the grid (60 * PX); the last is shorter by exactly the
    // amount the label was pulled up, which is why the tail is the only row that changed.
    for (let i = 1; i < HOURS; i++) expect(tops[i]! - tops[i - 1]!).toBeCloseTo(60 * PX, 5);
  });

  it('holds for every timetable the week screen can be given', () => {
    // `end` is `max(16:00, latest meeting)` and `start` is `min(08:00, earliest meeting)`, so the grid
    // can be much taller or shorter than the device default. No combination may clip.
    for (const start of [6 * 60, 7 * 60, 8 * 60, 9 * 60]) {
      for (const end of [14 * 60, 16 * 60, 18 * 60, 21 * 60, 23 * 60]) {
        const h = (end - start) * PX, n = (end - start) / 60;
        for (let i = 0; i <= n; i++) expect(hourTop(i, h, PX) + HOUR_LH).toBeLessThanOrEqual(h);
      }
    }
  });

  it('a pull-up never lands above the grid top, however short the grid gets', () => {
    // Unreachable with the shipped start/end (they span >= 8 hours, so H >= 456), but if those changed
    // the clamp must not push a label off the top. Only the pulled-up branch is floored; the natural
    // -5 of the first label is preserved, which is why H = 16 still returns -5 rather than 0.
    for (const h of [4, 6, 10]) {
      expect(hourTop(0, h, PX)).toBe(0); // H - lh - 2 would be -12, -10, -6
      expect(hourTop(3, h, PX)).toBe(0);
    }
    expect(hourTop(0, 16, PX)).toBe(-5); // cap is exactly 0, so the natural position still wins
  });

  it('Week positions its labels with hourTop, not with the raw formula', () => {
    expect(week).toMatch(/top: hourTop\(i, H, PX\)/);
    expect(week).not.toMatch(/top: i \* 60 \* PX - 5/);
  });
});