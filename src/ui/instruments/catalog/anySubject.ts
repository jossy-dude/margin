import { F, around, polar, poly, polyLen, sample } from '../geom';
import type { Build, Shape } from '../types';

/** Group −1: seven instruments that read the clock and are correct in any subject. */

/** Four mechanical drums. The lit digit is the one counting down; the grey digit under it is what
 *  lands next. This is the only instrument that prints a number, so it is also the only one that can
 *  be *wrong* — hence it prints `c.left`, the real remaining milliseconds of the real period, not
 *  the reference's assumed 50:00. */
const odometer: Build = (c) => {
  const s = Math.max(0, Math.round(c.left / 1000)), mm = Math.floor(s / 60), ss = s % 60;
  const cur = [Math.floor(mm / 10) % 10, mm % 10, Math.floor(ss / 10), ss % 10];
  const cw = Math.max(16, Math.min(40, (c.w - 28) / 4)), x0 = (c.w - (cw * 4 + 24)) / 2, o: Shape[] = [];
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * (cw + 8), cx = x + cw / 2;
    o.push({ t: 'r', x, y: 2, w: cw, h: 40, rx: 3, ink: 'rest', sw: 1.4 });
    o.push({ t: 'l', x1: x, y1: 22, x2: x + cw, y2: 22, ink: 'rest', sw: 1, op: 0.6 });
    o.push({ t: 'x', x: cx, y: 13.5, s: String(cur[i]), ink: 'signal', size: 17, anchor: 'middle' });
    o.push({ t: 'x', x: cx, y: 33, s: String((cur[i]! + 1) % 10), ink: 'rest', size: 15, anchor: 'middle' });
  }
  // the separator goes in the GAP between drums 2 and 3. The reference puts it at `x0 + cw*1.5 +
  // 12`, which at any width above ~300px lands inside drum 2, on top of the digit.
  const d = x0 + cw * 2 + 12;
  o.push({ t: 'c', cx: d, cy: 17, r: 1.5, ink: 'live', f: true }, { t: 'c', cx: d, cy: 27, r: 1.5, ink: 'live', f: true });
  return o;
};

/** A 180° dial. The scale is engraved once and never moves, so the whole period and the part of it
 *  left are legible together — which a clipped texture can never do. The end labels are the real
 *  period length, not a hardcoded 50. */
const gauge: Build = (c) => {
  const cx = c.w / 2, cy = 38, R = Math.min(30, c.w / 2 - 16), o: Shape[] = [];
  const a = (t: number, r = R) => polar(cx, cy, r, 180 - 180 * t);
  o.push({ t: 'p', d: poly(around(cx, cy, R, 180, 0, 32)), ink: 'rest', sw: 1.5 });
  if (c.p > 0.002) o.push({ t: 'p', d: poly(around(cx, cy, R, 180, 180 * c.p, Math.max(2, Math.ceil(32 * c.p)))), ink: 'live', sw: 2.8, cap: 'round' });
  // `f > 1e-6` as well as `t <= f`: at exactly zero, tick 0 must not read as "already passed"
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, m = i % 5 === 0, q1 = a(t), q2 = a(t, R - (m ? 6 : 3.4));
    o.push({ t: 'l', x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], ink: c.p > 1e-6 && t <= c.p + 1e-6 ? 'live' : 'rest', sw: m ? 1.6 : 1 });
  }
  const nd = a(c.p, R * 0.78);
  o.push({ t: 'l', x1: cx, y1: cy, x2: nd[0], y2: nd[1], ink: 'signal', sw: 2.4, cap: 'round' });
  // a stroked pivot, not a filled dot: a filled hub would read as "lit" on a bar that is at zero
  o.push({ t: 'c', cx, cy, r: 3.4, ink: 'live', sw: 2 });
  o.push({ t: 'x', x: cx - R + 8, y: cy - 6, s: '0', ink: 'rest', anchor: 'start' });
  o.push({ t: 'x', x: cx + R - 8, y: cy - 6, s: String(Math.round(c.total / 60000)), ink: 'rest', anchor: 'end' });
  return o;
};

/** Academy countdown leader: sprocket rail, crosshair, wipe. The number counts 8 down as the hand
 *  goes round and then the hand is on the run-out — so the last 8% of the period is a visible
 *  countdown, not a frozen dial. */
