/**
 * The Obsidian link's transport (docs/BRIDGE.md): reads the plugin's file into Margin and writes
 * Margin's file into the vault. It runs when the app comes to the front, every 30 s while it is open,
 * and on demand from Settings → Obsidian. Git (GitSync on the phone, Obsidian Git on the desktop)
 * carries the folder between devices, so the file Margin writes is always its whole state, never a delta,
 * and it is rewritten only when its contents change — otherwise every sync would be a commit.
 */
import { AppState } from 'react-native';
import { getState } from './core';
import { bridgeIn, bridgeOut } from './bridge';
import { readVaultFile, writeVaultFile } from '../services/vaultFiles';
import type { BridgeEnvelope } from '../domain/bridge';

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
    if (theirs) { const r = await bridgeIn(theirs); note = r.ok ? `${r.added} new · ${r.updated} changed · ${r.removed} removed` : r.problems[0] ?? 'Could not read Obsidian’s file'; }
    const env = await bridgeOut({ since: 0, move: false });
    if (env) {
      if (written === null) {
        const mine = await readVaultFile(uri, 'margin.json');
        try { written = mine ? envelopeBody(JSON.parse(mine) as BridgeEnvelope) : ''; } catch { written = ''; }
      }
      const body = envelopeBody(env);
      if (body !== written) { await writeVaultFile(uri, 'margin.json', `${JSON.stringify(env, null, 1)}\n`); written = body; }
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

/** Starts the link's clock. Returns the function that stops it. */
export function startVault(): () => void {
  const tick = () => { if (AppState.currentState === 'active') void vaultSync(); };
  const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void vaultSync(); });
  const timer = setInterval(tick, 30_000);
  tick();
  return () => { sub.remove(); clearInterval(timer); };
}
