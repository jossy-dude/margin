/* Extra flow — the To-do header teaches "swipe right to finish, left to crumple".
 * Can a web student do that with a mouse drag? */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });

const drag = async (x1, y1, x2, y2, steps = 14, holdMs = 45) => {
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) { await p.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps); await p.waitForTimeout(holdMs); }
  await p.mouse.up();
  await p.waitForTimeout(400);
};

await tap(p, '[data-testid="tab-tasks"]');
await p.waitForTimeout(2400);

const card = await p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')]
    .find((e) => /^Reading response/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { label: el.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log('card:', JSON.stringify(card));
if (card) {
  await p.evaluate((y) => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => /^Reading response/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0); el?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, card.y);
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const el = [...document.querySelectorAll('[aria-label]')].find((e) => /^Reading response/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0); const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  console.log('dragging right from', JSON.stringify(r));
  await drag(r.x, r.y, r.x + 260, r.y);
  await p.waitForTimeout(1200);
  const label2 = await p.evaluate(() => [...document.querySelectorAll('[aria-label]')].find((e) => /^Reading response/.test(e.getAttribute('aria-label') || ''))?.getAttribute('aria-label') ?? 'GONE');
  console.log('label after right-swipe:', label2);
  console.log('toast:', await p.evaluate(() => document.body.innerText.match(/\bUndo\b|\bDone\b|Crumpled|Finished[^\n]*/)?.[0] ?? 'none'));
  await shot(p, 'swipe-right-result');
}

/* left swipe (crumple) on the next card */
const card2 = await p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => /^Flashcards/.test(e.getAttribute('aria-label') || '') && e.getBoundingClientRect().width > 0);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: el.getAttribute('aria-label') };
});
await p.waitForTimeout(600);
if (card2) {
  console.log('dragging left from', JSON.stringify(card2));
  await drag(card2.x, card2.y, card2.x - 260, card2.y);
  await p.waitForTimeout(1500);
  console.log('label after left-swipe:', await p.evaluate(() => [...document.querySelectorAll('[aria-label]')].find((e) => /^Flashcards/.test(e.getAttribute('aria-label') || ''))?.getAttribute('aria-label') ?? 'GONE'));
  console.log('toast:', await p.evaluate(() => document.body.innerText.match(/\bUndo\b[^\n]*|Crumpled[^\n]*|Gone[^\n]*/)?.[0] ?? 'none'));
  await shot(p, 'swipe-left-result');
}
console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('SWIPE TEST DONE, next shot', nextN());
