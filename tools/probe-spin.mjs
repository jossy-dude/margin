import { chromium } from 'playwright';

/* Do the clock faces' centre artifacts actually move?
 *
 *   node tools/probe-spin.mjs [--url http://localhost:8081] [--dark] [--face rb]
 *
 * Samples the `transform` of every animated view the live dial mounts (the ornament layers and the three
 * hands) for 3 s, and counts requestAnimationFrame ticks over the SAME window — a "nothing moved" reading
 * is worthless in a browser that is throttling frames, so the frame rate is reported next to it.
 * Headless Chrome throttles rAF for pages it believes are hidden, so this is evidence about the web build
 * only; the phone is judged by eye (docs/DEVICE_CHECKLIST.md).
 */
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8081');
const FACE = arg('face', null);

const FACES = { g: 'Guilloché Ivory', rb: 'Rosette Blanc', c: 'Celtic Knot', sl: 'Scales and Lily', s: 'Skeleton Movement' };

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
if (argv.includes('--dark')) await p.emulateMedia({ colorScheme: 'dark' });
const log = (...a) => console.log(...a);
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await p.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 180000 });
await p.waitForTimeout(9000);
await p.click('text=Skip').catch(() => {});
await p.waitForTimeout(4000);

if (FACE && FACES[FACE]) {
  await p.click('[data-testid="clock-face"]');            // tapping the masthead clock opens Settings at Clock face
  await p.waitForTimeout(2500);
  await p.click(`text=${FACES[FACE]}`);
  await p.waitForTimeout(2000);
  await p.mouse.click(20, 900);                            // click out of the sheet
  await p.waitForTimeout(2500);
}

const r = await p.evaluate(async () => {
  const host = document.querySelector('[role="img"][aria-label$="clock face"]');
  if (!host) return { error: 'no dial' };
  let frames = 0; const count = () => { frames++; requestAnimationFrame(count); }; requestAnimationFrame(count);
  const views = [...host.querySelectorAll('div')].filter((n) => getComputedStyle(n).transform !== 'none');
  const samples = views.map(() => []);
  const angle = (t) => { const m = /matrix\(([^)]*)\)/.exec(t); if (!m) return null; const [a, , , d] = m[1].split(/,\s*/).map(Number); return (Math.atan2(d, a) * 180) / Math.PI; };
  const t0 = performance.now(), until = Date.now() + 3000;
  while (Date.now() < until) {
    views.forEach((n, i) => samples[i].push(angle(getComputedStyle(n).transform)));
    await new Promise((res) => setTimeout(res, 100));
  }
  const secs = (performance.now() - t0) / 1000;
  return {
    label: host.getAttribute('aria-label'), size: Math.round(host.getBoundingClientRect().width),
    fps: (frames / secs).toFixed(1), vis: document.visibilityState,
    layers: views.map((n, i) => {
      const v = samples[i].filter((x) => x !== null), span = v.length ? Math.max(...v) - Math.min(...v) : 0;
      return { w: Math.round(n.getBoundingClientRect().width), moved: span > 0.4, span: +span.toFixed(1), samples: v.length };
    }),
  };
});
log(JSON.stringify(r, null, 2));
if (errs.length) log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
await b.close();
