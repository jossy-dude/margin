/**
 * The Obsidian link's transport (docs/BRIDGE.md): reads the plugin's file into Margin and writes
 * Margin's file into the vault. It runs when the app comes to the front, 750 ms after Margin's own data
 * changes, and on demand from Settings → Obsidian. v0.7 (S9): no 30 s polling any more (battery; the phone's
 * Obsidian writes its file while Margin is in the background, and Margin reads it when it comes to the front). Git (GitSync on the phone, Obsidian Git on the desktop)
 * carries the folder between devices, so the file Margin writes is always its whole state, never a delta,
 * and it is rewritten only when its contents change — otherwise every sync would be a commit.
 */
import { AppState } from 'react-native';
import { getState, subscribe } from './core';
import { bridgeIn, bridgeOut } from './bridge';
import { leafOf, readVaultFile, writeVaultFile } from '../services/vaultFiles';
import type { BridgeEnvelope } from '../domain/bridge';
import { connection } from '../data/sqlite';
import { faceEvent } from '../ui/mascot/moments';
import { syncConfigure, syncInbox, syncPushBridge, syncStart } from '../services/native';

export interface VaultStatus { at: number; ok: boolean; note: string }
let status: VaultStatus = { at: 0, ok: true, note: '' }, busy = false, written: string | null = null;
const subs = new Set<() => void>();
export const vaultStatus = () => status;
export const onVault = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };

/** What makes two envelopes the same file: the rows, not when they were written out. */
export const envelopeBody = (e: Pick<BridgeEnvelope, 'tasks' | 'events' | 'sessions'>) =>
  JSON.stringify({ tasks: e.tasks, events: e.events.map((x) => ({ id: x.id, deleted: x.deleted, data: x.data })), sessions: e.sessions });

export async function vaultSync(): Promise<VaultStatus> {
  const uri = getState().settings.vaultUri;
  if (!uri || busy) return status;
  busy = true;
  try {
    const theirs = await readVaultFile(uri, 'obsidian.json');
    let note = 'Waiting for Obsidian';
    if (theirs) { const r = await bridgeIn(theirs); if (r.ok && r.added > 0) faceEvent('taskArrived'); /* a new task from Obsidian (D-21) */ note = r.ok ? `${r.added} new · ${r.updated} changed · ${r.removed} removed` : r.problems[0] ?? 'Could not read Obsidian’s file'; }
    const env = await bridgeOut({ since: 0, move: false });
    if (env) {
      if (written === null) {
        const mine = await readVaultFile(uri, 'margin.json');
        try { written = mine ? envelopeBody(JSON.parse(mine) as BridgeEnvelope) : ''; } catch { written = ''; }
      }
      const body = envelopeBody(env);
      if (body !== written) {
        await writeVaultFile(uri, 'margin.json', `${JSON.stringify(env, null, 1)}\n`); written = body;
        /* the same rows to the desktop hub through the sync service (a no-op when not paired) */
        syncPushBridge({ tasks: env.tasks, events: env.events, sessions: env.sessions });
      }
    }
    status = { at: Date.now(), ok: true, note };
  } catch (e) {
    status = { at: Date.now(), ok: false, note: e instanceof Error ? e.message : String(e) };
  } finally {
    busy = false;
    subs.forEach((fn) => fn());
  }
  return status;
}

const rowsOf = () => { const s = getState(); return { tasks: s.tasks, meetings: s.meetings, focus: s.focus, courses: s.courses }; };
/** Starts the link's clock. Returns the function that stops it. */
export function startVault(): () => void {
  /* No tick while the database connection is being replaced (BUGS.md #11): its writes would only queue
     behind the reconnect and fail with it. */
  const tick = () => { if (AppState.currentState === 'active' && !connection.reopening) void vaultSync(); };
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') return;
    /* rows the sync service received while JS was not running; the bridge file carries the same data on this
       phone, so they are only drained here (the desktop-only rows matter once the desktop sends its own). */
    syncInbox();
    void vaultSync();
  });
  /* 750 ms after Margin's own rows change (S9), instead of a 30 s interval */
  let soon: ReturnType<typeof setTimeout> | null = null, rows = rowsOf();
  const unsubRows = subscribe(() => {
    const next = rowsOf();
    if (next.tasks === rows.tasks && next.meetings === rows.meetings && next.focus === rows.focus && next.courses === rows.courses) return;
    rows = next;
    if (soon) clearTimeout(soon);
    soon = setTimeout(() => { soon = null; tick(); }, 750);
  });
  /* The app mounts before the saved settings load, so the vault folder is unknown at the first tick.
     Sync the moment it becomes known (start-up, or a folder just picked), not 30 s later. */
  let known = getState().settings.vaultUri;
  /* v0.7: the native sync service writes the same vault folder while phone Obsidian is closed; it learns the
     folder from here and starts if this phone is paired (a no-op otherwise, and off Android). */
  const tellSync = (uri: string | null | undefined) => { syncConfigure(uri ?? null, uri ? leafOf(uri) : null); syncStart(); };
  tellSync(known);
  const unsub = subscribe(() => { const uri = getState().settings.vaultUri; if (uri !== known) { known = uri; tellSync(uri); if (uri) tick(); } });
  tick();
  return () => { sub.remove(); if (soon) clearTimeout(soon); unsubRows(); unsub(); };
}
