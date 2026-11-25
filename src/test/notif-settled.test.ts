import { planReminders, settledIds } from '../domain/reminders';
import { DEFAULT_NOTIF } from '../domain/defaults';
import { occKey } from '../domain/attendance';
import { seedSnapshot } from '../data/seed';
import type { Task } from '../domain/types';

/* v0.7.6, the owner: "it still sends even after I finish a task and after I already assign the status of the class". */
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = at(2026, 10, 5, 8, 0); // Monday 5 Oct 2026, 08:00
const snap = seedSnapshot(NOW);
const base = { now: NOW, courses: snap.courses, meetings: snap.meetings, attendance: {}, dayMarks: {}, settings: DEFAULT_NOTIF };
const task = (o: Partial<Task>): Task => ({ id: 't', title: 'T', courseId: 'D', kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...o });
const econ = occKey('2026-10-05', { start: '08:30', courseId: 'E' });

describe('reminders stop once there is nothing left to do', () => {
  it('a class marked ahead of time asks for nothing: no "in 10 min", no "just ended"', () => {
    const p = planReminders({ ...base, tasks: [], attendance: { [econ]: { key: econ, status: 'a' as const, at: 1, reason: '' } } as never });
    expect(p.items.some((x) => x.entityId === econ)).toBe(false);
  });
  it('a day marked as a whole silences every class of that day', () => {
    const p = planReminders({ ...base, tasks: [], dayMarks: { '2026-10-05': { status: 'x', at: 1 } } as never });
    expect(p.items.some((x) => x.entityId.startsWith('2026-10-05'))).toBe(false);
    expect(p.items.some((x) => x.entityId.startsWith('2026-10-06'))).toBe(true);
  });
  it('an unmarked class still gets its "just ended" prompt', () => {
    const p = planReminders({ ...base, tasks: [] });
    expect(p.items.some((x) => x.kind === 'ended' && x.entityId === econ)).toBe(true);
  });
  it('settled ids name done tasks (and their start reminders) and marked classes, nothing open', () => {
    const s = settledIds({ ...base, tasks: [task({ id: 'done', status: 2 }), task({ id: 'open' })], attendance: { [econ]: { key: econ, status: 'p' as const, at: 1, reason: '' } } as never });
    expect([...s].sort()).toEqual(['done', 'doneb', 'dones', econ].sort());
  });
  it('a task with no due date still rings at a time it was given (v0.7.6.5)', () => {
    const t = task({ id: 'leave', dueAt: null, reminders: [{ id: 'r', mode: 'abs', at: at(2026, 10, 5, 19, 0), label: 'At a chosen time' }] });
    const p = planReminders({ ...base, tasks: [t] });
    expect(p.items.filter((x) => x.entityId === 'leave').map((x) => x.at)).toEqual([at(2026, 10, 5, 19, 0)]);
  });
});
