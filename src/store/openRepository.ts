import type { Repository } from '../data/repository';
import { openRepository as openAdapter } from '../data/sqliteExpo';
import { recordCrash } from '../services/problems';
import { dumpBeforeMigration } from '../services/safety';

/**
 * The one place the on-device repository is wired to the layers above `src/data`. The adapter may not
 * import services (depcruise `data-not-up`), so the pre-migration safety copy and the Problems log are
 * handed to it here. The store opens the repository through this, never through `data/sqliteExpo`.
 *
 * On the web Metro resolves `data/sqliteExpo` to its `.web.ts` twin, which ignores both.
 */
export const openRepository = (): Promise<Repository> => openAdapter({ beforeMigration: dumpBeforeMigration, report: recordCrash });
