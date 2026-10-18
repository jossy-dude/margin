/** Press Start on a real round and record, side by side, what the readout says and where the arrow
 *  points. The only honest way to tell a countdown from an oscillation. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/opencode/margin/hand';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 443, height: 999 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

const tap = async (sel) => {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(700);
};

await tap('text=Skip');
await tap('[data-testid="fab-add"]');
await tap('text=Start a focus session');

const ready = await page.locator('[data-testid="focus-time"]').textContent();
console.log('before Start, focus-time reads:', JSON.stringify(ready?.trim()));

await tap('text="Start"');

const sample = await page.evaluate(async () => {
  const hand = document.querySelector('[data-testid="focus-hand"]');
  const time = document.querySelector('[data-testid="focus-time"]');
  const ang = () => {
    const t = getComputedStyle(hand).transform;
    if (!t || t === 'none') return null;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return null;
    const [a, b] = m[1].split(',').map(Number);
    const d = (Math.atan2(b, a) * 180) / Math.PI;
    return +(((d % 360) + 360) % 360).toFixed(2);
  };
  const rows = [];
  const start = performance.now();
  while (performance.now() - start < 16000) {
    rows.push({ t: +(performance.now() - start).toFixed(0), ang: ang(), time: (time?.textContent || '').trim() });
    await new Promise((r) => setTimeout(r, 500));
  }
  return rows;
});

console.log('t(ms)   hand°    focus-time');
for (const r of sample) console.log(String(r.t).padStart(6), String(r.ang ?? '-').padStart(6), '  ', r.time);
await page.screenshot({ path: `${OUT}/running.png` });
console.log(errors.length ? errors.join('\n') : 'page errors: none');
await browser.close();
