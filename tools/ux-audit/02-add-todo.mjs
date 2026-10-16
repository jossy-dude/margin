/* Walkthrough items 2 + 3 — add a class, then add an assignment with a due date, confirm on To-do.
 * One context (in-memory repo resets on reload), screenshots 08+.
 */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = () => p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200));

console.log('=== ITEM 2: add a class from the + FAB ===');
console.log('fab ->', await tap(p, '[data-testid="fab-add"]'));
await p.waitForTimeout(2200);
console.log('--- add sheet text ---\n' + (await text()));
await shot(p, 'add-sheet');

// Follow the class path
console.log('Add Class ->', await tap(p, '[aria-label="Add Class"]'));
await p.waitForTimeout(1800);
console.log('--- add class form text ---\n' + (await text()));
await shot(p, 'add-class-form');

// Saturday is empty in the demo set, so a class saved there is unambiguous in Week
await tap(p, '[aria-label="Sat"]');
await p.waitForTimeout(400);
// nudge the start time so the class is visibly new (09:00 -> 09:30)
for (let i = 0; i < 6; i++) { await tap(p, '[aria-label="Increase start"]'); await p.waitForTimeout(150); }
console.log('--- form after day+time ---\n' + (await text()));
await shot(p, 'add-class-filled');
console.log('Save ->', await tap(p, '[data-testid="btn-save"]') || await tap(p, 'text=Save'));
await p.waitForTimeout(2200);
console.log('after save, today text starts:', (await text()).slice(0, 200).replace(/\n/g, ' | '));
await shot(p, 'after-class-save');

// Verify on Week
await tap(p, '[data-testid="tab-week"]');
await p.waitForTimeout(2400);
const weekTxt = await text();
console.log('--- week text ---\n' + weekTxt.slice(0, 900));
console.log('WEEK MENTIONS 09:30 Sat class:', /09:30/.test(weekTxt));
await shot(p, 'week-after-class');

console.log('=== ITEM 3: add an assignment with a due date ===');
await tap(p, '[data-testid="tab-today"]');
await p.waitForTimeout(1600);
await tap(p, '[data-testid="fab-add"]');
await p.waitForTimeout(2000);
console.log('Add Assignment ->', await tap(p, '[aria-label="Add Assignment"]'));
await p.waitForTimeout(1800);
console.log('--- task form text ---\n' + (await text()));
await shot(p, 'task-form');

// title
const input = p.locator('input, textarea').first();
await input.click({ trial: true }).catch(() => {});
const inpBox = await p.locator('input, textarea').first().boundingBox();
await p.mouse.move(inpBox.x + inpBox.width / 2, inpBox.y + inpBox.height / 2);
await p.mouse.down(); await p.mouse.up();
await p.keyboard.type('Problem set 6', { delay: 25 });
await p.waitForTimeout(500);
console.log('typed title ok:', (await p.evaluate(() => [...document.querySelectorAll('input,textarea')].map((e) => e.value).join(' / '))));

// due date: open the full picker first, then take a preset
console.log('Pick... ->', await tap(p, '[aria-label="Pick…"]') || await tap(p, 'text=Pick'));
await p.waitForTimeout(1200);
await shot(p, 'task-due-picker');
const dueBox = await p.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => e.textContent === 'Due' && e.children.length === 0);
  return el ? el.getBoundingClientRect().toJSON() : null;
});
console.log('Due label box:', JSON.stringify(dueBox));
console.log('preset Tomorrow 08:00 ->', await tap(p, '[aria-label="Tomorrow 08:00"]'));
await p.waitForTimeout(800);
console.log('--- form after due ---\n' + (await text()).slice(0, 700));
await shot(p, 'task-form-due-set');

console.log('Add ->', await tap(p, 'text=Add') || await tap(p, '[data-testid="btn-add"]'));
await p.waitForTimeout(2400);
console.log('--- after Add (toast?) ---\n' + (await text()).slice(0, 400));
await shot(p, 'task-added-toast');

// confirm on To-do
await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2400);
const todoTxt = await text();
console.log('--- To-do text ---\n' + todoTxt.slice(0, 900));
console.log('TODO LISTS "Problem set 6":', /Problem set 6/.test(todoTxt));
await shot(p, 'todo-with-new-task');

console.log('02 console errors:', dedupe(errs).length ? dedupe(errs).slice(0, 8).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('ADD+TODO DONE, next shot number', nextN());
