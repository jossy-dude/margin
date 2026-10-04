import { openDatabaseAsync } from 'expo-sqlite';
import { SqliteRepository, type SqlDb } from './sqlite';
import { seedSnapshot } from './seed';
import type { Repository } from './repository';

/** Opens the on-device database, migrates it, and seeds the demo set exactly once. */
export async function openRepository(): Promise<Repository> {
  const db = await openDatabaseAsync('marginalia.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const sql: SqlDb = {
    execAsync: (s) => db.execAsync(s),
    runAsync: (s, p = []) => db.runAsync(s, p),
    getAllAsync: <T,>(s: string, p: (string | number | null)[] = []) => db.getAllAsync<T>(s, p),
    withTransactionAsync: (fn) => db.withTransactionAsync(fn),
  };
  const repo = new SqliteRepository(sql);
  await repo.init();
  const snap = await repo.load();
  if (!snap.settings.seededAt) await repo.seed(seedSnapshot());
  return repo;
}
