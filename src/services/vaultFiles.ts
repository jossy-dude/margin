import { Platform } from 'react-native';
import type * as LegacyFs from 'expo-file-system/legacy';

/**
 * The two bridge files in the Obsidian vault (docs/BRIDGE.md): `<vault>/.margin/margin.json`, which only
 * Margin writes, and `<vault>/.margin/obsidian.json`, which only the plugin writes. Android reaches the
 * vault through the Storage Access Framework: the owner picks the folder once and the OS remembers the
 * grant. Nothing here throws to the caller's caller: a missing folder or file reads as `null`.
 */
const DIR = '.margin';
let mod: typeof LegacyFs | null | undefined;
const saf = () => {
  if (mod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded on Android only: the web bundle has no vault to reach
      mod = Platform.OS === 'android' ? (require('expo-file-system/legacy') as typeof LegacyFs) : null;
    } catch { mod = null; }
  }
  return mod?.StorageAccessFramework ?? null;
};
/** False on the web preview and on iOS, where there is no vault folder to pick. */
export const vaultAvailable = () => saf() !== null;

/** The last path segment of a document URI: `…%2FBone%2F.margin` → `.margin`. */
export const leafOf = (uri: string) => { let s = uri; try { s = decodeURIComponent(uri); } catch { /* keep the raw form */ } return s.split(/[/:]/).pop() ?? ''; };

/** Asks for the vault folder. `null` when the picker is cancelled or unavailable. */
export async function pickVault(): Promise<string | null> {
  const s = saf();
  if (!s) return null;
  const p = await s.requestDirectoryPermissionsAsync();
  return p.granted ? p.directoryUri : null;
}

async function child(dir: string, name: string): Promise<string | null> {
  const s = saf();
  if (!s) return null;
  return (await s.readDirectoryAsync(dir)).find((u) => leafOf(u) === name) ?? null;
}

export async function readVaultFile(vault: string, name: string): Promise<string | null> {
  const s = saf();
  if (!s) return null;
  const dir = await child(vault, DIR), file = dir ? await child(dir, name) : null;
  return file ? s.readAsStringAsync(file) : null;
}

/**
 * Writes `text` so the file holds exactly that. SAF opens a document with mode "w", which Android's external
 * storage provider does not truncate: a shorter write left the old tail after the new JSON and corrupted
 * `.margin/margin.json` (2026-11-15). So the write is read back; if it is not exactly `text`, the document is
 * deleted, made again and written fresh (and checked once more). If the app dies between the delete and the new
 * write, the file is simply missing, which every reader treats as "not written yet" and the next sync rewrites.
 */
async function writeExact(dir: string, name: string, file: string | null, text: string, mime: string): Promise<void> {
  const s = saf();
  if (!s) throw new Error('No folder access on this device');
  const make = () => s.createFileAsync(dir, name.replace(/\.json$/, ''), mime);
  let uri = file ?? await make();
  await s.writeAsStringAsync(uri, text);
  if ((await s.readAsStringAsync(uri).catch(() => null)) === text) return;
  await s.deleteAsync(uri, { idempotent: true });
  uri = await make();
  await s.writeAsStringAsync(uri, text);
  if ((await s.readAsStringAsync(uri).catch(() => null)) !== text) throw new Error(`${name} did not save cleanly`);
}

export async function writeVaultFile(vault: string, name: string, text: string): Promise<void> {
  const s = saf();
  if (!s) return;
  const dir = (await child(vault, DIR)) ?? await s.makeDirectoryAsync(vault, DIR);
  await writeExact(dir, name, await child(dir, name), text, 'application/json');
}

/* ── any picked folder (v0.7 R12/R11: the backup folder) ── */
/** Asks for a folder. `null` when cancelled or unavailable. */
export const pickFolder = pickVault;
/** The files directly in a picked folder, by name. Empty when the folder cannot be read. */
export async function listFolder(dir: string): Promise<{ name: string; uri: string }[]> {
  const s = saf();
  if (!s) return [];
  return (await s.readDirectoryAsync(dir)).map((uri) => ({ name: leafOf(uri), uri }));
}
/** Writes `name` in `dir`, replacing a file of that name (SAF would otherwise add "name (1)"). */
export async function writeFolderFile(dir: string, name: string, text: string, mime = 'application/json'): Promise<void> {
  const s = saf();
  if (!s) throw new Error('No folder access on this device');
  await writeExact(dir, name, await child(dir, name), text, mime);
}
export async function deleteDocument(uri: string): Promise<void> {
  const s = saf();
  if (s) await s.deleteAsync(uri, { idempotent: true });
}
