import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { pad, ymd } from '../domain/time';
import { recordCrash } from './problems';

/**
 * Pre-migration safety copies.
 *
 * A migration is the one moment the app rewrites the shape of the user's only file. The versioned DDL in
 * `data/specs.ts` is careful, but careful is not the same as reversible: a bug in one `ALTER`, a phone
 * that dies halfway, and the term is gone with no export having been made. So before `init()` runs a
 * pending migration, every user table is written out as one JSON file under the document directory,
 * and the newest three are kept.
 *
 * Everything that can be decided without touching a filesystem — the file name, whether a copy is due,
 * which old copies to drop, and the payload's shape — is pure and unit-tested. The I/O itself is the
 * thin layer below it, and it never throws: a backup that cannot be written must not stop the app from
 * opening, so a failure is logged to the Problems log and boot continues.
 */
export interface SafetyDump {
  app: 'margin';
  kind: 'pre-migration';
  from: number;
  to: number;
  at: number;
  tables: Record<string, unknown[]>;
}
export interface SafetyInfo {
  /** The backup folder could be read. `false` is also the answer on the web and in jest, where there is
   *  no document directory at all — the UI says "not on web" from `Platform.OS`, not from this. */
  available: boolean;
  count: number;
  /** When the newest copy was written, from the stamp in its own name — not `creationTime`, which a
   *  copied or restored file does not preserve. */
  newest: number | null;
  newestName: string | null;
}
const EMPTY: SafetyInfo = { available: false, count: 0, newest: null, newestName: null };

/** `pre-migration-2-to-3-20261023-141205.json`, in the app's own `YYYYMMDD-HHMMSS` local stamp. */
export function dumpName(from: number, to: number, at: number): string {
  const d = new Date(at);
  return `pre-migration-${from}-to-${to}-${ymd(d).replace(/-/g, '')}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
}

/** A copy is due exactly when the database is behind the code. Equal versions mean `init()` has no DDL
 *  to run, and a newer database (a downgrade) is not something this build should touch or back up. */
export const shouldBackup = (from: number, to: number): boolean =>
  Number.isInteger(from) && Number.isInteger(to) && from < to;

/**
 * Which names to delete, given the folder's copies already newest-first.
 *
 * `keep` is a floor of one: the cap exists to stop the folder growing forever, not to delete the copy
 * that was just written. A `keep` of 0 or a negative number is treated as 1 for the same reason.
 */
export function keepNewest(namesNewestFirst: readonly string[], keep = 3): string[] {
  return namesNewestFirst.slice(Math.max(1, Math.floor(keep)));
}

/** The file's contents. Table names are read from `sqlite_master`, so the payload is the database's own
 *  answer to "what exists", not a list in this file that can fall behind a migration. */
export function dumpPayload(from: number, to: number, at: number, tables: Record<string, unknown[]>): SafetyDump {
  return { app: 'margin', kind: 'pre-migration', from, to, at, tables };
}

const STAMP = /(\d{8}-\d{6})\.json$/;
const isDump = (name: string) => name.startsWith('pre-migration-') && STAMP.test(name);
const stampOf = (name: string) => STAMP.exec(name)?.[1] ?? '';
/** Newest first by the stamp inside the name. A name with no stamp sorts last rather than throwing. */
const newestFirst = (names: readonly string[]): string[] =>
  [...names].sort((a, b) => stampOf(b).localeCompare(stampOf(a)) || b.localeCompare(a));

function stampMs(name: string): number | null {
  const m = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(stampOf(name));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/** `Paths.document/marginalia/backups`. Built per call: a `Directory` is a cheap handle, and holding one
 *  across a document-directory change (a restore, a reinstall) would point at the old place. */
const backups = () => new Directory(Paths.document, 'marginalia', 'backups');
const namesIn = (dir: Directory): string[] => dir.list().map((e) => e.name).filter((n) => isDump(n));

/** Drop everything past the newest three, best-effort. A copy that will not delete must not fail the
 *  one that was just written, so each delete is its own `try`. */
function prune(dir: Directory): void {
  try {
    for (const name of keepNewest(newestFirst(namesIn(dir)))) {
      try { new File(dir, name).delete(); } catch { /* the next boot tries again */ }
    }
  } catch { /* listing is best-effort too */ }
}

/**
 * Write the safety copy if one is due, and return its name (or `null` when nothing was written).
 *
 * `read` is the caller's SQL reader — the Expo adapter passes `db.getAllAsync`, the test passes a plain
 * function — so this module needs no database import and can be exercised without expo-sqlite. A fresh
 * database has no user tables yet; there is nothing to preserve, and an empty dump is not written.
 */
export async function dumpBeforeMigration(
  read: (sql: string) => Promise<Record<string, unknown>[]>,
  from: number,
  to: number,
): Promise<string | null> {
  if (!shouldBackup(from, to)) return null;
  try {
    const found = await read("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
    const tables: Record<string, unknown[]> = {};
    for (const row of found) {
      const name = typeof row.name === 'string' ? row.name : '';
      if (!name) continue;
      // The name comes from sqlite_master rather than from input; the quote doubling is belt and braces
      // for a table somebody created by hand with a quote in its name.
      tables[name] = await read(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
    }
    if (Object.keys(tables).length === 0) return null;
    const at = Date.now(), dir = backups();
    dir.create({ intermediates: true, idempotent: true });
    /* Written beside its final name and renamed into place, so a kill or a full disk mid-write leaves a
       `.tmp` the listing ignores — never a truncated copy that looks like a good one. */
    const name = dumpName(from, to, at), tmp = new File(dir, `${name}.tmp`);
    tmp.create({ overwrite: true });
    tmp.write(JSON.stringify(dumpPayload(from, to, at, tables)));
    tmp.rename(name);
    prune(dir);
    return name;
  } catch (e) {
    /* No copy, no migration: the copy exists for the one moment a migration could go wrong, so running
       the migration without it is the risk this file was written to remove. Boot stops with a sentence
       and a retry; nothing in the database has been touched yet. */
    recordCrash(e, 'boot', 'safety copy');
    throw new Error(`Couldn't make the safety copy before updating your data (${String((e as Error)?.message ?? e).slice(0, 80)}). Nothing was changed — free some storage and try again.`);
  }
}

/** What Settings → Data prints. Never throws: the web build and jest have no document directory, and a
 *  settings page must not fail because a backup folder is missing. */
export function safetyInfo(): SafetyInfo {
  try {
    const dir = backups();
    if (!dir.exists) return EMPTY;
    const names = newestFirst(namesIn(dir));
    if (names.length === 0) return { ...EMPTY, available: true };
    return { available: true, count: names.length, newest: stampMs(names[0] as string), newestName: names[0] as string };
  } catch { return EMPTY; }
}

/** Hand the newest copy to the system share sheet, the way `exportFile.runExport` does. */
export async function shareNewestSafetyCopy(): Promise<boolean> {
  try {
    const info = safetyInfo();
    if (!info.newestName) return false;
    const file = new File(backups(), info.newestName);
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: info.newestName });
    return true;
  } catch (e) {
    recordCrash(e, 'runtime', 'share safety copy');
    return false;
  }
}
