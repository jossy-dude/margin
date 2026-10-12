import { chromium } from 'playwright';

/* Measure page-transition latency: press-in on a tab to the destination page PAINTED.
 *
 *   node tools/probe-tab.mjs [--url http://localhost:8099] [--dark] [--n 3]
 *
 * Two things this had to get right, both learned the hard way:
 *   1. `page.click()` does NOT reach React Native Web's Pressability, which answers on
 *      pointerdown. The tab writes its store route in press-in, so a plain click measures
 *      nothing — a real mouse down/up is required.
 *   2. The destination needle must be text unique to the destination PAGE. The nav bar
 *      always contains "Week", "To-do" etc., so matching those reports ~50 ms of nothing.
 *
 * "paint" is press-in to the destination's own heading being in the DOM and rAF-confirmed.
 * "long" is long-task ms inside that window: it separates a slow swap from a slow mount.
 */
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8099');
const DARK = argv.includes('--dark');
const N = Number(arg('n', '3'));

const TAB = { today: [52, 805], week: [124, 805], tasks: [196, 805], grades: [269, 805], stats: [341, 805] };
const NEEDLE = { today: 'Good morning', week: 'This week', tasks: 'swipe right', grades: 'Average', stats: 'Everything the app tracks' };

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2 });
if (DARK) await p.emulateMedia({ colorScheme: 'dark' });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await p.addInitScript(() => {
  window.__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch { /* unsupported */ }
});
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);
await p.click('text=Skip').catch(() => {});
await p.waitForTimeout(2500);

async function goto(t, settle = 700) {
  const [x, y] = TAB[t];
  await p.evaluate(() => { window.__lt = []; });
  const t0 = Date.now();
  await p.mouse.move(x, y);
  await p.mouse.down();
  const press = Date.now() - t0;                 // press-in is synchronous; this is ~0 by construction
  await p.mouse.up();
  let paint = -1;
  try {
    await p.waitForFunction((needle) => {
      const hit = [...document.querySelectorAll('*')].some((n) => n.children.length === 0 && (n.textContent || '').includes(needle));
      if (!hit) return false;
      return new Promise((r) => requestAnimationFrame(() => r(true)));
    }, NEEDLE[t], { timeout: 12000 });
    paint = Date.now() - t0;
  } catch { /* never painted */ }
  const long = await p.evaluate(() => (window.__lt || []).reduce((a, v) => a + v, 0));
  await p.waitForTimeout(settle);
  return { press, paint, long };
}

const order = ['today', 'week', 'tasks', 'grades', 'stats'];
const acc = new Map(order.map((t) => [t, []]));
for (let round = 0; round < N; round++) {
  for (let i = 1; i < order.length; i++) {
    const r = await goto(order[i]);
    acc.get(order[i]).push(r);
    console.log(`${order[i - 1]} -> ${order[i].padEnd(6)} press-in=${String(r.press).padStart(3)}ms  paint=${String(r.paint).padStart(5)}ms  longtasks=${Math.round(r.long)}ms`);
  }
}
console.log('\nmedian paint, per destination:');
for (const [t, rs] of acc) {
  const v = rs.map((r) => r.paint).filter((x) => x >= 0).sort((a, c) => a - c);
  console.log(`  ${t.padEnd(8)} ${v.length ? v[Math.floor(v.length / 2)] + 'ms' : 'never painted'}`);
}
if (errs.length) console.log('ERRORS:', errs.join(' | '));
await b.close();
