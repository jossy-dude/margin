/** Photograph the Focus page with the new page image, at two widths, to see whether the
 *  background now reaches the edges on a phone that is not exactly 440×1001. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/tmp/opencode/margin/focus';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const errors = [];

for (const [name, w, h] of [['a51', 411, 890], ['tall', 360, 940], ['wide', 480, 1000], ['hisphone', 443, 999]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`${name} PAGEERROR ${e.message}`));
  await page.goto('http://localhost:8081', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const tap = async (sel) => {
    const loc = page.locator(sel).first();
    await loc.waitFor({ state: 'visible', timeout: 8000 });
    const b = await loc.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(600);
  };

  await tap('text=Skip');            /* the web build boots as a first run, so the tour is up first */
  await page.waitForTimeout(500);
  await tap('[data-testid="fab-add"]');
  await tap('text=Start a focus session');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  await page.close();
}

console.log(`shots in ${OUT}`);
console.log(errors.length ? errors.join('\n') : 'page errors: none');
await browser.close();
