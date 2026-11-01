/* v0.5 / WS2 (semesters) assertions — what a browser can honestly show about the term.
 *
 *   node tools/v05-semester-assert.mjs [--url http://localhost:8098] [--out .shots/v05]
 *
 * One context, 412x915, one session, in this order:
 *   1 — Settings → Semesters is reachable and names the running term, its range and the days left
 *   2 — R1: the range is six numeric keypad fields (year/month/day × start/end), never a stepper
 *   3 — a typed end date saves as `7 Sep – 20 Dec 2026`, the days-left line follows the calendar, and
 *       Settings → Attendance reads the same two dates back (the row and its settings mirror agree)
 *   4 — a renamed term keeps its name after leaving the page and coming back
 *   5 — "Start a new semester" only asks: Cancel leaves the active term and the archive untouched
 *   6 — Keep attendance archives the old term (snapshot kept, its own range) and clears the timetable
 *   7 — Start fresh archives again, without the "attendance kept" promise, and keeps both terms
 *
 * The web build runs the in-memory repository, so this proves the page → store → repository → page
 * loop and says nothing about SQLite, a restart, or the platform keyboard.
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

/* Same tap rules as tools/v05-import-assert.mjs: RNW answers Pressability on POINTERDOWN, the Book
   keeps every page mounted (`display:none` for the hidden ones, so a hidden page has no box), and
   controls can sit below the fold. A sheet leaves the focused page visible behind it, so every
   assertion below names a string only the control under test prints. */
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

