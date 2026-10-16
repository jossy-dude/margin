/* Probe: are the due-date preset chips (task sheet WhenPicker) reachable/tappable on web?
 * Earlier walk: rect([data-testid="tomorrow-0800"]) was null even after scrollIntoView. */
import { launch, open, tap, tapUntil, shot, sheetOpen } from '../ux-audit/lib.mjs';

const b = await launch();
const { ctx, p } = await open(b, { skip: true });

await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2000);
await p.evaluate(() => { const el = document.querySelector('[data-testid="new-task"]'); el?.scrollIntoView({ block: 'center' }); });
await p.waitForTimeout(500);
await tapUntil(p, '[data-testid="new-task"]', async () => !!(await p.evaluate(() => { const e = document.querySelector('[data-testid="what-is-it"]'); return !!e; })), 3);
await p.waitForTimeout(900);

const dump = () => p.evaluate(() => {
  const chips = [...document.querySelectorAll('[data-testid]')]
    .filter((e) => /tomorrow|in-1-h|tonight|pick|none/.test(e.getAttribute('data-testid') || ''))
    .map((e) => { const r = e.getBoundingClientRect(); return { id: e.getAttribute('data-testid'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  /* horizontal strip overflow */
  const strip = chips.length ? document.querySelector(`[data-testid="${chips[0].id}"]`)?.parentElement : null;
  const st = strip ? { sw: strip.scrollWidth, cw: strip.clientWidth, overflowX: getComputedStyle(strip).overflowX } : null;
  return { chips, strip: st, vh: innerHeight };
});

console.log('BEFORE scroll:', JSON.stringify(await dump(), null, 1));

await p.evaluate(() => { document.querySelector('[data-testid="tomorrow-0800"]')?.scrollIntoView({ block: 'center', inline: 'center' }); });
await p.waitForTimeout(500);
console.log('AFTER scrollIntoView:', JSON.stringify(await dump(), null, 1));
await shot(p, 'probe-preset-strip');

/* try tapping "In 1 h" (leftmost preset) the walk way: boundingBox + pointerdown */
const box = await p.locator('[data-testid="in-1-h"]').first().boundingBox().catch(() => null);
console.log('in-1-h boundingBox:', JSON.stringify(box));
if (box) {
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(600);
}
const due = await p.evaluate(() => document.body.innerText.match(/Due[\s\S]{0,80}/)?.[0]?.replace(/\n/g, ' | '));
console.log('due after tapping In 1 h:', due);
await shot(p, 'probe-preset-tapped');

/* and a preset that is likely off the right edge: scroll the strip manually then tap */
await p.evaluate(() => { const s = document.querySelector('[data-testid="tomorrow-0800"]')?.parentElement; if (s) s.scrollLeft = s.scrollWidth; });
await p.waitForTimeout(400);
const box2 = await p.locator('[data-testid="tomorrow-0800"]').first().boundingBox().catch(() => null);
console.log('tomorrow after manual strip scroll:', JSON.stringify(box2));
if (box2 && box2.y >= 0 && box2.y < 915) {
  await p.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(600);
}
const due2 = await p.evaluate(() => document.body.innerText.match(/Due[\s\S]{0,80}/)?.[0]?.replace(/\n/g, ' | '));
console.log('due after tomorrow tap:', due2);
console.log('sheet open:', await sheetOpen(p));
await shot(p, 'probe-preset-tomorrow');
await ctx.close();
await b.close();
