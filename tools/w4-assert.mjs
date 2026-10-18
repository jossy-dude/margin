/* W4 assertions for Today: time truth — the fixed glyph advances of the countdown, the non-today
 * class WINDOW, 12/24-hour everywhere, the day-list ranges, midnight-safe wording, and the two
 * geometric checks the brief names (UX-4 scroll-end clearance, the clock-vs-pill clearance).
 * Also captures the W4 shots.
 *
 *   node tools/w4-assert.mjs [--url http://localhost:8098] [--out .shots/w4]
 *
 * Three contexts, because the interesting states sit hours apart. A `Date` shim shifts only what
 * the app READS as "now" (Date.now, new Date()); timers still run at real speed, so the live card
 * still ticks at its own 1 Hz and the countdown's width can be watched across real digit changes.
 *   A — Mon 19 Oct 2026 08:55 (mid first class): live deck ticking `min left`, day-list ranges,
 *       header `until 09:20`, clock-vs-pill geometry.
 *   B — same shift, then Tue picked in the strip: deck prints the class window and `first bell`;
 *       the header stays about now. The 12-hour toggle is flipped and checked on Today AND Week,
 *       the day-list/name geometry, the Week due/FAB and axis reads, the task-sheet picker's own
 *       chips and steppers, the Settings hints (the root row AND the Hours page behind it — the
 *       row that prints quietFrom/quietTo lives one level down) and the Stats sentence, then
 *       flipped back and the strip's most-loaded day picked for the widest header state
 *       (`First class` + `Period 1 of N` + the room tag — the subtitle that used to clip).
 *   C — real time (a Saturday in the demo set): a day with nothing on — the clock stands alone, the
 *       day section is empty, and there are no countdown cells. (The deck's own `rest` word needs a
 *       day whose every class is cancelled; that path is pinned in card.test.ts.)
 *
 * Assertions print their numbers; exit code is non-zero if any hard assertion fails. Info-only
 * lines (clock∩card overlap, at-rest UX-4 numbers) print for the vision round to adjudicate.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i === -1 ? d : argv[i + 1]; };
const URL_ = arg('url', 'http://localhost:8098');
const OUT = arg('out', '.shots/w4');
const W = 412, H = 915;
mkdirSync(OUT, { recursive: true });

const fails = [];
const ok = (n, pass, detail) => { console.log(`[${n}] ${pass ? 'PASS' : 'FAIL'} — ${detail}`); if (!pass) fails.push(n); };
const info = (s) => console.log(`     · ${s}`);

const b = await chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
/** Mon 19 Oct 2026 08:55 in the machine's own zone — the demo timetable is local-time based. The shim
 *  is applied IN-PAGE and pinned at init, so the app reads this exact wall time at load no matter how
 *  long Metro took to compile. */
const TARGET_A = new Date(2026, 9, 19, 8, 55, 0, 0).getTime();

async function open(target = 0) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  if (target) await ctx.addInitScript((t) => {
    const R = Date, ms = t - R.now();
    window.Date = class extends R {
      constructor(...a) { if (a.length === 0) super(R.now() + ms); else super(...a); }
      static now() { return R.now() + ms; }
    };
  }, target);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await p.goto(URL_, { waitUntil: 'networkidle', timeout: 240000 });
  await p.waitForTimeout(5000);
  return { ctx, p, errs };
}

/* React Native Web answers Pressability on POINTERDOWN — every tap goes through mouse.down/up, never
   `click()`. Same rules as tools/cap-baseline.mjs: the Book keeps every screen mounted, hidden screens
   have no real box, and controls can sit below the fold — pick the first match with a box, prefer one
   already in the viewport, scroll it in, never click into the void. */
