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
  syncPair(text: string): string;
  syncForget(): boolean;
  syncConfigure(vaultUri: string, vaultName: string): boolean;
  syncStart(): boolean;
  syncStatus(): string;
  syncPushBridge(json: string): boolean;
  syncTimer(json: string): boolean;
  syncInbox(): string;
  syncObsidianCode(): string;
  syncNetworks(): string;
  alarmRinging(): string;
  stopAlarm(): boolean;
  alarmTones(): string;
  alarmTone(): string;
  chooseAlarmTone(id: string): boolean;
  previewTone(id: string): boolean;
  stopPreview(): boolean;
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
export type WidgetKind = 'board';
/** Ask the launcher to add one of Margin's widgets. False when this launcher cannot be asked. */
export const pinWidget = (kind: WidgetKind) => safe((m) => m.pinWidget(kind), false);

/* ── sync with the desktop (v0.7, SYNC_ANDROID.md) ──────────────────────────────────────────────── */
/** What the sync service reports (Diagnostics → Sync, Settings → Sync). */
export interface SyncStatus {
  paired: boolean; state: 'off' | 'dormant' | 'ready' | 'live'; live: boolean; mode: string | null; obsidian: boolean; hotspot: boolean;
  deviceId: string; lastOk: number; cursor: number; outbox: number; presence: { deviceId: string; role: string; name?: string }[];
  lastError: string | null; vault: boolean; fast: boolean;
  stats: { day: string; liveMs: number; connects: number; catchups: number; rx: number; tx: number; err: number; lastErr: string | null }[];
}
const parse = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
/** Pair with the desktop from the hub's QR text. `null` on success, else a sentence; "" when there is no native half. */
export const syncPair = (text: string): string | null => { const r = safe<string | null>((m) => m.syncPair(text), 'This build cannot sync.'); return r === '' ? null : r; };
export const syncForget = () => safe((m) => m.syncForget(), false);
export const syncConfigure = (vaultUri: string | null, vaultName: string | null) => safe((m) => m.syncConfigure(vaultUri ?? '', vaultName ?? ''), false);
export const syncStart = () => safe((m) => m.syncStart(), false);
export const syncStatus = (): SyncStatus | null => parse<SyncStatus>(safe<string | null>((m) => m.syncStatus(), null));
export const syncPushBridge = (rows: unknown) => safe((m) => m.syncPushBridge(JSON.stringify(rows)), false);
export const syncTimer = (op: unknown) => safe((m) => m.syncTimer(JSON.stringify(op)), false);
/** Rows the service received while JS was not running; each is returned once. */
export const syncInbox = (): { kind: 'bridge' | 'timer'; json: string }[] => parse(safe<string | null>((m) => m.syncInbox(), null)) ?? [];
export const syncObsidianCode = () => safe<string | null>((m) => m.syncObsidianCode(), null);
export const syncNetworks = () => safe<string | null>((m) => m.syncNetworks(), null);

/** The alarm ringing now ('' = none) and a way to stop it from the app (test report #1). */
export const alarmRinging = () => safe<string>((m) => m.alarmRinging(), '');
export const stopAlarm = () => safe((m) => m.stopAlarm(), false);

/* ── alarm tones (v0.7 N6/R10) ───────────────────────────────────────────────────────────────────── */
export interface AlarmTone { id: string; title: string }
/** The phone's alarm tones ("default" first). Empty off Android. */
export const alarmTones = (): AlarmTone[] => parse<AlarmTone[]>(safe<string | null>((m) => m.alarmTones(), null)) ?? [];
export const alarmTone = () => safe<string>((m) => m.alarmTone(), 'default');
export const chooseAlarmTone = (id: string) => safe((m) => m.chooseAlarmTone(id), false);
/** Plays a tone inside the app for at most 10 s, ramping like the real alarm. Always stoppable with stopPreview. */
export const previewTone = (id: string) => safe((m) => m.previewTone(id), false);
export const stopPreview = () => safe((m) => m.stopPreview(), false);

/** Tests only: forget the resolved module so a mock installed later is picked up. */
export const resetNative = () => { resolved = undefined; };
