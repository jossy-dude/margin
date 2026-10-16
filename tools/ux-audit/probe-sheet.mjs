/* Probe: are taps inside a sheet landing? Reports what elementFromPoint says at the Save button. */
import { launch, open, tap, shot, dedupe } from './lib.mjs';

const b = await launch();
const { p, errs } = await open(b, { skip: true });
const dump = async (label) => {
  const s = await p.evaluate(() => {
    const btn = document.querySelector('[data-testid="save"]');
    const r = btn?.getBoundingClientRect();
    const mid = r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
    const hit = mid ? document.elementFromPoint(mid.x, mid.y) : null;
    return {
      saveExists: !!btn,
      box: r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : null,
      disabled: btn?.getAttribute('aria-disabled') || btn?.getAttribute('data-disabled') || (btn ? String(btn.getAttribute('aria-disabled')) : null),
      hit: hit ? `${hit.tagName}[testid=${hit.getAttribute('data-testid') || '-'}] "${(hit.textContent || hit.getAttribute('aria-label') || '').slice(0, 40)}"` : 'none',
      sheetOpen: !!document.querySelector('[data-testid="sheet-close"]'),
      inViewport: r ? (r.x >= 0 && r.y >= 0 && r.y + r.height <= window.innerHeight) : null,
    };
  });
  console.log(label, JSON.stringify(s));
};

await tap(p, '[data-testid="tab-week"]');
await p.waitForTimeout(2000);
await tap(p, '[aria-label="Class"]');
await p.waitForTimeout(2000);
await dump('after open:');

// tap Save by testid
console.log('tap save-by-testid ->', await tap(p, '[data-testid="save"]'));
await p.waitForTimeout(2200);
await dump('after save tap (testid):');

// if still open, try tapping by coordinates from boundingBox manually with a longer press
const still = await p.evaluate(() => !!document.querySelector('[data-testid="sheet-close"]'));
if (still) {
  const box = await p.locator('[data-testid="save"]').boundingBox();
  console.log('save box (playwright):', JSON.stringify(box));
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const hitTag = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName} testid=${e.getAttribute('data-testid')} cls=${String(e.className).slice(0, 40)}` : 'none'; }, [cx, cy]);
  console.log('hit at save centre:', hitTag);
  await p.mouse.move(cx, cy);
  await p.mouse.down();
  await p.waitForTimeout(150);
  await p.mouse.up();
  await p.waitForTimeout(2500);
  console.log('sheet still open after 150ms press:', await p.evaluate(() => !!document.querySelector('[data-testid="sheet-close"]')));
}
await shot(p, 'probe-sheet-save');
console.log('errors:', dedupe(errs).join(' | ') || 'NONE');
await b.close();
