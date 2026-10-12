import { DIAL, SECOND, type Colors } from '../../tokens/theme';

/**
 * Dial engine — a TypeScript port of the clock-variations engine. Pure: it returns SVG strings (viewBox -100 -100 200 200 unless noted),
 * so the same code draws the live clock, the Settings thumbnails and the Focus dial, and can be rendered offline in tests.
 * Surviving faces: g, rb, c, sl, s. Dropped as duplicates: f (≈g), gn, gn2 (≈s). `or` (Onyx Rosette, dial 07) was dropped
 * as ≈rb but is being re-cut against the page for the preview in design/preview-03-07 — its branches below are live for
 * rendering that preview while FACES still ships the original five; it joins FACES only after that review, at which point
 * this line and faces.test.ts's pinned id list change together.
 */
export interface Pal { ink: string; dial: string; accent: string; second: string }
export interface FaceSpec { id: FaceId; n: string; native: 'light' | 'dark'; ns: number; nr: number; tk: 'line' | 'dot'; rings: number[]; nosec?: boolean; drop6?: boolean }
export type FaceId = 'g' | 'rb' | 'c' | 'sl' | 's' | 'or';
export const FACES: FaceSpec[] = [
  { id: 'g', n: 'Guilloché Ivory', native: 'light', ns: 12.5, nr: 68, tk: 'line', rings: [58] },
  { id: 'rb', n: 'Rosette Blanc', native: 'light', ns: 11.5, nr: 75, tk: 'line', rings: [62, 58] },
  { id: 'c', n: 'Celtic Knot', native: 'dark', ns: 12, nr: 74, tk: 'line', rings: [60, 56] },
  { id: 'sl', n: 'Scales and Lily', native: 'dark', ns: 11, nr: 75, tk: 'dot', rings: [62], nosec: true, drop6: true },
  { id: 's', n: 'Skeleton Movement', native: 'dark', ns: 11, nr: 78, tk: 'line', rings: [] },
];
export const faceById = (id: string): FaceSpec => FACES.find((f) => f.id === id) ?? (FACES[1] as FaceSpec);
/** Dial palette for a face in a theme. The GROUND is a material, not a theme surface — see `DIAL` in
 *  tokens/theme.ts — so every face is white enamel in light and black lacquer in dark, and the two themes
 *  are genuinely different instruments rather than one being a filtered version of the other. `native` then
 *  only decides how the ENGRAVING reads on that ground, not what the ground is: the same cut is a dark
 *  line in white and a bright line in black. `second` is the sweep hand, red-brown per prompt.md V4 for
 *  the same reason — a material, not `acc`, because the pale peach `acc` becomes in the dark palette reads
 *  as grey at hairline width.
 *
 *  `native` is still in the signature, and still unused by the body, because `FaceSpec.native` is the thing
 *  that distinguishes the two light-native faces from the three dark-native ones — the picker groups by it and
 *  `faces.test.ts` asserts the grouping. Removing it would decouple the palette from the face's declared
 *  nature for no gain. */
export function dialPal(f: Pick<FaceSpec, 'native'>, c: Colors, dark: boolean): Pal {
  void f;
  return { ink: c.ink, dial: dark ? DIAL.dark : DIAL.light, accent: c.acc, second: dark ? SECOND.dark : SECOND.light };
}

const PI = Math.PI, f1 = (v: number) => +v.toFixed(1), f2 = (v: number) => +v.toFixed(2);
const P = (r: number, a: number): [number, number] => [r * Math.sin(a), -r * Math.cos(a)];
const each = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const svg = (body: string, vb = '-100 -100 200 200') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${body}</svg>`;
const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) as number);
/** Flat tone `t` of the way from the dial to the ink. Ornament is stroked at full opacity in this pre-mixed
 *  colour rather than as translucent ink: overlapping strokes then paint the same tone instead of stacking alpha,
 *  which is what turned the old 20-ellipse guilloché into a grey cloud, and one drawing now reads identically on a
 *  cream dial and an onyx one. `t` keeps the meaning of the old `stroke-opacity`. */
export const engrave = (pal: Pal, t: number) => {
  const [a, b] = [chan(pal.ink), chan(pal.dial)];
  return `#${a.map((v, i) => Math.round(v * t + (b[i] as number) * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
};

/* ── render-size compensation ────────────────────────────────────────────────────────────────────────────────────
   Everything below is drawn into one fixed 200-unit box, so a stroke of `u` units is `u * px / 200` device
   pixels wide. The html engine compensated for this with `const u=200/px, w=x=>max(x,u*.5)` and the same floor on
   dot radii and on the numeral size. The port dropped the render size entirely, which is why 48 chapter ticks at
   0.9 units were being drawn 0.43 px wide in the 96 dp Settings picker: sub-pixel, so the rasteriser stippled each
   one into a broken dash, and 48 broken dashes in a ring is grain. Geometry is identical at every size — only weight
   changes, the way an engraver cuts a deeper line on a smaller plate. */
