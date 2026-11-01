import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * Margin's own Android module (`modules/margin-native`), seen from JS.
 *
 * Every call is total: off Android, on web, in a build that predates the module, or when the platform
 * refuses, it answers `false` / `null` instead of throwing — the callers (the live countdown, the Focus
 * silent switch) turn that answer into an honest sentence, never a crash. The module is resolved on first
 * use, not at import, so importing this file costs nothing at startup.
 */
interface MarginNative {
  sdkInt(): number;
  canPromote(): boolean;
  showLive(id: string, title: string, text: string, endAt: number, link: string): boolean;
  hideLive(id: string): boolean;
  wasDismissed(id: string): boolean;
  hasPolicyAccess(): boolean;
  interruptionFilter(): number;
  silence(): boolean;
  restore(previous: number): boolean;
  openPolicySettings(): boolean;
}

let resolved: MarginNative | null | undefined;
function mod(): MarginNative | null {
  if (resolved !== undefined) return resolved;
  resolved = Platform.OS === 'android' ? requireOptionalNativeModule<MarginNative>('MarginNative') : null;
  return resolved;
}
const safe = <T,>(f: (m: MarginNative) => T, dflt: T): T => { const m = mod(); if (!m) return dflt; try { return f(m); } catch { return dflt; } };

/** Is the module in this build at all? */
export const nativeAvailable = () => mod() !== null;
export const sdkInt = () => safe((m) => m.sdkInt(), 0);

/* ── the pinned live countdown ─────────────────────────────────────────────────────────────────── */
/** Android 16's Live Updates: may this app's ongoing countdown be promoted to the status-bar chip? */
export const canPromote = () => safe((m) => m.canPromote(), false);
/** Post (or refresh) the countdown. False when it was not posted: no module, no permission, the end has
 *  passed, or the person swiped this one away already. */
export const showLive = (id: string, title: string, text: string, endAt: number, link: string) => safe((m) => m.showLive(id, title, text, endAt, link), false);
export const hideLive = (id: string) => safe((m) => m.hideLive(id), false);
export const liveDismissed = (id: string) => safe((m) => m.wasDismissed(id), false);

/* ── Do Not Disturb for a focus session ────────────────────────────────────────────────────────── */
export const hasPolicyAccess = () => safe((m) => m.hasPolicyAccess(), false);
/** The current interruption filter (Android's constant), or `null` when it cannot be read. */
export const interruptionFilter = () => safe<number | null>((m) => m.interruptionFilter(), null);
export const silence = () => safe((m) => m.silence(), false);
export const restoreFilter = (previous: number) => safe((m) => m.restore(previous), false);
export const openPolicySettings = () => safe((m) => m.openPolicySettings(), false);

/** Tests only: forget the resolved module so a mock installed later is picked up. */
export const resetNative = () => { resolved = undefined; };
