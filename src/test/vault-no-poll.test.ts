/** v0.7 S9: the Obsidian link no longer polls every 30 s (a wake-up every 30 s while the app is open); it runs
 *  750 ms after Margin's own rows change and when the app comes to the front. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('the vault link has no interval and debounces on row changes', () => {
  const src = readFileSync(join(__dirname, '..', 'store', 'vault.ts'), 'utf8');
  expect(src).not.toMatch(/setInterval\(/);
  expect(src).toMatch(/setTimeout\(\(\) => \{ soon = null; tick\(\); \}, 750\)/);
  expect(src).toContain('syncPushBridge(');
});
