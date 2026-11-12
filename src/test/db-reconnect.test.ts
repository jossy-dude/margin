/**
 * BUGS.md #11, "native database reject". The native half of the SQLite connection can die while JS keeps
 * running (reboot, the OS reclaiming the activity); every later call then fails with an NPE from
 * `NativeDatabase.prepareAsync`. The repository reopens once and retries; a second failure is a real one.
 */
import { DatabaseSync } from 'node:sqlite';
import { connection, isLostConnection, SqliteRepository, type SqlDb } from '../data/sqlite';
import { groupCrashes, type CrashEntry } from '../services/problems';
import { saveCause } from '../store/persist';
import type { Task } from '../domain/types';

jest.mock('../services/problems', () => ({ ...jest.requireActual('../services/problems'), recordCrash: jest.fn(() => null) }));
jest.mock('expo-constants', () => ({ expoConfig: { version: 'test', sdkVersion: 'test' } }));
jest.mock('expo-file-system', () => ({ File: class {}, Paths: { document: 'doc' } }));

const NPE = "Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException";

/** node:sqlite behind the SqlDb shape, with a switch that makes the next N calls fail like a dead handle. */
function shim() {
  const d = new DatabaseSync(':memory:');
  const state = { dead: 0, reopened: 0 };
  const guard = () => { if (state.dead > 0) { state.dead--; throw new Error(NPE); } };
  const db: SqlDb = {
    execAsync: async (s) => { guard(); d.exec(s); },
    runAsync: async (s, p = []) => { guard(); return d.prepare(s).run(...p); },
    getAllAsync: async <T,>(s: string, p: unknown[] = []) => { guard(); return d.prepare(s).all(...(p as never[])) as T[]; },
    withTransactionAsync: async (fn) => { guard(); d.exec('BEGIN'); try { await fn(); d.exec('COMMIT'); } catch (e) { d.exec('ROLLBACK'); throw e; } },
    reopen: async () => { state.reopened++; },
  };
  return { db, state };
}
const task = (id: string): Task => ({ id, title: id, courseId: null, due: '2026-11-13', priority: 'normal', done: false, createdAt: 1 } as unknown as Task);

describe('isLostConnection', () => {
  it('is true for the NPE and the closed-resource texts', () => {
    expect(isLostConnection(new Error(NPE))).toBe(true);
    expect(isLostConnection(new Error('Access to closed resource'))).toBe(true);
    expect(isLostConnection(new Error("Call to function 'NativeStatement.runAsync' has been rejected.\n→ Caused by: database is closed"))).toBe(true);
  });
  it('is false for SQL errors', () => {
    expect(isLostConnection(new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: task.id'))).toBe(false);
    expect(isLostConnection(new Error('no such table: task'))).toBe(false);
    expect(isLostConnection(undefined)).toBe(false);
  });
});

describe('SqliteRepository reconnect', () => {
  it('reopens once and the write lands', async () => {
    const { db, state } = shim();
    const repo = new SqliteRepository(db, () => 1);
    await repo.init();
    state.dead = 1;
    await repo.upsert('task', task('a'));
    expect(state.reopened).toBe(1);
    expect(connection.reopening).toBe(false);
    expect((await repo.load()).tasks.map((t) => t.id)).toContain('a');
  });
  it('a second failure reaches the caller and nothing was written', async () => {
    const { db, state } = shim();
    const repo = new SqliteRepository(db, () => 1);
    await repo.init();
    state.dead = 2;
    await expect(repo.upsert('task', task('b'))).rejects.toThrow(/NullPointerException/);
    expect(state.reopened).toBe(1);
    expect((await repo.load()).tasks.map((t) => t.id)).not.toContain('b');
  });
  it('an SQL error is not retried', async () => {
    const { db, state } = shim();
    const repo = new SqliteRepository(db, () => 1);
    await repo.init();
    const run = db.runAsync;
    db.runAsync = async () => { throw new Error('SQLITE_FULL: database or disk is full'); };
    await expect(repo.upsert('task', task('c'))).rejects.toThrow(/SQLITE_FULL/);
    db.runAsync = run;
    expect(state.reopened).toBe(0);
  });
});

describe('the toast and the Problems log', () => {
  it('shows the Caused by line, not the bridge call', () => {
    expect(saveCause(new Error("Call to function 'X' has been rejected.\n→ Caused by: java.io.IOException: No space left on device"))).toBe('java.io.IOException: No space left on device');
    expect(saveCause(new Error('the disk is full'))).toBe('the disk is full');
  });
  it('groups identical failures into one row with a count', () => {
    const e = (at: number, message: string): CrashEntry => ({ id: String(at), at, phase: 'save', route: 'today', message, stack: '', version: 't', sdk: 't' });
    const g = groupCrashes([e(5, NPE), e(4, NPE), e(3, 'other'), e(1, NPE)]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ count: 3, first: 1, last: 5 });
    expect(g[0]?.entry.at).toBe(5);
    expect(g[1]?.count).toBe(1);
  });
});
