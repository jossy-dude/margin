import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DAY_MS, atTime, fmtClock, fmtTime } from '../domain/time';
import { dayBlock, periodsOn, type Occurrence, type Period } from '../domain/attendance';
import { activePeriod, LATE_MS, type BarPeriod } from '../ui/instruments/time';
import { seedSnapshot } from '../data/seed';
import type { Course, Snapshot } from '../domain/types';

/* ───────────────────────────────────────────────────────────────────────────
   The active-class card.

   Two kinds of assertion live here, and the split is deliberate:

   · The TIME MATHS is asserted against the code that ships — `activePeriod` (A2's, React-free) and
     `dayBlock` / `periodsOn` (the domain). Those modules import nothing, so a node-environment test
     can call them directly and a passing assertion means the shipped derivation is right, at the
     start, the middle and the end of a real period and across a real midnight.

   · The CARD'S OWN LABELS cannot be, because `src/screens/Today.tsx` pulls in `react-native` and
     `react-native-reanimated` and this suite runs with `testEnvironment: node` (see
     `today-day.test.ts` and `perf-offscreen.test.ts`, which model the same way for the same reason).
     So `deckOf` is modelled below, faithfully, and then the model is pinned to the file with source
     assertions in the last block. If somebody changes a word, a unit or the midnight guard in
     `Today.tsx`, one of those assertions fails rather than the model quietly going stale.
   ─────────────────────────────────────────────────────────────────────────── */

const TUE = new Date(2026, 9, 6).getTime(); // the demo set's Tuesday
const at = (t: string) => atTime(TUE, t);

/** Tuesday's three classes, exactly as the seed's timetable has them. */
const TUE_CLASSES: Period[] = [
  { start: at('09:00'), end: at('09:50'), label: 'Computer Programming', cancelled: false },
  { start: at('10:55'), end: at('11:45'), label: 'Intro to Economics', cancelled: false },
  { start: at('13:15'), end: at('14:05'), label: 'Database Systems', cancelled: false },
];
const COURSES: Course[] = [
  { id: 'C', name: 'Computer Programming', room: 'C-4', teacher: 'Reyes', goal: null, sort: 0 },
  { id: 'E', name: 'Intro to Economics', room: 'B-12', teacher: 'Hale', goal: null, sort: 1 },
  { id: 'B', name: 'Database Systems', room: 'L-4', teacher: 'Nkemi', goal: null, sort: 2 },
  { id: 'X', name: 'Personal Seminar', room: '', teacher: '', goal: null, sort: 3 },
];

/* ── the model of `deckOf` in src/screens/Today.tsx ───────────────────────── */
const overMidnight = (p: Period): Period => (p.end > p.start ? p : { ...p, end: p.end + DAY_MS });

function deckOf(periods: Period[], t: number, isToday: boolean) {
  const ps = periods.map((p, i) => ({ p: overMidnight(p), i })).filter((x) => !x.p.cancelled);
  const cur = isToday ? ps.find((x) => t >= x.p.start && t < x.p.end) : undefined;
  const next = isToday ? ps.find((x) => x.p.start > t) : ps[0];
  const hit = cur ?? next;
  const period = hit ? hit.p : null;
  const target = cur ? cur.p.end : next ? next.p.start : null;
  const state: 'live' | 'soon' | 'first' | 'rest' = cur ? 'live' : next ? (isToday ? 'soon' : 'first') : 'rest';
  const at = hit ? hit.i : -1;
  return {
    state, period, at, total: ps.length,
    word: cur ? 'Now' : next ? (isToday ? 'Next up' : 'First class') : 'Rest day',
    countdown: target === null ? '--:--' : isToday ? fmtClock((target - t) / 1000) : fmtTime(target),
    unit: cur ? 'min left' : next ? (isToday ? 'until it starts' : 'first bell') : 'nothing on',
    position: !period ? (ps.length ? 'Day complete' : 'No classes')
      : state === 'soon' ? `${ps.length - at} of ${ps.length} left` : `Period ${at + 1} of ${ps.length}`,
  };
}

/** The `After` row's derivation, modelled the same way. */
function afterOf(periods: Period[], courses: Course[], occ: Occurrence[], i: number) {
  const o = i >= 0 ? occ[i + 1] : undefined;
  const c = o ? courses.find((x) => x.id === o.meeting.courseId) : undefined;
  return c ? [c.name, c.room.trim()].filter(Boolean).join(' · ')
    : i >= 0 ? 'last class of the day' : 'nothing scheduled';
}

