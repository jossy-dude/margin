/* Probe: where is the add (+) button on the web build at 412x915? */
import { launch, open, tap, shot, dedupe } from './lib.mjs';

const b = await launch();
const { p, errs } = await open(b, { skip: true });

const info = await p.evaluate(() => {
  const out = {};
  const fab = document.querySelector('[data-testid="fab-add"]');
  out.fabExists = !!fab;
  if (fab) { const r = fab.getBoundingClientRect(); out.fabBox = { x: r.x, y: r.y, w: r.width, h: r.height }; out.fabHit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.outerHTML.slice(0, 160); }
  // what sits in the bottom-right corner where a phone FAB would be
  out.cornerEl = document.elementFromPoint(window.innerWidth - 40, window.innerHeight - 130)?.outerHTML.slice(0, 200);
  out.cornerEl2 = document.elementFromPoint(window.innerWidth - 40, window.innerHeight - 60)?.outerHTML.slice(0, 200);
  // every control in the bottom 200px
  out.bottomControls = [...document.querySelectorAll('[aria-label],[role="tab"],button')].map((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > window.innerHeight - 220 && r.top < window.innerHeight
      ? `${el.tagName}[testid=${el.getAttribute('data-testid') || '-'}][al=${el.getAttribute('aria-label') || (el.textContent || '').slice(0, 18)}] box=${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} z=${getComputedStyle(el.parentElement || el).zIndex}`
      : null;
  }).filter(Boolean);
  // anything whose accessible name contains 'add'
  out.addNamed = [...document.querySelectorAll('[aria-label]')].filter((el) => /add/i.test(el.getAttribute('aria-label') || '')).map((el) => { const r = el.getBoundingClientRect(); return `${el.getAttribute('aria-label')} :: ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`; });
  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  out.docScroll = `${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight}`;
  return out;
});
console.log(JSON.stringify(info, null, 2));
await shot(p, 'probe-fab-context');
console.log('errors:', dedupe(errs).join(' | ') || 'NONE');
await b.close();
