/* Item 6 — Grades: read the page, add a mark, exercise the real attendance grid
 * (tap once marks / second tap refused / long-press opens the change sheet). */
import { launch, open, tap, longPress, tapUntil, sheetOpen, shot, shotFull, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 1200) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const scroll = async (dy) => { await p.mouse.move(206, 500); await p.mouse.wheel(0, dy); await p.waitForTimeout(900); };
/** The page scrolls in an inner ScrollView: a control below the fold has a box outside the viewport,
 *  and a pointerdown at those coordinates hits nothing. Bring it into view first. */
const reveal = async (sel) => p.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); return true; }, sel).then(() => p.waitForTimeout(700));

await tap(p, '[data-testid="tab-grades"]');
await p.waitForTimeout(2600);
console.log('--- Grades top ---\n' + (await text(900)));
await shot(p, 'grades-top');

/* 6a — add a mark via the per-subject "+ Mark" */
await reveal('[aria-label="Mark"]');
console.log('"+ Mark" ->', await tapUntil(p, '[aria-label="Mark"]', () => true, 3));
await p.waitForTimeout(1600);
console.log('--- mark sheet ---\n' + (await text(700)));
await shot(p, 'grade-mark-form');

/* Book keeps all screens mounted: only count inputs that are actually on screen */
const hasInput = await p.evaluate(() => [...document.querySelectorAll('input,textarea')]
  .some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; }));
console.log('visible input in sheet:', hasInput, '| sheetOpen:', await sheetOpen(p));
if (hasInput && (await sheetOpen(p))) {
  /* locate by viewport intersection directly: Playwright's :visible can still match
   * a mounted-but-offscreen screen's input */
  const rect = await p.evaluate(() => {
    const el = [...document.querySelectorAll('input,textarea')]
      .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r2 = el.getBoundingClientRect();
    return { x: r2.x, y: r2.y, w: r2.width, h: r2.height };
  });
  console.log('input rect:', JSON.stringify(rect));
  if (!rect) throw new Error('no on-screen input found in Add Mark sheet');
  const box = rect;
  await p.mouse.move(rect.x + 30, rect.y + rect.h / 2);
  await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
  await p.keyboard.type('Quiz 3', { delay: 25 });
  await p.waitForTimeout(400);
  // Already marked defaults ON in the new-mark sheet; raise the score 70 -> 85
  for (let i = 0; i < 3; i++) { await tap(p, '[aria-label="Increase score"]'); await p.waitForTimeout(200); }
  console.log('form values:', await p.evaluate(() => document.body.innerText.match(/What was it\?[\s\S]{0,200}/)?.[0]?.replace(/\n/g, ' | ')));
  await shot(p, 'grade-mark-filled');
  console.log('Save ->', await tap(p, '[data-testid="save"]'));
  await p.waitForTimeout(2000);
}
const afterAdd = await text(1400);
console.log('--- Grades after save ---\n' + afterAdd);
console.log('MARK VISIBLE (Quiz 3):', /Quiz 3/.test(afterAdd));
await shot(p, 'grades-after-mark');

/* 6b — the attendance grid */
await scroll(700); await scroll(700);
console.log('--- scrolled ---\n' + (await text(700)));
await shot(p, 'grades-attendance-grid');

/* pick an UNMARKED (future) cell: no "Here," in its label */
const pick = await p.evaluate(() => {
  const cells = [...document.querySelectorAll('[data-testid^="att-cell-"]')];
  const el = cells.find((c) => /not marked yet$/.test(c.getAttribute('aria-label') || '') && !(c.getAttribute('aria-label') || '').startsWith('Here,'));
  return el ? { id: el.getAttribute('data-testid'), label: el.getAttribute('aria-label') } : null;
});
console.log('picked cell:', JSON.stringify(pick));
if (pick) {
  const sel = `[data-testid="${pick.id}"]`;
  await reveal(sel);
  console.log('tap once ->', await tapUntil(p, sel, null, 3));
  await p.waitForTimeout(1200);
  const l1 = await p.evaluate((s) => document.querySelector(s)?.getAttribute('aria-label'), sel);
  console.log('label after 1 tap:', l1, '| changed:', l1 !== pick.label);
  await shot(p, 'att-cell-tapped-once');

  console.log('tap a second time ->', await tap(p, sel));
  await p.waitForTimeout(1200);
  const l2 = await p.evaluate((s) => document.querySelector(s)?.getAttribute('aria-label'), sel);
  console.log('label after 2nd tap:', l2, '| refused (unchanged):', l1 === l2);
  await shot(p, 'att-cell-second-tap');

  console.log('long-press ->', await longPress(p, sel, 850));
  await p.waitForTimeout(1500);
  console.log('sheet open:', await sheetOpen(p));
  console.log('sheet head:', await p.evaluate(() => document.body.innerText.replace(/\n+/g, ' / ').slice(0, 200)));
  await shot(p, 'att-cell-longpress-sheet');
  if (await sheetOpen(p)) { await tap(p, '[data-testid="sheet-close"]'); await p.waitForTimeout(700); }
} else {
  console.log('NO UNMARKED CELL FOUND — grid dump:');
  console.log(await text(600));
}

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('GRADES DONE, next shot', nextN());
