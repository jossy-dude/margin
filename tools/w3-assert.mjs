/* W3 assertions for the Focus dial readout redesign, plus the W3 screenshots.
 *
 *   node tools/w3-assert.mjs [--url http://localhost:8098] [--out .shots/w3] [--tag default]
 *
 * Five assertions, on the web build (MemoryRepository) with the phone viewport:
 *   1. the `focus-time` label lies ENTIRELY OUTSIDE the circle of radius 118 canvas units centred on the
 *      `focus-dial` box's centre — that circle is the face artwork, and the whole point of moving the
 *      readout off it was to stop hiding the guilloché;
 *   2. the computed `opacity` of `focus-dial-face` is < 1 (the face is see-through);
 *   3. `focus-time` shows the plan's minutes in the `set` phase and a different text once a round runs;
 *   4. the `focus-tape` bbox clears the dial's feathered rim: its nearest point is ≥ 125 canvas units from
 *      the dial centre (the feather radius 122 plus the review's 3), i.e. the tape's top corner no longer
 *      sits inside the fade the owner reads as the rim;
 *   5. the `focus-time-text` left edge is ≥ 8 canvas units right of the tape's rightmost rendered extent,
 *      so the readout's first glyph is never over the tape.
 * Assertions 4 and 5 print canvas units (measured pixels ÷ the page's own scale, taken from the dial box),
 * and an informational line reports the slip→subText gap the review asked not to tighten.
 * It also writes `${OUT}/w3-${tag}-set.png` and `${OUT}/w3-${tag}-running.png` so both phases are captured
 * at the identical viewport/state (the alternative variant is captured by re-running with `--tag alt`
 * against a temporarily edited tree).
 *
 * Entry point note: the brief says "focus-screen entry via `tab-focus`", but no such tab exists — the Book
 * navigator's five tabs are Today/Week/Tasks/Grades/Stats (`src/navigation/Book.tsx:14`), and Focus is
 * reached through the Today card's `open-focus` control (`src/ui/RunningTimer.tsx:82`, the path
 * `tools/cap-baseline.mjs` already uses). This script uses the real entry point.
 *
 * React Native Web answers Pressability on POINTERDOWN, so every tap here is mouse.down/up — never
 * `click()`. The Book mounts all six screens at once, so every query is scoped to the one element with a
 * real, in-viewport box (see `tools/cap-baseline.mjs` `tap()`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/w3');
const TAG = arg('tag', 'default');
/* `--shots-only` captures both phases without asserting: the DECISIONS alternative variant has no
   `focus-time` label by design, so the three assertions would fail on it by construction. */
const SHOTS_ONLY = argv.includes('--shots-only');
const W = Number(arg('w', '412')), H = Number(arg('h', '915'));
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`); };

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 220)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 220)); });

await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
await p.waitForTimeout(5000);

/** the one match with a real, in-viewport box — the hidden Book pages have no layout box at all */
async function visible(sel) {
  const loc = p.locator(sel);
  await loc.first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  const n = await loc.count();
  let inView = null, any = null;
  for (let i = 0; i < n; i++) {
    const l = loc.nth(i);
    const bb = await l.boundingBox().catch(() => null);
    if (!bb || bb.width === 0 || bb.height === 0) continue;
    if (bb.y + bb.height > 0 && bb.y < H && bb.x + bb.width > 0 && bb.x < W) { inView = l; break; }
    if (!any) any = l;
  }
  return inView ?? any;
}
const tap = async (sel) => {
  const t = await visible(sel);
  if (!t) return false;
  await t.scrollIntoViewIfNeeded().catch(() => {});
  const bb = await t.boundingBox().catch(() => null);
  if (!bb || bb.y + bb.height <= 0 || bb.y >= H) return false;
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  return true;
};

// ── into the focus screen
console.log('skip onboarding ->', await tap('text=Skip'));
await p.waitForTimeout(2400);
console.log('enter focus ->', await tap('[data-testid="open-focus"]'));
await p.waitForTimeout(2600);
await visible('[data-testid="focus-time"]'); // the label is up before the `set` capture
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/w3-${TAG}-set.png` });

/** the match with the smallest real box — for a bare text node, where every ancestor "contains" the string */
async function smallest(sel) {
  const loc = p.locator(sel), n = await loc.count();
  let best = null, bestArea = Infinity;
  for (let i = 0; i < n; i++) {
    const bb = await loc.nth(i).boundingBox().catch(() => null);
    if (!bb || bb.width === 0 || bb.height === 0) continue;
    if (bb.y + bb.height <= 0 || bb.y >= H || bb.x + bb.width <= 0 || bb.x >= W) continue;
    if (bb.width * bb.height < bestArea) { best = loc.nth(i); bestArea = bb.width * bb.height; }
  }
  return best;
}

const dial = await visible('[data-testid="focus-dial"]');
const face = await visible('[data-testid="focus-dial-face"]');
const label = await visible('[data-testid="focus-time"]');
const tape = await visible('[data-testid="focus-tape"]');
const timeText = await visible('[data-testid="focus-time-text"]');
const subText = await smallest('text="ready when you are"');
const text = async () => label ? (((await label.textContent()) ?? '').trim()) : '';
const before = await text();

