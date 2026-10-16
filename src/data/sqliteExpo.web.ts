import { openWebRepository } from './memoryBoot';
import type { Repository } from './repository';

/**
 * Web twin of `sqliteExpo.ts`.
 *
 * Metro resolves `.web.ts` first on the web platform, so the browser bundle never evaluates
 * `expo-sqlite` (whose web worker imports a `.wasm` Metro cannot resolve without extra config).
 * The desktop surface deliberately runs the same seeded MemoryRepository the tests use — see
 * `memoryBoot.ts` for the persistence trade and the LAN-sync seam.
 */
export async function openRepository(): Promise<Repository> {
  return openWebRepository();
}
