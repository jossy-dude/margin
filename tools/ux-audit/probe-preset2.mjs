/* Probe 2: can a student reach the right-hand due presets ("Tonight…", "Tomorrow…", "Pick…")?
 * Evidence so far: strip scrollWidth==clientWidth==1145, overflowX visible, chips up to x=1131
 * in a 412-px viewport. Tests: root scroll, reveal effect, touch-drag swipe, direct tap. */
import { launch, open, tap, tapUntil, shot, sheetOpen } from '../ux-audit/lib.mjs';

const b = await launch();
const { ctx, p } = await open(b, { skip: true });

await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector('[data-testid="new-task"]')?.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(400);
await tapUntil(p, '[data-testid="new-task"]', async () => !!(await p.evaluate(() => !!document.querySelector('[data-testid="what-is-it"]'))), 3);
await p.waitForTimeout(900);

const state = () => p.evaluate(() => {
  const pick = document.querySelector('[data-testid="pick"]');
  const r = pick?.getBoundingClientRect();
  const strip = pick?.parentElement;
  const ss = strip ? getComputedStyle(strip) : null;
  return {
    doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, scrollX: window.scrollX },
    pick: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) } : null,
    strip: ss ? { overflowX: ss.overflowX, sw: strip.scrollWidth, cw: strip.clientWidth, scrollLeft: strip.scrollLeft } : null,
    due: document.body.innerText.match(/Due\n([^\n]*)/)?.[1] ?? document.body.innerText.match(/Due \| ([^|]*)/)?.[1] ?? null,
  };
});

console.log('1) initial:', JSON.stringify(await state()));

/* reveal, the walk's method */
await p.evaluate(() => document.querySelector('[data-testid="pick"]')?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }));
await p.waitForTimeout(500);
console.log('2) after scrollIntoView:', JSON.stringify(await state()));

/* touch-drag swipe on the preset row (what a thumb would do) */
await p.mouse.move(350, 475);
await p.mouse.down();
for (let i = 1; i <= 10; i++) { await p.mouse.move(350 - i * 30, 475); await p.waitForTimeout(40); }
await p.mouse.up();
await p.waitForTimeout(500);
console.log('3) after swipe left:', JSON.stringify(await state()));

/* direct tap on Pick… at its real rect centre (even if beyond x=412) */
const r = await p.evaluate(() => { const e = document.querySelector('[data-testid="pick"]'); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
console.log('4) pick centre:', JSON.stringify(r));
await p.mouse.move(r.x, r.y);
await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
await p.waitForTimeout(700);
const s = await state();
console.log('5) after tap at real centre:', JSON.stringify(s), '| opened day strip:', s.due !== null || /Done/.test(await p.evaluate(() => document.body.innerText)) ? 'see below' : '?');
console.log('sheet open:', await sheetOpen(p));
console.log('due section:', await p.evaluate(() => document.body.innerText.match(/Due[\s\S]{0,120}/)?.[0]?.replace(/\n/g, ' | ')));
await shot(p, 'probe2-reachability');

await ctx.close();
await b.close();
