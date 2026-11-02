/** Before a class, the deck's bar counts down to the bell (owner, collage pass): the wait is drawn as a
 *  running period, so every bar kind fills and dims across it exactly like it does across a class. */
import { activePeriod, waitPeriod } from '../ui/instruments/time';

const START = new Date(2026, 10, 2, 10, 0).getTime(), GAP = 20 * 60_000;

describe('waitPeriod', () => {
  it('spans the gap and ends at the bell', () => {
    expect(waitPeriod(START, GAP, 'until Maths')).toEqual({ start: START - GAP, end: START, label: 'until Maths' });
  });
  it('is running through the wait, with the part still to wait shrinking', () => {
    const w = waitPeriod(START, GAP, 'x');
    const a0 = activePeriod([w], START - GAP + 1)!, a1 = activePeriod([w], START - GAP / 2)!, a2 = activePeriod([w], START - 60_000)!;
    expect([a0.phase, a1.phase, a2.phase]).toEqual(['running', 'running', 'running']);
    expect(a0.p).toBeGreaterThan(0.99);
    expect(a1.p).toBeCloseTo(0.5, 5);
    expect(a2.p).toBeCloseTo(0.05, 5);
  });
  it('never makes a zero-length wait (a same-minute swap still draws a minute)', () => {
    const w = waitPeriod(START, 0, 'x');
    expect(w.end - w.start).toBe(60_000);
  });
});
