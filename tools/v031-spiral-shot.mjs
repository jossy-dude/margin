/* Real-size frames of the Spiral bar, in both themes.
 *
 *   node tools/v031-spiral-shot.mjs [--url http://localhost:8098] [--out .shots/v031]
 *
 * The catalogue's own preview (`sheets/Settings.tsx` BarPick) draws the instrument at `DEMO_P` on the
 * real slab colour at the real width — the only honest way to judge whether a 50 % ink step reads at
 * 52 dp. The 4x frames a builder can render answer "is the markup right"; this answers "can you see
 * it, at the size it ships".
 *
 * The theme is driven by the browser's own colour scheme (the app's default setting is "auto"), so
 * each pass is a fresh context rather than a settings round-trip through the sheet.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/v031');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, d) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${d}`); if (!pass) fails.push(n); };

const browser = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });

/** Walk Settings → Look & feel → Progress bar, pick Spiral, photograph the row. */
const capture = async (scheme) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: scheme });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
  await p.waitForTimeout(5000);

  const tapLoc = async (loc) => {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      const l = loc.nth(i);
      const bb = await l.boundingBox().catch(() => null);
      if (bb && bb.width > 0 && bb.height > 0 && bb.y + bb.height > 0 && bb.y < H && bb.x + bb.width > 0 && bb.x < W) {
        await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
        return true;
      }
    }
    return false;
  };
  const tap = async (sel) => { await p.locator(sel).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {}); return tapLoc(p.locator(sel)); };

  if (await tap('text=Skip')) await p.waitForTimeout(2600);
  await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1300);
  await tap('[aria-label^="Look & feel"]'); await p.waitForTimeout(900);
  await tap('[aria-label^="Progress bar."]'); await p.waitForTimeout(900);
  /* The row is deep in the sheet: scroll it into the viewport before tapping, or the tap lands on
     nothing and the picker keeps the previous bar (the static preview still draws a spiral, which is
     exactly the trap this closed). */
  await p.evaluate(() => document.querySelector('[aria-label^="Spiral."]')?.scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(400);
  await tap('[aria-label^="Spiral."]'); await p.waitForTimeout(1200);

  /* The row sits deep in the sheet's ScrollView, and Playwright calls an element clipped by that
     container "not visible" — `boundingBox()` would wait forever. Scroll and measure in the DOM. */
  const geom = await p.evaluate(() => {
    const row = document.querySelector('[aria-label^="Spiral."]');
    if (!row) return null;
    row.scrollIntoView({ block: 'center' });
    /* The row holds TWO svgs: HandBox's hand-drawn border (a wobbly rect at 384x126) and the
       instrument itself. The border is decorative, so take the shallow one. */
    const svg = [...row.querySelectorAll('svg')].find((e) => e.viewBox && e.viewBox.baseVal.height <= 60) ?? null;
    const r = row.getBoundingClientRect();
    return {
      row: { x: r.x, y: r.y, w: r.width, h: r.height },
      svg: svg ? { w: svg.getBoundingClientRect().width, h: svg.getBoundingClientRect().height } : null,
      paths: svg ? [...svg.querySelectorAll('path')].map((e) => ({
        len: (e.getAttribute('d') || '').length,
        op: e.getAttribute('opacity') ?? (e.style.opacity || null),
        stroke: e.getAttribute('stroke'),
        sw: e.getAttribute('stroke-width'),
      })) : [],
      desc: row.getAttribute('aria-label'),

    };
  });
  await p.waitForTimeout(300);
  if (geom) {
    const clip = { x: geom.row.x, y: Math.max(0, geom.row.y), width: geom.row.w, height: Math.min(geom.row.h, H - Math.max(0, geom.row.y)) };
    await p.screenshot({ path: `${OUT}/spiral-${scheme}.png`, clip });
  }
  /* Back out to Look & feel: the parent page is not in the DOM while the bar page is on top, so the row
     that must name the pick can only be read after popping. */
  await tap('[aria-label="Back"]'); await p.waitForTimeout(900);
  const progressRow = await p.evaluate(() => document.querySelector('[aria-label^="Progress bar."]')?.getAttribute('aria-label') ?? null);
  await ctx.close();
  return { geom, progressRow, errs };
};

for (const scheme of ['light', 'dark']) {
  const { geom, progressRow, errs } = await capture(scheme);
  if (!geom) { ok(`${scheme}-0`, false, 'the Spiral row was never on screen'); continue; }
  const [ahead, spent] = geom.paths;
  ok(`${scheme}-1`, geom.paths.length === 2 && ahead && spent, `two paths on one groove (${geom.paths.length}), row ${geom.row.w.toFixed(0)}x${geom.row.h.toFixed(0)}`);
  ok(`${scheme}-2`, !!ahead && ahead.op === null, `the ink still ahead is full strength (opacity ${ahead?.op})`);
  ok(`${scheme}-3`, !!spent && spent.op !== null && Number(spent.op) > 0.2 && Number(spent.op) < 0.9, `the spent tail is a dim step, not gone (opacity ${spent?.op})`);
  ok(`${scheme}-4`, !!ahead && !!spent && ahead.len > spent.len && spent.len > 20, `the boundary moves with p: ahead ${ahead?.len} chars vs spent ${spent?.len}`);
  ok(`${scheme}-5`, !/drawn to the playhead/i.test(geom.desc || ''), `the catalogue describes the new behaviour ("${(geom.desc || '').slice(0, 46)}…")`);
  ok(`${scheme}-6`, /Spiral/.test(progressRow || ''), `Look & feel names the pick ("${progressRow}")`);
  ok(`${scheme}-7`, errs.length === 0, `${errs.length} page errors`);
}

await browser.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
