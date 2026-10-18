/* W5a assertions for the honest label on Android alarms, as much as a browser can show.
 *
 *   node tools/w5-assert.mjs [--url http://localhost:8098] [--out .shots/w5]
 *
 * The web build has no notification module at all — which is exactly the state deliverable 6 is about —
 * so the browser can pin that copy honestly, and it can prove the D4 toggle really goes through the store
 * (Off survives a page change, so it is not component state). Everything a browser cannot honestly show
 * is printed as UNVERIFIED-ON-DEVICE with the phone step that would settle it; none of it is asserted here.
 *
 * One context, real time, 412x915, walking Settings → Reminders like a finger would:
 *   1 — the root Reminders row keeps W4's clock hint AND carries the short no-module addendum
 *   2 — the Reminders page says it once, in one sentence, ABOVE the D4 toggle
 *   3 — the D4 toggle round-trips through the store: Off, then a page change away and back, still Off
 *   4 — Delivery status says the same sentence before its own verdict, never "Next one rings", and
 *      opens at the top (the sub-page must not inherit the previous page's scroll — Sheet scrollKey)
 *   5 — the Reminders pages still read as designed (nothing on this build pretends otherwise)
 *
 * Exit code is non-zero if any hard assertion fails.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/w5');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, detail) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${detail}`); if (!pass) fails.push(n); };
const info = (s) => console.log(`     · ${s}`);
const uv = (s) => info(`UNVERIFIED-ON-DEVICE: ${s}`);

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
await p.waitForTimeout(5000);

/* Same tap rules as tools/cap-baseline.mjs and tools/w4-assert.mjs: RNW answers Pressability on
   POINTERDOWN, the Book keeps every screen mounted, and controls can sit below the fold. */
