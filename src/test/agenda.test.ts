/**
 * v0.7 — the agenda the phone's half reads (widgets, the pinned class, alarms), and the links it opens the app with.
 * The native side only reads this document, so what a class IS — cancelled, out of term, a lab in its own room —
 * is decided and pinned here.
 */
import { AGENDA_DAYS, agendaSig, buildAgenda, classAlarmTimes, newAlarm, nextClockTime, nextRing, spentAlarms, type AgendaInput } from '../domain/agenda';
import { DEFAULT_NOTIF, DEFAULT_SETTINGS } from '../domain/defaults';
import { linkTarget } from '../domain/links';
import { occKey } from '../domain/attendance';
import type { AlarmRule, Course, Meeting, Task } from '../domain/types';

/** Monday 9 Nov 2026, 08:00 local. */
const NOW = new Date(2026, 10, 9, 8, 0, 0).getTime();
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m, 0).getTime();
const courses: Course[] = [
  { id: 'cp', name: 'Computer Programming', rooms: ['C-4'], teacher: 'Reyes', goal: null, sort: 0, demo: false },
  { id: 'ec', name: 'Intro to Economics', rooms: ['B-12', 'B-14'], teacher: 'Hale', goal: null, sort: 1, demo: false },
];
const meetings: Meeting[] = [
  { id: 'm1', courseId: 'cp', weekday: 0, start: '09:00', end: '09:50', demo: false },
  { id: 'm2', courseId: 'ec', weekday: 0, start: '10:55', end: '11:45', demo: false, room: 'B-14' },
  { id: 'm3', courseId: 'cp', weekday: 2, start: '13:00', end: '14:30', demo: false, variantId: 'v1' },
];
const task = (id: string, dueAt: number | null, status: 0 | 1 | 2 = 0): Task => ({ id, title: `Task ${id}`, courseId: 'cp', kind: 'assignment', dueAt, startAt: null, estimateMin: null, priority: 0, notes: '', status, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });
const input = (over: Partial<AgendaInput> = {}): AgendaInput => ({
  now: NOW, courses, meetings, variants: [{ id: 'v1', subjectId: 'cp', name: 'Lab', room: 'Lab 2', teacher: 'Okoro', note: '', ord: 0 }],
  attendance: {}, dayMarks: {}, tasks: [], settings: { ...DEFAULT_SETTINGS, semesterStart: '2026-09-07', semesterEnd: '', notif: DEFAULT_NOTIF, alarms: [] }, ...over,
});

describe('the classes', () => {
  it('are the next two weeks as concrete instants, in order, with room and teacher', () => {
    const a = buildAgenda(input());
    expect(a.classes.map((c) => [c.t, c.s, c.e, c.r, c.w]).slice(0, 3)).toEqual([
      ['Computer Programming', at(9, 9), at(9, 9, 50), 'C-4', 'Reyes'],
      ['Intro to Economics', at(9, 10, 55), at(9, 11, 45), 'B-14', 'Hale'],
      ['Computer Programming · Lab', at(11, 13), at(11, 14, 30), 'Lab 2', 'Okoro'],
    ]);
    // two Mondays and two Wednesdays fall inside the window
    expect(a.classes).toHaveLength(6);
    expect(Math.max(...a.classes.map((c) => c.s))).toBeLessThan(NOW + AGENDA_DAYS * 86_400_000);
    expect([...a.classes].sort((x, y) => x.s - y.s)).toEqual(a.classes);
  });
  it('leave out a cancelled class and a day marked cancelled', () => {
    const key = occKey('2026-11-09', meetings[0]!);
    const a = buildAgenda(input({ attendance: { [key]: { key, status: 'c', at: NOW, reason: '' } } }));
    expect(a.classes.find((c) => c.s === at(9, 9))).toBeUndefined();
    const b = buildAgenda(input({ dayMarks: { '2026-11-11': { date: '2026-11-11', status: 'c', at: NOW, reason: '' } } }));
    expect(b.classes.find((c) => c.s === at(11, 13))).toBeUndefined();
  });
  it('stop at the end of term', () => {
    const a = buildAgenda(input({ settings: { ...input().settings, semesterEnd: '2026-11-10' } }));
    expect(a.classes.map((c) => c.s)).toEqual([at(9, 9), at(9, 10, 55)]);
  });
  it('keep a class that already ended today, so the day reads whole', () => {
    const a = buildAgenda(input({ now: at(9, 12) }));
    expect(a.classes[0]!.s).toBe(at(9, 9));
  });
});

describe('the tasks', () => {
  it('are the open ones that have a due date, soonest first, capped', () => {
    const tasks = [task('late', at(8, 12)), task('done', at(9, 12), 2), task('none', null), task('soon', at(9, 18)), ...Array.from({ length: 14 }, (_, i) => task(`x${i}`, at(20, 10 + i % 10, i)))];
    const a = buildAgenda(input({ tasks }));
    expect(a.tasks.slice(0, 2).map((t) => t.id)).toEqual(['late', 'soon']);
    expect(a.tasks).toHaveLength(12);
    expect(a.tasks[0]).toMatchObject({ t: 'Task late', s: 'Computer Programming', k: 'assignment' });
  });
});

