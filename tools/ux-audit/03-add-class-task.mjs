/* Items 2 + 3 (web reality): the + FAB does not exist on web, so follow the paths a student
 * would actually find: Week → "+ Class", To-do → "New task".
 * Continues screenshot numbering from 15.
 */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = () => p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1400));

/* ── prove the FAB is absent on Today ── */
const fabInfo = await p.evaluate(() => {
  const fab = document.querySelector('[data-testid="fab-add"]');
  const rect = fab ? fab.getBoundingClientRect() : null;
  return { exists: !!fab, box: rect ? `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}x${Math.round(rect.height)}` : null,
           atFABcorner: (() => { const el = document.elementFromPoint(window.innerWidth - 50, window.innerHeight - 140); return el ? `${el.tagName}:${(el.getAttribute('aria-label') || el.textContent || '').slice(0, 60)}` : 'none'; })() };
});
console.log('FAB on Today:', JSON.stringify(fabInfo));
await shot(p, 'today-no-fab');

/* ── ITEM 2: add a class via Week → "+ Class" ── */
await tap(p, '[data-testid="tab-week"]');
await p.waitForTimeout(2200);
console.log('Week "+ Class" ->', await tap(p, '[aria-label="Class"]') || await tap(p, 'text=Class'));
await p.waitForTimeout(1800);
console.log('--- add class form ---\n' + (await text()));
await shot(p, 'add-class-form');
// Saturday is empty in the demo set; 09:30 keeps it unmistakable in the grid
console.log('day Sat ->', await tap(p, '[aria-label="Sat"]'));
await p.waitForTimeout(400);
for (let i = 0; i < 6; i++) { await tap(p, '[aria-label="Increase start"]'); await p.waitForTimeout(120); }
const formState = await p.evaluate(() => document.body.innerText.match(/Subject[\s\S]{0,260}/)?.[0]);
console.log('form state:\n', formState);
await shot(p, 'add-class-filled');
console.log('Save ->', await tap(p, 'text=Save'));
await p.waitForTimeout(2400);
const weekTxt = await text();
console.log('--- week after save ---\n' + weekTxt.slice(0, 700));
console.log('WEEK SHOWS NEW SAT 09:30 CLASS:', /09:30/.test(weekTxt) || /09:50/.test(weekTxt));
await shot(p, 'week-after-class-save');

/* ── ITEM 3: add an assignment via To-do → "New task" ── */
await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2200);
console.log('--- To-do before ---\n' + (await text()).slice(0, 600));
await shot(p, 'todo-before');
console.log('New task ->', await tap(p, '[aria-label="New task"]') || await tap(p, 'text=New task'));
await p.waitForTimeout(2000);
const opened = await p.evaluate(() => !!document.querySelector('input,textarea'));
console.log('task form opened (input present):', opened);
console.log('--- task form ---\n' + (await text()));
await shot(p, 'task-form');

if (opened) {
  const inpBox = await p.locator('input,textarea').first().boundingBox();
  await p.mouse.move(inpBox.x + 40, inpBox.y + inpBox.height / 2);
  await p.mouse.down(); await p.waitForTimeout(60); await p.mouse.up();
  await p.keyboard.type('Problem set 6', { delay: 25 });
  await p.waitForTimeout(500);
  console.log('typed:', await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map((e) => e.value).join(' / ')));

  console.log('Pick… ->', await tap(p, '[aria-label="Pick…"]'));
  await p.waitForTimeout(1200);
  await shot(p, 'task-due-picker');
  console.log('preset "Tomorrow 08:00" ->', await tap(p, '[aria-label="Tomorrow 08:00"]'));
  await p.waitForTimeout(900);
  console.log('due value row:', await p.evaluate(() => (document.body.innerText.match(/Due[\s\S]{0,120}/) || [''])[0]));
  await shot(p, 'task-due-set');

  console.log('Add ->', await tap(p, '[aria-label="Add"]') || await tap(p, 'text=Add'));
  await p.waitForTimeout(2500);
  console.log('--- after Add ---\n' + (await text()).slice(0, 500));
  await shot(p, 'task-added');
}

await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2200);
const todoTxt = await text();
console.log('TODO LISTS "Problem set 6":', /Problem set 6/.test(todoTxt));
console.log('--- To-do after ---\n' + todoTxt.slice(0, 800));
await shot(p, 'todo-after');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('DONE, next shot', nextN());
