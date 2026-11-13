/** v0.7 R9 — "1 h before first class" moves with the timetable; sentences read right. */
import { RULE_TEMPLATES, ruleHits, ruleSentence, type ReminderRule } from '../domain/ruleReminders';
import type { Meeting, Task } from '../domain/types';

const MON = new Date(2026, 10, 16); // Monday 16 Nov 2026
const m = (id: string, weekday: number, start: string, end: string, courseId = 'db', variantId: string | null = null): Meeting => ({ id, courseId, weekday, start, end, demo: false, variantId });
// Margin's weekday: Monday = 0
const meetings = [m('a', 0, '09:00', '09:50'), m('b', 0, '14:00', '16:00', 'db', 'v-lab'), m('c', 1, '11:00', '12:00', 'ec')];
const wk: boolean[] = [false, true, true, true, true, true, false];
const rule = (anchor: ReminderRule['anchor'], offsetMin: number, days = wk): ReminderRule => ({ id: 'r', enabled: true, offsetMin, anchor, days, text: 'x' });
const week = { from: MON.getTime(), to: MON.getTime() + 7 * 86_400_000 };
const t = (h: number, min = 0, d = MON) => { const x = new Date(d); x.setHours(h, min, 0, 0); return x.getTime(); };
const tue = new Date(2026, 10, 17);

describe('reminder rules', () => {
  it('1 h before first class follows each day and skips days with no class', () => {
    const hits = ruleHits(rule({ kind: 'firstClass' }, -60), { meetings, tasks: [], ...week });
    expect(hits.map((h) => h.at)).toEqual([t(8), t(10, 0, tue)]);
  });
  it('moves when the first class is cancelled', () => {
    const cancelled = new Set([`${MON.toDateString()}|a`]);
    const hits = ruleHits(rule({ kind: 'firstClass' }, -60), { meetings, tasks: [], ...week, cancelled });
    expect(hits[0]!.at).toBe(t(13));
  });
  it('every Lab (a component), and 15 min after the last class', () => {
    expect(ruleHits(rule({ kind: 'component', componentId: 'v-lab' }, -20), { meetings, tasks: [], ...week }).map((h) => h.at)).toEqual([t(13, 40)]);
    expect(ruleHits(rule({ kind: 'lastClass' }, 15), { meetings, tasks: [], ...week }).map((h) => h.at)).toEqual([t(16, 15), t(12, 15, tue)]);
  });
  it('the evening before an exam; a plain time on Sundays', () => {
    const exam = { id: 'e1', title: 'DB exam', courseId: 'db', kind: 'exam', dueAt: t(9, 0, new Date(2026, 10, 19)), status: 0 } as unknown as Task;
    expect(ruleHits(rule({ kind: 'exam' }, -16 * 60, [true, true, true, true, true, true, true]), { meetings, tasks: [exam], ...week }).map((h) => h.at)).toEqual([t(17, 0, new Date(2026, 10, 18))]);
    const sun = ruleHits(rule({ kind: 'time', at: '19:00' }, 0, [true, false, false, false, false, false, false]), { meetings, tasks: [], ...week });
    expect(sun.map((h) => new Date(h.at).getDay())).toEqual([0]);
  });
  it('reads as a sentence; templates are valid', () => {
    expect(ruleSentence(rule({ kind: 'firstClass' }, -60))).toBe('1 h before first class · Mon–Fri');
    expect(ruleSentence(rule({ kind: 'time', at: '19:00' }, 0, [true, false, false, false, false, false, false]))).toBe('19:00 · Sun');
    expect(ruleSentence(rule({ kind: 'component', componentId: 'v-lab' }, -20), () => 'Lab')).toBe('20 min before every Lab · Mon–Fri');
    expect(RULE_TEMPLATES).toHaveLength(6);
    expect(RULE_TEMPLATES.every((r) => r.days.length === 7)).toBe(true);
  });
});
