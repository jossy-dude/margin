import { mkdirSync, writeFileSync } from 'node:fs';
import { palettes } from '../tokens/theme';
import { INSTRUMENTS } from '../ui/instruments/catalogue';
import { twoInks } from '../ui/instruments/ink';
import { svgDoc } from '../ui/instruments/svg';
import type { Inks } from '../ui/instruments/ink';
import { type Ctx, type Shape } from '../ui/instruments/types';

/** The offline visual harness for the instruments. This writes files; the assertion is only that the
 *  drawing is well formed. Whether it LOOKS like a sieve is decided by rendering these to PNG and
 *  reading the PNG — see the report for the paths. */

const M50 = 50 * 60_000;
const ctx = (p: number, w: number): Ctx => ({ p, w, total: M50, left: p * M50, late: p > 0 && p <= 0.1 });

const inksFor = (pal: 'refined' | 'original', mode: 'light' | 'dark') => {
  const c = palettes[pal][mode];
  return twoInks(c.slabInk, c.slab, c.acc, c.warn);
};

const WIDTHS = [200, 280, 351, 480, 700];
const PS = [1, 0.75, 0.5, 0.25, 0];

const bay = (shapes: Shape[], p: number, w: number, inks: ReturnType<typeof twoInks>, dark: boolean) => {
  const bg = dark ? palettes.refined.dark.slab : palettes.refined.light.slab;
  return `<div class="bay" style="background:${bg};width:${w}px"><div class="art">${svgDoc(shapes, { w, inks, p })}</div></div>`;
};

const esc = (s: string) => s.replace(/&/g, '&amp;');

describe('instruments — offline visual dump', () => {
  it('writes every instrument at every width and every end of the range', () => {
    mkdirSync('/tmp/instruments', { recursive: true });
    const dark = inksFor('refined', 'dark'), light = inksFor('refined', 'light');
    for (const it of INSTRUMENTS) {
      for (const w of WIDTHS) {
        for (const p of PS) {
          const s = svgDoc(it.build(ctx(p, w)), { w, inks: dark, p });
          expect(s).not.toContain('NaN');
          writeFileSync(`/tmp/instruments/${it.id}-${w}-${String(p).replace('.', '_')}.svg`, s);
          const l = svgDoc(it.build(ctx(p, w)), { w, inks: light, p });
          writeFileSync(`/tmp/instruments/light-${it.id}-${w}-${String(p).replace('.', '_')}.svg`, l);
        }
      }
    }
    expect(INSTRUMENTS.length).toBe(22);
  });

  it('writes the contact sheets to look at, at TRUE width so nothing is scaled by the harness', () => {
    mkdirSync('/tmp/instruments', { recursive: true });
    const dark = inksFor('refined', 'dark'), light = inksFor('refined', 'light');
    /** One document per cell width. `.art svg` gets NO css width, so every instrument is rasterised
     *  at the pixel width it is actually given — the harness cannot hide a stretch of its own making. */
    const sheet = (title: string, w: number, rows: { ps: number[]; inks: Inks; dk: boolean }[]) => {
      const body = rows
        .map(({ ps, inks, dk }) => ps.map((p) => INSTRUMENTS.map((it) =>
          `<div class="cell">${bay(it.build(ctx(p, w)), p, w, inks, dk)}<div class="cap">${esc(it.id)} &middot; p=${p} &middot; ${w}px</div></div>`).join('')).join(''))
        .join('');
      writeFileSync(`/tmp/instruments/SHEET-${title}.html`,
        `<!doctype html><meta charset="utf-8"><style>
          html,body{margin:0;background:#4a4a4a;color:#eee;font:12px/1.3 system-ui}
          h2{font:600 13px system-ui;margin:14px 0 8px;padding:0 8px}
          .row{padding:0 8px}
          .cell{width:${w + 12}px;display:inline-block;vertical-align:top;margin:0 6px 4px 0}
          .cap{padding:2px 0 6px;color:#ddd;font:10px system-ui}
          .bay{padding:5px;border:1px solid #111;margin-bottom:2px}
          .art svg{display:block}
        </style><h2>${title}</h2>${body}`);
    };
    sheet('A-dark-351', 351, [{ ps: [1, 0.5, 0], inks: dark, dk: true }]);
    sheet('B-light-351', 351, [{ ps: [1, 0.5, 0], inks: light, dk: false }]);
    sheet('C-dark-200', 200, [{ ps: [1, 0.5, 0], inks: dark, dk: true }]);
    sheet('D-dark-700', 700, [{ ps: [1, 0.5, 0], inks: dark, dk: true }]);
  });
});