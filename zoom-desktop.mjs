import { chromium } from 'playwright';

const OUT = '/home/jossy/Documents/Projects/UI_desgin/shots';
const url = 'file:///home/jossy/Documents/Projects/UI_desgin/index.html';
const browser = await chromium.launch();

// close-ups of the two ported instruments, at 4x so the engraving is legible
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('.clockbox').screenshot({ path: `${OUT}/zoom-clock.png` });
await page.locator('.obj[data-seed="edgefocus"]').screenshot({ path: `${OUT}/zoom-edgefocus.png` });
await page.locator('.spine').screenshot({ path: `${OUT}/zoom-spine.png` });
await page.close();

// the focus dial at 4x
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
await p2.goto(`${url}#focus`, { waitUntil: 'networkidle' });
await p2.waitForTimeout(1800);
await p2.locator('.dial-row').screenshot({ path: `${OUT}/zoom-dial.png` });
await p2.close();

await browser.close();
console.log('close-ups written');
