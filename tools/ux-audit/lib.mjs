/* Shared helpers for the first-time-student UX audit scripts (report: reports/audit-ux.md).
 *
 * React Native Web answers Pressability on POINTERDOWN, so every "tap" here is
 * mouse.move + down + short wait + up (never click()). A long-press is down → 800 ms → up.
 *
 * Screenshots land in .shots/ux-audit/<n>-<name>.png; each script sets SHOT_BASE so the
 * numbering continues across the whole walkthrough in walk order.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

export const W = 412, H = 915;
export const OUT = '.shots/ux-audit';
mkdirSync(OUT, { recursive: true });

let n = Number(process.env.SHOT_BASE || 1);
export const nextN = () => n++;

export async function launch() {
  const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
  return b;
}

export async function open(b, { skip = true, url = 'http://localhost:8099' } = {}) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 300)));
  await p.goto(url, { waitUntil: 'networkidle', timeout: 240000 });
  await p.waitForTimeout(5000);
  if (skip) { await tap(p, 'text=Skip').catch(() => {}); await p.waitForTimeout(2500); }
  return { ctx, p, errs };
}

export async function tap(p, sel) {
  const box = await p.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  await p.waitForTimeout(120);
  return true;
}

export async function longPress(p, sel, ms = 800) {
  const box = await p.locator(sel).first().boundingBox().catch(() => null);
  if (!box) return false;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(ms);
  await p.mouse.up();
  await p.waitForTimeout(200);
  return true;
}

/** Tap with retries until `check` passes (startup/layout flakes otherwise cost a whole run). */
export async function tapUntil(p, sel, check, tries = 4) {
  for (let i = 0; i < tries; i++) {
    if (await tap(p, sel)) {
      await p.waitForTimeout(900);
      if (!check || (await check())) return true;
    }
    await p.waitForTimeout(700);
  }
  return false;
}

/** Convenience: is a sheet currently open? */
export const sheetOpen = (p) => p.evaluate(() => !!document.querySelector('[data-testid="sheet-close"]'));

/** Drag (for the focus dial): press at (x1,y1), move in steps to (x2,y2), release. */
export async function drag(p, x1, y1, x2, y2, steps = 12, holdMs = 60) {
  await p.mouse.move(x1, y1);
  await p.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await p.mouse.move(x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps);
    await p.waitForTimeout(holdMs);
  }
  await p.mouse.up();
  await p.waitForTimeout(250);
}

export async function shot(p, name) {
  const f = `${OUT}/${String(nextN()).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path: f, fullPage: false });
  console.log('SHOT', f);
  return f;
}

/** Full-page screenshot (for scrollable sheets/pages where the fold would hide evidence). */
export async function shotFull(p, name) {
  const f = `${OUT}/${String(nextN()).padStart(2, '0')}-${name}-full.png`;
  await p.screenshot({ path: f, fullPage: true });
  console.log('SHOT', f);
  return f;
}

export const dedupe = (a) => [...new Set(a)];
