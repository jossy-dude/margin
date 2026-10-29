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
 *
 * v0.9 adds the loop around it: a throttled check on foreground resume, and a one-shot sentence on
 * the launch after an update was actually applied. Neither changes the answers above; they compose
 * them.
 */

/** The slice of `expo-updates` this app actually uses. Typed by hand so the module can be absent. */
interface UpdatesModule {
  isEnabled?: boolean;
  runtimeVersion?: string | null;
  updateId?: string | null;
  checkForUpdateAsync(): Promise<{ isAvailable: boolean }>;
  /** `manifest.id` is the update's own identity. It is the only version-ish fact available BEFORE
   *  the new bundle runs, which is why the applied marker stores it (see `APPLIED_VERSION_KEY`). */
  fetchUpdateAsync(): Promise<{ isNew: boolean; manifest?: { id?: string } }>;
  reloadAsync(): Promise<void>;
}

/** What a check can say. `ready` means it is downloaded and will be used on the next reload. */
export type CheckResult = 'unavailable' | 'current' | 'ready' | 'error';

/** What a foreground check can say: every answer above, plus the no-op the throttle takes. */
export type OtaStatus = CheckResult | 'throttled';

/** The key-value store the loop needs. The phone's `setting` table is exactly this, but `services/`
 *  must not import the store or an adapter (that would be a cycle: the store imports this file to
 *  wire the lifecycle), so the two calls are a port the store binds once. */
export interface OtaKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
}

/** KV key for "an update was downloaded and this launch is the one that should say so".
 *
 *  **Why the value is an update id and not `APP_VERSION`.** The sentence has to prove that the bundle
 *  which was downloaded is the bundle now running. `APP_VERSION` is a constant compiled into the JS
 *  bundle, so the version of an update that is NOT running cannot be read — not from the manifest
 *  (EAS manifests carry no app version) and not from the running module. The update id is the one
 *  identity both sides have: `fetchUpdateAsync().manifest.id` before the reload, `updateId` after it.
 *  `updateId` is also what About already prints as "update 3f9a1c2e", so this is the app's existing
 *  notion of which bundle is running, not a new one. */
export const APPLIED_VERSION_KEY = 'lastAppliedVersion';

/** An in-memory fallback so the module is usable (and testable) before the store has bound anything.
 *  A launch that never binds it simply never persists a marker — no update loop requires it to. */
const memoryKv = (): OtaKv => {
  const m = new Map<string, string>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => { if (v === null) m.delete(k); else m.set(k, v); } };
};
let kv: OtaKv = memoryKv();

/** Wire (or, with `null`, unwire) the app's key-value store. Called by the store once, at module
 *  load, with an adapter over the open repository. */
export function bindOtaKv(next: OtaKv | null): void { kv = next ?? memoryKv(); }

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

/** Record the downloaded update so the NEXT launch can say it landed.
 *
 *  Written at fetch-success rather than at the restart tap on purpose: `expo-updates` runs a downloaded
 *  update on the next launch even if the user never taps "Update now", so the launch that should be
 *  announced is the launch that actually applies it. A failed KV write is not a failed download and is
 *  swallowed — the worst outcome is a missing sentence, never an update reported as broken. */
async function rememberApplied(id: string | undefined) {
  if (!id) return;
  try { await kv.set(APPLIED_VERSION_KEY, id); } catch { /* bookkeeping only */ }
}

/** Check the channel once, without reloading: `ready` is a download waiting for the next launch. */
export async function checkForUpdate(): Promise<CheckResult> {
  const u = updates();
  if (!u || !otaAvailable()) return 'unavailable';
  try {
    const check = await u.checkForUpdateAsync();
    if (!check.isAvailable) { pending = false; return 'current'; }
    const fetched = await u.fetchUpdateAsync();
    pending = fetched.isNew;
    if (!fetched.isNew) return 'current';
    await rememberApplied(fetched.manifest?.id);
    return 'ready';
  } catch { return 'error'; }
}

/** The foreground path: called from the app's resume listener and once after boot.
 *
 *  Throttled to one real round-trip per window (five minutes by default) because a resume happens every
 *  time the user glances at the phone, and updates are rate-limited server-side. The timestamp is taken
 *  BEFORE the await, so a second resume while the first check is in flight is a no-op instead of a
 *  second request. Every outcome is a value, never a throw: the call site is a lifecycle listener with
 *  no catch of its own, and it must never hold up the first frame. */
let lastCheckAt = Number.NEGATIVE_INFINITY;
export async function checkOnForeground(throttleMs = 300_000): Promise<OtaStatus> {
  try {
    if (!otaAvailable()) return 'unavailable';
    const now = Date.now();
    if (now - lastCheckAt < throttleMs) return 'throttled';
    lastCheckAt = now;
    return await checkForUpdate();
  } catch { return 'error'; }
}

/** Forget the throttle and the pending flag. Only tests need this: a real launch starts with both
 *  empty because the JS module is evaluated afresh. */
export function resetOtaState(): void { lastCheckAt = Number.NEGATIVE_INFINITY; pending = false; }

/** Reload into a downloaded update, and only then. Never called by itself — the user asks, because a
 *  reload in the middle of marking attendance would lose the gesture they were making. Best effort:
 *  a reload that the platform refuses leaves the app running and the update still pending. */
export async function applyUpdate(): Promise<void> {
  if (!pending || !otaAvailable()) return;
  pending = false;
  try { await updates()!.reloadAsync(); } catch { pending = true; }
}

/** The launch-after sentence, or `null`.
 *
 *  Fires only when the applied marker names the bundle that is running right now, then consumes the
 *  marker before returning, so one applied update is announced exactly once — never on the launch that
 *  downloaded it, never twice, and never when the reload was refused and the old bundle came back.
 *  `APP_VERSION` in the sentence is read from the running bundle, which is precisely why it is the new
 *  number: it is the bundle that was applied. Total like everything else here. */
export async function announceAppliedUpdate(): Promise<string | null> {
  if (!otaAvailable()) return null;
  try {
    const applied = await kv.get(APPLIED_VERSION_KEY);
    if (!applied) return null;
    const running = updates()?.updateId ?? null;
    if (!running || running !== applied) return null;
    try { await kv.set(APPLIED_VERSION_KEY, null); } catch { /* repeats next launch rather than losing the sentence */ }
    return `You’re now on Margin ${APP_VERSION}`;
  } catch { return null; }
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
