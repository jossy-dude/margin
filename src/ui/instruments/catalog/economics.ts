import { F, caret, hash, poly, polyLen, sample, solve } from '../geom';
import type { Build, Shape } from '../types';

/** Group 0 — economics: three takes. */

/** The tape prints left to right under a fixed head. Prices land on the lit side of the head and
 *  nowhere else. The prints are a deterministic hash, not `Math.random`, so a tape is the same tape
 *  on every mount and the lit run does not reshuffle under the eye. */
const tape: Build = (c) => {
  const x0 = 8, x1 = c.w - 8, head = x0 + (x1 - x0) * c.p, o: Shape[] = [];
  o.push({ t: 'r', x: x0, y: 11, w: x1 - x0, h: 26, rx: 2, ink: 'rest', sw: 1 });
  for (let i = 0, x = x0 + 9; x < x1 - 34; x += 52, i++) {
    const a = (90 + hash(i + 3) * 900).toFixed(1), b = (+a + hash(i + 9) * 24 - 12).toFixed(1);
    const k = x + 17 < head ? 'live' : 'rest';
    o.push({ t: 'x', x, y: 21, s: a, ink: k, size: 9 }, { t: 'x', x, y: 32, s: b, ink: k, size: 9 });
  }
  o.push({ t: 'l', x1: head, y1: 7, x2: head, y2: 39, ink: 'signal', sw: 1.6 });
  o.push({ t: 'p', d: caret(head, 4, 9), ink: 'signal', f: true });
  return o;
};

/**
 * Demand against supply with the equilibrium marked and the surplus shaded in as the period is
 * worked. The equilibrium is FOUND by bisecting where the two curves cross rather than assumed, so
 * the shaded triangle is always the real triangle at this band height — the reference's hardcoded
 * 0.58 left a five-pixel sliver that read as two lines and nothing else. Exponents are chosen so
 * both curves are visibly curved at 44px: a straight line is not a supply curve.
 */
const surplus: Build = (c) => {
  const x0 = 24, x1 = c.w - 18, base = 39, top = 7, o: Shape[] = [];
  const D = (t: number) => top + 27 * Math.pow(t, 0.55);
  const S = (t: number) => base - 27 * Math.pow(t, 1.7);
  const eq = solve((t) => D(t) - S(t));
  const px = x0 + (x1 - x0) * eq, py = D(eq);
  // the surplus region is the triangle under demand and above the equilibrium price, so it stops at
  // the equilibrium: past that point there IS no surplus left to shade, and pretending otherwise is
  // the kind of small lie that makes a bar decorative
  const fm = Math.min(c.p, eq), qx = x0 + (x1 - x0) * fm;
  const curve = sample(28, (t) => [x0 + (x1 - x0) * t, D(t)]), run = sample(28, (t) => [x0 + (x1 - x0) * (t * fm), D(t * fm)]);

  o.push({ t: 'l', x1: x0, y1: top - 3, x2: x0, y2: base, ink: 'rest', sw: 1 }, { t: 'l', x1: x0, y1: base, x2: x1 + 3, y2: base, ink: 'rest', sw: 1 });
  o.push({ t: 'p', d: poly(sample(28, (t) => [x0 + (x1 - x0) * t, S(t)])), ink: 'rest', sw: 1.5 });
  o.push({ t: 'p', d: poly(curve), ink: 'rest', sw: 1.5 });
  if (fm > 0.004) o.push({ t: 'p', d: `M${F(x0)} ${F(py)}${poly(run)}L${F(qx)} ${F(py)}Z`, ink: 'live', f: true, op: 0.34 });
  o.push({ t: 'run', d: poly(curve), len: polyLen(curve), ink: 'live', sw: 1.8, cap: 'round' });
  // the equilibrium never moves: dashed guides to both axes, a filled dot and a ring round it
  o.push({ t: 'p', d: `M${F(x0)} ${F(py)}L${F(px)} ${F(py)}M${F(px)} ${F(py)}L${F(px)} ${base}`, ink: 'rest', sw: 1, dash: '2 3' });
  o.push({ t: 'c', cx: px, cy: py, r: 5.4, ink: 'rest', sw: 1.1 }, { t: 'c', cx: px, cy: py, r: 2.6, ink: 'rest', f: true });
  o.push({ t: 'c', cx: x0 + (x1 - x0) * c.p, cy: D(c.p), r: 3, ink: 'signal', f: true });
  o.push({ t: 'x', x: x0 - 4, y: top, s: 'P', ink: 'rest', anchor: 'end' }, { t: 'x', x: x1 + 4, y: base, s: 'Q', ink: 'rest', anchor: 'start' });
  return o;
};

/** The staircase interest actually builds. Each tread is one compounding period; the lit run is how
 *  much of the curve the lesson has covered. */
const compound: Build = (c) => {
  const x0 = 16, x1 = c.w - 14, base = 39, top = 15, n = 8, g = 0.34, o: Shape[] = [];
  const lvl = (i: number) => base - (base - top) * (Math.pow(1 + g, i) - 1) / (Math.pow(1 + g, n) - 1);
  /** The staircase as POINTS, so its length is measured and the lit run is a true fraction of it. */
  const stair = (upto: number): [number, number][] => {
    const pts: [number, number][] = [[x0, base]];
    const m = Math.max(0, Math.min(n, Math.ceil(upto * n)));
    for (let i = 0; i < m; i++) {
      const xa = x0 + (x1 - x0) * (i / n), xb = x0 + (x1 - x0) * ((i + 1) / n);
      pts.push([xa + (xb - xa) * 0.55, base], [xa + (xb - xa) * 0.55, lvl(i + 1)], [xb, lvl(i + 1)]);
    }
    if (upto > 0 && upto < 1) pts.push([x0 + (x1 - x0) * upto, lvl(Math.min(n, m))], [x0 + (x1 - x0) * upto, base]);
    return pts;
  };
  const full = stair(1), live = stair(c.p);
  o.push({ t: 'l', x1: x0, y1: base, x2: x1, y2: base, ink: 'rest', sw: 1 });
  o.push({ t: 'p', d: poly(full), ink: 'rest', sw: 1.5 });
  if (c.p > 0.004) o.push({ t: 'p', d: `${poly(live)}L${F(x0 + (x1 - x0) * c.p)} ${base}L${F(x0)} ${base}Z`, ink: 'live', f: true, op: 0.24 });
  o.push({ t: 'run', d: poly(live), len: polyLen(live), ink: 'live', sw: 1.7, cap: 'round' });
  const front = live[live.length - 1]!;
  o.push({ t: 'c', cx: front[0], cy: front[1], r: 2.4, ink: 'signal', f: true });
  for (let i = 0; i < n; i++) o.push({ t: 'l', x1: x0 + (x1 - x0) * ((i + 0.5) / n), y1: base, x2: x0 + (x1 - x0) * ((i + 0.5) / n), y2: base + 3, ink: 'rest', sw: 1 });
  o.push({ t: 'x', x: x1, y: top - 9, s: `1.00 to ${Math.pow(1 + g, n).toFixed(2)}`, ink: 'rest', anchor: 'end' });
  return o;
};

export const ECON: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'tape', n: 'Market tape', d: 'A tape printing left to right under a fixed head. Prices land on the lit side of the head and nowhere else.', build: tape },
  { id: 'surplus', n: 'Surplus', d: 'Demand against supply with equilibrium marked, and the surplus shaded in as the period is worked.', build: surplus },
  { id: 'compound', n: 'Compounding', d: 'The staircase interest actually builds, one tread per compounding period.', build: compound },
];