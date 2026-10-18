import { MemoryRepository } from '../data/memory';
import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { seedSnapshot } from '../data/seed';
import { MIGRATIONS } from '../data/specs';
import { withDefaults } from '../domain/defaults';
import type { Repository } from '../data/repository';
import type { Task } from '../domain/types';

/** The problems log writes a file through `expo-file-system`, which does not exist under jest. The
 *  data layer's reports (audit H2/H3) are asserted on the CALL here — `settings-render.test.ts` is
 *  what renders the page that shows them. */
jest.mock('../ui/crashlog', () => ({ recordCrash: jest.fn(() => null) }));
const recordCrash = (jest.requireMock('../ui/crashlog') as { recordCrash: jest.Mock }).recordCrash;

/** node:sqlite shim that satisfies the same SqlDb the Expo adapter is handed, plus the raw handle so
 *  a test can build a legacy schema by hand and read bytes back without the repository in the way. */
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
const nodeDb = (): SqlDb => rawDb().sql;
const NOW = new Date(2026, 9, 5, 8).getTime();
const factories: [string, () => Promise<Repository>][] = [
  ['memory', async () => new MemoryRepository(() => NOW)],
  ['sqlite', async () => { const r = new SqliteRepository(nodeDb(), () => NOW); await r.init(); return r; }],
];

