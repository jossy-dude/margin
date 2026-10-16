/* Probe 3: is there ANY horizontally scrollable ancestor between the due-preset strip and the
 * sheet? If not, presets right of x=412 ("Tonight…", "Tomorrow…", "Pick…") are unreachable. */
import { launch, open, tap, tapUntil, shot } from '../ux-audit/lib.mjs';

const b = await launch();
const { ctx, p } = await open(b, { skip: true });

await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector('[data-testid="new-task"]')?.scrollIntoView({ block: 'center' }));
await p.waitForTimeout(400);
await tapUntil(p, '[data-testid="new-task"]', async () => !!(await p.evaluate(() => !!document.querySelector('[data-testid="what-is-it"]'))), 3);
await p.waitForTimeout(900);

const chain = await p.evaluate(() => {
  const out = [];
  let el = document.querySelector('[data-testid="tomorrow-08-00"]');
  while (el && el !== document.documentElement) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    out.push({
      tag: el.tagName, cls: (el.className || '').toString().slice(0, 60),
      ovx: s.overflowX, sw: el.scrollWidth, cw: el.clientWidth, sl: el.scrollLeft,
      x: Math.round(r.x), w: Math.round(r.width),
      scrollableX: el.scrollWidth > el.clientWidth && (s.overflowX === 'auto' || s.overflowX === 'scroll'),
    });
    el = el.parentElement;
  }
  return out;
});
console.log('ANCESTOR CHAIN of tomorrow-08-00 (top = chip):');
chain.forEach((c, i) => console.log(` ${i}: ${c.tag} ovx=${c.ovx} sw=${c.sw} cw=${c.cw} sl=${c.sl} x=${c.x} w=${c.w} scrollableX=${c.scrollableX}`));

/* today's visible presets (x < 412) vs clipped */
const vis = await p.evaluate(() => [...document.querySelectorAll('[data-testid$="h"],[data-testid="pick"],[data-testid="none"],[data-testid*="tonight"],[data-testid*="tomorrow"],[data-testid*="friday"],[data-testid*="mon"]')]
  .filter((e) => e.closest('[role="dialog"],[data-testid="sheet-close"]') !== null || (e.closest('div') && e.getBoundingClientRect().width > 0))
  .map((e) => { const r = e.getBoundingClientRect(); return `${e.getAttribute('data-testid')}@x=${Math.round(r.x)}..${Math.round(r.right)}`; })
  .filter((s) => /none|in-1|in-3|home|tonight|tomorrow|friday|next-mon|pick/.test(s)));
console.log('PRESET POSITIONS:', JSON.stringify(vis));

/* wheel horizontally over the strip (desktop trackpad / shift+wheel equivalent) */
await p.mouse.move(206, 475);
await p.mouse.wheel(400, 0);
await p.waitForTimeout(500);
const after = await p.evaluate(() => { const e = document.querySelector('[data-testid="tomorrow-08-00"]'); const r = e.getBoundingClientRect(); return { x: Math.round(r.x), sl: e.parentElement.scrollLeft }; });
console.log('after mouse.wheel(+400,0):', JSON.stringify(after));

await shot(p, 'probe3-strip-positions');
await ctx.close();
await b.close();
