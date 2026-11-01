/* v0.5 / WS3 (persistence & uninstall survival) — the export row, as a browser can honestly see it.
 *
 *   node tools/v03-export-row-assert.mjs [--url http://localhost:8098] [--out .shots/v05]
 *
 * One context, 412x915, walking the app like a finger:
 *   1 — Settings root still carries the Data & export door the row hangs under
 *   2 — the row is there: exact title, the Auto Backup warning, an export affordance, one tap target,
 *       directly under Data & export and above Diagnostics, and it promises no keep-data dialog
 *   3 — tapping it runs the existing export flow (its own words come back as a toast), pushes no page,
 *       does not leave the row stuck disabled, and the toast clears itself
 *   4 — the Data page's own JSON "Share…" says the same thing: one writer, not a second uninstall one
 *   5 — R1 regression: no "+/−" stepper on the Settings root or on Attendance & semester
 *
 * The web build runs the in-memory repository and has no file system behind expo-file-system, so the
 * export itself cannot produce a file here — that is the point of step 4, which proves the row reached
 * the *same* flow the Data page reaches rather than a browser-shaped copy of it. On-device items are
 * printed as UNVERIFIED-ON-DEVICE.
 *
 * Exit code is non-zero if any hard assertion fails (2 = the dev server never answered).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/v05');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, detail) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${detail}`); if (!pass) fails.push(n); };
const info = (s) => console.log(`     · ${s}`);
const uv = (s) => info(`UNVERIFIED-ON-DEVICE: ${s}`);

/* The server is someone else's process: wait for it rather than failing the run on a slow first
   bundle. `fetch` is in node ≥18. */
const up = async () => {
  const end = Date.now() + 180_000;
  let last = '';
  while (Date.now() < end) {
    try { const r = await fetch(URL_, { signal: AbortSignal.timeout(5000) }); if (r.ok) return true; last = `HTTP ${r.status}`; }
    catch (e) { last = String((e && e.message) || e).slice(0, 80); }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`BLOCKED — ${URL_} did not answer in 180 s (last: ${last})`);
  process.exit(2);
};
await up();

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240_000 });
await p.locator('[data-testid="tab-week"]').first().waitFor({ state: 'attached', timeout: 90_000 });
await p.waitForTimeout(5000);

/* Same tap rules as tools/v031-assert.mjs and tools/v05-semester-assert.mjs: RNW answers Pressability on
   POINTERDOWN, the Book keeps every screen mounted (`display:none` when hidden, so no box), and controls
   can sit below the fold inside a sheet's ScrollView. */
const tapLoc = async (loc) => {
  const n = await loc.count();
  let inView = null, any = null;
  for (let i = 0; i < n; i++) {
    const l = loc.nth(i);
    const bb = await l.boundingBox().catch(() => null);
    if (!bb || bb.width === 0 || bb.height === 0) continue;
    if (bb.y + bb.height > 0 && bb.y < H && bb.x + bb.width > 0 && bb.x < W) { inView = l; break; }
    if (!any) any = l;
  }
  const target = inView ?? any;
  if (!target) return false;
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const bb = await target.boundingBox().catch(() => null);
  if (!bb || bb.y + bb.height <= 0 || bb.y >= H) return false;
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  await p.mouse.up();
  return true;
};
const tap = async (sel) => { await p.locator(sel).first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {}); return tapLoc(p.locator(sel)); };
const tapPoint = async (pt) => {
  if (!pt) return false;
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.waitForTimeout(80); await p.mouse.up(); return true;
};