describe.each(factories)('Repository contract · %s', (_name, make) => {
  it('round-trips the whole seed, including json, bool and nullable columns', async () => {
    const r = await make(), s = seedSnapshot(NOW); await r.seed(s);
    const l = await r.load();
    expect(l.courses.map((c) => c.id)).toEqual(s.courses.map((c) => c.id));
    expect(l.meetings).toHaveLength(s.meetings.length);
    const t = l.tasks.find((x) => x.id === 'seed-task-2')!, e = s.tasks.find((x) => x.id === 'seed-task-2')!;
    expect(t).toEqual(e);
    expect(l.tasks.find((x) => x.id === 'seed-task-5')!.estimateMin).toBeNull();
    expect(l.marks.find((m) => m.id === 'seed-mark-E-3')!.score).toBeNull();
    expect(l.settings.seededAt).toBe(NOW); expect(l.settings.notif?.classLeadMin).toBe(10);
  });
  it('upsert replaces, remove tombstones, restore brings it back (undo)', async () => {
    const r = await make(); await r.seed(seedSnapshot(NOW));
    const t = (await r.load()).tasks.find((x) => x.id === 'seed-task-3')!;
    await r.upsert('task', { ...t, title: 'Changed', status: 2, completedAt: NOW });
    expect((await r.load()).tasks.find((x) => x.id === 'seed-task-3')).toMatchObject({ title: 'Changed', status: 2, completedAt: NOW });
    await r.remove('task', 'seed-task-3'); expect((await r.load()).tasks.some((x) => x.id === 'seed-task-3')).toBe(false);
    await r.restore('task', 'seed-task-3'); expect((await r.load()).tasks.find((x) => x.id === 'seed-task-3')?.title).toBe('Changed');
  });
  it('keyed entities: attendance by key, day marks by date, adjustments by course', async () => {
    const r = await make();
    await r.upsert('attendance', { key: '2026-10-05|08:30|E', status: 'l', at: NOW, reason: 'bus' });
    await r.upsert('dayMark', { date: '2026-10-06', status: 's', at: NOW, reason: '' });
    await r.upsert('adjust', { courseId: 'E', adj: 2.5 });
    const l = await r.load();
    expect(l.attendance['2026-10-05|08:30|E']).toMatchObject({ status: 'l', reason: 'bus' }); expect(l.dayMarks['2026-10-06']?.status).toBe('s'); expect(l.adjusts.E).toBe(2.5);
    await r.upsert('attendance', { key: '2026-10-05|08:30|E', status: 'a', at: NOW, reason: '' });
    expect((await r.load()).attendance['2026-10-05|08:30|E']?.status).toBe('a');
  });
  it('settings merge over defaults and persist partial patches', async () => {
    const r = await make(); await r.putSettings({ name: 'Sam', soundOn: false });
    const l = await r.load(); expect(l.settings.name).toBe('Sam'); expect(l.settings.soundOn).toBe(false); expect(l.settings.hapticsOn).toBe(true);
  });
  it('every mutation lands in the outbox in order, and ack drains it (sync-ready boundary)', async () => {
    const r = await make(); await r.upsert('course', { id: 'X', name: 'X', room: '', teacher: '', goal: null, sort: 0, demo: false }); await r.remove('course', 'X'); await r.restore('course', 'X');
    const ob = await r.pendingOutbox(); expect(ob.map((o) => o.op)).toEqual(['put', 'del', 'restore']);
    await r.ackOutbox(ob[1]!.seq); expect((await r.pendingOutbox()).map((o) => o.op)).toEqual(['restore']);
  });
  it('purgeDemo removes the sample set from all six tables, and leaves the user\'s own rows alone', async () => {
    const r = await make(); await r.seed(seedSnapshot(NOW));
    /* One row of each purgeable kind that the user created (`demo: false`, exactly what the forms
       write). The seed itself is now flagged whole, so after the purge these six are what remains. */
    await r.upsert('course', { id: 'mine-c', name: 'Real course', room: '', teacher: '', goal: null, sort: 9, demo: false });
    await r.upsert('meeting', { id: 'mine-m', courseId: 'mine-c', weekday: 0, start: '09:00', end: '09:50', demo: false });
    await r.upsert('notice', { id: 'mine-n', courseId: null, text: 'Bring it', dueAt: NOW, priority: 0, demo: false });
    await r.upsert('mark', { id: 'mine-k', courseId: 'mine-c', name: 'Quiz', score: 80, weight: 10, on: true, sort: 0, demo: false });
    await r.upsert('task', { ...task('mine-t'), demo: false });
    await r.upsert('focus', { id: 'mine-f', taskId: null, courseId: 'mine-c', startedAt: NOW, endedAt: NOW + 600_000, focusSec: 600, breakSec: 0, overSec: 0, rounds: 1, planMin: 25, mode: 'focus', completed: true, demo: false });

    await r.purgeDemo(); const l = await r.load();
    expect(l.courses.map((c) => c.id)).toEqual(['mine-c']);
    expect(l.meetings.map((m) => m.id)).toEqual(['mine-m']);
    expect(l.notices.map((n) => n.id)).toEqual(['mine-n']);
    expect(l.marks.map((m) => m.id)).toEqual(['mine-k']);
    expect(l.tasks.map((t) => t.id)).toEqual(['mine-t']);
    expect(l.focus.map((f) => f.id)).toEqual(['mine-f']);

    await r.logNotif('n1', 'task', NOW, 'shown', NOW); await r.logNotif('n1', 'task', NOW, 'opened', NOW + 5);
    expect((await r.notifLog())[0]).toMatchObject({ id: 'n1', shownAt: NOW, openedAt: NOW + 5 });
    await r.reset(); expect((await r.load()).tasks).toHaveLength(0);
  });
  it('seeds attendance, day marks and adjustments (audit L3)', async () => {
    const r = await make();
    const s = seedSnapshot(NOW);
    s.attendance = { '2026-10-05|08:30|E': { key: '2026-10-05|08:30|E', status: 'l', at: NOW, reason: 'bus' } };
    s.dayMarks = { '2026-10-06': { date: '2026-10-06', status: 's', at: NOW, reason: '' } };
    s.adjusts = { E: 2.5 };
    await r.seed(s);
    const l = await r.load();
    expect(l.attendance['2026-10-05|08:30|E']).toMatchObject({ status: 'l', reason: 'bus' });
    expect(l.dayMarks['2026-10-06']?.status).toBe('s');
    expect(l.adjusts.E).toBe(2.5);
  });

  it('a focus session round-trips the mode and completed columns the finish path writes (W3/D2)', async () => {
    // Until W3 the two columns were unbound: a put dropped them and a load invented them, so a session
    // saved as "not completed" came back looking the same as one that ran out. This pins both directions.
    const r = await make();
    const row = { id: 'f9', taskId: 't9', courseId: 'E', startedAt: NOW, endedAt: NOW + 600_000, focusSec: 600, breakSec: 60, overSec: 0, rounds: 1, planMin: 25, mode: 'focus', completed: true, demo: false };
    await r.upsert('focus', row);
    expect((await r.load()).focus.find((f) => f.id === 'f9')).toEqual(row);

    await r.upsert('focus', { ...row, rounds: 0, completed: false });
    // `false` has to come back as `false` — not the column's `0`, not a missing key (the bug the old
    // `rounds: 1` demo rows hid: a half-run session was indistinguishable from a finished one).
    expect((await r.load()).focus.find((f) => f.id === 'f9')).toMatchObject({ mode: 'focus', completed: false, rounds: 0 });
  });
  it('a scheduled reminder is logged as queued, with neither timestamp invented', async () => {
    const r = await make();
    await r.schedNotif('n2', 'ended', NOW);
    expect((await r.notifLog())[0]).toEqual({ id: 'n2', kind: 'ended', dueAt: NOW, shownAt: null, openedAt: null });
    // …and re-scheduling the same reminder keeps what it already knows, because `Planned.id` embeds
    // the minute and is stable until the reminder actually moves.
    await r.schedNotif('n2', 'ended', NOW + 60_000);
    expect((await r.notifLog())).toHaveLength(1);
    await r.logNotif('n2', 'ended', NOW, 'opened', NOW + 120_000);
    expect((await r.notifLog())[0]).toMatchObject({ dueAt: NOW, shownAt: null, openedAt: NOW + 120_000 });
  });
});

