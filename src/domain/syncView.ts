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
  errors?: { at: number; msg: string }[];
  skipped?: { p: string; reason: string; at: number }[];
  hold?: unknown;
}
export type Dot = 'on' | 'off' | 'unknown';
export interface DeviceRow { name: string; dot: Dot; note: string }
export type Action = 'folder' | 'retry' | 'hub' | 'pair' | 'clear';
export interface Problem { cause: string; affects: string; action: Action; label: string; at: number }
export interface SyncView { devices: DeviceRow[]; connection: string; stage: { text: string; done: number; of: number } | null; problems: Problem[]; ok: boolean }

const host = (a?: string | null) => (a ?? '').split(':')[0] ?? '';
const ACTION_LABEL: Record<Action, string> = { folder: 'Choose the folder again', retry: 'Try again', hub: 'How to start the desktop hub', pair: 'Pair again', clear: 'Dismiss' };

export function problemOf(msg: string, at: number): Problem {
  const m = msg.toLowerCase();
  const p = (cause: string, affects: string, action: Action): Problem => ({ cause, affects, action, label: ACTION_LABEL[action], at });
  if (/vault folder|pick the vault|choose the folder|couldn't read the phone vault|looks empty/.test(m)) return p(msg, 'Nothing syncs until Margin can read the vault folder.', 'folder');
  if (/not found on this network|did not answer|is bone-syncd running/.test(m)) return p(msg, 'Changes wait on each device and go when the desktop is back.', 'hub');
  if (/does not know this phone|pair again|bad-proof|different vault/.test(m)) return p(msg, 'The desktop refuses this phone until it is paired again.', 'pair');
  if (/older than this margin|seal 2|different version/.test(m)) return p(msg, 'Update vault-sync on the desktop; nothing syncs until then.', 'hub');
  if (/old margin bridge/.test(m)) return p(msg, 'Phone Obsidian still works; its file sending is ignored.', 'clear');
  return p(msg, 'One change did not go through; the rest of sync carries on.', 'retry');
}

export function syncView(s: SyncFacts | null, now: number, hour12: boolean): SyncView {
  if (!s) return { devices: [], connection: 'This build cannot sync.', stage: null, problems: [], ok: false };
  const deskObs = s.presence.some((p) => p.role === 'desktop-obsidian');
  const seen = s.lastOk ? `seen ${fmtTime(s.lastOk, hour12)}` : 'not yet';
  const devices: DeviceRow[] = [
    { name: 'Margin (this phone)', dot: 'on', note: s.vault ? 'writes the phone vault' : 'no vault folder' },
    { name: 'Obsidian on the phone', dot: s.obsidian ? 'on' : 'off', note: s.obsidian ? 'linked' : 'closed (fine: Margin keeps syncing)' },
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
  const problems = (s.errors ?? []).filter((e) => !seenMsg.has(e.msg) && !!seenMsg.add(e.msg)).slice(0, 4).map((e) => problemOf(e.msg, e.at));
  if (s.paired && !s.vault && !problems.some((p) => p.action === 'folder')) problems.unshift(problemOf('Choose the vault folder so Margin can sync it.', now));
  return { devices, connection, stage, problems, ok: s.live && problems.length === 0 && !s.hold };
}
