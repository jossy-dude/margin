/**
 * v0.6 — migration 6: attendance becomes three states plus a why, and the bridge columns arrive.
 * The fixture is a real v0.5 database (migrations 1–5) holding every old attendance letter, so the claim
 * "every old mark reads as the state and reason it meant" is checked against SQL rows, not objects.
 */
import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { MIGRATIONS } from '../data/specs';

function rawDb() {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => any } }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const sql: SqlDb = {
    execAsync: async (s) => { db.exec(s); },
    runAsync: async (s, p = []) => { db.prepare(s).run(...p); },
    getAllAsync: async <T,>(s: string, p: unknown[] = []) => db.prepare(s).all(...p) as T[],
    withTransactionAsync: async (fn) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
  return { sql, exec: (s: string) => db.exec(s), all: (s: string) => db.prepare(s).all() as Record<string, unknown>[] };
}
const NOW = new Date(2026, 10, 9, 8).getTime();

function v05() {
  const db = rawDb();
  for (const m of MIGRATIONS.slice(0, 5)) db.exec(m);
  db.exec('PRAGMA user_version = 5');
  for (const [k, st] of [['k-p', 'p'], ['k-l', 'l'], ['k-n', 'n'], ['k-a', 'a'], ['k-s', 's'], ['k-c', 'c'], ['k-t', 't']]) db.exec(`INSERT INTO attendance("key",status,at,reason,rev) VALUES('${k}','${st}',1,'r',1)`);
  db.exec("INSERT INTO day_mark(date,status,at,reason,rev) VALUES('2026-11-02','s',1,'flu',1)");
  db.exec("INSERT INTO task(id,title,kind,priority,notes,status,created_at,reminders,subtasks,rev) VALUES('t1','Essay','assignment',0,'',0,1,'[]','[]',1)");
  return db;
}

describe('migration 6 (v0.6)', () => {
  it('turns every old attendance letter into a state and a why, and keeps reasons', async () => {
    const db = v05();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const s = await r.load();
    expect(Object.fromEntries(Object.values(s.attendance).map((a) => [a.key, [a.status, a.why ?? '']]))).toEqual({
      'k-p': ['p', ''], 'k-l': ['p', 'late'], 'k-n': ['a', 'arrivedLate'], 'k-a': ['a', ''], 'k-s': ['a', 'sick'], 'k-c': ['c', ''], 'k-t': ['c', 'teacher'],
    });
    expect(s.attendance['k-l']!.reason).toBe('r');
    expect(s.dayMarks['2026-11-02']).toMatchObject({ status: 'a', why: 'sick', reason: 'flu' });
  });
  it('adds the bridge columns without touching existing tasks, and a second init changes nothing', async () => {
    const db = v05();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const cols = (t: string) => db.all(`PRAGMA table_info(${t})`).map((c) => c.name);
    expect(cols('task')).toEqual(expect.arrayContaining(['origin', 'ext_id', 'ext_path']));
    expect(cols('notice')).toEqual(expect.arrayContaining(['origin', 'ext_id']));
    expect(cols('focus_session')).toEqual(expect.arrayContaining(['origin', 'ext_id']));
    const t = (await r.load()).tasks[0]!;
    expect(t).toMatchObject({ id: 't1', title: 'Essay' });
    expect('origin' in t).toBe(false); // a NULL bridge column stays off the object
    await new SqliteRepository(db.sql, () => NOW).init();
    expect(db.all('PRAGMA user_version')[0]).toEqual({ user_version: MIGRATIONS.length });
  });
  it('a task from Obsidian round-trips its origin, id and note path', async () => {
    const db = rawDb();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const task = { id: 'ob-1', title: 'Read ch. 4', courseId: null, kind: 'reading' as const, dueAt: NOW, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, origin: 'obsidian' as const, extId: 'a1b2c3', extPath: 'Daily_Notes/Nov 9, 2026.md' };
    await r.upsert('task', task);
    expect((await r.load()).tasks[0]).toEqual(task);
  });
  it('the change feed reads updated_at, tombstones included (sqlite)', async () => {
    const db = rawDb(); let t = 100;
    const r = new SqliteRepository(db.sql, () => t); await r.init();
    const base = { title: 'x', courseId: null, kind: 'other' as const, dueAt: null, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: 1, completedAt: null, reminders: [], subtasks: [], demo: false };
    await r.upsert('task', { ...base, id: 'a' }); t = 200; await r.upsert('task', { ...base, id: 'b', origin: 'obsidian', extId: 'zz' }); t = 300; await r.remove('task', 'a');
    const feed = await r.changes('task', 150);
    expect(feed.map((c) => [c.id, c.updatedAt, c.deleted])).toEqual([['b', 200, false], ['a', 300, true]]);
    expect(feed[0]!.value).toMatchObject({ origin: 'obsidian', extId: 'zz' });
  });
});
