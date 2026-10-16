/* Baseline captures for the v2-improvements pass: onboarding steps + every screen + key surfaces.
 *
 *   node tools/cap-baseline.mjs [--url http://localhost:8099] [--out .shots/baseline]
 *
 * Output: onboarding-1..5.png, today/week/tasks/grades/stats.png, focus.png (+focus-running.png when
 * a start control is found), add-sheet.png, settings.png. Prints console errors per context.
 *
 * React Native Web answers Pressability on POINTERDOWN — taps here go through mouse.down/up, never
 * `click()` (same reason tools/cap.mjs uses its own `tap`).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8099');
const OUT = arg('out', '.shots/baseline');
const W = Number(arg('w', '412')), H = Number(arg('h', '915'));
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctxOpts = { viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

async function open() {
  const ctx = await b.newContext(ctxOpts);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 220)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 220)); });
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
  await p.waitForTimeout(5000);
  return { ctx, p, errs };
}
const tap = async (p, sel) => {
  const box = await p.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  return true;
};

// 1 ── onboarding, step by step (fresh context: web repo is in-memory, so the tour always shows)
{
  const { ctx, p, errs } = await open();
  for (let i = 1; i <= 5; i++) {
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/onboarding-${i}.png` });
    if (i < 5) { const ok = await tap(p, 'text=Next'); console.log(`onboarding ${i}: Next -> ${ok}`); await p.waitForTimeout(1600); }
  }
  console.log('onboarding console errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'NONE');
  await ctx.close();
}

// 2 ── the app itself
{
  const { ctx, p, errs } = await open();
  console.log('skip ->', await tap(p, 'text=Skip'));
  await p.waitForTimeout(2600);
  for (const r of ['today', 'week', 'tasks', 'grades', 'stats']) {
    const ok = await tap(p, `[data-testid="tab-${r}"]`);
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `${OUT}/${r}.png` });
    console.log(`route ${r}: tap -> ${ok}`);
  }
  await tap(p, '[data-testid="tab-today"]');
  await p.waitForTimeout(1500);
  const of = await tap(p, '[data-testid="open-focus"]');
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `${OUT}/focus.png` });
  console.log('focus open ->', of);
  const started = (await tap(p, 'text=Start focus')) || (await tap(p, 'text=Start'));
  if (started) { await p.waitForTimeout(3200); await p.screenshot({ path: `${OUT}/focus-running.png` }); }
  console.log('focus start ->', started);
  await tap(p, '[data-testid="tab-today"]');
  await p.waitForTimeout(1200);
  console.log('fab ->', await tap(p, '[data-testid="fab-add"]'));
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/add-sheet.png` });
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(800);
  console.log('settings ->', await tap(p, '[data-testid="open-settings"]'));
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${OUT}/settings.png` });
  console.log('app console errors:', errs.length ? errs.slice(0, 4).join(' | ') : 'NONE');
  await ctx.close();
}
await b.close();
console.log('BASELINE CAPTURE DONE');