const U = (px: number) => 200 / Math.max(40, px);
/** half a device pixel, in viewBox units */
export const hair = (px: number) => f2(U(px) * 0.5);
export const sw = (px: number, u: number) => f2(Math.max(u, hair(px)));
export const dot = (px: number, r: number) => f2(Math.max(r, U(px) * 0.55));
/** numerals are type, not ornament: below ~8 device px they stop being legible and start being a smudge */
export const num = (px: number, ns: number) => f2(Math.max(ns, U(px) * 8));

/** Engraving tone hierarchy. `engrave` pre-mixes ink into the dial so a stroke is flat and overlaps never stack —
 *  but a ramp still has to be a ramp, or every element reads as one grey mass. STRUCTURE carries the marks you read
 *  (case, chapter ring, numerals, hands); FIGURE is the ornament you look at; SUB is a rule inside the figure; TEXTURE
 *  is a ground pattern meant to sit behind the figure and never in front of it. */
export const TONE = { structure: 0.92, figure: 0.82, sub: 0.72, texture: 0.62 } as const;
/** Flat tone in a single flat `stroke` — right for sparse ornament, which is most of the dial.
 *  DENSE meshes (the guilloché, the rosette lattices) cannot use it: 30 overlapping circles cover the disc they sit
 *  on several times over, and one opaque tone collapses that into a grey puddle. Those are wrapped in a single
 *  `<g opacity>` instead, so the group composites once and the mesh's own crossings do not stack — which is exactly
 *  what the html engine did and the only way to keep a weave reading as a weave. */
const mesh = (body: string, a: number) => `<g opacity="${a}">${body}</g>`;