/** A fully-populated task, so a fixture row only has to say what it changes. */
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, courseId: null, kind: 'other', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...extra });
/** The columns migration 0 gives `task`, so a hand-written fixture row names them. */
const TASK_COLS = 'id,title,course_id,kind,due_at,start_at,estimate_min,priority,notes,status,created_at,completed_at,reminders,subtasks,demo';

/**
 * Audit C1. Two overlapping writes used to nest `BEGIN`s on the one shared connection, so the second
 * rejected with "cannot start a transaction within a transaction" while the caller's optimistic row
 * stayed on screen and was never written. The regression probe is the shape the audit found on device:
 * two writes issued from the same tap window, not two sequential ones.
 */
describe('repository transactions are serialised (audit C1)', () => {
  it('two upserts issued together both land, and neither rejects', async () => {
    const { sql } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    const both = await Promise.all([r.upsert('task', task('A')), r.upsert('task', task('B'))]);
    expect(both).toEqual([undefined, undefined]);
    expect((await r.load()).tasks.map((t) => t.id).sort()).toEqual(['A', 'B']);
  });

  it('three removes issued together all land, and the outbox keeps all three', async () => {
    const { sql } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    await r.seed({ ...seedSnapshot(NOW), tasks: [], meetings: [] });
    for (const id of ['x', 'y', 'z']) await r.upsert('task', task(id));
    await Promise.all(['x', 'y', 'z'].map((id) => r.remove('task', id)));
    expect((await r.load()).tasks).toHaveLength(0);
    expect((await r.pendingOutbox()).filter((o) => o.op === 'del').map((o) => o.id).sort()).toEqual(['x', 'y', 'z']);
  });

  it('the probe is not vacuous: an unqueued pair really does nest its BEGINs and reject', async () => {
    // The `ser` queue is what makes the two tests above pass. This drives the shim directly, the way
    // the unqueued repository did, and pins the failure mode C1 recorded on device.
    const { sql } = rawDb();
    const first = sql.withTransactionAsync(async () => { await sql.runAsync('CREATE TABLE t(a)'); await new Promise((r) => setImmediate(r)); });
    await expect(sql.withTransactionAsync(async () => undefined)).rejects.toThrow(/within a transaction/);
    await expect(first).resolves.toBeUndefined();
  });

  it('a read queued behind a compound write cannot see it half-applied', async () => {
    // `load()` is queued too: without that, a read issued during `seed()`'s multi-`put` transaction
    // (or during `removeCourse`'s three removes) could return a course with its meetings already gone.
    const { sql } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    const snap = seedSnapshot(NOW);
    const [seeded, loaded] = await Promise.all([r.seed(snap), r.load()]);
    expect(seeded).toBeUndefined();
    const after = await r.load();
    expect(loaded.courses.length === 0 || loaded.courses.length === after.courses.length).toBe(true);
    expect(after.courses.map((c) => c.id)).toEqual(snap.courses.map((c) => c.id));
  });
});

/**
 * Audit C2. The schema and its `user_version` marker used to commit as two statements, so a kill in
 * between left the tables created and the version at 0: every later launch re-ran the plain
 * `CREATE TABLE` and rejected with "already exists", which the Fatal screen's only button could not
 * repair. `IF NOT EXISTS` plus one transaction per migration is the fix; these are its three states.
 */
