/* The clock's contact sheet: the one face on every look's paper and deck, light and dark, at masthead size
 * (115) and enlarged, at a few times of day.
 *   node tools/clock-sheet.mjs [--out .shots/clock/sheet.png]
 * Frames only: nothing here asserts. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { transform } from 'sucrase';

const argv = process.argv.slice(2), out = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : '.shots/clock/sheet.png';
mkdirSync(dirname(out), { recursive: true });
const load = async (rel) => { const js = transform(readFileSync(rel, 'utf8'), { transforms: ['typescript'] }).code.replace(/from '\.\.\/domain\/types';/, ''); const f = join(dirname(out), '.' + rel.replace(/\W/g, '_') + '.mjs'); writeFileSync(f, js); return import(join(process.cwd(), f)); };
const { compositeSvg, dialPal } = await load('src/ui/clock/faces.ts');
const { palettes, PENS } = await load('src/tokens/theme.ts');

const times = [{ h: 10, m: 9, s: 36 }, { h: 3, m: 42, s: 8 }, { h: 12, m: 0, s: 0 }];
const cell = (name, c, dark, pen) => {
  const pal = dialPal({ ...c, acc: pen ?? c.acc }, dark);
  const small = times.map((t) => `<div style="width:115px;height:115px">${compositeSvg(pal, t, 115)}</div>`).join('');
  return `<div style="background:${c.paper};padding:18px;display:flex;gap:18px;align-items:center">
    <div style="width:300px;height:300px">${compositeSvg(pal, times[0], 300)}</div>
    <div style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:10px">${small}</div>
    <div style="background:${c.deck};height:70px;border-radius:10px;margin-top:-40px;position:relative;z-index:-0"></div>
    <div style="font:12px sans-serif;color:${c.mut}">${name}</div></div></div>`;
};
const rows = [];
for (const [n, p] of Object.entries(palettes)) for (const th of ['light', 'dark']) rows.push(cell(`${n} · ${th}`, p[th], th === 'dark', n === 'collage' || n === 'plain' ? PENS.denim[th] : undefined));
rows.push(cell('plain · light · red pen', palettes.plain.light, false, PENS.red.light));
const b = await chromium.launch({ args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 760, height: 340 * rows.length }, deviceScaleFactor: 2 });
await p.setContent(`<body style="margin:0">${rows.join('')}</body>`);
await p.waitForTimeout(400);
await p.screenshot({ path: out, fullPage: true });
console.log('wrote', out);
await b.close();
