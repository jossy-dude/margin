// v0.7.7.5 (SPEC §1 A): Daylight's acceptance shots — the 5 pages, the task sheet, the Add sheet, Settings, GPA,
// Notices and Subjects, light and dark, at 07:00, 12:00, 18:00 and 22:00 (the clock is mocked).
//   node tools/day-shots.mjs <out-dir> [hours=7,12,18,22] [modes=light,dark] [what=pages,sheets]
// Needs the web build: CI=1 npx expo start --web --port 8097 (WEB_PORT to change it).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [out = '/tmp/day', hoursArg = '7,12,18,22', modesArg = 'light,dark', whatArg = 'pages,sheets'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const PAGES = ['Today', 'Week', 'Tasks', 'Grades', 'Stats'];
const b = await chromium.launch();
for (const h of hoursArg.split(',').map(Number)) for (const theme of modesArg.split(',')) {
  const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date(2026, 10, 25, h, 0) });
  await p.goto(`http://localhost:${process.env.WEB_PORT ?? 8097}`, { waitUntil: 'networkidle', timeout: 180000 });
  await p.waitForFunction(() => globalThis.__store?.getState().ready, null, { timeout: 180000 });
  await p.evaluate((theme) => { const s = globalThis.__store; s.set({ settings: { ...s.getState().settings, onboarded: 999, palette: 'daylight', theme, sky: 'live' } }); }, theme);
  const shot = async (name) => { await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${String(h).padStart(2, '0')}-${theme}-${name}.png` }); };
  if (whatArg.includes('pages')) for (const r of PAGES) { await p.evaluate((r) => globalThis.__store.set({ route: r, sheet: null, page: null }), r); await shot(r); }
  if (whatArg.includes('sheets')) {
    await p.evaluate(() => globalThis.__store.set({ route: 'Tasks' }));
    for (const [name, sheet] of [['task', { t: 'task' }], ['add', { t: 'add' }], ['settings', { t: 'settings' }]]) {
      await p.evaluate((sheet) => globalThis.__store.set({ sheet }), sheet); await shot(name);
    }
    for (const [name, page] of [['gpa', { t: 'gpa' }], ['notices', { t: 'notices' }], ['subjects', { t: 'subjects' }]]) {
      await p.evaluate((page) => { const s = globalThis.__store; s.set({ sheet: null }); s.act.openPage?.(page); }, page); await shot(name);
    }
  }
  await ctx.close();
}
await b.close();
console.log(out);
