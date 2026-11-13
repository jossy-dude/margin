/**
 * v0.7 N3 — migration 7: variants become course components, To-do gets "My order", Week gets one-off moves.
 * The fixture is a v0.6 database (migrations 1–6) with a lab variant, a variant-less meeting, marks and
 * attendance on both. The promise: every attendance key and every mark is untouched, grades do not move
 * (no weights are set), and the base component appears for courses that have a variant.
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
const NOW = new Date(2026, 10, 13, 8).getTime();

function v06() {
  const db = rawDb();
  for (const m of MIGRATIONS.slice(0, 6)) db.exec(m);
  db.exec('PRAGMA user_version = 6');
  db.exec(`INSERT INTO course(id,name,rooms,teacher,goal,sort,demo,rev) VALUES('db','Database Systems','["L-4","L-5"]','Nkemi',85,0,0,1)`);
  db.exec(`INSERT INTO course(id,name,rooms,teacher,goal,sort,demo,rev) VALUES('ec','Economics','[]','Sara',NULL,1,0,1)`);
  db.exec(`INSERT INTO subject_variants(id,subject_id,name,room,teacher,note,ord,rev) VALUES('v-lab','db','Database Lab','Lab-2','Abebe','',0,1)`);
  db.exec(`INSERT INTO meeting(id,course_id,weekday,start_t,end_t,demo,variant_id,rev) VALUES('m1','db',1,'09:00','09:50',0,NULL,1),('m2','db',3,'14:00','16:00',0,'v-lab',1)`);
  db.exec(`INSERT INTO mark(id,course_id,name,score,weight,on_,sort,demo,variant_id,rev) VALUES('k1','db','Mid',70,30,1,0,0,NULL,1),('k2','db','Lab 1',9,5,1,1,0,'v-lab',1)`);
  db.exec(`INSERT INTO attendance("key",status,at,reason,why,rev) VALUES('2026-11-09|09:00|db','p',1,'','',1),('2026-11-11|14:00|db~v-lab','a',2,'bus','late',1)`);
  db.exec("INSERT INTO task(id,title,kind,priority,notes,status,created_at,reminders,subtasks,rev) VALUES('t1','Essay','assignment',0,'',0,1,'[]','[]',1)");
  return db;
}

describe('migration 7 (v0.7 components)', () => {
  it('keeps every attendance key and mark, and grades stay pooled', async () => {
    const db = v06();
    const before = { att: db.all('SELECT * FROM attendance ORDER BY "key"'), marks: db.all('SELECT id,course_id,score,weight,variant_id FROM mark ORDER BY id') };
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    expect(db.all('SELECT * FROM attendance ORDER BY "key"')).toEqual(before.att);
    expect(db.all('SELECT id,course_id,score,weight,variant_id FROM mark ORDER BY id')).toEqual(before.marks);
    const s = await r.load();
    expect((s.variants ?? []).every((v) => v.weight == null)).toBe(true);
  });
  it('adds a base component only for courses that have a variant, and gives the lab its kind', async () => {
    const db = v06();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const vs = ((await r.load()).variants ?? []).sort((a, b) => a.ord - b.ord);
    expect(vs.map((v) => [v.id, v.subjectId, v.name, v.kind, !!v.isBase])).toEqual([
      ['db~base', 'db', 'Lecture', 'lecture', true],
      ['v-lab', 'db', 'Database Lab', 'lab', false],
    ]);
    expect(vs[0]).toMatchObject({ room: 'L-4', teacher: 'Nkemi', scale: 100 });
  });
  it('adds task.ord and the meeting_override table; a second init changes nothing', async () => {
    const db = v06();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const cols = (t: string) => db.all(`PRAGMA table_info(${t})`).map((c) => c.name);
    expect(cols('task')).toContain('ord');
    expect(cols('meeting_override')).toEqual(expect.arrayContaining(['meeting_id', 'date', 'new_date', 'new_start', 'new_end', 'room', 'cancelled']));
    const t = (await r.load()).tasks[0]!;
    expect('ord' in t).toBe(false);
    await new SqliteRepository(db.sql, () => NOW).init();
    expect(db.all('PRAGMA user_version')[0]).toEqual({ user_version: MIGRATIONS.length });
    expect(db.all("SELECT COUNT(*) AS n FROM subject_variants WHERE is_base=1")[0]).toEqual({ n: 1 });
  });
  it('a component with a share round-trips', async () => {
    const db = v06();
    const r = new SqliteRepository(db.sql, () => NOW); await r.init();
    const lab = ((await r.load()).variants ?? []).find((v) => v.id === 'v-lab')!;
    await r.upsert('variant', { ...lab, weight: 30, scale: 20, attGoal: 90 });
    expect(((await r.load()).variants ?? []).find((v) => v.id === 'v-lab')).toMatchObject({ weight: 30, scale: 20, attGoal: 90, kind: 'lab' });
  });
});
