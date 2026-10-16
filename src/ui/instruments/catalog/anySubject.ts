import { F, poly, polyLen, sample } from '../geom';
import type { Build, Shape } from '../types';

/** Group −1: three instruments that read the clock and are correct in any subject. */

/** Supply spool empties, take-up spool fills, and the tape runs the length of the deck past the head. */
const cassette: Build = (c) => {
  const cy = 24, rf = 11, x1 = Math.max(20, c.w * 0.2), x2 = c.w - Math.max(20, c.w * 0.2);
  // p=1 is the start of the period, so the SUPPLY reel is the full one. The reference has these
  // two the other way round, which reads as a transport running in reverse.
  const rs = 3 + 7 * c.p, rt = 3 + 7 * (1 - c.p), o: Shape[] = [];
  o.push({ t: 'c', cx: x1, cy, r: rf, ink: 'rest', sw: 1.5 }, { t: 'c', cx: x1, cy, r: rs, ink: 'live', f: true, op: 0.9 });
  o.push({ t: 'c', cx: x2, cy, r: rf, ink: 'rest', sw: 1.5 }, { t: 'c', cx: x2, cy, r: rt, ink: 'signal', f: true, op: 0.85 });
  o.push({ t: 'c', cx: x1, cy, r: 2.4, ink: 'rest', sw: 2.2 }, { t: 'c', cx: x2, cy, r: 2.4, ink: 'rest', sw: 2.2 });
  // both tangent runs are real: 39-(cy+R) each, so they sum to a constant as the tape moves
  o.push({ t: 'p', d: `M${F(x1)} ${F(cy + rs)}L${F(x1)} 39L${F(x2)} 39L${F(x2)} ${F(cy + rt)}`, ink: 'live', sw: 2.2, cap: 'round' });
  o.push({ t: 'r', x: c.w / 2 - 8, y: 38, w: 16, h: 6, rx: 1, ink: 'rest', sw: 1.3 });
  o.push({ t: 'l', x1: c.w / 2, y1: 39, x2: c.w / 2, y2: 44, ink: 'rest', sw: 2 }); // the fixed head
  o.push({ t: 'x', x: x1, y: cy - rf - 5, s: 'SUPPLY', ink: 'rest', anchor: 'middle' });
  o.push({ t: 'x', x: x2, y: cy - rf - 5, s: 'TAKE-UP', ink: 'rest', anchor: 'middle' });
  return o;
};

/** A graduated glass, lit to the meniscus. The quietest of the set and the only one you can read
 *  without learning anything: the scale is in real minutes and the lit column is the time left. */
const graduated: Build = (c) => {
  const x0 = 12, x1 = c.w - 12, liq = x0 + 3 + (x1 - x0 - 6) * c.p, o: Shape[] = [], mins = Math.round(c.total / 60000);
  o.push({ t: 'r', x: x0, y: 6, w: x1 - x0, h: 24, rx: 5, ink: 'rest', sw: 1.5 });
  if (c.p > 0.004) o.push({ t: 'r', x: x0 + 3, y: 9, w: Math.max(1.5, liq - x0 - 3), h: 18, rx: 4, ink: 'live', f: true });
  o.push({ t: 'l', x1: liq, y1: 9.5, x2: liq, y2: 26.5, ink: 'signal', sw: 1.2, op: 0.6 });
  for (let i = 0; i <= 10; i++) {
    const gx = x0 + (x1 - x0) * (i / 10), maj = i % 2 === 0;
    // `c.p > 1e-6` as well: at exactly zero, graduation 0 must not read as already passed
    const on = c.p > 1e-6 && i / 10 <= c.p + 1e-6;
    o.push({ t: 'l', x1: gx, y1: 30, x2: gx, y2: 30 + (maj ? 5 : 3), ink: on ? 'live' : 'rest', sw: maj ? 1.5 : 1 });
    if (maj) o.push({ t: 'x', x: gx, y: 40, s: String(Math.round((mins * i) / 10)), ink: on ? 'live' : 'rest', size: 7, anchor: 'middle' });
  }
  return o;
};

/** One groove, drawn to the playhead. It reads as a record and the eye follows it the whole way. */
const spiral: Build = (c) => {
  const cx = c.w / 2, cy = 22, mx = Math.max(14, c.w / 2 - 14), my = 16;
  const pts = sample(200, (t) => {
    const a = t * Math.PI * 8 - Math.PI / 2;
    return [cx + (2 + t * mx) * Math.cos(a), cy + (2 + t * my) * Math.sin(a)] as [number, number];
  });
  const n = Math.max(2, Math.round(200 * c.p)), head = pts[Math.min(200, n)]!;
  return [
    { t: 'run', d: poly(pts), len: polyLen(pts), ink: 'live', sw: 1.6, cap: 'round' },
    { t: 'c', cx: head[0], cy: head[1], r: 2.4, ink: 'signal', f: true },
  ];
};

export const ANY: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'cassette', n: 'Transport', d: 'Supply spool empties, take-up spool fills, and the tape runs the length of the deck.', build: cassette },
  { id: 'graduated', n: 'Gauge glass', d: 'A graduated glass lit to the meniscus, scaled in real minutes. The quietest thing here.', build: graduated },
  { id: 'spiral', n: 'Spiral', d: 'One groove drawn to the playhead. It reads as a record and the eye follows it across.', build: spiral },
];

