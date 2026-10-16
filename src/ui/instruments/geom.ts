import type { P2 } from './types';

export const clamp01 = (v: number) => (v > 1 ? 1 : v < 0 ? 0 : v);
/** One decimal, the reference's own `F`. It does NOT hide NaN: `NaN.toFixed(1)` is "NaN", so a bad
 *  number reaches the rendered string and `bars.test.ts` sees it. */
export const F = (n: number) => +n.toFixed(1);

export const P = (x: number, y: number): P2 => [x, y];

export const poly = (pts: readonly P2[]) => pts.map((q, i) => `${i ? 'L' : 'M'}${F(q[0])} ${F(q[1])}`).join('');

export const polyLen = (pts: readonly P2[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return s;
};

/** `n` segments, `n+1` points, `t` running 0..1. */
export const sample = (n: number, f: (t: number) => P2): P2[] => Array.from({ length: n + 1 }, (_, i) => f(i / n));

/** Degrees, 0 at 3 o'clock, anticlockwise, y up — the orientation a gauge or a dial is read in. */
export const polar = (cx: number, cy: number, r: number, deg: number): P2 => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
};

export const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24) => sample(n, (t) => polar(cx, cy, r, a0 + (a1 - a0) * t));

/** A straight run of `n` segments from a to b, optionally bowed. Used where the reference draws a
 *  dashed line or a diagonal of unknown length: the length is measured, not assumed. */
export const straight = (a: P2, b: P2, bow = 0, n = 1): P2[] =>
  sample(n, (t) => [a[0] + (b[0] - a[0]) * t + bow, a[1] + (b[1] - a[1]) * t - bow * 4 * t * (1 - t)]);

/** Deterministic jitter for the market tape's price prints, so a tape is the same tape every mount. */
export const hash = (i: number, salt = 0) => {
  const s = Math.sin((i + salt) * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};
/**
 * NO CURVE COMMANDS. Every path this system emits is `M` / `L` / `Z` over sampled points.
 *
 * Arc flags (`A`), quadratics (`Q`/`T`) and cubics (`C`) all have uneven support across
 * react-native-svg's Android path parser, and there is no device in this project to verify them
 * against (qa/STATE.md — the phone is behind a pattern lock). A sampled polyline is exact to a
 * tenth of a pixel at these radii, costs one number per segment, and is the one path form the
 * renderer is known to handle. This is not a workaround: it is the only way to be able to say the
 * instruments are geometrically correct here rather than hoping.
 */
export const around = (cx: number, cy: number, r: number, a0: number, a1: number, n = 24): P2[] =>
  sample(Math.max(2, n), (t) => polar(cx, cy, r, a0 + (a1 - a0) * t));

/** The lens-shaped overlap of two equal circles, as points. `d` is the centre separation. */
export const lensPts = (x1: number, x2: number, cy: number, r: number, n = 16): P2[] => {
  const h = Math.sqrt(Math.max(0, r * r - ((x2 - x1) / 2) ** 2));
  const a = (Math.atan2(h, (x2 - x1) / 2) * 180) / Math.PI;
  return [...around(x1, cy, r, a, -a, n), ...around(x2, cy, r, 180 - a, 180 + a, n)];
};

/** A cubic segment as points. `pts` are the four control points P0..P3. */
export const cubicPts = (p0: P2, p1: P2, p2: P2, p3: P2, n = 18): P2[] =>
  sample(n, (t) => {
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  });

/** Bisect `f(a) === 0` on [lo,hi]. Used to FIND the equilibrium instead of assuming it, so the
 *  surplus region is drawn where the two curves actually meet at any band height. */
export const solve = (f: (t: number) => number, lo = 0, hi = 1, n = 24) => {
  let a = lo, b = hi, fa = f(a);
  for (let i = 0; i < n; i++) {
    const m = (a + b) / 2, fm = f(m);
    if (fa * fm <= 0) b = m;
    else { a = m; fa = fm; }
  }
  return (a + b) / 2;
};

/**
 * One arrowhead, one place. The reference draws seven of them at six different sizes and four
 * different shapes; a set of instruments only reads as a system if its caret is the same caret.
 * `size` is the base, `rise` the height.
 */
export const tri = (x: number, y: number, size: number, rise: number, dir: 'up' | 'down' | 'left' | 'right'): P2[] => {
  const h = size / 2, r = rise;
  switch (dir) {
    case 'up': return [[x - h, y], [x + h, y], [x, y - r]];
    case 'down': return [[x - h, y], [x + h, y], [x, y + r]];
    case 'right': return [[x, y - h], [x, y + h], [x + r, y]];
    case 'left': return [[x, y - h], [x, y + h], [x - r, y]];
  }
};

/** The system's downward caret: flat top at `y`, apex `size * 0.62` below it. */
export const caret = (x: number, y: number, size = 8) => poly(tri(x, y, size, size * 0.62, 'down')) + 'Z';
