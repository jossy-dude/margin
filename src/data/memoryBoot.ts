import { MemoryRepository } from './memory';
import { seedSnapshot } from './seed';
import type { Repository } from './repository';

/**
 * The browser's repository.
 *
 * The web build never loads `expo-sqlite` (Metro resolves `sqliteExpo.web.ts` to this path; the native
 * adapter's worker would pull in a `.wasm` that cannot resolve without extra Metro config), so the desktop surface runs on the `MemoryRepository` that
 * already exists in this codebase for its tests — seeded with the same `seedSnapshot()` the phone seeds
 * its SQLite file with. That is not a stub: it is the app's own second adapter behind the same
 * `Repository` port, which is the proof that nothing above the port depends on SQL.
 *
 * Two honest consequences, both of them the *design-only* state PRODUCT.md records:
 *
 *  · **Data does not persist across a reload.** A browser tab holds the snapshot in memory, so a
 *    refresh starts from the demo set again. Nothing is lost that was not already only in this tab.
 *  · **Nothing is transferred from the phone.** How a laptop reaches the phone's database is the open
 *    decision in PRODUCT.md, and this adapter is deliberately the seam it plugs into: swap this one
 *    function for one that fetches the phone's snapshot over the LAN and pushes writes back, and every
 *    screen, form and derivation above it is unchanged — because they only ever saw `Repository`.
 *
 * It lives beside `sqliteExpo.ts` rather than in `App.tsx` so the "only the adapter layer names a
 * repository" boundary that `.dependency-cruiser.cjs` draws stays true of the web build too.
 */
export async function openWebRepository(): Promise<Repository> {
  const repo = new MemoryRepository();
  const snap = await repo.load();
  if (!snap.settings.seededAt) await repo.seed(seedSnapshot());
  return repo;
}
