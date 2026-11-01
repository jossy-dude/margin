/**
 * F7 — time correctness. Run in a DST timezone: Europe/Berlin falls back on 25 Oct 2026 (a 25-hour
 * day), which is exactly where `t0 + n * DAY_MS` and "the same wall time tomorrow" part ways. The zone
 * is set for every suite by `jest.tz.js` (globalSetup); the first test checks that it took.
 */
import { addDays, atTime, startOfDay } from '../domain/time';
import { occEnd } from '../domain/attendance';
import { clampToSemester } from '../domain/semester';
import { finish, initTimer, toggle, view } from '../domain/timer';

const MIN = 60_000;
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

describe('calendar days, not 24-hour steps (DST)', () => {
  it('the fall-back day really is 25 hours here, so the fixture tests what it claims', () => {
    expect(addDays(local(2026, 10, 25), 1) - local(2026, 10, 25)).toBe(25 * 60 * MIN);
  });

  it('an overnight class across the fall-back night ends at its wall-clock time', () => {
    const sat = startOfDay(local(2026, 10, 24));
    expect(occEnd(sat, { start: '23:00', end: '04:00' })).toBe(local(2026, 10, 25, 4));
    expect(occEnd(atTime(sat, '00:00'), { start: '09:00', end: '09:50' })).toBe(local(2026, 10, 24, 9, 50));
  });

  it('the last day of term lasts until its own midnight, all 25 hours of it', () => {
    const range = { semesterStart: '2026-09-07', semesterEnd: '2026-10-25' };
    const lateThatNight = local(2026, 10, 25, 23, 30);
    expect(clampToSemester(lateThatNight, range)).toBe(lateThatNight);
    expect(clampToSemester(local(2026, 10, 27, 12), range)).toBe(local(2026, 10, 26) - 1);
  });
});

describe('the focus engine (F7 fixes; everything else pinned by clock-engine and rev)', () => {
  const T0 = local(2026, 10, 5, 8);

  it('a two-round session saves both rounds, not only the last one', () => {
    let s = initTimer({ planMin: 25, flow: false });
    s = toggle(s, T0).state;                    // round 1
    s = toggle(s, T0 + 25 * MIN).state;         // the round ran out (flow off: stopped); start round 2
    expect(s.rounds).toBe(1);
    const sum = finish(s, T0 + 35 * MIN)!;      // ten minutes into round 2
    expect(sum.focusSec).toBe(35 * 60);
    expect(sum.rounds).toBe(1);
  });

  it('a fresh start forgets the previous session\'s rounds', () => {
    let s = initTimer({ planMin: 25, flow: false });
    s = toggle(s, T0).state; s = toggle(s, T0 + 25 * MIN).state;
    s = { ...initTimer({ planMin: 25 }), priorFocusMs: s.priorFocusMs }; // what the store does after a finish
    s = toggle(s, T0 + 60 * MIN).state;
    expect(finish(s, T0 + 62 * MIN)!.focusSec).toBe(120);
  });

  it('a clock that moves back an hour does not freeze the round', () => {
    let s = initTimer({ planMin: 25 });
    s = toggle(s, T0).state;
    const back = T0 - 60 * MIN;                // the phone's clock jumps back an hour
    const v1 = view(s, back);
    expect(v1.leftMs).toBe(25 * MIN);           // the step is not time anyone spent: nothing invented
    const later = view(v1.state, back + 5 * MIN);
    expect(later.leftMs).toBe(20 * MIN);        // …and five minutes later it has kept counting (it used to sit
                                                // still for the whole hour, until the clock caught up)
  });
});
