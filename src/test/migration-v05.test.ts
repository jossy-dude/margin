/**
 * WS2 Task 1 — the release's ONLY migration.
 *
 * v0.5 adds three storage objects in one `user_version` bump: the `semesters` table (one active term
 * plus its archived snapshots), the `subject_variants` side table, and `meetings.variant_id`. A
 * migration is the one moment the app rewrites the shape of the user's only file, so the fixture here is
 * a real v0.3.1 database — every table, every row — rather than an empty one: the claim to prove is
 * "an upgrade keeps everything and gains exactly these three things", and an empty database cannot
 * prove the first half.
 *
 * The other half of the same claim (Review Focus 2) is the range carry: `settings.semesterStart` /
 * `semesterEnd` existed as KV strings since v0.1/v0.3.1, and they must arrive in the active `semesters`
 * row with their values intact. A second `init()` must change nothing — a migration that runs twice is
 * a migration whose idempotence was assumed rather than checked.
 */
import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { MIGRATIONS } from '../data/specs';
import { suggestEnd } from '../domain/semester';

/** The node:sqlite shim the repository contract test uses: the same `SqlDb` the Expo adapter is handed,
 *  plus the raw handle so the fixture can be written by hand and read back without the repository. */
function rawDb(): { sql: SqlDb; raw: { exec(s: string): void; all(s: string, p?: unknown[]): unknown[]; run(s: string, p?: unknown[]): void } } {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => any } }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const stmt = (s: string, p: unknown[] = []) => db.prepare(s).run(...p);
  return {
    sql: {
      execAsync: async (s) => { db.exec(s); },
      runAsync: async (s, p = []) => { stmt(s, p); },
      getAllAsync: async <T,>(s: string, p: unknown[] = []) => db.prepare(s).all(...p) as T[],
      withTransactionAsync: async (fn) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
    },
    raw: { exec: (s) => { db.exec(s); }, all: (s, p = []) => db.prepare(s).all(...p), run: (s, p = []) => { stmt(s, p); } },
  };
}

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05, a Monday, 08:00 local

const cols = (raw: ReturnType<typeof rawDb>['raw'], table: string) =>
  (raw.all(`PRAGMA table_info(${table})`) as { name: string }[]).map((c) => c.name);
const version = (raw: ReturnType<typeof rawDb>['raw']) => (raw.all('PRAGMA user_version')[0] as { user_version: number }).user_version;
const count = (raw: ReturnType<typeof rawDb>['raw'], table: string) =>
  (raw.all(`SELECT COUNT(*) AS n FROM ${table}`)[0] as { n: number }).n;
/** The `semesters` table read as the app will read it. The raw columns are asserted here rather than a
 *  repository method, because this test is about the migration's own output. */
interface Row { id: string; name: string; start: string; end: string; active: number; snapshot_json: string | null; created_at: string; archived_at: string | null }
const semesters = (raw: ReturnType<typeof rawDb>['raw']) => raw.all('SELECT * FROM semesters ORDER BY active DESC') as Row[];

/**
 * A v0.3.1 database: the three migrations that shipped with 0.3.1, plus one real row in every table the
 * app had then — including the settings KV pair the carry has to read, and both bookkeeping tables.
 * Values are JSON-encoded strings exactly as `putSettings` writes them, quotes included, because that
 * is the shape the migration has to be able to read.
 */
