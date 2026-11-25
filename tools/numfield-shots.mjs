// v0.7.7.1 (SPEC §4): the teacher's count and GPA credit fields in every skin, at 0, 7, 12 and 99.
// node tools/numfield-shots.mjs <out-dir>   (needs the web build: CI=1 npx expo start --web --port 8097)
// Writes one strip per skin: each value's field, cropped with its row, side by side.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? '/tmp/numfield';
mkdirSync(out, { recursive: true });
const SKINS = ['collage', 'refined', 'original', 'plain', 'daylight'];
const VALUES = [0, 7, 12, 99];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await p.goto(`http://localhost:${process.env.WEB_PORT ?? 8097}`, { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForFunction(() => globalThis.__store?.getState().ready, null, { timeout: 180000 });
for (const palette of SKINS) for (const theme of ['light', 'dark']) {
  for (const v of VALUES) {
    await p.evaluate(([palette, theme, v]) => {
      const s = globalThis.__store, st = s.getState(), id = st.courses[0].id;
      s.set({ route: 'Grades', settings: { ...st.settings, onboarded: 999, palette, theme, teacherAbsent: { [id]: v } } });
    }, [palette, theme, v]);
    await p.waitForTimeout(700);
    const f = p.locator('[data-testid^="num-teacher-s-absence-count-for"]').first();
    await f.scrollIntoViewIfNeeded();
    const box = await f.boundingBox();
    if (!box) { console.log('no field', palette, theme, v); continue; }
    await p.screenshot({ path: `${out}/${palette}-${theme}-${v}.png`, clip: { x: 0, y: Math.max(0, box.y - 20), width: 412, height: box.height + 40 } });
  }
}
await b.close();
console.log(out);
