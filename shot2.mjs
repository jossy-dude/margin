import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox','--font-render-hinting=none'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0,200)));
await p.goto('http://localhost:8099', { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);
await p.click('[data-testid="tab-tasks"]'); await p.waitForTimeout(2000);
const card = await p.$('text=Review flashcards');
if (card) { await card.click(); await p.waitForTimeout(2500); }
await p.screenshot({ path: '.impeccable/review/panel.png' });
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
await b.close();