/* Leaf text with a real box (a hidden Book page is `display:none` and has no box). */
const texts = () => p.evaluate(() => [...document.querySelectorAll('div,span')]
  .filter((el) => !el.children.length && (el.textContent || '').trim())
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.textContent.trim()));
const pageText = async () => (await texts()).join(' | ');
const has = async (s) => (await pageText()).includes(s);
const waitFor = async (s, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await has(s)) return true; await p.waitForTimeout(150); }
  return false;
};
/** The first visible leaf matching `re` whose box lies inside `near` (a 0x0 rect matches anywhere). */
const waitForMatch = async (re, ms = 5000, near = null) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = await p.evaluate(({ src, flags, near }) => {
      const rx = new RegExp(src, flags);
      for (const el of document.querySelectorAll('div,span')) {
        if (el.children.length) continue;
        const t = (el.textContent || '').trim();
        if (!t || !rx.test(t)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (near && (r.y < near.y - 4 || r.y + r.height > near.y + near.h + 4)) continue;
        return t;
      }
      return null;
    }, { src: re.source, flags: re.flags, near }).catch(() => null);
    if (hit) return hit;
    await p.waitForTimeout(150);
  }
  return null;
};
/** Waits until nothing visible matches `re` — a toast's exit animation keeps its leaf on screen ~180 ms. */
const waitGone = async (re, ms = 3000, near = null) => {
  const start = Date.now(), end = start + ms;
  while (Date.now() < end) {
    if (!(await waitForMatch(re, 60, near))) return Date.now() - start;
    await p.waitForTimeout(60);
  }
  return null;
};
/** Visible `aria-label`s — nav rows, controls and the sheet header are named, not sorted by DOM order. */
const labels = () => p.evaluate(() => [...document.querySelectorAll('[aria-label]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.getAttribute('aria-label')));
const box = async (sel) => p.locator(sel).first().boundingBox().catch(() => null);
const ariaDisabled = async (sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return null;
  return l.getAttribute('aria-disabled').catch(() => null);
};

/* The Settings sheet is a card; the app behind it (Today) stays visible through the dim, so "is there a
   stepper on this screen" has to be asked of the card, not of the document. The card is the nearest
   ancestor of the sheet's own ✕ that is still taller than the ✕'s row and shorter than the window —
   the header row (44) and the title box (69) fail the height floor, the dim layer fails the ceiling. */
const sheetCard = () => p.evaluate(() => {
  const close = document.querySelector('[data-testid="sheet-close"]');
  if (!close) return null;
  let el = close.parentElement;
  for (let i = 0; i < 12 && el; i++) {
    const r = el.getBoundingClientRect();
    if (r.height > 200 && r.height < innerHeight - 1 && r.width > innerWidth * 0.8 && el.contains(close)) {
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    el = el.parentElement;
  }
  return null;
});
/** Steppers inside the sheet: named "Increase/Decrease <label>", or a bare ＋/− glyph. */
const steppers = () => p.evaluate(() => {
  const close = document.querySelector('[data-testid="sheet-close"]');
  if (!close) return { scoped: false, named: 0, glyphs: 0, sample: [] };
  let el = close.parentElement, scope = null;
  for (let i = 0; i < 12 && el; i++) {
    const r = el.getBoundingClientRect();
    if (r.height > 200 && r.height < innerHeight - 1 && el.contains(close)) { scope = el; break; }
    el = el.parentElement;
  }
  if (!scope) return { scoped: false, named: 0, glyphs: 0, sample: [] };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const named = [...scope.querySelectorAll('[aria-label]')].filter(vis)
    .map((e) => e.getAttribute('aria-label')).filter((l) => l && /^(Increase|Decrease) /.test(l));
  const glyphs = [...scope.querySelectorAll('div,span,button')].filter((e) => !e.children.length).filter(vis)
    .map((e) => (e.textContent || '').trim()).filter((t) => /^[+−+-]$/.test(t));
  return { scoped: true, named: named.length, glyphs: glyphs.length, sample: [...named, ...glyphs].slice(0, 6) };
});
/** Tap `btn` inside the small block that carries `title` — the Data page repeats "Share…" three times. */
const rectInBlock = (title, btn) => p.evaluate(({ title, btn }) => {
  const leaf = [...document.querySelectorAll('div,span')].find((el) => !el.children.length
    && (el.textContent || '').trim() === title && el.getBoundingClientRect().width > 0);
  if (!leaf) return null;
  let el = leaf.parentElement;
  for (let i = 0; i < 6 && el; i++) {
    const r = el.getBoundingClientRect();
    if (r.height > 180) break; // one table's block, not the page
    const hit = [...el.querySelectorAll('[role="button"],button')].find((e) => (e.textContent || '').trim() === btn
      && e.getBoundingClientRect().width > 0);
    if (hit) { const h = hit.getBoundingClientRect(); return { x: h.x + h.width / 2, y: h.y + h.height / 2 }; }
    el = el.parentElement;
  }
  return null;
}, { title, btn });

const openSettings = async () => { await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1500); };
const back = async () => { await tap('[data-testid="sheet-back"]'); await p.waitForTimeout(1200); };

if (await tap('text=Skip')) await p.waitForTimeout(2600); // the first-run tour
await p.waitForTimeout(600);

/* ── 1 — the door the row belongs behind ────────────────────────────────────────────────────────── */
await openSettings();
const card = await sheetCard();
ok('1a', !!card, `the Settings sheet opened as a card (${card ? `${Math.round(card.w)}x${Math.round(card.h)} at y ${Math.round(card.y)}` : 'no card'})`);
const rootText = await pageText();
ok('1b', rootText.includes('Data & export') && rootText.includes('XLSX, CSV, JSON'), 'the root still offers Data & export as the long way round');
const dNav = await box('[aria-label^="Data & export."]');
ok('1c', !!dNav && dNav.height >= 44, `the Data & export row is a real 44 dp+ target (${dNav ? Math.round(dNav.height) : 0} dp)`);
await p.screenshot({ path: `${OUT}/ws3-01-settings-root.png` });

/* ── 2 — the row itself ──────────────────────────────────────────────────────────────────────────── */
const rowSel = '[aria-label^="Export before uninstalling"]';
const rowCount = await p.locator(rowSel).count();
ok('2a', rowCount === 1, `exactly one row is named "Export before uninstalling" (${rowCount})`);
const rowLabel = await p.locator(rowSel).first().getAttribute('aria-label').catch(() => null);
ok('2b', !!rowLabel && /^Export before uninstalling\. /.test(rowLabel), `the accessible name starts with the title (${JSON.stringify((rowLabel ?? '').slice(0, 40))})`);

/* The row's own words. The title is bold text and the warning is the hint under it; both are leaves. */
const rowText = await p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return '';
  return [...el.querySelectorAll('div,span')].filter((e) => !e.children.length)
    .map((e) => (e.textContent || '').trim()).filter(Boolean).join(' | ');
}, rowSel);
ok('2c', rowText.includes('Export before uninstalling'), `the title is printed (${JSON.stringify(rowText.slice(0, 60))})`);
ok('2d', /Uninstalling erases/.test(rowText) && /Auto Backup only restores it if the phone had backed it up/.test(rowText) && /JSON/.test(rowText),
  'the warning says what uninstalling costs, what Auto Backup can and cannot promise, and that the copy is JSON');
/* The release spec (V4 in the v0.9 draft, B3 in v0.5) says Android has no keep-data dialog, so promising one is the lie to catch. */
ok('2e', !/keep your data/i.test(rowText) && !/ask you (whether )?to keep/i.test(rowText) && !/will (still )?be (here|there) after you uninstall/i.test(rowText),
  'the copy promises no keep-data dialog Android cannot show');

const rowBox = await box(rowSel);
const diagNav = await box('[aria-label^="Diagnostics."]');
ok('2f', !!rowBox && rowBox.height >= 44, `one thumb-sized target, not a link in a sentence (${rowBox ? Math.round(rowBox.height) : 0} dp)`);
ok('2g', !!rowBox && !!dNav && !!diagNav && rowBox.y > dNav.y && rowBox.y < diagNav.y && rowBox.y - dNav.y < 120,
  `it sits directly under Data & export and above Diagnostics (${Math.round(rowBox?.y ?? 0)} between ${Math.round(dNav?.y ?? 0)} and ${Math.round(diagNav?.y ?? 0)})`);
ok('2h', rowCount === 1 && (await ariaDisabled(rowSel)) !== 'true', 'the row is present and ready to act, not disabled at rest');
/* An affordance, not a nav chevron: the row draws the export glyph (an SVG child) and no chevron. */
const glyph = await p.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { svg: 0, img: 0 };
  return { svg: el.querySelectorAll('svg').length, img: el.querySelectorAll('img').length };
}, rowSel);
ok('2i', glyph.svg + glyph.img > 0, `the row carries an export affordance (${glyph.svg} svg, ${glyph.img} img)`);
/* Scroll it up without pressing it — the sheet's own ScrollView, since the row starts below the fold. */
await p.locator(rowSel).first().scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(400);
const rowInView = await box(rowSel);
ok('2j', !!rowInView && rowInView.y + rowInView.height > 0 && rowInView.y < H, `scrolling the sheet brings the row into view (y ${Math.round(rowInView?.y ?? -1)})`);
await p.screenshot({ path: `${OUT}/ws3-02-export-row.png` });

