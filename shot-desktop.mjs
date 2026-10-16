import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = '/home/jossy/Documents/Projects/UI_desgin/shots';
mkdirSync(OUT, { recursive: true });

const url = 'file:///home/jossy/Documents/Projects/UI_desgin/index.html';
const browser = await chromium.launch();

const ROUTES = ['today', 'week', 'todo', 'grades', 'stats', 'focus'];
const plan = [];
for (const r of ROUTES) plan.push([`${r}-1440`, r, 1440, 900]);
for (const r of ROUTES) plan.push([`${r}-1280`, r, 1280, 800]);
for (const r of ['today', 'week', 'grades']) plan.push([`${r}-1120`, r, 1120, 820]);

for (const [name, route, w, h] of plan) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  await page.goto(`${url}#${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(errs.length ? `[${name}] ERRORS:\n  ` + errs.join('\n  ') : `[${name}] clean`);
  await page.close();
}

await browser.close();
console.log('\nwrote', plan.length, 'shots');
