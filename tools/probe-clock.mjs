import { chromium } from 'playwright';

/* Measure tap -> visible latency for the paths the owner called slow.
 *
 *   node tools/probe-clock.mjs [--url http://localhost:8099] [--dark]
 *
 * Reports, in ms, the time from the click to the target being present AND painted,
 * plus a long-task count so a jank-dominated path is distinguishable from a
 * mount-dominated one.
 */
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8099');
const DARK = argv.includes('--dark');

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 });
if (DARK) await p.emulateMedia({ colorScheme: 'dark' });

const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await p.addInitScript(() => {
  window.__lt = [];
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); })
      .observe({ entryTypes: ['longtask'] });
  } catch { /* not supported */ }
});

await p.goto(URL_, { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);
await p.click('text=Skip').catch(() => {});
await p.waitForTimeout(2500);

const ltReset = () => p.evaluate(() => { window.__lt = []; });
const ltSum = () => p.evaluate(() => (window.__lt || []).reduce((a, v) => a + v, 0));

/** Click `sel`, then wait until `until` is painted. Reports elapsed + long-task ms. */
async function step(label, sel, until, settle = 900) {
  await ltReset();
  const t0 = Date.now();
  await p.click(sel, { timeout: 15000 }).catch(() => {});
  let visible = -1;
  try {
    await p.waitForFunction((s) => {
      const el = document.querySelector(s) || [...document.querySelectorAll('*')].some((n) => n.textContent === s);
      if (!el) return false;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      return !r || (r.width > 0 && r.height > 0);
    }, until, { timeout: 15000 });
    visible = Date.now() - t0;
  } catch { /* not found within timeout */ }
  await p.waitForTimeout(settle);
  const long = await ltSum();
  const total = Date.now() - t0;
  console.log(
    `${label.padEnd(34)} visible=${String(visible).padStart(5)}ms  total=${String(total).padStart(5)}ms  longtasks=${Math.round(long)}ms`,
  );
  return visible;
}

await step('open Settings sheet', '[data-testid="open-settings"]', 'What should the app call you?');
await step('Settings -> Look & feel', 'text=Look & feel', 'Theme & palette');
await step('Look & feel -> Clock face', 'text=Clock face', 'Guilloché Ivory');
await step('pick a different face', 'text=Skeleton Movement', 'Guilloché Ivory', 1500);
await step('back to appearance', '[data-testid="settings-back"]', 'Theme & palette').catch(() => {});
await step('close sheet', '[data-testid="open-settings"]', 'Guilloché Ivory').catch(() => {});

if (errs.length) console.log('ERRORS:', errs.join(' | '));
await b.close();
