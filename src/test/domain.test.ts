import { planReminders, blockedReason, workload, latestStart, freeMinutes } from '../domain/reminders';
import { DEFAULT_NOTIF } from '../domain/defaults';
import { advance, canBreak, endBreak, finish, initTimer, nudgeStep, startBreak, toggle, view, FLOW_OVER_CAP_MS, NUDGE_MS } from '../domain/timer';
import { needed, total } from '../domain/grades';
import { effective, nextStatus, occKey } from '../domain/attendance';
import { doneByHour, level, onTimeStats, streak } from '../domain/analytics';
import { seedSnapshot } from '../data/seed';
import type { Task } from '../domain/types';

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 5, 8, 0); // Monday 5 Oct 2026, 08:00
const snap = seedSnapshot(NOW);
const base = { now: NOW, courses: snap.courses, meetings: snap.meetings, attendance: {}, dayMarks: {}, settings: DEFAULT_NOTIF };
const task = (o: Partial<Task>): Task => ({ id: 't', title: 'T', courseId: 'D', kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...o });

describe('reminder planner', () => {
  it('is deterministic and sorted, ids unique', () => {
    const a = planReminders({ ...base, tasks: snap.tasks }), b = planReminders({ ...base, tasks: snap.tasks });
    expect(a.items.map((x) => x.id)).toEqual(b.items.map((x) => x.id));
    expect(new Set(a.items.map((x) => x.id)).size).toBe(a.items.length);
    for (let i = 1; i < a.items.length; i++) expect(a.items[i]!.at).toBeGreaterThanOrEqual(a.items[i - 1]!.at);
    expect(a.items.every((x) => x.at > NOW)).toBe(true);
  });
  it('class-soon fires lead minutes before and per-course lead overrides the global one', () => {
    const p = planReminders({ ...base, tasks: [], settings: { ...DEFAULT_NOTIF, courseLead: { E: 20 } } });
    const first = p.items.find((x) => x.kind === 'class' && x.title.startsWith('Intro to Economics'))!;
    expect(first.at).toBe(at(2026, 10, 5, 8, 10)); // Mon 08:30 class - 20 min
    expect(p.items.find((x) => x.kind === 'class' && x.title.startsWith('Discrete'))!.at).toBe(at(2026, 10, 5, 9, 50));
  });
  it('a reminder that would ring during a lecture is deferred to when the lecture ends', () => {
    const t = task({ id: 'x', dueAt: at(2026, 10, 5, 18, 0), reminders: [{ id: 'r', mode: 'abs', at: at(2026, 10, 5, 10, 15), label: 'x' }] }); // Discrete 10:00-10:50
    const p = planReminders({ ...base, tasks: [t] }).items.find((x) => x.kind === 'task')!;
    expect(p.at).toBe(at(2026, 10, 5, 10, 51)); expect(p.why).toBe('during class');
    const allow = planReminders({ ...base, tasks: [t], settings: { ...DEFAULT_NOTIF, duringClass: 'allow' } }).items.find((x) => x.kind === 'task')!;
    expect(allow.at).toBe(at(2026, 10, 5, 10, 15));
  });
  it('quiet hours move a due-time reminder EARLIER, never past the deadline', () => {
    const t = task({ id: 'q', dueAt: at(2026, 10, 5, 23, 59), reminders: [{ id: 'r', mode: 'before', minutes: 0, label: 'at due' }] });
    const p = planReminders({ ...base, tasks: [t] }).items.find((x) => x.kind === 'task')!;
    expect(p.at).toBeLessThan(t.dueAt!); expect(new Date(p.at).getHours()).toBe(21); expect(p.shiftedFrom).toBe(t.dueAt);
  });
  it('weekend off drops class reminders on Sat/Sun and a disabled master switch plans nothing', () => {
    const wk = planReminders({ ...base, tasks: [], settings: { ...DEFAULT_NOTIF, weekend: 'off' } });
    expect(wk.items.every((x) => ![0, 6].includes(new Date(x.at).getDay()))).toBe(true);
    expect(planReminders({ ...base, tasks: snap.tasks, settings: { ...DEFAULT_NOTIF, enabled: false } }).items).toHaveLength(0);
  });
  it('cancelled classes produce no reminders and completed tasks neither', () => {
    const att = { [occKey('2026-10-05', { start: '08:30', courseId: 'E' })]: { key: 'k', status: 'c' as const, at: 1, reason: '' } };
    const p = planReminders({ ...base, attendance: att, tasks: [task({ id: 'd', status: 2, dueAt: at(2026, 10, 6, 12), reminders: [{ id: 'r', mode: 'before', minutes: 60, label: '' }] })] });
    expect(p.items.some((x) => x.entityId.includes('2026-10-0508:30E'))).toBe(false);
    expect(p.items.some((x) => x.kind === 'task')).toBe(false);
  });
  it('caps the queue and reports how many are deferred', () => {
    const p = planReminders({ ...base, tasks: snap.tasks, cap: 5 }); expect(p.items).toHaveLength(5); expect(p.deferred).toBeGreaterThan(0);
  });
  it('workload: a 3h task due in 2h of free time is flagged tight, with a start-by before the due date', () => {
    const t = task({ dueAt: at(2026, 10, 5, 12, 0), estimateMin: 180 });
    const w = workload(t, base)!; expect(w.tight).toBe(true); expect(w.startBy).toBeLessThan(t.dueAt!);
    const easy = workload(task({ dueAt: at(2026, 10, 9, 12, 0), estimateMin: 60 }), base)!; expect(easy.tight).toBe(false);
  });
  it('free minutes exclude classes and sleeping hours; latestStart walks back through them', () => {
    const ctx = { s: DEFAULT_NOTIF, busy: [] as [number, number][] };
    expect(freeMinutes(at(2026, 10, 5, 6, 0), at(2026, 10, 5, 8, 0), ctx)).toBe(60); // only 07:00-08:00 is awake
    expect(latestStart(at(2026, 10, 5, 9, 0), 120, ctx)).toBe(at(2026, 10, 5, 7, 0));
    expect(blockedReason(at(2026, 10, 5, 3, 0), ctx)?.why).toBe('before active hours');
  });
});

