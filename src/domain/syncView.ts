/**
 * The Obsidian & Sync page as words (v0.8 §4.2), pure: "is it working, and if not, why". Takes the sync service's
 * status (services/native SyncStatus, structurally) and answers the four device dots, the connection line, the
 * stage with its progress, and the problems as cards, each with ONE action.
 */
import { fmtTime } from './time';

export interface SyncFacts {
  paired: boolean; live: boolean; obsidian: boolean; vault: boolean; dialing?: boolean; state?: string;
  path?: string | null; addr?: string | null; lastOk: number; lastPath?: string | null;
  presence: { role: string; name?: string }[];
  stage?: string; stageDone?: number; stageOf?: number; pending?: number; outbox?: number;
  errors?: SyncError[];
  skipped?: { p: string; reason: string; at: number }[];
  hold?: unknown;
  /** hub clock − phone clock, ms */
  offset?: number;
}
export type Dot = 'on' | 'off' | 'unknown';
export interface DeviceRow { name: string; dot: Dot; note: string }
export type Action = 'folder' | 'retry' | 'hub' | 'pair' | 'clear' | 'update' | 'show' | 'review' | 'open';
export type Side = 'phone' | 'desktop';
/** One row of the sync service's error list (SyncEngine.fail). `code`, `side`, `action`, `arg` and `fixed` come
 *  with v0.7.8; older rows carry only `at` and `msg` and are read by their words (`problemOf`). */
export interface SyncError { at: number; msg: string; code?: string; side?: string; action?: string; arg?: string; fixed?: number }
export interface Problem { code: string; side: Side; cause: string; affects: string; action: Action; label: string; at: number; arg?: string; fixed?: number }
export interface SyncClash { at: number; p: string; file: string; how: 'note' | 'copy' }
export interface SyncView { devices: DeviceRow[]; connection: string; stage: { text: string; done: number; of: number } | null; problems: Problem[]; ok: boolean; skew: string | null }

const host = (a?: string | null) => (a ?? '').split(':')[0] ?? '';

/**
 * v0.7.8 (SPEC §8 G3): what each code means for you and its one button. The codes are SyncEngine.kt's `Err`
 * (sync-errors test holds the two lists together).
 */
export const ERR: Record<string, { side: Side; action: Action; label: string; affects: string }> = {
  'E-AWAY': { side: 'desktop', action: 'retry', label: 'Try now', affects: 'Changes wait on each device and go when the desktop is back.' },
  'E-PAIR': { side: 'phone', action: 'pair', label: 'Pair', affects: 'The desktop refuses this phone until it is paired again.' },
  'E-VERSION': { side: 'desktop', action: 'update', label: 'How to update', affects: 'Nothing syncs until both sides run the same version.' },
  'E-SEAL': { side: 'desktop', action: 'pair', label: 'Pair again', affects: 'Marrow will not talk to a desktop it cannot check.' },
  'E-PERM': { side: 'phone', action: 'folder', label: 'Pick folder', affects: 'Nothing syncs until Marrow can read the vault folder.' },
  'E-BIG': { side: 'phone', action: 'show', label: 'Show file', affects: 'This file stays on this phone; the rest syncs.' },
  'E-HELD': { side: 'desktop', action: 'review', label: 'Review', affects: 'Sync waits until you say yes or no.' },
  'E-CLASH': { side: 'desktop', action: 'open', label: 'Open', affects: 'Both versions are kept; nothing was lost.' },
  'E-WRITE': { side: 'phone', action: 'retry', label: 'Retry', affects: 'One file did not go through; the rest of sync carries on.' },
  'E-REFUSED': { side: 'desktop', action: 'update', label: 'How to fix', affects: 'Phone changes wait on the phone.' },
  'E-HICCUP': { side: 'phone', action: 'retry', label: 'Try now', affects: 'One task failed; the rest of sync carries on.' },
};

/** v0.7.8.1: the desktop's clock more than 2 minutes off this phone's (from the hello frame). Timers and "due"
 *  times are worked out on the hub's clock, so a big gap shows on the sync page. */
