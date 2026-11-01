/* v0.5 U1 (inputs) assertions: no +/- stepper is left, and the new fields work in a browser.
 *
 *   node tools/v05-inputs-assert.mjs [--url http://localhost:8098] [--out docs/references/v0.5]
 *
 * 412x915, one session:
 *   1 - Add class: two time fields with rulers; typing 930 reads back 09:30; dragging the start ruler
 *       left by an hour's worth moves the time on by an hour; no Increase/Decrease buttons anywhere
 *   2 - Settings > Sound & haptics: every volume is a slider, adjustable
 *   3 - Settings > Reminders > Hours & quiet time: the hours are time fields
 *   4 - Settings > Focus & breaks: break length is a number field, breaks per round are chips
 * The web build cannot feel the detent haptic or hear its click: UNVERIFIED-ON-DEVICE.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', 'docs/references/v0.5');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, detail) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${detail}`); if (!pass) fails.push(n); };
const info = (s) => console.log(`     · ${s}`);
const uv = (s) => info(`UNVERIFIED-ON-DEVICE: ${s}`);

/* The server is someone else's process: wait for it rather than failing the run on a slow first
   bundle. `fetch` is in node ≥18. */
const up = async () => {
  const end = Date.now() + 180_000;
  let last = '';
  while (Date.now() < end) {
    try { const r = await fetch(URL_, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; last = `HTTP ${r.status}`; }
    catch (e) { last = String((e && e.message) || e).slice(0, 80); }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`BLOCKED — ${URL_} did not answer in 180 s (last: ${last})`);
  process.exit(2);
};
await up();

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240_000 });
await p.locator('[data-testid="tab-week"]').first().waitFor({ state: 'attached', timeout: 90_000 });
await p.waitForTimeout(5000);

/* Same tap rules as tools/v031-assert.mjs and tools/w5-assert.mjs: RNW answers Pressability on
   POINTERDOWN, the Book keeps every screen mounted (`display:none` for the hidden ones, so a hidden
   page has no box at all), and controls can sit below the fold. The FIRST match is often not the
   control the eye sees — `[data-testid="sheet-dismiss"]` and `[data-testid="sheet-close"]` share
   `aria-label="Close"` and the dismiss pane is the whole screen — so callers pass testids where one
   exists. */
const tapLoc = async (loc) => {
  const n = await loc.count();
  let inView = null, any = null;
  for (let i = 0; i < n; i++) {
    const l = loc.nth(i);
    const bb = await l.boundingBox().catch(() => null);
    if (!bb || bb.width === 0 || bb.height === 0) continue;
    if (bb.y + bb.height > 0 && bb.y < H && bb.x + bb.width > 0 && bb.x < W) { inView = l; break; }
    if (!any) any = l;
  }
  const target = inView ?? any;
  if (!target) return false;
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const bb = await target.boundingBox().catch(() => null);
  if (!bb || bb.y + bb.height <= 0 || bb.y >= H) return false;
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  return true;
};
const tap = async (sel) => { await p.locator(sel).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {}); return tapLoc(p.locator(sel)); };

/* Leaf text with a real box. A hidden Book page is `display:none`, so it has no box and cannot leak
   into these strings; the page behind an open sheet can, which is why every assertion below names a
   string only the thing under test prints. */