describe('focus timer', () => {
  it('runs, finishes a round in flow mode and keeps counting overtime', () => {
    let s = toggle(initTimer({ planMin: 25 }), 0).state;
    expect(view(s, 24 * 60_000).leftMs).toBe(60_000);
    const r = advance(s, 26 * 60_000); expect(r.events).toContain('roundDone'); expect(r.state.overMs).toBe(60_000); expect(r.state.running).toBe(true);
  });
  it('without flow it stops at the end of the round', () => {
    const s = toggle(initTimer({ planMin: 5, flow: false }), 0).state, r = advance(s, 9 * 60_000);
    expect(r.state.running).toBe(false); expect(r.state.rounds).toBe(1); expect(r.state.focusElapsedMs).toBe(5 * 60_000);
  });
  it('a break pauses the main clock, nudges every 5 minutes, then hands back to focus with the leftover time', () => {
    let s = toggle(initTimer({ planMin: 50, breakMs: 10 * 60_000 }), 0).state;
    expect(canBreak(advance(s, 2 * 60_000).state)).toBe(false); // too early
    s = startBreak(s, 10 * 60_000); expect(s.phase).toBe('break'); expect(s.focusLeftMs).toBe(40 * 60_000);
    const mid = advance(s, 15 * 60_000 + 1000); expect(mid.events).toEqual(['nudge']); expect(mid.state.focusLeftMs).toBe(40 * 60_000);
    const end = advance(s, 21 * 60_000); expect(end.events.filter((e) => e === 'breakDone')).toHaveLength(1);
    expect(end.state.phase).toBe('focus'); expect(end.state.focusLeftMs).toBe(39 * 60_000); expect(end.state.breakDoneMs).toBe(10 * 60_000);
  });
  it('breaks are limited per round and can be ended early', () => {
    let s = toggle(initTimer({ planMin: 50, breaksAllowed: 1, breakMs: 5 * 60_000 }), 0).state;
    s = startBreak(s, 10 * 60_000); s = endBreak(s, 11 * 60_000); expect(s.phase).toBe('focus'); expect(canBreak(advance(s, 30 * 60_000).state)).toBe(false);
  });
  /* The store only commits the timer when an *event* fires, so a plain tick never lands in it. Any UI that
     read elapsed focus, the remaining minutes or the break gate straight off the store was frozen for the
     whole round. `view()` is the derived display state, so it has to carry the advanced state with it. */
  it('view() carries the advanced state so a 1 Hz tick can gate on elapsed focus without a store write', () => {
    const s = toggle(initTimer({ planMin: 25 }), 0).state;
    expect(s.focusElapsedMs).toBe(0);                       // the store really is stale here
    expect(canBreak(s)).toBe(false);
    const v = view(s, 6 * 60_000);
    expect(v.state.focusElapsedMs).toBe(6 * 60_000);
    expect(v.state.focusLeftMs).toBe(19 * 60_000);           // the dial's ring and hand read this
    expect(v.leftMs).toBe(v.state.focusLeftMs);              // the hub readout and the ring must agree
    expect(v.progress).toBeCloseTo(6 / 25, 5);
    // the literal V10c symptom: Dial computes progDeg = (1 - leftMs / (min * 60000)) * 360 from its
    // `leftMs` prop, and Focus used to hand it the stale store value, so progDeg stayed 0 all round.
    const progDeg = (1 - v.state.focusLeftMs / (25 * 60_000)) * 360;
    expect(progDeg).toBeCloseTo(86.4, 1);
    expect(canBreak(v.state)).toBe(true);                    // the gate opens 5 min in, no pause needed
  });
  it('the dial hand sweeps and the last 10 seconds stay visible to the UI', () => {
    const s = toggle(initTimer({ planMin: 60 }), 0).state;
    expect(view(s, 30 * 60_000).state.focusLeftMs).toBe(30 * 60_000);
    expect(view(s, 60 * 60_000 - 8_000).state.focusLeftMs).toBe(8_000); // under the warn10 threshold
  });
  /* A fixed 5-minute nudge step can never fire on a 5-minute break, which is the default: the guard
     `nextNudgeMs < breakTotalMs` is false from the first tick, so the sticker never wiggles. */
  it('every break length can wiggle mid-break, not only breaks longer than the nudge step', () => {
    expect(nudgeStep(5 * 60_000)).toBe(60_000);              // the default 5-minute break
    expect(nudgeStep(10 * 60_000)).toBe(3 * 60_000);
    expect(nudgeStep(15 * 60_000)).toBe(NUDGE_MS);           // never longer than the old step
    expect(nudgeStep(60_000)).toBe(60_000);                  // a 1-minute break still gets one nudge slot
    const s = startBreak(toggle(initTimer({ planMin: 25, breakMs: 5 * 60_000 }), 0).state, 10 * 60_000);
    expect(s.nextNudgeMs).toBeLessThan(s.breakTotalMs);
    expect(advance(s, 10 * 60_000 + 60_000).events).toContain('nudge');
    expect(advance(s, 10 * 60_000 + 4 * 60_000).events.filter((e) => e === 'nudge')).toHaveLength(4);
    expect(advance(s, 10 * 60_000 + 5 * 60_000).events.filter((e) => e === 'nudge')).toHaveLength(4); // none on the breakDone tick
  });
  it('pause keeps the remainder; finish ignores sessions under a minute', () => {
    let s = toggle(initTimer({ planMin: 25 }), 0).state; s = toggle(s, 10 * 60_000).state;
    expect(s.running).toBe(false); expect(view(s, 99 * 60_000).leftMs).toBe(15 * 60_000);
    expect(finish(s, 99 * 60_000)!.focusSec).toBe(600);
    expect(finish(toggle(initTimer(), 0).state, 30_000)).toBeNull();
  });
  it('flow overtime stops at the cap instead of billing focus that never happened', () => {
    expect(FLOW_OVER_CAP_MS).toBe(15 * 60_000);
    const s = toggle(initTimer({ planMin: 25 }), 0).state;
    expect(advance(s, 25 * 60_000 + 10 * 60_000).state.overMs).toBe(10 * 60_000); // under the cap: still counts
    expect(advance(s, 26 * 60_000).state.overMs).toBe(60_000); // one tick past the round, unaffected
    const capped = advance(s, 25 * 60_000 + FLOW_OVER_CAP_MS).state;
    expect(capped.overMs).toBe(FLOW_OVER_CAP_MS); expect(capped.running).toBe(true);
    for (const away of [30 * 60_000, 3 * 60 * 60_000, 12 * 60 * 60_000]) { const a = advance(s, 25 * 60_000 + FLOW_OVER_CAP_MS + away).state; expect(a.overMs).toBe(FLOW_OVER_CAP_MS); expect(a.focusElapsedMs).toBe(25 * 60_000 + FLOW_OVER_CAP_MS); }
  });
  it('a session abandoned in flow can never exceed the nominal duration plus the cap', () => {
    const sum = finish(toggle(initTimer({ planMin: 25 }), 0).state, 12 * 60 * 60_000)!;
    expect(sum.focusSec).toBe((25 * 60_000 + FLOW_OVER_CAP_MS) / 1000); expect(sum.overSec).toBe(FLOW_OVER_CAP_MS / 1000);
    expect(finish(toggle(initTimer({ planMin: 50 }), 0).state, 9 * 60 * 60_000)!.focusSec).toBeLessThanOrEqual((50 * 60_000 + FLOW_OVER_CAP_MS) / 1000);
    expect(finish(toggle(initTimer({ planMin: 5, flow: false }), 0).state, 9 * 60 * 60_000)!.overSec).toBe(0);
  });
});

