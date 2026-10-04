import type { Settings, Snapshot } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import { pkOf, type EntityMap, type EntityName, type NotifLogRow, type OutboxRow, type Repository } from './repository';

/** In-memory adapter: same contract as SQLite, used by tests and as proof that nothing above the port depends on SQL. */
export class MemoryRepository implements Repository {
  private t = new Map<EntityName, Map<string, { v: unknown; deleted: boolean }>>();
  private set: Record<string, unknown> = {};
  private ob: OutboxRow[] = []; private seq = 0; private nl = new Map<string, NotifLogRow>();
  constructor(private clock: () => number = Date.now) {}
  private tab(e: EntityName) { let m = this.t.get(e); if (!m) { m = new Map(); this.t.set(e, m); } return m; }
  private log(entity: string, id: string, op: OutboxRow['op']) { this.ob.push({ seq: ++this.seq, entity, id, op, at: this.clock() }); }
  async upsert<K extends EntityName>(e: K, v: EntityMap[K]) { const id = pkOf(e, v); this.tab(e).set(id, { v: structuredClone(v), deleted: false }); this.log(e, id, 'put'); }
  async remove(e: EntityName, id: string) { const r = this.tab(e).get(id); if (r) r.deleted = true; this.log(e, id, 'del'); }
  async restore(e: EntityName, id: string) { const r = this.tab(e).get(id); if (r) r.deleted = false; this.log(e, id, 'restore'); }
  async putSettings(p: Partial<Settings>) { Object.assign(this.set, structuredClone(p)); }
  private all<K extends EntityName>(e: K): EntityMap[K][] { return [...this.tab(e).values()].filter((r) => !r.deleted).map((r) => structuredClone(r.v) as EntityMap[K]); }
  async load(): Promise<Snapshot> {
    return {
      courses: this.all('course').sort((a, b) => a.sort - b.sort), meetings: this.all('meeting'), attendance: Object.fromEntries(this.all('attendance').map((x) => [x.key, x])),
      dayMarks: Object.fromEntries(this.all('dayMark').map((x) => [x.date, x])), tasks: this.all('task'), notices: this.all('notice'), marks: this.all('mark'),
      adjusts: Object.fromEntries(this.all('adjust').map((x) => [x.courseId, x.adj])), focus: this.all('focus'), settings: withDefaults(this.set as Partial<Settings>),
    };
  }
  async seed(s: Snapshot) {
    for (const c of s.courses) await this.upsert('course', c); for (const m of s.meetings) await this.upsert('meeting', m); for (const t of s.tasks) await this.upsert('task', t);
    for (const n of s.notices) await this.upsert('notice', n); for (const m of s.marks) await this.upsert('mark', m); for (const f of s.focus) await this.upsert('focus', f);
    await this.putSettings(s.settings);
  }
  async purgeDemo() { for (const e of ['task', 'focus'] as const) for (const [id, r] of this.tab(e)) if ((r.v as { demo: boolean }).demo) this.tab(e).delete(id); }
  async reset() { this.t.clear(); this.set = {}; this.ob = []; this.nl.clear(); }
  async logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) { const r = this.nl.get(id) ?? { id, kind, dueAt, shownAt: null, openedAt: null }; if (event === 'shown') r.shownAt = at; else r.openedAt = at; this.nl.set(id, r); }
  async notifLog() { return [...this.nl.values()]; }
  async pendingOutbox(limit = 200) { return this.ob.slice(0, limit); }
  async ackOutbox(upTo: number) { this.ob = this.ob.filter((r) => r.seq > upTo); }
}
