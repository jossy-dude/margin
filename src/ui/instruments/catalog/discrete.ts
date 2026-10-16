import { F, caret, lensPts, poly } from '../geom';
import type { Build, Shape } from '../types';

/** Group 1 — discrete mathematics: two takes. */

/** The integers in order with the composites struck out as the pass reaches them. What is still lit
 *  is exactly what is still prime. The strike is part of the RESTING draw on purpose: it is already
 *  history, and history is grey in this system. */
const sieve: Build = (c) => {
  const x0 = 15, cw = 15, n = Math.max(6, Math.floor((c.w - 22) / cw)), px = x0 + (n - 1) * cw * c.p, o: Shape[] = [];
  const prime = (v: number) => {
    if (v < 2) return false;
    for (let d = 2; d * d <= v; d++) if (v % d === 0) return false;
    return true;
  };
  for (let i = 0; i < n; i++) {
    const v = i + 1, x = x0 + i * cw, passed = x < px, isP = prime(v);
    o.push({ t: 'x', x, y: 21, s: String(v), ink: isP && passed ? 'live' : 'rest', size: 10, anchor: 'middle' });
    if (passed && !isP) o.push({ t: 'p', d: `M${F(x - 5)} 14L${F(x + 5)} 27M${F(x + 5)} 14L${F(x - 5)} 27`, ink: 'live', sw: 1.3, op: 0.72 });
  }
  o.push({ t: 'l', x1: px, y1: 6, x2: px, y2: 38, ink: 'signal', sw: 1.4 });
  o.push({ t: 'p', d: caret(px, 5), ink: 'signal', f: true });
  return o;
};

/** Three overlapping circles and the two lens-shaped intersections filling in turn. The pips on the
 *  right are the individual elements in the overlap. The lens is scaled about its OWN centre with a
 *  transform, never clipped — a clip would need an id, and ids collide when two copies render. */
const sets: Build = (c) => {
  const cy = 22, r = Math.max(7, Math.min(15, (c.w - 24) / 5)), d = r * 1.12, o: Shape[] = [];
  const x1 = 8 + r, x2 = x1 + d, x3 = x2 + d;
  // The lens is the OVERLAP, so it is sampled once and scaled about its own centre by how far the
  // fill has got. At scale 0.02 it is smaller than a stroke width, so it is simply not drawn.
  const lens = (a: number, b: number, sc: number) => {
    const s = Math.max(0, Math.min(1, sc));
    if (s < 0.03) return;
    const mx = (a + b) / 2;
    o.push({ t: 'g', tf: `translate(${F(mx)} ${cy}) scale(${+s.toFixed(3)}) translate(${F(-mx)} ${F(-cy)})`, ch: [{ t: 'p', d: `${poly(lensPts(a, b, cy, r, 14))}Z`, ink: 'live', f: true, op: 0.42 }] });
  };
  lens(x1, x2, c.p * 2);
  lens(x2, x3, c.p * 2 - 1);
  o.push({ t: 'c', cx: x1, cy, r, ink: 'rest', sw: 1.5 }, { t: 'c', cx: x2, cy, r, ink: 'rest', sw: 1.5 }, { t: 'c', cx: x3, cy, r, ink: 'rest', sw: 1.5 });
  const px0 = x3 + r + 12, pw = (c.w - 10 - px0) / 12;
  for (let i = 0; i < 12; i++) {
    const bw = Math.max(2, pw - 3);
    if (px0 + i * pw + bw > c.w - 2) break; // never run off the right edge
    o.push({ t: 'r', x: px0 + i * pw, y: cy - 7, w: bw, h: 14, rx: 2, ink: i < Math.round(c.p * 12) ? 'live' : 'rest', f: i < Math.round(c.p * 12), sw: 1.3 });
  }
  return o;
};

export const DISCRETE: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'sieve', n: 'Sieve', d: 'The integers in order with the composites struck as the pass reaches them.', build: sieve },
  { id: 'sets', n: 'Sets', d: 'Three overlapping circles, the two intersections filling in turn, pips for the elements.', build: sets },
];