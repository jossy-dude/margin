/**
 * v0.7 U7 — the twelve faces (DESIGN.md D-21), traced by hand from `docs/v07/ref/jot-faces.png` as centre-line strokes
 * in a 120 × 64 viewBox. The reference was warped into this box with its eyes on (30, 26) and (90, 26) (3.42 px a unit)
 * and every point below was read off that underlay: dot eyes are r 5.5 and strokes 3.6 units wide, as drawn.
 *
 * Everything is a stroke, nothing is filled: a dot eye is two concentric circles whose strokes overlap into a solid
 * disc, so one path can morph, blink or fade with no fill rule to get wrong. Every path uses only `M`, `L` and `C`
 * (circles are four cubics, not arcs), the three commands every SVG renderer parses alike. Every mouth has the SAME
 * command structure (`M x y C x y x y x y C x y x y x y`), so any two can be interpolated point by point (the morph).
 * Eyes are one of seven kinds; when a morph changes an eye's kind the swap happens inside a blink: the old eye
 * shuts in 80 ms, the new one opens out of the same line in 120 ms (`eyeFrame`).
 *
 * The functions marked `'worklet'` run on the UI thread inside `Face.tsx`'s animated props; they are pure, so the
 * tests drive them frame by frame on the JS side.
 */
export type EyeKind = 'dot' | 'caret' | 'closed' | 'chevronL' | 'chevronR' | 'lidded' | 'drowsy';
export type FaceName = 'smirk' | 'wink' | 'happy' | 'content' | 'surprised' | 'cat' | 'sad' | 'smug' | 'blush' | 'laugh' | 'excited' | 'sleepy';
export type Extra = 'blush' | 'sweat';
/** The two one-shot motions: a hop for good news, a sigh for bad. */
export type FaceMotion = 'bounce' | 'droop';
export interface FaceDef { eyes: readonly [EyeKind, EyeKind]; mouth: readonly number[]; extras: readonly Extra[]; label: string }

export const VIEW_W = 120, VIEW_H = 64;
/** Eye centres: left and right, on one line (so a blink can squash both about the same y). */
export const EYE_X = [30, 90] as const, EYE_Y = 26;

/* ── mouths: 14 numbers, M x0 y0 · C (c1 c2 p1) · C (c3 c4 p2) ──
   Point order is chosen so morphs read well: every mouth starts at its left end, its first segment is the lower
   lip (or the top of a D), the second segment comes back on the right (the ʖ hook, the top of the o, the D's bowl). */
/** ͜ʖ — the smile with the hook, shared by six faces (drawn the same in all six; the differences were the pen).
 *  Sharing it is also what makes smirk ⇄ wink ⇄ happy ⇄ content ⇄ smug ⇄ blush read as the eyes changing alone. */
const HOOK = [50, 35.2, 54, 38.6, 65, 39, 71.5, 35.3, 71, 26.5, 72, 32.8, 75.6, 39.6];
/** o — a closed loop: left, under to the right, over back to the left. */
const O = [54.9, 35.5, 54.9, 42.7, 66.1, 42.7, 66.1, 35.5, 66.1, 28.3, 54.9, 28.3, 54.9, 35.5];
/** ω — two humps meeting at a cusp. */
const OMEGA = [50.2, 32.6, 50, 41, 60, 41, 61, 33.6, 62, 41, 72, 41, 71.7, 32.8];
/** ︵ — the frown. */
const FROWN = [50.6, 36.8, 52.5, 33, 56, 31, 60.5, 31, 65, 31, 68.8, 33, 71, 36.3];
/** D — top edge left to right, then the bowl back round to the start (open, never filled: the drawing is an outline). */
const BIG_D = [49.8, 32.4, 57, 31.8, 65, 31.2, 72.4, 30.6, 73.5, 48.8, 49, 49.3, 49.8, 32.4];
const SMALL_D = [52.6, 29.2, 58, 29, 63, 28.8, 68.4, 28.6, 69, 44, 52, 44.5, 52.6, 29.2];
/** the sleepy frown: smaller, and lopsided the way it was drawn. */
const YAWN = [54.8, 36.2, 56.5, 33.6, 59, 32.4, 62, 32.4, 65, 32.4, 67.6, 33.2, 69.2, 34.8];

