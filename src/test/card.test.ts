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

/* ── the model of `deckOf` in src/screens/Today.tsx ───────────────────────────
   `Period.end` arrives already normalised from `periodsOn` (the domain owns the overnight rule now), so
   `deckOf` indexes `periods` one-for-one and does no re-opening of its own. */
function deckOf(periods: Period[], t: number, isToday: boolean) {
  const ps = periods.map((p, i) => ({ p, i })).filter((x) => !x.p.cancelled);
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

  it('raw, the pair IS inverted — atTime stamps both ends on the day it occurs', () => {
    expect(late.end).toBeLessThan(late.start);
  });

  it('periodsOn normalises it once, in the domain, so no view has to', () => {
    // The rule lives here because THREE views read a Period and all three were separately wrong: the card,
    // `activePeriod` (which drops an inverted period, hiding the class in the one hour it is running) and
    // the week grid (which clamps it to a 20dp stub). Fixing it in each caller would have been three fixes
    // and three chances to forget one.
    const periods = periodsOn(LATE_OCC, COURSES, {}, {});
    expect(periods).toHaveLength(1);
    expect(periods[0]!.end).toBe(periods[0]!.start + 60 * 60_000);
    expect(periods[0]!.end).toBeGreaterThan(periods[0]!.start);
  });

  it('an ordinary same-day class is untouched by that rule', () => {
    const ok: Occurrence[] = [{ date: new Date(TUE), meeting: { id: 'm-ok', courseId: 'X', weekday: 1, start: '09:00', end: '10:00' } }];
    const p = periodsOn(ok, COURSES, {}, {})[0]!;
    expect(p.end - p.start).toBe(60 * 60_000);
  });

  it('un-normalised the bar drops it, which is why the domain fix was not cosmetic', () => {
    expect(activePeriod([late], at('23:45'))).toBeNull();
  });

  it('normalised, it is found and it counts down the real time', () => {
    const fixed = periodsOn(LATE_OCC, COURSES, {}, {})[0]!;
    const a = activePeriod([fixed], at('23:45'))!;
    expect(a.phase).toBe('running');
    expect(a.left).toBe(45 * 60_000);
    expect(activePeriod([fixed], at('23:30'))!.p).toBe(1);
    expect(activePeriod([fixed], at('00:30') + DAY_MS - 30_000)!.left).toBe(30_000);
  });

  it('and it is over, not running, the moment it ends', () => {
    const fixed = periodsOn(LATE_OCC, COURSES, {}, {})[0]!;
    expect(activePeriod([fixed], at('00:30') + DAY_MS)).toMatchObject({ p: 0, ended: true, phase: 'over' });
  });

  it('the card counts it down like any other class', () => {
    const fixed = periodsOn(LATE_OCC, COURSES, {}, {});
    expect(deckOf(fixed, at('23:45'), true)).toMatchObject({ state: 'live', word: 'Now', unit: 'min left', countdown: '45:00', at: 0 });
    expect(deckOf(fixed, at('23:30'), true).countdown).toBe('1:00:00');
    // …and before it starts it is the next one, not a live class.
    expect(deckOf(fixed, at('22:00'), true)).toMatchObject({ state: 'soon', word: 'Next up', unit: 'until it starts', countdown: '1:30:00' });
  });

  it('a BarPeriod and a Period are the same shape, so the bar takes the card list unchanged', () => {
    // (the label is the course name for id 'X' in `COURSES`, which is what `periodsOn` resolves)
    const asBar: BarPeriod[] = periodsOn(LATE_OCC, COURSES, {}, {});
    expect(activePeriod(asBar, at('23:45'))!.period.label).toBe('Personal Seminar');
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

  it('a running round is visible on Today in the header slot, not as its own row', () => {
    expect(src).toContain('right={<RunningTimer />}');
    expect(all.some((l) => l.trim() === '<RunningTimer />')).toBe(false); // no strip in the flow
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
    expect(src).toContain('live={focused}'); // the navigator's focus context, never a store-route sub
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

  it("the midnight rule is NOT re-implemented in the view — it is the domain's, once", () => {
    // Regression guard on a refactor that went the other way: three views read a `Period` and each was
    // separately wrong about an overnight class, so the normalisation was pushed down into `periodsOn`.
    // If this guard has to be relaxed, the card is carrying a second copy of a domain rule again.
    expect(src).not.toContain('overMidnight');
    expect(src).toMatch(/const ps = periods\.map\(\(p, i\) => \(\{ p, i \}\)\)/);
  });

  it('the ring around the room code is sized by its glyph, so a grown font cannot clip it', () => {
    expect(src).toContain('borderRadius: 999');
    expect(src).not.toMatch(/width: 2[0-9], height: 2[0-9], borderRadius: 1[0-9]/);
  });

  it('the deck still draws the same bar, at the same width, over the same surface', () => {
    // The surface is now the inverting `deck` triple rather than `slab` (qa/HANDOFF-A5.md): `slab` is
    // darker than the page in dark, so the card was not an object at all there. Same geometry, new token.
    expect(src).toContain('ink={c.deckInk} bg={c.deck}');
    expect(src).toContain('w={width - 32 - DECK_PAD_X * 2}');
    expect(src).toContain('fill={c.deck}');
    expect(src).not.toMatch(/c\.slab/);
  });

  it('while class is upcoming the ring-progress badge rides the card\'s right edge, and the digits stay the readout', () => {
    expect(src).toContain('function StartCircle');
    /* The disc used to be the countdown's whole presentation — 96 square, in the card's column flow,
       pushing the subject down. It is now a small tilted sticker on the card's right edge, so the
       slab keeps its left half for the subject and the digits. */
    expect(src).toContain('size = 56');
    expect(src).toContain("rotate: '-8deg'");
    expect(src).toContain('right: DECK_PAD_X - 10');
    // the slot is fixed rather than sized to the digits, so the card cannot reflow a minute; it is
    // sized to the digit that fills it (68) rather than to the disc that used to (96) — see Today.tsx
    expect(src).toContain('const COUNT_H = 68');
    expect(src).toContain('height: COUNT_H');
    expect(src).toContain("d.state === 'soon' && d.period !== null");
    // and the digits are still the thing actually read, in every state
    expect(src).toContain('>{d.countdown}</Txt>');
    expect(src).toContain('>{d.unit}</Txt>');
  });

  it('the disc\'s ring measures the wait the card is actually in, with a floor so it cannot invert', () => {
    expect(src).toContain('periods.slice(0, d.at)');
    expect(src).toContain('startOfDay(t)');
    expect(src).toContain('Math.max(60_000,');
    expect(src).toContain('strokeDasharray={`${circ * prog} ${circ}`}');
  });

  it('once the class is here the big digits are back, on the same 42px row as before', () => {
    expect(src).toContain('s={42}');
    expect(src).toContain('fontVariant: [\'tabular-nums\']');
  });
});

describe('RunningTimer on Today — the page you land on after leaving Focus', () => {
  const rt = readFileSync(join(__dirname, '../ui/RunningTimer.tsx'), 'utf8');
  const today = readFileSync(join(__dirname, '../screens/Today.tsx'), 'utf8');

  it('it is the same component To-do uses, not a second implementation', () => {
    expect(rt).toContain('export function RunningTimer');
    expect(today).toContain("import { RunningTimer } from '../ui/RunningTimer'");
  });

  it('idle it is the header\'s own focus button; while a round exists it only navigates', () => {
    expect(rt).toContain('testID="open-focus"');
    expect(rt).toContain('const timer = useStore((s) => s.timer);');
    expect(rt).toContain("const idle = v.phase === 'set';");
    expect(rt).toContain('if (idle) act.focusOpen(null)');
    expect(rt).toContain("act.go('Focus')");
    expect(rt).not.toMatch(/onPress=\{\(\) => act\.(focus(Start|Reset)|timer(Start|Reset))/);
  });

  it('its readout is derived from the checkpointed timestamps, not from a local counter', () => {
    expect(rt).toContain('const v = view(timer, now);');
  });

  it('it sits in the header at the gear\'s own height, with no slab and no reserved row', () => {
    expect(rt).toContain('minHeight: 46');
    // 1 s while a live round can move, 30 s while it cannot — and a hidden header drops to a minute,
    // because there is no one reading it and the pump is Focus's job (Focus ticks at 1 Hz while running).
    expect(rt).toMatch(/const now = useNow\(live \? \(timer\.running \? 1000 : 30_000\) : 60_000\)/);
    expect(rt).toContain('const live = useScreenLive();');
    expect(rt).not.toContain('HandBox');
    expect(rt).not.toContain('seed="rt"');
  });

  it('To-do uses the same header node, not a strip row', () => {
    const tasks = readFileSync(join(__dirname, '../screens/Tasks.tsx'), 'utf8');
    expect(tasks).toContain('right={<RunningTimer />}');
    expect(tasks.split('\n').some((l) => l.trim() === '<RunningTimer />')).toBe(false);
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

/* ───────────────────────────────────────────────────────────────────────────
   THE SUBJECT IS NAMED ONCE.

   A5 built the deck into a page whose masthead already named the current class, and left both: two
   Permanent Marker lines, the same two words, ~120 px apart with nothing useful between them. It reads
   as a rendering fault rather than as emphasis. Confirmed by rendering both variants side by side at
   411 px — `/tmp/render/a8/DUP.png` — because the measurement (two `marker` lines printing `label`)
   is easy and the judgement (does it read as a bug?) is not.

   The reference settles it. `marginalia-v10(1).html`'s `today:()` builds a masthead of greeting + date +
   semester stamp + clock, then the deck immediately after; the subject appears once, as the deck's `h2`.
   So the deck keeps the name and the masthead keeps only what the deck cannot say — a wall-clock time,
   where the deck gives a duration.
   ─────────────────────────────────────────────────────────────────────────── */
describe('the class name is stated once, not twice ~120px apart', () => {
  const src = () => readFileSync(join(__dirname, '..', 'screens', 'Today.tsx'), 'utf8');

  /** Every `<Txt … f="marker" …>` in the file, with the expression it prints. */
  const markerLines = (s: string) =>
    s.split('\n').flatMap((line, i) => {
      const m = /<Txt f="marker"[^>]*>([^<]*)</.exec(line);
      return m ? [{ line: i + 1, body: m[1]! }] : [];
    });

  it('exactly one marker line prints a class label: the deck title', () => {
    const hits = markerLines(src()).filter((m) => /\b(label|course\?\.name)\b/.test(m.body));
    expect(hits).toHaveLength(1);
    expect(hits[0]!.body).toContain('d.period.label');
  });

  it('the masthead row keeps its state word and its clock time, and drops the name', () => {
    const s = src();
    // the three lines the clock row is made of, in order. The clock now lives inside the
    // `periods.length > 0` branch and is taped to the deck's corner, so the slice runs to the
    // card it is taped to. Its tag is the subscribing `HeaderClock` leaf (lag-diagnosis-2026-10-14,
    // F2), which is what keeps a clock-face write from re-rendering this page at all.
    const clock = s.slice(s.indexOf('<HeaderClock size={CLOCK}'), s.indexOf('<ActiveCard'));
    expect(clock).toContain("cur ? 'In class' : next ? 'Next up'");
    // the time line is the one that survives: a wall clock, which the deck's duration is not
    expect(clock).toContain('until ${fmtTime(cur.end)}');
    expect(clock).toContain('at ${fmtTime(next!.start)} · ${relDue(next!.start, now)}');
    // and nothing in it prints a subject name
    expect(clock).not.toMatch(/cur\?\.label|next\?\.label/);
  });

  it('the no-class branch said the same thing once, not three times', () => {
    // line 1 already says "All done for today" / "No classes today"; the removed masthead marker line said
    // "Nice work" / "Free day" over the top of it, and with no classes at all the deck is not even mounted.
    // "Nice work" existed nowhere else and is gone.
    expect(src()).not.toContain('Nice work');
    expect(src()).toContain("todayPeriods.length ? 'All done for today' : 'No classes today'");
    // the deck's own no-period title is the reference's wording and stays — a day whose only classes are
    // cancelled still mounts the card, and it must still say something
    expect(src()).toContain("d.period ? d.period.label : 'Free day'");
  });

  it('the deck is still mounted on a day with classes, and only then', () => {
    const s = src();
    /* The deck is now taped to the clock's corner, so the branch that mounts it is a conditional
       expression rather than a `&&`, and the card sits one level deeper inside the wrapper that
       carries the overlap. The property is unchanged: classes present, card mounted. */
    expect(s).toContain('{periods.length > 0 ? (');
    expect(s).toContain('<ActiveCard periods={periods}');
    expect(s).toContain('headPad={CLOCK + 14 - DECK_PAD_X}');
  });
});
