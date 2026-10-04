/** Hand-drawn outline generator: CSS-style elliptical corner radii (with CSS's overflow scaling) + seeded wobble. Pure, no RN imports. */
export type Corners = { readonly h: readonly number[]; readonly v: readonly number[] };

/** CSS border-radius overflow rule: if adjacent radii exceed a side, every radius scales by the smallest factor. */
export function scaleRadii(c: Corners, w: number, h: number): { h: number[]; v: number[]; f: number } {
  const [tlx = 0, trx = 0, brx = 0, blx = 0] = c.h, [tly = 0, try_ = 0, bry = 0, bly = 0] = c.v;
  const f = Math.min(1, ...[[w, tlx + trx], [w, blx + brx], [h, tly + bly], [h, try_ + bry]].map(([side, sum]) => (sum ? (side as number) / (sum as number) : 1)));
  return { h: [tlx, trx, brx, blx].map((x) => x * f), v: [tly, try_, bry, bly].map((x) => x * f), f };
}
const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Points along the rounded-rect perimeter (clockwise from top-left), `step` px apart. */
export function outline(w: number, h: number, c: Corners, step = 7): [number, number][] {
  const r = scaleRadii(c, w, h), [tlx = 0, trx = 0, brx = 0, blx = 0] = r.h, [tly = 0, try_ = 0, bry = 0, bly = 0] = r.v, pts: [number, number][] = [];
  const line = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step)); for (let i = 0; i < n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]); };
  const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) => { const n = Math.max(2, Math.round((Math.max(rx, ry) * Math.abs(a1 - a0)) / step)); for (let i = 0; i < n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } };
  const P = Math.PI;
  arc(tlx, tly, tlx, tly, P, 1.5 * P); line(tlx, 0, w - trx, 0);
  arc(w - trx, try_, trx, try_, 1.5 * P, 2 * P); line(w, try_, w, h - bry);
  arc(w - brx, h - bry, brx, bry, 0, 0.5 * P); line(w - brx, h, blx, h);
  arc(blx, h - bly, blx, bly, 0.5 * P, P); line(0, h - bly, 0, tly);
  return pts;
}
/** A closed SVG path with low-frequency wobble: neighbouring points move together so the edge reads as a hand-cut line, not noise. */
export function handPath(w: number, h: number, c: Corners, seed: number, amp = 1.1): string {
  if (w < 2 || h < 2) return '';
  const pts = outline(w, h, c), n = pts.length, r = rnd(seed), K = Math.max(6, Math.round(n / 9));
  const ctrl = Array.from({ length: K + 1 }, () => [r() * 2 - 1, r() * 2 - 1] as const);
  const at = (i: number) => { const u = (i / n) * K, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f), a = ctrl[k % K]!, b = ctrl[(k + 1) % K]!; return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s] as const; };
  let d = '';
  pts.forEach(([x, y], i) => { const [dx, dy] = at(i), X = Math.min(w, Math.max(0, x + dx * amp)), Y = Math.min(h, Math.max(0, y + dy * amp)); d += `${i ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)}`; });
  return d + 'Z';
}
export const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