/* ── real involute gearing (module m, 20° pressure angle): flanks from the involute function, tooth-on-space phasing solved per train ── */
const PA = (20 * PI) / 180, COS_PA = Math.cos(PA), INV_PA = Math.tan(PA) - PA;
const psi = (rb: number, r: number) => { const a = Math.acos(Math.min(1, rb / r)); return Math.tan(a) - a; };
export interface Gear { n: number; m: number; x: number; y: number; w: number; ph: number; t: number; spokes: number; jewel?: boolean }
export function gearGeometry(g: Pick<Gear, 'n' | 'm'>) { const rp = (g.m * g.n) / 2, rb = rp * COS_PA, ra = rp + g.m; let rf = rp - 1.25 * g.m; if (rf < rb * 0.8) rf = rb * 0.8; return { rp, rb, ra, rf }; }
export function toothPath(g: Gear): string {
  const { rp, rb, ra, rf } = gearGeometry(g), n = g.n, r0 = Math.max(rb, rf), A = PI / (2 * n) + INV_PA, t0 = A - psi(rb, r0), tp = A - psi(rb, ra), w = (2 * PI) / n, ph = (g.ph * PI) / 180, S = 6;
  let d = '';
  void rp;
  for (let i = 0; i < n; i++) {
    const a = ph + i * w; let p = P(rf, a - t0); d += `M${f1(p[0])} ${f1(p[1])}`; p = P(r0, a - t0); d += `L${f1(p[0])} ${f1(p[1])}`;
    for (let k = 1; k <= S; k++) { p = P(r0 + ((ra - r0) * k) / S, a - t0 + ((t0 - tp) * k) / S); d += `L${f1(p[0])} ${f1(p[1])}`; }
    p = P(ra, a + tp); d += `A${f1(ra)} ${f1(ra)} 0 0 1 ${f1(p[0])} ${f1(p[1])}`;
    for (let k = S - 1; k >= 0; k--) { p = P(r0 + ((ra - r0) * k) / S, a + t0 - ((t0 - tp) * k) / S); d += `L${f1(p[0])} ${f1(p[1])}`; }
    p = P(rf, a + t0); d += `L${f1(p[0])} ${f1(p[1])}`; p = P(rf, a + w - t0); d += `A${f1(rf)} ${f1(rf)} 0 0 1 ${f1(p[0])} ${f1(p[1])}`;
  }
  return d + 'Z';
}
const ring = (x: number, y: number, r: number) => `M${f1(x + r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0Z`;
/** crossing-work: k windows between k spokes, like a real skeletonised wheel */
function windows(rin: number, rout: number, k: number, spoke: number, ph: number): string {
  if (rout - rin < 1.6) return '';
  const rm = (rin + rout) / 2, gap = spoke / (2 * rm), a = (ph * PI) / 180; let d = '';
  for (let i = 0; i < k; i++) {
    const a0 = a + (i * 2 * PI) / k + gap, a1 = a + ((i + 1) * 2 * PI) / k - gap, o0 = P(rout, a0), o1 = P(rout, a1), i1 = P(rin, a1), i0 = P(rin, a0);
    d += `M${f1(o0[0])} ${f1(o0[1])}A${f1(rout)} ${f1(rout)} 0 0 1 ${f1(o1[0])} ${f1(o1[1])}L${f1(i1[0])} ${f1(i1[1])}A${f1(rin)} ${f1(rin)} 0 0 0 ${f1(i0[0])} ${f1(i0[1])}Z`;
  }
  return d;
}
/** One wheel as a self-contained SVG centred on its own axis (so the host can rotate it about its centre). */
export function gearSvg(g: Gear, pal: Pal): { svg: string; R: number } {
  const { rp, rf, ra } = gearGeometry(g), hub = Math.max(1.4, rp * 0.2), rim = rf - Math.max(0.9, g.m * 0.5), R = ra + 1.5;
  const body = `${toothPath(g)}${ring(0, 0, hub)}${g.spokes > 0 ? windows(hub * 1.9 + 0.6, rim, g.spokes, Math.max(1.1, g.m * 0.7), g.ph) : ''}`;
  const jewel = g.jewel ? `<circle r="${f1(hub * 0.62)}" fill="${pal.accent}" stroke="${engrave(pal, .95)}" stroke-width=".5"/><path d="M${f1(-hub * 0.5)} 0H${f1(hub * 0.5)}" stroke="${pal.dial}" stroke-width=".55"/>` : `<circle r="${f1(hub * 0.5)}" fill="${engrave(pal, .95)}"/>`;
  return { R, svg: svg(`<path d="${body}" fill="${engrave(pal, Math.min(1, g.t + 0.3))}" stroke="${engrave(pal, .95)}" stroke-width="1.4" fill-rule="evenodd"/><circle r="${f1(rim)}" fill="none" stroke="${engrave(pal, .7)}" stroke-width="1"/>${jewel}`, `${-R} ${-R} ${2 * R} ${2 * R}`) };
}
/** Balance wheel + hairspring, oscillating — the part that makes a movement read as a movement. */
export function balanceSvg(pal: Pal): { svg: string; R: number } {
  const R = 13; let spring = ''; for (let i = 0; i <= 60; i++) { const a = i * 0.34, r = 2 + (i / 60) * 6.5, p = P(r, a); spring += `${i ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`; }
  const spokes = each(3, (i) => { const p = P(11.2, (i * 2 * PI) / 3), q = P(2.2, (i * 2 * PI) / 3); return `M${f1(q[0])} ${f1(q[1])}L${f1(p[0])} ${f1(p[1])}`; });
  return { R, svg: svg(`<circle r="11.4" fill="none" stroke="${engrave(pal, .95)}" stroke-width="2"/><path d="${spokes}" stroke="${engrave(pal, .95)}" stroke-width="1.5" fill="none"/><path d="${spring}" fill="none" stroke="${engrave(pal, .85)}" stroke-width=".8"/>${each(4, (i) => { const p = P(11.4, (i * PI) / 2 + 0.4); return `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r=".9" fill="${pal.accent}"/>`; })}<circle r="1.5" fill="${pal.accent}" stroke="${engrave(pal, .95)}" stroke-width=".45"/>`, `${-R} ${-R} ${2 * R} ${2 * R}`) };
}
/* Skeleton movement: four wheels, module 2, solved so centre distance = rp+rp and a tooth meets a space at every contact (verified in tests). */
const RAW: Omit<Gear, 'ph'>[] = [
  { n: 16, m: 2, x: -18, y: 12, t: 0.5, w: 18, spokes: 4, jewel: true },
  { n: 10, m: 2, x: 8, y: 12, t: 0.62, w: -28.8, spokes: 0 },
  { n: 12, m: 2, x: 22.1413, y: -4.853, t: 0.4, w: 24, spokes: 3, jewel: true },
  { n: 9, m: 2, x: -8.4329, y: 35.097, t: 0.55, w: -32, spokes: 0 },
];
const frac = (v: number) => v - Math.floor(v);
/** Phase of `b` so a tooth of `a` sits in a space of `b` along the line of centres. Bearings are screen degrees; tooth i of a wheel sits at ph + i·w − 90°. */
export function meshPhase(a: Gear, b: Omit<Gear, 'ph'>): number {
  const wa = 360 / a.n, wb = 360 / b.n, line = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / PI, fa = frac((line - (a.ph - 90)) / wa);
  const ph = line + 180 + 90 - wb * frac(0.5 - fa);
  return ((ph % wb) + wb) % wb;
}
export const meshFractions = (a: Gear, b: Gear) => {
  const wa = 360 / a.n, wb = 360 / b.n, line = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / PI;
  return { fa: frac((line - (a.ph - 90)) / wa), fb: frac((line + 180 - (b.ph - 90)) / wb) };
};
export const MESHES: [number, number][] = [[0, 1], [1, 2], [0, 3]];
export const SKELETON: Gear[] = (() => {
  const g: Gear[] = []; g[0] = { ...(RAW[0] as Omit<Gear, 'ph'>), ph: 0 };
  for (const [a, b] of MESHES) g[b] = { ...(RAW[b] as Omit<Gear, 'ph'>), ph: meshPhase(g[a] as Gear, RAW[b] as Omit<Gear, 'ph'>) };
  return g;
})();
export const BALANCE = { x: 29, y: 33, period: 0.8, swing: 105 };

