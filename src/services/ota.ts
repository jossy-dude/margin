import { Platform } from 'react-native';
import { APP_VERSION } from '../domain/version';

/**
 * Over-the-air updates, kept total.
 *
 * The app is offline-first and SQLite is the only thing that must never be lost, so this module is
 * deliberately the dumbest possible skin over `expo-updates`: it can answer "is updating even on in
 * this build?", it can check and fetch, and it can reload. It never decides *when* to reload, and it
 * never throws — a browser build, a dev client with updates disabled, or a phone with no network all
 * get a sensible answer instead of an exception in the middle of a render.
 *
 * `expo-updates` is required lazily and inside a `try`. Its JS half resolves a NATIVE module while the
 * bundle is evaluating, so a build installed before this dependency existed (or a dev client without
 * it) would otherwise take the whole app down at import time instead of answering "unavailable". On
 * web the package does ship a stub, but that stub reports `isEnabled: true` and answers every check
 * with "no update", which would let About claim "you are on the newest version" in a browser that
 * cannot update at all — so the web gate is ours, made before the module is ever loaded.
 */

/** The slice of `expo-updates` this app actually uses. Typed by hand so the module can be absent. */
interface UpdatesModule {
  isEnabled?: boolean;
  runtimeVersion?: string | null;
  updateId?: string | null;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  fetchUpdateAsync(): Promise<{ isNew: boolean }>;
  reloadAsync(): Promise<void>;
}

/** What a check can say. `ready` means it is downloaded and will be used on the next reload. */
export type CheckResult = 'unavailable' | 'current' | 'ready' | 'error';

function updates(): UpdatesModule | null {
  if (Platform.OS === 'web') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- resolving a native module at import time would crash a build that predates `expo-updates`; lazy + try keeps every build usable, and the web gate above runs first.
  try { return require('expo-updates') as UpdatesModule; } catch { return null; }
}

/** Can this build update itself at all? False on web, and false when the build has updates switched off. */
export function otaAvailable(): boolean {
  const u = updates();
  if (!u) return false;
  try { return u.isEnabled !== false; } catch { return false; }
}

/** True only after THIS session downloaded an update it has not reloaded into yet. `ready` in the UI
 *  and this flag are set by the same successful fetch, so the Restart button cannot reload into a
 *  bundle nobody downloaded. */
let pending = false;

/** Check the channel once, without reloading: `ready` is a download waiting for the next launch. */
export async function checkForUpdate(): Promise<CheckResult> {
  const u = updates();
  if (!u || !otaAvailable()) return 'unavailable';
  try {
    const check = await u.checkForUpdateAsync();
    if (!check.isAvailable) { pending = false; return 'current'; }
    const fetched = await u.fetchUpdateAsync();
    pending = fetched.isNew;
    return fetched.isNew ? 'ready' : 'current';
  } catch { return 'error'; }
}

/** Reload into a downloaded update, and only then. Never called by itself — the user asks, because a
 *  reload in the middle of marking attendance would lose the gesture they were making. Best effort:
 *  a reload that the platform refuses leaves the app running and the update still pending. */
export async function applyUpdate(): Promise<void> {
  if (!pending || !otaAvailable()) return;
  pending = false;
  try { await updates()!.reloadAsync(); } catch { pending = true; }
}

/** The About line: the version this JS bundle was built as, the runtime it is allowed to run on, and
 *  whether it is the built-in one or an update someone published after. On web there is no runtime, so
 *  the line stays the plain version the app has always printed. */
export function versionLine(): string {
  const u = updates();
  if (!u) return `Margin ${APP_VERSION}`;
  const runtime = u.runtimeVersion ?? 'unknown';
  const id = u.updateId;
  return `Margin ${APP_VERSION} · runtime ${runtime} · ${id ? `update ${id.slice(0, 8)}` : 'built in'}`;
}
