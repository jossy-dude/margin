/** v0.8 §1.2: the phone's file-class table (FileClasses.kt) runs vault-sync's fixtures, copied into the module's
 *  test resources. When vault-sync sits next to this repo (the owner's PC), the copies must be identical. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const res = join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'test', 'resources');
const vs = join(homedir(), 'Documents', 'Projects', 'tools', 'vault-sync', 'fixtures');
const there = existsSync(vs) ? it : it.skip;

there('classes.json and notes/ match vault-sync', () => {
  expect(readFileSync(join(res, 'classes.json'), 'utf8')).toBe(readFileSync(join(vs, 'classes.json'), 'utf8'));
  for (const f of readdirSync(join(vs, 'notes'))) expect(readFileSync(join(res, 'notes', f), 'utf8')).toBe(readFileSync(join(vs, 'notes', f), 'utf8'));
});
it('the Kotlin table lists the same shared plugin data and Margin files as sync-core', () => {
  const kt = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'FileClasses.kt'), 'utf8');
  for (const p of ['bone-chess/studies.json', 'bone-yt/history.json', 'Margin/Notices.md', '.margin/margin.json']) expect(kt).toContain(`"${p}"`);
});