// ── 1 ── the label clears the face circle (measured before the round starts; neither box moves)
const db = dial ? await dial.boundingBox() : null, lb = label ? await label.boundingBox() : null;
// the dial wrapper is 282 canvas units square, so its rendered width is the page's scale
const scale = db ? db.width / 282 : NaN, cx = db ? db.x + db.width / 2 : NaN, cy = db ? db.y + db.height / 2 : NaN, r = 118 * scale;
// the nearest point of the label rectangle to the face centre: clamp the centre into the rect. If the
// centre were inside the rect the label would be over the face, which is exactly the failure we want.
const nx = lb ? Math.min(Math.max(cx, lb.x), lb.x + lb.width) : NaN, ny = lb ? Math.min(Math.max(cy, lb.y), lb.y + lb.height) : NaN;
const dist = Math.hypot(nx - cx, ny - cy);
// ── 2 ── the face is see-through
const op = face ? await face.evaluate((el) => Number(getComputedStyle(el).opacity)) : NaN;

// ── 4 ── the tape clears the feathered rim (all canvas units, measured px ÷ the page scale)
const tb = tape ? await tape.boundingBox() : null;
// the nearest point of the tape's rendered bbox to the dial centre: clamp the centre into the rect. The bbox
// has two top corners; the near one is the binding constraint, and this formula picks it without assuming which.
const tnx = tb ? Math.min(Math.max(cx, tb.x), tb.x + tb.width) : NaN, tny = tb ? Math.min(Math.max(cy, tb.y), tb.y + tb.height) : NaN;
const tapeNear = Math.hypot(tnx - cx, tny - cy) / scale;
const topL = tb ? Math.hypot(tb.x - cx, tb.y - cy) / scale : NaN;
const topR = tb ? Math.hypot(tb.x + tb.width - cx, tb.y - cy) / scale : NaN;

// ── 5 ── the readout starts clear of the tape
const xb = timeText ? await timeText.boundingBox() : null;
const textGap = (xb && tb) ? (xb.x - (tb.x + tb.width)) / scale : NaN;
const textRightMargin = xb ? (lb.x + lb.width - (xb.x + xb.width)) / scale : NaN;

// ── info ── the one gap the review asked not to tighten (derived from the two measured boxes)
const sb = subText ? await subText.boundingBox() : null;
const slipToSub = (sb && lb) ? (sb.y - (lb.y + lb.height)) / scale : NaN;

// ── the running state (and its capture), for both variants
const started = await tap('[aria-label="Start"]');
await p.waitForTimeout(5200);
await p.screenshot({ path: `${OUT}/w3-${TAG}-running.png` });
const after = await text();

if (!SHOTS_ONLY) {
  check('1. focus-time is entirely outside the radius-118 face circle', !!lb && dist > r,
    `dial centre (${cx.toFixed(1)}, ${cy.toFixed(1)}) scale ${scale.toFixed(4)}; radius ${r.toFixed(1)}px; ` +
    `label box y ${(lb?.y ?? NaN).toFixed(1)}..${((lb?.y ?? NaN) + (lb?.height ?? NaN)).toFixed(1)}; nearest point ` +
    `${dist.toFixed(1)}px from centre (${(dist - r).toFixed(1)}px of clearance; face circle bottom y ${(cy + r).toFixed(1)})`);

  check('2. focus-dial-face resolves to opacity < 1', Number.isFinite(op) && op < 1, `computed opacity = ${op}`);

  check('3. the label shows minutes in `set` and counts once a round runs',
    started && /\d/.test(before) && after !== before && /\d/.test(after),
    `start tap -> ${started}; set: "${before}" -> running: "${after}"`);

  check('4. the tape clears the feathered rim (≥125 canvas units from the dial centre)', !!tb && tapeNear >= 125,
    `tape bbox x ${(tb?.x ?? NaN).toFixed(1)}..${((tb?.x ?? NaN) + (tb?.width ?? NaN)).toFixed(1)}, ` +
    `y ${(tb?.y ?? NaN).toFixed(1)}..${((tb?.y ?? NaN) + (tb?.height ?? NaN)).toFixed(1)} (px); ` +
    `nearest point ${tapeNear.toFixed(1)} canvas units from the centre — feather 122, so ${(tapeNear - 122).toFixed(1)} clear ` +
    `(standard ≥3); top corners ${topL.toFixed(1)} (left) / ${topR.toFixed(1)} (right) from the centre`);

  check('5. the time text starts ≥8 canvas units right of the tape', !!xb && !!tb && textGap >= 8,
    `tape right edge ${((tb?.x ?? NaN) + (tb?.width ?? NaN)).toFixed(1)}px, text left ${(xb?.x ?? NaN).toFixed(1)}px ` +
    `→ gap ${textGap.toFixed(1)} canvas units (standard ≥8); text right edge ${textRightMargin.toFixed(1)} units inside the slip`);

  console.log(`info  slip bottom → subText top = ${slipToSub.toFixed(1)} canvas units (review standard ≥6, unchanged)`);
}

console.log('console errors:', errs.length ? errs.slice(0, 4).join(' | ') : 'NONE');
console.log(`screenshots: ${OUT}/w3-${TAG}-set.png, ${OUT}/w3-${TAG}-running.png`);
await ctx.close();
await b.close();
console.log(results.every(Boolean) ? 'W3 ASSERT: ALL PASS' : 'W3 ASSERT: FAILURES ABOVE');
process.exitCode = results.every(Boolean) ? 0 : 1;
