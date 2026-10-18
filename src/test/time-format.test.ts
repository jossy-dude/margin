import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAY_MS, addDays, atTime, fmtDay, fmtHM, fmtTime, fmtWhen, selectedDay, startOfDay } from '../domain/time';
import { dayBlock, occEnd, occurrencesOn, periodsOn } from '../domain/attendance';
import type { Course, Meeting } from '../domain/types';

/* ───────────────────────────────────────────────────────────────────────────
   W4 — the 12/24-hour contract, and the relative-time wording around it.

   Three kinds of assertion, deliberately split the way `card.test.ts` splits them:

   · `fmtTime` / `fmtWhen` / `fmtDay` / `selectedDay` are shipped and pure (`domain/time.ts` imports
     nothing), so a node-environment test calls the real thing and a pass means the shipped formatter
     is right, not a copy of it. `fmtTime`'s `file` is cited in `src/screens/Today.tsx` for `deckOf`'s
     `h12`, which is why this file exists under that name.

   · `relDue` / `nextWhen` live in `screens/common.tsx`, which pulls in `react-native`, so they are
     modelled below and the model is pinned to the file (the `card.test.ts` pattern). The 12-hour
     clock is threaded through them the same way.

   · `deckOf` is NOT modelled a second time: `card.test.ts` owns that model, and a second copy would
     be a second thing to keep honest. This file asserts the W4 facts about `deckOf` from Today.tsx's
     own source (its signature, its window, its `--:--` guard) and the midnight selection from the
     shipped `dayBlock`, which is what actually feeds `deckOf` its `periods`.

   Convention pinned here (in `fmtTime`): 24-hour is zero-padded "08:30"; 12-hour is an UNPADDED hour
   with a spaced AM/PM suffix ("8:30 AM", "12:05 AM", "1:05 PM").
   ─────────────────────────────────────────────────────────────────────────── */

const MON = new Date(2026, 9, 5).getTime(); // Mon 5 Oct 2026
const TUE = new Date(2026, 9, 6).getTime(); // Tue 6 Oct 2026
const at = (day: number, t: string) => atTime(day, t);
const NOW = at(TUE, '08:00'); // a fixed "now" so every relative string below is exact

