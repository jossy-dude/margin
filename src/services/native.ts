import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { SyncHold } from '../domain/syncHold';
import type { SyncError } from '../domain/syncView';

/**
 * Margin's own Android module (`modules/margin-native`), seen from JS.
 *
 * Every call is total: off Android, on web, in a build that predates the module, or when the platform
 * refuses, it answers `false` / `null` instead of throwing — the callers (the live countdown, the alarm
 * page, the sync page) turn that answer into an honest sentence, never a crash. The module is resolved on first
 * use, not at import, so importing this file costs nothing at startup.
 */
interface MarginNative {
  showLive(id: string, title: string, text: string, endAt: number, link: string): boolean;
  hideLive(id: string): boolean;
  setAgenda(json: string): number;
  canExactAlarm(): boolean;
  canFullScreen(): boolean;
  ringNow(label: string): boolean;
  openAlarmSettings(kind: string): boolean;
  pinWidget(kind: string): boolean;
  syncPair(text: string): string;
  syncForget(): boolean;
  syncConfigure(vaultUri: string, vaultName: string): boolean;
  syncStart(): boolean;
  syncStatus(): string;
  syncTimer(json: string): boolean;
  syncNow(): boolean;
  syncClearErrors(): boolean;
  syncDismissError(at: number): boolean;
  syncHold(op: string): boolean;
  syncInbox(): string;
  setLook(json: string): boolean;
  splashDone(): boolean;
  scanQr(): Promise<string>;
  widgetTicks(): string;
  fontsEmbedded(): boolean;
  syncEvents(): string;
  vaultFiles(known: string, only: string): Promise<string>;
  vaultEdit(path: string, expect: string, text: string): Promise<string>;
  vaultChanges(): string;
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

/* ── the pinned live countdown ─────────────────────────────────────────────────────────────────── */
/** Post (or refresh) the countdown. False when it was not posted: no module, no permission, the end has
 *  passed, or the person swiped this one away already. */
export const showLive = (id: string, title: string, text: string, endAt: number, link: string) => safe((m) => m.showLive(id, title, text, endAt, link), false);
export const hideLive = (id: string) => safe((m) => m.hideLive(id), false);

/* ── the agenda: widgets, the pinned class, alarms (v0.7) ──────────────────────────────────────── */
/** Hand the phone the agenda (`domain/agenda.ts`, as JSON). It redraws the widgets and the pinned class and
 *  arms the next alarm; the answer is when that alarm rings (ms), 0 for none, and `null` when this build has
 *  no native half to hand it to (web, an older APK). */
export const setAgenda = (json: string) => safe<number | null>((m) => m.setAgenda(json), null);
/** May this app set an alarm to the minute? Always true before Android 12. */
export const canExactAlarm = () => safe((m) => m.canExactAlarm(), false);
/** May a ringing alarm take over a locked screen? Android 14+ can withhold it. */
export const canFullScreen = () => safe((m) => m.canFullScreen(), false);
/** Ring now, exactly as a real alarm would. */
export const ringNow = (label: string) => safe((m) => m.ringNow(label), false);
export const openAlarmSettings = (kind: 'exact' | 'fullscreen' | 'app') => safe((m) => m.openAlarmSettings(kind), false);
/** Task ids ticked on the home-screen widget since the last call (v0.8 §4.3). */
export const widgetTicks = (): string[] => parse<string[]>(safe<string | null>((m) => m.widgetTicks(), null)) ?? [];
export type WidgetKind = 'now' | 'class' | 'tasks'; // Glance widgets (v0.7.7.7–.9)
/** Ask the launcher to add one of Margin's widgets. False when this launcher cannot be asked. */
export const pinWidget = (kind: WidgetKind) => safe((m) => m.pinWidget(kind), false);

/* ── sync with the desktop (v0.7, SYNC_ANDROID.md) ──────────────────────────────────────────────── */
/** What the sync service reports (Diagnostics → Sync, Settings → Sync). */
export interface SyncStatus {
  paired: boolean; state: 'off' | 'dormant' | 'ready' | 'live'; live: boolean; mode: string | null; obsidian: boolean; hotspot: boolean;
  deviceId: string; lastOk: number; cursor: number; outbox: number; presence: { deviceId: string; role: string; name?: string }[];
  lastError: string | null; vault: boolean; fast: boolean;
  /** v0.7.1: newest first, last 20; absent on older builds */
  errors?: SyncError[];
  /** hub clock − phone clock, ms (timer maths) */
  offset?: number; hubOnline?: boolean;
  scanAt?: number; scanMs?: number; scanFiles?: number; pushedAt?: number; sending?: number;
  /** v0.7.1: a big delete stopped sync until the owner chooses (here, on the desktop, or in phone Obsidian) */
  hold?: SyncHold | null;
  /** v0.8: the path in use ("Wi-Fi", "Phone hotspot", "Tailscale"), the desktop's address, what is happening now
   *  and how far, changes still to come, and changes that could not land (with why). */
  path?: string | null; addr?: string | null; lastPath?: string | null; lastAddr?: string | null; dialing?: boolean; head?: number;
  stage?: string; stageDone?: number; stageOf?: number; pending?: number; skipped?: { p: string; seq: number; reason: string; at: number }[];
  vaultName?: string | null;
  stats: { day: string; liveMs: number; connects: number; catchups: number; rx: number; tx: number; err: number; lastErr: string | null }[];
}
export type { SyncHold };
const parse = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
/** Pair with the desktop from the hub's QR text. `null` on success, else a sentence; "" when there is no native half. */
export const syncPair = (text: string): string | null => { const r = safe<string | null>((m) => m.syncPair(text), 'This build cannot sync.'); return r === '' ? null : r; };
export const syncForget = () => safe((m) => m.syncForget(), false);
export const syncConfigure = (vaultUri: string | null, vaultName: string | null) => safe((m) => m.syncConfigure(vaultUri ?? '', vaultName ?? ''), false);
export const syncStart = () => safe((m) => m.syncStart(), false);
export const syncStatus = (): SyncStatus | null => parse<SyncStatus>(safe<string | null>((m) => m.syncStatus(), null));
export const syncTimer = (op: unknown) => safe((m) => m.syncTimer(JSON.stringify(op)), false);
/** Events from the sync service (Expo module events). Returns the unsubscribe; a no-op without the native half. */
export function onSyncEvent(name: 'onSyncTimer' | 'onSyncStatus' | 'onVaultChanged', fn: (json: string) => void): () => void {
  const m = mod() as unknown as { addListener?: (n: string, f: (e: { json: string }) => void) => { remove(): void } } | null;
  if (!m?.addListener) return () => {};
  try { const sub = m.addListener(name, (e) => { try { fn(e.json); } catch { /* a bad frame must not break the app */ } }); return () => sub.remove(); } catch { return () => {}; }
}
/** Send the phone vault's changes now; false on builds before 0.7.1. */
export const syncNow = () => safe((m) => m.syncNow(), false);
export const syncClearErrors = () => safe((m) => m.syncClearErrors(), false);
/** Hide one card on the "What went wrong" page (a clash you have looked at). */
export const syncDismissError = (at: number) => safe((m) => m.syncDismissError(at), false);
/** Answer the big-delete question: apply = delete everywhere, cancel = keep the files. */
export const syncHold = (op: 'apply' | 'cancel') => safe((m) => m.syncHold(op), false);
/** Rows the service received while JS was not running; each is returned once. */
export const syncInbox = (): { kind: 'bridge' | 'timer'; json: string }[] => parse(safe<string | null>((m) => m.syncInbox(), null)) ?? [];

/* ── the look outside the app (v0.8): splash, widget and alarm page follow the skin ── */
export const setLook = (look: Record<string, string>) => safe((m) => m.setLook(JSON.stringify(look)), false);
/** v0.7.7 (SPEC §6): Today's first frame is up, so MainActivity lets the system splash go (2 s failsafe there). */
export const splashDone = () => safe((m) => m.splashDone(), false);
/** The APK carries the font files (v0.8 §2.2): no runtime load. False in Expo Go and older builds. */
export const fontsEmbedded = () => safe((m) => m.fontsEmbedded(), false);

/* ── the vault, through Margin's one phone writer (v0.8 §1.5) ──────────────────────────────────────── */
export interface SyncEvent { at: number; kind: string; msg: string }
/** Scan a QR code with Google's scanner: the text, '' when cancelled, or 'error:…'. */
export async function scanQr(): Promise<string> { const m = mod(); if (!m) return 'error:This build cannot scan.'; try { return await m.scanQr(); } catch (e) { return `error:${String((e as Error)?.message ?? e)}`; } }
export const syncEvents = (): SyncEvent[] => parse<SyncEvent[]>(safe<string | null>((m) => m.syncEvents(), null)) ?? [];
export interface VaultFile { p: string; h: string; text?: string }
/** Notes for the task parser; text only for those whose hash differs from `known`. Null without a native half. */
export async function vaultFiles(known: Record<string, string>, only: string[] = []): Promise<{ files: VaultFile[]; gone: string[]; error?: string } | null> {
  const m = mod(); if (!m) return null;
  try { return JSON.parse(await m.vaultFiles(JSON.stringify(known), JSON.stringify(only))) as { files: VaultFile[]; gone: string[]; error?: string }; } catch { return null; }
}
/** Compare-and-swap write: "ok:<h>" | "changed:<h>" | "deferred" | "error:<why>". */
export async function vaultEdit(path: string, expect: string, text: string): Promise<string> { const m = mod(); if (!m) return 'error:no native half'; try { return await m.vaultEdit(path, expect, text); } catch (e) { return `error:${String((e as Error)?.message ?? e)}`; } }
export const vaultChanges = (): string[] => parse<string[]>(safe<string | null>((m) => m.vaultChanges(), null)) ?? [];

/** The alarm ringing now ('' = none) and a way to stop it from the app (test report #1). */
export const alarmRinging = () => safe<string>((m) => m.alarmRinging(), '');
export const stopAlarm = () => safe((m) => m.stopAlarm(), false);

/* ── alarm tones (v0.7 N6/R10) ───────────────────────────────────────────────────────────────────── */
export interface AlarmTone { id: string; title: string; /** v0.7: Margin's bundled tones, or the phone's own */ kind?: 'margin' | 'phone' }
/** Margin's bundled tones, then the phone's ("default" first). Empty off Android and in Expo Go. */
export const alarmTones = (): AlarmTone[] => parse<AlarmTone[]>(safe<string | null>((m) => m.alarmTones(), null)) ?? [];
export const alarmTone = () => safe<string>((m) => m.alarmTone(), 'default');
export const chooseAlarmTone = (id: string) => safe((m) => m.chooseAlarmTone(id), false);
/** Plays a tone inside the app for at most 10 s, ramping like the real alarm. Always stoppable with stopPreview. */
export const previewTone = (id: string) => safe((m) => m.previewTone(id), false);
export const stopPreview = () => safe((m) => m.stopPreview(), false);

/** Tests only: forget the resolved module so a mock installed later is picked up. */
export const resetNative = () => { resolved = undefined; };
