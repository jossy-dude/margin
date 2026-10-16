import type { Settings, Snapshot } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import { recordCrash } from '../ui/crashlog';
import { pkOf, type EntityMap, type EntityName, type NotifLogRow, type OutboxRow, type Repository } from './repository';
import { fromSql, MIGRATIONS, SPECS, toSql } from './specs';

/** The slice of expo-sqlite's SQLiteDatabase this adapter needs. A node:sqlite shim implements it for the contract test. */
export interface SqlDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
const q = (c: string) => `"${c}"`;
const ENTITIES = Object.keys(SPECS) as EntityName[];

export class SqliteRepository implements Repository {
  constructor(private db: SqlDb, private clock: () => number = Date.now) {}

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
    const r = this.q.then(f, f);
    this.q = r.then(() => undefined, () => undefined);
    return r;
  }

  async init() {
    const row = (await this.db.getAllAsync<{ user_version: number }>('PRAGMA user_version'))[0];
    const v = row?.user_version ?? 0;
    for (let n = v; n < MIGRATIONS.length; n++) {
      /* The schema and its version marker commit together. They used to be two separate statements,
         so a kill in between left the tables created and `user_version` at 0 — and because
         `MIGRATIONS[0]` was a plain `CREATE TABLE`, every launch after that rejected with "already
         exists" and the Fatal screen's only button could not recover it (audit C2). `IF NOT EXISTS`
         (specs.ts) plus one transaction means such an install heals on the next boot instead. */
      await this.db.withTransactionAsync(async () => {
        await this.db.execAsync(MIGRATIONS[n] as string);
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
  async remove(e: EntityName, id: string) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=?, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), this.clock(), id]);
      await this.outbox(e, id, 'del');
    }));
  }
  async restore(e: EntityName, id: string) {
    await this.ser(() => this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=NULL, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), id]);
      await this.outbox(e, id, 'restore');
    }));
  }
  async putSettings(patch: Partial<Settings>) {
    await this.ser(() => this.db.withTransactionAsync(async () => { for (const [k, v] of Object.entries(patch)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]); }));
  }
  private async rows<K extends EntityName>(e: K): Promise<EntityMap[K][]> {
    const s = SPECS[e], rows = await this.db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${s.table} WHERE deleted_at IS NULL`);
    const out: EntityMap[K][] = [];
    for (const r of rows) {
      try { out.push(Object.fromEntries(s.fields.map((x) => [x.p, fromSql(x, r[x.c])])) as unknown as EntityMap[K]); }
      /* A row whose value cannot be read back is SKIPPED, not defaulted (audit H2). Defaulting was the
         unsafe direction for exactly one reason: the loaded object is what the next `upsert` writes
         back, so an unparseable `reminders` column read as `[]` became an empty array ON DISK on the
         next save — the user's real bytes, gone, with no message. Skipping keeps those bytes where
         they are, so nothing this session does can destroy them, and the occurrence is listed in
         Diagnostics. `fromSql` throws the message; the entity name is added here. */
      catch (err) { recordCrash(new Error(`${e} row skipped: ${String((err as Error)?.message ?? err)}`), 'data', e); }
    }
    return out;
  }
  async load(): Promise<Snapshot> {
    return this.ser(async () => {
      const [courses, meetings, att, days, tasks, notices, marks, adj, focus, trips, alarms] = await Promise.all(ENTITIES.map((e) => this.rows(e)));
      const st = await this.db.getAllAsync<{ k: string; v: string }>('SELECT k, v FROM setting'), settings: Record<string, unknown> = {};
      for (const r of st) {
        /* A setting that will not parse is left OUT of the returned settings (so the default applies
           in the UI) and recorded — it used to be dropped silently, and the next `putSettings` for
           that key then wrote the default over the user's stored value (audit H3). `putSettings`
           persists exactly the keys it is handed, so a key that never appears in the UI again keeps
           its bytes. */
        try { settings[r.k] = JSON.parse(r.v); } catch { recordCrash(new Error(`setting "${r.k}" is not valid JSON — first 40 chars: ${r.v.slice(0, 40)}`), 'data', 'setting'); }
      }
      return {
        courses: (courses as EntityMap['course'][]).sort((a, b) => a.sort - b.sort), meetings: meetings as EntityMap['meeting'][],
        attendance: Object.fromEntries((att as EntityMap['attendance'][]).map((x) => [x.key, x])), dayMarks: Object.fromEntries((days as EntityMap['dayMark'][]).map((x) => [x.date, x])),
        tasks: tasks as EntityMap['task'][], notices: notices as EntityMap['notice'][], marks: marks as EntityMap['mark'][],
        adjusts: Object.fromEntries((adj as EntityMap['adjust'][]).map((x) => [x.courseId, x.adj])), focus: focus as EntityMap['focus'][],
        trips: trips as EntityMap['trip'][], alarms: alarms as EntityMap['alarm'][], settings: withDefaults(settings as Partial<Settings>),
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
      for (const a of Object.values(s.attendance)) await this.put('attendance', a);
      for (const d of Object.values(s.dayMarks)) await this.put('dayMark', d);
      for (const [courseId, adj] of Object.entries(s.adjusts)) await this.put('adjust', { courseId, adj });
      for (const [k, v] of Object.entries(s.settings)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
    }));
  }
  async purgeDemo() { await this.ser(() => this.db.withTransactionAsync(async () => { await this.db.runAsync('DELETE FROM task WHERE demo=1'); await this.db.runAsync('DELETE FROM focus_session WHERE demo=1'); })); }
  async reset() { await this.ser(() => this.db.withTransactionAsync(async () => { for (const t of [...ENTITIES.map((e) => SPECS[e].table), 'setting', 'notif_log', 'outbox']) await this.db.runAsync(`DELETE FROM ${t}`); })); }
  async schedNotif(id: string, kind: string, dueAt: number) { await this.db.runAsync('INSERT OR IGNORE INTO notif_log(id,kind,due_at) VALUES(?,?,?)', [id, kind, dueAt]); }
  async logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
    await this.schedNotif(id, kind, dueAt);
    await this.db.runAsync(`UPDATE notif_log SET ${event === 'shown' ? 'shown_at' : 'opened_at'}=? WHERE id=?`, [at, id]);
  }
  async notifLog(): Promise<NotifLogRow[]> { return (await this.db.getAllAsync<{ id: string; kind: string; due_at: number; shown_at: number | null; opened_at: number | null }>('SELECT * FROM notif_log')).map((r) => ({ id: r.id, kind: r.kind, dueAt: r.due_at, shownAt: r.shown_at, openedAt: r.opened_at })); }
  async pendingOutbox(limit = 200) { return this.db.getAllAsync<OutboxRow>('SELECT seq,entity,id,op,at FROM outbox ORDER BY seq LIMIT ?', [limit]); }
  async ackOutbox(upTo: number) { await this.db.runAsync('DELETE FROM outbox WHERE seq<=?', [upTo]); }
}
