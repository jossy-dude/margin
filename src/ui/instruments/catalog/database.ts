import { F, caret, poly, tri } from '../geom';
import type { Build, Shape } from '../types';

/** Group 4 — database systems: three takes. */

/** A root page, one pointer, and a row of leaf pages. The write cursor sweeps the row and lights the
 *  records it has written. */
const btree: Build = (c) => {
  const x0 = 9, pw = 26, x1 = x0 + pw + 24, o: Shape[] = [];
  const cellW = Math.max(11, (c.w - x1 - 9) / 14);
  const n = Math.max(6, Math.min(14, Math.floor((c.w - x1 - 9) / cellW)));
  const lit = c.p * n;
  o.push({ t: 'r', x: x0, y: 7, w: pw, h: 30, rx: 2, ink: 'rest', sw: 1.5 });
  o.push({ t: 'p', d: `M${x0 + 6} 15L${F(x0 + pw - 6)} 15M${x0 + 6} 23L${F(x0 + pw - 6)} 23M${x0 + 6} 31L${F(x0 + 6 + (pw - 12) * 0.6)} 31`, ink: 'rest', sw: 1 });
  o.push({ t: 'p', d: `M${F(x0 + pw)} 15L${F(x0 + pw + 7)} 15L${F(x0 + pw + 7)} 29L${F(x0 + pw)} 29`, ink: 'rest', sw: 1 });
  for (let i = 0; i < n; i++) {
    const x = x1 + i * cellW, on = i < lit;
    o.push({ t: 'r', x, y: 13, w: cellW - 2.5, h: 18, rx: 1.5, ink: on ? 'live' : 'rest', sw: on ? 1.4 : 1.3 });
    o.push({ t: 'p', d: `M${F(x + 3)} 19L${F(x + 3 + cellW - 8)} 19M${F(x + 3)} 25L${F(x + 3 + (cellW - 8) * 0.55)} 25`, ink: on ? 'live' : 'rest', sw: 1 });
  }
  const cxp = x1 + Math.min(lit, n - 0.002) * cellW;
  o.push({ t: 'l', x1: cxp, y1: 9, x2: cxp, y2: 35, ink: 'signal', sw: 1.4 });
  o.push({ t: 'p', d: poly(tri(cxp, 36, 9, 5, 'up')) + 'Z', ink: 'signal', f: true });
  return o;
};

/** Two tables on either side and a hash grid between them. Rows light as they are read, and the lit
 *  cells in the grid are the matches found. */
const join: Build = (c) => {
  const cy = 22, o: Shape[] = [];
  const lw = Math.max(46, Math.min(88, c.w * 0.2)), rw = lw, lx = 8, rx = c.w - 8 - rw;
  const gx = c.w / 2 - 15, cell = 8, gap = 3.5, gw = 3 * cell + 2 * gap, n = Math.round(c.p * 9);
  o.push({ t: 'r', x: lx, y: 8, w: lw, h: 28, rx: 2, ink: 'rest', sw: 1.5 });
  for (let i = 0; i < 4; i++) o.push({ t: 'l', x1: lx + 5, y1: 12.5 + i * 6.5, x2: lx + 5 + lw * (0.4 + (i % 3) * 0.2), y2: 12.5 + i * 6.5, ink: c.p * 9 > i * 2 ? 'live' : 'rest', sw: 1.6 });
  o.push({ t: 'l', x1: lx + lw, y1: cy, x2: gx - 4, y2: cy, ink: 'rest', sw: 1.3 });
  o.push({ t: 'l', x1: gx + gw + 4, y1: cy, x2: rx, y2: cy, ink: 'rest', sw: 1.3 });
  o.push({ t: 'p', d: `${poly(tri(gx - 8, cy, 4, 7, 'right'))}${poly(tri(gx + gw + 8, cy, 4, 7, 'right'))}`, ink: 'rest', sw: 1.3 });
  for (let i = 0; i < 9; i++) {
    const on = i < n;
    o.push({ t: 'r', x: gx + (i % 3) * (cell + gap), y: 8 + Math.floor(i / 3) * (cell + gap), w: cell, h: cell, rx: 1.5, ink: !on ? 'rest' : i === n - 1 ? 'signal' : 'live', f: on, sw: 1.3 });
  }
  o.push({ t: 'r', x: rx, y: 8, w: rw, h: 28, rx: 2, ink: 'rest', sw: 1.5 });
  for (let i = 0; i < 4; i++) o.push({ t: 'l', x1: rx + 5, y1: 12.5 + i * 6.5, x2: rx + 5 + rw * (0.35 + ((i + 1) % 3) * 0.2), y2: 12.5 + i * 6.5, ink: n > i * 2 + 1 ? 'live' : 'rest', sw: 1.6 });
  return o;
};

/** The buffer pool over the write-ahead log, with a checkpoint marker advancing across both. Lit
 *  records are durable; grey ones are still only in memory. */
const log: Build = (c) => {
  const o: Shape[] = [], x0 = 10, span = c.w - 20, px = x0 + span * c.p;
  const bn = Math.max(3, Math.floor(span / 46)), bw = span / bn;
  for (let i = 0; i < bn; i++) o.push({ t: 'r', x: x0 + i * bw + 1, y: 7, w: bw - 3, h: 11, rx: 1.5, ink: (i + 0.5) / bn < c.p ? 'live' : 'rest', sw: 1.3 });
  const ln = Math.max(8, Math.floor(span / 11)), lwid = span / ln;
  for (let i = 0; i < ln; i++) {
    const lx = x0 + i * lwid, on = lx + lwid / 2 < px;
    o.push({ t: 'r', x: lx, y: 24, w: Math.max(1.5, lwid - 1.5), h: 12, ink: on ? 'live' : 'rest', f: on, sw: 1.2, op: on ? undefined : 0.55 });
  }
  o.push({ t: 'l', x1: px, y1: 3, x2: px, y2: 39, ink: 'signal', sw: 1.4 });
  o.push({ t: 'p', d: caret(px, 1, 9), ink: 'signal', f: true });
  return o;
};

export const DB: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'btree', n: 'B-tree', d: 'A root page, one pointer and a row of leaves. The cursor sweeps and lights what it has written.', build: btree },
  { id: 'join', n: 'Join', d: 'Two tables and a hash grid between them. Lit cells are the matches found.', build: join },
  { id: 'log', n: 'Log', d: 'The buffer pool over the write-ahead log, with the checkpoint advancing across both.', build: log },
];