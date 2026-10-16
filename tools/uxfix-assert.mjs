/* UX batch 2 — DOM evidence for the four fixes taken from `reports/audit-ux.md` (UX-1, UX-2, UX-5, UX-7).
 *
 *   node tools/uxfix-assert.mjs [--url http://localhost:8098]
 *
 * All of it runs against the Metro dev build at a 412×915 phone viewport, deviceScaleFactor 2:
 *
 *   1. UX-1  `tools/ux-audit/probe-fab.mjs` found `fabExists:false` and no other `t:'add'` entry point on
 *            web. Now: `fab-add` exists on Today at 412×915, tapping it opens the Add sheet, and the two
 *            gates `showFab` already carried still hold — none while a sheet is open, none on Focus.
 *   2. UX-2  ending a session under a minute was silent (`timerFinish`'s `if (sum)` had no else). Now it
 *            toasts the reason, and a real round still toasts the `Saved …` line it always did. The
 *            "and nothing was written" half is a store rule, pinned in `src/test/rev.test.ts`, not here.
 *   3. UX-5  the audit's probe found the dial as `role=slider` with no value in the DOM and arrows doing
 *            nothing. Now the node carries aria-valuenow/min/max/valuetext and a tab stop, and
 *            ArrowUp/ArrowDown step the plan by the same ±5 the accessibilityActions already did.
 *   4. UX-7  a fresh context must load with zero uncaught page errors and zero <audio> play() attempts
 *            (the `navigator.vibrate` block is a console *warning* and is baseline, so pageerrors are
 *            counted separately and detailed) — while still attempting one on the first gesture that makes
 *            a sound, so the gate cannot be a mute button.
 *            The two one-off errors the audit flagged (`live is not defined`, `unknown colour token
 *            #FFFBF1`) are looked for explicitly on a cold document and reported either way.
 *
 * Two rules this repo's harnesses share: React Native Web answers Pressability on POINTERDOWN, so every
 * tap is mouse.down/up and never `click()`; and the Book mounts all six screens at once, so every query
 * is scoped to the one element with a real, in-viewport box (`tools/cap-baseline.mjs`).
 */
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const W = 412, H = 915;

