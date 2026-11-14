/** The bottom nav showed through the onboarding on Android (its elevation beats the tour's zIndex). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { shownDays } from '../screens/week/model';

describe('the bottom nav is not drawn during the tour', () => {
  it('Book hides it while the tour is unfinished, on top of Focus and the keyboard', () => {
    const src = readFileSync(join(__dirname, '..', 'navigation', 'Book.tsx'), 'utf8');
    expect(src).toContain("const touring = !toured(useStore((s) => s.settings.onboarded));");
    expect(src).toContain("const hideNav = cur === 'Focus' || kbUp || touring;");
    expect(src).toMatch(/\{!hideNav && \(/);
  });
});

describe('the v0.6 Week grid only draws a weekend that has something on it', () => {
  it('an empty weekend leaves five wider columns', () => { expect(shownDays([true, true, true, true, true, false, false])).toEqual([0, 1, 2, 3, 4]); });
  it('a Saturday class brings Saturday back, Sunday stays out', () => { expect(shownDays([false, false, false, false, false, true, false])).toEqual([0, 1, 2, 3, 4, 5]); });
  it('the Week screen draws its columns from it', () => {
    const src = readFileSync(join(__dirname, '..', 'screens', 'Week.tsx'), 'utf8');
    expect(src).toMatch(/cw = \(gw - tw\) \/ cols\.length/);
  });
});
