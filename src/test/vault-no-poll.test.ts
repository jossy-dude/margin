/** v0.7 S9, kept in v0.8: the Obsidian link never polls. It reacts to native vault events and to Margin's own rows
 *  changing (750 ms debounce); the retired bridge-row push is gone (D4). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('the Obsidian link has no interval and debounces on row changes', () => {
  const src = readFileSync(join(__dirname, '..', 'store', 'obsidian.ts'), 'utf8');
  expect(src).not.toMatch(/setInterval\(/);
  expect(src).toMatch(/soon = setTimeout\(\(\) => \{ soon = null; void serial\(pushOut\)[^]*?\}, 750\)/);
  expect(src).toContain("onSyncEvent('onVaultChanged'");
  expect(src).not.toContain('syncPushBridge(');
});
