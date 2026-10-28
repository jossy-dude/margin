/* v0.3.1 assertions — the half a browser can honestly show.
 *
 *   node tools/v031-assert.mjs [--url http://localhost:8098] [--out .shots/v031]
 *
 * One context, 412x915, walking the app like a finger:
 *   1 — the Settings root prints the semester as a range, not a bare start date
 *   2 — Attendance & semester carries year/month/day for both ends and the "No end date" switch
 *   3 — the year stepper actually moves the stored year (2026 → 2027)
 *   4 — Data offers Import, and Import previews the compact shape with per-entity counts
 *   5 — Import writes: the toast counts the rows and the subject lands on Week
 *   6 — About prints the one version string
 *
 * The web build runs the in-memory repository, so this proves the store/parse/apply path end to end and
 * says nothing about SQLite or the file system. Those are printed as UNVERIFIED-ON-DEVICE.
 *
 * Exit code is non-zero if any hard assertion fails.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/v031');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, detail) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${detail}`); if (!pass) fails.push(n); };
const info = (s) => console.log(`     · ${s}`);
const uv = (s) => info(`UNVERIFIED-ON-DEVICE: ${s}`);

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
await p.waitForTimeout(5000);

/* Same tap rules as tools/cap-baseline.mjs and tools/w5-assert.mjs: RNW answers Pressability on
   POINTERDOWN, the Book keeps every screen mounted, and controls can sit below the fold. */
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

