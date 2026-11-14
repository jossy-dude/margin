/**
 * v0.7 R12 — the automatic weekly backup (DATA_MODEL.md "Never again"). Once a week Margin writes
 * `margin-backup-<date>.json`, the same `margin/2` file Export writes, into a folder the owner picked once, and keeps
 * the newest four. Onboarding's "Bring my data back" (R11) reads it back. The folder is reached through a port, so
 * the rolling logic is tested without the Storage Access Framework.
 */
import { ymd } from '../domain/time';
import { deleteDocument, listFolder, writeFolderFile } from './vaultFiles';

export const BACKUP_KEEP = 4;
const WEEK = 7 * 86_400_000;
const NAME = /^margin-backup-\d{4}-\d{2}-\d{2}\.json$/;

export const backupName = (now: number) => `margin-backup-${ymd(new Date(now))}.json`;
export const isBackupName = (name: string) => NAME.test(name);
/** Due with no backup yet, or a week after the last one. */
export const backupDue = (lastAt: number | null | undefined, now: number) => !lastAt || now - lastAt >= WEEK;

export interface FolderPort {
  list(dir: string): Promise<{ name: string; uri: string }[]>;
  write(dir: string, name: string, text: string): Promise<void>;
  remove(uri: string): Promise<void>;
}
export const safFolder: FolderPort = { list: listFolder, write: (dir, name, text) => writeFolderFile(dir, name, text), remove: deleteDocument };

/** Writes today's backup (replacing today's if there is one), then removes all but the newest `BACKUP_KEEP`
 *  backups. Other files in the folder are never touched. Throws when the write fails; pruning is best effort. */
export async function runBackup(dir: string, text: string, now: number, port: FolderPort = safFolder): Promise<{ name: string; dropped: string[] }> {
  const name = backupName(now);
  await port.write(dir, name, text);
  const mine = (await port.list(dir)).filter((f) => isBackupName(f.name)).sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  const seen = new Set<string>(), keep: typeof mine = [], drop: typeof mine = [];
  for (const f of mine) { if (!seen.has(f.name) && keep.length < BACKUP_KEEP) { keep.push(f); seen.add(f.name); } else drop.push(f); }
  const dropped: string[] = [];
  for (const f of drop) { try { await port.remove(f.uri); dropped.push(f.name); } catch { /* the next run tries again */ } }
  return { name, dropped };
}