/* ── 3 — one tap reaches the existing export flow ───────────────────────────────────────────────── */
/* One writer, three outcomes, and this is their shared vocabulary (`doExport` in Settings.tsx):
     Exported margin-2026-10-29.json            — a file was handed over
     Sharing is not available on this device    — the platform said no
     Export failed: …                           — the write itself threw
   Which one web gets is the build's business; that the row speaks these words at all is the proof it
   went through `runExport` rather than inventing a second path. */
const OUTCOME = /^(Exported .+\.(json|xlsx|zip)|Sharing is not available on this device|Export failed: .+)$/;
const rowTapped = await tapLoc(p.locator(rowSel));
const rowToast = await waitForMatch(OUTCOME, 6000, card);
ok('3a', rowTapped && !!rowToast, `one tap surfaces the export flow's own feedback (${JSON.stringify(rowToast)})`);
if (rowToast) {
  await p.screenshot({ path: `${OUT}/ws3-03-export-feedback.png` });
  info(`export surfaced: ${JSON.stringify(rowToast)}`);
}
/* It acts; it does not navigate. The header still says Settings and no Data-page control has appeared. */
ok('3b', (await p.evaluate(() => [...document.querySelectorAll('[aria-label]')]
  .filter((el) => el.getAttribute('aria-label') === 'Settings')
  .some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }))),
  'the sheet header still reads Settings');