function v031(settings: boolean): ReturnType<typeof rawDb> {
  const db = rawDb();
  for (const m of MIGRATIONS.slice(0, 3)) db.raw.exec(m);
  db.raw.exec('PRAGMA user_version = 3');

  db.raw.run("INSERT INTO course(id,name,room,teacher,goal,sort,demo,rev) VALUES('C1','Economics','B-12','Hale',85,0,0,2)");
  db.raw.run("INSERT INTO meeting(id,course_id,weekday,start_t,end_t,demo,rev) VALUES('M1','C1',0,'08:30','09:20',0,1)");
  db.raw.run("INSERT INTO attendance(\"key\",status,at,reason,rev) VALUES('2026-09-14|08:30|C1','l',?, 'bus',1)", [NOW]);
  db.raw.run("INSERT INTO day_mark(date,status,at,reason,rev) VALUES('2026-09-15','c',?,'holiday',1)", [NOW]);
  db.raw.run("INSERT INTO task(id,title,course_id,kind,due_at,start_at,estimate_min,priority,notes,status,created_at,completed_at,reminders,subtasks,demo,rev) VALUES('T1','Read chapter 1','C1','reading',?,NULL,NULL,1,'p. 20',0,?,NULL,'[{\"id\":\"r1\",\"mode\":\"before\",\"minutes\":60,\"label\":\"1 h before\"}]','[]',0,3)", [NOW + 86_400_000, NOW]);
  db.raw.run("INSERT INTO notice(id,course_id,body,due_at,is_read,priority,demo,rev) VALUES('N1','C1','Bring the book',?,0,2,0,1)", [NOW]);
  db.raw.run("INSERT INTO mark(id,course_id,name,score,weight,on_,sort,demo,rev) VALUES('K1','C1','Quiz 1',18,10,1,0,0,1)");
  db.raw.run("INSERT INTO adjust(course_id,adj,rev) VALUES('C1',1.5,1)");
  db.raw.run("INSERT INTO focus_session(id,task_id,course_id,started_at,ended_at,focus_sec,break_sec,over_sec,rounds,plan_min,mode,completed,demo,rev) VALUES('F1','T1','C1',?,?,1500,0,0,1,25,'focus',1,0,1)", [NOW, NOW + 1_500_000]);
  db.raw.run("INSERT INTO trip(id,started_at,ended_at,route,note,rev) VALUES('P1',?,?,'home to campus','',1)", [NOW, NOW + 600_000]);
  db.raw.run("INSERT INTO alarm(id,at,label,enabled,kind,task_id,rev) VALUES('A1',?,'Leave now',1,'leave','T1',1)", [NOW + 3_600_000]);
  db.raw.run("INSERT INTO outbox(entity,id,op,at) VALUES('task','T1','put',?)", [NOW]);
  db.raw.run("INSERT INTO notif_log(id,kind,due_at,shown_at) VALUES('n1','task',?,NULL)", [NOW]);
  if (settings) {
    db.raw.run("INSERT INTO setting(k,v) VALUES('semesterStart','\"2026-09-07\"')");
    db.raw.run("INSERT INTO setting(k,v) VALUES('semesterEnd','\"2026-12-20\"')");
    db.raw.run("INSERT INTO setting(k,v) VALUES('name','\"Sam\"')");
  }
  return db;
}

