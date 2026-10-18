/* Walkthrough item 1 — onboarding.
 * Context A: full tour, Next x4 then Start. Context B: fresh, Skip.
 * Prints the visible text of every tour screen so the report can quote copy exactly.
 */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();

/* ── A: the full five screens ── */
{
  const { ctx, p, errs } = await open(b, { skip: false });
  console.log('=== TOUR A: Next x4 then Start ===');
  for (let i = 1; i <= 5; i++) {
    await p.waitForTimeout(900);
    const txt = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 900));
    console.log(`--- screen ${i} text ---\n${txt}\n`);
    // any element sticking out of the viewport?
    const overflow = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4 && (r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1 || r.top < -1 || r.left < -1)) {
          out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)} [${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}] "${(el.textContent || '').slice(0, 40)}"`);
        }
      }
      return out.slice(0, 8);
    });
    if (overflow.length) console.log('OVERFLOW:', overflow.join(' | '));
    await shot(p, `onb-${i}`);
    if (i < 5) {
      const ok = await tap(p, '[data-testid="btn-next"]') || await tap(p, 'text=Next');
      console.log(`screen ${i}: Next tap -> ${ok}`);
      await p.waitForTimeout(1400);
    }
  }
  const startOk = await tap(p, 'text=Start');
  console.log('Start tap ->', startOk);
  await p.waitForTimeout(2800);
  console.log('after Start, body starts with:', (await p.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n/g, ' | '));
  await shot(p, 'onb-after-start');
  console.log('TOUR A console errors:', dedupe(errs).length ? dedupe(errs).slice(0, 6).join('\n  ') : 'NONE');
  await ctx.close();
}

/* ── B: Skip from the first screen ── */
{
  const { ctx, p, errs } = await open(b, { skip: false });
  console.log('=== TOUR B: Skip ===');
  const skipBox = await p.locator('text=Skip').first().boundingBox();
  console.log('Skip button box:', JSON.stringify(skipBox));
  const ok = await tap(p, 'text=Skip');
  console.log('Skip tap ->', ok);
  await p.waitForTimeout(2800);
  console.log('after Skip, body starts with:', (await p.evaluate(() => document.body.innerText)).slice(0, 160).replace(/\n/g, ' | '));
  await shot(p, 'onb-skip-landing');
  console.log('TOUR B console errors:', dedupe(errs).length ? dedupe(errs).slice(0, 6).join('\n  ') : 'NONE');
  await ctx.close();
}

await b.close();
console.log('ONBOARDING DONE, next shot number', nextN());