describe('migrations self-heal, and land the W5/W6 shapes (audit C2)', () => {
  it('a fresh database reaches version 3 with the new tables, the focus columns and the demo columns', async () => {
    const { sql, raw } = rawDb(); await new SqliteRepository(sql, () => NOW).init();
    expect(raw.all('PRAGMA user_version')).toEqual([{ user_version: 3 }]);
    const cols = (t: string) => (raw.all(`PRAGMA table_info(${t})`) as { name: string }[]).map((c) => c.name);
    expect(cols('trip')).toEqual(expect.arrayContaining(['id', 'started_at', 'ended_at', 'route', 'note']));
    expect(cols('alarm')).toEqual(expect.arrayContaining(['id', 'at', 'label', 'enabled', 'kind', 'task_id']));
    expect(cols('focus_session')).toEqual(expect.arrayContaining(['mode', 'completed']));
    // migration 3's four columns, on exactly the four content tables it names
    for (const t of ['course', 'meeting', 'notice', 'mark']) expect(cols(t)).toContain('demo');
  });

  it('a v1 database keeps its rows, reaches version 3, and a second init is a no-op', async () => {
    const { sql, raw } = rawDb();
    raw.exec(MIGRATIONS[0] as string); raw.exec('PRAGMA user_version = 1');
    raw.run(`INSERT INTO task(${TASK_COLS}) VALUES('t1','Old task',NULL,'other',NULL,NULL,NULL,0,'',0,?,NULL,'[]','[]',0)`, [NOW]);
    raw.run("INSERT INTO focus_session(id,task_id,course_id,started_at,ended_at,focus_sec,break_sec,over_sec,rounds,plan_min,demo) VALUES('f1',NULL,NULL,?,?,600,0,0,1,25,0)", [NOW, NOW + 600_000]);

    const r = new SqliteRepository(sql, () => NOW); await r.init(); await r.init(); // the second is a no-op…
    expect(raw.all('PRAGMA user_version')).toEqual([{ user_version: 3 }]); // …and neither throw
    const l = await r.load();
    expect(l.tasks.map((t) => t.id)).toEqual(['t1']); // the old row survived the ALTER
    expect(l.focus[0]).toMatchObject({ id: 'f1', focusSec: 600, planMin: 25, mode: 'focus', completed: false });
    // the new columns carry their defaults for rows written before they existed (brief B: "focus rows load with the defaults")
    expect(raw.all('SELECT mode, completed FROM focus_session')).toEqual([{ mode: 'focus', completed: 0 }]);
  });

  /* Migration 3 is the one that touches tables the user's own data already lives in, so its upgrade
     path is pinned separately: a database at version 2 gains the four `demo` columns, every
     pre-existing row reads back as "not sample", and a purge leaves those rows untouched. */
  it('a v2 database gains the demo columns with default 0, and a purge keeps its pre-existing rows', async () => {
    const { sql, raw } = rawDb();
    raw.exec(MIGRATIONS[0] as string); raw.exec(MIGRATIONS[1] as string); raw.exec('PRAGMA user_version = 2');
    // rows written by a user before the flag existed — the exact shape migration 3 must not disturb
    raw.run("INSERT INTO course(id,name,room,teacher,goal,sort) VALUES('c1','Real course','B-12','Hale',NULL,0)");
    raw.run("INSERT INTO meeting(id,course_id,weekday,start_t,end_t) VALUES('m1','c1',0,'08:30','09:20')");
    raw.run("INSERT INTO notice(id,course_id,body,due_at,priority) VALUES('n1','c1','Bring it',?,0)", [NOW]);
    raw.run("INSERT INTO mark(id,course_id,name,score,weight,on_,sort) VALUES('k1','c1','Quiz',80,10,1,0)");

    const r = new SqliteRepository(sql, () => NOW); await r.init(); await r.init(); // the second is a no-op
    expect(raw.all('PRAGMA user_version')).toEqual([{ user_version: 3 }]);
    // the columns appear, and every pre-existing row defaults to 0 — "not sample"
    for (const t of ['course', 'meeting', 'notice', 'mark']) {
      expect((raw.all(`PRAGMA table_info(${t})`) as { name: string }[]).map((c) => c.name)).toContain('demo');
      expect(raw.all(`SELECT demo FROM ${t}`)).toEqual([{ demo: 0 }]);
    }

    await r.purgeDemo();
    const l = await r.load(); // …so the purge touches nothing the user owned
    expect(l.courses.map((c) => c.id)).toEqual(['c1']);
    expect(l.meetings.map((m) => m.id)).toEqual(['m1']);
    expect(l.notices.map((n) => n.id)).toEqual(['n1']);
    expect(l.marks.map((m) => m.id)).toEqual(['k1']);
  });

  it('a database whose schema committed but whose version did not heals instead of rejecting forever', async () => {
    const { sql, raw } = rawDb();
    raw.exec(MIGRATIONS[0] as string); // the v0 kill window: the tables exist…
    expect(raw.all('PRAGMA user_version')).toEqual([{ user_version: 0 }]); // …and the marker says otherwise
    await expect(new SqliteRepository(sql, () => NOW).init()).resolves.toBeUndefined();
    expect(raw.all('PRAGMA user_version')).toEqual([{ user_version: 3 }]);
  });
});

