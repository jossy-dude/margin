import { MemoryRepository } from '../data/memory';
import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { seedSnapshot } from '../data/seed';
import type { Repository } from '../data/repository';

/** node:sqlite shim that satisfies the same SqlDb the Expo adapter is handed. */
function nodeDb(): SqlDb {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => any } }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (s) => { db.exec(s); },
    runAsync: async (s, p = []) => db.prepare(s).run(...p),
    getAllAsync: async <T,>(s: string, p: any[] = []) => db.prepare(s).all(...p) as T[],
    withTransactionAsync: async (fn) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
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
    const r = await make(); await r.upsert('course', { id: 'X', name: 'X', room: '', teacher: '', goal: null, sort: 0 }); await r.remove('course', 'X'); await r.restore('course', 'X');
    const ob = await r.pendingOutbox(); expect(ob.map((o) => o.op)).toEqual(['put', 'del', 'restore']);
    await r.ackOutbox(ob[1]!.seq); expect((await r.pendingOutbox()).map((o) => o.op)).toEqual(['restore']);
  });
  it('purgeDemo removes only demo history; reset empties everything; notif log tracks shown/opened', async () => {
    const r = await make(); await r.seed(seedSnapshot(NOW));
    await r.purgeDemo(); const l = await r.load();
    expect(l.tasks.some((t) => t.demo)).toBe(false); expect(l.focus).toHaveLength(0); expect(l.tasks.some((t) => t.id === 'seed-task-1')).toBe(true);
    await r.logNotif('n1', 'task', NOW, 'shown', NOW); await r.logNotif('n1', 'task', NOW, 'opened', NOW + 5);
    expect((await r.notifLog())[0]).toMatchObject({ id: 'n1', shownAt: NOW, openedAt: NOW + 5 });
    await r.reset(); expect((await r.load()).tasks).toHaveLength(0);
  });
});