const tap = async (p, sel) => {
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

/* Leaf text nodes with a real box on the shipped screen (hidden Book pages sit at negative x). */
const LEAFS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    out.push({ t, x: r.x, y: r.y, fs: parseFloat(getComputedStyle(el).fontSize) });
  }
  return out;
})()`;
const leafs = (p) => p.evaluate(LEAFS);
const pageText = async (p) => (await leafs(p)).map((e) => e.t).join('');

/* The D4 switch has no `aria-checked` in this RNW build (same as W4's note on the clock toggle), so its
   state is read the way a person reads it: the track's own colour and where the knob sits. */
const SW = `(() => {
  const el = document.querySelector('[data-testid="show-reminder-text-on-the-lock-screen"]');
  if (!el) return null;
  const kids = [...el.querySelectorAll('div')];
  const track = kids.find((k) => k.style.width === '54px') || null;
  const knob = kids.find((k) => k.style.width === '22px') || null;
  const tx = knob ? (getComputedStyle(knob).transform.match(/matrix\\(([^)]*)\\)/) || [])[1] : null;
  return {
    bg: track ? getComputedStyle(track).backgroundColor : null,
    knob: tx ? Number(tx.split(',')[4]) : null,
  };
})()`;
const swState = (p) => p.evaluate(SW);

/** Settings → Reminders. `open-settings` is the gear on Today's header. */
const openSettings = async () => { await tap(p, '[data-testid="open-settings"]'); await p.waitForTimeout(1500); };
const openReminders = async () => { await tap(p, '[aria-label^="Reminders."]'); await p.waitForTimeout(1300); };

const NO_MODULE = 'This build has no notification module';
const ROW_HINT = 'alarms need the development build';

if (await tap(p, 'text=Skip')) { await p.waitForTimeout(2600); }
await p.waitForTimeout(600);

/* ── 1. the root Reminders row: W4's clock hint stays, the build fact is added next to it ─────────── */
await openSettings();
const rowLabel = await p.evaluate(`(() => {
  for (const el of document.querySelectorAll('[aria-label]')) {
    const a = el.getAttribute('aria-label') || '';
    if (!a.startsWith('Reminders.')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    return a;
  }
  return null;
})()`);
ok('1', !!rowLabel && /min before class/.test(rowLabel) && rowLabel.includes(ROW_HINT),
  `Reminders row aria-label: "${rowLabel ?? '—'}"`);
info('W4 pinned the clock in that hint (`min before class · quiet 22:00–07:00`); W5 appends the build fact rather than replacing it, so tools/w4-assert.mjs 7h still reads a clock there.');
await p.screenshot({ path: `${OUT}/settings-root-web.png` });

/* ── 2. the Reminders page says it once, above the D4 toggle ─────────────────────────────────────── */
await openReminders();
const rem = await pageText(p);
const toggleIdx = rem.indexOf('Show reminder text on the lock screen');
ok('2', rem.includes(NO_MODULE) && rem.includes('ringing reminders need the development build on a phone'),
  `Reminders page sentence: "${(rem.match(/This build has no notification module[^.]*\./) || ['—'])[0]}"`);
ok('2b', toggleIdx > 0 && rem.indexOf(NO_MODULE) < toggleIdx && rem.includes('When off, it still rings but the text stays hidden until you unlock'),
  `no-module sentence at ${rem.indexOf(NO_MODULE)}, D4 toggle at ${toggleIdx}`);
info('The toggle keeps its phone-behaviour hint, but the sentence that this build cannot schedule anything is above it, so the hint is never read as a promise about this browser.');
await p.screenshot({ path: `${OUT}/reminders-web.png` });

/* ── 3. the D4 toggle round-trips through the store, not through component state ─────────────────── */
const swOn = await swState(p);
const tappedOff = await tap(p, '[data-testid="show-reminder-text-on-the-lock-screen"]');
await p.waitForTimeout(900);
const swOff = await swState(p);
await tap(p, '[data-testid="sheet-back"]');
await p.waitForTimeout(900);
await openReminders();
const swBack = await swState(p);
const moved = !!swOn && !!swOff && swOn.bg !== swOff.bg && swOn.knob !== null && swOff.knob !== null && swOff.knob < swOn.knob;
ok('3', tappedOff && moved && JSON.stringify(swBack) === JSON.stringify(swOff),
  `track ${swOn?.bg} → ${swOff?.bg}; knob x ${swOn?.knob} → ${swOff?.knob}; after leaving the page and coming back ${swBack?.bg}/${swBack?.knob} (${JSON.stringify(swBack) === JSON.stringify(swOff) ? 'same state' : 'DID NOT STICK'})`);
const tappedBack = await tap(p, '[data-testid="show-reminder-text-on-the-lock-screen"]');
await p.waitForTimeout(900);
const swOnAgain = await swState(p);
ok('3b', tappedBack && !!swOnAgain && swOnAgain.bg === swOn.bg && swOnAgain.knob === swOn.knob,
  `back on: ${swOnAgain?.bg}/${swOnAgain?.knob} (was ${swOn?.bg}/${swOn?.knob})`);

/* ── 4. Delivery status: the same sentence, before its own verdict, and never a minute promise ────── */
await tap(p, '[aria-label^="Delivery status."]');
await p.waitForTimeout(1300);
const st = await pageText(p);
const leaves = await leafs(p);
ok('4', st.includes(NO_MODULE), `Delivery status sentence present: "${(st.match(/This build has no notification module[^.]*\./) || ['—'])[0]}"`);
const nmY = Math.min(...leaves.filter((e) => e.t.startsWith(NO_MODULE)).map((e) => e.y));
const verdictY = Math.min(...leaves.filter((e) => /^(Notifications are blocked\.|Notifications are allowed\.|The phone has not been asked yet\.|Asking this phone)/.test(e.t)).map((e) => e.y));
ok('4b', Number.isFinite(nmY) && Number.isFinite(verdictY) && nmY < verdictY,
  `build fact at y=${nmY ?? '—'}, phone verdict at y=${verdictY ?? '—'}`);
ok('4c', !/Next one rings/.test(st), `no "Next one rings" anywhere on the page (the phrase W5 removes): ${/Next one rings/.test(st) ? 'FOUND' : 'absent'}`);
/* The page must OPEN AT THE TOP: the sheet's ScrollView used to carry the previous page's scroll
   position across the sub-page swap (W5 vision round 1: the first line was cut under the header),
   so the fix (`Sheet scrollKey`) is pinned both at the mechanism (no retained scrollTop) and at
   the result (the red verdict line sits clear below the header). */
const retained = await p.evaluate(`(() => [...document.querySelectorAll('div')].filter((d) => d.scrollTop > 0).map((d) => d.scrollTop))()`);
const hdr = await p.locator('[aria-label="Delivery status"]').first().boundingBox().catch(() => null);
const line = await p.getByText('Notifications are blocked.').first().boundingBox().catch(() => null);
ok('4d', Array.isArray(retained) && retained.length === 0 && !!hdr && !!line && line.y > hdr.y + hdr.height,
  `retained scrollTop after nav: ${JSON.stringify(retained)}; header bottom ${hdr ? Math.round(hdr.y + hdr.height) : '?'} vs verdict line top ${line ? Math.round(line.y) : '?'}`);
info('The window wording ("planned for around HH:MM — give or take 5 min") only renders beside a real queued reminder; on web `queueRead` is false, so the page says it cannot count the queue instead of printing a window.');
await p.screenshot({ path: `${OUT}/delivery-status-web.png` });
info(`Delivery status from its own sentence on: ${st.slice(Math.max(0, st.indexOf(NO_MODULE)), Math.max(0, st.indexOf(NO_MODULE)) + 260)}…`);

/* ── what the browser cannot honestly show ───────────────────────────────────────────────────────── */
uv('Exact-alarm reachability: that declaring SCHEDULE_EXACT_ALARM makes expo-notifications take the `setExactAndAllowWhileIdle` branch — needs the phone. Checklist W5.1/W5.2.');
uv('The window wording with 3 reminders actually queued (and its absence of any "rings at HH:MM") — needs a phone with reminders allowed. Checklist W5.1.');
uv('D4 OFF: `lockscreenVisibility: SECRET` on the `classes` and `tasks` channels, and the delivery-status line reading the channel back (`AndroidNotificationVisibility`), including a channel that refuses the change. Checklist W5.3–W5.5.');
uv('That the lock-screen text is actually hidden until unlock, and that OFF still rings. Checklist W5.4.');
uv('Channel re-apply after boot: that the toggle rewrites the channels the phone already has. Checklist W5.3.');
uv('The h12 bodies of real reminders (`due 10:00 AM`) as the phone shows them. Checklist W5.6.');
uv('Anything full-screen: W5b, pending DECISIONS D9 — checklist §W5b.');

console.log('\nW5 console errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'NONE');
await ctx.close();
await b.close();
console.log(`\nW5 ASSERT: ${fails.length ? `FAIL (${fails.join(', ')})` : 'ALL PASS'}`);
process.exit(fails.length ? 1 : 0);
