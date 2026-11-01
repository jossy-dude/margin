/**
 * F3 — the store's entity actions, pinned as behaviour before F4 splits `store/store.ts` into modules.
 *
 * Every action here is checked for the same four things, each from the outside:
 *
 *  1. **Optimistic**: the change is in `getState()` synchronously, before any promise has settled.
 *  2. **Persisted**: the in-memory repository (the same port SQLite implements) holds the write, and
 *     its outbox names the operation (`put` / `del` / `restore`), which is what a sync server drains.
 *  3. **Rebuild**: whether the action asks for a reminder rebuild, and after how long. The rebuild is
 *     observed where it lands — `services/notifications.sync` receiving a plan — never by reading the
 *     store's source.
 *  4. **Undo**: where the action raises an undo toast, the toast's own `undo` restores the previous
 *     state on screen and in the repository.
 *
 * Nothing here asserts what *should* happen; it records what happens today, so that a module split
 * that changes any of it fails a test instead of shipping.
 */
import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate, set, stopResync } from '../store/store';
import type { Course, Mark, Meeting, Notice, Task } from '../domain/types';

const mockSync = jest.fn(async (_plan: unknown, _accent: string) => ({ added: 0, removed: 0, planned: [] as { id: string; kind: string; at: number }[] }));
const mockLockscreen = jest.fn(async (_lockText: boolean) => undefined);
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: (plan: unknown, accent: string) => mockSync(plan, accent),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
  applyLockscreenText: (lockText: boolean) => mockLockscreen(lockText),
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));

/** Monday 5 Oct 2026, 08:00 — every timestamp the store writes is read from this clock. */
const NOW = new Date(2026, 9, 5, 8).getTime();
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const settle = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); await flush(); };

beforeEach(() => { jest.useFakeTimers({ now: NOW }); mockSync.mockClear(); mockLockscreen.mockClear(); });
afterEach(() => { stopResync(); jest.useRealTimers(); });

/** A hydrated store over a fresh memory repository, with hydrate's own first rebuild already spent,
 *  the rebuild counter at zero and no toast showing — so whatever happens next belongs to the action. */
async function store(seed?: (r: MemoryRepository) => Promise<void>) {
  const repo = new MemoryRepository(() => NOW);
  if (seed) await seed(repo);
  await hydrate(repo);
  await settle(1500);
  jest.setSystemTime(NOW); // the action under test runs at NOW exactly
  mockSync.mockClear();
  set({ toast: null });
  return repo;
}
/** The rebuild is debounced: nothing one millisecond early, exactly one rebuild on time. */
async function rebuildsAfter(delay: number) {
  if (delay > 0) { await settle(delay - 1); expect(mockSync).not.toHaveBeenCalled(); }
  await settle(1);
  expect(mockSync).toHaveBeenCalledTimes(1);
  mockSync.mockClear();
}
/** Longer than any delay the store uses (hydrate's 1.5 s), shorter than a plain toast's 2.6 s. */
async function noRebuild() { await settle(2000); expect(mockSync).not.toHaveBeenCalled(); }
const ops = async (r: MemoryRepository) => (await r.pendingOutbox()).map((o) => `${o.entity}:${o.id}:${o.op}`);
const undo = () => { const u = getState().toast?.undo; expect(typeof u).toBe('function'); u!(); };

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: 'Problem set 6', courseId: null, kind: 'assignment', dueAt: NOW + 86_400_000, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...extra });
const course = (id: string, extra: Partial<Course> = {}): Course => ({ id, name: 'Organic Chemistry', rooms: ['B-12'], teacher: 'Hale', goal: null, sort: 0, demo: false, ...extra });
const meeting = (id: string, courseId: string, extra: Partial<Meeting> = {}): Meeting => ({ id, courseId, weekday: 0, start: '09:00', end: '09:50', demo: false, ...extra });
const mark = (id: string, courseId: string, extra: Partial<Mark> = {}): Mark => ({ id, courseId, name: 'Quiz 3', score: 70, weight: 10, on: true, sort: 0, demo: false, ...extra });
const notice = (id: string, extra: Partial<Notice> = {}): Notice => ({ id, courseId: null, text: 'Bring the sources', dueAt: NOW, priority: 0, demo: false, ...extra });