describe('grades, attendance, analytics', () => {
  const m = (score: number | null, weight: number, on = true) => ({ id: String(Math.random()), courseId: 'E', name: 'm', score, weight, on, sort: 0 });
  it('weighted total ignores unscored and switched-off marks and clamps the adjustment', () => {
    expect(total([m(80, 10), m(90, 10), m(null, 40), m(0, 40, false)])).toBe(85);
    expect(total([m(98, 10)], 5)).toBe(100); expect(total([m(null, 10)])).toBeNull();
  });
  it('needed: what the rest must average to hit a goal', () => {
    const n = needed([m(80, 50), m(null, 50)], 85)!; expect(n.need).toBeCloseTo(90); expect(n.feasible).toBe(true);
    expect(needed([m(50, 50), m(null, 50)], 90)!.feasible).toBe(false); expect(needed([m(80, 50), m(70, 50)], 70)).toBeNull();
  });
  it('attendance: explicit beats day mark beats inferred; future is empty; cycle wraps', () => {
    const mt = snap.meetings.find((x) => x.weekday === 0 && x.courseId === 'E')!, d = new Date(2026, 9, 5);
    expect(effective(d, mt, {}, {}, at(2026, 10, 5, 7)).status).toBeNull();
    expect(effective(d, mt, {}, {}, at(2026, 10, 5, 12))).toMatchObject({ status: 'p', inferred: true });
    expect(effective(d, mt, {}, { '2026-10-05': { date: '2026-10-05', status: 's', at: 1, reason: '' } }, at(2026, 10, 5, 12)).status).toBe('s');
    expect(effective(d, mt, { [occKey('2026-10-05', mt)]: { key: 'x', status: 'a', at: 1, reason: '' } }, {}, at(2026, 10, 5, 12)).status).toBe('a');
    expect(nextStatus('c')).toBe('p'); expect(nextStatus(null)).toBe('p');
  });
  it('attendance: a tap on any unmarked or inferred cell records Here — never Late on the first tap', () => {
    const mt = snap.meetings.find((x) => x.weekday === 0 && x.courseId === 'E')!, d = new Date(2026, 9, 5), att = {}, days = {}, noon = at(2026, 10, 5, 12);
    const e = effective(d, mt, att, days, noon);
    expect(e).toMatchObject({ status: 'p', inferred: true }); // a class that ended with no record resolves to an inferred Here
    expect(e.inferred ? nextStatus(e.status) : 'p').toBe('p'); // exactly what Grades.tsx:29 computes for the first tap
    expect(nextStatus('p')).toBe('p'); // an explicit Here is a fixed point too, so no path can escalate to Late
    const future = effective(d, mt, att, days, at(2026, 10, 5, 7));
    expect(future.status && future.inferred ? nextStatus(future.status) : 'p').toBe('p');
  });
  it('attendance: tapping an inferred cell does not corrupt the record it did not mean to change', () => {
    const mt = snap.meetings.find((x) => x.weekday === 0 && x.courseId === 'E')!, d = new Date(2026, 9, 5), noon = at(2026, 10, 5, 12);
    const seen = { key: '', status: 'p' as const, at: 1, reason: '' }; // BUG 1 repro: the old cycle wrote 'l' here
    const e = effective(d, mt, { [occKey('2026-10-05', mt)]: seen }, {}, noon);
    expect(e.inferred).toBe(false); // it was an explicit record, so the tap writes Here
    const written = e.status && e.inferred ? nextStatus(e.status) : 'p';
    expect(written).toBe('p'); expect(seen.status).toBe('p');
  });
  it('attendance: the cycle still advances once a class is Here, so Late→Absent→Sick→Cancelled keeps working', () => {
    expect(nextStatus('l')).toBe('a'); expect(nextStatus('a')).toBe('s'); expect(nextStatus('s')).toBe('c'); expect(nextStatus('c')).toBe('p');
    expect(nextStatus('n')).toBe('p'); expect(nextStatus('t')).toBe('p');
  });
  it('analytics helpers', () => {
    const t = (h: number, due: number) => task({ status: 2, completedAt: new Date(2026, 9, 1, h).getTime(), dueAt: due });
    const done = [t(9, at(2026, 10, 2)), t(9, at(2026, 10, 1, 8))];
    expect(doneByHour(done)[9]).toBe(2); expect(onTimeStats(done)).toMatchObject({ onTime: 1, late: 1, pct: 0.5 });
    expect(streak([0, 1, 1, 0, 1, 1, 1])).toEqual({ current: 3, best: 3 }); expect(streak([1, 1, 0])).toEqual({ current: 2, best: 2 });
    expect(level(0, 10)).toBe(0); expect(level(1, 10)).toBe(1); expect(level(10, 10)).toBe(4);
  });
});
