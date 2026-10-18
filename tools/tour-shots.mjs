/**
 * Walk the first-run tour in a real browser and photograph each step.
 *
 * The web build boots from a `MemoryRepository`, so every reload is a fresh first run and the tour is
 * there on load — no seeding, no state to reset between passes.
 *
 * Taps are `mouse.down()`/`mouse.up()` at the middle of the node, not `page.click()`: React Native Web
 * hands press events to its own responder system, and a synthetic `click` never reaches it. That is
 * also why `tools/cap.mjs` does the same thing.
 *
 *   node tools/tour-shots.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:8081';
const OUT = process.argv[3] ?? '/tmp/opencode/margin/tour';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 411, height: 890 }, deviceScaleFactor: 2 });

const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' && !/navigator\.vibrate|transform-origin/.test(t)) errors.push(t);
});

/** Tap the middle of the first node whose text contains `label`. */
async function tap(label) {
  /* `exact` matters: a loose "Next" matches the Today screen's "…in the next 14 days" stat, which is
     sitting under the scrim and is not what the finger is meant to hit. */
  const loc = page.getByText(label, { exact: true }).first();
  await loc.waitFor({ state: 'visible', timeout: 5000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`no box for "${label}"`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(450);
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.getByText('Everything lives on this phone.').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
await page.waitForTimeout(900);
await shot('step01-add');

/* Look at whether the ADD sheet the second step opens is still up when the third step arrives — the
   third step rings the gear, which a leftover sheet would be sitting on top of. */
await tap('Next');
await page.waitForTimeout(900);
await shot('step02-close');
const sheetLeftOpen = await page.getByText('What are you adding?').isVisible().catch(() => false);

for (const [n, label] of [['03', 'Next'], ['04', 'Next'], ['05', 'Next'], ['06', 'Next'], ['07', 'Next'], ['08', 'Next'], ['09', 'Next']]) {
  await tap(label);
  await page.waitForTimeout(500);
  await shot(`step${n}`);
}

await tap('Next'); /* the dial step is index 8; one more lands on the hand-over */
await page.waitForTimeout(900);
await shot('step10-done');

console.log(`shots in ${OUT}`);
console.log(`sheet left open when step 3 arrived: ${sheetLeftOpen}`);
console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'console errors: none');

await browser.close();