describe('tasks', () => {
  it('saveTask appends a new task on screen at once, writes it, and rebuilds after 700 ms', async () => {
    const repo = await store();
    act.saveTask(task('t1'));
    expect(getState().tasks.map((t) => t.id)).toEqual(['t1']); // synchronous: no await between
    await flush();
    expect((await repo.load()).tasks).toEqual([task('t1')]);
    expect(await ops(repo)).toEqual(['task:t1:put']);
    await rebuildsAfter(700);
    expect(getState().toast).toBeNull(); // a save is silent
  });

  it('saveTask with a known id replaces that task in place', async () => {
    const repo = await store(async (r) => { await r.upsert('task', task('t1')); await r.upsert('task', task('t2')); });
    act.saveTask(task('t1', { title: 'Renamed' }));
    expect(getState().tasks.map((t) => [t.id, t.title])).toEqual([['t1', 'Renamed'], ['t2', 'Problem set 6']]);
    await flush();
    expect((await repo.load()).tasks.find((t) => t.id === 't1')?.title).toBe('Renamed');
    await rebuildsAfter(700);
  });

  it('toggleTask completes a task: status 2, completedAt now, every subtask ticked', async () => {
    const repo = await store(async (r) => { await r.upsert('task', task('t1', { subtasks: [{ id: 's1', t: 'outline', done: false }, { id: 's2', t: 'draft', done: true }] })); });
    act.toggleTask('t1');
    expect(getState().tasks[0]).toMatchObject({ status: 2, completedAt: NOW, subtasks: [{ id: 's1', done: true }, { id: 's2', done: true }] });
    await flush();
    expect((await repo.load()).tasks[0]).toMatchObject({ status: 2, completedAt: NOW });
    await rebuildsAfter(700);
  });

  it('toggleTask on a done task re-opens it; the subtasks it ticked stay ticked', async () => {
    await store(async (r) => { await r.upsert('task', task('t1', { status: 2, completedAt: NOW - 1000, subtasks: [{ id: 's1', t: 'outline', done: true }] })); });
    act.toggleTask('t1');
    expect(getState().tasks[0]).toMatchObject({ status: 0, completedAt: null, subtasks: [{ id: 's1', done: true }] });
    await rebuildsAfter(700);
  });

  it('toggleTask and toggleSubtask on an unknown id change nothing and ask for nothing', async () => {
    await store(async (r) => { await r.upsert('task', task('t1')); });
    const before = getState().tasks;
    act.toggleTask('nope'); act.toggleSubtask('nope', 's1');
    expect(getState().tasks).toBe(before);
    await noRebuild();
  });

  it('toggleSubtask flips exactly one subtask and saves the task', async () => {
    const repo = await store(async (r) => { await r.upsert('task', task('t1', { subtasks: [{ id: 's1', t: 'outline', done: false }, { id: 's2', t: 'draft', done: false }] })); });
    act.toggleSubtask('t1', 's2');
    expect(getState().tasks[0]!.subtasks.map((s) => s.done)).toEqual([false, true]);
    expect(getState().tasks[0]!.status).toBe(0);
    await flush();
    expect((await repo.load()).tasks[0]!.subtasks.map((s) => s.done)).toEqual([false, true]);
    await rebuildsAfter(700);
  });

  it('removeTask takes it off screen and out of the repository, and its undo puts it back in both', async () => {
    const repo = await store(async (r) => { await r.upsert('task', task('t1')); await r.upsert('task', task('t2')); });
    act.removeTask('t1');
    expect(getState().tasks.map((t) => t.id)).toEqual(['t2']);
    expect(getState().toast?.text).toBe('Task deleted');
    await flush();
    expect((await repo.load()).tasks.map((t) => t.id)).toEqual(['t2']);
    await rebuildsAfter(700);

    undo();
    expect(getState().tasks.map((t) => t.id)).toEqual(['t2', 't1']); // restored at the end of the list
    await flush();
    expect((await repo.load()).tasks.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect((await ops(repo)).slice(-2)).toEqual(['task:t1:del', 'task:t1:restore']);
    await rebuildsAfter(700);
  });

  it('removeTask on an unknown id raises no toast and asks for no rebuild', async () => {
    await store();
    act.removeTask('nope');
    expect(getState().toast).toBeNull();
    await noRebuild();
  });
});

describe('attendance stamps', () => {
  const KEY = '2026-10-05|09:00|E';

  it('setAtt stamps the class with the time and reason, writes it, rebuilds, and toasts the status', async () => {
    const repo = await store();
    act.setAtt(KEY, 'a', 'dentist');
    expect(getState().attendance[KEY]).toEqual({ key: KEY, status: 'a', at: NOW, reason: 'dentist' });
    expect(getState().toast?.text).toBe('Marked Absent');
    await flush();
    expect((await repo.load()).attendance[KEY]).toEqual({ key: KEY, status: 'a', at: NOW, reason: 'dentist' });
    await rebuildsAfter(700);
  });

  it('undoing a first stamp removes the record; undoing a re-stamp restores the previous one', async () => {
    const repo = await store();
    act.setAtt(KEY, 'l');
    undo();
    expect(getState().attendance[KEY]).toBeUndefined();
    await flush();
    expect((await repo.load()).attendance[KEY]).toBeUndefined();
    await rebuildsAfter(700);

    act.setAtt(KEY, 'p'); act.setAtt(KEY, 's', 'fever');
    undo();
    expect(getState().attendance[KEY]).toMatchObject({ status: 'p' });
    await flush();
    expect((await repo.load()).attendance[KEY]).toMatchObject({ status: 'p' });
    await rebuildsAfter(700);
  });

  it('clearAtt hands the class back to automatic, and its undo restores the stamp', async () => {
    const repo = await store(async (r) => { await r.upsert('attendance', { key: KEY, status: 'l', at: NOW - 60_000, reason: 'bus' }); });
    act.clearAtt(KEY);
    expect(getState().attendance[KEY]).toBeUndefined();
    expect(getState().toast?.text).toBe('Back to automatic');
    await flush();
    expect((await repo.load()).attendance[KEY]).toBeUndefined();
    await rebuildsAfter(700);

    undo();
    expect(getState().attendance[KEY]).toEqual({ key: KEY, status: 'l', at: NOW - 60_000, reason: 'bus' });
    await flush();
    expect((await repo.load()).attendance[KEY]).toMatchObject({ status: 'l', reason: 'bus' });
    expect((await ops(repo)).slice(-2)).toEqual([`attendance:${KEY}:del`, `attendance:${KEY}:restore`]);
    await rebuildsAfter(700);
  });

  it('clearAtt on a class with no stamp is a silent no-op', async () => {
    await store();
    act.clearAtt(KEY);
    expect(getState().toast).toBeNull();
    await noRebuild();
  });
});

describe('day marks', () => {
  const DAY = '2026-10-05';

  it('setDay marks the whole day, writes it, rebuilds, and its undo removes a first mark', async () => {
    const repo = await store();
    act.setDay(DAY, 'c', 'strike');
    expect(getState().dayMarks[DAY]).toEqual({ date: DAY, status: 'c', at: NOW, reason: 'strike' });
    expect(getState().toast?.text).toBe('Marked Cancelled');
    await flush();
    expect((await repo.load()).dayMarks[DAY]).toMatchObject({ status: 'c', reason: 'strike' });
    await rebuildsAfter(700);

    undo();
    expect(getState().dayMarks[DAY]).toBeUndefined();
    await flush();
    expect((await repo.load()).dayMarks[DAY]).toBeUndefined();
    await rebuildsAfter(700);
  });

  it('undoing a re-mark restores the previous day mark', async () => {
    const repo = await store(async (r) => { await r.upsert('dayMark', { date: DAY, status: 's', at: NOW - 1, reason: 'flu' }); });
    act.setDay(DAY, 'p');
    undo();
    expect(getState().dayMarks[DAY]).toEqual({ date: DAY, status: 's', at: NOW - 1, reason: 'flu' });
    await flush();
    expect((await repo.load()).dayMarks[DAY]).toMatchObject({ status: 's', reason: 'flu' });
  });

  it('clearDay removes the mark and its undo restores it; no mark means no toast', async () => {
    const repo = await store(async (r) => { await r.upsert('dayMark', { date: DAY, status: 'a', at: NOW - 1, reason: '' }); });
    act.clearDay('2026-10-06');
    expect(getState().toast).toBeNull();

    act.clearDay(DAY);
    expect(getState().dayMarks[DAY]).toBeUndefined();
    expect(getState().toast?.text).toBe('Day mark cleared');
    await flush();
    expect((await repo.load()).dayMarks[DAY]).toBeUndefined();
    await rebuildsAfter(700);

    undo();
    expect(getState().dayMarks[DAY]).toMatchObject({ status: 'a' });
    await flush();
    expect((await repo.load()).dayMarks[DAY]).toMatchObject({ status: 'a' });
    expect((await ops(repo)).slice(-2)).toEqual([`dayMark:${DAY}:del`, `dayMark:${DAY}:restore`]);
    await rebuildsAfter(700);
  });
});

describe('courses and meetings', () => {
  it('saveCourse appends or replaces, writes, rebuilds, and raises no toast', async () => {
    const repo = await store();
    act.saveCourse(course('E'));
    act.saveCourse(course('M', { name: 'Maths', sort: 1 }));
    act.saveCourse(course('E', { rooms: ['C-3'] }));
    expect(getState().courses.map((c) => [c.id, c.rooms[0]])).toEqual([['E', 'C-3'], ['M', 'B-12']]);
    await flush();
    expect((await repo.load()).courses.map((c) => [c.id, c.rooms[0]])).toEqual([['E', 'C-3'], ['M', 'B-12']]);
    expect(getState().toast).toBeNull();
    await rebuildsAfter(700);
  });

  it('saveMeeting appends or replaces, writes, and rebuilds', async () => {
    const repo = await store();
    act.saveMeeting(meeting('m1', 'E'));
    act.saveMeeting(meeting('m1', 'E', { start: '10:00', end: '10:50' }));
    expect(getState().meetings).toEqual([meeting('m1', 'E', { start: '10:00', end: '10:50' })]);
    await flush();
    expect((await repo.load()).meetings).toEqual([meeting('m1', 'E', { start: '10:00', end: '10:50' })]);
    await rebuildsAfter(700);
  });

  it('removeMeeting takes the class off the timetable, and its undo puts it back', async () => {
    const repo = await store(async (r) => { await r.upsert('meeting', meeting('m1', 'E')); await r.upsert('meeting', meeting('m2', 'E', { weekday: 2 })); });
    act.removeMeeting('m1');
    expect(getState().meetings.map((m) => m.id)).toEqual(['m2']);
    expect(getState().toast?.text).toBe('Class removed from the timetable');
    await flush();
    expect((await repo.load()).meetings.map((m) => m.id)).toEqual(['m2']);
    await rebuildsAfter(700);

    undo();
    expect(getState().meetings.map((m) => m.id)).toEqual(['m2', 'm1']);
    await flush();
    expect((await repo.load()).meetings.map((m) => m.id).sort()).toEqual(['m1', 'm2']);
    await rebuildsAfter(700);
  });

  it('removeMeeting on an unknown id does nothing', async () => {
    await store();
    act.removeMeeting('nope');
    expect(getState().toast).toBeNull();
    await noRebuild();
  });
});

describe('removeCourse cascades, and its undo reverses the cascade', () => {
  const seedTwo = async (r: MemoryRepository) => {
    await r.upsert('course', course('E', { sort: 0 }));
    await r.upsert('course', course('M', { name: 'Maths', sort: 1 }));
    await r.upsert('course', course('P', { name: 'Physics', sort: 2 }));
    await r.upsert('meeting', meeting('mE1', 'E')); await r.upsert('meeting', meeting('mE2', 'E', { weekday: 3 }));
    await r.upsert('meeting', meeting('mM1', 'M'));
    await r.upsert('mark', mark('kE1', 'E')); await r.upsert('mark', mark('kM1', 'M'));
    await r.upsert('task', task('tE', { courseId: 'E' }));
    await r.upsert('notice', notice('nE', { courseId: 'E' }));
    await r.upsert('attendance', { key: '2026-10-05|09:00|E', status: 'p', at: NOW, reason: '' });
    await r.upsert('adjust', { courseId: 'E', adj: 3 });
  };

  it('removes the course with its meetings and marks — on screen at once, then in the repository', async () => {
    const repo = await store(seedTwo);
    act.removeCourse('E');
    expect(getState().courses.map((c) => c.id)).toEqual(['M', 'P']);
    expect(getState().meetings.map((m) => m.id)).toEqual(['mM1']);
    expect(getState().marks.map((m) => m.id)).toEqual(['kM1']);
    expect(getState().toast?.text).toBe('Organic Chemistry removed');
    await flush();
    const l = await repo.load();
    expect(l.courses.map((c) => c.id)).toEqual(['M', 'P']);
    expect(l.meetings.map((m) => m.id)).toEqual(['mM1']);
    expect(l.marks.map((m) => m.id)).toEqual(['kM1']);
    // one `del` per row, course first, then its meetings, then its marks
    expect((await ops(repo)).filter((o) => o.endsWith(':del'))).toEqual(['course:E:del', 'meeting:mE1:del', 'meeting:mE2:del', 'mark:kE1:del']);
    await rebuildsAfter(700);
  });

  it('leaves the course\'s tasks, notes, attendance and curve where they were', async () => {
    // CURRENT behaviour: the cascade covers meetings and marks only. Rows elsewhere keep `courseId: 'E'`.
    const repo = await store(seedTwo);
    act.removeCourse('E');
    expect(getState().tasks.map((t) => [t.id, t.courseId])).toEqual([['tE', 'E']]);
    expect(getState().notices.map((n) => [n.id, n.courseId])).toEqual([['nE', 'E']]);
    expect(Object.keys(getState().attendance)).toEqual(['2026-10-05|09:00|E']);
    expect(getState().adjusts).toEqual({ E: 3 });
    await flush();
    const l = await repo.load();
    expect(l.tasks).toHaveLength(1); expect(l.notices).toHaveLength(1); expect(l.adjusts).toEqual({ E: 3 });
  });

  it('undo restores the course in its sort position and brings its meetings and marks back', async () => {
    const repo = await store(seedTwo);
    act.removeCourse('E');
    await flush(); await rebuildsAfter(700);

    undo();
    expect(getState().courses.map((c) => c.id)).toEqual(['E', 'M', 'P']); // sorted by `sort`, not appended
    expect(getState().meetings.map((m) => m.id)).toEqual(['mM1', 'mE1', 'mE2']);
    expect(getState().marks.map((m) => m.id)).toEqual(['kM1', 'kE1']);
    await flush();
    const l = await repo.load();
    expect(l.courses.map((c) => c.id)).toEqual(['E', 'M', 'P']);
    expect(l.meetings.map((m) => m.id).sort()).toEqual(['mE1', 'mE2', 'mM1']);
    expect(l.marks.map((m) => m.id).sort()).toEqual(['kE1', 'kM1']);
    /* v0.5 D1: the cascade is now one compound change (`domain/variants.ts`) whose undo is the same batch
       read backwards, so the rows come back as `put`s of their exact before-values (which also revive the
       tombstones) rather than as `restore`s. What a sync sees is the same row content either way. */
    expect((await ops(repo)).slice(-4)).toEqual(['course:E:put', 'meeting:mE1:put', 'meeting:mE2:put', 'mark:kE1:put']);
    await rebuildsAfter(700);
  });

  it('an unknown course id is a no-op', async () => {
    await store(seedTwo);
    const before = getState();
    act.removeCourse('nope');
    expect(getState()).toBe(before);
    await noRebuild();
  });
});

describe('marks, curves and notes never rebuild the reminder queue', () => {
  it('saveMark appends or replaces and writes, with no toast and no rebuild', async () => {
    const repo = await store();
    act.saveMark(mark('k1', 'E'));
    act.saveMark(mark('k1', 'E', { score: 91 }));
    act.saveMark(mark('k2', 'E', { sort: 1 }));
    expect(getState().marks.map((m) => [m.id, m.score])).toEqual([['k1', 91], ['k2', 70]]);
    await flush();
    expect((await repo.load()).marks.map((m) => [m.id, m.score])).toEqual([['k1', 91], ['k2', 70]]);
    expect(getState().toast).toBeNull();
    await noRebuild();
  });

  it('removeMark deletes with an undo that restores it, and neither half rebuilds', async () => {
    const repo = await store(async (r) => { await r.upsert('mark', mark('k1', 'E')); });
    act.removeMark('k1');
    expect(getState().marks).toEqual([]);
    expect(getState().toast?.text).toBe('Mark deleted');
    await flush();
    expect((await repo.load()).marks).toEqual([]);
    await noRebuild();

    undo();
    expect(getState().marks.map((m) => m.id)).toEqual(['k1']);
    await flush();
    expect((await repo.load()).marks.map((m) => m.id)).toEqual(['k1']);
    await noRebuild();
  });

  it('setAdjust sets (and overwrites) one course\'s curve, writes it, and raises nothing', async () => {
    const repo = await store();
    act.setAdjust('E', 4);
    act.setAdjust('M', -2);
    act.setAdjust('E', 1.5);
    expect(getState().adjusts).toEqual({ E: 1.5, M: -2 });
    await flush();
    expect((await repo.load()).adjusts).toEqual({ E: 1.5, M: -2 });
    expect(getState().toast).toBeNull();
    await noRebuild();
  });

  it('saveNotice appends or replaces and writes, with no rebuild', async () => {
    const repo = await store();
    act.saveNotice(notice('n1'));
    act.saveNotice(notice('n1', { text: 'Bring two sources' }));
    expect(getState().notices.map((n) => n.text)).toEqual(['Bring two sources']);
    await flush();
    expect((await repo.load()).notices.map((n) => n.text)).toEqual(['Bring two sources']);
    await noRebuild();
  });

  it('removeNotice tears the note off with an undo that restores it, and never rebuilds', async () => {
    const repo = await store(async (r) => { await r.upsert('notice', notice('n1')); });
    act.removeNotice('n1');
    expect(getState().notices).toEqual([]);
    expect(getState().toast?.text).toBe('Note torn off');
    await flush();
    expect((await repo.load()).notices).toEqual([]);
    undo();
    expect(getState().notices.map((n) => n.id)).toEqual(['n1']);
    await flush();
    expect((await repo.load()).notices.map((n) => n.id)).toEqual(['n1']);
    await noRebuild();
  });

  it('removeMark / removeNotice on an unknown id raise no toast', async () => {
    await store();
    act.removeMark('nope'); act.removeNotice('nope');
    expect(getState().toast).toBeNull();
  });

  it('addSession mints an `f` id, flags it as the user\'s own, and writes it without a rebuild', async () => {
    const repo = await store();
    act.addSession({ taskId: null, courseId: 'E', startedAt: NOW - 600_000, endedAt: NOW, focusSec: 600, breakSec: 0, overSec: 0, rounds: 0, planMin: 25, mode: 'focus', completed: false });
    const f = getState().focus.at(-1)!;
    expect(f.id).toMatch(/^f/);
    expect(f).toMatchObject({ demo: false, focusSec: 600, courseId: 'E' });
    await flush();
    expect((await repo.load()).focus).toEqual([f]);
    await noRebuild();
  });
});

describe('settings', () => {
  it('setSettings merges the patch synchronously and writes only the patch', async () => {
    const repo = await store();
    const putSettings = jest.spyOn(repo, 'putSettings');
    act.setSettings({ name: 'Sam', paper: 'grid' });
    expect(getState().settings).toMatchObject({ name: 'Sam', paper: 'grid', theme: 'auto' });
    expect(putSettings).toHaveBeenCalledWith({ name: 'Sam', paper: 'grid' });
    await flush();
    expect((await repo.load()).settings).toMatchObject({ name: 'Sam', paper: 'grid' });
  });

  it('a display setting does not rebuild the queue; the 12/24-hour switch rebuilds after 400 ms', async () => {
    await store();
    act.setSettings({ paper: 'ruled' });
    await noRebuild();
    act.setSettings({ hour12: true });
    expect(getState().settings.hour12).toBe(true);
    await rebuildsAfter(400);
  });

  it('setNotif merges into the reminder settings, writes the whole notif object, and rebuilds after 500 ms', async () => {
    const repo = await store();
    const putSettings = jest.spyOn(repo, 'putSettings');
    act.setNotif({ classLeadMin: 15 });
    expect(getState().settings.notif).toMatchObject({ classLeadMin: 15, enabled: true });
    expect(putSettings).toHaveBeenCalledWith({ notif: getState().settings.notif });
    await flush();
    expect((await repo.load()).settings.notif?.classLeadMin).toBe(15);
    expect(mockLockscreen).not.toHaveBeenCalled();
    await rebuildsAfter(500);
  });

  it('setNotif re-applies the lock-screen channels only when lockText is in the patch', async () => {
    await store();
    act.setNotif({ lockText: false });
    expect(mockLockscreen.mock.calls).toEqual([[false]]);
    await rebuildsAfter(500);
  });
});