/* Leaf text with a real box (a hidden Book page is `display:none` and has no box). */
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
/** Visible `aria-label`s — class blocks, nav rows and controls are named, not sorted by DOM order. */
const labels = () => p.evaluate(() => [...document.querySelectorAll('[aria-label]')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
  .map((el) => el.getAttribute('aria-label')));
const labelOf = async (sel) => { const l = p.locator(sel).first(); return (await l.count()) ? (await l.textContent().catch(() => null))?.trim() ?? '' : ''; };
/** `true`/`false` from `aria-disabled`, `null` when the control is absent or has no box. */
const enabled = async (sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return null;
  const bb = await l.boundingBox().catch(() => null);
  if (!bb || bb.width === 0 || bb.height === 0) return null;
  return (await l.getAttribute('aria-disabled').catch(() => null)) !== 'true';
};
const fieldValue = async (sel) => {
  const l = p.locator(sel).first();
  if (!(await l.count())) return null;
  return l.inputValue().catch(() => null);
};
const fillField = async (sel, v) => {
  const l = p.locator(sel).first();
  await l.waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
  const done = await l.fill(v).then(() => true).catch(() => false);
  await p.waitForTimeout(600);
  return done;
};
/** Class blocks on Week are named "<subject>, Mon 13:00 to 14:30"; day strips are "Mon 26, 3 classes". */
const classBlocks = async () => (await labels()).filter((l) => l && /, (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d{2} to /.test(l));

const openSettings = async () => { await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1400); };
/** The Settings sheet stays open across page pushes and pops — tapping the gear behind its dim would hit
 *  the sheet, not the gear. So it is opened only when it is not already up. */
const sheetOpen = async () => {
  const l = p.locator('[data-testid="sheet-close"]').first();
  if (!(await l.count())) return false;
  const bb = await l.boundingBox().catch(() => null);
  return !!bb && bb.width > 0 && bb.height > 0;
};
const goSemesters = async () => {
  if (!(await sheetOpen())) await openSettings();
  await tap('[aria-label^="Semesters."]');
  const there = await p.locator('input[data-testid="semester-active-name"]').first()
    .waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(900); // the page swap settles
  return there;
};
const closeSheet = async () => { await tap('[data-testid="sheet-close"]'); await p.waitForTimeout(1300); };
const back = async () => { await tap('[data-testid="sheet-back"]'); await p.waitForTimeout(1200); };

/* Calendar facts the copy below is checked against: a fixture date is a moving target, so the
   days-left line is compared with the browser's own clock rather than with a number written here. */
const calendar = await p.evaluate(() => {
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const day = (n) => new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  const end = new Date(2026, 11, 20);
  const left = Math.round((day(end) - day(now)) / 86_400_000);
  const leftLine = left > 0 ? `${left} ${left === 1 ? 'day' : 'days'} left` : left === 0 ? 'Last day today' : `Ended ${-left} ${left === -1 ? 'day' : 'days'} ago`;
  return { today: `${now.getDate()} ${mo[now.getMonth()]} ${now.getFullYear()}`, left, leftLine };
});

if (await tap('text=Skip')) await p.waitForTimeout(2600); // the first-run tour
await p.waitForTimeout(600);

/* ── 1 — the door and the running term ──────────────────────────────────────────────────────────── */
const reached = await goSemesters();
ok('1a', reached, 'Settings → Semesters opens the page with the term name field');
ok('1b', (await fieldValue('[data-testid="semester-active-name"]')) === 'Semester 2026', `the seeded term is named (${JSON.stringify(await fieldValue('[data-testid="semester-active-name"]'))})`);
let text = await pageText();
ok('1c', text.includes('No end date yet') && text.includes('from 7 Sep 2026'), 'the active term prints its range as open-ended, not as a guessed end');
ok('1d', text.includes('No earlier semesters yet.'), 'a first run says plainly that nothing has been archived yet');
await p.screenshot({ path: `${OUT}/01-semesters-active.png` });

/* ── 2 — R1: typed dates, not stepped ones ──────────────────────────────────────────────────────── */
const startIds = ['semester-start-year', 'semester-start-month', 'semester-start-day'];
const numeric = [];
for (const id of startIds) {
  const l = p.locator(`input[data-testid="${id}"]`).first();
  numeric.push((await l.count()) === 1 ? await l.getAttribute('inputmode') : null);
}
ok('2a', numeric.every((m) => m === 'numeric'), `the start date is three numeric fields (${JSON.stringify(numeric)})`);
const names = await labels();
const spoken = ['semester start year', 'semester start month', 'semester start day'].filter((x) => names.includes(x));
ok('2b', spoken.length === 3, `each box names which date and part it edits, not three identical "Year" stops (${JSON.stringify(spoken)})`);
const steps = (await labels()).filter((l) => l && /^(Increase|Decrease) /.test(l));
ok('2c', steps.length === 0, `no stepper is on the page (${steps.length} increase/decrease controls)`);
await tap('[data-testid="no-end-date"]');
await p.waitForTimeout(900);
const six = [];
for (const id of [...startIds, 'semester-end-year', 'semester-end-month', 'semester-end-day']) {
  const l = p.locator(`input[data-testid="${id}"]`).first();
  six.push((await l.count()) === 1 ? await l.getAttribute('inputmode') : null);
}
ok('2d', six.length === 6 && six.every((m) => m === 'numeric'), `turning the end back on gives six numeric boxes (${JSON.stringify(six)})`);
ok('2e', (await fieldValue('[data-testid="semester-end-year"]')) === '2026', 'the end date is seeded on a real day to edit, not left blank');
await p.screenshot({ path: `${OUT}/02-keypad-range.png` });

/* ── 3 — a typed day saves the range, and the app reads it back ─────────────────────────────────── */
ok('3a', await fillField('[data-testid="semester-end-day"]', '20'), 'the end day box accepts a typed value');
ok('3b', await waitFor('7 Sep – 20 Dec 2026', 6000), 'the pair reads back as 7 Sep – 20 Dec 2026');
ok('3c', await waitFor(calendar.leftLine, 6000), `the days-left line follows the calendar (${JSON.stringify(calendar.leftLine)} at the browser's clock)`);
ok('3d', !(await has('The end date is before the start')), 'a real range raises no invalid-range hint');
await p.screenshot({ path: `${OUT}/03-range-saved.png` });

await back(); // Settings root
const nav = (await labels()).find((l) => l && l.startsWith('Attendance & semester.'));
ok('3e', !!nav && nav.includes('7 Sep – 20 Dec 2026'), `Settings already prints the new range on its own row (${JSON.stringify(nav)})`);
await tap('[aria-label^="Attendance & semester."]');
await p.waitForTimeout(1300);
const mirror = {
  start: [await fieldValue('[data-testid="semester-start-year"]'), await fieldValue('[data-testid="semester-start-month"]'), await fieldValue('[data-testid="semester-start-day"]')],
  end: [await fieldValue('[data-testid="semester-end-year"]'), await fieldValue('[data-testid="semester-end-month"]'), await fieldValue('[data-testid="semester-end-day"]')],
};
ok('3f', JSON.stringify(mirror) === JSON.stringify({ start: ['2026', '09', '07'], end: ['2026', '12', '20'] }),
  `Settings → Attendance reads the same two dates back (${JSON.stringify(mirror)})`);
await p.screenshot({ path: `${OUT}/04-settings-mirror.png` });
await back();

/* ── 4 — a rename is written, not just printed ──────────────────────────────────────────────────── */
ok('4a', await goSemesters(), 'the Semesters page reopens from Settings');
ok('4b', await fillField('[data-testid="semester-active-name"]', 'Autumn 2026'), 'the name field takes a typed name');
ok('4c', (await enabled('[data-testid="semester-save-name"]')) !== false, 'Save name is enabled once the name differs');
await tap('[data-testid="semester-save-name"]');
await p.waitForTimeout(1200);
ok('4d', (await fieldValue('[data-testid="semester-active-name"]')) === 'Autumn 2026', 'the name is on the page after saving');
await closeSheet();
await tap('[data-testid="tab-week"]');
await p.waitForTimeout(1800);
const before = await classBlocks();
ok('4e', before.length > 0, `the demo timetable is on Week before roll-over (${before.length} class blocks)`);
ok('4f', await goSemesters(), 'the Semesters page opens a second time');
ok('4g', (await fieldValue('[data-testid="semester-active-name"]')) === 'Autumn 2026', 'the renamed term is read back from the repository, not kept in the page');
await p.screenshot({ path: `${OUT}/05-renamed.png` });

/* ── 5 — roll-over asks before it destroys ──────────────────────────────────────────────────────── */
await tap('[data-testid="semester-rollover"]');
await p.waitForTimeout(900);
text = await pageText();
ok('5a', text.includes('Start a new semester?') && text.includes('Keep attendance') && text.includes('Start fresh'), 'the first press asks keep-or-fresh and states what the archive holds');
ok('5b', text.includes('No earlier semesters yet.'), 'asking has not archived or cleared anything yet');
ok('5c', (await fieldValue('[data-testid="semester-active-name"]')) === 'Autumn 2026', 'the active term is untouched while the question is open');
await p.screenshot({ path: `${OUT}/06-rollover-asks.png` });
await tap('[data-testid="semester-rollover-cancel"]');
await p.waitForTimeout(900);
ok('5d', !(await has('Keep attendance')) && !(await has('Start fresh')), 'Cancel takes the question away');
ok('5e', (await fieldValue('[data-testid="semester-active-name"]')) === 'Autumn 2026' && (await has('No earlier semesters yet.')), 'Cancel leaves the active term and the archive exactly as they were');

/* ── 6 — keep attendance: archive, then start lean ──────────────────────────────────────────────── */
await tap('[data-testid="semester-rollover"]');
await p.waitForTimeout(700);
await tap('[data-testid="semester-rollover-keep"]');
ok('6a', await waitFor('Autumn 2026 archived — attendance kept', 10_000), 'the toast names the term and the choice it took');
await p.waitForTimeout(1200);
text = await pageText();
ok('6b', (await fieldValue('[data-testid="semester-active-name"]')) === 'Semester 2026', `a new term is active (${JSON.stringify(await fieldValue('[data-testid="semester-active-name"]'))})`);
ok('6c', text.includes('Autumn 2026') && text.includes('7 Sep – 20 Dec 2026'), 'the archived term keeps its own name and range');
// v0.5 D4: an archived term with a readable snapshot is a row that opens (enabled), not a sentence
const openable = async () => p.locator('[data-testid^="semester-past-"]:not([aria-disabled="true"])').count();
ok('6d', (await openable()) === 1 && !text.includes('No earlier semesters yet.'), 'the archived term is listed with its snapshot');
const todayLine = `${calendar.today.split(' ').slice(0, 2).join(' ')}`;
ok('6e', text.includes(todayLine), `the new term starts today, ${JSON.stringify(todayLine)}`);
await p.screenshot({ path: `${OUT}/07-after-keep.png` });
await closeSheet();
await tap('[data-testid="tab-week"]');
await p.waitForTimeout(1800);
const after = await classBlocks();
ok('6f', after.length === 0, `the new term starts with a lean timetable (${before.length} blocks before, ${after.length} after)`);
await tap('[data-testid="tab-today"]');
await p.waitForTimeout(1500);
ok('6g', await has('No classes today'), 'Today says plainly that there are no classes, rather than showing last term\'s');
await p.screenshot({ path: `${OUT}/08-lean-week.png` });

/* ── 7 — start fresh: the same archive, without the attendance promise ──────────────────────────── */
ok('7a', await goSemesters(), 'the Semesters page opens after the roll-over');
await tap('[data-testid="semester-rollover"]');
await p.waitForTimeout(700);
await tap('[data-testid="semester-rollover-wipe"]');
ok('7b', await waitFor('Semester 2026 archived', 10_000), 'the second roll-over archives the term it replaced');
await p.waitForTimeout(1200);
const toast = (await texts()).find((t) => t.includes('archived') && !t.startsWith('No earlier')) ?? '';
ok('7c', !!toast && !toast.includes('attendance kept'), `Start fresh does not claim to have kept attendance (${JSON.stringify(toast)})`);
text = await pageText();
const kept = await openable();
ok('7d', kept === 2 && text.includes('Autumn 2026'), `both rolled-over terms are listed with their snapshots (${kept})`);
ok('7e', (await fieldValue('[data-testid="semester-active-name"]')) === 'Semester 2026', 'a third term is active');
await p.screenshot({ path: `${OUT}/09-two-archived.png` });

/* 7f–7h (v0.5 D4): an earlier term opens in place as a read-only summary of what it amounted to. The
   first archive is the sample term, so it has subjects, marks and tasks to show. */
const past = p.locator('[data-testid^="semester-past-"]');
ok('7f', (await past.count()) >= 2, `each earlier term is a tappable row (${await past.count()})`);
await past.last().scrollIntoViewIfNeeded().catch(() => {});
await past.last().click();
await p.waitForTimeout(500);
const opened = await pageText();
ok('7g', /tasks? done/.test(opened) && /%|—/.test(opened), 'the summary shows averages and the tasks finished');
ok('7h', (await p.locator('[data-testid^="semester-past-"] >> xpath=..//input').count()) === 0, 'nothing in the summary is editable');
await p.screenshot({ path: `${OUT}/10-past-term-open.png` });

/* ── honest gaps ────────────────────────────────────────────────────────────────────────────────── */
uv('a roll-over on the real database: force-quit between the archive and the clear, reopen, and confirm the term is still listed with its snapshot');
uv('attendance kept vs wiped: no screen reports marks once the timetable is cleared, so the retention itself needs the database (or a history browser)');
uv('the Android numeric keypad opening on a term field, and TalkBack reading "semester start year"');
uv('SQLite: the same page after an app restart, since the web build is the in-memory repository');

const real = errs.filter((e) => !/ExpoModulesCoreJSLogger|Download the React DevTools|shadow|pointerEvents|useNativeDriver|transform-origin/i.test(e));
if (real.length) { console.log('PAGE ERRORS:'); for (const e of real.slice(0, 8)) console.log('   ' + e); }
ok('8', real.length === 0, `${real.length} unexpected page errors`);

await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