const tap = async (p, sel) => {
  const loc = p.locator(sel);
  await loc.first().waitFor({ state: 'attached', timeout: 8000 }).catch(() => {});
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

/* Leaf text nodes that have a real box on the shipped screen (hidden Book pages sit at negative x —
   `right > 0 && left < innerWidth` is what tells the live page from its neighbours). */
const LEAFS = `(() => {
  const out = [];
  for (const el of document.querySelectorAll('div,span')) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim();
    if (!t) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    out.push({ t, x: r.x, y: r.y, right: r.right, bottom: r.bottom, fs: parseFloat(getComputedStyle(el).fontSize) });
  }
  return out;
})()`;
const leafs = (p) => p.evaluate(LEAFS);

const RANGE24 = /^\d{1,2}:\d{2}–\d{1,2}:\d{2}$/;
const RANGE12 = /^\d{1,2}:\d{2} (AM|PM)–\d{1,2}:\d{2} (AM|PM)$/;
const TWO24 = new RegExp(', \\d{1,2}:\\d{2} to \\d{1,2}:\\d{2}, ');
const TWO12 = new RegExp(', \\d{1,2}:\\d{2} (AM|PM) to \\d{1,2}:\\d{2} (AM|PM), ');

const attendanceRows = (p) => p.evaluate(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('[aria-label]')) {
    const a = el.getAttribute('aria-label') || '';
    if (!a.includes('Opens attendance')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    out.push(a);
  }
  return out;
})()`);

const stripCells = (p) => p.evaluate(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('[aria-label]')) {
    const a = el.getAttribute('aria-label') || '';
    if (!/^\\w{3} \\d{1,2}, \\d+ classes(, today)?$/.test(a)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    out.push(a);
  }
  return out;
})()`);

/* ---- the countdown cells: one Txt per glyph, 26 px per digit and 15 per colon ------------------- */
const CELLS = `(() => {
  const cs = [];
  for (const el of document.querySelectorAll('div,span')) {
    if (el.children.length) continue;
    const t = el.textContent || '';
    if (t.length !== 1 || !/^[\\d:]$/.test(t)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.right <= 0 || r.left >= innerWidth) continue;
    const w = Math.round(r.width * 100) / 100;
    if (Math.abs(w - 26) > 0.5 && Math.abs(w - 15) > 0.5) continue;
    cs.push({ t, w, x: r.x, right: r.right, y: r.y });
  }
  cs.sort((a, b) => a.x - b.x || a.y - b.y);
  return cs;
})()`;
const pickRun = (cs) => {
  if (!cs.length) return null;
  const runs = [];
  let run = [cs[0]];
  for (let i = 1; i < cs.length; i++) {
    const prev = run[run.length - 1], c = cs[i];
    if (Math.abs(c.y - prev.y) <= 2 && c.x - prev.right < 4 && c.x >= prev.x) run.push(c);
    else { runs.push(run); run = [c]; }
  }
  runs.push(run);
  const good = runs.filter((r) => r.length >= 4 && r.some((c) => c.t === ':') && r.some((c) => c.t !== ':'))
    .sort((a, b) => b.length - a.length);
  if (!good.length) return null;
  const r = good[0];
  return { cells: r, key: r.map((c) => c.t).join(''), widths: r.map((c) => c.w), total: Math.round((r[r.length - 1].right - r[0].x) * 100) / 100 };
};

/* The switch element as the browser actually renders it. This RNW build does not put the checked
   state on `role="switch"` (no aria-checked — same for every switch in the app), so what this
   prints is recorded beside the toggle's real evidence: the strings it flips. */
const toggleInfo = (p) => p.evaluate(`(() => {
  for (const e of document.querySelectorAll('[data-testid="24-hour-clock"]')) {
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.right > 0 && r.left < innerWidth) return { w: Math.round(r.width), h: Math.round(r.height), role: e.getAttribute('role'), checked: e.getAttribute('aria-checked') };
  }
  return null;
})()`);