describe('the v0.5 migration (Review Focus 2)', () => {
  it('opens a v0.3.1 database with every row intact and carries the settings range into the active semester', async () => {
    const { sql, raw } = v031(true);
    const r = new SqliteRepository(sql, () => NOW);
    await r.init();

    // one bump, and the three storage objects the release adds
    expect(version(raw)).toBe(4);
    expect(cols(raw, 'semesters')).toEqual(['id', 'name', 'start', 'end', 'active', 'snapshot_json', 'created_at', 'archived_at']);
    expect(cols(raw, 'subject_variants')).toEqual(expect.arrayContaining(['id', 'subject_id', 'name', 'room', 'teacher', 'note', 'ord']));
    expect(cols(raw, 'meeting')).toContain('variant_id');

    // …and nothing the user had is gone: every table, one row each, plus the bookkeeping
    for (const [table, n] of [['course', 1], ['meeting', 1], ['attendance', 1], ['day_mark', 1], ['task', 1], ['notice', 1], ['mark', 1], ['adjust', 1], ['focus_session', 1], ['trip', 1], ['alarm', 1], ['setting', 3], ['outbox', 1], ['notif_log', 1]] as const) {
      expect({ table, n: count(raw, table) }).toEqual({ table, n });
    }
    const l = await r.load();
    expect(l.courses).toEqual([{ id: 'C1', name: 'Economics', room: 'B-12', teacher: 'Hale', goal: 85, sort: 0, demo: false }]);
    expect(l.meetings[0]).toMatchObject({ id: 'M1', courseId: 'C1', weekday: 0, start: '08:30', end: '09:20', variantId: null });
    expect(l.tasks[0]).toMatchObject({ id: 'T1', title: 'Read chapter 1', priority: 1, notes: 'p. 20', reminders: [{ id: 'r1', mode: 'before', minutes: 60, label: '1 h before' }] });
    expect(l.marks[0]).toMatchObject({ id: 'K1', score: 18, on: true });
    expect(l.focus[0]).toMatchObject({ id: 'F1', mode: 'focus', completed: true, planMin: 25 });
    expect(l.adjusts.C1).toBe(1.5);
    expect(l.settings.name).toBe('Sam');

    // the range carry: one active row, its range exactly the settings pair
    const rows = semesters(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: expect.stringMatching(/\S/), start: '2026-09-07', end: '2026-12-20', active: 1, snapshot_json: null, archived_at: null });
    expect(rows[0]!.id).toBeTruthy();
    expect(rows[0]!.created_at).toEqual(expect.any(String));
  });

  it('a second open is idempotent: same row, same version, same rows, no second semester', async () => {
    const { sql, raw } = v031(true);
    await new SqliteRepository(sql, () => NOW).init();
    const before = semesters(raw);
    await new SqliteRepository(sql, () => NOW).init();

    expect(version(raw)).toBe(4);
    expect(semesters(raw)).toEqual(before);
    expect(semesters(raw)).toHaveLength(1);
    for (const table of ['course', 'meeting', 'task', 'mark', 'attendance', 'day_mark', 'notice', 'adjust', 'focus_session', 'trip', 'alarm']) {
      expect({ table, n: count(raw, table) }).toEqual({ table, n: 1 });
    }
  });

  it('a v0.3.1 database with no range set gets today and a 15-week term, and the settings say the same', async () => {
    const { sql, raw } = v031(false);
    const r = new SqliteRepository(sql, () => NOW);
    await r.init();

    const [row] = semesters(raw);
    expect(row).toMatchObject({ start: '2026-10-05', end: suggestEnd('2026-10-05'), active: 1 });
    // the app's live range is the settings pair, so the carry writes it too — one truth, not two
    const l = await r.load();
    expect(l.settings.semesterStart).toBe('2026-10-05');
    expect(l.settings.semesterEnd).toBe(suggestEnd('2026-10-05'));
    expect(count(raw, 'semesters')).toBe(1);
  });

  it('an open-ended term stays open-ended: an empty end is not invented into a 15-week one', async () => {
    const { sql, raw } = v031(false);
    raw.run("INSERT INTO setting(k,v) VALUES('semesterStart','\"2026-09-07\"')");
    const r = new SqliteRepository(sql, () => NOW);
    await r.init();
    const [row] = semesters(raw);
    expect(row).toMatchObject({ start: '2026-09-07', end: '', active: 1 });
  });

  it('a fresh database reaches version 4 and still has an active semester to show', async () => {
    const { sql, raw } = rawDb();
    const r = new SqliteRepository(sql, () => NOW);
    await r.init();
    expect(version(raw)).toBe(4);
    const rows = semesters(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ start: '2026-10-05', end: suggestEnd('2026-10-05'), active: 1 });
  });

  /* Audit H3's rule about unreadable settings applies to the carry too: the row needs a usable range,
   * but "the stored range is unparseable" is not a licence to write over the only copy of the user's
   * bytes. The fallback fills the ROW (and any key that has no row at all); the corrupt key is left
   * exactly as found, so `load()` keeps excluding it and a later fix — or a support copy — can read it. */
  it('a corrupt stored range is not overwritten by the fallback', async () => {
    const { sql, raw } = v031(true);
    raw.run("UPDATE setting SET v='{broken' WHERE k='semesterStart'");
    const r = new SqliteRepository(sql, () => NOW);
    await r.init();

    const [row] = semesters(raw);
    expect(row).toMatchObject({ name: expect.any(String), start: '2026-10-05', end: suggestEnd('2026-10-05'), active: 1 });
    expect(raw.all("SELECT v FROM setting WHERE k='semesterStart'")).toEqual([{ v: '{broken' }]);
  });
});
