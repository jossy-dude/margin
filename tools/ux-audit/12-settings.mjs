/* Item 8 — Settings: visit ≥5 pages, flip one setting (theme) and see it apply behind the sheet,
 * then back out. Item 9 — "Show the tour again" replay.
 * Nav rows have no testID: aria-label is `${label}. ${hint}` — match by prefix on the label. */
import { launch, open, sheetOpen, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 1200) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);

/** size-aware tap at real coords (Book keeps screens mounted: many 0×0 duplicates) */
const tapVis = async (sel, name) => {
  const box = await p.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; })
      ?? [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!box) { console.log(`  tap ${name} -> NO MATCH`); return false; }
  await p.waitForTimeout(350);
  const b2 = await p.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
    if (!el) return null; const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  const t = b2 ?? box;
  await p.mouse.move(t.x, t.y); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up();
  await p.waitForTimeout(900);
  console.log(`  tap ${name} -> true`);
  return true;
};

/* open Settings from Today */
await p.waitForTimeout(1500);
await tapVis('[data-testid="open-settings"]', 'gear');
console.log('sheet open:', await sheetOpen(p));
console.log('--- Settings root ---\n' + (await text(900)));
await shot(p, 'settings-root');

/* visit pages: Look & feel → (deeper) Clock face → back → back; Reminders; Sound; Data; Diagnostics */
const page = async (label, shotName) => {
  await tapVis(`[aria-label^="${label}."]`, label);
  console.log(`--- ${label} page ---\n` + (await text(700)));
  await shot(p, shotName);
};
await page('Look & feel', 'settings-lookfeel');
await page('Clock face', 'settings-clock');
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(clock)'));
console.log('on Look&feel again:', (await text(300)).includes('Theme & palette'));
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(lookfeel)'));
console.log('on root again:', (await text(300)).includes('Diagnostics'));
await page('Reminders', 'settings-reminders');
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(reminders)'));
await page('Sound & haptics', 'settings-sound');
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(sound)'));
await page('Data & export', 'settings-data');
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(data)'));
await page('Diagnostics', 'settings-diagnostics');
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(diagnostics)'));

/* flip a setting: Look & feel → Theme & palette → Dark, then restore */
const bgBefore = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
console.log('bg before theme flip:', bgBefore);
await tapVis('[aria-label^="Look & feel."]', 'Look & feel');
await tapVis('[aria-label^="Theme & palette."]', 'Theme & palette');
console.log('--- Theme page ---\n' + (await text(600)));
await shot(p, 'settings-theme-page');
await tapVis('[data-testid="dark"]', 'Dark chip');
await p.waitForTimeout(700);
const dark = await p.evaluate(() => ({
  bg: getComputedStyle(document.body).backgroundColor,
  darkOn: document.querySelector('[data-testid="dark"]')?.getAttribute('aria-pressed'),
}));
console.log('after Dark:', JSON.stringify(dark));
await shot(p, 'settings-theme-dark');
await tapVis('[data-testid="cream"]', 'Cream chip');
await p.waitForTimeout(700);
const back1 = await p.evaluate(() => ({ bg: getComputedStyle(document.body).backgroundColor, creamOn: document.querySelector('[data-testid="cream"]')?.getAttribute('aria-pressed') }));
console.log('after Cream (restore):', JSON.stringify(back1));
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(theme)'));
console.log('back ->', await tapVis('[data-testid="sheet-back"]', 'back(lookfeel2)'));
console.log('root hint now:', await p.evaluate(() => document.body.innerText.match(/Look & feel\n([^\n]*)/)?.[1] ?? document.body.innerText.match(/Look & feel \| ([^\n]*)/)?.[0] ?? 'n/a'));

/* Item 9 — Show the tour again */
await tapVis('[aria-label^="Show the tour again."]', 'Show the tour again');
console.log('--- Tour page ---\n' + (await text(600)));
await shot(p, 'settings-tour-page');
await tapVis('[data-testid="run-it-now"]', 'Run it now');
await p.waitForTimeout(2200);
const tour = await text(400);
console.log('--- after Run it now ---\n' + tour);
console.log('TOUR REPLAYED (n / 5 or Skip visible):', /\/ 5/.test(tour) || /Skip/.test(tour));
await shot(p, 'tour-replayed');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('SETTINGS DONE, next shot', nextN());
