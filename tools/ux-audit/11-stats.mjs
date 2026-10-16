/* Item 7 — Stats: read every card top to bottom and exercise one control (subject chip in
 * Mark history). Fresh context: demo data. */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 2000) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const scroll = async (dy) => { await p.mouse.move(206, 500); await p.mouse.wheel(0, dy); await p.waitForTimeout(900); };

await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2800);
console.log('--- Stats top ---\n' + (await text(1000)));
await shot(p, 'stats-1-glance');

console.log('rings:', await p.evaluate(() => [...document.querySelectorAll('[role="img"],[aria-label]')]
  .map((e) => e.getAttribute('aria-label'))
  .filter((l) => l && /Attendance|On time|Focus/.test(l)).slice(0, 8)));

await scroll(800); console.log('--- +800 ---\n' + (await text(500))); await shot(p, 'stats-2-heatmaps');
await scroll(800); console.log('--- +1600 ---\n' + (await text(500))); await shot(p, 'stats-3-when');
await scroll(900); console.log('--- +2500 ---\n' + (await text(500))); await shot(p, 'stats-4-subject-att');
await scroll(900); console.log('--- +3400 ---\n' + (await text(500))); await shot(p, 'stats-5-grades');
await scroll(900); console.log('--- +4300 ---\n' + (await text(500))); await shot(p, 'stats-6-reminders');

/* exercise a control: switch the Mark-history subject chip.
 * NB: the Tasks screen (hidden but mounted) has a same-label filter chip at 0×0 — pick the
 * sized node and tap its real coordinates. */
const box = await p.evaluate(() => {
  const el = [...document.querySelectorAll('[data-testid="discrete-mathematics"]')]
    .find((e) => e.getBoundingClientRect().width > 0);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await p.waitForTimeout(600);
const before = await p.evaluate(() => document.body.innerText.match(/Mark history[\s\S]{0,120}/)?.[0]?.replace(/\n/g, ' | '));
console.log('mark history before:', before);
let tapped = false;
if (box) {
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  tapped = true;
}
console.log('tap subject chip ->', tapped);
await p.waitForTimeout(900);
const after = await p.evaluate(() => document.body.innerText.match(/Mark history[\s\S]{0,120}/)?.[0]?.replace(/\n/g, ' | '));
console.log('mark history after:', after);
console.log('CHANGED:', before !== after);
await shot(p, 'stats-7-mark-history-switched');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('STATS DONE, next shot', nextN());
