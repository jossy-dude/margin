/* Item 5 (confirm) — a full round: dial attributes, ticking countdown sampled for 65 s,
 * end → saved toast, then leave Focus with its own back control and read Stats. */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
const text = (n = 700) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);
const statsLine = () => p.evaluate(() => (document.body.innerText.match(/Focus heatmap[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' | '));

/* Stats baseline in THIS session */
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2400);
console.log('STATS BEFORE:', await statsLine());
await tap(p, '[data-testid="tab-today"]');
await p.waitForTimeout(1500);

/* open focus, dump the dial's accessibility surface */
console.log('open-focus ->', await tap(p, '[data-testid="open-focus"]'));
await p.waitForTimeout(2600);
console.log('dial attrs:', JSON.stringify(await p.evaluate(() => {
  const el = [...document.querySelectorAll('[aria-label]')].find((e) => (e.getAttribute('aria-label') || '').startsWith('Focus minutes'));
  if (!el) return null; const o = {}; for (const a of el.attributes) o[a.name] = a.value.slice(0, 100); return o;
})));

/* start */
console.log('Start ->', await tap(p, '[aria-label="Start"]'));
await p.waitForTimeout(1500);
const samples = [];
for (let i = 0; i < 45; i++) { samples.push(await p.evaluate(() => (document.body.innerText.match(/\d\d:\d\d/) || [''])[0])); await p.waitForTimeout(1500); }
console.log('COUNTDOWN SAMPLES:', [...new Set(samples)].join(' -> '));
await shot(p, 'focus-running-60s');

/* end and look for the saved toast */
console.log('end session ->', await tap(p, '[aria-label="End session and save"]'));
await p.waitForTimeout(1200);
const toast = await p.evaluate(() => (document.body.innerText.match(/Saved[^\n]*/) || [''])[0]);
console.log('SAVED TOAST:', toast || '(none)');
await shot(p, 'focus-saved-toast');

/* leave Focus (no tab bar here) and check Stats */
console.log('Back to Today ->', await tap(p, '[aria-label="Back to Today"]'));
await p.waitForTimeout(2000);
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2600);
console.log('STATS AFTER:', await statsLine());
console.log('stats head:\n' + (await text(420)));
await shot(p, 'stats-after-session');

console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('TIMER CONFIRM DONE, next shot', nextN());