export interface SpinLayer { key: string; x: number; y: number; R: number; svg: string; dps: number; osc?: { swing: number; period: number } }

/* ── the two light-native centre figures, restored from the html engine (qa/COORDINATION.md §6 names it the source
   of truth for centre spinning artifacts). Both are drawn to a 48-unit radius so they fill the middle of the dial up
   to just inside the chapter ring, and both thin out as the render size drops. ──
   A 20-lattice guilloché cannot be read in 96 pixels: at half a pixel per line the crossings merge and the weave
   becomes a flat grey disc — the same disease as the stippled tick ring, one octave in. A rose engine solves this the
   same way a real one does: a small plate gets a simpler cut. So the line count steps down with the plate and the
   weight steps up to keep the figure reading as lines, and at 96 dp the owner gets eight bold lobes rather than a
   smudge. What changes between sizes is the CUT, not the design: same ellipses, same centres, same two rosette
   lattices, fewer of them. ── */
const detail = (px: number, full: number, mid: number, small: number) => (px >= 260 ? full : px >= 150 ? mid : small);
export const ART = {
  /** Guilloché: long ellipses on a common centre, evenly stepped — what a rose engine cuts. */
  guilloche: (pal: Pal, px: number) => {
    const n = detail(px, 20, 14, 8);
    return mesh(`<g fill="none" stroke="${pal.ink}" stroke-width="${sw(px, 1.05)}">${each(n, (i) => `<ellipse rx="46" ry="18" transform="rotate(${i * (360 / n)})"/>`)}</g>`, n <= 8 ? 0.82 : n <= 14 ? 0.72 : 0.62);
  },
  /** Rosette Blanc's outer scallop, turning with the hour. */
  latOut: (pal: Pal, px: number) => {
    const n = detail(px, 18, 14, 10);
    return mesh(`<g fill="none" stroke="${pal.ink}" stroke-width="${sw(px, 1.05)}">${each(n, (i) => `<circle cy="-26" r="22" transform="rotate(${i * (360 / n)})"/>`)}</g>`, n <= 10 ? 0.78 : n <= 14 ? 0.72 : 0.66);
  },
  /** and its inner scallop, half a step round and smaller, turning against it. */
  latIn: (pal: Pal, px: number) => {
    const n = detail(px, 12, 9, 6);
    return mesh(`<g fill="none" stroke="${pal.ink}" stroke-width="${sw(px, 1.05)}">${each(n, (i) => `<circle cy="-21" r="17" transform="rotate(${i * (360 / n) + 180 / n})"/>`)}</g>`, n <= 6 ? 0.74 : n <= 9 ? 0.66 : 0.58);
  },
} as const;
/** shared outline of both rosette lattices, so a layer's viewBox is sized from the figure and not guessed */
export const ART_R = 48;

/* ── the Focus dial's escapement ────────────────────────────────────────────────────────────────────────────
   A countdown has three invariants, and they are why it is a mechanism and not a pulse: a mechanism's motion is
   *continuous and derived* (so the wheel's angle comes from the clock, not from a render), *the tick is discrete*
   (so the wheel is locked and released once a second), and *an expansion that is the same shape in both directions
   is a breath* (so nothing scales). These two functions are the whole of that arithmetic, kept pure so the numbers
   the screen runs on every frame can be asserted without a renderer. */
export const ESC_TEETH = 30, ESC_DEG = 360 / ESC_TEETH;
/** degrees the wheel has turned after `elapsedSec`, one tooth per second: continuous, derived, monotonic.
 *
 *  **The `'worklet'` directives on these three are load-bearing, not decoration.** `Focus.tsx`'s escapement
 *  style and `ClockFace`'s frame callback both run on the UI runtime, and a plain JS function captured in a
 *  worklet closure is serialised as a *remote* function — calling it from the UI thread then throws
 *  `[Worklets] Tried to synchronously call a Remote Function`. That is not a warning; it took the whole app
 *  down on the first frame of the live clock, and `handAngles` was introduced by `eac2a65` ("DST clock")
 *  with the same mistake, so neither had ever run on a phone. `src/test/worklet-hosts.test.ts` asserts the
 *  directive is present on everything a worklet closes over, and reads it from the real Metro bundle when
 *  one is reachable, because `tsc` and `jest` both pass straight over this. */
