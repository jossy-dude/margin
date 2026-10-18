import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

/* Zoom on a face's centre, so the ornament (and the marks meant to make its motion legible) can be judged.
 *   node tools/face-zoom.mjs <faceId> [--px 800] [--crop 0.5] [--light|--dark]
 */
const id = process.argv[2] || 'g';
const px = process.argv.includes('--px') ? Number(process.argv[process.argv.indexOf('--px') + 1]) : 800;
const frac = process.argv.includes('--crop') ? Number(process.argv[process.argv.indexOf('--crop') + 1]) : 0.5;
const theme = process.argv.includes('--dark') ? 'dark' : 'light';
mkdirSync('/tmp/faces', { recursive: true });

const svg = readFileSync(`/tmp/faces/${id}-${theme}.svg`, 'utf8');
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
await p.setContent(`<body style="margin:0"><div style="width:${px}px;height:${px}px">${svg}</div></body>`);
await p.waitForTimeout(600);
const c = Math.round((px * (1 - frac)) / 2);
await p.screenshot({ path: `/tmp/opencode/zoom-${id}-${theme}.png`, clip: { x: c, y: c, width: px * frac, height: px * frac } });
console.log(`wrote /tmp/opencode/zoom-${id}-${theme}.png`);
await b.close();