/* Leaf text nodes with a real box on the shipped screen (hidden Book pages sit at negative x). */
const LEAFS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    out.push({ t, x: r.x, y: r.y });
  }
  return out;
})()`;
const leafs = () => p.evaluate(LEAFS);
const pageText = async () => (await leafs()).map((e) => e.t).join(' | ');
/** Everything on the shipped page, including what is below the fold (the About page is taller than the
 *  sheet, and the Updates section sits under the erase button). */
const fullText = () => p.evaluate(() => [...document.querySelectorAll('div,span')]
  .filter((el) => !el.children.length && (el.textContent || '').trim())
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.x >= -1; })
  .map((el) => el.textContent.trim()).join(' | '));
const has = async (s) => (await pageText()).includes(s);
const waitFor = async (s, ms = 6000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await has(s)) return true; await p.waitForTimeout(200); }
  return false;
};

const openSettings = async () => { await tap('[data-testid="open-settings"]'); await p.waitForTimeout(1400); };
const back = async () => { await tap('[aria-label="Back"]'); await p.waitForTimeout(900); };

if (await tap('text=Skip')) { await p.waitForTimeout(2600); }
await p.waitForTimeout(600);

/* ── 1 — the root prints a range ─────────────────────────────────────────────────────────────── */
await openSettings();
const root = await pageText();
ok('1a', /Semester (from )?\d{1,2} [A-Z][a-z]{2} \d{4}/.test(root), `root hint: "${(root.match(/Semester [^|]*/) || [''])[0].trim()}"`);
ok('1b', !/Semester 2026-09-07/.test(root), 'the raw YYYY-MM-DD is not printed at the user');
await p.screenshot({ path: `${OUT}/settings-root.png` });

/* ── 2 — both ends have a full date, and the year moves ──────────────────────────────────────── */
await tap('[aria-label^="Attendance & semester."]');
await p.waitForTimeout(1200);
let text = await pageText();
ok('2a', text.includes('Semester starts'), 'the start is labelled');
ok('2b', text.includes('No end date'), 'the open-ended switch exists');
/* `Stepper` names its own controls: the value is "Set <label> by typing", the buttons are
   "Decrease/Increase <label>". The layout is deliberate: the year is wide (4 glyphs) and gets its
   own labelled line; month and day share the next one, so nothing is orphaned and nothing wraps. */
const startYear = await p.locator('[aria-label="Set start year by typing"]').first().textContent().catch(() => null);
ok('2c', startYear === '2026', `start year reads ${JSON.stringify(startYear)}`);
const geom = await p.evaluate(() => {
  const box = (a) => { const el = document.querySelector(`[aria-label="${a}"]`); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, right: r.right }; };
  return { year: box('Set start year by typing'), month: box('Set start month by typing'), day: box('Set start day by typing') };
});
const mdDelta = geom.month && geom.day ? Math.abs(geom.month.y - geom.day.y) : null;
const yearAbove = geom.year && geom.month ? geom.year.y < geom.month.y : false;
ok('2d', mdDelta !== null && mdDelta < 12 && yearAbove, `year on its own line, month+day share one (delta ${mdDelta})`);
ok('2d2', !!geom.day && geom.day.right <= 412 - 8, `the month/day row stays inside the page (right edge ${geom.day?.right})`);
const dayValue = await p.locator('[aria-label="Set start day by typing"]').first().textContent().catch(() => null);
ok('2e', dayValue === '07', `a lone day is padded, not one ambiguous glyph (${JSON.stringify(dayValue)})`);
await p.screenshot({ path: `${OUT}/attendance-semester.png` });

const yearUp = p.locator('[aria-label="Increase start year"]').first();
const moved = await tapLoc(yearUp);
await p.waitForTimeout(600);
const yearAfter = await p.locator('[aria-label="Set start year by typing"]').first().textContent().catch(() => null);
ok('3', moved && yearAfter === '2027', `year stepper: 2026 → ${JSON.stringify(yearAfter)}`);
await p.screenshot({ path: `${OUT}/attendance-year-2027.png` });
await back();

/* ── 4 — the Import page previews the compact shape ─────────────────────────────────────────── */
await tap('[aria-label^="Data & export."]');
await p.waitForTimeout(1200);
ok('4a', await has('Import'), 'Data offers Import');
await tap('[aria-label^="Import."]');
await p.waitForTimeout(1200);
ok('4b', await has('Paste a Margin JSON export'), 'the Import page explains both shapes');

const SAMPLE = JSON.stringify({
  semester: { start: '2026-09-07', end: '2026-12-20' },
  courses: [{ name: 'DB Systems', room: 'B12', meetings: [{ weekday: 1, start: '08:30', end: '10:00' }] }],
  days: [{ date: '2026-09-14', status: 'cancelled', reason: 'holiday' }],
  tasks: [{ title: 'Read chapter 1', course: 'DB Systems', due: '2026-09-20T23:59' }],
  marks: [{ course: 'DB Systems', name: 'Quiz 1', score: 18, weight: 10 }],
}, null, 2);
const box = p.locator('textarea').first();
await box.waitFor({ state: 'visible', timeout: 8000 });
await box.fill(SAMPLE);
await p.waitForTimeout(300);
await tap('[aria-label="Check"]');
await p.waitForTimeout(900);
text = await pageText();
ok('4c', text.includes('1 subject') && text.includes('1 class') && text.includes('1 task') && text.includes('1 day mark') && text.includes('1 mark'), `preview counts: "${(text.match(/\d+ subject[^|]*/) || [''])[0].trim()}"`);
ok('4c2', !/\b1 (subjects|classes|tasks|day marks|marks)\b/.test(text), 'a count of one is singular');
ok('4d', text.includes('Semester 7 Sep – 20 Dec 2026'), 'the semester the file carries is previewed');
ok('4e', !/\d+ problems? stop the import/i.test(text), 'a good file raises no problems');
await p.screenshot({ path: `${OUT}/import-preview.png` });

/* ── 5 — Import writes, and the row lands on Week ───────────────────────────────────────────── */
const importBtn = p.locator('[aria-label^="Import 5 rows"]').first();
ok('5a', (await importBtn.count()) > 0, 'the button names the size of the write');
await tapLoc(importBtn);
await p.waitForTimeout(1800);
ok('5b', await waitFor('Imported 5 rows', 4000), 'the toast counts the imported rows');
ok('5c', await has('Excel workbook (.xlsx)'), 'a successful import returns to the Data page');
await p.screenshot({ path: `${OUT}/import-done.png` });

/* ── 6 — the semester the file carried survived the write, and About prints one version ──────── */
await back(); // data → root
await p.waitForTimeout(900);
ok('6a', await has('Semester 7 Sep – 20 Dec 2026'), `the imported semester is the stored one ("${(await pageText()).match(/Semester [^|]*/)?.[0]?.trim() ?? ''}")`);
/* The version line and the Updates block moved off the destructive page when About was split
   out of "Reset": they are facts about the build, not about erasing things. */
await tap('[aria-label^="About."]');
await p.waitForTimeout(1000);
ok('6b', await has('Margin 0.3.1'), 'About prints 0.3.1');
/* Updates: a web build cannot update itself, so the page must say so rather than offer a button whose
   only possible answer is "unavailable". The native row is a phone check (V031.1-7). */
const about = await fullText();
ok('6c', about.includes('Updates are checked in the installed app'), 'About says where updates are checked, instead of pretending');
ok('6d', (await p.locator('[aria-label="Check for updates"]').count()) === 0, 'no Check button on a build that cannot update');
await p.screenshot({ path: `${OUT}/about-version.png` });
await back(); // about → root
await p.waitForTimeout(700);
await tap('[aria-label="Close"]');
await p.waitForTimeout(2800); // let the toast go before touching the tab bar

/* ── 7 — the rows really landed ─────────────────────────────────────────────────────────────── */
await tap('[data-testid="tab-week"]');
await p.waitForTimeout(1500);
ok('7a', await waitFor('DB Systems', 4000), 'the imported subject is on the Week timetable');
await p.screenshot({ path: `${OUT}/week-imported.png` });

/* ── honest gaps ────────────────────────────────────────────────────────────────────────────── */
uv('the pre-migration safety copy: needs a real database behind user_version (install an old build, update, check Paths.document/marginalia/backups)');
uv('SQLite importSnapshot atomicity: import the sample on the phone, force-quit, reopen, import the same file again and confirm the counts do not grow');
uv('the share sheet for the newest safety copy');
uv('the tour hand-over card fitting both date blocks without clipping (browser at 360x800 or a dev build)');

const real = errs.filter((e) => !/ExpoModulesCoreJSLogger|Download the React DevTools|shadow|pointerEvents|useNativeDriver|transform-origin/i.test(e));
if (real.length) { console.log('PAGE ERRORS:'); for (const e of real.slice(0, 8)) console.log('   ' + e); }
ok('8', real.length === 0, `${real.length} unexpected page errors`);

await b.close();
console.log(fails.length ? `\nFAILED: ${fails.join(', ')}` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
