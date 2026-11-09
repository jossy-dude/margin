import type { SemesterRow, Settings, Snapshot } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import { newSemester, semesterName } from '../domain/archive';
import { isYmd } from '../domain/semester';
import { pkOf, type EntityMap, type EntityName, type NotifLogRow, type OutboxRow, type Repository } from './repository';
import { BACKFILL, fromSql, MIGRATIONS, SPECS, toSql } from './specs';

/** The slice of expo-sqlite's SQLiteDatabase this adapter needs. A node:sqlite shim implements it for the contract test. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  /** Only the Expo adapter provides this: closes the connection and deletes the database file (and
   *  with it WAL/SHM). `wipe()` prefers it so a full reset removes the FILE, not its rows; the
   *  node:sqlite shim omits it and keeps the DELETE-all fallback. */
  closeAndDelete?(): Promise<void>;
}
/**
 * Where the adapter reports a stored value it skipped because it could not read it back (audits H2/H3).
 * The data layer does not decide where problems go — `src/data` imports nothing above it (depcruise
 * `data-not-up`) — so the caller hands one in: on the device that is the Problems log, wired in
 * `store/openRepository.ts`. Called from inside `load()`, so it must not throw. The default drops the
 * report, which is what a test that is not asserting on it wants.
 */
export type ReportProblem = (e: unknown, phase: 'data', where: string) => void;
const q = (c: string) => `"${c}"`;
const ENTITIES = Object.keys(SPECS) as EntityName[];

export class SqliteRepository implements Repository {
  constructor(private db: SqlDb, private clock: () => number = Date.now, private report: ReportProblem = () => undefined) {}

  /* ── one transaction at a time ─────────────────────────────────────────────────────────────────
   * `expo-sqlite`'s `withTransactionAsync` is explicitly not exclusive (its own doc comment says so)
   * and its implementation is a bare `BEGIN`/`COMMIT` on the single shared connection, so two
   * overlapping mutations nested their `BEGIN`s: the second rejected with "cannot start a transaction
   * within a transaction" while the caller's optimistic row stayed on screen and was never written
   * (audit C1 — ordinary double-taps on the attendance stamps reached it). Every entry point that
   * opens a transaction, plus `load()` so a read cannot observe a half-applied compound write, is
   * queued through `ser`, which chains each job onto the previous one whatever its outcome. */
  private q: Promise<unknown> = Promise.resolve();
  private ser<T>(f: () => Promise<T>): Promise<T> {
    /* A reset closes and deletes the file (`wipe`); a call that arrives afterwards on this instance would
       talk to a closed handle and fail with a native error nobody can read. It fails here instead, with a
       sentence, and the store re-opens a fresh repository. */
    const run = () => (this.closed ? Promise.reject(new Error('The database was closed by a reset; it has to be re-opened.')) : f());
    const r = this.q.then(run, run);
    this.q = r.then(() => undefined, () => undefined);
    return r;
  }

  async init() {
    const row = (await this.db.getAllAsync<{ user_version: number }>('PRAGMA user_version'))[0];
    const v = row?.user_version ?? 0;
    /* A database written by a NEWER Margin (a downgrade, or a backup restored from a newer phone) has
       columns and meanings this build does not know. Opening it anyway would read some of its rows as
       corrupt and write the rest back without the new columns. Nothing is changed; the message says what
       to do instead. */
    if (v > MIGRATIONS.length) throw new Error(`This planner was saved by a newer version of Margin (data version ${v}; this one reads up to ${MIGRATIONS.length}). Nothing was changed — install the newer version to open it.`);
    for (let n = v; n < MIGRATIONS.length; n++) {
      /* The schema and its version marker commit together. They used to be two separate statements,
         so a kill in between left the tables created and `user_version` at 0 — and because
         `MIGRATIONS[0]` was a plain `CREATE TABLE`, every launch after that rejected with "already
         exists" and the Fatal screen's only button could not recover it (audit C2). `IF NOT EXISTS`
         (specs.ts) plus one transaction means such an install heals on the next boot instead. */
      await this.db.withTransactionAsync(async () => {
        await this.db.execAsync(MIGRATIONS[n] as string);
        await BACKFILL[n]?.(this.db);
        await this.db.execAsync(`PRAGMA user_version = ${n + 1}`);
      });
    }
    /* Bound the two internal bookkeeping tables (audit M4). Neither is ever drained: `outbox` has no
       sync target yet and `notif_log` gains a row whenever reminders are rescheduled, so both grew for
       the life of the install. Only these two are pruned — tasks, courses, marks, attendance and focus
       sessions are the user's data and are never touched here. 500 outbox rows is far more than a
       future sync needs to replay; 200 reminder rows is more than the 12 Delivery status can show. */
    await this.db.runAsync('DELETE FROM outbox WHERE seq <= (SELECT MAX(seq) FROM outbox) - 500');
    await this.db.runAsync('DELETE FROM notif_log WHERE rowid NOT IN (SELECT rowid FROM notif_log ORDER BY rowid DESC LIMIT 200)');
    await this.ensureActiveSemester();
  }