describe('the pinned class follows the reminder switches', () => {
  it('is on by default, and off with either switch', () => {
    expect(buildAgenda(input()).pinClass).toBe(true);
    expect(buildAgenda(input({ settings: { ...input().settings, notif: { ...DEFAULT_NOTIF, pinClass: false } } })).pinClass).toBe(false);
    expect(buildAgenda(input({ settings: { ...input().settings, notif: { ...DEFAULT_NOTIF, enabled: false } } })).pinClass).toBe(false);
  });
});

describe('alarms', () => {
  const clock = (over: Partial<AlarmRule> = {}): AlarmRule => ({ ...newAlarm('a1', NOW), h: 7, m: 30, ...over });
  it('a weekly clock alarm goes across as a rule, and rings next on its next chosen day', () => {
    const r = clock();
    expect(buildAgenda(input({ settings: { ...input().settings, alarms: [r] } })).alarms[0]).toMatchObject({ h: 7, m: 30, days: [true, true, true, true, true, false, false], at: [], on: true });
    // 08:00 on Monday is past 07:30, so Tuesday
    expect(nextRing(r, input())).toBe(at(10, 7, 30));
    // on Friday evening a weekday alarm waits for Monday
    expect(nextRing(r, input({ now: at(13, 20) }))).toBe(at(16, 7, 30));
  });
  it('an alarm with no day chosen rings once, at the moment it was armed for', () => {
    const r = clock({ days: [false, false, false, false, false, false, false], once: at(10, 7, 30) });
    expect(nextRing(r, input())).toBe(at(10, 7, 30));
    expect(buildAgenda(input({ settings: { ...input().settings, alarms: [r] } })).alarms[0]!.at).toEqual([at(10, 7, 30)]);
    // …and once that moment has passed it is spent: off in the agenda, and switched off in the list
    const later = input({ now: at(10, 8), settings: { ...input().settings, alarms: [r] } });
    expect(buildAgenda(later).alarms[0]).toMatchObject({ on: false, at: [] });
    expect(spentAlarms([r], at(10, 8))).toEqual([{ ...r, on: false }]);
    expect(spentAlarms([clock()], at(10, 8))).toBeNull();
  });
  it('a timetable alarm rings before the FIRST class of each chosen day, as concrete instants', () => {
    const r = clock({ kind: 'class', lead: 60, days: [true, true, true, true, true, true, true] });
    const times = classAlarmTimes(r, input());
    // Monday's first class is 09:00 → 08:00, which is exactly now and therefore not ahead; Wednesday's lab is 13:00
    expect(times.slice(0, 2)).toEqual([at(11, 12), at(16, 8)]);
    expect(nextRing(r, input())).toBe(at(11, 12));
  });
  it('a timetable alarm moves to the next class when the first one is cancelled', () => {
    const r = clock({ kind: 'class', lead: 30, days: [true, true, true, true, true, true, true] });
    const key = occKey('2026-11-16', meetings[0]!);
    const times = classAlarmTimes(r, input({ attendance: { [key]: { key, status: 'c', at: NOW, reason: '' } } }));
    expect(times).toContain(at(16, 10, 25));
    expect(times).not.toContain(at(16, 8, 30));
  });
  it('an alarm that is off never rings', () => {
    expect(nextRing(clock({ on: false }), input())).toBeNull();
    expect(buildAgenda(input({ settings: { ...input().settings, alarms: [clock({ kind: 'class', on: false })] } })).alarms[0]!.at).toEqual([]);
  });
  it('the next clock time is today when it is still ahead, otherwise tomorrow', () => {
    expect(nextClockTime(9, 0, NOW)).toBe(at(9, 9));
    expect(nextClockTime(7, 0, NOW)).toBe(at(10, 7));
  });
});

describe('an unchanged agenda is not sent twice', () => {
  it('the signature ignores the moment it was built, and nothing else', () => {
    const a = buildAgenda(input()), b = buildAgenda(input({ now: NOW + 60_000 }));
    expect(agendaSig(a)).toBe(agendaSig(b));
    expect(agendaSig(buildAgenda(input({ tasks: [task('t', at(9, 18))] })))).not.toBe(agendaSig(a));
  });
});

describe('links', () => {
  it('land where the widget or notification meant', () => {
    expect(linkTarget('marginalia://today')).toEqual({ t: 'route', route: 'Today' });
    expect(linkTarget('marginalia://tasks/')).toEqual({ t: 'route', route: 'Tasks' });
    expect(linkTarget('marginalia://add/task')).toEqual({ t: 'add-task' });
    expect(linkTarget('marginalia://alarms')).toEqual({ t: 'alarms' });
    expect(linkTarget('exp+marginalia://today')).toEqual({ t: 'route', route: 'Today' });
  });
  it('anything else opens the app where it was', () => {
    for (const u of [null, '', 'https://example.com/today', 'marginalia://', 'marginalia://nonsense', 'marginalia://expo-development-client/?url=x']) expect(linkTarget(u)).toBeNull();
  });
});
