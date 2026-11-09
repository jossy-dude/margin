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
  setAgenda(json: string): number;
  nextAlarmAt(): number;
  canExactAlarm(): boolean;
  canFullScreen(): boolean;
  ringNow(label: string): boolean;
  openAlarmSettings(kind: string): boolean;
  hasWidgets(): boolean;
  pinWidget(kind: string): boolean;
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

/* ── the agenda: widgets, the pinned class, alarms (v0.7) ──────────────────────────────────────── */
/** Hand the phone the agenda (`domain/agenda.ts`, as JSON). It redraws the widgets and the pinned class and
 *  arms the next alarm; the answer is when that alarm rings (ms), 0 for none, and `null` when this build has
 *  no native half to hand it to (web, an older APK). */
export const setAgenda = (json: string) => safe<number | null>((m) => m.setAgenda(json), null);
export const nextAlarmAt = () => safe<number | null>((m) => m.nextAlarmAt() || null, null);
/** May this app set an alarm to the minute? Always true before Android 12. */
export const canExactAlarm = () => safe((m) => m.canExactAlarm(), false);
/** May a ringing alarm take over a locked screen? Android 14+ can withhold it. */
export const canFullScreen = () => safe((m) => m.canFullScreen(), false);
/** Ring now, exactly as a real alarm would. */
export const ringNow = (label: string) => safe((m) => m.ringNow(label), false);
export const openAlarmSettings = (kind: 'exact' | 'fullscreen' | 'app') => safe((m) => m.openAlarmSettings(kind), false);
export const hasWidgets = () => safe((m) => m.hasWidgets(), false);
export type WidgetKind = 'next' | 'today' | 'tasks';
/** Ask the launcher to add one of Margin's widgets. False when this launcher cannot be asked. */
export const pinWidget = (kind: WidgetKind) => safe((m) => m.pinWidget(kind), false);

/** Tests only: forget the resolved module so a mock installed later is picked up. */
export const resetNative = () => { resolved = undefined; };