export const escapementTurn = (elapsedSec: number) => {
  'worklet';
  return elapsedSec * ESC_DEG;
};
/** the rendered angle: the turn, wound back by the release. `kick` runs 0 → 1 → −0.42 → 0 over 190 ms. */
export const escapementAngle = (elapsedSec: number, kick = 0) => {
  'worklet';
  return -escapementTurn(elapsedSec) + kick * 1.7;
};

/* ── Onyx Rosette (dial 07) — the candidate under review in design/preview-03-07 ─────────────────────────────
   The centre figure is three parts, all of which the page turns: 16 petals in two passes (a 12% wash and a 28%
   hairline of the same ellipses) at +24 dps, a 24-tooth wheel at −24 dps, and the wheel's hub. The hub circle is
   drawn AFTER the gear on the page; `plateSvg` draws `staticSvg` before the layers, so a static hub here would sit
   under the wheel's fill and never be seen — and it is a circle, which a rotation does not move, so keeping it in
   the wheel layer costs nothing. */
const onyxWheel = (): string => {
  const g = { n: 24, m: 2, ph: 0 }, { rp, rf } = gearGeometry(g);
  const hb = rp * 0.2, ri = rf - Math.max(g.m * 0.5, 0.6), band = ri - hb;
  let d = toothPath({ ...g, x: 0, y: 0, w: -24, t: 0.14, spokes: 0 }) + ring(0, 0, hb);
  if (band > 3) {
    const kk = band > 5.4 ? 6 : band > 4.2 ? 5 : 4, ro = (hb + ri) / 2, hr = band * 0.3;
    for (let i = 0; i < kk; i++) { const p = P(ro, (g.ph * PI) / 180 + (i * 2 * PI) / kk); d += ring(p[0], p[1], hr); }
  }
  return d;
};
const ONYX_WHEEL_R = gearGeometry({ n: 24, m: 2 }).ra + 1.5;

/** Layers that move on their own (gear trains, rosettes, the balance wheel, the Scales sub-seconds). */
export function spinLayers(id: FaceId, pal: Pal, px = 200): SpinLayer[] {
  // Guilloché's 20-ellipse weave is the ground and stays still — a rotating mesh of that density swims against itself
  // and shimmers at 96 dp, and a rose-engine dial is a finished cut, not a moving part. The movement on this face is
  // the 12-spoke centre wheel turning against a still ground, at −6 dps: under a third of the 30° repeat of a 12-fold
  // figure, so it reads as a slow deliberate turn and cannot alias against its own spokes. Straight arms only — a real
  // guilloché is a straight-line weave, unlike Rosette Blanc's petals.
  if (id === 'g') {
    const R = 31, arms = `<g fill="none" stroke="${engrave(pal, TONE.figure)}" stroke-width="${sw(px, 2)}">${each(12, (i) => `<line y1="-10" y2="-27" transform="rotate(${i * 30})"/>`)}<circle r="27" stroke-width="${sw(px, 1.6)}"/></g>`;
    return [{ key: 'sun', x: 0, y: 0, R, svg: svg(arms, `${-R} ${-R} ${2 * R} ${2 * R}`), dps: -6 }];
  }
  // Rosette Blanc: the two lattices counter-rotate at equal and opposite speed (prompt.md V4), which is the whole
  // point of the figure — the weave is only alive while they slide through each other.
  if (id === 'rb') {
    const R = ART_R + 1;
    return [
      { key: 'r1', x: 0, y: 0, R, svg: svg(ART.latOut(pal, px), `${-R} ${-R} ${2 * R} ${2 * R}`), dps: 12 },
      { key: 'r2', x: 0, y: 0, R, svg: svg(ART.latIn(pal, px), `${-R} ${-R} ${2 * R} ${2 * R}`), dps: -12 },
    ];
  }
  if (id === 's') {
    const out: SpinLayer[] = SKELETON.map((g, i) => { const s = gearSvg(g, pal); return { key: `g${i}`, x: g.x, y: g.y, R: s.R, svg: s.svg, dps: g.w }; });
    const b = balanceSvg(pal); out.push({ key: 'bal', x: BALANCE.x, y: BALANCE.y, R: b.R, svg: b.svg, dps: 0, osc: { swing: BALANCE.swing, period: BALANCE.period } });
    return out;
  }
  if (id === 'sl') {
    const R = 15, body = `<circle r="14" fill="${pal.dial}"/><circle r="14" fill="none" stroke="${engrave(pal, .85)}" stroke-width="${sw(px, 1.4)}"/>${each(12, (i) => `<line y1="-12.5" y2="-10.5" stroke="${engrave(pal, .85)}" stroke-width="${sw(px, 1)}" transform="rotate(${i * 30})"/>`)}<path d="M0 3V-11" stroke="${pal.second}" stroke-width="${sw(px, 1.2)}" stroke-linecap="round"/><circle r="1.3" fill="${pal.second}"/>`;
    return [{ key: 'sub', x: 0, y: 36, R, svg: svg(body, `${-R} ${-R} ${2 * R} ${2 * R}`), dps: 6 }];
  }
  if (id === 'or') {
    const R = 47, ell = (i: number) => `<ellipse rx="46" ry="15" transform="rotate(${i * 11.25})"/>`;
    // two passes of one figure, each composited once as a group so the crossings inside a pass do not stack —
    // the same reason `ART.latOut` is a `mesh` (see the comment on `mesh`)
    const petal = mesh(`<g fill="${pal.ink}" stroke="none">${each(16, ell)}</g>`, 0.12) +
      mesh(`<g fill="none" stroke="${pal.ink}" stroke-width="${sw(px, 0.6)}">${each(16, ell)}</g>`, 0.28);
    const flat = engrave(pal, 0.14);
    const wheel = `<path d="${onyxWheel()}" fill="${flat}" stroke="${flat}" stroke-width="${sw(px, 0.5)}" fill-rule="evenodd"/>` +
      `<circle r="9" fill="none" stroke="${engrave(pal, 0.3)}" stroke-width="${sw(px, 1)}"/>`;
    const R2 = ONYX_WHEEL_R;
    return [
      { key: 'petal', x: 0, y: 0, R, svg: svg(petal, `${-R} ${-R} ${2 * R} ${2 * R}`), dps: 24 },
      { key: 'wheel', x: 0, y: 0, R: R2, svg: svg(wheel, `${-R2} ${-R2} ${2 * R2} ${2 * R2}`), dps: -24 },
    ];
  }
  return [];
}
/**
 * The fixed part of a face: case, dial, chapter ring, ornament, numerals.
 *
 * `uid` suffixes the one element id this emits (Scales and Lily's `clipPath id="sc"`), because two copies of a
 * face can be mounted at once — the live clock on Today and its thumbnail in Settings → Clock face, which is
 * exactly the case `prompt.md` R11 describes and which `inMountWindow` made permanent by keeping two screens
 * mounted by design. `useId()` is the source, sanitised by `ClockFace.tsx` to an XML-legal name; the default is
 * a literal so the offline render and the tests keep a stable filename.
 */
