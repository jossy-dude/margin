/* v0.5 U2 (themes, ink and texture) frames: every pen and every paper, light and dark, on Today.
 *
 *   node tools/v05-theme-shots.mjs [--url http://localhost:8098] [--out docs/references/v0.5]
 *
 * Writes v0.5_theme-<mode>-<what>.png, then one contact sheet per mode. Frames only; the contrast
 * is pinned by ui.test.ts, not by looking.
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
let ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
let p = await ctx.newPage();
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


const set = async (navs, choice) => {
  await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1200);
  for (const n of navs) { await tap(`[aria-label^="${n}."]`); await p.waitForTimeout(900); }
  await tap(`text=${choice}`); await p.waitForTimeout(600);
  await tap('[data-testid="sheet-close"]'); await p.waitForTimeout(1100);
};
const frame = async (name) => { await p.evaluate(() => window.scrollTo(0, 0)); await p.screenshot({ path: `${OUT}/v0.5_theme-${name}.png`, clip: { x: 0, y: 0, width: W, height: 640 } }); };
for (const mode of ['light', 'dark']) {
  await ctx.close();
  ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: mode });
  p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240_000 });
  await p.locator('[data-testid="tab-week"]').first().waitFor({ state: 'attached', timeout: 90_000 });
  await p.waitForTimeout(4000);
  if (await tap('text=Skip')) await p.waitForTimeout(2600);
  for (const [pen, label] of [['warm', 'Warm sienna'], ['graphite', 'Graphite (original)'], ['red', 'Red pencil'], ['blue', 'Blue pencil']]) {
    await set(['Look & feel', 'Accent pen'], label);
    await frame(`${mode}-pen-${pen}`);
  }
  await set(['Look & feel', 'Accent pen'], 'Warm sienna');
  for (const [paper, label] of [['ruled', 'Ruled'], ['grid', 'Grid'], ['plain', 'Plain'], ['dots', 'Dots']]) {
    await set(['Look & feel', 'Paper & texture'], label);
    await frame(`${mode}-paper-${paper}`);
  }
  for (const [tex, label] of [['photo', 'Original photo'], ['none', 'None'], ['grain', 'Grain (new)']]) {
    await set(['Look & feel', 'Paper & texture'], label);
    await frame(`${mode}-texture-${tex}`);
  }
  await set(['Look & feel', 'Theme & palette'], 'Original');
  await frame(`${mode}-palette-original`);
  await set(['Look & feel', 'Theme & palette'], 'Refined (lighter cream)');
}
const real = errs.filter((e) => !/favicon|DevTools/i.test(e));
for (const e of real) info(e);
ok('errors', real.length === 0, `${real.length} unexpected page errors`);
await b.close();
process.exit(fails.length ? 1 : 0);
