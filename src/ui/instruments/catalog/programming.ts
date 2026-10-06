import { F, caret, cubicPts, poly, tri } from '../geom';
import type { Build, Shape } from '../types';

/** Group 3 — computer programming: three takes. */

/** Frames carrying their line numbers, unwinding off the top as the period runs out. The lit ones
 *  are the frames still on the stack. */
const stack: Build = (c) => {
  const n = Math.max(3, Math.min(8, Math.round(c.w / 56))), fw = (c.w - 16) / n, x0 = 8, y0 = 7, fh = 24, o: Shape[] = [];
  // no Math.max(1, …) floor: at p=0 the stack must be EMPTY, and a lit frame means
  // "still on the stack". The caret sits over the topmost lit frame, clamped at frame 0.
  const k = Math.ceil(n * c.p), caret = Math.max(0, Math.min(n - 1, k - 1));
  for (let i = n - 1; i >= 0; i--) {
    const x = x0 + i * fw, on = i < k, ink = on ? 'live' : 'rest';
    o.push({
      t: 'p',
      d: `M${F(x + 9)} ${y0}L${F(x + fw)} ${y0}M${F(x + 9)} ${y0 + fh}L${F(x + fw)} ${y0 + fh}M${F(x + 3)} ${y0}L${F(x + 3)} ${y0 + fh}M${F(x + 3)} ${y0}L${F(x + 9)} ${y0}M${F(x + 3)} ${y0 + fh}L${F(x + 9)} ${y0 + fh}`,
      ink, sw: on ? 1.7 : 1.2,
    });
    o.push({ t: 'x', x: x + 14, y: y0 + fh / 2, s: String(120 + i * 17), ink: on ? 'live' : 'rest', size: 8 });
  }
  o.push({ t: 'l', x1: 4, y1: 36, x2: c.w - 4, y2: 36, ink: 'rest', sw: 1.6 });
  o.push({ t: 'x', x: 5, y: 40, s: 'BASE POINTER', ink: 'rest', size: 7, anchor: 'start' });
  o.push({ t: 'p', d: poly(tri(x0 + caret * fw + fw / 2, 6, 11, 4, 'up')) + 'Z', ink: 'signal', f: true });
  return o;
};

/** A branch leaves the main lane, does its work and merges back. The lit history is what the lesson
 *  has already committed; the caret is HEAD. */
const commits: Build = (c) => {
  const y0 = 15, y1 = 28, x0 = 15, span = c.w - 30, px = x0 + span * c.p, o: Shape[] = [];
  const M = (i: number) => x0 + (span * i) / 6, B = (i: number) => x0 + (span * (1.5 + i * 0.85)) / 6;
  o.push({ t: 'l', x1: x0, y1: y0, x2: x0 + span, y2: y0, ink: 'rest', sw: 1, dash: '2 4', op: 0.5 });
  o.push({ t: 'l', x1: x0, y1: y1, x2: x0 + span, y2: y1, ink: 'rest', sw: 1, dash: '2 4', op: 0.5 });
  const E: [string, number][] = [
    [`M${F(M(0))} ${y0}L${F(M(1))} ${y0}`, (M(0) + M(1)) / 2],
    [poly(cubicPts([M(1), y0], [M(1) + 5, y0], [B(0) - 5, y1], [B(0), y1])), (M(1) + B(0)) / 2],
    [`M${F(B(0))} ${y1}L${F(B(1))} ${y1}`, (B(0) + B(1)) / 2],
    [poly(cubicPts([B(1), y1], [B(1) + 7, y1], [M(4) - 7, y0], [M(4), y0])), (B(1) + M(4)) / 2],
    [`M${F(M(4))} ${y0}L${F(M(5))} ${y0}`, (M(4) + M(5)) / 2],
    [`M${F(M(5))} ${y0}L${F(M(6))} ${y0}`, (M(5) + M(6)) / 2],
  ];
  for (const [d, mid] of E) o.push({ t: 'p', d, ink: mid < px ? 'live' : 'rest', sw: mid < px ? 1.8 : 1.5 });
  const N: [number, number][] = [[M(0), y0], [M(1), y0], [B(0), y1], [B(1), y1], [M(4), y0], [M(5), y0], [M(6), y0]];
  for (const [x, y] of N) o.push({ t: 'c', cx: x, cy: y, r: 3.6, ink: x < px ? 'live' : 'rest', f: true });
  o.push({ t: 'l', x1: px, y1: 5, x2: px, y2: 40, ink: 'signal', sw: 1.3, op: 0.85 });
  o.push({ t: 'p', d: caret(px, 4), ink: 'signal', f: true });
  return o;
};

/** Nursery, tenured and old space, filled in turn, with a pointer riding the edge of whichever
 *  generation is filling. What survives gets promoted. */
const heap: Build = (c) => {
  const y = 9, h = 24, o: Shape[] = [];
  let x = 8;
  const SEGS: [string, number, number, number][] = [['E0', 0.4, 0, 0.46], ['E1', 0.32, 0.46, 0.84], ['OLD', 0.28, 0.84, 1]];
  for (let i = 0; i < SEGS.length; i++) {
    const [name, frac, lo, hi] = SEGS[i]!, bw = (c.w - 16) * frac - (i < 2 ? 6 : 0);
    const t = Math.max(0, Math.min(1, (c.p - lo) / (hi - lo)));
    o.push({ t: 'r', x, y, w: bw, h, ink: 'rest', sw: 1.5 });
    if (t > 0.005) o.push({ t: 'r', x: x + 2, y: y + 2, w: Math.max(1, (bw - 4) * t), h: h - 4, ink: 'live', f: true });
    if (t > 0.02 && t < 0.98) {
      const ex = x + 2 + (bw - 4) * t;
      o.push({ t: 'p', d: caret(ex, 4), ink: 'signal', f: true }, { t: 'l', x1: ex, y1: 9, x2: ex, y2: y + h, ink: 'signal', sw: 1.2, op: 0.8 });
    }
    o.push({ t: 'x', x: x + bw / 2, y: y + h + 8, s: name, ink: 'rest', size: 7, anchor: 'middle' });
    x += bw + 6;
  }
  return o;
};

export const PROG: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'stack', n: 'Call stack', d: 'Frames with their line numbers, unwinding off the top. The lit ones are still on the stack.', build: stack },
  { id: 'commits', n: 'Commits', d: 'A branch leaves the main lane, does its work and merges back. The caret is HEAD.', build: commits },
  { id: 'heap', n: 'Generations', d: 'Nursery, tenured and old space filled in turn, with a pointer on the filling one.', build: heap },
];