// Joins src/*.js into main.js. src/00_sync-core.js is vault-sync/core/dist/sync-core.cjs, vendored so this repo
// builds on its own; refresh it with `node build.mjs --core` when sync-core changes.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
const here = new URL('.', import.meta.url);
if (process.argv.includes('--core')) {
  const src = `${homedir()}/Documents/Projects/vault-sync/core/dist/sync-core.cjs`;
  if (!existsSync(src)) throw new Error(`no ${src}: run node bundle.mjs in vault-sync/core`);
  writeFileSync(new URL('src/00_sync-core.js', here), readFileSync(src, 'utf8').replace(/^if \(typeof module.*\n/m, ''));
}
const parts = readdirSync(new URL('src/', here)).filter((f) => f.endsWith('.js')).sort();
const out = parts.map((f) => `/* ── ${f} ── */\n${readFileSync(new URL(`src/${f}`, here), 'utf8')}`).join('\n');
writeFileSync(new URL('main.js', here), `'use strict';\n${out}`);
execFileSync(process.execPath, ['--check', new URL('main.js', here).pathname]);
console.log(`main.js ${(out.length / 1024).toFixed(1)} KB from ${parts.join(', ')}`);