const leader: Build = (c) => {
  const cx = c.w / 2, cy = 22, R = Math.min(18, c.w / 2 - 14), o: Shape[] = [];
  for (let x = 5; x < c.w - 7; x += 11) {
    o.push({ t: 'r', x, y: 0, w: 5, h: 4, rx: 1, ink: 'rest', f: true, op: 0.7 }, { t: 'r', x, y: 40, w: 5, h: 4, rx: 1, ink: 'rest', f: true, op: 0.7 });
  }
  o.push({
    t: 'p',
    d: `M7 11L7 7L16 7M${F(c.w - 16)} 7L${F(c.w - 7)} 7L${F(c.w - 7)} 11M${F(c.w - 7)} 33L${F(c.w - 7)} 37L${F(c.w - 16)} 37M16 37L7 37L7 33`,
    ink: 'rest', sw: 1,
  });
  o.push({ t: 'l', x1: 0, y1: cy, x2: c.w, y2: cy, ink: 'rest', sw: 1, op: 0.5 }, { t: 'l', x1: cx, y1: 6, x2: cx, y2: 38, ink: 'rest', sw: 1, op: 0.5 });
  o.push({ t: 'c', cx, cy, r: R, ink: 'rest', sw: 1.5 });
  // 12 o'clock and round clockwise, because the count runs DOWN. In `polar`'s convention (degrees
  // anticlockwise from 3 o'clock, y up) that is 90° falling by 360° over the whole period.
  const hand = polar(cx, cy, R, 90 - 360 * c.p);
  if (c.p > 0.005) {
    const wedge = [[cx, cy] as [number, number], ...around(cx, cy, R, 90, 90 - 360 * c.p, Math.max(3, Math.ceil(36 * c.p))), hand];
    o.push({ t: 'p', d: `${poly(wedge)}Z`, ink: 'live', f: true, op: 0.15 });
  }
  o.push({ t: 'l', x1: cx, y1: cy, x2: hand[0], y2: hand[1], ink: 'signal', sw: 2.2, cap: 'round' });
  const n = Math.ceil(c.p * 8);
  if (n >= 2) o.push({ t: 'x', x: cx, y: cy, s: String(n), ink: 'live', size: Math.round(R * 1.05), anchor: 'middle' });
  return o;
};

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

/** Rungs to the ground, and the lit ones are the rungs left. The rung count follows the measured
 *  width, so it is never crowded: four at 200 px, eleven at 700. */
const ladder: Build = (c) => {
  const n = Math.max(4, Math.min(11, Math.round(c.w / 24))), x0 = 16, x1 = c.w - 8;
  const gap = 36 / (n + 1), k = Math.round(n * c.p), o: Shape[] = [
    { t: 'l', x1: x0, y1: 4, x2: x0, y2: 40, ink: 'rest', sw: 1.6 },
    { t: 'l', x1: x1, y1: 4, x2: x1, y2: 40, ink: 'rest', sw: 1.6 },
    { t: 'l', x1: x0 - 9, y1: 40, x2: x1 + 8, y2: 40, ink: 'rest', sw: 1.6 },
  ];
  for (let i = 0; i < n; i++) {
    const y = 4 + (i + 1) * gap, on = i < k;
    o.push({ t: 'l', x1: x0, y1: y, x2: x1, y2: y, ink: !on ? 'rest' : i === k - 1 ? 'signal' : 'live', sw: on ? 2.6 : 1.4 });
  }
  return o;
};

export const ANY: { id: string; n: string; d: string; build: Build }[] = [
  { id: 'odometer', n: 'Odometer', d: 'Four drums counting the real minutes and seconds down. The grey digit under each is what lands next.', build: odometer },
  { id: 'gauge', n: 'Dial', d: 'A 180° sweep with a needle over an engraved scale, so the whole period and the part left read together.', build: gauge },
  { id: 'leader', n: 'Leader', d: 'An academy countdown: the hand goes round, the number counts 8 down, then the run-out.', build: leader },
  { id: 'cassette', n: 'Transport', d: 'Supply spool empties, take-up spool fills, and the tape runs the length of the deck.', build: cassette },
  { id: 'graduated', n: 'Gauge glass', d: 'A graduated glass lit to the meniscus, scaled in real minutes. The quietest thing here.', build: graduated },
  { id: 'spiral', n: 'Spiral', d: 'One groove drawn to the playhead. It reads as a record and the eye follows it across.', build: spiral },
  { id: 'ladder', n: 'Ladder', d: 'Rungs to the ground. The lit rungs are the ones left, and the count follows the width.', build: ladder },
];

