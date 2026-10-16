import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto('http://localhost:8099', { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForTimeout(6000);
await p.click('[data-testid="tab-tasks"]'); await p.waitForTimeout(1500);
const c = await p.$('text=Review flashcards'); if (c) { await c.click(); }
for (const t of [200, 900, 2500]) {
  await p.waitForTimeout(t === 200 ? 200 : 700);
  const r = await p.evaluate(() => {
    const n = [...document.querySelectorAll('div')].find(x => { const b = x.getBoundingClientRect(); return Math.round(b.width) === 460 && b.height > 700; });
    if (!n) return 'gone';
    const b = n.getBoundingClientRect(), s = getComputedStyle(n);
    return `x=${Math.round(b.x)} tf=${s.transform}`;
  });
  console.log('t+' + t, r);
}
await b.close();