ok('3c', !(await has('Excel workbook (.xlsx)')), 'the tap pushed no page: the Data page is not on screen');
ok('3d', (await p.locator(rowSel).count()) === 1 && (await ariaDisabled(rowSel)) !== 'true', 'the row is still there and not left stuck disabled after a failed export (a dead backup row is the failure this guards)');
/* Dismissed the way the app offers: the toast's own ✕. If the toast is gone already, that is also a pass
   — it must never be a thing that sits over the next tap. */
const dismissed = await tap('[data-testid="toast-dismiss"]');
const goneMs = await waitGone(OUTCOME, 3000, card);
ok('3e', goneMs !== null, dismissed
  ? `the toast is dismissed by its own ✕ (gone ${goneMs} ms after the press)`
  : `the toast cleared itself before it could be dismissed (gone ${goneMs} ms later)`);

/* ── 4 — the Data page's own JSON export says the same thing (one writer, not two) ──────────────── */
const cls = (t) => (!t ? 'none' : t.startsWith('Exported') ? 'exported' : t.startsWith('Sharing is not') ? 'unavailable' : 'failed');
await tap('[aria-label^="Data & export."]');
await p.waitForTimeout(1300);
ok('4a', await has('JSON (.json)'), 'the Data page lists its JSON export');
const jsonShare = await rectInBlock('JSON (.json)', 'Share…');
ok('4b', !!jsonShare, `the JSON block owns its own Share… control (${jsonShare ? `${Math.round(jsonShare.x)},${Math.round(jsonShare.y)}` : 'not found'})`);
await tapPoint(jsonShare);
await p.waitForTimeout(300);
const dataToast = await waitForMatch(OUTCOME, 6000, card);
ok('4c', !!dataToast, `Data → JSON → Share… answers with the same flow's words (${JSON.stringify(dataToast)})`);
ok('4d', !!rowToast && cls(rowToast) === cls(dataToast),
  `the row and the Data page reach the same writer, so the same outcome (${cls(rowToast)} vs ${cls(dataToast)})`);
await p.screenshot({ path: `${OUT}/ws3-04-data-json-share.png` });
await p.waitForTimeout(2800); // let that toast go before measuring the page

/* ── 5 — R1 regression: no +/− steppers where the range lives ───────────────────────────────────── */
const rootSteps = await (async () => { await back(); return steppers(); })();
ok('5a', rootSteps.scoped && rootSteps.named === 0 && rootSteps.glyphs === 0,
  `no stepper on the Settings root (${rootSteps.named} named, ${rootSteps.glyphs} bare +/−${rootSteps.sample.length ? `: ${JSON.stringify(rootSteps.sample)}` : ''})`);
await tap('[aria-label^="Attendance & semester."]');
await p.waitForTimeout(1300);
const attText = await pageText();
ok('5b', attText.includes('Semester starts') && attText.includes('No end date'), 'Attendance & semester is the page the R1 fix is about (it prints its own range)');
const attSteps = await steppers();
ok('5c', attSteps.scoped && attSteps.named === 0 && attSteps.glyphs === 0,
  `no stepper on the date range either (${attSteps.named} named, ${attSteps.glyphs} bare +/−${attSteps.sample.length ? `: ${JSON.stringify(attSteps.sample)}` : ''})`);
await p.screenshot({ path: `${OUT}/ws3-05-no-steppers.png` });

/* ── honest gaps ────────────────────────────────────────────────────────────────────────────────── */
uv('the share sheet itself, and the file it hands over: tap the row on the phone, then import the JSON back through Settings → Data & export → Import and compare the counts');
uv('the row on a real Android build: the file lands in the cache dir, the share sheet names it, and uninstalling + reinstalling restores only if Google backup ran');
uv('Auto Backup actually carrying the database: install, back up, uninstall, reinstall from the store and confirm the planner is there (the rules files are a native promise the browser cannot reach)');
uv('the row being disabled mid-export on a slow phone (busy is shared with the Data page, and web fails too fast to see it)');
uv('TalkBack reading the warning half of the accessible name');

const real = errs.filter((e) => !/ExpoModulesCoreJSLogger|Download the React DevTools|shadow|pointerEvents|useNativeDriver|transform-origin/i.test(e));
if (real.length) { console.log('PAGE ERRORS:'); for (const e of real.slice(0, 8)) console.log('   ' + e); }
ok('6', real.length === 0, `${real.length} unexpected page errors`);

await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
