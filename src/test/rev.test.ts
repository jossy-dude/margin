import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { MemoryRepository } from '../data/memory';
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
