/** The Focus page's study log: what counts as today and this week, and which subject leads. */
import { focusSummary } from '../domain/analytics';
import type { Course, FocusSession } from '../domain/types';

const C: Course[] = [{ id: 'm', name: 'Maths', rooms: [], teacher: '', goal: null, sort: 0, demo: false }, { id: 'h', name: 'History', rooms: [], teacher: '', goal: null, sort: 1, demo: false }];
const NOW = new Date(2026, 10, 4, 15).getTime(); // a Wednesday afternoon
const at = (dayOffset: number, h: number) => new Date(2026, 10, 4 + dayOffset, h).getTime();
const S = (courseId: string | null, startedAt: number, min: number): FocusSession => ({ id: `${courseId}${startedAt}`, taskId: null, courseId, startedAt, endedAt: startedAt + min * 60_000, focusSec: min * 60, breakSec: 0, overSec: 0, rounds: 1, planMin: min, mode: 'focus', completed: true, demo: false });

describe('focusSummary', () => {
  it('splits today, this week (Monday first) and last week', () => {
    const r = focusSummary([S('m', at(0, 9), 25), S('h', at(-1, 9), 50), S('m', at(-2, 9), 30), S('m', at(-3, 9), 45), S(null, at(0, 11), 10)], C, NOW);
    expect(r.todayMin).toBe(35);           // 25 + 10 today
    expect(r.weekMin).toBe(115);           // Mon (−2) + Tue (−1) + Wed (0): 30 + 50 + 25 + 10
    expect(r.lastWeekMin).toBe(45);        // Sunday (−3) belongs to the week before
  });
  it('ranks subjects by minutes this week and names the top one (never "something else")', () => {
    const r = focusSummary([S(null, at(0, 8), 200), S('m', at(0, 9), 25), S('h', at(-1, 9), 50)], C, NOW);
    expect(r.week.map((w) => w.name)).toEqual(['Something else', 'History', 'Maths']);
    expect(r.top).toEqual({ id: 'h', name: 'History', min: 50, sessions: 1 });
  });
  it('sums seconds before rounding, counts sessions and keeps a removed subject honest', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ ...S('m', at(0, 8) + i * 60_000, 0), focusSec: 276 }));
    const r = focusSummary([...many, S('gone', at(0, 9), 20)], C, NOW);
    expect(r.week.find((w) => w.id === 'm')).toEqual({ id: 'm', name: 'Maths', min: 55, sessions: 12 });
    expect(r.week.find((w) => w.id === 'gone')?.name).toBe('A removed subject');
  });
  it('is empty, not broken, with no sessions', () => {
    expect(focusSummary([], C, NOW)).toEqual({ todayMin: 0, weekMin: 0, lastWeekMin: 0, week: [], top: null, streak: 0, recent: [] });
  });
  it('counts the streak in days up to today', () => {
    expect(focusSummary([S('m', at(0, 9), 5), S('m', at(-1, 9), 5), S('m', at(-2, 9), 5), S('m', at(-4, 9), 5)], C, NOW).streak).toBe(3);
  });
});