/**
 * Audit M4. `outbox` (no sync target yet) and `notif_log` (a row per rescheduled reminder) grew for
 * the life of the install. Both are internal logs, so `init()` bounds them — and nothing else, which
 * the second half of the test pins.
 */
describe('the internal bookkeeping tables stay bounded (audit M4)', () => {
  it('init keeps the newest 500 outbox rows and 200 notif_log rows, and touches no user data', async () => {
    const { sql, raw } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    await r.seed(seedSnapshot(NOW));
    const tasksBefore = (await r.load()).tasks.length;
    raw.exec(`INSERT INTO outbox(entity,id,op,at) VALUES ${Array.from({ length: 600 }, (_, i) => `('task','o${i}','put',${i})`).join(',')}`);
    raw.exec(`INSERT INTO notif_log(id,kind,due_at) VALUES ${Array.from({ length: 300 }, (_, i) => `('n${i}','task',${i})`).join(',')}`);
    const total = (raw.all('SELECT COUNT(*) AS n FROM outbox')[0] as { n: number }).n;
    expect(total).toBeGreaterThanOrEqual(600);

    await r.init(); // migrations are already applied; this is the prune
    const seqs = (raw.all('SELECT seq FROM outbox ORDER BY seq') as { seq: number }[]).map((x) => x.seq);
    expect(seqs).toHaveLength(500);
    expect(seqs[seqs.length - 1]).toBe(total); // the newest survived…
    expect(seqs[0]).toBe(total - 499); // …and the oldest 100 are what went
    expect((raw.all('SELECT COUNT(*) AS n FROM notif_log')[0] as { n: number }).n).toBe(200);
    expect(raw.all('SELECT id FROM notif_log ORDER BY rowid LIMIT 1')).toEqual([{ id: 'n100' }]); // newest 200 kept
    expect((await r.load()).tasks.length).toBe(tasksBefore); // tasks are the user's, and untouched
  });
});

/**
 * Audits H2 and H3. Both are the same mistake in two places: a value that would not parse was read as
 * its empty form, and the next save wrote that empty form over the user's real bytes. The fix is to
 * skip the unreadable value, say so in the problems log, and never touch the bytes — which is what
 * these two tests assert, including the byte-for-byte part.
 */
describe('an unreadable stored value is skipped, reported, and left on disk (audit H2/H3)', () => {
  beforeEach(() => recordCrash.mockClear());

  it('a corrupt json column drops only its own row, and no later write rewrites the bytes', async () => {
    const { sql, raw } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    await r.upsert('task', task('good'));
    raw.run(`INSERT INTO task(${TASK_COLS}) VALUES('bad','Bad row',NULL,'other',NULL,NULL,NULL,0,'',0,?,NULL,'{broken','[]',0)`, [NOW]);

    const l = await r.load();
    expect(l.tasks.map((t) => t.id)).toEqual(['good']); // skipped, NOT defaulted to `reminders: []`
    expect(recordCrash).toHaveBeenCalledTimes(1);
    const [err, phase, route] = recordCrash.mock.calls[0] as [Error, string, string];
    expect(phase).toBe('data');
    expect(route).toBe('task');
    expect(err.message).toContain('reminders'); // names the column…
    expect(err.message).toContain('{broken'); // …and the first ≤40 chars of the raw value

    await r.putSettings({ soundOn: false }); // an unrelated write, the shape that used to flush the row
    await r.load();
    expect(raw.all("SELECT reminders FROM task WHERE id='bad'")).toEqual([{ reminders: '{broken' }]);
  });

  it('a corrupt setting is excluded so the default applies, and its bytes survive later writes', async () => {
    const { sql, raw } = rawDb(); const r = new SqliteRepository(sql, () => NOW); await r.init();
    raw.run("INSERT INTO setting(k,v) VALUES('semesterStart','{broken')");

    const l = await r.load();
    expect(l.settings.semesterStart).toBe(withDefaults({}).semesterStart);
    expect(recordCrash).toHaveBeenCalledTimes(1);
    const [err, phase, route] = recordCrash.mock.calls[0] as [Error, string, string];
    expect(phase).toBe('data');
    expect(route).toBe('setting');
    expect(err.message).toContain('semesterStart');

    // `putSettings` persists exactly the keys it is handed, so a key the UI never writes again keeps
    // the bytes the user's copy has — that is the whole reason exclusion is safe here (audit H3).
    await r.putSettings({ soundOn: false }); await r.putSettings({ name: 'Sam' });
    expect(raw.all("SELECT v FROM setting WHERE k='semesterStart'")).toEqual([{ v: '{broken' }]);
    expect((await r.load()).settings.name).toBe('Sam');
  });
});
