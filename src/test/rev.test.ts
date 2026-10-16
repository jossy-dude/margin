import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { act, getState, hydrate } from '../store/store';

const NOW = new Date(2026, 9, 5, 8).getTime();
const mockOpenRepo = jest.fn(async () => new MemoryRepository(() => NOW));
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
beforeAll(() => jest.useFakeTimers()); // the store's resync/toast timers would otherwise outlive the suite
afterAll(() => jest.useRealTimers());
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

it('INSERT OR REPLACE keeps incrementing rev (needed for sync conflict detection)', async () => {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => any } }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const sql: SqlDb = { execAsync: async (s) => { db.exec(s); }, runAsync: async (s, p = []) => db.prepare(s).run(...p), getAllAsync: async <T,>(s: string, p: any[] = []) => db.prepare(s).all(...p) as T[], withTransactionAsync: async (f) => { db.exec('BEGIN'); await f(); db.exec('COMMIT'); } };
  const r = new SqliteRepository(sql, () => 1); await r.init();
  const c = { id: 'X', name: 'a', room: '', teacher: '', goal: null, sort: 0 };
  await r.upsert('course', c); await r.upsert('course', { ...c, name: 'b' }); await r.upsert('course', { ...c, name: 'c' });
  expect((await sql.getAllAsync<{ rev: number }>("SELECT rev FROM course WHERE id='X'"))[0]?.rev).toBe(3);
  await r.remove('course', 'X'); expect((await sql.getAllAsync<{ rev: number }>("SELECT rev FROM course WHERE id='X'"))[0]?.rev).toBe(4);
});

describe('store undo', () => {
  const KEY = '2026-10-05|08:30|E';
  it('a stamped class is undoable: the first stamp is undone by removing the record', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    act.setAtt(KEY, 'l');
    expect(getState().attendance[KEY]).toMatchObject({ key: KEY, status: 'l' });
    expect(getState().toast?.text).toBe('Marked Late'); expect(typeof getState().toast?.undo).toBe('function');
    getState().toast!.undo!();
    expect(getState().attendance[KEY]).toBeUndefined();
    expect((await repo.load()).attendance[KEY]).toBeUndefined();
  });
  it('undo restores the previous record, in state and in the repository', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    act.setAtt(KEY, 'a', 'dentist'); act.setAtt(KEY, 's', 'fever');
    expect(getState().attendance[KEY]).toMatchObject({ status: 's', reason: 'fever' });
    getState().toast!.undo!();
    expect(getState().attendance[KEY]).toMatchObject({ status: 'a', reason: 'dentist' });
    expect((await repo.load()).attendance[KEY]).toMatchObject({ status: 'a', reason: 'dentist' });
  });
  it('undo writes a restore/delete op to the outbox, so the undo is sync-safe', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    act.setAtt(KEY, 'p'); getState().toast!.undo!();
    expect((await repo.pendingOutbox()).map((o) => `${o.entity}:${o.id}:${o.op}`)).toEqual([`attendance:${KEY}:put`, `attendance:${KEY}:del`]);
  });
});