export const FACES: Record<FaceName, FaceDef> = {
  smirk: { eyes: ['dot', 'dot'], mouth: HOOK, extras: [], label: 'smiling' },
  wink: { eyes: ['dot', 'chevronL'], mouth: HOOK, extras: [], label: 'winking' },
  happy: { eyes: ['caret', 'caret'], mouth: HOOK, extras: [], label: 'happy' },
  content: { eyes: ['closed', 'closed'], mouth: HOOK, extras: [], label: 'content, eyes closed' },
  surprised: { eyes: ['dot', 'dot'], mouth: O, extras: [], label: 'surprised' },
  cat: { eyes: ['dot', 'dot'], mouth: OMEGA, extras: [], label: 'pleased' },
  sad: { eyes: ['dot', 'dot'], mouth: FROWN, extras: [], label: 'sad' },
  smug: { eyes: ['lidded', 'lidded'], mouth: HOOK, extras: [], label: 'smug' },
  blush: { eyes: ['dot', 'dot'], mouth: HOOK, extras: ['blush'], label: 'blushing' },
  laugh: { eyes: ['chevronR', 'chevronL'], mouth: BIG_D, extras: [], label: 'laughing' },
  excited: { eyes: ['dot', 'dot'], mouth: SMALL_D, extras: ['sweat'], label: 'excited, a little flustered' },
  sleepy: { eyes: ['drowsy', 'drowsy'], mouth: YAWN, extras: [], label: 'sleepy' },
};
export const FACE_NAMES = Object.keys(FACES) as FaceName[];

/* ── eyes, relative to the eye centre, as flat number lists: 0 = M x y, 1 = L x y, 2 = C x1 y1 x2 y2 x y,
   3 = a circle (cx cy r, drawn as four cubics). [left eye, right eye]: lids and closed lines are mirrored. ── */
const DOT = [3, 0, 0, 3.7, 3, 0, 0, 1.2];
const CARET = [0, -6, 3.3, 2, -3.5, -0.5, -1.2, -5, 0.8, -5, 2, 2.8, -5, 5.5, -1, 8, 2.5];
export const EYE_SHAPES: Record<EyeKind, readonly [readonly number[], readonly number[]]> = {
  dot: [DOT, DOT],
  caret: [CARET, CARET],
  closed: [[0, -7.2, 0.8, 1, 7.2, -0.2], [0, -7, -0.7, 1, 7, -0.2]],
  chevronL: [[0, 2.4, -5.9, 1, -6.3, 0, 1, 5.5, 4.9], [0, 2.4, -5.9, 1, -6.3, 0, 1, 5.5, 4.9]],
  chevronR: [[0, -5, -5.5, 1, 6.5, 0, 1, -5, 6.5], [0, -5, -5.5, 1, 6.5, 0, 1, -5, 6.5]],
  /* smug: a slanted lid over a slightly smaller dot, lids sloping down towards the nose */
  lidded: [[0, -3.2, -5.5, 1, 6.5, 0.5, 3, 0.5, 1, 3.2, 3, 0.5, 1, 1], [0, 3.2, -5.5, 1, -6.5, 0.5, 3, -0.5, 1, 3.2, 3, -0.5, 1, 1]],
  /* sleepy: a flat lid with the dot hanging under it; the dot's top sits exactly under the lid's top edge at any
     stroke width (1.4 − 3.0 = −1.6 = the lid's line) */
  drowsy: [[0, -7, -1.1, 1, 6.5, -2.1, 3, 0, 1.4, 3, 3, 0, 1.4, 0.9], [0, -7, -1.8, 1, 6.5, -1.8, 3, 0, 1.4, 3, 3, 0, 1.4, 0.9]],
};
/** Which eyes close in a blink (the rest are already closed, squeezed or smiling shut). */
export const BLINKS: Record<EyeKind, boolean> = { dot: true, lidded: true, drowsy: true, caret: false, closed: false, chevronL: false, chevronR: false };