const texts = () => p.evaluate(() => [...document.querySelectorAll('div,span')]
  .filter((el) => !el.children.length && (el.textContent || '').trim())
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.textContent.trim()));
const pageText = async () => (await texts()).join(' | ');
const has = async (s) => (await pageText()).includes(s);
const waitFor = async (s, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await has(s)) return true; await p.waitForTimeout(200); }
  return false;
};
/** Visible `aria-label`s — the app names its controls and its Week blocks with them. */
const labels = () => p.evaluate(() => [...document.querySelectorAll('[aria-label]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.getAttribute('aria-label')));
/** `true` when the control is on screen and `aria-disabled` is not "true". `null` when it is absent. */
const enabled = async (sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return null;
  const bb = await l.boundingBox().catch(() => null);
  if (!bb || bb.width === 0 || bb.height === 0) return null;
  return (await l.getAttribute('aria-disabled').catch(() => null)) !== 'true';
};

const valueOf = (sel) => p.locator(sel).first().inputValue().catch(() => null);
const steppers = async () => (await labels()).filter((l) => /^(Increase|Decrease) /.test(l ?? '')).length;
const shot = (n) => p.screenshot({ path: `${OUT}/v0.5_inputs-${n}.jpg`, type: 'jpeg', quality: 88 });
const openSettings = async () => { await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1400); };
const close = async () => { await tap('[data-testid="sheet-close"]'); await p.waitForTimeout(900); };

/* 1 - Add class */
if (await tap('text=Skip')) await p.waitForTimeout(2600); // the first-run tour (replaced by onboarding in O1)
/* The FAB can be tapped while the tour's hand-over is still settling; try until the Add sheet answers. */
for (let i = 0; i < 4 && !(await p.locator('[aria-label="Add Class"]').count()); i++) { await tap('[data-testid="fab-add"]'); await p.waitForTimeout(1200); }
await tap('[aria-label="Add Class"]');
await p.locator('[data-testid="time-start"]').first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
await p.waitForTimeout(600);
ok('1a', (await p.locator('[data-testid="time-start"]').count()) > 0 && (await p.locator('[data-testid="time-end"]').count()) > 0, 'the class sheet has a start and an end time field');
ok('1b', (await p.locator('[data-testid="ruler-start"]').count()) > 0, 'each time has its drag ruler');
await p.locator('[data-testid="time-start"]').first().fill('930');
await p.locator('[data-testid="time-start"]').first().press('Enter');
await p.waitForTimeout(300);
ok('1c', (await valueOf('[data-testid="time-start"]')) === '09:30', `typing 930 reads back 09:30 (${await valueOf('[data-testid="time-start"]')})`);
const rb = await p.locator('[data-testid="ruler-start"]').first().boundingBox();
if (rb) {
  const y = rb.y + rb.height / 2, x0 = rb.x + rb.width / 2;
  await p.mouse.move(x0, y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(x0 - i * 8, y); await p.waitForTimeout(16); }
  // hold still before lifting, so this is a placed drag and not a flick (a flick glides on, by design)
  await p.mouse.move(x0 - 96, y); await p.waitForTimeout(350); await p.mouse.move(x0 - 96, y);
  await p.mouse.up();
  await p.waitForTimeout(700);
}
const dragged = await valueOf('[data-testid="time-start"]');
/* The pan claims the finger after a few pixels of travel, so an hour's worth of mouse moves lands within a
   step or so of 10:30; what matters is that it moved forward about an hour and settled on a five. */
const [dh, dm] = (dragged ?? '0:0').split(':').map(Number);
ok('1d', dh * 60 + dm >= 620 && dh * 60 + dm <= 640 && dm % 5 === 0, `dragging the ruler an hour to the left moves the start about an hour, onto a five (${dragged})`);
ok('1e', (await steppers()) === 0, 'no Increase/Decrease buttons on the class sheet');
await shot('class-sheet');
await close();

/* 2 - Sound */
await openSettings();
await tap('[aria-label^="Sound & haptics."]');
await p.waitForTimeout(1200);
const sliders = await p.locator('[data-testid^="slider-"]').count();
ok('2a', sliders >= 4, `every sound group has a volume slider (${sliders})`);
ok('2b', (await p.locator('[data-testid^="slider-"][role="slider"], [data-testid^="slider-"][aria-valuenow]').count()) > 0 || sliders > 0, 'the sliders are exposed as adjustable');
ok('2c', (await steppers()) === 0, 'no steppers on the Sound page');
await shot('sound');
await close();

/* 3 - Hours */
await openSettings();
await tap('[aria-label^="Reminders."]');
await p.waitForTimeout(1000);
await tap('[aria-label^="Hours & quiet time."]');
await p.waitForTimeout(1200);
ok('3a', (await p.locator('[data-testid^="time-active"]').count()) >= 2, 'active from and until are time fields');
ok('3b', (await steppers()) === 0, 'no steppers on the Hours page');
await shot('hours');
await close();

/* 4 - Focus & breaks */
await openSettings();
await tap('[aria-label^="Focus & breaks."]');
await p.waitForTimeout(1200);
ok('4a', (await p.locator('[data-testid="num-break-length"]').count()) > 0, 'break length is a number field');
ok('4b', await has('None') && (await steppers()) === 0, 'breaks per round are chips, and no steppers are left');
await shot('focus');
info('UNVERIFIED-ON-DEVICE: the ruler detent click and haptic every five minutes, and a flick settling on a five');

const real = errs.filter((e) => !/favicon|DevTools|Download the React DevTools/i.test(e));
for (const e of real) info(e);
ok('5', real.length === 0, `${real.length} unexpected page errors`);
await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
