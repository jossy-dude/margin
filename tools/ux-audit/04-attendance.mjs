/* Item 4 — attendance: Today class row tap-once, long-press, day-level row, plus Week's hint. */
import { launch, open, tap, longPress, tapUntil, sheetOpen, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 700) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const rowLabel = (sel) => p.evaluate((s) => { const el = document.querySelector(s); return el ? el.getAttribute('aria-label') : null; }, sel);

const ROW = '[aria-label^="Computer Programming, 12:40"]';
console.log('today rows:', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /\d\d:\d\d to \d\d:\d\d/.test(l)), null)));

/* 4a — tap once: does it mark, or open a sheet? */
console.log('4a tap once ->', await tapUntil(p, ROW, null, 3));
await p.waitForTimeout(1400);
console.log('sheet open after one tap:', await sheetOpen(p));
console.log('row aria-label now:', await rowLabel(ROW));
console.log('--- screen after one tap ---\n' + (await text(500)));
await shot(p, 'attendance-tap-once');

/* choose "Here" in the sheet, then confirm the row is marked */
if (await sheetOpen(p)) {
  console.log('tap "Here" ->', await tap(p, '[aria-label="Here"]'));
  await p.waitForTimeout(1500);
}
console.log('row aria-label after "Here":', await rowLabel(ROW));
await shot(p, 'attendance-after-here');

/* 4b — long-press the same cell/row */
console.log('4b long-press ->', await longPress(p, ROW, 800));
await p.waitForTimeout(1500);
console.log('sheet open after long-press:', await sheetOpen(p));
const sheetTitle = await p.evaluate(() => {
  const close = document.querySelector('[data-testid="sheet-close"]');
  if (!close) return null;
  const box = close.closest('[data-testid="sheet-close"]').parentElement;
  return (box?.parentElement?.innerText || document.body.innerText).split('\n').slice(0, 6).join(' / ');
});
console.log('sheet head after long-press:', sheetTitle);
console.log('--- screen after long-press ---\n' + (await text(400)));
await shot(p, 'attendance-longpress');
if (await sheetOpen(p)) { await tap(p, '[data-testid="sheet-close"]'); await p.waitForTimeout(900); }

/* 4c — day-level row: "Mark day" */
console.log('4c Mark day ->', await tapUntil(p, '[aria-label="Mark day"]', () => true, 3).catch(() => false));
await p.waitForTimeout(1200);
console.log('day sheet open:', await sheetOpen(p));
console.log('--- day sheet ---\n' + (await text(500)));
await shot(p, 'attendance-day-row');
if (await sheetOpen(p)) {
  console.log('close day sheet ->', await tap(p, '[data-testid="sheet-close"]'));
  await p.waitForTimeout(900);
}

/* 4d — Week's own hint: "Tap a block to mark attendance" */
await tap(p, '[data-testid="tab-week"]');
await p.waitForTimeout(2200);
const block = await p.evaluate(() => { const el = [...document.querySelectorAll('button[aria-label]')].find((b) => /, \w{3} \d\d:\d\d to \d\d:\d\d/.test(b.getAttribute('aria-label') || '')); return el ? el.getAttribute('aria-label') : null; });
console.log('week block picked:', block);
console.log('week block tap ->', await tap(p, `[aria-label="${block}"]`));
await p.waitForTimeout(1500);
console.log('sheet open after one tap on Week block:', await sheetOpen(p));
await shot(p, 'attendance-week-block-tap');
if (await sheetOpen(p)) { await tap(p, '[data-testid="sheet-close"]'); await p.waitForTimeout(800); }

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('ATTENDANCE DONE, next shot', nextN());
