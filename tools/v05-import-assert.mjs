/* v0.5 / WS1 (import overhaul) assertions — what a browser can honestly show about the two doors.
 *
 *   node tools/v05-import-assert.mjs [--url http://localhost:8098] [--out .shots/v05]
 *
 * One context, 412x915, one session, in this order:
 *   1 — the Import page is reachable (Settings → Data & export → Import)
 *   2 — the paste door previews a small full-dataset file with a per-dataset add breakdown, and
 *       Import is enabled with the size of the write in its label
 *   3 — Import writes: the toast counts the rows and the subject's class block is on Week
 *   4 — the SAME file again reads `updated`, not `new` (add/update honesty), and Import stays enabled
 *   5 — the pick-file door exists and is enabled (the OS picker cannot run headless → UNVERIFIED)
 *   6 — an attendance CSV that carries an `upcoming` row does not block: it says what was skipped,
 *       and Import is enabled for the row that can be written
 *
 * The web build runs the in-memory repository, so this proves parse → plan → preview → apply end to
 * end and says nothing about SQLite, the file system or the document picker.
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

/* Same tap rules as tools/v031-assert.mjs and tools/w5-assert.mjs: RNW answers Pressability on
   POINTERDOWN, the Book keeps every screen mounted (`display:none` for the hidden ones, so a hidden
   page has no box at all), and controls can sit below the fold. The FIRST match is often not the
   control the eye sees — `[data-testid="sheet-dismiss"]` and `[data-testid="sheet-close"]` share
   `aria-label="Close"` and the dismiss pane is the whole screen — so callers pass testids where one
   exists. */
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

/* Leaf text with a real box. A hidden Book page is `display:none`, so it has no box and cannot leak
   into these strings; the page behind an open sheet can, which is why every assertion below names a
   string only the thing under test prints. */
