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

export async function writeVaultFile(vault: string, name: string, text: string): Promise<void> {
  const s = saf();
  if (!s) return;
  const dir = (await child(vault, DIR)) ?? await s.makeDirectoryAsync(vault, DIR);
  const file = (await child(dir, name)) ?? await s.createFileAsync(dir, name.replace(/\.json$/, ''), 'application/json');
  await s.writeAsStringAsync(file, text);
}
