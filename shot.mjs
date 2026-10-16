import { chromium } from 'playwright';
const [,, url, out, w, h, route, day] = process.argv;
const b = await chromium.launch({ args: ['--no-sandbox','--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2 });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0,240)); });
p.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0,300)));
await p.goto(url, { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);
if (day) { // pick a weekday from the This week strip so the command deck is present
  const cells = await p.$$('text=Mon');
  if (cells[0]) { await cells[0].click(); await p.waitForTimeout(1500); }
}
if (route && route !== '-') { await p.click(`[data-testid="tab-${route.toLowerCase()}"]`).catch(()=>{}); await p.waitForTimeout(2600); }
await p.screenshot({ path: out, fullPage: false });
console.log(errs.length ? errs.slice(0,6).join('\n') : 'NO CONSOLE ERRORS');
await b.close();
