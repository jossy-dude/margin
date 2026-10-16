/* Baseline captures for the v2-improvements pass: onboarding steps + every screen + key surfaces.
 *
 *   node tools/cap-baseline.mjs [--url http://localhost:8099] [--out .shots/baseline]
 *
 * Output: onboarding-1..5.png, today/week/tasks/grades/stats.png, focus.png (+focus-running.png when
 * a start control is found), task-sheet.png, settings.png. Prints console errors per context.
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
  /* The Book navigator keeps every screen mounted, so a `testID` can match up to six elements —
     hidden screens have no layout box, and tall pages put controls below the fold. Pick the first
     match with a real box, prefer one already inside the viewport, scroll it in, and never click
     into the void. */
  const loc = p.locator(sel);
  await loc.first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  const n = await loc.count();
  let inView = null, any = null;
  for (let i = 0; i < n; i++) {
    const l = loc.nth(i);
    const b = await l.boundingBox().catch(() => null);
    if (!b || b.width === 0 || b.height === 0) continue;
    if (b.y + b.height > 0 && b.y < H && b.x + b.width > 0 && b.x < W) { inView = l; break; }
    if (!any) any = l;
  }
  const target = inView ?? any;
  if (!target) return false;
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const b = await target.boundingBox().catch(() => null);
  if (!b || b.y + b.height <= 0 || b.y >= H) return false;
  await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
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
  const started = await tap(p, '[aria-label="Start"]');
  if (started) { await p.waitForTimeout(3200); await p.screenshot({ path: `${OUT}/focus-running.png` }); }
  console.log('focus start ->', started);
  // Focus hides the nav bar, so tab-today never resolves there; leave through the screen's own back.
  const exited = await tap(p, '[aria-label="Back to Today"]');
  await p.waitForTimeout(1400);
  console.log('focus exit ->', exited);
  // The global + FAB is native-only by design (src/ui/Overlay.tsx: web renders no Fab), so the
  // capture walks the reachable per-page "+" instead: Tasks → New task opens the task sheet.
  await tap(p, '[data-testid="tab-tasks"]');
  await p.waitForTimeout(1600);
  console.log('new-task ->', await tap(p, '[aria-label="New task"]'));
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${OUT}/task-sheet.png` });
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(900);
  console.log('settings ->', await tap(p, '[data-testid="open-settings"]'));
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${OUT}/settings.png` });
  console.log('app console errors:', errs.length ? errs.slice(0, 4).join(' | ') : 'NONE');
  await ctx.close();
}
await b.close();
console.log('BASELINE CAPTURE DONE');
