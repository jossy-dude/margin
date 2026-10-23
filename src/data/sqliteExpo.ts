import { openDatabaseAsync, deleteDatabaseAsync } from 'expo-sqlite';
import { SqliteRepository, type SqlDb } from './sqlite';
import type { Repository } from './repository';
import { MIGRATIONS } from './specs';
import { dumpBeforeMigration } from '../services/safety';

/** Opens the on-device database and migrates it. Nothing is seeded here: a fresh install is an EMPTY
 *  database, and the sample semester the tour walks through lives in memory only (see the store).
 *
 *  The safety copy is read BEFORE `init()` runs any pending DDL. Reading `user_version` here rather than
 *  inside the adapter keeps the pre-migration state available to a module that does not import
 *  expo-sqlite, and a failed copy is swallowed by `dumpBeforeMigration` — the migration always runs. */
export async function openRepository(): Promise<Repository> {
  const db = await openDatabaseAsync('marginalia.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const sql: SqlDb = {
    execAsync: (s) => db.execAsync(s),
    runAsync: (s, p = []) => db.runAsync(s, p),
    getAllAsync: <T,>(s: string, p: (string | number | null)[] = []) => db.getAllAsync<T>(s, p),
    withTransactionAsync: (fn) => db.withTransactionAsync(fn),
    /* The full reset deletes the FILE (close first, then the database row file; expo-sqlite removes
       the -wal/-shm siblings with it), so "Erase everything" can be exactly that. */
    closeAndDelete: async () => { await db.closeAsync(); await deleteDatabaseAsync('marginalia.db'); },
  };
  const from = (await db.getAllAsync<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0;
  if (from < MIGRATIONS.length) {
    await dumpBeforeMigration((s) => db.getAllAsync<Record<string, unknown>>(s), from, MIGRATIONS.length);
  }
  const repo = new SqliteRepository(sql);
  await repo.init();
  return repo;
}