export function skewOf(offsetMs: number): string | null {
  const min = Math.round(Math.abs(offsetMs) / 60_000);
  if (Math.abs(offsetMs) <= 120_000) return null;
  const amount = min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`;
  return `The desktop's clock is ${amount} ${offsetMs > 0 ? 'ahead of' : 'behind'} this phone's. Set both to automatic time.`;
}

/** The clash list, newest first: what it is and where the other version went. */
export const clashNote = (c: SyncClash) => (c.how === 'copy' ? `Both kept · ${leaf(c.file)}` : `Other version in ${c.file}`);
const leaf = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** A row from a build before the codes: told apart by its words. */
export function problemOf(msg: string, at: number): Problem {
  const m = msg.toLowerCase();
  const p = (code: string): Problem => ({ code, ...ERR[code]!, cause: msg, at });
  if (/vault folder|pick the vault|choose the folder|couldn't read the phone vault|looks empty/.test(m)) return p('E-PERM');
  if (/not found on this network|did not answer|is bone-syncd running/.test(m)) return p('E-AWAY');
  if (/does not know this phone|pair again|bad-proof|different vault/.test(m)) return p('E-PAIR');
  if (/older than this margin|seal 2|different version|old margin bridge/.test(m)) return p('E-VERSION');
  if (/over (20|100) mb/.test(m)) return p('E-BIG');
  return p('E-WRITE');
}

export function problemFrom(e: SyncError): Problem {
  const k = e.code && ERR[e.code];
  if (!k) return { ...problemOf(e.msg, e.at), ...(e.fixed ? { fixed: e.fixed } : {}) };
  return { code: e.code!, ...k, cause: e.msg, at: e.at, ...(e.arg ? { arg: e.arg } : {}), ...(e.fixed ? { fixed: e.fixed } : {}) };
}

/** The "What went wrong" page: open problems first, newest first, then the fixed ones; split by the device. */
export function problemGroups(list: Problem[]): { side: Side; title: string; items: Problem[] }[] {
  const order = (a: Problem, b: Problem) => (a.fixed ? 1 : 0) - (b.fixed ? 1 : 0) || b.at - a.at;
  return (['phone', 'desktop'] as const)
    .map((side) => ({ side, title: side === 'phone' ? 'This phone' : 'The desktop', items: list.filter((p) => p.side === side).sort(order) }))
    .filter((g) => g.items.length > 0);
}

export function syncView(s: SyncFacts | null, now: number, hour12: boolean): SyncView {
  if (!s) return { devices: [], connection: 'This build cannot sync.', stage: null, problems: [], ok: false, skew: null };
  const deskObs = s.presence.some((p) => p.role === 'desktop-obsidian');
  const seen = s.lastOk ? `seen ${fmtTime(s.lastOk, hour12)}` : 'not yet';
  const devices: DeviceRow[] = [
    { name: 'Marrow (this phone)', dot: 'on', note: s.vault ? 'writes the phone vault' : 'no vault folder' },
    { name: 'Obsidian on the phone', dot: s.obsidian ? 'on' : 'off', note: s.obsidian ? 'linked' : 'closed (fine: Marrow keeps syncing)' },
    { name: 'Desktop hub', dot: !s.paired ? 'unknown' : s.live ? 'on' : 'off', note: !s.paired ? 'not paired' : s.live ? 'connected' : seen },
    { name: 'Obsidian on the desktop', dot: !s.live ? 'unknown' : deskObs ? 'on' : 'off', note: !s.live ? '—' : deskObs ? 'open' : 'closed' },
  ];
  const connection = !s.paired ? 'Not paired with a desktop yet.'
    : s.live ? `${s.path === 'Wi-Fi' ? 'Home Wi-Fi' : s.path ?? 'Connected'} · desktop at ${host(s.addr)}`
    : s.dialing ? 'Looking for your desktop…'
    : s.state === 'dormant' ? 'Waiting for Wi-Fi or the hotspot (the screen is off or there is no network).'
    : `Offline: desktop not found on this network${s.lastPath ? ` (last time: ${s.lastPath})` : ''}.`;
  let stage: SyncView['stage'] = null;
  if (s.stage) stage = { text: s.stageOf ? `${s.stage} ${(s.stageDone ?? 0).toLocaleString('en-US')} / ${s.stageOf.toLocaleString('en-US')}` : s.stage, done: s.stageDone ?? 0, of: s.stageOf ?? 0 };
  else if (s.live && (s.pending ?? 0) > 0) stage = { text: `Receiving ${s.pending} change${s.pending === 1 ? '' : 's'}`, done: 0, of: 0 };
  else if (s.live) stage = { text: `Up to date · ${fmtTime(s.lastOk || now, hour12)}`, done: 0, of: 0 };
  const seenMsg = new Set<string>();
  const problems = (s.errors ?? []).filter((e) => !seenMsg.has(e.msg) && !!seenMsg.add(e.msg)).map(problemFrom);
  if (s.paired && !s.vault && !problems.some((p) => p.action === 'folder' && !p.fixed)) problems.unshift(problemOf('Choose the vault folder so Marrow can sync it.', now));
  return { devices, connection, stage, problems, ok: s.live && !problems.some((p) => !p.fixed) && !s.hold, skew: s.live ? skewOf(s.offset ?? 0) : null };
}
