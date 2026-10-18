/* Probe 2: what does [aria-label="Class"] match, and does the sheet open with retries? */
import { launch, open, tap, shot, dedupe } from './lib.mjs';

const b = await launch();
const { p, errs } = await open(b, { skip: true });

console.log('start screen:', (await p.evaluate(() => document.body.innerText.slice(0, 120))).replace(/\n/g, ' | '));
const skipOk = await tap(p, 'text=Skip');
await p.waitForTimeout(2500);
console.log('skip tap ->', skipOk, '| now:', (await p.evaluate(() => document.body.innerText.slice(0, 90))).replace(/\n/g, ' | '));
const weekOk = await tap(p, '[data-testid="tab-week"]');
await p.waitForTimeout(2500);
console.log('tab-week tap ->', weekOk, '| now:', (await p.evaluate(() => document.body.innerText.slice(0, 90))).replace(/\n/g, ' | '));

const matches = await p.evaluate(() => [...document.querySelectorAll('[aria-label="Class"]')].map((el) => {
  const r = el.getBoundingClientRect();
  return `${el.tagName} testid=${el.getAttribute('data-testid')} box=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} visible=${r.width > 0 && r.y < window.innerHeight}`;
}));
console.log('aria-label="Class" matches:', JSON.stringify(matches, null, 1));

// also what a text= selector would hit
const textHits = await p.evaluate(() => [...document.querySelectorAll('*')].filter((el) => (el.childElementCount === 0 || ['BUTTON', 'DIV'].includes(el.tagName)) && /^Class$/.test((el.textContent || '').trim())).slice(0, 6).map((el) => { const r = el.getBoundingClientRect(); return `${el.tagName} testid=${el.getAttribute('data-testid')} al=${el.getAttribute('aria-label')} box=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
console.log('text=="Class" hits:', JSON.stringify(textHits, null, 1));

let opened = false;
for (let i = 0; i < 4 && !opened; i++) {
  const ok = await tap(p, '[aria-label="Class"]');
  await p.waitForTimeout(2000);
  opened = await p.evaluate(() => !!document.querySelector('[data-testid="sheet-close"]'));
  console.log(`attempt ${i}: tap=${ok} sheetOpen=${opened}`);
}
if (opened) {
  await shot(p, 'probe2-sheet-open');
  const save = await p.evaluate(() => {
    const btn = document.querySelector('[data-testid="save"]');
    if (!btn) return { exists: false };
    const r = btn.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { exists: true, box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`, state: btn.getAttribute('aria-disabled'), hit: hit ? `${hit.tagName} testid=${hit.getAttribute('data-testid')}` : 'none' };
  });
  console.log('save:', JSON.stringify(save));
  const ok = await tap(p, '[data-testid="save"]');
  await p.waitForTimeout(2500);
  const still = await p.evaluate(() => !!document.querySelector('[data-testid="sheet-close"]'));
  console.log(`save tap=${ok} sheetStillOpen=${still}`);
  await shot(p, 'probe2-after-save');
}
console.log('errors:', dedupe(errs).join(' | ') || 'NONE');
await b.close();
