/**
 * v0.6 — the Obsidian bridge's pure half (docs/BRIDGE.md). The line grammar is checked against lines in
 * the shape Bone Tasks writes, and the merge against the rules the doc promises: last writer wins,
 * a re-read is a no-op, tombstones remove only what exists, Margin-only fields survive a round trip.
 */
import { BRIDGE_FORMAT, buildEnvelope, parseEnvelope, parseTaskLine, planTaskMerge, prioFromBone, prioToBone, taskLine, toBridgeTask } from '../domain/bridge';
import type { Course, Meeting, Task } from '../domain/types';
import { MemoryRepository } from '../data/memory';

const NOW = new Date(2026, 10, 9, 10).getTime(); // Mon 9 Nov 2026
const courses: Course[] = [{ id: 'db', name: 'Database', rooms: ['LR-601'], teacher: '', goal: null, sort: 0, demo: false }];
const meetings: Meeting[] = [{ id: 'm1', courseId: 'db', weekday: 0, start: '08:30', end: '10:00', demo: false }];
const task = (o: Partial<Task> = {}): Task => ({ id: 't1', title: 'ER diagram', courseId: 'db', kind: 'assignment', dueAt: new Date(2026, 10, 12, 17, 0).getTime(), startAt: null, estimateMin: 60, priority: 3, notes: 'chapter 4', status: 0, createdAt: NOW - 1000, completedAt: null, reminders: [{ id: 'r', mode: 'before', minutes: 60, label: '' }], subtasks: [{ id: 's1', t: 'entities', done: true }], demo: false, ...o });

describe('the Tasks-plugin line', () => {
  it('reads the fields Bone Tasks writes', () => {
    const t = parseTaskLine('- [ ] Revise joins #Database ⏫ 🛫 2026-11-10 📅 2026-11-12 ⏰ 17:00 ⏱ 25m ^ab12', 'Daily_Notes/Nov 9, 2026.md')!;
    expect(t).toMatchObject({ title: 'Revise joins #Database', blockId: 'ab12', done: false, due: '2026-11-12', time: '17:00', start: '2026-11-10', prio: 4, spentMin: 25, path: 'Daily_Notes/Nov 9, 2026.md' });
    expect(parseTaskLine('- [x] Done thing ✅ 2026-11-08')).toMatchObject({ done: true, doneOn: '2026-11-08', blockId: null });
    expect(parseTaskLine('just a sentence')).toBeNull();
  });
  it('writes a line that reads back as the same task', () => {
    const b = toBridgeTask(task(), courses);
    const line = taskLine('t1', b);
    expect(line).toBe('- [ ] ER diagram #Database ⏫ 📅 2026-11-12 ⏰ 17:00 ^t1');
    expect(parseTaskLine(line)).toMatchObject({ blockId: 't1', due: b.due, time: b.time, prio: b.prio, done: false });
  });
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
  it('parses its own output, and names rows it cannot read instead of failing the file', () => {
    const env = buildEnvelope({ now: NOW, since: 0, courses, meetings: [], tasks: [{ id: 't1', updatedAt: 1, deleted: false, value: task() }], notices: [], focus: [] });
    const text = JSON.stringify({ ...env, tasks: [...env.tasks, { id: 'bad', updatedAt: 2, data: { title: '' } }, { nope: 1 }] });
    const p = parseEnvelope(text);
    expect(p.envelope!.tasks).toHaveLength(1);
    expect(p.problems).toEqual(['tasks[1]: its data could not be read.', 'tasks[2]: needs an id and an updatedAt.']);
    expect(parseEnvelope('{').envelope).toBeNull();
    expect(parseEnvelope('{"format":"other"}').problems[0]).toContain(BRIDGE_FORMAT);
  });
});

describe('merging Obsidian into Margin', () => {
  const fromBone = (o: Record<string, unknown> = {}) => parseEnvelope(JSON.stringify({ format: BRIDGE_FORMAT, app: 'bone', writtenAt: NOW, tasks: [
    { id: 'ab12', origin: 'obsidian', updatedAt: NOW, data: { title: 'Revise joins', due: '2026-11-12', time: '17:00', prio: 4, course: 'database', path: 'Daily_Notes/Nov 9, 2026.md', ...o } },
  ] })).envelope!;
  it('an Obsidian task becomes a Margin task with a stable id, its subject found by name', () => {
    const plan = planTaskMerge(fromBone(), [], new Map(), courses, NOW);
    expect(plan.put).toHaveLength(1);
    expect(plan.put[0]).toMatchObject({ id: 'ob-ab12', origin: 'obsidian', extId: 'ab12', extPath: 'Daily_Notes/Nov 9, 2026.md', courseId: 'db', priority: 3, status: 0, dueAt: new Date(2026, 10, 12, 17, 0).getTime() });
    expect(plan.put[0]!.reminders).toEqual([{ id: 'ob-ab12-r0', mode: 'before', minutes: 0, label: '' }]); // ⏰ rings through Margin
  });
  it('a re-read of the same file is a no-op, and an older row loses to a newer local edit', () => {
    const first = planTaskMerge(fromBone(), [], new Map(), courses, NOW).put[0]!;
    expect(planTaskMerge(fromBone(), [first], new Map([['ob-ab12', NOW]]), courses, NOW)).toMatchObject({ put: [], stale: 1 });
    expect(planTaskMerge(fromBone({ title: 'x' }), [first], new Map([['ob-ab12', NOW + 1]]), courses, NOW).put).toEqual([]);
  });
  it('Margin-only fields survive an edit made in Obsidian', () => {
    const mine = task({ id: 't1' });
    const env = parseEnvelope(JSON.stringify({ format: BRIDGE_FORMAT, app: 'bone', writtenAt: NOW, tasks: [{ id: 't1', origin: 'margin', updatedAt: NOW, data: { ...toBridgeTask(mine, courses), done: true, doneOn: '2026-11-09' } }] })).envelope!;
    const next = planTaskMerge(env, [mine], new Map([['t1', NOW - 10]]), courses, NOW).put[0]!;
    expect(next).toMatchObject({ id: 't1', status: 2, reminders: mine.reminders, estimateMin: 60, notes: 'chapter 4', createdAt: mine.createdAt });
    expect(next.subtasks[0]!.id).toBe('s1');
    expect('origin' in next).toBe(false);
  });
  it('a tombstone removes a task Margin has, and is ignored for one it never had', () => {
    const env = parseEnvelope(JSON.stringify({ format: BRIDGE_FORMAT, app: 'bone', writtenAt: NOW, tasks: [{ id: 'ab12', origin: 'obsidian', updatedAt: NOW, deleted: true }, { id: 'zz', origin: 'obsidian', updatedAt: NOW, deleted: true }] })).envelope!;
    const have = planTaskMerge(fromBone(), [], new Map(), courses, NOW - 5).put;
    expect(planTaskMerge(env, have, new Map([['ob-ab12', NOW - 5]]), courses, NOW)).toMatchObject({ remove: ['ob-ab12'], unchanged: 1 });
  });
});

describe('the change feed', () => {
  it('lists writes and deletions after a moment, oldest first', async () => {
    let t = 100; const r = new MemoryRepository(() => t);
    await r.upsert('task', task({ id: 'a' })); t = 200; await r.upsert('task', task({ id: 'b' })); t = 300; await r.remove('task', 'a');
    expect((await r.changes('task', 150)).map((c) => [c.id, c.updatedAt, c.deleted])).toEqual([['b', 200, false], ['a', 300, true]]);
  });
});
