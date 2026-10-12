import { chromium } from 'playwright';

/* Capture a phone-sized screenshot of the served web build, skipping onboarding.
 *
 *   node tools/cap.mjs <out.png> [--route today|week|tasks|grades|stats]
 *                     [--theme dark|light] [--sheet] [--settings <path>]
 *                     [--click "text"] [--wait 2500] [--w 393] [--h 851]
 *
 * `--sheet` opens the + FAB first. `--settings appearance|bar|...` opens a Settings page.
 * `--click` clicks an arbitrary selector before capturing (repeatable by passing several).
 *
 * Console errors are printed after the path, so a capture that "worked" but threw is still visible.
 */
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const has = (n) => argv.includes(`--${n}`);
const clicks = argv.reduce((acc, a, i) => (a === '--click' ? [...acc, argv[i + 1]] : acc), []);

const out = argv[0];
const route = arg('route', '');
const theme = arg('theme', '');
const URL_ = arg('url', 'http://localhost:8099');
const W = Number(arg('w', '393')), H = Number(arg('h', '851'));

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });

/* React Native Web's Pressability answers on POINTERDOWN, not on `click`. `page.click()` dispatches a
 * full click sequence but the press-in handlers this app uses — every tab, every button — did not fire
 * under it, which silently produced screenshots of the page that never changed. `tap` does a real
 * down/up at the element's centre, which is the thing the finger actually does. */
const tap = async (sel) => {
  const box = await p.locator(sel).first().boundingBox();
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  return true;
};
// The app's default theme is 'auto', which resolves through React Native's useColorScheme —
// so emulating the OS is both the reliable and the honest way to capture dark mode, rather
// than clicking through Settings and hoping the sheet closed in time.
if (has('dark')) await p.emulateMedia({ colorScheme: 'dark' });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 260)));

await p.goto(URL_, { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);

// onboarding gates every screen; Skip is always top-right
await tap('text=Skip').catch(() => {});
await p.waitForTimeout(2500);

if (theme) {
  await tap('[data-testid="open-settings"]').catch(() => {});
  await p.waitForTimeout(2400);
  // Settings opens on "Look & feel"; theme lives one level deeper
  await tap('text=Theme & palette').catch(() => {});
  await p.waitForTimeout(1800);
  await tap(`text=${theme === 'dark' ? 'Dark' : 'Cream'}`).catch(() => {});
  await p.waitForTimeout(1800);
  // the theme is applied on select; close so the page behind it can be captured
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(900);
  await p.mouse.click(W / 2, 24).catch(() => {});
  await p.waitForTimeout(900);
  await p.mouse.click(14, 24).catch(() => {});
  await p.waitForTimeout(1400);
}
const settings = arg('settings', '');
if (settings) {
  await tap('[data-testid="open-settings"]').catch(() => {});
  await p.waitForTimeout(2400);
  await tap(`text=${settings}`).catch(() => {});
  await p.waitForTimeout(2000);
}
if (has('sheet')) {
  await tap('[data-testid="fab-add"]').catch(() => {});
  await p.waitForTimeout(2200);
}
if (route) { await tap(`[data-testid="tab-${route}"]`).catch(() => {}); await p.waitForTimeout(Number(arg('wait', '2600'))); }
for (const c of clicks) { await tap(c).catch(() => {}); await p.waitForTimeout(1600); }
await p.waitForTimeout(Number(arg('tail', '600')));

await p.screenshot({ path: out, fullPage: false });
console.log(out);
console.log(errs.length ? errs.slice(0, 5).join('\n') : 'NO CONSOLE ERRORS');
await b.close();