/** The extras, in face units: two pairs of blush strokes under the eyes, two sweat marks over the right eye. */
export const BLUSH_D = 'M20.9 41.7L23.3 37.2M28.5 41.7L30.9 37.2M91.1 40.8L93.8 36.4M98.7 40.8L101.1 36.4';
export const SWEAT_D = 'M91.5 10.3L94.8 5.5M99.7 14.2L103.3 10.6';

/* ── timing (D-21) ── */
export const MORPH_MS = 220, EYE_OUT_MS = 80, EYE_IN_MS = 120, LOOK_UNITS = 2.5, LOOK_HOLD_MS = 1200;
export const LOOK_SPRING = { damping: 20, stiffness: 180 } as const, BOUNCE_SPRING = { damping: 10, stiffness: 300 } as const;
/** A blink is 140 ms: shut a little faster than it opens, as eyes do. The double blink's second one follows 90 ms on. */
export const BLINK = { closeMs: 60, openMs: 80, doubleGapMs: 90 } as const;
/** The slow blink (Focus): eyes shut ones peek open and close again; open ones close and reopen, unhurried. */
export const SLOW_BLINK = { inMs: 420, holdMs: 700, outMs: 520 } as const;
/** Bounce: up 6 units in 100 ms, then the spring brings it home (and lands it with a small rebound). */
export const BOUNCE = { units: -6, riseMs: 100 } as const;
/** Droop: 2 units down and back, 400 ms in all: it sinks quickly and recovers slowly. */
export const DROOP = { units: 2, downMs: 160, upMs: 240 } as const;
/** Breathing: 1 → 1.02 → 1 over 4 s, three breaths after the face arrives, changes or reacts, then still (blinks
 *  go on). Not endless: DESIGN.md D-5 allows no infinite loop but the blink, and a 2 % scale redrawn every frame on
 *  a page left open is battery spent on something nobody is watching. */
export const BREATH_MS = 4000, BREATH_SCALE = 1.02, BREATH_MIN_SIZE = 64, BREATHS = 3;

/** The stroke for a face drawn `size` dp tall: the drawing's 3.6 units, never thinner than 1.75 dp on screen
 *  (a 28 dp top-bar face would otherwise draw 1.6 dp lines next to 2 dp icons). */
export const strokeFor = (size: number) => Math.max(3.6, (1.75 * VIEW_H) / Math.max(1, size));

/** Two decimals, as path data carries them. */
function n2(v: number): number {
  'worklet';
  return Math.round(v * 100) / 100;
}

/** Mouth as path data. */
export function mouthPath(n: readonly number[]): string {
  'worklet';
  return `M${n2(n[0]!)} ${n2(n[1]!)} C${n2(n[2]!)} ${n2(n[3]!)} ${n2(n[4]!)} ${n2(n[5]!)} ${n2(n[6]!)} ${n2(n[7]!)} C${n2(n[8]!)} ${n2(n[9]!)} ${n2(n[10]!)} ${n2(n[11]!)} ${n2(n[12]!)} ${n2(n[13]!)}`;
}
/** Interpolate two mouths (t in 0..1): the morph's whole maths. */
export function mixMouth(a: readonly number[], b: readonly number[], t: number): number[] {
  'worklet';
  const out: number[] = [];
  for (let i = 0; i < a.length; i++) out.push(a[i]! + ((b[i] ?? a[i]!) - a[i]!) * t);
  return out;
}
/** Smoothstep: the morph's ease (in and out, like the `state` curve, without a solver on the UI thread). */
export function ease(t: number): number {
  'worklet';
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return k * k * (3 - 2 * k);
}

