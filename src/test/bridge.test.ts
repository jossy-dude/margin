/**
 * The snapshot (`.margin/margin.json`, read-only since v0.8) and the vault-line → task mapping that replaced the
 * v0.6 envelope merge (D4). The promises carried over: a task's subject is found from the note, a ⏰ time rings
 * through Margin, Margin-only fields survive an edit made in Obsidian, priority maps both ways without drift.
 */
import { BRIDGE_FORMAT, buildEnvelope, prioFromBone, prioToBone } from '../domain/bridge';
import { taskFromLine } from '../domain/vaultMap';
import { parseLine } from '../domain/vaultTasks';
import type { Course, Meeting, Task } from '../domain/types';
import { MemoryRepository } from '../data/memory';

const NOW = new Date(2026, 10, 9, 10).getTime(); // Mon 9 Nov 2026
const courses: Course[] = [{ id: 'db', name: 'Database', rooms: ['LR-601'], teacher: '', goal: null, sort: 0, demo: false }];
const meetings: Meeting[] = [{ id: 'm1', courseId: 'db', weekday: 0, start: '08:30', end: '10:00', demo: false }];
const task = (o: Partial<Task> = {}): Task => ({ id: 't1', title: 'ER diagram', courseId: 'db', kind: 'assignment', dueAt: new Date(2026, 10, 12, 17, 0).getTime(), startAt: null, estimateMin: 60, priority: 3, notes: 'chapter 4', status: 0, createdAt: NOW - 1000, completedAt: null, reminders: [{ id: 'r', mode: 'before', minutes: 60, label: '' }], subtasks: [{ id: 's1', t: 'entities', done: true }], demo: false, ...o });

describe('priority', () => {
  it('maps priority both ways without drift on Margin values', () => {
    for (const p of [0, 1, 2, 3] as const) expect(prioFromBone(prioToBone(p))).toBe(p);
    expect(prioFromBone(5)).toBe(3); expect(prioFromBone(1)).toBe(1);
  });
});

describe('the envelope', () => {
  it('carries changed tasks (tombstones too), notices, and the timetable ahead; never sample rows', () => {
    const env = buildEnvelope({
      now: NOW, since: 0, courses, meetings, horizonDays: 7,
      tasks: [{ id: 't1', updatedAt: NOW - 5, deleted: false, value: task() }, { id: 't2', updatedAt: NOW - 4, deleted: true, value: task({ id: 't2' }) }, { id: 'd', updatedAt: NOW, deleted: false, value: task({ id: 'd', demo: true }) }],
      notices: [{ id: 'n1', updatedAt: NOW - 3, deleted: false, value: { id: 'n1', courseId: 'db', text: 'Quiz Friday', dueAt: NOW + 86_400_000, priority: 2, demo: false } }],
      focus: [], cancelled: (d) => d === '2026-11-16',
    });
    expect(env.format).toBe(BRIDGE_FORMAT);
    expect(env.tasks.map((t) => [t.id, !!t.deleted])).toEqual([['t1', false], ['t2', true]]);
    const classes = env.events.filter((e) => e.data?.kind === 'class');
    expect(classes.map((c) => [c.id, c.data!.cancelled])).toEqual([['c-2026-11-09-08:30-db', false], ['c-2026-11-16-08:30-db', true]]);
    expect(env.events.find((e) => e.id === 'n-n1')!.data).toMatchObject({ title: 'Quiz Friday', course: 'Database', kind: 'notice' });
  });
});

describe('a vault line becomes a Margin task', () => {
  const line = (raw: string) => parseLine(raw, 'Daily_Notes/Nov 9, 2026.md', 3)!;
  it('a stable id from its block id, the subject from its tag, and ⏰ rings through Margin', () => {
    const t = taskFromLine(line('- [ ] Revise joins #school #Database ⏫ 📅 2026-11-12 ⏰ 17:00 ^ab12'), undefined, courses, ['#school'], NOW);
    expect(t).toMatchObject({ id: 'ob-ab12', origin: 'obsidian', extId: 'ab12', extPath: 'Daily_Notes/Nov 9, 2026.md', courseId: 'db', priority: 3, status: 0, dueAt: new Date(2026, 10, 12, 17, 0).getTime(), tags: ['school'] });
    expect(t.reminders).toEqual([{ id: 'ob-ab12-r0', mode: 'before', minutes: 0, label: '' }]);
  });
  it('Margin-only fields survive an edit made in Obsidian', () => {
    const mine = task({ id: 't1', extId: 't1' });
    const next = taskFromLine(line('- [x] ER diagram #Database ⏫ 📅 2026-11-12 ⏰ 17:00 ✅ 2026-11-09 ^t1'), mine, courses, ['#school'], NOW);
    expect(next).toMatchObject({ id: 't1', status: 2, reminders: mine.reminders, estimateMin: 60, notes: 'chapter 4', createdAt: mine.createdAt });
    expect(next.subtasks[0]!.id).toBe('s1');
  });
  it('kind tags become the kind; a cancelled line is done and marked cancelled', () => {
    expect(taskFromLine(line('- [-] Lab 3 #school #lab ❌ 2026-11-10 ^x1'), undefined, courses, ['#school'], NOW)).toMatchObject({ kind: 'lab', status: 2, cancelled: true, tags: ['lab', 'school'] });
  });
});

describe('the change feed', () => {
  it('lists writes and deletions after a moment, oldest first', async () => {
    let t = 100; const r = new MemoryRepository(() => t);
    await r.upsert('task', task({ id: 'a' })); t = 200; await r.upsert('task', task({ id: 'b' })); t = 300; await r.remove('task', 'a');
    expect((await r.changes('task', 150)).map((c) => [c.id, c.updatedAt, c.deleted])).toEqual([['b', 200, false], ['a', 300, true]]);
  });
});
