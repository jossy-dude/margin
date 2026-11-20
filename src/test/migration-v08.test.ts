/**
 * v0.8 — migration 8: kinds become tags (D6), an exam task becomes a dated notice, and tasks that share a block id
 * are merged (S7). Nothing is dropped: the exam's text, date, subject and priority live on in the notice.
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
const NOW = new Date(2026, 10, 20, 8).getTime();
const task = (id: string, title: string, kind: string, extra = '') => `INSERT INTO task(id,title,kind,priority,notes,status,created_at,reminders,subtasks,rev,updated_at${extra ? ',' + extra.split('=')[0] : ''}) VALUES('${id}','${title}','${kind}',2,'',0,1,'[]','[]',1,5${extra ? ",'" + extra.split('=')[1] + "'" : ''})`;

function v07() {
  const db = rawDb();
  for (const m of MIGRATIONS.slice(0, 7)) db.exec(m);
  db.exec('PRAGMA user_version = 7');
  db.exec(`INSERT INTO course(id,name,rooms,teacher,goal,sort,demo,rev) VALUES('db','Database Systems','[]','',85,0,0,1)`);
  db.exec(task('t1', 'Essay', 'assignment'));
  db.exec(task('t2', 'Read ch 3', 'reading'));
  db.exec(task('t3', 'Chores', 'other'));
  db.exec("INSERT INTO task(id,title,course_id,kind,due_at,priority,notes,status,created_at,reminders,subtasks,rev) VALUES('t4','DB midterm','db','exam',1767000000000,3,'',0,1,'[]','[]',1)");
  // S7: Margin's task and the copy that came back from Obsidian under its block id
  db.exec(task('m9', 'Do exerise the rest', 'assignment'));
  db.exec("INSERT INTO task(id,title,kind,priority,notes,status,created_at,reminders,subtasks,rev,origin,ext_id,ext_path,updated_at) VALUES('ob-m9','Do exerise the rest','other',0,'',0,1,'[]','[]',1,'obsidian','m9','Margin/Tasks.md',9)");
  return db;
}

describe('migration 8 (v0.8 tags, notices, subjects)', () => {
  it('fills tags from kinds; an exam becomes a dated notice with a reminder', async () => {
    const db = v07();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const s = await r.load();
    const byId = Object.fromEntries(s.tasks.map((t) => [t.id, t]));
    expect(byId.t1!.tags).toEqual(['assignment', 'school']);
    expect(byId.t2!.tags).toEqual(['reading', 'school']);
    expect(byId.t3!.tags).toEqual(['school']);
    expect(byId.t4).toBeUndefined();
    expect(s.notices).toEqual([expect.objectContaining({ id: 'ex-t4', text: 'DB midterm', courseId: 'db', dueAt: 1767000000000, priority: 3, pinned: true, remind: 1440 })]);
  });
  it('one task per block id: Margin\'s own row stays and learns where its line is', async () => {
    const db = v07();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const same = (await r.load()).tasks.filter((t) => t.title === 'Do exerise the rest');
    expect(same).toHaveLength(1);
    expect(same[0]).toMatchObject({ id: 'm9', extId: 'm9', extPath: 'Margin/Tasks.md' });
  });
  it('subject and notice fields round-trip; a notice may have no date', async () => {
    const db = v07();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const c = (await r.load()).courses[0]!;
    await r.upsert('course', { ...c, tag: '#DB', color: '#aa3300', archived: false });
    await r.upsert('notice', { id: 'n1', courseId: null, text: 'Chap 4 is unclear', dueAt: null, priority: 1, demo: false, pinned: true });
    const s = await r.load();
    expect(s.courses[0]).toMatchObject({ tag: '#DB', color: '#aa3300', archived: false });
    expect(s.notices.find((n) => n.id === 'n1')).toMatchObject({ dueAt: null, pinned: true });
    await new SqliteRepository(db.sql, () => NOW).init();
    expect(db.all('PRAGMA user_version')[0]).toEqual({ user_version: MIGRATIONS.length });
  });
});