/** The circle's four cubics (κ = 0.5523, the standard quarter-circle handle), as an ellipse when squashed. */
function ring(x: number, y: number, rx: number, ry: number): string {
  'worklet';
  const kx = rx * 0.5523, ky = ry * 0.5523;
  return `M${n2(x - rx)} ${n2(y)}C${n2(x - rx)} ${n2(y - ky)} ${n2(x - kx)} ${n2(y - ry)} ${n2(x)} ${n2(y - ry)}`
    + `C${n2(x + kx)} ${n2(y - ry)} ${n2(x + rx)} ${n2(y - ky)} ${n2(x + rx)} ${n2(y)}`
    + `C${n2(x + rx)} ${n2(y + ky)} ${n2(x + kx)} ${n2(y + ry)} ${n2(x)} ${n2(y + ry)}`
    + `C${n2(x - kx)} ${n2(y + ry)} ${n2(x - rx)} ${n2(y + ky)} ${n2(x - rx)} ${n2(y)}`;
}

/** One eye shape as path data, centred on (cx, cy), scaled by (sx, sy) about its centre and shifted by (dx, dy).
 *  Scaling moves the points, not the pen: a blinked dot is a short thick dash, as a closed eye is drawn. */
export function shapePath(s: readonly number[], cx: number, cy: number, sx: number, sy: number, dx: number, dy: number): string {
  'worklet';
  let d = '', i = 0;
  const ox = cx + dx, oy = cy + dy;
  while (i < s.length) {
    const k = s[i]!;
    if (k === 0 || k === 1) {
      d += `${k === 0 ? 'M' : 'L'}${n2(ox + s[i + 1]! * sx)} ${n2(oy + s[i + 2]! * sy)}`;
      i += 3;
    } else if (k === 2) {
      d += `C${n2(ox + s[i + 1]! * sx)} ${n2(oy + s[i + 2]! * sy)} ${n2(ox + s[i + 3]! * sx)} ${n2(oy + s[i + 4]! * sy)} ${n2(ox + s[i + 5]! * sx)} ${n2(oy + s[i + 6]! * sy)}`;
      i += 7;
    } else {
      d += ring(ox + s[i + 1]! * sx, oy + s[i + 2]! * sy, s[i + 3]! * sx, Math.max(0.01, s[i + 3]! * sy));
      i += 4;
    }
  }
  return d;
}
/** An eye of `kind` on `side` (0 = left, 1 = right) at rest. */
export const eyePath = (kind: EyeKind, side: 0 | 1) => shapePath(EYE_SHAPES[kind][side], EYE_X[side], EYE_Y, 1, 1, 0, 0);

/* Named return types, not inline ones: `worklet-hosts.test.ts` reads a worklet's body from its first brace. */
export interface EyeFrame { kind: EyeKind; open: number }
export interface EyeDraw { d: string }

/** What one eye shows `t` (0..1) into a morph from kind `a` to kind `b`: the same kind stays put; a new kind is
 *  swapped inside a blink. The old eye shuts (squashes to 8 %) over the first 80 ms, the new one opens out of that
 *  line over the next 120 ms. Every kind is a short dash when shut, so the handover itself is never seen, and it is
 *  the blink's own squash, so a change of face reads as the face blinking into it. (D-21 first said a cross-fade;
 *  drawn out, its middle frames were grey ghosts and, at 80 ms, a face with no eyes.) */
export function eyeFrame(a: EyeKind, b: EyeKind, t: number): EyeFrame {
  'worklet';
  if (a === b || t >= 1) return { kind: b, open: 1 };
  const ms = Math.max(0, t) * MORPH_MS;
  if (ms < EYE_OUT_MS) return { kind: a, open: 1 - (0.92 * ms) / EYE_OUT_MS };
  return { kind: b, open: 0.08 + 0.92 * ease((ms - EYE_OUT_MS) / EYE_IN_MS) };
}

