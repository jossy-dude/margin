/* Probe 4: which nodes carry data-testid="discrete-mathematics" on Stats, and why is
 * .first().boundingBox() null while innerText lists the chip? */
import { launch, open, tap, shot } from '../ux-audit/lib.mjs';

const b = await launch();
const { ctx, p } = await open(b, { skip: true });
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2500);

const info = await p.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid="discrete-mathematics"]')];
  return els.map((e, i) => {
    const r = e.getBoundingClientRect(), s = getComputedStyle(e);
    let path = [], n = e;
    while (n && n !== document.body) { path.push(n.tagName + (n.getAttribute('role') ? `[role=${n.getAttribute('role')}]` : '') + (n.getAttribute('aria-hidden') ? '[aria-hidden]' : '')); n = n.parentElement; }
    return { i, tag: e.tagName, role: e.getAttribute('role'), ariaHidden: e.getAttribute('aria-hidden'), text: (e.textContent || '').slice(0, 40), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, display: s.display, visibility: s.visibility, opacity: s.opacity, path: path.slice(0, 8).join(' < ') };
  });
});
console.log(JSON.stringify(info, null, 1));
const bb = await p.locator('[data-testid="discrete-mathematics"]').first().boundingBox().catch((e) => 'ERR ' + e.message);
console.log('playwright first().boundingBox():', JSON.stringify(bb));
const cnt = await p.locator('[data-testid="discrete-mathematics"]').count();
console.log('playwright count():', cnt);
if (cnt > 1) {
  for (let i = 0; i < cnt; i++) console.log(` box[${i}]:`, JSON.stringify(await p.locator('[data-testid="discrete-mathematics"]').nth(i).boundingBox().catch(() => null)));
}
await shot(p, 'probe4-chip-node');
await ctx.close();
await b.close();