  /* ── the active term ────────────────────────────────────────────────────────────────────────────
   * `settings.semesterStart`/`semesterEnd` predate the `semesters` table and are still what Grades,
   * export and the Settings summary read, so the row and the settings must not disagree on first boot.
   * The guard is "is there an active row" rather than "are there rows": `init()` runs on every launch,
   * and a user who archived a term and started another already has history — a second boot must add
   * nothing. No active term means one of exactly two things, and both need a term to run the app:
   *   · a fresh or wiped install — nothing to lose, so `settings.semesterStart/End` is CARRIED verbatim
   *     (including a deliberately open-ended end, because inventing a 15-week end would hide attendance
   *     the user is still marking);
   *   · a roll-over killed after archiving but before activating — the archived row's snapshot is
   *     frozen, so it must not be resurrected; the new term starts today and the settings follow it,
   *     because they still point at the term that was just closed.
   * A start that does not parse is treated as absent (`semesterOf` already ignores it), and bytes that
   * do not parse are never written over (audit H3): the row gets a usable range, the corrupt value
   * stays on disk where a later fix can read it. Settings are stored JSON-encoded, hence the parse. */
  private async ensureActiveSemester() {
    const n = async (sql: string) => (await this.db.getAllAsync<{ n: number }>(sql))[0]?.n ?? 0;
    if ((await n('SELECT COUNT(*) AS n FROM semesters WHERE active=1')) > 0) return;
    const hasHistory = (await n('SELECT COUNT(*) AS n FROM semesters')) > 0;
    const kv = await this.db.getAllAsync<{ k: string; v: string }>("SELECT k, v FROM setting WHERE k IN ('semesterStart','semesterEnd')");
    const stored = new Map(kv.map((r) => [r.k, r.v]));
    /** `undefined` for absent OR unreadable — the two cases differ only in whether the key may be filled. */
    const read = (k: string): string | undefined => {
      const raw = stored.get(k);
      if (raw === undefined) return undefined;
      try { const v: unknown = JSON.parse(raw); return typeof v === 'string' ? v : undefined; } catch { return undefined; }
    };
    const carried = hasHistory ? undefined : read('semesterStart');
    const fresh = newSemester(this.clock());
    const row: SemesterRow = isYmd(carried)
      ? { ...fresh, start: carried, end: read('semesterEnd') ?? '', name: semesterName(carried) }
      : fresh;
    /* A key that exists but cannot be read is left alone; a key that parses is ours to mirror, so a
       history-only database's stale range is replaced by the new term's (and a carried range rewrites
       its own identical bytes, which is a no-op in content). */
    const mirror = [['semesterStart', row.start], ['semesterEnd', row.end]] as const;
    const writable = mirror.filter(([k]) => stored.get(k) === undefined || read(k) !== undefined);
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT INTO semesters(id,name,start,end,active,snapshot_json,created_at,archived_at) VALUES(?,?,?,?,?,?,?,?)',
        [row.id, row.name, row.start, row.end, row.active ? 1 : 0, row.snapshotJson, row.createdAt, row.archivedAt]);
      for (const [k, v] of writable) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
    });
  }
  private async outbox(entity: string, id: string, op: OutboxRow['op']) { await this.db.runAsync('INSERT INTO outbox(entity,id,op,at) VALUES(?,?,?,?)', [entity, id, op, this.clock()]); }
  private async put<K extends EntityName>(e: K, v: EntityMap[K]) {
    const s = SPECS[e], cols = s.fields.map((x) => q(x.c)), rec = v as unknown as Record<string, unknown>, id = pkOf(e, v);
    await this.db.runAsync(
      `INSERT OR REPLACE INTO ${s.table}(${cols.join(',')},updated_at,deleted_at,rev) VALUES(${cols.map(() => '?').join(',')},?,NULL,(SELECT COALESCE(MAX(rev),0)+1 FROM ${s.table} WHERE ${q(s.pk)}=?))`,
      [...s.fields.map((x) => toSql(x, rec[x.p])), this.clock(), id]);
    await this.outbox(e, id, 'put');
  }
  async upsert<K extends EntityName>(e: K, v: EntityMap[K]) { await this.ser(() => this.db.withTransactionAsync(async () => { await this.put(e, v); })); }
  /* The tombstone half of `remove`, without the queue: `clearActiveSchedule` runs a whole term's
     deletions in ONE queued transaction, and calling the public `remove` from inside it would re-enter
     `ser` on a job that is itself waiting — the same deadlock `importSnapshot` avoids for settings. */
  private async markDeleted(e: EntityName, id: string) {
    await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=?, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), this.clock(), id]);
    await this.outbox(e, id, 'del');
  }
  async remove(e: EntityName, id: string) {
    await this.ser(() => this.db.withTransactionAsync(() => this.markDeleted(e, id)));
  }
  /** Several deletions as ONE transaction — a subject with its meetings and marks. Half a cascade on disk
   *  (the subject gone, its marks still there) is exactly what a kill between separate writes left. */
  async removeMany(rows: { entity: EntityName; id: string }[]) {
    await this.ser(() => this.db.withTransactionAsync(async () => { for (const r of rows) await this.markDeleted(r.entity, r.id); }));
  }
  async commit(b: { put: { entity: EntityName; value: unknown }[]; remove: { entity: EntityName; id: string }[] }) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      for (const r of b.remove) await this.markDeleted(r.entity, r.id);
      for (const p of b.put) await this.put(p.entity, p.value as never);
    }));
  }
  async restoreMany(rows: { entity: EntityName; id: string }[]) {
    await this.ser(() => this.db.withTransactionAsync(async () => { for (const r of rows) await this.markRestored(r.entity, r.id); }));
  }
  private async markRestored(e: EntityName, id: string) {
    await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=NULL, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), id]);
    await this.outbox(e, id, 'restore');
  }
  async restore(e: EntityName, id: string) {
    await this.ser(() => this.db.withTransactionAsync(() => this.markRestored(e, id)));
  }
  async putSettings(patch: Partial<Settings>) {
    await this.ser(() => this.db.withTransactionAsync(async () => { for (const [k, v] of Object.entries(patch)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]); }));
  }
  /* The `setting` table, reached directly for keys that are not `Settings` fields (the OTA marker).
     Queued like `load()` so a read cannot land between the two halves of a compound write, and JSON
     encoded like every other row there — a raw string would make `ensureActiveSemester`'s parse fail
     for a key it does not own. A value that is absent or does not parse reads as `null`: the caller
     only ever asks "was this recorded?", never "what exactly". */
  async getKv(k: string) {
    return this.ser(async () => {
      const row = (await this.db.getAllAsync<{ v: string }>('SELECT v FROM setting WHERE k=?', [k]))[0];
      if (!row) return null;
      try { const v: unknown = JSON.parse(row.v); return typeof v === 'string' ? v : null; } catch { return null; }
    });
  }
  async setKv(k: string, value: string | null) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      if (value === null) await this.db.runAsync('DELETE FROM setting WHERE k=?', [k]);
      else await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(value)]);
    }));
  }
  private async rows<K extends EntityName>(e: K): Promise<EntityMap[K][]> {
    const s = SPECS[e], rows = await this.db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${s.table} WHERE deleted_at IS NULL`);
    const out: EntityMap[K][] = [];
    let skipped = 0, first = '';
    for (const r of rows) {
      try { out.push(Object.fromEntries(s.fields.filter((x) => !(x.opt && r[x.c] == null)).map((x) => [x.p, fromSql(x, r[x.c])])) as unknown as EntityMap[K]); }
      /* A row whose value cannot be read back is SKIPPED, not defaulted (audit H2). Defaulting was the
         unsafe direction for exactly one reason: the loaded object is what the next `upsert` writes
         back, so an unparseable `reminders` column read as `[]` became an empty array ON DISK on the
         next save — the user's real bytes, gone, with no message. Skipping keeps those bytes where
         they are, so nothing this session does can destroy them, and the occurrence is listed in
         Diagnostics. `fromSql` throws the message; the entity name is added here. */
      catch (err) { if (skipped++ === 0) first = String((err as Error)?.message ?? err); }
    }
    /* One entry per table per load, not one per row: a table with a thousand damaged rows used to push
       a thousand entries into a Problems log that keeps fifty, burying everything else that went wrong. */
    if (skipped) this.report(new Error(`${skipped === 1 ? `${e} row skipped` : `${skipped} ${e} rows skipped`}: ${first}`), 'data', e);
    return out;
  }
  async load(): Promise<Snapshot> {
    return this.ser(async () => {
      const [courses, meetings, att, days, tasks, notices, marks, adj, focus, trips, alarms, variants] = await Promise.all(ENTITIES.map((e) => this.rows(e)));
      const st = await this.db.getAllAsync<{ k: string; v: string }>('SELECT k, v FROM setting'), settings: Record<string, unknown> = {};
      for (const r of st) {
        /* A setting that will not parse is left OUT of the returned settings (so the default applies
           in the UI) and recorded — it used to be dropped silently, and the next `putSettings` for
           that key then wrote the default over the user's stored value (audit H3). `putSettings`
           persists exactly the keys it is handed, so a key that never appears in the UI again keeps
           its bytes. */
        try { settings[r.k] = JSON.parse(r.v); } catch { this.report(new Error(`setting "${r.k}" is not valid JSON — first 40 chars: ${r.v.slice(0, 40)}`), 'data', 'setting'); }
      }
      return {
        courses: (courses as EntityMap['course'][]).sort((a, b) => a.sort - b.sort), meetings: meetings as EntityMap['meeting'][],
        attendance: Object.fromEntries((att as EntityMap['attendance'][]).map((x) => [x.key, x])), dayMarks: Object.fromEntries((days as EntityMap['dayMark'][]).map((x) => [x.date, x])),
        tasks: tasks as EntityMap['task'][], notices: notices as EntityMap['notice'][], marks: marks as EntityMap['mark'][],
        adjusts: Object.fromEntries((adj as EntityMap['adjust'][]).map((x) => [x.courseId, x.adj])), focus: focus as EntityMap['focus'][],
        trips: trips as EntityMap['trip'][], alarms: alarms as EntityMap['alarm'][], settings: withDefaults(settings as Partial<Settings>),
        variants: (variants as EntityMap['variant'][]).sort((a, b) => a.ord - b.ord),
      };
    });
  }
  async seed(s: Snapshot) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      for (const c of s.courses) await this.put('course', c);
      for (const m of s.meetings) await this.put('meeting', m);
      for (const t of s.tasks) await this.put('task', t);
      for (const n of s.notices) await this.put('notice', n);
      for (const m of s.marks) await this.put('mark', m);
      for (const f of s.focus) await this.put('focus', f);
      for (const t of s.trips) await this.put('trip', t);
      for (const a of s.alarms) await this.put('alarm', a);
      for (const v of s.variants ?? []) await this.put('variant', v);
      for (const a of Object.values(s.attendance)) await this.put('attendance', a);
      for (const d of Object.values(s.dayMarks)) await this.put('dayMark', d);
      for (const [courseId, adj] of Object.entries(s.adjusts)) await this.put('adjust', { courseId, adj });
      for (const [k, v] of Object.entries(s.settings)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
    }));
  }
  /* The import path's write: the same discipline as `seed()` — one queued transaction, one `put` per
     row, so every imported row carries a `rev` and an outbox `put` for a future sync. Settings are
     written as raw KV rows INSIDE that transaction rather than through `putSettings`, which would
     re-enter `ser` from inside a queued job and deadlock. */
  async importSnapshot(s: Partial<Snapshot>) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      for (const c of s.courses ?? []) await this.put('course', c);
      for (const m of s.meetings ?? []) await this.put('meeting', m);
      for (const t of s.tasks ?? []) await this.put('task', t);
      for (const n of s.notices ?? []) await this.put('notice', n);
      for (const m of s.marks ?? []) await this.put('mark', m);
      for (const a of Object.values(s.attendance ?? {})) await this.put('attendance', a);
      for (const d of Object.values(s.dayMarks ?? {})) await this.put('dayMark', d);
      for (const v of s.variants ?? []) await this.put('variant', v);
      for (const f of s.focus ?? []) await this.put('focus', f);
      for (const t of s.trips ?? []) await this.put('trip', t);
      for (const a of s.alarms ?? []) await this.put('alarm', a);
      for (const [courseId, adj] of Object.entries(s.adjusts ?? {})) await this.put('adjust', { courseId, adj });
      for (const [k, v] of Object.entries(s.settings ?? {})) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
    }));
  }
  /* All six demo-bearing tables. The four content tables came with migration 3; tasks and focus
     sessions were the first two. One transaction, so a half-applied purge cannot leave a sample
     timetable behind its (now gone) sample subjects. */
  async purgeDemo() { await this.ser(() => this.db.withTransactionAsync(async () => { for (const t of ['course', 'meeting', 'notice', 'mark', 'task', 'focus_session']) await this.db.runAsync(`DELETE FROM ${t} WHERE demo=1`); })); }
  /* A full reset deletes the FILE when the adapter can (Expo: close + delete, WAL/SHM included), so
     what a user walks away from "Erase everything" with is genuinely nothing on disk. The queued
     writes in `ser` finish before the file drops, because the close rides the same queue. Without
     the hook (tests), the same DELETE-all transaction the old reset ran is the fallback, leaving an
     open, empty database either way. */
  async wipe() {
    await this.ser(async () => {
      if (this.db.closeAndDelete) { this.closed = true; await this.db.closeAndDelete(); return; }
      await this.db.withTransactionAsync(async () => { for (const t of [...ENTITIES.map((e) => SPECS[e].table), 'semesters', 'setting', 'notif_log', 'outbox']) await this.db.runAsync(`DELETE FROM ${t}`); });
    });
  }
  private closed = false;

  /* ── semesters (v0.5) ─────────────────────────────────────────────────────────────────────────── */
  /* A term read as the app sees it. The columns are snake_case and `active` is an INTEGER; one place
     does that translation, so a field added to the row later cannot be picked up by some readers and
     silently dropped by others. */
  private static term(r: Record<string, unknown>): SemesterRow {
    return {
      id: String(r.id), name: String(r.name ?? ''), start: String(r.start ?? ''), end: String(r.end ?? ''),
      active: r.active === 1, snapshotJson: r.snapshot_json == null ? null : String(r.snapshot_json),
      createdAt: String(r.created_at ?? ''), archivedAt: r.archived_at == null ? null : String(r.archived_at),
    };
  }
  /* Queued like every other write: it may create the healing term, and an `ORDER BY active DESC` read
     made alongside a roll-over must not observe the half-applied state. */
  async listSemesters() {
    return this.ser(async () => {
      await this.ensureActiveSemester();
      const rows = await this.db.getAllAsync<Record<string, unknown>>('SELECT * FROM semesters ORDER BY active DESC, start DESC, created_at DESC');
      return rows.map((r) => SqliteRepository.term(r));
    });
  }
  async saveSemester(row: SemesterRow) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO semesters(id,name,start,end,active,snapshot_json,created_at,archived_at) VALUES(?,?,?,?,?,?,?,?)',
        [row.id, row.name, row.start, row.end, row.active ? 1 : 0, row.snapshotJson, row.createdAt, row.archivedAt]);
    }));
  }
  /* One transaction, so "exactly one active term" is never observable as two or none, and the settings
     mirror is written beside the flags: the range the rest of the app prints is the range that just
     became active, or the two would disagree until the next launch healed them. An unknown id throws
     rather than clearing the flags — a silent no-op would leave a page saying a term is current when
     nothing is. */
  async setActiveSemester(id: string) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      const found = (await this.db.getAllAsync<Record<string, unknown>>('SELECT * FROM semesters WHERE id=?', [id]))[0];
      if (!found) throw new Error(`No semester with id "${id}" — nothing was made active.`);
      const row = SqliteRepository.term(found);
      await this.db.runAsync('UPDATE semesters SET active=0 WHERE id<>?', [id]);
      await this.db.runAsync('UPDATE semesters SET active=1 WHERE id=?', [id]);
      for (const [k, v] of [['semesterStart', row.start], ['semesterEnd', row.end]] as const) {
        await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
      }
    }));
  }
  /* The destructive half of a roll-over, in one transaction and through `markDeleted`, so each cleared
     row keeps a `rev` bump and an outbox `del` (undo of a partly-cleared term is then possible, and a
     future sync sees exactly what went). Subjects and variants survive by design: they are what the
     next term inherits. */
  async clearActiveSchedule(keepAttendance: boolean) {
    const entities: EntityName[] = keepAttendance
      ? ['meeting', 'task', 'notice', 'dayMark', 'mark', 'adjust'] // D4: curves reset with the term (they are archived first)
      : ['meeting', 'task', 'notice', 'dayMark', 'mark', 'adjust', 'attendance'];
    await this.ser(() => this.db.withTransactionAsync(async () => {
      for (const e of entities) {
        const s = SPECS[e];
        const ids = await this.db.getAllAsync<Record<string, unknown>>(`SELECT ${q(s.pk)} AS id FROM ${s.table} WHERE deleted_at IS NULL`);
        for (const r of ids) await this.markDeleted(e, String(r.id));
      }
    }));
  }

  /* The bookkeeping tables ride the same queue as everything else: a bare statement issued while another
     job holds BEGIN lands INSIDE that transaction, and is rolled back with it if that job fails. */
  async schedNotif(id: string, kind: string, dueAt: number) { await this.schedNotifMany([{ id, kind, at: dueAt }]); }
  /** A whole scheduling pass's rows in one transaction, instead of one write per reminder. */
  async schedNotifMany(rows: { id: string; kind: string; at: number }[]) {
    if (!rows.length) return;
    await this.ser(() => this.db.withTransactionAsync(async () => { for (const r of rows) await this.db.runAsync('INSERT OR IGNORE INTO notif_log(id,kind,due_at) VALUES(?,?,?)', [r.id, r.kind, r.at]); }));
  }
  async logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      await this.db.runAsync('INSERT OR IGNORE INTO notif_log(id,kind,due_at) VALUES(?,?,?)', [id, kind, dueAt]);
      await this.db.runAsync(`UPDATE notif_log SET ${event === 'shown' ? 'shown_at' : 'opened_at'}=? WHERE id=?`, [at, id]);
    }));
  }
  async notifLog(): Promise<NotifLogRow[]> { return this.ser(async () => (await this.db.getAllAsync<{ id: string; kind: string; due_at: number; shown_at: number | null; opened_at: number | null }>('SELECT * FROM notif_log')).map((r) => ({ id: r.id, kind: r.kind, dueAt: r.due_at, shownAt: r.shown_at, openedAt: r.opened_at }))); }
  async pendingOutbox(limit = 200) { return this.ser(() => this.db.getAllAsync<OutboxRow>('SELECT seq,entity,id,op,at FROM outbox ORDER BY seq LIMIT ?', [limit])); }
  async ackOutbox(upTo: number) { await this.ser(() => this.db.runAsync('DELETE FROM outbox WHERE seq<=?', [upTo])); }
}
