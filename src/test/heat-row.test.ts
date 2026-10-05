import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HEAT_GAP, HEAT_LABEL_MAX, HEAT_MIN_CELL, heatRow } from '../ui/fit';
import { attendanceHeat } from '../domain/analytics';
import { seedSnapshot } from '../data/seed';

const stats = readFileSync(join(__dirname, '..', 'screens', 'Stats.tsx'), 'utf8');
const NOW = new Date(2026, 9, 5, 8).getTime();
const SNAP = seedSnapshot(NOW);
/** The width the Stats cards actually get: page padding 16 either side, card padding 14 either side. */
const cardInner = (screen: number) => screen - 32 - 28;
/** The device this gate runs on, and the narrowest screen prompt.md V13 asks the layout to survive. */
const DEVICES: [number, string][] = [[320, 'small phone'], [360, 'V13 minimum'], [411.43, 'SM-A516N'], [480, 'large phone'], [768, 'tablet']];

describe('attendance heatmap row fits its card (BUG-023)', () => {
  it('the shipped geometry is 434 dp wide — wider than the card, which is why the last cell was cut', () => {
    // The defect as shipped: a 70 dp label + 28 cells of 11 dp with a 2 dp gap.
    const shipped = 70 + HEAT_GAP + 28 * 11 + HEAT_GAP * 27;
    expect(shipped).toBe(434);
    expect(shipped).toBeGreaterThan(cardInner(411.43)); // so the 28th cell always hung over the edge
  });

  it.each(DEVICES)('%i dp (%s): all 28 cells and the label fit the card', (screen) => {
    const avail = cardInner(screen), r = heatRow(avail, 28);
    const total = r.label + HEAT_GAP + 28 * r.cell + HEAT_GAP * 27;
    expect(total).toBeLessThanOrEqual(avail);
    expect(r.fits).toBe(true);
  });

  it.each(DEVICES)('%i dp: no cell is narrower than the minimum, so none vanishes', (screen) => {
    expect(heatRow(cardInner(screen), 28).cell).toBeGreaterThanOrEqual(HEAT_MIN_CELL);
  });

  it('the label takes a capped share of the row, and gives up share — never the cells — when tight', () => {
    for (const screen of DEVICES.map(([s]) => s as number)) {
      const r = heatRow(cardInner(screen), 28);
      expect(r.label).toBeLessThanOrEqual(HEAT_LABEL_MAX);
      expect(r.label).toBeGreaterThanOrEqual(44); // the label never collapses, at any width tested
    }
    // At 320 dp a 28% label (73 dp) and minimum-width cells cannot both fit, so the label yields share
    // and takes only the 64 dp that is genuinely left. The cells keep HEAT_MIN_CELL — that is the whole
    // point of the branch, and without it the row overflows the card again at this width.
    const tight = heatRow(cardInner(320), 28);
    expect(tight.label).toBeLessThan(Math.round(cardInner(320) * 0.28));
    expect(tight.cell).toBe(HEAT_MIN_CELL);
    expect(tight.fits).toBe(true);
  });

  it('the row is genuinely 28 cells for the real dataset, so the fit is not over a stub', () => {
    const heat = attendanceHeat(SNAP.courses, SNAP.meetings, SNAP.attendance, SNAP.dayMarks, 28, NOW);
    expect(heat.length).toBeGreaterThan(0);
    expect(new Set(heat.map((r) => r.cells.length))).toEqual(new Set([28]));
  });

  it('Stats sizes the strip from heatRow and no longer hides it in a horizontal ScrollView', () => {
    // The row used to sit in `<ScrollView horizontal showsHorizontalScrollIndicator={false}>`: it
    // scrolled, but the last cell was cut at rest with no affordance, so it read as a clipped card.
    expect(stats).toMatch(/const heat = heatRow\(iw, 28\);/);
    expect(stats).toMatch(/width: heat\.label/);
    expect(stats).toMatch(/width: heat\.cell/);
    expect(stats).not.toMatch(/<ScrollView horizontal[^>]*>\s*<View style=\{\{ gap: 6 \}\}>\s*\{attHeat/);
  });
});