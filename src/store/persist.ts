import type { Repository } from '../data/repository';
import { recordCrash } from '../services/problems';
import { isLostConnection } from '../data/sqlite';
import { openRepository } from './openRepository';
import { getState, set } from './core';

/** Which repository this session writes to.
 *
 *  `demo` is the LIVE demo flag (v0.1 of the data model): the sample semester is a session playground in
 *  memory — a `MemoryRepository` seeded from `seedSnapshot()`, pointed at by `repo` until the tour is
 *  left. While it is on, resync schedules NO OS notifications (a demo course must not ring a real bell)
 *  and nothing the tour does touches the real database. `adoptDemo` writes the rows the user created
 *  into the real repository and turns it off.
 *
 *  `real` is the real database behind the demo session. Set at boot, kept even while `repo` points at
 *  the demo memory repository, so adoption never re-opens or re-migrates. */
export const db: { repo: Repository | null; real: Repository | null; demo: boolean } = { repo: null, real: null, demo: false };

/** A write whose failure has nothing on screen to put back (bookkeeping, a term rename's second half):
 *  the failure is logged and toasted (audit H1), nothing else. Entity writes use `optimistic`. */
export const persist = (p: Promise<unknown>) => p.catch(reportSaveFailure);
/** The failure half every write shares: the Problems log (what is still there tomorrow) and a toast. */
export function reportSaveFailure(e: unknown) {
  if (isLostConnection(e)) {
    /* One lost connection fails every write that was queued behind it; logging each one made a single
       reboot look like 8 crashes (BUGS.md #11). One Problems entry per minute, and a sentence the owner
       can act on instead of the native call's name. */
    const now = Date.now();
    if (now - lostLoggedAt > 60_000) { lostLoggedAt = now; recordCrash(e, 'save', getState().route); }
    set({ toast: { id: now, text: "Couldn't save. Reconnecting to your data…" } });
    return;
  }
  recordCrash(e, 'save', getState().route);
  set({ toast: { id: Date.now(), text: `Couldn't save: ${saveCause(e)}` } });
}
let lostLoggedAt = 0;
/** The part of an error a person can read: the native `→ Caused by:` line when there is one (the first line
 *  is the bridge call's name), else the first line, capped so a toast stays one or two lines. */
export function saveCause(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  const caused = /(?:→|->)?\s*Caused by:\s*(.+)/.exec(msg)?.[1];
  const line = (caused ?? msg.split('\n')[0] ?? msg).trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}
/** Change the screen now, write, and put the screen back if the write is refused (F5, superseding
 *  DECISIONS D5(a)). Leaving the optimistic change in place meant the screen showed a row the disk never
 *  got — until the next launch quietly took it away. `revert` undoes only what `apply` did, row by row, so
 *  a later edit to another row is never rolled back with it. `write` is a thunk so a repository that is
 *  not open (a synchronous throw from `R()`) is the same failure as a rejected promise. */
export function optimistic(apply: () => void, write: () => Promise<unknown>, revert: () => void): Promise<void> {
  apply();
  let p: Promise<unknown>;
  try { p = write(); } catch (e) { p = Promise.reject(e); }
  return p.then(() => undefined, (e) => { revert(); reportSaveFailure(e); });
}
/** Every write goes through here. Throws a readable error instead of the old null-cast TypeError, which the fatal-error screen's only button used to swallow. */
export const R = (): Repository => {
  if (!db.repo) throw new Error('Database is not open: call hydrate() first, or act.resetAll() to re-open it.');
  return db.repo;
};
/** Re-open the repository if boot never got that far (App.tsx only hydrates after openRepository resolves). */
export async function ensureRepo(): Promise<Repository> { if (!db.repo) db.repo = await openRepository(); return R(); }
