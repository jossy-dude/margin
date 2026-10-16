/* Item 4b (redo) — long-press the attendance cell/row AFTER the undo toast clears,
 * so the press lands on the row itself and we can read which sheet opens. */
import { launch, open, tap, longPress, tapUntil, sheetOpen, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 600) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const ROW = '[aria-label^="Computer Programming, 12:40"]';
const head = () => p.evaluate(() => {
  if (!document.querySelector('[data-testid="sheet-close"]')) return null;
  return document.body.innerText.replace(/\n+/g, ' / ').slice(0, 220);
});

/* mark it with one tap + a choice (mirrors 4a), then let the toast die */
await tapUntil(p, ROW, null, 3);
await p.waitForTimeout(1300);
if (await sheetOpen(p)) { await tap(p, '[aria-label="Here"]'); await p.waitForTimeout(1200); }
console.log('toast visible:', await p.evaluate(() => /Marked/.test(document.body.innerText)));
await p.waitForTimeout(7000); // TOAST_CLEAR
console.log('toast visible after wait:', await p.evaluate(() => /Marked/.test(document.body.innerText)));
console.log('row label:', await p.evaluate((s) => document.querySelector(s)?.getAttribute('aria-label') ?? null, ROW));

/* long-press the SAME row */
console.log('long-press ->', await longPress(p, ROW, 850));
await p.waitForTimeout(1500);
console.log('sheet open:', await sheetOpen(p));
console.log('sheet head:', await head());
await shot(p, 'attendance-longpress2');
if (await sheetOpen(p)) { await tap(p, '[data-testid="sheet-close"]'); await p.waitForTimeout(900); }

/* and once more while UNMARKED: fresh row (Database Systems, not yet marked) */
const ROW2 = '[aria-label^="Database Systems, 14:15"]';
console.log('long-press unmarked row ->', await longPress(p, ROW2, 850));
await p.waitForTimeout(1500);
console.log('sheet open:', await sheetOpen(p));
console.log('sheet head:', await head());
await shot(p, 'attendance-longpress-unmarked');
if (await sheetOpen(p)) { await tap(p, '[data-testid="sheet-close"]'); await p.waitForTimeout(700); }

/* compare: Grades grid is where the tour's "tap once marks, hold changes" lives — does it load? */
await tap(p, '[data-testid="tab-grades"]');
await p.waitForTimeout(3000);
const gradesTxt = await text(900);
console.log('--- Grades page ---\n' + gradesTxt);
const cells = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="att-cell-"]')].slice(0, 6).map((c) => `${c.getAttribute('data-testid')} :: ${c.getAttribute('aria-label')}`));
console.log('att cells:', JSON.stringify(cells, null, 1));
await shot(p, 'grades-page');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('DONE, next shot', nextN());