const texts = () => p.evaluate(() => [...document.querySelectorAll('div,span')]
  .filter((el) => !el.children.length && (el.textContent || '').trim())
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.textContent.trim()));
const pageText = async () => (await texts()).join(' | ');
const has = async (s) => (await pageText()).includes(s);
const waitFor = async (s, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await has(s)) return true; await p.waitForTimeout(200); }
  return false;
};
/** Visible `aria-label`s — the app names its controls and its Week blocks with them. */
const labels = () => p.evaluate(() => [...document.querySelectorAll('[aria-label]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.getAttribute('aria-label')));
/** `true` when the control is on screen and `aria-disabled` is not "true". `null` when it is absent. */
const enabled = async (sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return null;
  const bb = await l.boundingBox().catch(() => null);
  if (!bb || bb.width === 0 || bb.height === 0) return null;
  return (await l.getAttribute('aria-disabled').catch(() => null)) !== 'true';
};
const labelOf = async (sel) => { const l = p.locator(sel).first(); return (await l.count()) ? (await l.textContent().catch(() => null))?.trim() ?? '' : ''; };
/** The preview's own count line (`1 subject (1 new) · 1 class (1 new)`) and its skip line, as printed.
 *  Read as leaves rather than by regex on the joined page, so a line that is absent reads as absent
 *  instead of matching a substring of the line next to it. */
const previewLines = async () => {
  const all = await texts();
  const counts = all.find((t) => /^\d+ [a-z]/.test(t) && /\((?:.*\bnew\b|.*\bupdated\b|add or update)\)/.test(t)) ?? '';
  const skippedLine = all.find((t) => t.startsWith('Skipped (not written):')) ?? '';
  return { counts, skippedLine };
};

const openSettings = async () => { await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1400); };
/** Settings → Data & export → Import, and wait for the paste box rather than trusting a sleep. */
const goImport = async () => {
  await openSettings();
  await tap('[aria-label^="Data & export."]');
  await p.waitForTimeout(1200);
  await tap('[aria-label^="Import."]');
  await p.waitForTimeout(1300);
  return p.locator('textarea[aria-label="JSON to import"]').first().waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false);
};
const closeSheet = async () => { await tap('[data-testid="sheet-close"]'); await p.waitForTimeout(1200); };
const paste = async (t) => { await p.locator('textarea[aria-label="JSON to import"]').first().fill(t); await p.waitForTimeout(350); };
const check = async () => {
  await tap('[data-testid="import-check"]');
  await p.waitForTimeout(400); // let the pre-check frame go: a previous preview is cleared by the paste
  await waitFor('What this file carries', 6000);
  await p.waitForTimeout(300);
};

/* The fixture: one semester, one subject with one class, one task. Written inline so the numbers in
   the assertions below are the numbers in the file. Names are chosen so they cannot be mistaken for
   a seeded sample subject ("Database Systems", "Intro to Economics", …). */
const SUBJECT = 'Organic Chem';
const FILE = JSON.stringify({
  semester: { start: '2026-09-07', end: '2026-12-20' },
  courses: [{ name: SUBJECT, room: 'S3', meetings: [{ weekday: 0, start: '13:00', end: '14:30' }] }],
  tasks: [{ title: 'Name the functional groups', course: SUBJECT, due: '2026-10-30T09:00' }],
}, null, 2);

if (await tap('text=Skip')) await p.waitForTimeout(2600); // the first-run tour
await p.waitForTimeout(600);

/* ── 1 — the door exists ─────────────────────────────────────────────────────────────────────── */
const reached = await goImport();
ok('1a', reached, 'Settings → Data & export → Import opens a page with the paste box');
ok('1b', (await has('Import a JSON export or a CSV table')) || (await has('Import only adds rows')), 'the page states what it accepts and that it never deletes');
ok('1c', (await has('JSON or CSV')) && (await has('Pick file')), 'both doors are named on the page');
await p.screenshot({ path: `${OUT}/01-import-page.png` });

/* ── 2 — the paste door previews, per dataset, before anything is written ────────────────────── */
await paste(FILE);
ok('2a', (await enabled('[data-testid="import-commit"]')) === false, 'with nothing previewed the Import button is disabled');
await check();
let text = await pageText();
let lines = await previewLines();
ok('2b', /1 subject \(1 new\)/.test(lines.counts), `the preview splits the subject into new: "${lines.counts}"`);
ok('2c', /1 class \(1 new\)/.test(lines.counts) && /1 task \(1 new\)/.test(lines.counts), 'the class and the task are counted with their own add split');
ok('2d', !/\b1 subjects\b|\b1 classes\b|\b1 tasks\b/.test(text), 'a count of one is singular');
ok('2e', !/\d+ problems? stop the import/i.test(text), 'a good file raises no problems');
ok('2f', (await enabled('[data-testid="import-commit"]')) === true, 'Import is enabled');
ok('2g', (await labelOf('[data-testid="import-commit"]')) === 'Import 3 rows', `the button names the size of the write (${JSON.stringify(await labelOf('[data-testid="import-commit"]'))})`);
await p.screenshot({ path: `${OUT}/02-preview-new.png` });

/* ── 3 — the write, the toast, and the row on the page ───────────────────────────────────────── */
await tap('[data-testid="import-commit"]');
ok('3a', await waitFor('Imported 3 rows', 6000), 'the toast counts the imported rows');
await p.screenshot({ path: `${OUT}/03-imported-toast.png` });
ok('3b', await waitFor('Excel workbook (.xlsx)', 4000), 'a successful import returns to the Data page');
await closeSheet();
await p.waitForTimeout(2600); // let the toast go before touching the tab bar
await tap('[data-testid="tab-week"]');
await p.waitForTimeout(1600);
const week = await labels();
/* The block is named "<subject>, Mon 13:00 to 14:30"; the timetable repeats weekly, so this holds on
   any day the script runs (unlike "Due this week", which is why the task is not asserted here). */
const block = week.find((l) => l && l.startsWith(`${SUBJECT}, Mon `));
ok('3c', !!block, `the imported subject's class is a block on Week (${JSON.stringify(block ?? week.slice(-4))})`);
ok('3d', week.some((l) => l === `${SUBJECT}, Mon 13:00 to 14:30`), 'the block carries the imported time, so it is this file\'s row and not a sample one');
await p.screenshot({ path: `${OUT}/04-week-landed.png` });

/* ── 4 — the same file again reads as an update, not as a new row ────────────────────────────── */
const again = await goImport();
ok('4a0', again, 'the Import page opens a second time');
await paste(FILE);
await check();
text = await pageText();
lines = await previewLines();
const said = `counts: ${JSON.stringify(lines.counts)}${lines.skippedLine ? `, skipped: ${JSON.stringify(lines.skippedLine)}` : ''}`;
ok('4a', !/\d+ subjects? \(\d+ new\)/.test(lines.counts), `a re-import does not call the subject new (${said})`);
ok('4b', /1 subject \(1 updated\)/.test(lines.counts), `the subject reads as updated, not skipped or new (${said})`);
ok('4c', /1 class \(1 updated\)/.test(lines.counts) && /1 task \(1 updated\)/.test(lines.counts), 'the class and the task read as updated too');
ok('4d', (await enabled('[data-testid="import-commit"]')) === true, 'Import stays enabled on a re-import');
ok('4e', !/\d+ problems? stop the import/i.test(text), 'a re-import raises no problems');
await p.screenshot({ path: `${OUT}/05-preview-updated.png` });

/* ── 5 — the pick-file door (the OS picker itself is not a browser thing) ────────────────────── */
/* Proved by DOM only: presence, a box inside the window, enabled, labelled. Tapping it opens the
   platform's document picker, which a headless browser cannot answer — recorded as UNVERIFIED below
   rather than failed. */
const pick = p.locator('[data-testid="import-pick"]').first();
const present = (await pick.count()) > 0;
if (present) await pick.scrollIntoViewIfNeeded().catch(() => {});
await p.waitForTimeout(300);
const pickBox = present ? await pick.boundingBox().catch(() => null) : null;
const inView = !!pickBox && pickBox.width > 0 && pickBox.height > 0 && pickBox.y + pickBox.height > 0 && pickBox.y < H;
ok('5a', inView, `the Pick file button is on the page, inside the sheet's window (${JSON.stringify(pickBox && { x: Math.round(pickBox.x), y: Math.round(pickBox.y) })})`);
ok('5b', (await enabled('[data-testid="import-pick"]')) === true, 'Pick file is enabled');
ok('5c', (await labelOf('[data-testid="import-pick"]')) === 'Pick file', 'and it is labelled for what it opens');
await p.screenshot({ path: `${OUT}/06-pick-file.png` });
uv('tapping Pick file and reading the chosen JSON/CSV: needs a device, the browser has no document picker');

/* ── 6 — a CSV with an `upcoming` row is skipped, not refused ────────────────────────────────── */
/* The header is the export's own (`date,course,start,status`; `subject` is accepted for `course`).
   The second row is what this app writes for a class that has not happened: it has nothing to
   record, and it must not stop the row above it from landing. */
const CSV = [
  'date,subject,start,status',
  '2026-09-14,Organic Chem,13:00,p',
  '2026-09-21,Organic Chem,13:00,upcoming',
].join('\n');
await paste(CSV);
await check();
text = await pageText();
ok('6a', !(await has('Which table is this?')), 'the header names its table, so nothing is asked back');
ok('6b', !/\d+ problems? stop the import/i.test(text), 'the upcoming row is not a problem that stops the import');
ok('6c', /1 attendance mark \(1 new\)/.test(text), `the finished class is previewed as a new mark ("${(text.match(/1 attendance mark[^|]*/) || [''])[0].trim()}")`);
ok('6d', /Skipped \(not written\): 1 attendance mark/.test(text), 'the upcoming row is named as skipped');
ok('6e', (await enabled('[data-testid="import-commit"]')) === true, 'Import is enabled for the row that can be written');
ok('6f', (await labelOf('[data-testid="import-commit"]')) === 'Import 1 row', `and it counts only that row (${JSON.stringify(await labelOf('[data-testid="import-commit"]'))})`);
await p.screenshot({ path: `${OUT}/07-csv-upcoming.png` });

/* ── honest gaps ────────────────────────────────────────────────────────────────────────────── */
uv('the same file twice on a real database: force-quit between the two imports and confirm the row count does not grow (in-memory repo proves the plan, not the transaction)');
uv('the document picker on Android (SAF): pick a .json and a .csv, and a file that is neither');
uv('a large paste (thousands of rows) while the preview builds: the sheet must stay responsive');

const real = errs.filter((e) => !/ExpoModulesCoreJSLogger|Download the React DevTools|shadow|pointerEvents|useNativeDriver|transform-origin/i.test(e));
if (real.length) { console.log('PAGE ERRORS:'); for (const e of real.slice(0, 8)) console.log('   ' + e); }
ok('7', real.length === 0, `${real.length} unexpected page errors`);

await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
