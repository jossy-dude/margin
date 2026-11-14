import { toJson } from '../services/export';
import { backupDue, runBackup, safFolder, type FolderPort } from '../services/backup';
import { getState, snapshotOf } from './core';
import { loadSemesters } from './semesters';
import { setSettings } from './actions/entities';

let running = false;
/** v0.7 R12: when a backup folder is set and the last backup is a week old (or there is none), write one. True when
 *  a file was written. A failed write is not remembered, so the next start or return to the app tries again. */
export async function maybeBackup(now = Date.now(), port: FolderPort = safFolder): Promise<boolean> {
  const s = getState().settings;
  if (running || !getState().ready || !s.backupUri || !backupDue(s.backupAt, now)) return false;
  running = true;
  try {
    await loadSemesters();
    await runBackup(s.backupUri, toJson(snapshotOf(getState()), now, getState().semesters), now, port);
    setSettings({ backupAt: now });
    return true;
  } catch { return false; } finally { running = false; }
}
/** "Back up now": the same, whatever the date. */
export const backupNow = (now = Date.now(), port: FolderPort = safFolder) => { const at = getState().settings.backupAt; if (at) setSettings({ backupAt: null }); return maybeBackup(now, port).then((ok) => { if (!ok && at) setSettings({ backupAt: at }); return ok; }); };
