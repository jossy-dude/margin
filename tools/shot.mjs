// Visual harness: node tools/shot.mjs <out-dir> [skin] [mode] [route...]
// Needs the web build running: CI=1 npx expo start --web --port 8097
import { chromium } from 'playwright';
const [out = '/tmp/shots', palette = 'daylight', theme = 'light', ...routes] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 });
await p.goto('http://localhost:8097', { waitUntil: 'networkidle', timeout: 180000 });
await p.waitForFunction(() => globalThis.__store?.getState().ready, null, { timeout: 180000 });
await p.evaluate(([palette, theme]) => { const s = globalThis.__store; s.set({ settings: { ...s.getState().settings, onboarded: 999, palette, theme } }); }, [palette, theme]);
for (const r of routes.length ? routes : ['Today']) {
  await p.evaluate((r) => globalThis.__store.set({ route: r }), r);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/${palette}-${theme}-${r}.png` });
}
await b.close();
