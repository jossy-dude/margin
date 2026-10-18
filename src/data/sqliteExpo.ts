import { openDatabaseAsync, deleteDatabaseAsync } from 'expo-sqlite';
import { SqliteRepository, type SqlDb } from './sqlite';
import type { Repository } from './repository';

/** Opens the on-device database and migrates it. Nothing is seeded here: a fresh install is an EMPTY
 *  database, and the sample semester the tour walks through lives in memory only (see the store). */
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
  const repo = new SqliteRepository(sql);
  await repo.init();
  return repo;
}