/* ── the model of `relDue` / `nextWhen` in src/screens/common.tsx ──────────── */
function relDue(ms: number, now: number, h12 = false) {
  const d = ms - now, a = Math.abs(d), m = Math.round(a / 60_000);
  if (d < 0) return m < 60 ? `${m} min late` : m < 1440 ? `${Math.round(m / 60)} h late` : `${Math.round(m / 1440)} d late`;
  return m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}m` : ''}` : startOfDay(ms) - startOfDay(now) === DAY_MS ? `tomorrow ${fmtTime(ms, h12)}` : `in ${Math.round(m / 1440)} d`;
}
function nextWhen(start: number, now: number, h12 = false) {
  const rel = relDue(start, now, h12), at = fmtTime(start, h12);
  return rel.includes(at) ? rel : `at ${at} · ${rel}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1 · fmtTime — the shipped formatter, both clocks
   ═══════════════════════════════════════════════════════════════════════════ */

describe('fmtTime: one source of a wall clock, 24-hour by default', () => {
  it('24-hour is zero-padded on the hour AND on the minutes', () => {
    expect(fmtTime(at(TUE, '08:30'))).toBe('08:30');
    expect(fmtTime(at(TUE, '08:05'))).toBe('08:05');
    expect(fmtTime(at(TUE, '00:05'))).toBe('00:05');
    expect(fmtTime(at(TUE, '13:05'))).toBe('13:05');
    expect(fmtTime(at(TUE, '23:59'))).toBe('23:59');
  });

  it('12-hour is an unpadded hour with an AM/PM suffix', () => {
    expect(fmtTime(at(TUE, '08:30'), true)).toBe('8:30 AM');
    expect(fmtTime(at(TUE, '13:05'), true)).toBe('1:05 PM');
    expect(fmtTime(at(TUE, '09:05'), true)).toBe('9:05 AM');
  });

  it('midnight is 12 AM and noon is 12 PM, never 0', () => {
    expect(fmtTime(at(TUE, '00:05'), true)).toBe('12:05 AM');
    expect(fmtTime(at(TUE, '12:05'), true)).toBe('12:05 PM');
    expect(fmtTime(at(TUE, '00:00'), true)).toBe('12:00 AM');
    expect(fmtTime(at(TUE, '12:00'), true)).toBe('12:00 PM');
  });
});

/* `fmtHM` is the `'HH:MM'`-string door into the same formatter — the format the notification settings
   store keeps (`activeFrom`, `quietFrom`, …). Its anchor is fixed, so this is a pure function of the
   string and the clock flag. */
describe('fmtHM: an HH:MM settings string in the app\'s clock', () => {
  it('24-hour passes the string through, both clocks agree on where they differ', () => {
    expect(fmtHM('22:00')).toBe('22:00');
    expect(fmtHM('22:00', true)).toBe('10:00 PM');
    expect(fmtHM('00:05', true)).toBe('12:05 AM');
    expect(fmtHM('12:30', true)).toBe('12:30 PM');
    expect(fmtHM('09:00', true)).toBe('9:00 AM');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · fmtWhen / fmtDay / selectedDay — the shipped day + clock pair
   ═══════════════════════════════════════════════════════════════════════════ */

describe('fmtWhen joins the day name to the chosen clock', () => {
  it('names the day and prints the time in the caller\'s clock', () => {
    expect(fmtWhen(at(TUE, '08:30'), NOW)).toBe('Today · 08:30');
    expect(fmtWhen(at(TUE, '08:30'), NOW, true)).toBe('Today · 8:30 AM');
    expect(fmtWhen(at(addDays(startOfDay(NOW), 1), '08:30'), NOW)).toBe('Tomorrow · 08:30');
  });
});

describe('fmtDay flips on the day boundary, and is not a date the header has to compute', () => {
  it('Today / Tomorrow / Yesterday are words, anything else is weekday + day + month', () => {
    const today = startOfDay(NOW);
    expect(fmtDay(today, NOW)).toBe('Today');
    expect(fmtDay(addDays(today, 1), NOW)).toBe('Tomorrow');
    expect(fmtDay(addDays(today, -1), NOW)).toBe('Yesterday');
    expect(fmtDay(addDays(today, 3), NOW)).toBe('Fri 9 Oct');
  });

  it('the flip is on start-of-day, so 23:50 and 00:05 of the same pair differ by one', () => {
    const late = at(MON, '23:50'), early = at(TUE, '00:05');
    expect(fmtDay(late, late)).toBe('Today');
    expect(fmtDay(early, late)).toBe('Tomorrow'); // the day ticked over, so the same instant is "tomorrow"
    expect(fmtDay(late, early)).toBe('Yesterday');
  });
});

describe('selectedDay carries the clock past midnight instead of stranding the screen', () => {
  it('no pick means the live day; a pick is the user\'s and sticks', () => {
    expect(selectedDay(NOW, null)).toBe(startOfDay(NOW));
    expect(selectedDay(NOW, TUE)).toBe(TUE);
  });

  it('with no pick, a clock that ticks past midnight moves the day with it', () => {
    const mounted = at(MON, '23:50'), ticked = at(TUE, '00:05');
    expect(selectedDay(mounted, null)).toBe(startOfDay(mounted));
    expect(selectedDay(ticked, null)).toBe(startOfDay(ticked));
    expect(selectedDay(ticked, null)).not.toBe(startOfDay(mounted)); // it really crossed
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · relDue / nextWhen — the header's one line, and the bug it fixes
   ═══════════════════════════════════════════════════════════════════════════ */

describe('relDue: how far off a time is, in words', () => {
  it('inside the hour, in the day, and the whole-day gap each read differently', () => {
    expect(relDue(NOW + 25 * 60_000, NOW)).toBe('in 25 min');
    expect(relDue(NOW + 90 * 60_000, NOW)).toBe('in 1 h 30m');
    expect(relDue(NOW - 5 * 60_000, NOW)).toBe('5 min late');
  });

  it('a class that is tomorrow prints the time once, in the caller\'s clock', () => {
    const tmr = at(addDays(startOfDay(NOW), 1), '08:30');
    expect(relDue(tmr, NOW)).toBe('tomorrow 08:30');
    expect(relDue(tmr, NOW, true)).toBe('tomorrow 8:30 AM');
  });
});

describe('nextWhen: the wall clock is added, unless relDue already said it', () => {
  it('an imminent class prints "at HH:MM · in N min"', () => {
    const soon = NOW + 25 * 60_000; // 08:25
    expect(nextWhen(soon, NOW)).toBe('at 08:25 · in 25 min');
    expect(nextWhen(soon, NOW, true)).toBe('at 8:25 AM · in 25 min');
  });

  it('a class that is tomorrow is NOT printed twice — the old header said "at 08:30 · tomorrow 08:30"', () => {
    const tmr = at(addDays(startOfDay(NOW), 1), '08:30');
    const out = nextWhen(tmr, NOW);
    expect(out).toBe('tomorrow 08:30');
    expect(out.match(/08:30/g)).toHaveLength(1);
    expect(out).not.toContain('at 08:30');
    // …and the same de-duplication holds in the 12-hour clock, where a naive `includes` would miss
    // only if the two formatters disagreed about the string (they do not — both go through `fmtTime`).
    const out12 = nextWhen(tmr, NOW, true);
    expect(out12).toBe('tomorrow 8:30 AM');
    expect(out12.match(/8:30 AM/g)).toHaveLength(1);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · deckOf — what this file can assert about it, and what it must not copy
   ═══════════════════════════════════════════════════════════════════════════ */

describe('deckOf (source) — the W4 shape, cross-checked against card.test.ts\'s model', () => {
  const src = readFileSync(join(__dirname, '..', 'screens', 'Today.tsx'), 'utf8');

  it('takes the clock as a 4th argument, and the card hands it the user\'s choice', () => {
    expect(src).toContain('export function deckOf(periods: Period[], t: number, isToday: boolean, h12 = false)');
    expect(src).toContain('deckOf(periods, t, isToday, hour12)');
  });

  it('a day that is not today prints the class WINDOW, and the no-period case is `--:--`', () => {
    expect(src).toContain('${fmtTime(period.start, h12)}–${fmtTime(period.end, h12)}');
    expect(src).toContain("target === null || !period ? '--:--'");
  });
});

describe('a class that runs past midnight, from the shipped dayBlock that feeds deckOf', () => {
  /** Mon 23:50 → Tue 00:10, the way the app stores it: both ends stamped on the Mon occurrence. */
  const NIGHT: Meeting = { id: 'm-night', courseId: 'X', weekday: 0, start: '23:50', end: '00:10', demo: false };
  const MORNING: Meeting = { id: 'm-morn', courseId: 'X', weekday: 1, start: '09:00', end: '09:50', demo: false };
  const MEETINGS = [NIGHT, MORNING];
  const COURSES: Course[] = [{ id: 'X', name: 'Evening Seminar', room: '', teacher: '', goal: null, sort: 0, demo: false }];

  it('the night class ends 20 minutes into the next day, not "before it starts"', () => {
    const p = periodsOn(occurrencesOn(new Date(MON), MEETINGS), COURSES, {}, {})[0]!;
    expect(p.start).toBe(at(MON, '23:50'));
    expect(p.end).toBe(at(TUE, '00:10'));
    expect(p.end - p.start).toBe(20 * 60_000);
    expect(occEnd(MON, NIGHT)).toBe(at(TUE, '00:10'));
  });

  it('at 23:55 it is running, so the deck is counting THIS class down', () => {
    const b = dayBlock(at(MON, '23:55'), MEETINGS, COURSES, {}, {}, null);
    expect(b.date).toBe('2026-10-05');
    expect(b.cur?.label).toBe('Evening Seminar');
    expect(b.next).toBeUndefined();
  });

  it('at 00:05 the deck speaks of the NEXT class — the finished night is not carried into the new day', () => {
    // The day ticked over, so `dayBlock` now builds TUESDAY's periods: the still-running 23:50 class is
    // NOT among them (it belongs to Monday's occurrence). `deckOf` therefore sees no `cur` and a `next`,
    // which its model (card.test.ts) maps to state 'soon', word 'Next up'.
    const b = dayBlock(at(TUE, '00:05'), MEETINGS, COURSES, {}, {}, null);
    expect(b.date).toBe('2026-10-06');
    expect(b.cur).toBeUndefined();
    expect(b.next?.start).toBe(at(TUE, '09:00'));
    expect(b.periods.map((p) => p.label)).toEqual(['Evening Seminar']); // Tuesday's own 09:00 class
    expect(b.periods[0]!.start).toBe(at(TUE, '09:00'));
  });
});

/* ── source pins for the model above (common.tsx cannot be imported: react-native) ── */
describe('common.tsx wiring — the relDue / nextWhen model cannot go stale', () => {
  const src = readFileSync(join(__dirname, '..', 'screens', 'common.tsx'), 'utf8');

  it('relDue prints tomorrow\'s clock through fmtTime, with the caller\'s h12', () => {
    expect(src).toContain('tomorrow ${fmtTime(ms, h12)}');
  });

  it('nextWhen only prefixes the wall clock when relDue did not already carry one', () => {
    expect(src).toContain('rel.includes(at) ? rel : `at ${at} · ${rel}`');
    expect(src).toContain('export function nextWhen(start: number, now: number, h12 = false)');
  });
});
