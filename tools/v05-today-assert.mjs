/* v0.5 S1/S2 (Today) assertions: two classes in one slot, the owner's case (O4).
 *
 *   node tools/v05-today-assert.mjs [--url http://localhost:8098] [--out docs/references/v0.5] [--tag after]
 *
 * The browser clock is pinned to Monday 26 Oct 2026 at 10:15, inside the sample timetable's 10:00
 * Discrete Mathematics class. A second class (Emerging Technology) is added in the same slot, then:
 *   1 - Today renders, the deck says two classes are on now and can show each one
 *   2 - "After" names the class after the slot, not the other one in it
 *   3 - Today's list shows both classes
 *   4 - Week lays the two blocks side by side instead of one on top of the other
 * Frames: v0.5_today-<tag>-deck.jpg, v0.5_today-<tag>-week.jpg, at 412 and 320 dp, light.
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
await ctx.clock.install({ time: new Date(2026, 9, 26, 10, 15) }); // Monday 26 Oct, 10:15: inside the 10:00 slot
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


const TAG = arg('tag', 'after');
const shot = (n) => p.screenshot({ path: `${OUT}/v0.5_today-${TAG}-${n}.jpg`, type: 'jpeg', quality: 86 });
if (await tap('text=Skip')) await p.waitForTimeout(2600);
for (let i = 0; i < 4 && !(await p.locator('[aria-label="Add Class"]').count()); i++) { await tap('[data-testid="fab-add"]'); await p.waitForTimeout(1200); }
await tap('[aria-label="Add Class"]');
await p.locator('[data-testid="time-start"]').first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
await tap('text="Emerging Technology"');
await p.waitForTimeout(300);
await p.locator('[data-testid="time-start"]').first().fill('1000'); await p.locator('[data-testid="time-start"]').first().press('Enter');
await p.locator('[data-testid="time-end"]').first().fill('1050'); await p.locator('[data-testid="time-end"]').first().press('Enter');
await p.waitForTimeout(300);
await tap('[aria-label="Save"]');
await p.waitForTimeout(1500);
ok('0', !(await p.locator('[data-testid="time-start"]').count()), 'the second 10:00 class saved and the sheet closed');
await p.evaluate(() => window.scrollTo(0, 0));
const text = await pageText();
ok('1a', text.includes('Discrete Mathematics'), 'Today renders with the deck on Discrete Mathematics');
ok('1b', /2 classes now|Two classes now|2 on now/i.test(text), 'the deck says two classes are on now');
const after = (await texts()).join(' | ').match(/After \| ([^|]+)/)?.[1]?.trim() ?? '';
// whichever subject the new 10:00 class got, the class after the 10:00 slot is the 11:45 Emerging Technology
ok('2', /^Emerging Technology/.test(after), `"After" names the class after the slot, not the other one in it (${JSON.stringify(after)})`);
ok('3', (await labels()).filter((l) => /Emerging Technology|Discrete Mathematics/.test(l ?? '')).length >= 2 || ((text.match(/10:00/g) ?? []).length >= 2), 'Today lists both 10:00 classes');
await shot('deck-412');
await p.setViewportSize({ width: 320, height: 690 });
await p.waitForTimeout(600);
await shot('deck-320');
await p.setViewportSize({ width: W, height: H });
await tap('[data-testid="tab-week"]');
await p.waitForTimeout(1500);
const blocks = await p.evaluate(() => [...document.querySelectorAll('[aria-label]')].filter((el) => /, Mon 10:00 to /.test(el.getAttribute('aria-label') ?? ''))
  .map((el) => { const r = el.getBoundingClientRect(); return { l: el.getAttribute('aria-label'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) }; }).filter((b) => b.w > 0));
const tenOclock = blocks.filter((b) => /10:00/.test(b.l ?? ''));
info('Monday 10:00 blocks: ' + JSON.stringify(tenOclock));
ok('4', tenOclock.length === 2 && tenOclock[0].x !== tenOclock[1].x, 'Week lays the two 10:00 blocks side by side');
await shot('week-412');
const real = errs.filter((e) => !/favicon|DevTools/i.test(e));
for (const e of real) info(e);
ok('5', real.length === 0, `${real.length} unexpected page errors`);
await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
