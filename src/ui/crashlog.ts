import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';

/**
 * Dependency-free crash log. `@sentry/react-native` needs a config plugin and a development build, and this
 * project is Expo Go only, so it would be dead code. So: one JSONL file in the app's document directory
 * (survives cache eviction, wiped only by `pm clear`, exactly like the database). JSONL rather than a JSON
 * array because a record is only ever appended whole, so a crash *while writing* cannot corrupt the records
 * before it.
 *
 * Nothing in here may throw: it is called from an error boundary, where a second failure means a blank screen.
 */
export interface CrashEntry {
  id: string;
  /** epoch ms */
  at: number;
  /** `boot` = the failure happened before the Gate was ready, `runtime` = after */
  phase: 'boot' | 'runtime';
  /** the store's route at the time, or `unknown` */
  route: string;
  message: string;
  stack: string;
  /** `expo.version` from app.json */
  version: string;
  /** Expo SDK the bundle was built against */
  sdk: string;
}

const FILE = 'marginalia-crashes.jsonl';
/** Bounded: a crash loop must not be able to fill the user's storage. */
const MAX_ENTRIES = 50;
const MAX_BYTES = 256 * 1024;

export const appVersion = (): string => Constants.expoConfig?.version ?? 'unknown';
export const sdkVersion = (): string => Constants.expoConfig?.sdkVersion ?? 'unknown';

const file = () => new File(Paths.document, FILE);
const bytesOf = (list: CrashEntry[]) => list.reduce((n, e) => n + JSON.stringify(e).length + 1, 0);

/* The log is a file, i.e. an external store. `useSyncExternalStore` calls its `getSnapshot` on every
 * render of every subscriber — that is how it detects a change — so `crashCount` has to be O(1) or
 * the Settings hint re-reads and re-parsed the whole log on every keystroke in the name field. The
 * parse is therefore cached and invalidated whenever the file is written or deleted. */
let cache: CrashEntry[] | null = null;
const listeners = new Set<() => void>();
export function subscribeCrashes(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const notify = (): void => {
  cache = null;
  for (const cb of [...listeners]) cb();
};

/** Trim to the newest MAX_ENTRIES, and to MAX_BYTES by dropping the oldest, then rewrite. Runs after each
 *  append so a crash loop stays bounded without anyone opening Diagnostics. */
function trimAfterAppend(): void {
  try {
    const all = readCrashes().reverse(); // oldest first
    if (all.length <= MAX_ENTRIES && bytesOf(all) <= MAX_BYTES) return;
    let keep = all.slice(-MAX_ENTRIES);
    while (keep.length > 1 && bytesOf(keep) > MAX_BYTES) keep = keep.slice(0, -1);
    file().write(keep.map((e) => JSON.stringify(e)).join('\n') + (keep.length ? '\n' : ''));
  } catch { /* nothing sensible to do */ }
}

/** Append one crash. Returns the stored entry, or null if even the file could not be written. */
export function recordCrash(e: unknown, phase: 'boot' | 'runtime', route = 'unknown'): CrashEntry | null {
  const err = e instanceof Error ? e : new Error(String((e as { message?: unknown })?.message ?? e));
  const entry: CrashEntry = {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    at: Date.now(),
    phase,
    route,
    message: err.message || String(e),
    stack: typeof err.stack === 'string' ? err.stack : '(no stack)',
    version: appVersion(),
    sdk: sdkVersion(),
  };
  try {
    const f = file();
    if (!f.exists) f.create({ intermediates: true, overwrite: false });
    f.write(JSON.stringify(entry) + '\n', { append: true });
    cache = null; // the file moved on; the trim below must re-read it, and so must every subscriber
    trimAfterAppend();
    notify();
    return entry;
  } catch {
    return null;
  }
}

/** Newest first. Unparseable lines are skipped rather than thrown, so one damaged record cannot hide the rest.
 *  Parsed once and cached; `readCrashes()` hands back a copy so a caller can hold it in state. */
function parseLog(): CrashEntry[] {
  if (cache) return cache;
  try {
    const f = file();
    if (!f.exists) { cache = []; return cache; }
    const out: CrashEntry[] = [];
    for (const line of f.textSync().split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const v = JSON.parse(t) as CrashEntry;
        if (v && typeof v.message === 'string' && typeof v.at === 'number') out.push(v);
      } catch { /* skip a damaged line */ }
    }
    cache = out.reverse();
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}
export function readCrashes(): CrashEntry[] { return parseLog().slice(); }

export function crashCount(): number { return parseLog().length; }

export function clearCrashes(): void {
  try { const f = file(); if (f.exists) f.delete(); } catch { /* already gone */ }
  notify();
}

const when = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** The exact text one crash copies out as. Stable and greppable — this is what goes in a bug report. */
export function formatCrash(e: CrashEntry): string {
  return [`Marginalia crash — ${e.phase === 'boot' ? 'during boot' : 'while running'}`, `when:   ${when(e.at)}`, `route:  ${e.route}`, `app:    ${e.version} (Expo SDK ${e.sdk})`, `error:  ${e.message}`, '', e.stack].join('\n');
}

export function formatAllCrashes(list: CrashEntry[]): string {
  if (list.length === 0) return 'Marginalia: no crashes recorded.';
  return [`Marginalia crash log — ${list.length} entr${list.length === 1 ? 'y' : 'ies'} — app ${appVersion()} (Expo SDK ${sdkVersion()})`, ''].concat(list.map((e, i) => `${i + 1}. ${formatCrash(e)}`)).join('\n\n');
}

/** What the Diagnostics "Test the crash reporter" button runs: a real throw, caught on the spot, stored through
 *  exactly the path the boundary uses. The app keeps running — nothing here reaches React's error handling. */
export function testCrashReporter(route = 'diagnostics'): CrashEntry | null {
  try {
    throw new Error('Marginalia diagnostics: test crash. Nothing is broken — this line proves the reporter works.');
  } catch (e) {
    return recordCrash(e, 'runtime', route);
  }
}