/* ═══════════════════════════════════════════════════════════════════════════
   1 · TIME REMAINING — asserted against the code that ships
   ═══════════════════════════════════════════════════════════════════════════ */

describe('time remaining in the active class, from the derivation that ships', () => {
  const class1 = TUE_CLASSES[0]!;
  const total = class1.end - class1.start; // 50 minutes

  it('the fixture is a real 50-minute class, so the fractions below are the real ones', () => {
    expect(total).toBe(50 * 60_000);
    expect(activePeriod(TUE_CLASSES, class1.start)?.total).toBe(total);
  });

  it('at the start the whole class is still ahead', () => {
    const a = activePeriod(TUE_CLASSES, class1.start)!;
    expect(a).toMatchObject({ phase: 'running', ended: false, left: total, p: 1 });
  });

  it('at the midpoint exactly half is left, and the bar is half spent', () => {
    const a = activePeriod(TUE_CLASSES, class1.start + total / 2)!;
    expect(a.left).toBe(25 * 60_000);
    expect(a.p).toBe(0.5);
  });

  it('one second before the end there is one second left', () => {
    const a = activePeriod(TUE_CLASSES, class1.end - 1000)!;
    expect(a.left).toBe(1000);
    expect(a.p).toBeCloseTo(1000 / total, 6);
  });

  it('the remainder falls by exactly the elapsed time, second for second', () => {
    let prev = activePeriod(TUE_CLASSES, class1.start)!.left;
    let steps = 0;
    for (let s = 137; s <= 50 * 60; s += 137) {
      const a = activePeriod(TUE_CLASSES, class1.start + s * 1000)!;
      expect(a.phase).toBe('running');
      expect(prev - a.left).toBe(137_000); // not "about" — exactly one step, every step
      prev = a.left;
      steps++;
    }
    expect(steps).toBe(21);
    expect(prev).toBe(activePeriod(TUE_CLASSES, class1.start + 21 * 137_000)!.left);
  });

  it('at the end the class is over, and the bar says so instead of snapping back to full', () => {
    const a = activePeriod(TUE_CLASSES, class1.end)!;
    expect(a).toMatchObject({ phase: 'gap', ended: true, left: 0, p: 0 });
    expect(a.period.label).toBe('Computer Programming');
  });

  it('the last five minutes are the one stretch worth a different tone', () => {
    expect(activePeriod(TUE_CLASSES, class1.end - LATE_MS + 1)!.left).toBeLessThanOrEqual(LATE_MS);
    expect(activePeriod(TUE_CLASSES, class1.end - LATE_MS - 60_000)!.left).toBeGreaterThan(LATE_MS);
  });

  it('before the first class the whole of it is still ahead; after the last, none of it is', () => {
    expect(activePeriod(TUE_CLASSES, TUE_CLASSES[0]!.start - 60_000)).toMatchObject({ phase: 'before', p: 1 });
    expect(activePeriod(TUE_CLASSES, at('23:30'))).toMatchObject({ phase: 'over', p: 0, ended: true });
  });

  it('a cancelled class is not counted as running, even while its hours say it is', () => {
    const cancelled = TUE_CLASSES.map((p) => (p === class1 ? { ...p, cancelled: true } : p));
    const a = activePeriod(cancelled, at('09:24'))!;
    expect(a.period.label).not.toBe('Computer Programming');
    expect(a.phase).toBe('before'); // the next class is still all ahead
  });

  it('no classes at all is null, not a zero-length class', () => {
    expect(activePeriod([], at('09:24'))).toBeNull();
    expect(activePeriod([{ ...class1, cancelled: true }], at('09:24'))).toBeNull();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   2 · A CLASS THAT RUNS PAST MIDNIGHT
   ═══════════════════════════════════════════════════════════════════════════ */

describe('a class that runs past midnight', () => {
  /** 23:30 → 00:30, the way the app's own data model stores it. */
  const late: Period = { start: at('23:30'), end: at('00:30'), label: 'Evening Seminar', cancelled: false };
  const LATE_OCC: Occurrence[] = [{ date: new Date(TUE), meeting: { id: 'm-late', courseId: 'X', weekday: 1, start: '23:30', end: '00:30' } }];

  it('the data really does produce end <= start, so this is not a hypothetical', () => {
    // `atTime` stamps both ends on the same day, so an overnight class comes out inverted …
    expect(late.end).toBeLessThan(late.start);
    // … and `periodsOn`, which is what every screen reads, hands that inverted pair straight on.
    const periods = periodsOn(LATE_OCC, COURSES, {}, {});
    expect(periods).toHaveLength(1);
    expect(periods[0]!.end).toBeLessThan(periods[0]!.start);
  });

  it('un-normalised it is invisible: the bar drops it and would show no class at all', () => {
    // This is the defect `overMidnight` exists for, pinned so it cannot be "simplified" away.
    expect(activePeriod([late], at('23:45'))).toBeNull();
  });

  it('normalised, it is found and it counts down the real time', () => {
    const fixed = overMidnight(late);
    expect(fixed.end).toBe(at('00:30') + DAY_MS);
    const a = activePeriod([fixed], at('23:45'))!;
    expect(a.phase).toBe('running');
    expect(a.left).toBe(45 * 60_000);
    expect(activePeriod([fixed], at('23:30'))!.p).toBe(1);
    expect(activePeriod([fixed], at('00:30') + DAY_MS - 30_000)!.left).toBe(30_000);
  });

  it('and it is over, not running, the moment it ends', () => {
    expect(activePeriod([overMidnight(late)], at('00:30') + DAY_MS)).toMatchObject({ p: 0, ended: true, phase: 'over' });
  });

  it('the card counts it down like any other class', () => {
    const d = deckOf([late], at('23:45'), true);
    expect(d).toMatchObject({ state: 'live', word: 'Now', unit: 'min left', countdown: '45:00', at: 0 });
    expect(deckOf([late], at('23:30'), true).countdown).toBe('1:00:00');
    // …and before it starts it is the next one, not a live class.
    expect(deckOf([late], at('22:00'), true)).toMatchObject({ state: 'soon', word: 'Next up', unit: 'until it starts', countdown: '1:30:00' });
  });

  it('a BarPeriod and a Period are the same shape, so the bar takes the card list unchanged', () => {
    const asBar: BarPeriod[] = [overMidnight(late)];
    expect(activePeriod(asBar, at('23:45'))!.period.label).toBe('Evening Seminar');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE CARD'S FOUR STATES
   ═══════════════════════════════════════════════════════════════════════════ */

describe('the card has the reference\'s four states, and each says a different thing', () => {
  it('live: Now, counting down to the end of the class it is in', () => {
    const d = deckOf(TUE_CLASSES, at('09:24'), true);
    expect(d).toMatchObject({ state: 'live', word: 'Now', unit: 'min left', countdown: '26:00', at: 0, total: 3 });
    expect(d.period?.label).toBe('Computer Programming');
    expect(d.position).toBe('Period 1 of 3');
  });

  it('soon: Next up, counting down to the start of a class that has not begun', () => {
    const d = deckOf(TUE_CLASSES, at('10:00'), true);
    expect(d).toMatchObject({ state: 'soon', word: 'Next up', unit: 'until it starts', countdown: '55:00', at: 1 });
    expect(d.period?.label).toBe('Intro to Economics');
    expect(d.position).toBe('2 of 3 left');
  });

  it('first: on a day that is not today it names the first class and prints its start time', () => {
    const d = deckOf(TUE_CLASSES, at('09:24'), false);
    expect(d).toMatchObject({ state: 'first', word: 'First class', unit: 'first bell', countdown: '09:00', at: 0 });
    expect(d.period?.label).toBe('Computer Programming');
    expect(d.position).toBe('Period 1 of 3');
  });

  it('rest: a day that is over says so, and does not borrow a unit from a state that is not happening', () => {
    const d = deckOf(TUE_CLASSES, at('16:00'), true);
    expect(d).toMatchObject({ state: 'rest', word: 'Rest day', unit: 'nothing on', countdown: '--:--', at: -1 });
    expect(d.period).toBeNull();
    expect(d.position).toBe('Day complete');
  });

  it('a free period is not a class: the two states differ in word, unit and what the digits count to', () => {
    const live = deckOf(TUE_CLASSES, at('09:24'), true), soon = deckOf(TUE_CLASSES, at('10:00'), true);
    expect(live.state).not.toBe(soon.state);
    expect(live.word).not.toBe(soon.word);
    expect(live.unit).not.toBe(soon.unit);
    // the digit row targets the END of a running class and the START of the next one
    expect(live.countdown).toBe(fmtClock((TUE_CLASSES[0]!.end - at('09:24')) / 1000));
    expect(soon.countdown).toBe(fmtClock((TUE_CLASSES[1]!.start - at('10:00')) / 1000));
  });

  it('the countdown crosses to hours rather than printing 90:00, and still carries seconds under one', () => {
    expect(deckOf(TUE_CLASSES, at('07:30'), true).countdown).toBe('1:30:00'); // 90 min before the bell
    expect(deckOf(TUE_CLASSES, at('09:00') - 30_000, true).countdown).toBe('00:30'); // 30 s before it
    expect(deckOf(TUE_CLASSES, at('09:00') + 20_000, true).countdown).toBe('49:40'); // 20 s into class 1
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   4 · DEGRADES GRABEFULLY
   ═══════════════════════════════════════════════════════════════════════════ */

describe('nothing to show is still a card, not a gap', () => {
  it('a day with no classes at all', () => {
    const d = deckOf([], at('09:24'), true);
    expect(d).toMatchObject({ state: 'rest', word: 'Rest day', countdown: '--:--', unit: 'nothing on', at: -1, total: 0 });
    expect(d.position).toBe('No classes');
  });

  it('a weekend, from the real store path', () => {
    const sat = new Date(2026, 9, 10, 10).getTime(); // the seed's Saturday has no meetings
    const block = dayBlock(sat, seed().meetings, seed().courses, {}, {}, null);
    expect(block.periods).toHaveLength(0);
    expect(deckOf(block.periods, sat, true)).toMatchObject({ state: 'rest', position: 'No classes' });
  });

  it('every class cancelled counts as a day with nothing on it', () => {
    const all = TUE_CLASSES.map((p) => ({ ...p, cancelled: true }));
    expect(deckOf(all, at('09:24'), true)).toMatchObject({ state: 'rest', word: 'Rest day', total: 0, position: 'No classes' });
  });

  it('no next class: the after-row says the day ran out, and does not reach back to the first one', () => {
    // `at` is -1 with no class, so `at + 1` would be 0 — the FIRST class of the day. Reading it is the
    // bug this line guards; found by rendering the rest state, not by reading the code.
    const occ = occurrencesAt(TUE);
    expect(afterOf(TUE_CLASSES, COURSES, occ, -1)).toBe('nothing scheduled');
    expect(afterOf(TUE_CLASSES, COURSES, occ, 2)).toBe('last class of the day');
  });

  it('the after-row names the next class and its room', () => {
    const occ = occurrencesAt(TUE);
    expect(afterOf(TUE_CLASSES, COURSES, occ, 0)).toBe('Intro to Economics · B-12');
    expect(afterOf(TUE_CLASSES, COURSES, occ, 1)).toBe('Database Systems · L-4');
  });

  it('a course with no room is named without a dangling separator', () => {
    const occ = occurrencesAt(TUE).concat([{ date: new Date(TUE), meeting: { id: 'm-x', courseId: 'X', weekday: 1, start: '14:00', end: '14:50' } }]);
    const periods = TUE_CLASSES.concat([{ start: at('14:00'), end: at('14:50'), label: 'Personal Seminar', cancelled: false }]);
    expect(afterOf(periods, COURSES, occ, 2)).toBe('Personal Seminar');
  });

  it('periods and occurrences are index-aligned, which is the only reason the after-row can find a room', () => {
    const block = dayBlock(at('09:24'), seed().meetings, seed().courses, {}, {}, null);
    expect(block.occ).toHaveLength(block.periods.length);
    block.occ.forEach((o, i) => {
      const course = seed().courses.find((c) => c.id === o.meeting.courseId);
      expect(block.periods[i]!.label).toBe(course?.name);
    });
    expect(block.occ.map((o) => o.meeting.start)).toEqual(['09:00', '10:55', '13:15']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   5 · WIRING — the parts a model cannot see
   ═══════════════════════════════════════════════════════════════════════════ */

describe('Today.tsx wiring — the card above cannot see the file', () => {
  const src = readFileSync(join(__dirname, '../screens/Today.tsx'), 'utf8');
  const all = src.split('\n');

  it('a running round is visible on Today, not only on To-do', () => {
    expect(all.some((l) => l.trim() === '<RunningTimer />')).toBe(true);
    expect(src).toContain("import { RunningTimer } from '../ui/RunningTimer'");
  });

  it('the card is built over the SELECTED day, so the strip above it and the list below it agree', () => {
    expect(src).toContain('isToday={sel === today}');
    expect(src).toContain('occ={selOcc}');
    // …and it is the same `periods` array the bar was already drawn from.
    expect(src).toContain('<DayBar kind={bar} periods={periods}');
  });

  it('the countdown ticks at 1 Hz only while Today is on screen (prompt.md V17)', () => {
    expect(src).toContain('const t = useNow(live ? 1000 : 60_000);');
    expect(src).toContain('live={st.route === \'Today\'}');
  });

  it('the saved bar setting is not cast to the four legacy kinds it may not be', () => {
    expect(src).not.toContain('as BarKind');
    expect(src).toContain('as AnyBarKind');
  });

  it('the digits cannot shuffle their neighbours as they count, and the tracking is the reference\'s', () => {
    expect(src).toContain("fontVariant: ['tabular-nums']");
    expect(src).toContain('letterSpacing: -1.7'); // the reference's -.04em, resolved at 42px
  });

  it('the slab texture is the reference\'s hatch, at the pitch it actually reads at', () => {
    expect(src).toContain('const HATCH_STEP = 7;');
    expect(src).toContain('hatch(0, 0, sz.w, sz.h, HATCH_STEP)');
    expect(src).not.toMatch(/hatch\(0, 0, sz\.w, sz\.h\)/); // step 5 gives 3.5px across the lines: corduroy
  });

  it('every word the card can print is in the file, so the model above cannot go stale', () => {
    for (const w of ['Now', 'Next up', 'First class', 'Rest day', 'min left', 'until it starts', 'first bell', 'nothing on', '--:--', 'Day complete', 'No classes', 'last class of the day', 'nothing scheduled']) {
      expect(src).toContain(`'${w}'`);
    }
    expect(src).toContain('>After</Txt>'); // the one label that is JSX text rather than a string
  });

  it('the day-position caption keeps the two sentences the app already used here', () => {
    expect(src).toContain('`Period ${at + 1} of ${ps.length}`');
    expect(src).toContain('`${ps.length - at} of ${ps.length} left`');
  });

  it('a class title is capped at two lines, like every other course name on the page', () => {
    expect(src).toContain('<Txt f="marker" s={32} numberOfLines={2}');
  });

  it('the midnight guard is in the file, and only in the file', () => {
    expect(src).toContain('const overMidnight = (p: Period): Period => (p.end > p.start ? p : { ...p, end: p.end + DAY_MS });');
  });

  it('the ring around the room code is sized by its glyph, so a grown font cannot clip it', () => {
    expect(src).toContain('borderRadius: 999');
    expect(src).not.toMatch(/width: 2[0-9], height: 2[0-9], borderRadius: 1[0-9]/);
  });

  it('the deck still draws the same bar, at the same width, over the same slab', () => {
    expect(src).toContain('ink={c.slabInk} bg={c.slab}');
    expect(src).toContain('w={width - 32 - DECK_PAD_X * 2}');
    expect(src).toContain('fill={c.slab}');
  });
});

describe('RunningTimer on Today — the page you land on after leaving Focus', () => {
  const rt = readFileSync(join(__dirname, '../ui/RunningTimer.tsx'), 'utf8');
  const today = readFileSync(join(__dirname, '../screens/Today.tsx'), 'utf8');

  it('it is the same component To-do uses, not a second implementation', () => {
    expect(rt).toContain('export function RunningTimer');
    expect(today).toContain("import { RunningTimer } from '../ui/RunningTimer'");
  });

  it('it reads the timer itself and only navigates — it cannot start or reset a round', () => {
    expect(rt).toContain('const timer = useStore((s) => s.timer);');
    expect(rt).toContain("onPress={() => act.go('Focus')}");
    expect(rt).not.toMatch(/onPress=\{\(\) => act\.(focus(Start|Reset)|timer(Start|Reset))/);
  });

  it('its readout is derived from the checkpointed timestamps, not from a local counter', () => {
    expect(rt).toContain('const v = view(timer, now);');
  });

  it('it reserves its height in every phase, so arriving cannot walk the list under the user\'s thumb', () => {
    expect(rt).toContain('minHeight: 44');
    expect(rt).toMatch(/const now = useNow\(timer\.running \? 1000 : 30_000\)/);
  });
});

/* ── fixtures ────────────────────────────────────────────────────────────── */
let _seed: Snapshot | null = null;
const seed = () => (_seed ??= seedSnapshot(at('09:24')));
function occurrencesAt(day: number): Occurrence[] {
  return [{ date: new Date(day), meeting: { id: 'm-1-09:00-C', courseId: 'C', weekday: 1, start: '09:00', end: '09:50' } },
    { date: new Date(day), meeting: { id: 'm-1-10:55-E', courseId: 'E', weekday: 1, start: '10:55', end: '11:45' } },
    { date: new Date(day), meeting: { id: 'm-1-13:15-B', courseId: 'B', weekday: 1, start: '13:15', end: '14:05' } }];
}
