#!/usr/bin/env node
/**
 * Per-tab tap latency, measured on a real Android device.
 *
 * This exists to settle ONE question that cannot be answered by reading code: **when you tap the
 * To-do tab, is the dominant cost the Yoga rebuild of that page, or the overdraw of the five pages
 * stacked underneath it?**
 *
 * Why it has to be measured rather than reasoned out:
 *   `display:'none'` sets `YogaDisplay.NONE` (ReactAndroid/.../uimanager/LayoutShadowNode.kt), so
 *   hiding a page DROPS its layout. Showing it rebuilds that layout, and `screens/Tasks.tsx` renders
 *   every row via `.map()` with no virtualisation — so the rebuild grows with the task count. But the
 *   alternative (keeping pages laid out and hiding them another way) pays ~20 full-screen fills per
 *   frame instead. Which one is worse depends on hardware. Guessing risks re-introducing a regression
 *   that was already measured and removed once.
 *
 * The decisive experiment is **latency against task count**:
 *   · if tap latency on To-do rises roughly linearly as tasks are added, the REBUILD is the cost and
 *     virtualising the list is the fix;
 *   · if it is flat in task count and roughly equal to a light tab, the rebuild is noise, the trade
 *     is already correct, and nothing should be changed.
 *
 * It deliberately reads `dumpsys gfxinfo <pkg> framestats` rather than wall-clock around the `input
 * tap`: the tap's own IPC and the input pipeline are constant across tabs and cancel out, while the
 * figure that matters — the longest frame the UI thread produced after the press — is exactly what
 * framestats reports (frameCompleted - intendedVsync, per frame).
 *
 * Usage:
 *   node tools/tab-latency.mjs                 # every tab, 10 reps each
 *   node tools/tab-latency.mjs --reps 20       # more samples
 *   node tools/tab-latency.mjs --tabs tasks    # just To-do, alternating against Today
 */
import { execFileSync } from 'node:child_process';

const PKG = 'app.marginalia.planner';
const ALL_TABS = ['today', 'week', 'tasks', 'grades', 'stats'];

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i === -1 ? dflt : argv[i + 1]; };
const REPS = Number(arg('reps', '10'));
const WANTED = (arg('tabs', ALL_TABS.join(',')).split(',').map((s) => s.trim()).filter(Boolean));

const adb = (...a) => execFileSync('adb', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Loud, early, and with the actual remedy — the point of failure is almost always "no phone". */
function requireDevice() {
  const rows = adb('devices').split('\n').slice(1).filter((l) => l.trim() && !/offline|unauthorized/.test(l));
  if (!rows.length) {
    console.error(
      '\n  No Android device attached.\n\n' +
      '  Plug in a phone with USB debugging enabled, accept the prompt on it, then confirm with:\n\n' +
      '      adb devices\n\n' +
      '  A remote cloud device or an emulator will NOT do here: this app is an expo-dev-client build,\n' +
      '  so it cannot run in Expo Go, and there is no Android SDK installed on this machine to build\n' +
      '  and install one from scratch. It needs a phone that already has the dev build on it.\n');
    process.exit(1);
  }
  return rows[0].split(/\s+/)[0];
}

/** A tab's centre point, read from a uiautomator dump rather than guessed from screen geometry.
 *  `Book.tsx` gives every tab `testID={`tab-${name}`}`, which surfaces as a resource-id on Android —
 *  which is why the id, not the bounds, is what this matches on: it survives any nav-bar padding. */
function tabCentre(name) {
  adb('shell', 'uiautomator', 'dump', '/sdcard/win.xml');
  const xml = adb('shell', 'cat', '/sdcard/win.xml');
  const id = `${PKG}:id/tab-${name}`;
  const node = xml.split('<node ').find((chunk) => chunk.includes(`resource-id="${id}"`));
  if (!node) return null;
  const m = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!m) return null;
  const [x1, y1, x2, y2] = m.slice(1).map(Number);
  return [Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2)];
}

/** Every frame's duration in ms since the given reset, from the framestats CSV. */
function frameDurations() {
  let out;
  try { out = adb('shell', 'dumpsys', 'gfxinfo', PKG, 'framestats'); } catch { return []; }
  const rows = out.split('---PROFILEDATA---').pop().split('\n');
  const dur = [];
  for (const line of rows) {
    const c = line.split(',');
    // flags, intendedVsync, ... , frameCompleted is column 13 on every API level that reports it
    if (c.length < 14 || !/^\d+$/.test(c[0])) continue;
    const intended = Number(c[1]), completed = Number(c[13]);
    if (intended > 0 && completed > intended) dur.push(completed - intended);
  }
  return dur;
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN; };

const dev = requireDevice();
console.log(`device: ${dev}   package: ${PKG}   reps: ${REPS}\n`);
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
await sleep(4000);

const points = {};
for (const t of ['today', ...WANTED]) {
  const p = tabCentre(t);
  if (!p) { console.error(`  could not find tab "${t}" in the UI hierarchy — is the app foregrounded on a book page?`); process.exit(1); }
  points[t] = p;
}

const results = {};
for (const tab of WANTED) {
  const worst = [];
  for (let i = 0; i < REPS; i++) {
    // alternate via Today so every measured tap is a genuine cold-to-warm page switch
    adb('shell', 'input', 'tap', ...points.today.map(String));
    await sleep(450);
    adb('shell', 'dumpsys', 'gfxinfo', PKG, 'reset');
    adb('shell', 'input', 'tap', ...points[tab].map(String));
    await sleep(700);
    const d = frameDurations();
    if (d.length) worst.push(Math.max(...d));
    await sleep(150);
  }
  results[tab] = worst;
}

console.log('longest frame after the tap, in ms (the frame the finger waits on)\n');
console.log('  tab      p50     p95     max    n');
for (const [tab, d] of Object.entries(results)) {
  if (!d.length) { console.log(`  ${tab.padEnd(8)}  no frames captured`); continue; }
  console.log(`  ${tab.padEnd(8)} ${String(pct(d, 50)).padStart(5)} ${String(pct(d, 95)).padStart(7)} ${String(Math.max(...d)).padStart(7)} ${String(d.length).padStart(4)}`);
}

const t = results.tasks ?? [];
const light = ['week', 'grades', 'stats'].map((k) => results[k] ?? []).flat();
if (t.length && light.length) {
  const mt = pct(t, 95), ml = pct(light, 95);
  console.log(`\n  To-do p95 ${mt}ms vs light-tab p95 ${ml}ms  →  ratio ${(mt / ml).toFixed(2)}x`);
  console.log(mt / ml > 1.5
    ? '  To-do is disproportionately slow: the rebuild is real and worth fixing.\n  Next step is the task-count sweep — add tasks and re-run to see if it scales linearly.'
    : '  To-do is within noise of a light tab: the rebuild is NOT the bottleneck.\n  The display-flip trade is already correct and should be left alone.');
}