/** A face as the UI thread holds it: eye kinds, mouth numbers, and how much of each extra shows (0..1). */
export interface Pose { eyes: [EyeKind, EyeKind]; mouth: number[]; blush: number; sweat: number }
export const poseOf = (name: FaceName): Pose => {
  const f = FACES[name];
  return { eyes: [f.eyes[0], f.eyes[1]], mouth: [...f.mouth], blush: f.extras.includes('blush') ? 1 : 0, sweat: f.extras.includes('sweat') ? 1 : 0 };
};
/** Where a morph from `a` to `b` stands at `t`, as a pose: what a new morph starts from when it interrupts one. */
export function poseAt(a: Pose, b: Pose, t: number): Pose {
  'worklet';
  const e = ease(t), half = Math.max(0, t) * MORPH_MS < EYE_OUT_MS;
  return {
    eyes: [half ? a.eyes[0] : b.eyes[0], half ? a.eyes[1] : b.eyes[1]],
    mouth: mixMouth(a.mouth, b.mouth, e),
    blush: a.blush + (b.blush - a.blush) * e,
    sweat: a.sweat + (b.sweat - a.sweat) * e,
  };
}
/** One eye's animated props. `blink` (0..1) closes an open eye; for shut eyes (`closed`) it is how far they `peek`
 *  open instead — the slow blink of a contented face — and only when `peek` is on. Pupils follow (lx, ly) only
 *  when the eye is a plain dot. */
export function eyeProps(a: Pose, b: Pose, t: number, side: 0 | 1, blink: number, peek: boolean, lx: number, ly: number): EyeDraw {
  'worklet';
  const f = eyeFrame(a.eyes[side], b.eyes[side], t);
  const cx = EYE_X[side];
  if (f.kind === 'closed' && peek && blink > 0.02) {
    /* a dot squashed to 8 % is a dash as wide as the closed line, so it opens out of the line without a jump */
    const open = 0.08 + 0.92 * blink, wide = 1 + 0.27 * (1 - blink);
    return { d: shapePath(EYE_SHAPES.dot[side], cx, EYE_Y, wide, open * f.open, 0, 0) };
  }
  const squash = (BLINKS[f.kind] ? 1 - 0.92 * blink : 1) * f.open, look = f.kind === 'dot';
  return { d: shapePath(EYE_SHAPES[f.kind][side], cx, EYE_Y, 1, squash, look ? lx : 0, look ? ly : 0) };
}
/** The mouth `t` into a morph from `a` to `b`. */
export function mouthAt(a: Pose, b: Pose, t: number): string {
  'worklet';
  return mouthPath(mixMouth(a.mouth, b.mouth, ease(t)));
}
/** An extra's opacity `t` into a morph (it fades with the mouth's ease). */
export function extraAt(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * ease(t);
}

/** The next blink: how long to wait (3.5–7 s) and whether it is a double one (one time in five). The slow blink
 *  (Focus) waits 6–10 s and never doubles.
 *
 *  Each wait is one JS `setTimeout`, and only the 140 ms blink itself runs on the UI thread. It is not a
 *  `withRepeat` of `withDelay`s (D-21's first plan): Reanimated asks for a frame on every vsync while a `withDelay`
 *  waits and writes the same value each time (`valueSetter.ts` `step`, `animation/delay.ts`), which wakes every
 *  mapper that reads it. A face on every tab would keep the UI thread at 60–120 Hz forever, for a blink every 5 s. */
export function nextBlink(rand: () => number, slow = false): { gap: number; double: boolean } {
  return slow ? { gap: Math.round(6000 + rand() * 4000), double: false } : { gap: Math.round(3500 + rand() * 3500), double: rand() < 0.2 };
}

/** Gaze (−1…1 a side) for a point (dx, dy) away from the face. Saturates softly: a finger across the screen and one
 *  just past the face both read as "over there" rather than snapping. */
export function gazeAt(dx: number, dy: number, reach = 160): { x: number; y: number } {
  const sx = dx / reach, sy = dy / reach;
  return { x: sx / Math.sqrt(1 + sx * sx), y: sy / Math.sqrt(1 + sy * sy) };
}
/** Gaze while typing: the eyes read along a field below, left to right as the text grows. */
export const gazeAlong = (chars: number, max = 22) => ({ x: -0.75 + Math.min(1, chars / max) * 1.5, y: 0.85 });