const results = [];
const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`); };
const info = (name, detail) => console.log(`info  ${name}\n      ${detail}`);

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
/* UX-7's fix is a gate, and a gate can be wrong in the other direction: a `play()` that is never even
   attempted is a silent app. So the real <audio> attempts are counted too — zero before the first tap is
   the fix, and at least one after it proves the gate opens on the gesture that owns the first sound. */
await ctx.addInitScript(() => {
  window.__playCalls = 0;
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...a) { window.__playCalls++; return orig.apply(this, a); };
});
const p = await ctx.newPage();

/* pageerrors (uncaught exceptions and unhandled rejections) are the UX-7 signal; console.error lines are
   a different thing and are reported separately, because the vibrate line is baseline on web. */
const pageErrors = [], consoleErrors = [];
const detail = (e) => `${e.name}: ${e.message}` + (e.stack ? `\n        at ${e.stack.split('\n').slice(1, 5).map((s) => s.trim().replace(/^at /, '')).join('\n        at ')}` : '');
p.on('pageerror', (e) => pageErrors.push(detail(e)));
p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

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
/** a real pointer press: RNW's Pressability never sees a synthetic `click()` */
async function tap(sel) {
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
}
const count = async (sel) => p.locator(sel).count();
const attr = async (sel, name) => { const l = await visible(sel); return l ? l.getAttribute(name) : null; };
const shown = async (sel) => { const l = await visible(sel); return l ? (((await l.textContent()) ?? '').trim()) : null; };
/** the undo toast's own text: the dismiss button's parent is the toast row (`Overlay.tsx`) */
async function toastText() {
  const d = await visible('[data-testid="toast-dismiss"]');
  if (!d) return null;
  return (await d.evaluate((n) => (n.parentElement?.textContent ?? '').trim())) || null;
}

// ───────────────────────────── UX-7 · a cold document, before any tap ─────────────────────────────
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
await p.waitForTimeout(9000);
const coldErrors = pageErrors.length, coldConsole = consoleErrors.length;
const coldPlays = await p.evaluate(() => window.__playCalls);
console.log(`cold load: ${coldErrors} pageerror(s), ${coldPlays} <audio> play() attempt(s), ${coldConsole} console.error line(s) in 9s, zero taps`);

// ───────────────────────────── UX-1 · the + is on web, and its gates hold ─────────────────────────────
/* The tour's forward button is the first thing in the app that makes a sound, and it must still be heard:
   the gate opens in the capture phase of the gesture, i.e. before the handler that plays that sound. */
const nexted = await tap('[aria-label^="Next"]');
await p.waitForTimeout(1800);
const playsAfterFirstGesture = await p.evaluate(() => window.__playCalls);
console.log(`first sounding gesture (tour Next) -> ${nexted}; <audio> play() attempts after it: ${playsAfterFirstGesture}`);

console.log('skip onboarding ->', await tap('text=Skip'));
await p.waitForTimeout(2400);

const fabBox = await (async () => { const l = await visible('[data-testid="fab-add"]'); return l ? l.boundingBox() : null; })();
check('1. the + FAB exists on Today at 412×915 (web)', !!fabBox,
  `[data-testid="fab-add"] ${fabBox ? `box ${fabBox.x.toFixed(0)},${fabBox.y.toFixed(0)} ${fabBox.width.toFixed(0)}×${fabBox.height.toFixed(0)}` : 'NOT FOUND'}`);

const openedAdd = await tap('[data-testid="fab-add"]');
await p.waitForTimeout(700);
const addTiles = await count('[aria-label="Add Assignment"]');
const addHeading = await attr('[role="heading"][aria-label="Add"]', 'aria-label').catch(() => null);
check('1b. tapping the FAB opens the Add sheet', openedAdd && addTiles > 0,
  `tap -> ${openedAdd}; "Add Assignment" tiles in the sheet: ${addTiles}; sheet header: ${addHeading ?? 'n/a'}`);

const fabWhileSheet = await count('[data-testid="fab-add"]');
check('1c. no FAB while a sheet is open (the showFab gate is untouched)', fabWhileSheet === 0,
  `[data-testid="fab-add"] nodes while the Add sheet is open: ${fabWhileSheet}`);

await tap('[data-testid="sheet-close"]');
await p.waitForTimeout(900);
await tap('[data-testid="open-focus"]');
await p.waitForTimeout(2600);
const fabOnFocus = await count('[data-testid="fab-add"]');
check('1d. no FAB on Focus (the route half of the gate is untouched)', fabOnFocus === 0,
  `[data-testid="fab-add"] nodes on Focus: ${fabOnFocus}`);

// ───────────────────────────── UX-5 · role=slider with a value, and arrow keys that work ─────────────────────────────
const dialSel = '[data-testid="focus-dial"]';
const dialAttrs = await (async () => {
  const l = await visible(dialSel);
  if (!l) return null;
  return l.evaluate((n) => ['role', 'tabindex', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-valuetext'].map((a) => `${a}="${n.getAttribute(a) ?? ''}"`).join(' '));
})();
const hasValue = !!dialAttrs && /role="slider"/.test(dialAttrs)
  && /aria-valuenow="\d+"/.test(dialAttrs) && /aria-valuemin="\d+"/.test(dialAttrs)
  && /aria-valuemax="\d+"/.test(dialAttrs) && /aria-valuetext="[^"]+"/.test(dialAttrs);
check('3. the dial is a slider and carries its value in the DOM', hasValue,
  `${dialAttrs ?? 'dial not found'}; shown minutes: ${JSON.stringify(await shown('[data-testid="focus-time-text"]'))}`);

const dial = await visible(dialSel);
await dial.focus().catch(() => {});
const focused = await p.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName ?? 'none');
const upBefore = { min: await attr(dialSel, 'aria-valuenow'), text: await shown('[data-testid="focus-time-text"]') };
await p.keyboard.press('ArrowUp');
await p.waitForTimeout(500);
const upAfter = { min: await attr(dialSel, 'aria-valuenow'), text: await shown('[data-testid="focus-time-text"]'), vtext: await attr(dialSel, 'aria-valuetext') };
check('3b. ArrowUp on the focused dial steps the plan by 5 minutes', focused === 'focus-dial' && upAfter.min === String(Number(upBefore.min) + 5) && upAfter.text === `${Number(upBefore.min) + 5} min`,
  `activeElement=${focused}; aria-valuenow ${upBefore.min} -> ${upAfter.min}; aria-valuetext "${upAfter.vtext}"; readout ${JSON.stringify(upBefore.text)} -> ${JSON.stringify(upAfter.text)}`);

await p.keyboard.press('ArrowDown');
await p.waitForTimeout(500);
const downAfter = { min: await attr(dialSel, 'aria-valuenow'), text: await shown('[data-testid="focus-time-text"]') };
check('3c. ArrowDown steps it back', downAfter.min === upBefore.min && downAfter.text === upBefore.text,
  `aria-valuenow ${upAfter.min} -> ${downAfter.min}; readout ${JSON.stringify(upAfter.text)} -> ${JSON.stringify(downAfter.text)}`);

// ───────────────────────────── UX-2 · the sub-minute finish speaks ─────────────────────────────
const started = await tap('[aria-label="Start"]');
await p.waitForTimeout(8000); // well under the 60 s the store saves at
const endedShort = await tap('[aria-label="End session and save"]');
await p.waitForTimeout(500);
const shortToast = await toastText();
check('2. ending under a minute toasts the reason instead of going silent', started && endedShort && !!shortToast && /under a minute/i.test(shortToast) && !/^Saved \d/.test(shortToast),
  `start -> ${started}, end -> ${endedShort}; toast: ${JSON.stringify(shortToast)}`);

const backToSet = await shown('[data-testid="focus-time-text"]');
info('2b. the timer is back in the set phase after the discard', `readout: ${JSON.stringify(backToSet)}`);

// a round that really ran: past the 60 s the store's rule asks for, so the old toast must be untouched
const started2 = await tap('[aria-label="Start"]');
await p.waitForTimeout(64000);
const endedLong = await tap('[aria-label="End session and save"]');
await p.waitForTimeout(500);
const longToast = await toastText();
check('2c. a round past a minute still toasts the unchanged `Saved …` line', started2 && endedLong && !!longToast && /^Saved \d+ min of focus$/.test(longToast),
  `start -> ${started2}, waited 64s, end -> ${endedLong}; toast: ${JSON.stringify(longToast)}`);

// ───────────────────────────── the audit's two flagged one-offs, on a cold document ─────────────────────────────
const beforeGrades = pageErrors.length;
await tap('[data-testid="tab-grades"]');
await p.waitForTimeout(3000);
const gradesErrors = pageErrors.slice(beforeGrades);
info('flagged one-offs “live is not defined” / “unknown colour token #FFFBF1”',
  `Grades run: ${gradesErrors.length} pageerror(s)${gradesErrors.length ? ` — ${gradesErrors.join(' | ')}` : ''}; ` +
  `cold load: ${coldErrors}; whole run: ${pageErrors.length}`);

// ───────────────────────────── UX-7 verdict ─────────────────────────────
check('4. zero uncaught page errors on a cold document (UX-7)', coldErrors === 0,
  `pageerrors before the first tap: ${coldErrors}${coldErrors ? ` — ${pageErrors.slice(0, coldErrors).join(' | ')}` : ''}`);
check('4b. zero uncaught page errors across the whole run', pageErrors.length === 0,
  `pageerrors over the run: ${pageErrors.length}${pageErrors.length ? ` — ${pageErrors.join(' | ')}` : ''}`);
check('4c. the gate is not a mute button: <audio> play() is attempted again by the first sounding gesture', coldPlays === 0 && playsAfterFirstGesture > 0,
  `play() attempts — cold load: ${coldPlays}, after the tour's own Next (fx.page): ${playsAfterFirstGesture}`);
info('console.error lines (not pageerrors; the vibrate block is baseline)',
  consoleErrors.length ? `${consoleErrors.length}: ${[...new Set(consoleErrors)].slice(0, 3).join(' | ')}` : 'none');

await ctx.close();
await b.close();
console.log(results.every(Boolean) ? 'UX FIX ASSERT: ALL PASS' : 'UX FIX ASSERT: FAILURES ABOVE');
process.exitCode = results.every(Boolean) ? 0 : 1;