export function staticSvg(f: FaceSpec, pal: Pal, font: string, px = 200, uid = 'a'): string {
  const ink = pal.ink, o = (t: number) => `stroke="${engrave(pal, t)}" fill="none"`;
  let orn = '';
  if (f.id === 'g') orn = `${ART.guilloche(pal, px)}<circle r="30" ${o(TONE.sub)} stroke-width="${sw(px, 1.1)}"/>`;
  if (f.id === 'c') orn = `<g ${o(TONE.figure)} stroke-width="${sw(px, 6.4)}">${each(3, (i) => `<circle cy="-16" r="30" transform="rotate(${i * 120})"/>`)}</g><g fill="none" stroke="${pal.dial}" stroke-width="${sw(px, 2)}">${each(3, (i) => `<circle cy="-16" r="30" transform="rotate(${i * 120})"/>`)}</g><circle r="7" ${o(TONE.structure)} stroke-width="${sw(px, 3)}"/>`;
  if (f.id === 'sl') {
    // the scale ground thins with the plate for the same reason the guilloché does: 576 half-pixel arcs in a
    // 96 dp dial is a grey disc, so a smaller plate gets a coarser scale
    // The tiers below 150 were not fine ENOUGH. Each arc is one native view on Android and one DOM node on
    // web, and at masthead/thumbnail size the ground was 256 of them — a quarter of everything the Settings
    // clock picker mounts at once, drawn at a pitch the eye resolves as flat grey anyway. Coarsening it is
    // therefore the rare change that is both the cheaper one and the cleaner drawing: measured at 96 dp,
    // 256 arcs -> 121.
    const s = 6.2 * (px < 130 ? 2.1 : px < 150 ? 1.55 : px < 260 ? 1.2 : 1), rows = px < 130 ? 11 : px < 260 ? 16 : 24;
    const band = each(rows, (j) => { const y = -64 + (j * (128 / rows)); const off = j % 2 ? s : 0; return each(rows, (i) => { const x = -66 + i * s * 2 + off; return `<path d="M${f1(x - s)} ${f1(y)}a${s} ${s} 0 0 0 ${2 * s} 0"/>`; }); });
    orn = `<clipPath id="sc${uid}"><circle r="62"/></clipPath><g clip-path="url(#sc${uid})" ${o(TONE.texture)} stroke-width="${sw(px, .9)}">${band}</g><g transform="translate(0 -38)" fill="${engrave(pal, TONE.structure)}"><path d="M0 -8C-5 -3-5 4 0 8 5 4 5 -3 0 -8Z"/><path d="M-3 6C-10 4-13-4-8-8-8-3-6 1-2 3ZM3 6C10 4 13-4 8-8 8-3 6 1 2 3Z"/><rect x="-5" y="7" width="10" height="1.6" rx=".8"/></g>`;
  }
  if (f.id === 's') {
    // the plate under the movement — pitch circles, bridge, jewel slits. Not the wheels: `gearSvg`/`balanceSvg` are
    // locked by qa/COORDINATION.md §3 and are deliberately left at their own weights (see clock-engine.test.ts).
    const gz = SKELETON.map((g) => gearGeometry(g));
    orn = `<g ${o(0.5)} stroke-width="${sw(px, .9)}">${SKELETON.map((g, i) => `<circle cx="${g.x}" cy="${g.y}" r="${f1((gz[i]?.rp ?? 0))}" stroke-dasharray="1 1.4"/>`).join('')}<circle cx="${BALANCE.x}" cy="${BALANCE.y}" r="13.5" stroke-dasharray="1 1.4"/></g>` +
      `<path d="M-46 -26Q0 -58 46 -26" ${o(0.8)} stroke-width="${sw(px, 5)}" stroke-linecap="round"/><path d="M-46 -26Q0 -58 46 -26" fill="none" stroke="${pal.dial}" stroke-width="${sw(px, 1.4)}" stroke-linecap="round"/>` +
      [[-44, -27], [44, -27], [0, -42]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="2.7" fill="${engrave(pal, .95)}"/><path d="M-1.8 -1.2L1.8 1.2" stroke="${pal.dial}" stroke-width="${sw(px, .6)}"/></g>`).join('') +
      `<path d="M-56 22Q-60 40 -42 52" ${o(0.8)} stroke-width="${sw(px, 3)}" stroke-linecap="round"/>`;
  }
  const rings = f.rings.map((r, i) => `<circle r="${r}" ${o(i ? TONE.sub : TONE.figure)} stroke-width="${sw(px, i ? 1.5 : 2)}"/>`).join('');
  const ticks = each(60, (j) => {
    const maj = j % 5 === 0, a = (j * PI) / 30;
    if (f.tk === 'dot') { const p = P(87, a); return `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="${dot(px, maj ? 2 : 1)}" fill="${ink}"/>`; }
    return `<line y1="-90.5" y2="${maj ? -84 : -87.5}" transform="rotate(${j * 6})" stroke="${ink}" stroke-width="${sw(px, maj ? 3 : 1.4)}"/>`;
  });
  const RN = 'XII I II III IV V VI VII VIII IX X XI'.split(' ');
  const ns = num(px, f.ns);
  const nums = each(12, (j) => {
    if (f.drop6 && j === 6) return ''; const p = P(f.nr, (j * PI) / 6), x = f1(p[0]), y = f1(p[1]), rot = j > 3 && j < 9 ? j * 30 + 180 : j * 30;
    return `<text x="${x}" y="${f1(p[1] + ns * 0.34)}" font-size="${ns}" font-family="${font}" fill="${ink}" text-anchor="middle" transform="rotate(${rot === j * 30 ? 0 : rot} ${x} ${y})">${RN[j]}</text>`;
  });
  /* The bezel. On a porcelain plate it is ink. On an onyx plate the bezel cut from the same ink is
   *  the single brightest object on a dark page — a hard ring the eye goes to first — so it takes a
   *  fraction of that ink instead: a dark warm metal that still reads as a bezel, and that sits a step
   *  below the page rather than above it. */
  const bezel = pal.dial === DIAL.dark ? engrave(pal, 0.16) : ink;
  return svg(`<circle r="99" fill="${bezel}"/><circle r="97.2" fill="${pal.dial}"/><circle r="95.6" ${o(TONE.sub)} stroke-width="${sw(px, 1.3)}"/>${rings}${orn}${ticks}${nums}`);
}
export type HandKind = 'hour' | 'minute' | 'second';
/**
 * Hand angles for a UTC instant, given a timezone offset in ms. Pure, so it can be asserted without a renderer
 * — which is the only way to prove R6 on a machine with no phone.
 *
 * `Date.now()` is UTC milliseconds; local wall time is `now - offset`, because `getTimezoneOffset()` is minutes
 * *west* of UTC and so is negative east of it (UTC+2 returns `-120`, and subtracting `-7_200_000` adds the two
 * hours back). The result is wrapped into one day, so all three hands are read off milliseconds-since-local-
 * midnight rather than off a 24-hour clock.
 *
 * **The offset is a parameter, not a constant.** It used to be read once into a module-scope `MS_TZ` in
 * `ClockFace.tsx`. An offset is by definition DST-dependent, so any app that stayed alive across a transition — a
 * phone asleep on the table overnight — showed every face an hour wrong until the process restarted, and nothing
 * in the tree could notice (`prompt.md` R6). `ClockFace.tsx` now keeps it in a shared value and re-reads it.
 *
 * **This function is a worklet.** `ClockFace`'s `useFrameCallback` runs on the UI runtime, and a plain JS
 * function captured in a worklet closure is serialised as a *remote* function, so calling it from there
 * throws `[Worklets] Tried to synchronously call a Remote Function` — which is how `eac2a65` shipped a
 * version of this app whose first frame was a red box, on a repository where every gate was green.
 */
export function handAngles(utcMs: number, offsetMs: number): { ha: number; ma: number; sec: number } {
  'worklet';
  const ms = (utcMs - offsetMs) % 86_400_000;
  return { ha: (ms / 3_600_000 % 12) * 30, ma: (ms / 60_000 % 60) * 6, sec: (ms % 60_000) / 1000 };
}
/** Hands point to 12 and rotate about the dial centre (the host view is the dial's size, so its centre is the pivot). */
export function handSvg(kind: HandKind, pal: Pal, px = 200): string {
  const L = kind === 'hour' ? 52 : kind === 'minute' ? 80 : 86, w = sw(px, kind === 'hour' ? 3.6 : kind === 'minute' ? 2.8 : 1.3);
  if (kind === 'second') return svg(`<path d="M0 18V-${L}" stroke="${pal.second}" stroke-width="${w}" stroke-linecap="round"/><circle cy="${-L * 0.62}" r="3.2" fill="none" stroke="${pal.second}" stroke-width="${sw(px, 1.1)}"/><circle r="3.6" fill="${pal.second}" stroke="${pal.dial}" stroke-width="${sw(px, .9)}"/>`);
  const y = -L * 0.56, q = w * 2.1;
  return svg(`<path d="M0 ${f1(L * 0.14)}V${f1(y + q)}M0 ${f1(y - q)}V${f1(-L * 0.68)}" stroke="${pal.ink}" stroke-width="${w}" stroke-linecap="round"/><circle cy="${f1(y)}" r="${f1(q)}" fill="none" stroke="${pal.ink}" stroke-width="${f2(w * 0.8)}"/><path d="M0 ${-L}L${f1(w * 1.7)} ${f1(-L * 0.7)}L0 ${f1(-L * 0.63)}L${f1(-w * 1.7)} ${f1(-L * 0.7)}Z" fill="${pal.ink}"/><circle r="${f1(w * 1.7)}" fill="${pal.ink}"/>`);
}
/** The dial plate and its spin layers, and *nothing else* — no hands at all.
 *
 *  This is the document a caller wants when the hands are not its own: the Focus dial and the onboarding
 *  tour's dial both draw their own pointer over this face and both pass `hands={false}`. `compositeSvg` is
 *  the same plate with a fixed 10:10:30 dropped on top, which is right for a picker thumbnail and wrong
 *  everywhere else — it used to be the *only* way to get a still face, so `hands={false}` was silently a
 *  no-op on that path and the tour dial grew a second hour hand, a second minute hand and a red second hand
 *  sitting on top of its own pointer at 10:10:30. `src/test/faces.test.ts` pins the difference. */
export function plateSvg(f: FaceSpec, pal: Pal, font: string, px = 200, uid = 'a', secs = 0): string {
  const body = staticSvg(f, pal, font, px, uid).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const layers = spinLayers(f.id, pal, px).map((l) => {
    const ang = l.osc ? Math.sin((secs / l.osc.period) * 2 * PI) * l.osc.swing : l.dps * secs, inner = l.svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');
    return `<g transform="translate(${l.x} ${l.y}) rotate(${f1(ang)})">${inner}</g>`;
  }).join('');
  return svg(`${body}${layers}`);
}
/** Whole face as one static SVG at a given moment — used by tests/offline rendering and the small Settings thumbnails. */
export function compositeSvg(f: FaceSpec, pal: Pal, font: string, t = { h: 10, m: 10, s: 30 }, secs = 0, px = 200, uid = 'a'): string {
  const strip = (s: string) => s.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const base = plateSvg(f, pal, font, px, uid, secs).replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const ha = (t.h % 12) * 30 + t.m * 0.5, ma = t.m * 6 + t.s * 0.1, sa = t.s * 6;
  return svg(`${base}<g transform="rotate(${ha})">${strip(handSvg('hour', pal, px))}</g><g transform="rotate(${ma})">${strip(handSvg('minute', pal, px))}</g>${f.nosec ? '' : `<g transform="rotate(${sa})">${strip(handSvg('second', pal, px))}</g>`}`);
}