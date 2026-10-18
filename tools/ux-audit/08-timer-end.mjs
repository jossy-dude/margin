/* Item 5 (final) — end a round that ran ≥60 s so the save path fires; detect mid-run reloads. */
import { launch, open, tap, shot, dedupe, nextN } from './lib.mjs';

const b = await launch();
const { ctx, p, errs } = await open(b, { skip: true });
let reloads = 0;
p.on('load', () => { reloads++; });
const text = (n = 500) => p.evaluate((k) => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, k), n);

await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2400);
const before = await p.evaluate(() => (document.body.innerText.match(/Focus heatmap[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' | '));
console.log('STATS BEFORE:', before);
await tap(p, '[data-testid="tab-today"]');
await p.waitForTimeout(1400);

console.log('open-focus ->', await tap(p, '[data-testid="open-focus"]'));
await p.waitForTimeout(2400);
console.log('Start ->', await tap(p, '[aria-label="Start"]'));
await p.waitForTimeout(1200);
const samples = [];
for (let i = 0; i < 14; i++) { samples.push(await p.evaluate(() => (document.body.innerText.match(/\d\d:\d\d/) || [''])[0])); await p.waitForTimeout(5000); }
console.log('SAMPLES:', [...new Set(samples)].join(' -> '), '| reloads so far:', reloads);
await shot(p, 'focus-65s');

console.log('end session ->', await tap(p, '[aria-label="End session and save"]'));
await p.waitForTimeout(1500);
const toast = await p.evaluate(() => (document.body.innerText.match(/Saved[^\n]*/) || [''])[0]);
console.log('SAVED TOAST:', toast || '(none)');
console.log('focus screen now:\n' + (await text(300)));
await shot(p, 'focus-saved-toast2');

console.log('Back to Today ->', await tap(p, '[aria-label="Back to Today"]'));
await p.waitForTimeout(1800);
await tap(p, '[data-testid="tab-stats"]');
await p.waitForTimeout(2500);
const after = await p.evaluate(() => (document.body.innerText.match(/Focus heatmap[\s\S]{0,60}/) || [''])[0].replace(/\n/g, ' | '));
console.log('STATS AFTER:', after);
await shot(p, 'stats-after-session2');
console.log('reloads during run:', reloads);
console.log('errors:', dedupe(errs).length ? dedupe(errs).join('\n  ') : 'NONE');
await ctx.close();
await b.close();
console.log('DONE, next shot', nextN());
