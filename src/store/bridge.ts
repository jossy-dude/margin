/**
 * The bridge's store half (v0.6 foundation; docs/BRIDGE.md). Two calls, both I/O-free about WHERE the files
 * live — v0.7 adds the vault-folder transport that reads and writes them:
 *
 *  - `bridgeOut()`  Margin's envelope since the last one written (cursor `bridge.outAt`).
 *  - `bridgeIn(text)` the Bone plugins' envelope merged into Margin, last writer wins, through the same
 *    repository writes as any edit (so every row gets its `rev`, `updated_at` and outbox entry), then the
 *    store is reloaded from disk and reminders re-planned — an Obsidian task with a ⏰ rings from here.
 *
 * Neither runs while the tour's sample planner is on screen: samples never leave the phone.
 */
import { buildEnvelope, parseEnvelope, planTaskMerge, type BridgeEnvelope } from '../domain/bridge';
import { effective, isCancelled } from '../domain/attendance';
import { recordCrash } from '../services/problems';
import { applySnapshot, getState } from './core';
import { db, R } from './persist';
import { resync } from './reminders';

const OUT = 'bridge.outAt', IN = 'bridge.inAt';
const cursor = async (k: string) => { const v = Number(await R().getKv(k)); return Number.isFinite(v) ? v : 0; };

/** Margin's envelope of everything changed since the last call (or since `since`), and moves the cursor. */
export async function bridgeOut(opts: { since?: number; now?: number; move?: boolean } = {}): Promise<BridgeEnvelope | null> {
  if (db.demo) return null;
  const now = opts.now ?? Date.now(), since = opts.since ?? await cursor(OUT), s = getState();
  const [tasks, notices, focus] = await Promise.all([R().changes('task', since), R().changes('notice', since), R().changes('focus', since)]);
  const env = buildEnvelope({
    now, since, courses: s.courses, meetings: s.meetings, tasks, notices, focus, moves: s.settings.moves ?? [],
    cancelled: (d, m) => isCancelled(effective(new Date(`${d}T12:00:00`), m, s.attendance, s.dayMarks, now)),
  });
  if (opts.move !== false) await R().setKv(OUT, String(now));
  return env;
}

export interface BridgeInResult { ok: boolean; added: number; updated: number; removed: number; stale: number; problems: string[] }
/** Merge the Bone plugins' envelope. Never throws; a file it cannot read changes nothing and says why. */
export async function bridgeIn(text: string, now = Date.now()): Promise<BridgeInResult> {
  const none = (problems: string[]): BridgeInResult => ({ ok: false, added: 0, updated: 0, removed: 0, stale: 0, problems });
  if (db.demo) return none(['The sample planner is on screen; nothing from Obsidian is merged into it.']);
  const parsed = parseEnvelope(text);
  if (!parsed.envelope) return none(parsed.problems);
  try {
    /* Margin's own stamp per task: the change feed from 0 is every task row ever written, with when. */
    const stamps = new Map((await R().changes('task', 0)).map((c) => [c.id, c.updatedAt]));
    const s = getState(), plan = planTaskMerge(parsed.envelope, s.tasks, stamps, s.courses, now);
    const have = new Set(s.tasks.map((t) => t.id));
    for (const t of plan.put) await R().upsert('task', t);
    if (plan.remove.length) await R().removeMany(plan.remove.map((id) => ({ entity: 'task' as const, id })));
    await R().setKv(IN, String(parsed.envelope.writtenAt || now));
    if (plan.put.length || plan.remove.length) { applySnapshot(await R().load(), true); resync(0); }
    const added = plan.put.filter((t) => !have.has(t.id)).length;
    return { ok: true, added, updated: plan.put.length - added, removed: plan.remove.length, stale: plan.stale, problems: parsed.problems };
  } catch (e) {
    recordCrash(e, 'save', 'Bridge');
    return none([String((e as Error)?.message ?? e)]);
  }
}

export const bridgeActions = { bridgeOut, bridgeIn };
