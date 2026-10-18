/* Item 2 — add a class (web has no + FAB; the real path is Week → "+ Class").
 * Item 3 — add an assignment with a due date from To-do and confirm it on the list.
 * Fresh context per item: the web repo is in-memory, but the flows are independent anyway. */
import { launch, open, tap, tapUntil, sheetOpen, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const allErrs = [];

const text = (p, n = 1200) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
/** Bring a control into the viewport (inner ScrollView / sheet content).
 *  Book keeps screens mounted: prefer the first match with a real size — a zero-size
 *  duplicate can sit first in DOM order. */
const reveal = async (p, sel) => p.evaluate((s) => {
  const els = [...document.querySelectorAll(s)];
  const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) ?? null;
  if (!el) return false;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  return true;
}, sel).then(() => p.waitForTimeout(700));
/** On-screen rect of an element (Book keeps screens mounted: a selector can match hidden nodes). */
const rect = (p, sel) => p.evaluate((s) => {
  const el = [...document.querySelectorAll(s)]
    .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; });
  if (!el) return null;
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}, sel);
const tapRect = async (p, r) => {
  await p.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(200);
  return true;
};
const typeInto = async (p, sel, str) => {
  const r = await rect(p, sel);
  if (!r) return false;
  await tapRect(p, r);
  await p.keyboard.type(str, { delay: 30 });
  await p.waitForTimeout(300);
  return true;
};

/* ══ Item 3 — add an assignment from To-do ══ */
{
  const { ctx, p, errs } = await open(b, { skip: true });
  allErrs.push(...errs);
  errs.length = 0;

  await tap(p, '[data-testid="tab-tasks"]');
  await p.waitForTimeout(2200);
  console.log('--- To-do before ---\n' + (await text(p, 700)));
  await shot(p, 'todo-before');

  console.log('reveal New task ->', await reveal(p, '[data-testid="new-task"]'));
  console.log('tap New task ->', await tapUntil(p, '[data-testid="new-task"]',
    async () => !!(await rect(p, '[data-testid="what-is-it"]')), 3));
  await p.waitForTimeout(800);
  console.log('--- task sheet ---\n' + (await text(p, 500)));
  await shot(p, 'task-sheet');

  console.log('type title ->', await typeInto(p, '[data-testid="what-is-it"]', 'Lab report 4'));

  /* Due: the preset strip is horizontal — scroll it into view first, fall back to the "Pick…" day strip. */
  await reveal(p, '[data-testid="tomorrow-0800"]');
  let dueSel = '[data-testid="tomorrow-0800"]';
  if (!(await rect(p, dueSel))) {
    console.log('preset off-strip, falling back to Pick…');
    dueSel = '[data-testid="pick"]';
    await reveal(p, dueSel);
    console.log('tap Pick… ->', await tapUntil(p, dueSel, () => true, 3));
    await p.waitForTimeout(700);
    const tomorrow = await p.evaluate(() => {
      const d = new Date(Date.now() + 86400000);
      const DW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${DW[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
    });
    dueSel = `[aria-label="${tomorrow}"]`;
    await reveal(p, dueSel);
  }
  console.log('tap due preset (' + dueSel + ') ->', await tapUntil(p, dueSel, () => true, 3));
  await p.waitForTimeout(700);
  const dueShown = await p.evaluate(() => document.body.innerText.match(/Due[\s\S]{0,160}/)?.[0]?.replace(/\n/g, ' | '));
  console.log('due preview:', dueShown);
  console.log('title value:', await p.evaluate(() => document.querySelector('[data-testid="what-is-it"]')?.value));
  await shot(p, 'task-filled');

  /* Footer "Add" (aria-label exact "Add"; the "+ add" reminder chip's label is "+ add") */
  console.log('tap Add ->', await tapUntil(p, '[aria-label="Add"]',
    async () => !(await sheetOpen(p)), 3));
  await p.waitForTimeout(1600);
  const toast = await p.evaluate(() => document.body.innerText.match(/added[^\n]*|Saved[^\n]*/)?.[0] ?? 'NO TOAST');
  console.log('toast/copy after Add:', toast);
  const after = await text(p, 1400);
  console.log('--- To-do after ---\n' + after);
  console.log('TITLE VISIBLE ON TO-DO:', /Lab report 4/.test(after));
  const card = await p.evaluate(() => [...document.querySelectorAll('[aria-label^="Lab report 4"]')].map((e) => e.getAttribute('aria-label'))[0] ?? null);
  console.log('new card aria-label (due copy):', card);
  /* frame the new card, not whatever the list happened to be scrolled to */
  await reveal(p, '[aria-label^="Lab report 4"]');
  await p.waitForTimeout(400);
  console.log('card rect after reveal:', JSON.stringify(await p.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label^="Lab report 4"]')]
      .find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return 'NOT FOUND';
    const r = el.getBoundingClientRect();
    const sc = (() => { let e = el.parentElement; while (e && e !== document.body) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 10) return { sh: e.scrollHeight, ch: e.clientHeight, st: e.scrollTop }; e = e.parentElement; } return null; })();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), scroller: sc };
  })));
  await shot(p, 'todo-after-add');
  allErrs.push(...errs);
  await ctx.close();
}

/* ══ Item 2 — add a class from Week ══ */
{
  const { ctx, p, errs } = await open(b, { skip: true });
  allErrs.push(...errs);
  errs.length = 0;

  await tap(p, '[data-testid="tab-week"]');
  await p.waitForTimeout(2200);
  console.log('--- Week before ---\n' + (await text(p, 700)));
  await shot(p, 'week-before-class');

  console.log('reveal "+ Class" ->', await reveal(p, '[data-testid="class"]'));
  console.log('tap "+ Class" ->', await tapUntil(p, '[data-testid="class"]',
    async () => (await text(p, 300)).includes('Add class'), 3));
  await p.waitForTimeout(800);
  console.log('--- Add class sheet ---\n' + (await text(p, 600)));
  await shot(p, 'add-class-sheet');

  console.log('tap day Sat ->', await tapUntil(p, '[data-testid="sat"]', () => true, 3));
  await p.waitForTimeout(500);
  const form = await p.evaluate(() => document.body.innerText.match(/Add class[\s\S]{0,320}/)?.[0]?.replace(/\n/g, ' | '));
  console.log('form state:', form);
  await shot(p, 'add-class-filled');

  console.log('tap Save ->', await tapUntil(p, '[data-testid="save"]',
    async () => !(await sheetOpen(p)), 3));
  await p.waitForTimeout(1800);
  const after = await text(p, 1400);
  console.log('--- Week after ---\n' + after);
  const satBlock = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label]')]
      .find((e) => /, Sat \d{2}:\d{2} to \d{2}:\d{2}/.test(e.getAttribute('aria-label') || ''));
    return el ? el.getAttribute('aria-label') : null;
  });
  console.log('SAT BLOCK ON WEEK:', satBlock);
  /* frame the new Sat block (grid header + the 09:00 row), not the mid-grid scroll position */
  await reveal(p, '[aria-label^="Intro to Economics, Sat"]');
  await p.waitForTimeout(400);
  await shot(p, 'week-after-class');
  allErrs.push(...errs);
  await ctx.close();
}

console.log('errors:\n  ' + (dedupe(allErrs).length ? dedupe(allErrs).join('\n  ') : 'NONE'));
await b.close();
console.log('ADD FLOWS DONE, next shot', nextN());
