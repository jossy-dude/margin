/** v0.6 Stats: the numbers behind "Are you showing up?" and "Are you on top of your work?". */
import { attendanceBreakdown, canMiss, classDots, weeklySums, workNow } from '../domain/analytics';
import type { AttRecord, Meeting, Task } from '../domain/types';

const NOW = new Date(2026, 10, 11, 18).getTime(); // Wed 11 Nov 2026, evening
const m: Meeting[] = [{ id: 'm1', courseId: 'db', weekday: 0, start: '08:30', end: '10:00', demo: false }, { id: 'm2', courseId: 'db', weekday: 2, start: '08:30', end: '10:00', demo: false }];
const rec = (d: string, status: AttRecord['status'], why?: AttRecord['why']): [string, AttRecord] => [`${d}|08:30|db`, { key: `${d}|08:30|db`, status, at: 1, reason: '', ...(why ? { why } : {}) }];

describe('attendance breakdown', () => {
  const att = Object.fromEntries([rec('2026-10-19', 'a', 'sick'), rec('2026-10-21', 'p', 'late'), rec('2026-10-26', 'c', 'teacher'), rec('2026-10-28', 'a', 'kicked'), rec('2026-11-02', 'a')]);
  it('counts held classes by state and reason, inferred present included, cancelled kept apart', () => {
    const b = attendanceBreakdown(m, att, {}, 28, NOW);
    // 8 occurrences from 15 Oct to 11 Nov (Mon+Wed), all ended by 18:00 today
    expect(b).toMatchObject({ held: 7, present: 4, late: 1, absent: 3, cancelled: 1 });
    expect(b.why).toEqual({ a: { sick: 1, kicked: 1 }, c: { teacher: 1 }, p: { late: 1 } });
  });
  it('gives one dot per class, not per day, oldest first', () => {
    const dots = classDots('db', m, att, {}, 28, NOW);
    expect(dots.map((d) => d.date)).toEqual(['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28', '2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
    expect(dots[2]).toMatchObject({ status: 'c', why: 'teacher' });
  });
  it('says how many classes can still be missed before 80%', () => {
    expect(canMiss(10, 10)).toBe(2); // 10/12 = 83%, 10/13 = 77%
    expect(canMiss(8, 10)).toBe(0);
    expect(canMiss(0, 0)).toBe(0);
  });
});

describe('work right now', () => {
  const t = (o: Partial<Task>): Task => ({ id: Math.random().toString(36), title: 'x', courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false, ...o });
  it('overdue, due in the next seven days, and done since Monday', () => {
    const tasks = [t({ dueAt: NOW - 1 }), t({ dueAt: NOW + 86_400_000 }), t({ dueAt: NOW + 10 * 86_400_000 }), t({ status: 2, completedAt: new Date(2026, 10, 9, 9).getTime() }), t({ status: 2, completedAt: new Date(2026, 10, 6).getTime() })];
    expect(workNow(tasks, NOW)).toEqual({ overdue: 1, dueSoon: 1, doneWeek: 1 });
  });
  it('sums days into calendar weeks, this week being Monday to today', () => {
    const days = [1, 1, 1, 1, 1, 1, 1, /* Mon */ 2, 2, 2];
    expect(weeklySums(days, 8, 2)).toEqual([7, 6]);
  });
});
