import { F, poly, polyLen, quadPts, sample, tri } from '../geom';
import type { Build, Shape } from '../types';

/** Group 2 — emerging technology: three takes. */

/** An oscilloscope: graticule, a damped burst, and a trigger block. The lit trace is the part of the
 *  signal already recorded. */
const scope: Build = (c) => {
  const x0 = 7, x1 = c.w - 7, cy = 22, o: Shape[] = [], head = x0 + (x1 - x0) * c.p;
  const pts = sample(240, (t) => {
    const env = 0.35 + 0.65 * Math.exp(-Math.pow((t - 0.6) * 3.2, 2));
    return [x0 + (x1 - x0) * t, cy + 11 * env * Math.sin(t * Math.PI * 5.5) + 2 * Math.sin(t * Math.PI * 17)] as [number, number];
  });
  for (let i = 1; i < 9; i++) o.push({ t: 'l', x1: x0 + (x1 - x0) * (i / 9), y1: 5, x2: x0 + (x1 - x0) * (i / 9), y2: 39, ink: 'rest', sw: 1, op: 0.35 });
  o.push({ t: 'l', x1: x0, y1: cy, x2: x1, y2: cy, ink: 'rest', sw: 1, dash: '2 4', op: 0.7 });
  o.push({ t: 'p', d: poly(pts), ink: 'rest', sw: 1.1, op: 0.75 });
  o.push({ t: 'run', d: poly(pts), len: polyLen(pts), ink: 'live', sw: 1.9 });
  o.push({ t: 'l', x1: head, y1: 5, x2: head, y2: 39, ink: 'signal', sw: 1.3, op: 0.8 });
  o.push({ t: 'r', x: head - 4.5, y: 5, w: 9, h: 6, ink: 'signal', f: true });
  return o;
};

/** Forty-six channels under a peak-hold ceiling that falls as the period drains. The ceiling IS the
 *  bar; the bins below it are what is still within range. At p=0 the ceiling sits on the axis and
 *  nothing is lit, which is the truth. */
const spectrum: Build = (c) => {
  const x0 = 11, x1 = c.w - 11, base = 35, maxh = 29, n = 46, o: Shape[] = [];
  const bw = (x1 - x0) / n, ceil = base - maxh * c.p;
  // peak-normalised: the tallest channel must REACH the ceiling at p=1, or the ceiling is a line the
  // signal never touches and the analyser is not reading anything. Normalising costs 46 evaluations
  // once per render and makes the display mean what a peak-hold display means.
  const raw = (t: number) => maxh * (0.2 + 0.8 * Math.abs(Math.sin(t * 9.1)) * (0.45 + 0.55 * Math.sin(t * 3.1 + 1)));
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, raw(i / n));
  const gain = peak > 0 ? maxh / peak : 1;
  o.push({ t: 'l', x1: x0, y1: base, x2: x1, y2: base, ink: 'rest', sw: 1 });
  for (let i = 0; i < n; i++) {
    const h = Math.max(2, Math.min(maxh, raw(i / n) * gain));
    const x = x0 + i * bw, top = base - h, litTop = Math.max(ceil, top);
    o.push({ t: 'l', x1: x + bw / 2, y1: base, x2: x + bw / 2, y2: top, ink: 'rest', sw: 1 });
    if (litTop < base - 0.6) o.push({ t: 'l', x1: x + bw / 2, y1: base, x2: x + bw / 2, y2: litTop, ink: 'live', sw: Math.max(1.4, bw * 0.5) });
  }
  o.push({ t: 'l', x1: x0, y1: ceil, x2: x1, y2: ceil, ink: 'signal', sw: 1.4 });
  // the peak-hold marker sits ABOVE the ceiling: as a right arrow it hung 2.6px below the axis once
  // the ceiling had fallen, which is the one thing a peak-hold marker must never do
  o.push({ t: 'p', d: poly(tri(x1 - 4, ceil, 7, 5, 'up')) + 'Z', ink: 'signal', f: true });
  return o;
};

/** Source, filter, amplifier, output — and a pulse still sitting in the chain. The lit blocks are
 *  the stages the signal has already passed. Each block carries its own mark, scaled about its own
 *  centre, so a block is never a plain rectangle: a rectangle can only ever be a stripe. */
const blocks: Build = (c) => {
  const y = 12, h = 21, n = 4, gap = 13, x0 = 10, span = c.w - 20, o: Shape[] = [];
  const bw = (span - gap * (n - 1)) / n, px = x0 + span * c.p, cy = y + h / 2;
  // source (a sine), filter (a parabola), amplifier (a triangle), output (a trapezoid)
  const GLYPH = [
    poly([...quadPts([0, 4], [3.5, -3], [7, 4], 10), ...quadPts([7, 4], [10.5, 11], [14, 4], 10)]),
    poly(quadPts([0, 5], [7, -6], [14, 5], 14)),
    'M0 6L7 0L14 6Z',
    'M0 6L4 0L10 0L14 6Z',
  ];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (bw + gap), on = x + bw / 2 < px, k = on ? 'live' : 'rest';
    o.push({ t: 'r', x, y, w: bw, h, rx: 2, ink: k, sw: on ? 1.5 : 1.4 });
    const sc = Math.min(20, bw - 16) / 14, gx = x + (bw - 14 * sc) / 2, gy = cy - 3.2 * sc;
    o.push({ t: 'g', tf: `translate(${F(gx)} ${F(gy)}) scale(${+sc.toFixed(3)})`, ch: [{ t: 'p', d: GLYPH[i]!, ink: k, sw: 1.2, f: i >= 2 }] });
    if (i < n - 1) o.push({ t: 'l', x1: x + bw, y1: cy, x2: x + bw + gap, y2: cy, ink: x + bw < px ? 'live' : 'rest', sw: 1.2 });
  }
  o.push({ t: 'c', cx: px, cy, r: 3.6, ink: 'signal', f: true });
  o.push({ t: 'l', x1: px, y1: cy - 9, x2: px, y2: cy - 13, ink: 'signal', sw: 1.2 }, { t: 'l', x1: px, y1: cy + 9, x2: px, y2: cy + 13, ink: 'signal', sw: 1.2 });
  return o;
};

export const TECH: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'scope', n: 'Oscilloscope', d: 'Graticule, a damped burst and a trigger block. The lit trace is the signal already recorded.', build: scope },
  { id: 'spectrum', n: 'Analyzer', d: 'Forty-six channels under a peak-hold ceiling that falls as the period drains.', build: spectrum },
  { id: 'blocks', n: 'Chain', d: 'Source, filter, amplifier, output, and a pulse still sitting in the chain.', build: blocks },
];