/* Collage look frames from the web build (412×915, 2×): a quick, scriptable eye on any surface.
 *
 *   node tools/look-shots.mjs [--url http://localhost:8098] [--out .shots/look] [--dark] [--steps "tab-week,tab-tasks"]
 *
 * Each step is a testid to tap (or `wait:<ms>`, `shot:<name>`, `text:<visible text to tap>`, `back`).
 * Without --steps it shoots the first screen it lands on. Frames only: nothing here asserts.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098'), OUT = arg('out', '.shots/look'), DARK = argv.includes('--dark');
const W = +arg('w', 412), H = +arg('h', 915);
const steps = (arg('steps', 'shot:landing') || '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: DARK ? 'dark' : 'light' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240_000 });
await p.waitForTimeout(4000);

const tapLoc = async (loc) => {
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const l = loc.nth(i), bb = await l.boundingBox().catch(() => null);
    if (!bb || !bb.width || !bb.height) continue;
    await l.scrollIntoViewIfNeeded().catch(() => {});
    const b2 = await l.boundingBox().catch(() => null); if (!b2) continue;
    await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
    return true;
  }
  return false;
};
for (const s of steps) {
  const [k, ...rest] = s.split(':'), v = rest.join(':');
  if (k === 'wait') await p.waitForTimeout(+v);
  else if (k === 'shot') { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${v}${DARK ? '-dark' : ''}.png` }); console.log('shot', `${OUT}/${v}${DARK ? '-dark' : ''}.png`); }
  else if (k === 'text') { const ok = await tapLoc(p.getByText(v, { exact: true })); console.log('tap text', v, ok); await p.waitForTimeout(600); }
  else if (k === 'label') { const ok = await tapLoc(p.locator(`[aria-label="${v}"]`)); console.log('tap label', v, ok); await p.waitForTimeout(600); }
  else if (k === 'scroll') { await p.mouse.move(W / 2, H / 2); await p.mouse.wheel(0, +v); await p.waitForTimeout(500); }
  else { const ok = await tapLoc(p.locator(`[data-testid="${s}"]`)); console.log('tap', s, ok); await p.waitForTimeout(600); }
}
if (errs.length) console.log('ERRORS:\n' + [...new Set(errs)].slice(0, 12).join('\n'));
await b.close();
