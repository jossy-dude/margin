import type { Settings, Snapshot } from '../domain/types';
import { withDefaults } from '../domain/defaults';
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

  async init() {
    const row = (await this.db.getAllAsync<{ user_version: number }>('PRAGMA user_version'))[0];
    let v = row?.user_version ?? 0;
    for (; v < MIGRATIONS.length; v++) {
      await this.db.withTransactionAsync(async () => { await this.db.execAsync(MIGRATIONS[v] as string); });
      await this.db.execAsync(`PRAGMA user_version = ${v + 1}`);
    }
  }
  private async outbox(entity: string, id: string, op: OutboxRow['op']) { await this.db.runAsync('INSERT INTO outbox(entity,id,op,at) VALUES(?,?,?,?)', [entity, id, op, this.clock()]); }
  private async put<K extends EntityName>(e: K, v: EntityMap[K]) {
    const s = SPECS[e], cols = s.fields.map((x) => q(x.c)), rec = v as unknown as Record<string, unknown>, id = pkOf(e, v);
    await this.db.runAsync(
      `INSERT OR REPLACE INTO ${s.table}(${cols.join(',')},updated_at,deleted_at,rev) VALUES(${cols.map(() => '?').join(',')},?,NULL,(SELECT COALESCE(MAX(rev),0)+1 FROM ${s.table} WHERE ${q(s.pk)}=?))`,
      [...s.fields.map((x) => toSql(x, rec[x.p])), this.clock(), id]);
    await this.outbox(e, id, 'put');
  }
  async upsert<K extends EntityName>(e: K, v: EntityMap[K]) { await this.db.withTransactionAsync(async () => { await this.put(e, v); }); }
  async remove(e: EntityName, id: string) {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=?, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), this.clock(), id]);
      await this.outbox(e, id, 'del');
    });
  }
  async restore(e: EntityName, id: string) {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync(`UPDATE ${SPECS[e].table} SET deleted_at=NULL, updated_at=?, rev=rev+1 WHERE ${q(SPECS[e].pk)}=?`, [this.clock(), id]);
      await this.outbox(e, id, 'restore');
    });
  }
  async putSettings(patch: Partial<Settings>) {
    await this.db.withTransactionAsync(async () => { for (const [k, v] of Object.entries(patch)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]); });
  }
  private async rows<K extends EntityName>(e: K): Promise<EntityMap[K][]> {
    const s = SPECS[e], rows = await this.db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${s.table} WHERE deleted_at IS NULL`);
    return rows.map((r) => Object.fromEntries(s.fields.map((x) => [x.p, fromSql(x, r[x.c])])) as unknown as EntityMap[K]);
  }
  async load(): Promise<Snapshot> {
    const [courses, meetings, att, days, tasks, notices, marks, adj, focus] = await Promise.all(ENTITIES.map((e) => this.rows(e)));
    const st = await this.db.getAllAsync<{ k: string; v: string }>('SELECT k, v FROM setting'), settings: Record<string, unknown> = {};
    for (const r of st) { try { settings[r.k] = JSON.parse(r.v); } catch { /* ignore a corrupt value, defaults apply */ } }
    return {
      courses: (courses as EntityMap['course'][]).sort((a, b) => a.sort - b.sort), meetings: meetings as EntityMap['meeting'][],
      attendance: Object.fromEntries((att as EntityMap['attendance'][]).map((x) => [x.key, x])), dayMarks: Object.fromEntries((days as EntityMap['dayMark'][]).map((x) => [x.date, x])),
      tasks: tasks as EntityMap['task'][], notices: notices as EntityMap['notice'][], marks: marks as EntityMap['mark'][],
      adjusts: Object.fromEntries((adj as EntityMap['adjust'][]).map((x) => [x.courseId, x.adj])), focus: focus as EntityMap['focus'][], settings: withDefaults(settings as Partial<Settings>),
    };
  }
  async seed(s: Snapshot) {
    await this.db.withTransactionAsync(async () => {
      for (const c of s.courses) await this.put('course', c);
      for (const m of s.meetings) await this.put('meeting', m);
      for (const t of s.tasks) await this.put('task', t);
      for (const n of s.notices) await this.put('notice', n);
      for (const m of s.marks) await this.put('mark', m);
      for (const f of s.focus) await this.put('focus', f);
      for (const [k, v] of Object.entries(s.settings)) await this.db.runAsync('INSERT OR REPLACE INTO setting(k,v) VALUES(?,?)', [k, JSON.stringify(v)]);
    });
  }
  async purgeDemo() { await this.db.withTransactionAsync(async () => { await this.db.runAsync('DELETE FROM task WHERE demo=1'); await this.db.runAsync('DELETE FROM focus_session WHERE demo=1'); }); }
  async reset() { await this.db.withTransactionAsync(async () => { for (const t of [...ENTITIES.map((e) => SPECS[e].table), 'setting', 'notif_log', 'outbox']) await this.db.runAsync(`DELETE FROM ${t}`); }); }
  async logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
    await this.db.runAsync('INSERT OR IGNORE INTO notif_log(id,kind,due_at) VALUES(?,?,?)', [id, kind, dueAt]);
    await this.db.runAsync(`UPDATE notif_log SET ${event === 'shown' ? 'shown_at' : 'opened_at'}=? WHERE id=?`, [at, id]);
  }
  async notifLog(): Promise<NotifLogRow[]> { return (await this.db.getAllAsync<{ id: string; kind: string; due_at: number; shown_at: number | null; opened_at: number | null }>('SELECT * FROM notif_log')).map((r) => ({ id: r.id, kind: r.kind, dueAt: r.due_at, shownAt: r.shown_at, openedAt: r.opened_at })); }
  async pendingOutbox(limit = 200) { return this.db.getAllAsync<OutboxRow>('SELECT seq,entity,id,op,at FROM outbox ORDER BY seq LIMIT ?', [limit]); }
  async ackOutbox(upTo: number) { await this.db.runAsync('DELETE FROM outbox WHERE seq<=?', [upTo]); }
}
