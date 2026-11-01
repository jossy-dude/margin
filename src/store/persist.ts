import type { Repository } from '../data/repository';
import { recordCrash } from '../services/problems';
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

/** Every failed write lands here. The toast is 2.6 s of the user's attention; the Problems log is what
 *  is still there tomorrow, so `persist` writes both (audit H1): a rejected `upsert` used to leave the
 *  optimistic row on screen with no trace anywhere once the toast had gone, and Diagnostics showed
 *  nothing at all. DECISIONS D5(a): the optimistic state is NOT rolled back — C1's serialised writes
 *  remove the failure reachable from ordinary use, and reverting can wait until a real failure is seen. */
export const persist = (p: Promise<unknown>) => p.catch((e) => {
  recordCrash(e, 'save', getState().route);
  set({ toast: { id: Date.now(), text: `Couldn't save: ${String((e as Error)?.message ?? e).slice(0, 60)}` } });
});
/** Every write goes through here. Throws a readable error instead of the old null-cast TypeError, which the fatal-error screen's only button used to swallow. */
export const R = (): Repository => {
  if (!db.repo) throw new Error('Database is not open: call hydrate() first, or act.resetAll() to re-open it.');
  return db.repo;
};
/** Re-open the repository if boot never got that far (App.tsx only hydrates after openRepository resolves). */
export async function ensureRepo(): Promise<Repository> { if (!db.repo) db.repo = await openRepository(); return R(); }
