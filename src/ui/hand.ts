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
  /* The wobble is capped on small boxes (v0.5 U2). Scissors wander about as far on a chip as on a card,
     so the same ±1.1 dp that reads as a hand-cut edge on a 300 dp card read as a shaky, broken line on a
     32 dp chip. Below 44 dp on the short side the amplitude scales down with it. */
  amp *= Math.min(1, Math.min(w, h) / 44);
  const pts = outline(w, h, c), n = pts.length, r = rnd(seed), K = Math.max(6, Math.round(n / 9));
  const ctrl = Array.from({ length: K + 1 }, () => [r() * 2 - 1, r() * 2 - 1] as const);
  const at = (i: number) => { const u = (i / n) * K, k = Math.floor(u), f = u - k, s = f * f * (3 - 2 * f), a = ctrl[k % K]!, b = ctrl[(k + 1) % K]!; return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s] as const; };
  let d = '';
  pts.forEach(([x, y], i) => { const [dx, dy] = at(i), X = Math.min(w, Math.max(0, x + dx * amp)), Y = Math.min(h, Math.max(0, y + dy * amp)); d += `${i ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)}`; });
  return d + 'Z';
}
export const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/**
 * A strip of tape torn off the roll (v0.5 U2): long edges straight (it was cut along the roll), short
 * ends torn — a fine, irregular zigzag a couple of dp deep, different at each end and stable per seed.
 */
export function tornTape(w: number, h: number, seed: number): string {
  if (w < 8 || h < 4) return '';
  const r = rnd(seed), DEPTH = 2.4, STEP = 2.6;
  const end = (x: number, dir: 1 | -1) => {
    const pts: string[] = [];
    const n = Math.max(3, Math.round(h / STEP));
    for (let i = 1; i < n; i++) { const y = dir === 1 ? (i * h) / n : h - (i * h) / n; pts.push(`L${(x + dir * -1 * r() * DEPTH).toFixed(1)} ${y.toFixed(1)}`); }
    return pts.join('');
  };
  const l = DEPTH, rgt = w - DEPTH;
  return `M${l.toFixed(1)} 0L${rgt.toFixed(1)} 0${end(rgt + DEPTH * 0.5, 1)}L${rgt.toFixed(1)} ${h}L${l.toFixed(1)} ${h}${end(l - DEPTH * 0.5, -1)}Z`;
}

/**
 * A torn paper edge (the collage look). Real torn paper wanders at three scales — the hand's pull, the
 * fibres giving way in clumps, and the single fibres — and it tears INWARD from where a cut would have
 * been, so the shape stays inside its box. Returns the face and, torn by a different hand of the same
 * paper, the white core that shows along the tear wherever the face's tear ran further in.
 *
 * Pure and memoisable per (w, h, seed): the edge is stable across renders, so a card tears the same way
 * every time it is drawn.
 */
export function tornPaths(w: number, h: number, seed: number, depth = 2.4, corner = 5): { face: string; core: string } {
  if (w < 8 || h < 8) return { face: '', core: '' };
  const c = { h: [corner, corner * 0.6, corner, corner * 0.8], v: [corner * 0.8, corner, corner * 0.6, corner] };
  const pts = outline(w, h, c, 2.6), n = pts.length, r = rnd(seed);
  /* 1-D value noise around the perimeter, wrapping: periodic so the start of the path meets its end. */
  const octave = (period: number) => { const k = Math.max(3, Math.round(n / period)), v = Array.from({ length: k }, () => r()); return (i: number) => { const u = (i / n) * k, a = Math.floor(u), f = u - a, s = f * f * (3 - 2 * f); return (v[a % k]! * (1 - s) + v[(a + 1) % k]! * s); }; };
  const big = octave(26), mid = octave(8), fine = octave(2.4), rimA = octave(14), rimB = octave(4);
  const faceD = new Array<number>(n), coreD = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const tear = depth * (0.95 * big(i) + 0.55 * mid(i) + 0.4 * fine(i) + 0.15 * r());
    faceD[i] = tear;
    /* The core tears with the face but not exactly: where its own noise runs ahead it is hidden under the
       face, where it lags it shows as a white lip up to ~1.6 depth wide. */
    coreD[i] = Math.max(0, tear - depth * (1.25 * rimA(i) + 0.45 * rimB(i) - 0.55));
  }
  const path = (d: number[]) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = pts[i]!, [x0, y0] = pts[(i - 1 + n) % n]!, [x1, y1] = pts[(i + 1) % n]!;
      const tx = x1 - x0, ty = y1 - y0, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const X = Math.min(w, Math.max(0, x + nx * d[i]!)), Y = Math.min(h, Math.max(0, y + ny * d[i]!));
      s += `${i ? 'L' : 'M'}${X.toFixed(1)} ${Y.toFixed(1)}`;
    }
    return s + 'Z';
  };
  return { face: path(faceD), core: path(coreD) };
}

/**
 * One torn EDGE across a width (a divider, the top of a sheet laid over art): the face's edge and, torn a
 * little behind it, the white core that shows along it. Both are open polylines from x = 0 to x = w at a
 * base height of `depth`; callers close them into whatever shape they fill. Pure and stable per seed.
 */
export function tornEdge(w: number, seed: number, depth = 6): { face: [number, number][]; core: [number, number][] } {
  if (w < 4) return { face: [], core: [] };
  const r = rnd(seed), n = Math.max(8, Math.round(w / 2.6));
  const octave = (len: number) => { const k = Math.max(2, Math.round(n / len)), v = Array.from({ length: k + 1 }, () => r()); return (i: number) => { const u = (i / n) * k, a = Math.floor(u), f = u - a, s = f * f * (3 - 2 * f); return v[a]! * (1 - s) + v[Math.min(k, a + 1)]! * s; }; };
  const big = octave(40), mid = octave(11), fine = octave(3), rim = octave(18);
  const face: [number, number][] = [], core: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w, y = depth * (0.9 * big(i) + 0.5 * mid(i) + 0.35 * fine(i) + 0.12 * r());
    face.push([x, y]);
    core.push([x, Math.max(0, y - depth * (0.2 + 0.9 * rim(i)))]);
  }
  return { face, core };
}
