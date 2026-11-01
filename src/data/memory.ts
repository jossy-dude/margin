import type { SemesterRow, Settings, Snapshot } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import { newSemester, semesterName } from '../domain/archive';
import { isYmd } from '../domain/semester';
import { pkOf, type EntityMap, type EntityName, type NotifLogRow, type OutboxRow, type Repository } from './repository';

/** In-memory adapter: same contract as SQLite, used by tests and as proof that nothing above the port depends on SQL. */
export class MemoryRepository implements Repository {
  private t = new Map<EntityName, Map<string, { v: unknown; deleted: boolean }>>();
  private set: Record<string, unknown> = {};
  private sems = new Map<string, SemesterRow>();
  private ob: OutboxRow[] = []; private seq = 0; private nl = new Map<string, NotifLogRow>();
  constructor(private clock: () => number = Date.now) {}
  private tab(e: EntityName) { let m = this.t.get(e); if (!m) { m = new Map(); this.t.set(e, m); } return m; }
  private log(entity: string, id: string, op: OutboxRow['op']) { this.ob.push({ seq: ++this.seq, entity, id, op, at: this.clock() }); }
  async upsert<K extends EntityName>(e: K, v: EntityMap[K]) { const id = pkOf(e, v); this.tab(e).set(id, { v: structuredClone(v), deleted: false }); this.log(e, id, 'put'); }
  async remove(e: EntityName, id: string) { const r = this.tab(e).get(id); if (r) r.deleted = true; this.log(e, id, 'del'); }
  async removeMany(rows: { entity: EntityName; id: string }[]) { for (const r of rows) await this.remove(r.entity, r.id); }
  async restoreMany(rows: { entity: EntityName; id: string }[]) { for (const r of rows) await this.restore(r.entity, r.id); }
  async restore(e: EntityName, id: string) { const r = this.tab(e).get(id); if (r) r.deleted = false; this.log(e, id, 'restore'); }
  async putSettings(p: Partial<Settings>) { Object.assign(this.set, structuredClone(p)); }
  /* Same KV surface as the SQLite adapter, over the same object `putSettings` writes: a key that is
     not a `Settings` field (the OTA marker) is stored verbatim and never reaches `withDefaults`. */
  async getKv(k: string) { const v = this.set[k]; return typeof v === 'string' ? v : null; }
  async setKv(k: string, value: string | null) { if (value === null) delete this.set[k]; else this.set[k] = value; }
  private all<K extends EntityName>(e: K): EntityMap[K][] { return [...this.tab(e).values()].filter((r) => !r.deleted).map((r) => structuredClone(r.v) as EntityMap[K]); }
  async load(): Promise<Snapshot> {
    return {
      courses: this.all('course').sort((a, b) => a.sort - b.sort), meetings: this.all('meeting'), attendance: Object.fromEntries(this.all('attendance').map((x) => [x.key, x])),
      dayMarks: Object.fromEntries(this.all('dayMark').map((x) => [x.date, x])), tasks: this.all('task'), notices: this.all('notice'), marks: this.all('mark'),
      adjusts: Object.fromEntries(this.all('adjust').map((x) => [x.courseId, x.adj])), focus: this.all('focus'), trips: this.all('trip'), alarms: this.all('alarm'),
      variants: this.all('variant').sort((a, b) => a.ord - b.ord), settings: withDefaults(this.set as Partial<Settings>),
    };
  }
  async seed(s: Snapshot) {
    for (const c of s.courses) await this.upsert('course', c); for (const m of s.meetings) await this.upsert('meeting', m); for (const t of s.tasks) await this.upsert('task', t);
    for (const n of s.notices) await this.upsert('notice', n); for (const m of s.marks) await this.upsert('mark', m); for (const f of s.focus) await this.upsert('focus', f);
    for (const t of s.trips) await this.upsert('trip', t); for (const a of s.alarms) await this.upsert('alarm', a);
    for (const v of s.variants ?? []) await this.upsert('variant', v);
    for (const a of Object.values(s.attendance)) await this.upsert('attendance', a);
    for (const d of Object.values(s.dayMarks)) await this.upsert('dayMark', d);
    for (const [courseId, adj] of Object.entries(s.adjusts)) await this.upsert('adjust', { courseId, adj });
    await this.putSettings(s.settings);
  }
  /** The import path, mirrored: same rows as the SQLite adapter, same outbox discipline (`upsert`). */
  async importSnapshot(s: Partial<Snapshot>) {
    for (const c of s.courses ?? []) await this.upsert('course', c);
    for (const m of s.meetings ?? []) await this.upsert('meeting', m);
    for (const t of s.tasks ?? []) await this.upsert('task', t);
    for (const n of s.notices ?? []) await this.upsert('notice', n);
    for (const m of s.marks ?? []) await this.upsert('mark', m);
    for (const a of Object.values(s.attendance ?? {})) await this.upsert('attendance', a);
    for (const d of Object.values(s.dayMarks ?? {})) await this.upsert('dayMark', d);
    for (const [courseId, adj] of Object.entries(s.adjusts ?? {})) await this.upsert('adjust', { courseId, adj });
    for (const v of s.variants ?? []) await this.upsert('variant', v);
    for (const f of s.focus ?? []) await this.upsert('focus', f);
    for (const t of s.trips ?? []) await this.upsert('trip', t);
    for (const a of s.alarms ?? []) await this.upsert('alarm', a);
    if (s.settings) await this.putSettings(s.settings);
  }
  /** Same six tables as the SQLite adapter, same rows: the contract test runs both against one expectation. */
  async purgeDemo() { for (const e of ['course', 'meeting', 'notice', 'mark', 'task', 'focus'] as const) for (const [id, r] of this.tab(e)) if ((r.v as { demo: boolean }).demo) this.tab(e).delete(id); }
  async wipe() { this.t.clear(); this.sems.clear(); this.set = {}; this.ob = []; this.nl.clear(); }
  async schedNotif(id: string, kind: string, dueAt: number) { if (!this.nl.has(id)) this.nl.set(id, { id, kind, dueAt, shownAt: null, openedAt: null }); }
  async schedNotifMany(rows: { id: string; kind: string; at: number }[]) { for (const r of rows) await this.schedNotif(r.id, r.kind, r.at); }
  async logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) { await this.schedNotif(id, kind, dueAt); const r = this.nl.get(id)!; if (event === 'shown') r.shownAt = at; else r.openedAt = at; }
  async notifLog() { return [...this.nl.values()]; }
  async pendingOutbox(limit = 200) { return this.ob.slice(0, limit); }
  async ackOutbox(upTo: number) { this.ob = this.ob.filter((r) => r.seq > upTo); }

  /* ── semesters (v0.5) — the same four answers as the SQLite adapter ───────────────────────────
   * Ordering, the one-active invariant and the settings mirror are re-implemented here rather than
   * shared, because the contract test runs both adapters against ONE expectation: if the two ever
   * disagree, that test is where it shows. A repository with no active term heals with today's term
   * for the same two reasons the migration does (fresh install, or a roll-over killed midway). */
  async listSemesters() {
    if (![...this.sems.values()].some((s) => s.active)) {
      /* Same carry as the SQLite adapter: a repository with NO history and a stored range adopts that
         range instead of today's. Both adapters run against one contract, and the demo/sample semester
         is exactly the case where "today" would silently replace the range the user was shown — but a
         repository that already has terms has a range belonging to the term that was just closed, and
         resurrecting it would open the app on last term's dates (see `ensureActiveSemester`). */
      const carried = this.sems.size === 0 && typeof this.set.semesterStart === 'string' && isYmd(this.set.semesterStart) ? this.set.semesterStart : '';
      const fresh = newSemester(this.clock());
      const t: SemesterRow = carried
        ? { ...fresh, start: carried, end: typeof this.set.semesterEnd === 'string' ? this.set.semesterEnd : '', name: semesterName(carried) }
        : fresh;
      this.sems.set(t.id, t);
      this.set.semesterStart = t.start; this.set.semesterEnd = t.end;
    }
    return [...this.sems.values()].map((s) => structuredClone(s))
      .sort((a, b) => Number(b.active) - Number(a.active) || b.start.localeCompare(a.start) || b.createdAt.localeCompare(a.createdAt));
  }
  async saveSemester(row: SemesterRow) { this.sems.set(row.id, structuredClone(row)); }
  async setActiveSemester(id: string) {
    const row = this.sems.get(id);
    if (!row) throw new Error(`No semester with id "${id}" — nothing was made active.`);
    for (const s of this.sems.values()) s.active = false;
    row.active = true;
    this.set.semesterStart = row.start; this.set.semesterEnd = row.end;
  }
  async clearActiveSchedule(keepAttendance: boolean) {
    const entities: EntityName[] = keepAttendance
      ? ['meeting', 'task', 'notice', 'dayMark', 'mark']
      : ['meeting', 'task', 'notice', 'dayMark', 'mark', 'attendance'];
    for (const e of entities) for (const [id, r] of this.tab(e)) if (!r.deleted) { r.deleted = true; this.log(e, id, 'del'); }
  }
}