describe('the focus finish row (W3/D2)', () => {
  /** The screen's own source for the task box: `Focus.tsx` looks the open task up by `timer.taskId`. */
  const boxTask = () => { const id = getState().timer.taskId; return getState().tasks.find((t) => t.id === id) ?? null; };
  const at = (ms: number) => jest.setSystemTime(NOW + ms);
  /** The demo set, so `focusOpen` has real tasks with real subjects behind them. */
  const seeded = async () => { const repo = new MemoryRepository(() => NOW); await repo.seed(seedSnapshot(NOW)); await hydrate(repo); return repo; };
  const firstTask = () => getState().tasks.find((t) => t.status !== 2)!;

  it('a round that runs out is saved as mode focus, completed, and names the task the box was showing', async () => {
    const repo = await seeded();
    const task = firstTask();
    at(0); act.focusOpen(task.id);
    expect(boxTask()?.id).toBe(task.id); // what the task box renders, before the round starts
    const plan = getState().timer.planMin;

    act.timerToggle(); // Start
    at(plan * 60_000);
    act.timerFinish();

    const row = getState().focus.at(-1)!;
    expect(row).toMatchObject({ mode: 'focus', completed: true, taskId: task.id, courseId: task.courseId, planMin: plan, focusSec: plan * 60, rounds: 1, demo: false });
    expect(boxTask()?.id).toBe(task.id); // …and the box still showed that task when it was saved
    expect((await repo.load()).focus.at(-1)).toMatchObject({ mode: 'focus', completed: true, taskId: task.id });
  });

  it('a round ended early is saved as mode focus, NOT completed, and still names the task', async () => {
    const repo = await seeded();
    const task = firstTask();
    at(0); act.focusOpen(task.id); act.timerToggle();
    at(5 * 60_000); act.timerToggle(); // pause — the paused state is what carries the elapsed focus
    at(10 * 60_000);                   // …and five minutes later the student ends the session early
    act.timerFinish();

    expect(getState().focus.at(-1)).toMatchObject({ mode: 'focus', completed: false, rounds: 0, focusSec: 300, taskId: task.id, courseId: task.courseId });
    expect((await repo.load()).focus.at(-1)).toMatchObject({ completed: false, taskId: task.id });
  });

  it('a break is not a session of its own: its minutes ride in breakSec on the one row', async () => {
    await seeded();
    const task = firstTask();
    at(0); act.focusOpen(task.id); act.timerToggle();
    at(10 * 60_000);
    act.timerBreak();
    expect(getState().timer.phase).toBe('break');
    const before = getState().focus.length;
    at(11 * 60_000);
    act.timerFinish();

    expect(getState().focus).toHaveLength(before + 1); // one row, not one for the break too
    expect(getState().focus.at(-1)).toMatchObject({ mode: 'focus', completed: false, breakSec: 60, taskId: task.id });
  });

  it('swap task re-points the round, so the row names the task the box now shows', async () => {
    await seeded();
    const open = getState().tasks.filter((t) => t.status !== 2);
    expect(open.length).toBeGreaterThan(1);
    at(0); act.focusOpen(open[0]!.id);
    act.timerSwap();
    const swapped = boxTask()!;
    expect(swapped.id).not.toBe(open[0]!.id);
    expect(getState().timer.courseId).toBe(swapped.courseId);

    act.timerToggle(); at(getState().timer.planMin * 60_000); act.timerFinish();
    expect(getState().focus.at(-1)).toMatchObject({ taskId: swapped.id, courseId: swapped.courseId, completed: true });
  });

  it('a round already running keeps its own task, and the row still names what the box showed', async () => {
    // "Focus on this" (a long-press on a task) while a round is live must NOT re-point the running round: the
    // guard in `focusOpen` is what the box and the row both keep agreeing with. Pinned, not changed.
    await seeded();
    const open = getState().tasks.filter((t) => t.status !== 2);
    const [a, b] = [open[0]!, open.find((t) => t.id !== open[0]!.id)!];
    at(0); act.focusOpen(a.id); act.timerToggle();
    at(60_000); act.focusOpen(b.id);

    expect(getState().timer.taskId).toBe(a.id);
    expect(boxTask()?.id).toBe(a.id);
    at(60_000 + getState().timer.planMin * 60_000); act.timerFinish();
    expect(getState().focus.at(-1)).toMatchObject({ taskId: a.id, courseId: a.courseId, completed: true });
  });

  /* UX-2. `finish` refuses a session under a minute so that no row claims study that never happened
     (D2), and the refusal used to be silent: the audit ended a session twelve seconds in and got no
     toast, no ring movement and no Stats change, so the one-minute floor was invisible to the student
     standing in front of it. The floor itself is untouched — these two tests are the two halves of it. */
  it('a session under a minute writes nothing at all, and now says why (UX-2)', async () => {
    const repo = await seeded();
    at(0); act.focusOpen(firstTask().id); act.timerToggle();
    at(12_000); // the audit's own repro: a dozen seconds of a 25-minute plan
    const before = getState().focus.length;
    act.timerFinish();

    expect(getState().focus).toHaveLength(before);          // nothing in state…
    expect((await repo.load()).focus).toHaveLength(before); // …and nothing in the database behind it
    expect(getState().toast?.text).toBe('Under a minute, so nothing was saved');
    expect(getState().toast?.undo).toBeUndefined();         // there is nothing to undo
    expect(getState().timer.phase).toBe('set');             // and the dial is back for the next round
  });

  it('a session past the minute keeps the saved toast it always had (the path UX-2 did not touch)', async () => {
    await seeded();
    at(0); act.focusOpen(firstTask().id); act.timerToggle();
    at(3 * 60_000); act.timerFinish();

    expect(getState().focus.at(-1)).toMatchObject({ focusSec: 180 });
    expect(getState().toast?.text).toBe('Saved 3 min of focus');
  });
});

describe('boot recovery', () => {
  /** a store instance whose openRepository() never resolved, i.e. the state App.tsx leaves behind after a boot failure */
  const neverOpened = () => { let s!: typeof import('../store/store'); jest.isolateModules(() => { s = jest.requireActual<typeof import('../store/store')>('../store/store'); }); return s; };
  it('the store fails with an actionable message, not a null-cast TypeError, when the repo never opened', async () => {
    const fresh = neverOpened();
    expect(() => fresh.R()).toThrow(/not open/i);
    expect(() => fresh.R()).toThrow(/hydrate|resetAll/);
  });
  it('resetAll re-opens the repository itself, so the fatal-error screen is escapable', async () => {
    mockOpenRepo.mockClear();
    const fresh = neverOpened();
    fresh.set({ ready: true, error: 'openDatabaseAsync failed' }); // exactly what App.tsx leaves behind when openRepository throws
    await fresh.act.resetAll();
    expect(mockOpenRepo).toHaveBeenCalledTimes(1);
    expect(fresh.getState().error).toBeNull(); expect(fresh.getState().ready).toBe(true);
    expect(fresh.getState().courses.length).toBeGreaterThan(0); expect(fresh.getState().toast?.text).toBe('Everything is back to the demo set');
    expect(typeof fresh.R().load).toBe('function');
    fresh.act.setAtt('k', 'a'); expect(fresh.getState().attendance.k).toMatchObject({ status: 'a' });
  });
  it('a failing re-open surfaces the reason instead of a swallowed rejection', async () => {
    mockOpenRepo.mockRejectedValueOnce(new Error('disk is full'));
    const fresh = neverOpened();
    await fresh.act.resetAll();
    expect(fresh.getState().error).toBe("Couldn't reset: disk is full");
  });
});
