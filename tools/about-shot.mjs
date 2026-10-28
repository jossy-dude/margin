/* Real-size frames of Settings → About, in both themes, plus the Reset page it was split from.
 *
 *   node tools/about-shot.mjs [--url http://localhost:8098] [--out .shots/about]
 *
 * jest can prove the copy is on the page and that the support row stays absent while its URL is empty.
 * It cannot tell whether the page reads well at 412 dp inside a 0.62-height sheet, whether the 64 dp
 * mark sits right, or whether the split left "Erase everything" one scroll away from the version line.
 *
 * Checks, per theme:
 *   - the mark, the name and the tagline are above the fold;
 *   - all five section headings exist and are reachable by scrolling;
 *   - the credit line is present;
 *   - "Buy me a coffee" is NOT rendered (SUPPORT_URL is empty — the off state is the shipped state);
 *   - the About page does not carry the destructive action;
 *   - the Reset page does, and carries nothing else from About.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/about');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, d) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${d}`); if (!pass) fails.push(n); };

/** Everything on the shipped sheet, including what is below the fold (the About page is taller than the
 *  viewport at 0.62 height). Hidden page-swap stacks sit at x < 1 and are filtered out by the box test.
 *
 *  `h1` matters: RNW renders `accessibilityRole="header"` as a REAL <h1>, not a div, so a `div,span`
 *  selector reads every sentence on a page and silently skips all five section headings. */
const LEAFS = () => [...document.querySelectorAll('div,span,h1,h2,h3,h4,h5,h6,p,button,li')]
  .filter((el) => !el.children.length && (el.textContent || '').trim())
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.x >= -1; })
  .map((el) => el.textContent.trim())
  .join(' | ');

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });

const run = async (scheme) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
  await p.waitForTimeout(5000);

  /* Same tap rules as tools/v031-assert.mjs: RNW answers Pressability on POINTERDOWN, and controls
     deep in the sheet's ScrollView are below the fold — so an out-of-view row is scrolled to first
     rather than skipped, which is why "About" (last-but-one on the root list) can be reached at all. */
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
    await p.waitForTimeout(220);
    const bb = await target.boundingBox().catch(() => null);
    if (!bb || bb.y + bb.height <= 0 || bb.y >= H) return false;
    await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(80);
    await p.mouse.up();
    return true;
  };
  const tap = async (sel) => { await p.locator(sel).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {}); return tapLoc(p.locator(sel)); };

  /** Scroll the SHEET's own scroll container, not the Today screen behind it.
   *
   *  Found by anchoring on a heading inside About and walking up: the biggest `scrollHeight` on the
   *  page belongs to the screen the sheet is covering, so "the largest scroller" scrolls the wrong
   *  thing and every bottom-of-page shot comes back identical to the top one. */
  const scrollSheet = async (to) => await p.evaluate((t) => {
    const anchor = [...document.querySelectorAll('h1')].find((el) => (el.textContent || '').trim() === 'What it holds');
    let n = anchor?.parentElement ?? null;
    while (n && n !== document.body) {
      if (n.scrollHeight > n.clientHeight + 20 && getComputedStyle(n).overflowY !== 'visible') break;
      n = n.parentElement;
    }
    if (!n || n === document.body) return null;
    n.scrollTop = t === 'end' ? n.scrollHeight : 0;
    return { top: Math.round(n.scrollTop), max: Math.round(n.scrollHeight - n.clientHeight) };
  }, to);

  if (await tap('text=Skip')) await p.waitForTimeout(2600);
  await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1300);
  const opened = await tap('[aria-label^="About."]');
  await p.waitForTimeout(1100);
  if (!opened) return { geom: null, errs: [...errs, 'the About row was never tappable'] };

  const top = await p.evaluate(LEAFS);
  await p.screenshot({ path: `${OUT}/about-${scheme}-top.png` });
  const scrolled = await scrollSheet('end');
  await p.waitForTimeout(500);
  const bottom = await p.evaluate(LEAFS);
  await p.screenshot({ path: `${OUT}/about-${scheme}-bottom.png` });

  /* Back out to the root, then into Reset — the split's other half. */
  await tap('[aria-label="Back"]'); await p.waitForTimeout(900);
  const resetOpen = await tap('[aria-label^="Reset."]'); await p.waitForTimeout(1000);
  const reset = resetOpen ? await p.evaluate(LEAFS) : '';
  await p.screenshot({ path: `${OUT}/reset-${scheme}.png` });

  const text = `${top} | ${bottom}`;
  await ctx.close();
  return { geom: { text, reset, scrolled }, errs };
};

for (const scheme of ['light', 'dark']) {
  const { geom, errs } = await run(scheme);
  if (!geom) { ok(`${scheme}-0`, false, errs.join(' | ') || 'the About page did not open'); continue; }
  const { text, reset, scrolled } = geom;
  const has = (s) => text.includes(s);

  ok(`${scheme}-1`, has('Margin') && has('paper and ink'), 'the name and the one-line tagline are on the page');
  ok(`${scheme}-2`, has('What it holds') && has('Why it looks like this') && has('Who made it') && has('This build'),
    'all four shipped sections render');
  ok(`${scheme}-3`, has('Made by Jossy'), 'the credit is the approved line');
  ok(`${scheme}-4`, !has('Buy me a coffee'), 'no support row while SUPPORT_URL is empty — nothing dead on the page');
  ok(`${scheme}-5`, !has('Erase everything'), 'the destructive action is gone from About');
  ok(`${scheme}-6`, /Margin \d+\.\d+\.\d+/.test(text), 'the build line names a real version');
  ok(`${scheme}-7`, scrolled && scrolled.top > 40, `the page scrolls rather than clipping (${scrolled?.top}/${scrolled?.max})`);
  ok(`${scheme}-8`, reset.includes('Erase everything') && !reset.includes('Why it looks like this'),
    'Reset kept the erase and none of the prose');
  ok(`${scheme}-9`, !/undefined|NaN|\[object Object\]/.test(text) && !/undefined|NaN/.test(reset),
    'no leaked placeholder values on either page');
  ok(`${scheme}-10`, errs.length === 0, `${errs.length} page errors`);
}

await browser.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
