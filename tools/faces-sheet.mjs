import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

/* The contact sheet: every face, both themes, rendered from the SVGs `faces.test.ts` writes to /tmp/faces.
 *   node tools/faces-sheet.mjs [--out /tmp/faces/sheet.png]
 * One image per face so each can be looked at on its own. */
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '/tmp/faces/sheet.png';
const ids = ['g', 'rb', 'c', 'sl', 's'];
mkdirSync('/tmp/faces', { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 440 * 2, height: 440 * 5 }, deviceScaleFactor: 1 });
const html = `<body style="margin:0;background:#FAF4E6">${ids.map((id) => {
  const light = readFileSync(`/tmp/faces/${id}-light.svg`, 'utf8');
  const dark = readFileSync(`/tmp/faces/${id}-dark.svg`, 'utf8');
  return `<div style="display:flex;gap:8px;padding:8px;align-items:center">${light}${dark}</div>`;
}).join('')}</body>`;
await p.setContent(html);
await p.waitForTimeout(1200);
await p.screenshot({ path: out, fullPage: true });
console.log('wrote', out);
await b.close();
