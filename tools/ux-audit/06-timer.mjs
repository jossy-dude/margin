/* Item 5 — Focus timer: open via the header glyph, drag the dial, use the a11y action,
 * start, watch the countdown tick, end the round, check the saved toast and Stats. */
import { launch, open, tap, drag, sheetOpen, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 800) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const dialInfo = () => p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Focus minutes'));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, cx: r.x + r.width / 2, cy: r.y + r.height / 2,
           valuetext: el.getAttribute('aria-valuetext') || el.getAttribute('aria-value') || el.textContent, role: el.getAttribute('role') };
});

/** the dial's own readout ("25 min"), not the preset buttons which read the same string. */
const readout = () => p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Focus minutes'));
  if (!el) return null;
  const hit = [...el.querySelectorAll('*')].find((n) => /^\d+ min$/.test((n.textContent || '').trim()));
  return hit ? (hit.textContent || '').trim() : null;
});

/* baseline Stats (so we can compare the focus total after saving a session) */
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2500);
const statsBefore = await p.evaluate(() => (document.body.innerText.match(/Focus heatmap[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' | '));
console.log('STATS BEFORE:', statsBefore);
await shot(p, 'stats-before-focus');

/* open the timer from the header glyph */
await tap(p, '[data-testid="tab-today"]');
await p.waitForTimeout(1500);
console.log('open-focus glyph ->', await tap(p, '[data-testid="open-focus"]'));
await p.waitForTimeout(2600);
console.log('--- focus screen ---\n' + (await text(700)));
await shot(p, 'focus-open');
console.log('dial:', JSON.stringify(await dialInfo()));
console.log('dial attributes:', JSON.stringify(await p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Focus minutes'));
  if (!el) return null; const o = {}; for (const a of el.attributes) o[a.name] = a.value.slice(0, 80); return o;
})));

/* DRAG the dial: sweep 90° counter-clockwise around its centre (= −15 min on a 25 min plan) */
const d = await dialInfo();
if (d) {
  const R = Number(d.box.split(' ')[1].split('x')[0]) / 2 * 0.95;
  const cx = d.cx, cy = d.cy, r = Math.max(90, R);
  const x1 = cx + r, y1 = cy;                 // 0° (right)
  const x2 = cx, y2 = cy - r;                 // −90° (up): 90° CCW → −15 min
  // arc through the upper-right quadrant
  const pts = [];
  for (let i = 1; i <= 14; i++) { const a = (-Math.PI / 2) * (i / 14); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  for (const [x, y] of pts) { await p.mouse.move(x, y); await p.waitForTimeout(45); }
  await p.mouse.up();
  await p.waitForTimeout(900);
}
console.log('readout before drag:', await readout());
console.log('after drag, readout:', await readout(), '| dial:', JSON.stringify(await dialInfo()));
console.log('focus readout line:', await p.evaluate(() => (document.body.innerText.match(/\d+\s?min\b[\s\S]{0,40}/) || [''])[0].replace(/\n/g, ' | ')));
await shot(p, 'focus-dial-dragged');

/* ACCESSIBILITY ACTION: focus the adjustable and send an increment key */
const before = await readout();
await p.evaluate(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Focus minutes')); el?.setAttribute('tabindex', '0'); el?.focus(); });
for (const k of ['ArrowUp', 'ArrowRight']) { await p.keyboard.press(k); await p.waitForTimeout(500); }
console.log('a11y readout before/after ArrowUp/ArrowRight:', before, '->', await readout());
console.log('dial valuetext attr now:', (await dialInfo())?.valuetext);
await shot(p, 'focus-a11y-action');

/* START */
console.log('Start ->', await tap(p, '[aria-label="Start"]') || await tap(p, 'text=Start'));
await p.waitForTimeout(2600);
const read1 = await p.evaluate(() => (document.body.innerText.match(/\d\d:\d\d/g) || []).join(','));
await shot(p, 'focus-running');
await p.waitForTimeout(5200);
const read2 = await p.evaluate(() => (document.body.innerText.match(/\d\d:\d\d/g) || []).join(','));
console.log('countdown readouts 5s apart:', read1, '->', read2, '| ticking:', read1 !== read2);
console.log('--- running screen ---\n' + (await text(500)));

/* END the round → saved toast */
console.log('end session ->', await tap(p, '[aria-label="End session and save"]'));
await p.waitForTimeout(1800);
const toastTxt = await p.evaluate(() => (document.body.innerText.match(/Saved[^\n]*/) || [''])[0]);
console.log('SAVED TOAST:', toastTxt || '(none found)');
await shot(p, 'focus-ended-toast');

/* where does the session show? Stats focus heatmap */
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2600);
const statsAfter = await p.evaluate(() => (document.body.innerText.match(/Focus heatmap[\s\S]{0,80}/) || [''])[0].replace(/\n/g, ' | '));
console.log('STATS AFTER:', statsAfter);
console.log('stats text head:\n' + (await text(600)));
await shot(p, 'stats-after-focus');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('TIMER DONE, next shot', nextN());