/* ════ A — live Monday, mid-class ════════════════════════════════════════════════════════════════ */
console.log('\n=== A — Mon 19 Oct 2026 08:55, in class ===');
{
  const { ctx, p, errs } = await open(TARGET_A);
  console.log('skip onboarding ->', await tap(p, 'text=Skip'));
  await p.waitForTimeout(2600);

  // 1 — day-list ranges: one per class, and every row's spoken label is `H:MM to H:MM`
  const rows = await attendanceRows(p);
  ok(1, rows.length >= 3 && rows.every((a) => TWO24.test(a)),
    `${rows.length} day rows, every label matches ", HH:MM to HH:MM, ", e.g. "${rows[0] ?? '—'}"`);

  // 2 — header: live line `until 09:20`, one time token
  const lf = await leafs(p);
  const until = lf.filter((e) => /^until \d{1,2}:\d{2}$/.test(e.t)).map((e) => e.t);
  const inClass = lf.some((e) => e.t === 'In class');
  ok(2, inClass && until.length === 1 && (until[0].match(/\d{1,2}:\d{2}/g) || []).length === 1,
    `word "In class"=${inClass}, line "${until[0] ?? '—'}" (time tokens: ${(until[0]?.match(/\d{1,2}:\d{2}/g) || []).length})`);

  // 3 — countdown cells: fixed advances, identical row width across a real 1 Hz digit change
  const run1 = pickRun(await p.evaluate(CELLS));
  let run2 = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 3200 && !run2) {
    await p.waitForTimeout(200);
    const rn = pickRun(await p.evaluate(CELLS));
    if (rn && (!run1 || rn.key !== run1.key)) run2 = rn;
  }
  if (!run1) ok(3, false, 'no ticking countdown found at Mon 08:55 — expected the live card digits');
  else if (!run2) ok(3, false, `countdown "${run1.key}" did not change in 3.2 s — is 1 Hz ticking off?`);
  else {
    const sameLen = run1.cells.length === run2.cells.length;
    const sameW = sameLen && run1.widths.every((w, i) => Math.abs(w - run2.widths[i]) <= 0.5);
    const digich = run1.cells.every((c) => (c.t === ':' ? Math.abs(c.w - 15) <= 0.5 : Math.abs(c.w - 26) <= 0.5));
    ok(3, sameLen && sameW && digich && Math.abs(run1.total - run2.total) <= 0.5,
      `"${run1.key}" → "${run2.key}"; widths ${run1.widths.join('/')} → ${run2.widths.join('/')}; row width ${run1.total} → ${run2.total} px`);
  }

  // 6 — the taped-corner clearance: the state pill must start clear of the clock face
  const geo = await p.evaluate(`(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < innerWidth && r.top < innerHeight && r.bottom > 0; };
    const clk = [...document.querySelectorAll('[data-testid="clock-face"]')].filter(vis)[0];
    if (!clk) return null;
    const c = clk.getBoundingClientRect();
    let pillEl = null;
    for (const el of document.querySelectorAll('div,span')) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (t !== 'Now' && t !== 'Next up' && t !== 'First class' && t !== 'Rest day') continue;
      if (!vis(el)) continue;
      pillEl = el; break;
    }
    let sl = null;
    for (let n2 = pillEl; n2; n2 = n2.parentElement) { const r = n2.getBoundingClientRect(); if (r.width >= 340) { sl = r; break; } }
    const p0 = pillEl ? pillEl.getBoundingClientRect() : null;
    return {
      clock: { l: c.left, r: c.right, t: c.top, b: c.bottom },
      pill: p0 ? { l: p0.left, r: p0.right, t: p0.top, b: p0.bottom } : null,
      slab: sl ? { l: sl.left, r: sl.right, t: sl.top, b: sl.bottom } : null,
    };
  })()`);
  if (!geo?.clock) ok(6, false, 'clock-face not found');
  else {
    const o = (a, b2) => (a && b2) ? Math.max(0, Math.min(a.r, b2.r) - Math.max(a.l, b2.l)) * Math.max(0, Math.min(a.b, b2.b) - Math.max(a.t, b2.t)) : 0;
    if (!geo.pill) ok(6, false, 'state pill word (Now/Next up/First class) not found');
    else {
      const hx = Math.min(geo.clock.r, geo.pill.r) - Math.max(geo.clock.l, geo.pill.l);
      const vy = Math.min(geo.clock.b, geo.pill.b) - Math.max(geo.clock.t, geo.pill.t);
      ok(6, hx <= 0 || vy <= 0, `clock [${geo.clock.l.toFixed(0)}..${geo.clock.r.toFixed(0)}]×[${geo.clock.t.toFixed(0)}..${geo.clock.b.toFixed(0)}] vs pill [${geo.pill.l.toFixed(0)}..${geo.pill.r.toFixed(0)}]×[${geo.pill.t.toFixed(0)}..${geo.pill.b.toFixed(0)}] — overlap x=${hx.toFixed(1)} y=${vy.toFixed(1)}`);
      if (geo.slab) info(`clock∩card slab: ${o(geo.clock, geo.slab) > 0 ? o(geo.clock, geo.slab).toFixed(0) + ' px² (taped-corner gesture — vision round adjudicates)' : '0 px²'}`);
    }
  }

  await p.screenshot({ path: `${OUT}/today-live.png` });
  const listRow = p.locator('[aria-label*="Opens attendance"]').first();
  await listRow.scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/day-list.png` });
  console.log('A console errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'NONE');
  await ctx.close();
}

/* ════ B — pick tomorrow (Tue) + the 12/24-hour roundtrip ════════════════════════════════════════ */
console.log('\n=== B — same shift, Tue picked in the strip, 12h roundtrip ===');
{
  const { ctx, p, errs } = await open(TARGET_A);
  console.log('skip onboarding ->', await tap(p, 'text=Skip'));
  await p.waitForTimeout(2600);

  const cells = await stripCells(p);
  const pick = cells.find((a) => /, [1-9]\d* classes$/.test(a) && !a.includes(', today'));
  console.log('strip cells:', cells.join(' | '));
  ok('B0', !!pick && (await tap(p, `[aria-label="${pick}"]`)), `picked "${pick ?? '—'}"`);
  await p.waitForTimeout(1200);

  // 4 — the deck prints the picked day's WINDOW, and it fits the card
  const lf = await leafs(p);
  const win = lf.filter((e) => e.fs >= 28 && e.fs <= 32 && RANGE24.test(e.t)).map((e) => e.t);
  const word = lf.some((e) => e.t === 'First class'), unit = lf.some((e) => e.t === 'first bell');
  const fit = await p.evaluate(`(() => {
    let el = null;
    for (const e of document.querySelectorAll('div,span')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      if (!/^\\d{1,2}:\\d{2}–\\d{1,2}:\\d{2}$/.test(t)) continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && parseFloat(getComputedStyle(e).fontSize) >= 28) { el = e; break; }
    }
    if (!el) return null;
    const tr = el.getBoundingClientRect();
    let slab = el.parentElement;
    while (slab && slab.getBoundingClientRect().width < 340) slab = slab.parentElement;
    if (!slab) return null;
    const sr = slab.getBoundingClientRect();
    return { tw: tr.width, tleft: tr.left, tright: tr.right, sleft: sr.left, sright: sr.right, sw: sr.width };
  })()`);
  ok(4, win.length === 1 && word && unit && fit && fit.sw >= 340 && fit.tright <= fit.sright - 8,
    `window "${win[0] ?? '—'}" (fs 30), "${word ? 'First class' : '—'}" + "${unit ? 'first bell' : '—'}"; text ${fit ? fit.tw.toFixed(1) : '?'}px inside slab ${fit ? fit.sw.toFixed(1) : '?'}px (left Δ ${fit ? (fit.tleft - fit.sleft).toFixed(1) : '?'}, right Δ ${fit ? (fit.sright - fit.tright).toFixed(1) : '?'})`);

  // the header stays about now while the deck shows the pick
  const until = lf.filter((e) => /^until \d{1,2}:\d{2}$/.test(e.t)).map((e) => e.t);
  ok('B1', until.length === 1, `header still about now: "${until[0] ?? '—'}" next to the picked day's window`);

  // day list follows the pick
  const rows = await attendanceRows(p);
  ok('B2', rows.length === 3 && TWO24.test(rows[0] ?? '') && /09:00 to 09:50/.test(rows[0] ?? ''),
    `${rows.length} Tuesday rows, first "${rows[0] ?? '—'}"`);

  await p.screenshot({ path: `${OUT}/today-tomorrow-window.png` });

  // 5 — UX-4: at scroll end the last content must clear the tab bar
  const ux4 = (doScroll) => p.evaluate((scroll) => {
    const sc = [...document.querySelectorAll('div')].filter((e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && r.width > 300 && r.height > 300 && e.scrollHeight > e.clientHeight + 60 && r.right > 0 && r.left < innerWidth; })[0];
    if (!sc) return null;
    const barTop = Math.min(...[...document.querySelectorAll('[data-testid^="tab-"]')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.bottom > 0).map((r) => r.top));
    if (scroll) sc.scrollTop = sc.scrollHeight;
    let m = null;
    for (const el of sc.querySelectorAll('div,span')) {
      if (el.children.length) continue;
      if (!(el.textContent || '').trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (m === null || r.bottom > m) m = r.bottom;
    }
    return { barTop, bottom: m, scrollTop: sc.scrollTop, scrollH: sc.scrollHeight, clientH: sc.clientHeight };
  }, doScroll);
  const rest = await ux4(false);
  await p.waitForTimeout(300);
  const end = await ux4(true);
  await p.waitForTimeout(400);
  if (!end || !rest) ok(5, false, 'Today scroller / tab bar not found');
  else ok(5, end.barTop - end.bottom >= 0,
    `at rest: last content bottom ${rest.bottom.toFixed(1)} vs bar top ${rest.barTop.toFixed(1)} (Δ ${(rest.barTop - rest.bottom).toFixed(1)}) — at scroll end: ${end.bottom.toFixed(1)} vs ${end.barTop.toFixed(1)} (Δ ${(end.barTop - end.bottom).toFixed(1)}, scrolled ${end.scrollTop.toFixed(0)}/${(end.scrollH - end.clientH).toFixed(0)})`);
  await p.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].filter((e) => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return (s.overflowY === 'auto' || s.overflowY === 'scroll') && r.width > 300 && r.height > 300 && e.scrollHeight > e.clientHeight + 60 && r.right > 0 && r.left < innerWidth; })[0];
    if (sc) sc.scrollTop = 0;
  });
  await p.waitForTimeout(400);

  /* Geometry of the measured surfaces: the
     12-hour strings widen the day list's time column (the name must not pay for it — `Computer
     Program…`), the card's `Period 1 of 4` subtitle clipped although 39 px of slack sat unused, the
     Week due times ended under the FAB's band (x 332–394, y 763–825 at 412×915), and the hour axis
     kept bare 8–16 under a 12-hour clock. */
  const GEOM = `(() => {
    const fab = document.querySelector('[data-testid="fab-add"]');
    const f = fab ? fab.getBoundingClientRect() : null;
    const txts = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim());
    const st = (el) => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim(), x: Math.round(r.x), r: Math.round(r.right), y: Math.round(r.y), b: Math.round(r.bottom), clipped: el.scrollWidth - el.clientWidth > 1 }; };
    const due = txts.filter((e) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d{1,2}:\\d{2}( (AM|PM))?$/.test(e.textContent.trim())).map((e) => { const o = st(e); o.hitsFab = !!f && o.x < f.right && o.r > f.x && o.y < f.bottom && o.b > f.y; return o; });
    const axis = txts.filter((e) => { const fs = parseFloat(getComputedStyle(e).fontSize), r = e.getBoundingClientRect(); return fs < 13 && r.x < 50 && /^\\d{1,2}[ap]?$/.test(e.textContent.trim()); }).map(st);
    return { due, axis };
  })()`;

  /** Strip every written `4:25 PM`-shaped token; anything left in `HH:MM` shape is a raw 24-hour
      time that ignored the setting (`10:00 PM` must not read as bare, `16:25` must). */
  const bareTime = (t) => /\d{1,2}:\d{2}/.test((t || '').replace(/\d{1,2}:\d{2}\s?(AM|PM)/g, ''));

  // 7f — Week under the 24-hour clock: baseline for the due/FAB and axis checks below
  await tap(p, '[data-testid="tab-week"]');
  await p.waitForTimeout(1600);
  const wk24 = await p.evaluate(GEOM);
  ok('7f', (wk24.due.length === 0 || wk24.due.every((d) => !d.hitsFab)) && wk24.axis.length >= 5 && wk24.axis.every((a) => /^\d{1,2}$/.test(a.t)),
    `24h: ${wk24.due.length} due rows, ${wk24.due.filter((d) => d.hitsFab).length} under the FAB; axis ${wk24.axis.map((a) => a.t).join(' ')}`);
  await tap(p, '[data-testid="tab-today"]');
  await p.waitForTimeout(900);

  // 7 — 12-hour toggle: flip it, check Today + Week, flip it back
  await tap(p, '[data-testid="open-settings"]');
  await p.waitForTimeout(1400);
  const navOk = await tap(p, '[aria-label^="Look & feel"]');
  await p.waitForTimeout(1000);
  info(`toggle DOM before the flip: ${JSON.stringify(await toggleInfo(p))}`);
  const flip = await tap(p, '[data-testid="24-hour-clock"]');
  await p.waitForTimeout(600);
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(1400);
  const lf12 = await leafs(p);
  const win12 = lf12.filter((e) => e.fs >= 28 && e.fs <= 32 && RANGE12.test(e.t)).map((e) => e.t);
  const until12 = lf12.filter((e) => /^until \d{1,2}:\d{2} (AM|PM)$/.test(e.t)).map((e) => e.t);
  const rows12 = await attendanceRows(p);
  const rows12ok = rows12.length >= 3 && rows12.every((a) => TWO12.test(a));
  ok(7, navOk && flip && win12.length === 1 && until12.length === 1 && rows12ok,
    `nav=${navOk} flip=${flip}; window "${win12[0] ?? '—'}", header "${until12[0] ?? '—'}", ${rows12.length} rows 12h (e.g. "${rows12[0] ?? '—'}")`);
  await p.screenshot({ path: `${OUT}/12h-today.png` });

  // 7d — the 12-hour day list must not pay for its wider strings with the course name, and the card
  // header must use the slack before the room badge instead of clipping `Period 1 of 4`.
  const fit12 = await p.evaluate(`(() => {
    const txts = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim());
    const st = (el) => { const r = el.getBoundingClientRect(); return { t: el.textContent.trim().slice(0, 40), fs: parseFloat(getComputedStyle(el).fontSize), clipped: el.scrollWidth - el.clientWidth > 1 }; };
    const names = [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label') || '')
      .filter((a) => / to \\d{1,2}:\\d{2}/.test(a) && /Opens attendance/.test(a))
      .map((a) => a.split(',')[0]);
    const nameEls = txts.filter((e) => names.includes(e.textContent.trim()) && Math.abs(parseFloat(getComputedStyle(e).fontSize) - 22) < 0.6).map(st);
    const rangeEls = txts.filter((e) => { const fs = parseFloat(getComputedStyle(e).fontSize); return fs >= 13 && fs <= 17 && /^\\d{1,2}:\\d{2} (AM|PM)–\\d{1,2}:\\d{2} (AM|PM)$/.test(e.textContent.trim()); }).map(st);
    const posEl = txts.filter((e) => /^Period \\d+ of \\d+$/.test(e.textContent.trim())).map(st)[0] ?? null;
    return { names: nameEls, ranges: rangeEls, pos: posEl };
  })()`);
  ok('7d', fit12.names.length >= 2 && fit12.names.every((n) => !n.clipped) && fit12.ranges.length >= 2 && fit12.ranges.every((r) => !r.clipped) && !!fit12.pos && !fit12.pos.clipped,
    `${fit12.names.length} names unclipped (e.g. "${fit12.names[0]?.t ?? '—'}"), ${fit12.ranges.length} ranges (e.g. "${fit12.ranges[0]?.t ?? '—'}", fs ${fit12.ranges[0]?.fs ?? '?'}), position "${fit12.pos?.t ?? '—'}"${fit12.pos?.clipped ? ' CLIPPED' : ' unclipped'}`);

  // the same strings on one more screen: Week
  await tap(p, '[data-testid="tab-week"]');
  await p.waitForTimeout(1600);
  const wk = await p.evaluate(`(() => {
    const out = [];
    for (const el of document.querySelectorAll('[aria-label]')) {
      const a = el.getAttribute('aria-label') || '';
      if (!/\\d{1,2}:\\d{2} (AM|PM) to \\d{1,2}:\\d{2} (AM|PM)/.test(a)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= 0 || r.left >= innerWidth) continue;
      out.push(a);
    }
    return out;
  })()`);
  ok('7b', wk.length >= 1, `Week shows 12-hour ranges too: ${wk.length} labels, e.g. "${wk[0] ?? '—'}"`);
  const wk12 = await p.evaluate(GEOM);
  ok('7e', (wk12.due.length === 0 || wk12.due.every((d) => !d.hitsFab)) && wk12.axis.length >= 5 && wk12.axis.every((a) => /^\d{1,2}[ap]$/.test(a.t) && !a.clipped),
    `12h: ${wk12.due.length} due rows, ${wk12.due.filter((d) => d.hitsFab).length} under the FAB; axis ${wk12.axis.map((a) => a.t).join(' ')}`);
  await p.screenshot({ path: `${OUT}/12h-week.png` });

  // 7g — the task sheet's own time controls must obey the clock: preset chips format their times,
  // the hour stepper reads 1–12, and the AM/PM pair shows BOTH halves (a lone flipping chip read as
  // a label, not a control — the vision round failed it; the user-tester round found `Today · 4:25 PM`
  // sitting above steppers reading `16 : 25` and chips still on `21:00`).
  await tap(p, '[data-testid="tab-today"]');
  await p.waitForTimeout(900);
  await tap(p, '[data-testid="fab-add"]');
  await p.waitForTimeout(1200);
  if (!(await tap(p, '[data-testid="add-assignment"]'))) await tap(p, 'text=Assignment');
  await p.waitForTimeout(1400);
  await tap(p, 'text=In 1 h');
  await p.waitForTimeout(500);
  if (!(await tap(p, '[data-testid="pick"]'))) await tap(p, 'text=Pick…');
  await p.waitForTimeout(900);
  const pk = await p.evaluate(`(() => {
    const txts = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim());
    const all = txts.map((e) => e.textContent.trim());
    let hour = null, min = null;
    const i = txts.findIndex((e) => e.textContent.trim() === ':' && parseFloat(getComputedStyle(e).fontSize) > 24);
    for (let j = i - 1; j >= 0 && hour === null; j--) if (/^\\d{1,2}$/.test(txts[j].textContent.trim())) hour = txts[j].textContent.trim();
    for (let j = i + 1; j < txts.length && min === null; j++) if (/^\\d{1,2}$/.test(txts[j].textContent.trim())) min = txts[j].textContent.trim();
    return { chips: all.filter((t) => /^(Tonight|Tomorrow|Friday|Next Mon) /.test(t)), mer: all.filter((t) => /^(AM|PM)$/.test(t)).length, hour, min };
  })()`);
  ok('7g', pk.chips.length >= 4 && pk.chips.every((t) => / (AM|PM)$/.test(t)) && pk.mer === 2 && /^(?:[1-9]|1[0-2])$/.test(pk.hour ?? '') && /^\d{2}$/.test(pk.min ?? ''),
    `chips: ${pk.chips.join(' / ') || '—'}; AM/PM chips ${pk.mer}; stepper reads ${pk.hour ?? '—'}:${pk.min ?? '—'}`);
  await p.screenshot({ path: `${OUT}/12h-picker.png` });
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(700);
  if (await p.locator('text=Discard').count()) { await tap(p, 'text=Discard'); await p.waitForTimeout(800); }

  // 7h — the Settings hints must speak the same clock (the user-tester found `quiet 22:00–07:00`
  // while the rest of the app was in 12-hour mode). The root `Reminders` row carries one hint; the
  // `Hours & quiet time` row — the one printing quietFrom/quietTo/activeFrom — sits one level down,
  // behind that row, so the check walks in.
  await tap(p, '[data-testid="open-settings"]');
  await p.waitForTimeout(1400);
  const sh = await p.evaluate(`(() => {
    const all = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => e.textContent.trim());
    return { rem: all.find((t) => /min before class/.test(t)) ?? null };
  })()`);
  await tap(p, '[aria-label^="Reminders."]');
  await p.waitForTimeout(1100);
  const sh2 = await p.evaluate(`(() => {
    const all = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim()).map((e) => e.textContent.trim());
    return { hours: all.find((t) => /weekends/.test(t)) ?? null };
  })()`);
  ok('7h', !!sh.rem && /(AM|PM)/.test(sh.rem) && !bareTime(sh.rem) && !!sh2.hours && /(AM|PM)/.test(sh2.hours) && !bareTime(sh2.hours),
    `Reminders hint "${sh.rem ?? '—'}"; Hours hint "${sh2.hours ?? '—'}"`);
  await p.screenshot({ path: `${OUT}/12h-settings.png` });
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(1000);

  // 7i — the Stats sentence must match the clock too (`Focus peaks around 2:00 PM`, never `14:00`).
  await tap(p, '[data-testid="tab-stats"]');
  await p.waitForTimeout(1200);
  const st = await p.evaluate(`(() => {
    const all = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length).map((e) => e.textContent.trim());
    return all.find((t) => /^(Focus peaks around|Most tasks are finished around)/.test(t)) ?? null;
  })()`);
  ok('7i', !!st && /(AM|PM)/.test(st) && !bareTime(st), `Stats sentence: "${st ?? '—'}"`);
  await p.screenshot({ path: `${OUT}/12h-stats.png` });

  // flip back to 24-hour
  await tap(p, '[data-testid="tab-today"]');
  await p.waitForTimeout(900);
  await tap(p, '[data-testid="open-settings"]');
  await p.waitForTimeout(1400);
  await tap(p, '[aria-label^="Look & feel"]');
  await p.waitForTimeout(1000);
  const unflip = await tap(p, '[data-testid="24-hour-clock"]');
  await p.waitForTimeout(600);
  await tap(p, '[data-testid="sheet-close"]');
  await p.waitForTimeout(1400);
  const lfBack = await leafs(p);
  const winBack = lfBack.filter((e) => e.fs >= 28 && e.fs <= 32 && RANGE24.test(e.t)).map((e) => e.t);
  ok('7c', unflip && winBack.length === 1, `unflip=${unflip}; window back to "${winBack[0] ?? '—'}"`);

  // 7j — the deck header's WIDEST state: `First class` + the longest `Period 1 of N` + the room tag.
  // That subtitle is the string the vision round caught clipping (`Period 1 o…`), and the Tue pick
  // above prints the shorter `Period 1 of 3` — so pick the strip's most-loaded day and measure the
  // real widest one.
  const cellsB = await stripCells(p);
  const most = cellsB.filter((a) => !a.includes(', today'))
    .map((a) => ({ a, n: parseInt((a.match(/, (\d+) classes$/) || [])[1] ?? '0', 10) }))
    .sort((x, y) => y.n - x.n)[0];
  const pickWide = most && (await tap(p, `[aria-label="${most.a}"]`));
  await p.waitForTimeout(1600);
  const wide = await p.evaluate(`(() => {
    const txts = [...document.querySelectorAll('div,span')].filter((e) => !e.children.length && e.textContent.trim());
    const el = txts.find((e) => /^Period \\d+ of \\d+$/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0);
    return {
      pos: el ? { t: el.textContent.trim(), w: +el.getBoundingClientRect().width.toFixed(1), sw: el.scrollWidth, fs: parseFloat(getComputedStyle(el).fontSize), clipped: el.scrollWidth - el.clientWidth > 1 } : null,
      word: txts.some((e) => e.textContent.trim() === 'First class'),
    };
  })()`);
  ok('7j', !!most && pickWide && wide.word && !!wide.pos && !wide.pos.clipped && wide.pos.t === `Period 1 of ${most.n}`,
    `picked "${most?.a ?? '—'}": "${wide.pos?.t ?? '—'}" at fs ${wide.pos?.fs ?? '?'} needs ${wide.pos?.sw ?? '?'}px, box ${wide.pos?.w ?? '?'}px${wide.pos?.clipped ? ' CLIPPED' : ''}; pill "First class"=${wide.word}`);
  await p.screenshot({ path: `${OUT}/24h-header-widest.png` });

  console.log('B console errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'NONE');
  await ctx.close();
}

/* ════ C — a day with nothing on, at the real date ═══════════════════════════════════════════════ */
console.log('\n=== C — no-classes day (real time) ===');
{
  const { ctx, p, errs } = await open(0);
  console.log('skip onboarding ->', await tap(p, 'text=Skip'));
  await p.waitForTimeout(2600);
  const lf = await leafs(p);
  const has = (t) => lf.some((e) => e.t === t);
  const run = pickRun(await p.evaluate(CELLS));
  ok(8, has('No classes today') && has('No classes. Add one from the + button.') && !run,
    `clock stands alone: "No classes today"=${has('No classes today')}, empty day section=${has('No classes. Add one from the + button.')}, glyph cells=${run ? run.key : 'none'}`);
  const today = (await stripCells(p)).find((a) => a.includes(', today'));
  info(`today's strip cell: "${today ?? '—'}"`);
  await p.screenshot({ path: `${OUT}/today-no-classes.png` });
  console.log('C console errors:', errs.length ? errs.slice(0, 3).join(' | ') : 'NONE');
  await ctx.close();
}

await b.close();
console.log(`\nW4 ASSERT: ${fails.length ? `FAIL (${fails.join(', ')})` : 'ALL PASS'}`);
process.exit(fails.length ? 1 : 0);
