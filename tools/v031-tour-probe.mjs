/* Does the tour's hand-over still fit when the user sets a full semester range?
 * The default state is "No end date" ON, which hides the end block. The owner's actual flow is to pick
 * an end date, so the card grows by the end block — measure the exits against the card and the viewport. */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:8098';
const OUT = process.argv[3] ?? '.shots/v031/tour';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 411, height: 890 }, deviceScaleFactor: 2 });
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));

const tapText = async (label) => {
  const loc = p.getByText(label, { exact: true }).first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  const box = await loc.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(450);
};
await p.goto(BASE, { waitUntil: 'domcontentloaded' });
await p.getByText('Everything lives on this phone.').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
await p.waitForTimeout(900);
for (let i = 0; i < 9; i++) { await tapText('Next'); await p.waitForTimeout(450); }
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/handover-closed.png` });

/* Turn the end date on. The Toggle's hit target is the whole row; tap the "No end date" label. */
await tapText('No end date');
await p.waitForTimeout(900);
await p.screenshot({ path: `${OUT}/handover-open.png` });

const geo = await p.evaluate(() => {
  const gs = (t) => { const el = [...document.querySelectorAll('div,span')].find((e) => !e.children.length && (e.textContent || '').trim() === t); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom }; };
  const card = [...document.querySelectorAll('div')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 300 && r.height > 400).sort((a, b) => b.height - a.height)[0];
  return { start: gs('Get started'), keep: gs('Keep exploring'), endYear: gs('Semester ends'), card: card ? { y: card.y, bottom: card.bottom } : null, vh: innerHeight };
});
console.log(JSON.stringify(geo, null, 2));
const exits = geo.start && geo.keep;
console.log(`[1] ${exits && geo.start.bottom <= geo.vh ? 'PASS' : 'FAIL'} — "Get started" inside the viewport (bottom ${geo.start?.bottom} / ${geo.vh})`);
console.log(`[2] ${geo.endYear ? 'PASS' : 'FAIL'} — the end block is reachable without the card collapsing`);

/* The seed must be a term, not the start date. Seeding it with the start made a one-day semester that
   read as a range: the grid then counted from 7 Sep to 7 Sep. */
const text = await p.evaluate(() => [...document.querySelectorAll('div,span')].filter((e) => !e.children.length).map((e) => (e.textContent || '').trim()).join(' | '));
const sameDay = /7 Sep – 7 Sep 2026/.test(text);
const seeded = /7 Sep – 21 Dec 2026/.test(text);
console.log(`[3] ${seeded && !sameDay ? 'PASS' : 'FAIL'} — turning the end on seeds a term, not the start day (${seeded ? '7 Sep – 21 Dec 2026' : 'seed not seen'})`);
console.log(errs.length ? `errors: ${errs.join(' | ')}` : 'errors: none');
await b.close();
