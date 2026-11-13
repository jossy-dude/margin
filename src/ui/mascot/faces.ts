/**
 * v0.7 U7 — the twelve faces (DESIGN.md D-21), as centre-line strokes in a 120 × 64 viewBox, stroke 5, round caps.
 * Every mouth has the SAME command structure (`M x y C x y x y x y C x y x y x y`), so any two can be interpolated
 * point by point (the morph). Eyes are one of five types at (30, 26) and (90, 26); extras are their own layer.
 */
export type EyeKind = 'dot' | 'caret' | 'closed' | 'chevronL' | 'chevronR' | 'lidded';
export type FaceName = 'smirk' | 'wink' | 'happy' | 'content' | 'surprised' | 'cat' | 'sad' | 'smug' | 'blush' | 'laugh' | 'excited' | 'sleepy';
export interface FaceDef { eyes: [EyeKind, EyeKind]; mouth: number[]; extras: ('blush' | 'sweat')[]; open?: boolean }

/** Mouth as 14 numbers: M x0 y0, C (c1 c2 p1), C (c3 c4 p2). */
export const mouthPath = (n: readonly number[]) =>
  `M${n[0]} ${n[1]} C${n[2]} ${n[3]} ${n[4]} ${n[5]} ${n[6]} ${n[7]} C${n[8]} ${n[9]} ${n[10]} ${n[11]} ${n[12]} ${n[13]}`;

const smile = [44, 42, 50, 50, 56, 52, 60, 52, 64, 52, 70, 50, 76, 42];
export const FACES: Record<FaceName, FaceDef> = {
  smirk: { eyes: ['dot', 'dot'], mouth: [46, 46, 52, 50, 58, 50, 62, 48, 66, 46, 70, 44, 74, 40], extras: [] },
  wink: { eyes: ['dot', 'chevronL'], mouth: [46, 46, 52, 50, 58, 50, 62, 48, 66, 46, 70, 44, 74, 40], extras: [] },
  happy: { eyes: ['caret', 'caret'], mouth: smile, extras: [] },
  content: { eyes: ['closed', 'closed'], mouth: [48, 45, 53, 48, 57, 49, 60, 49, 63, 49, 67, 48, 72, 45], extras: [] },
  surprised: { eyes: ['dot', 'dot'], mouth: [60, 40, 52, 40, 52, 52, 60, 52, 68, 52, 68, 40, 60, 40], extras: [], open: true },
  cat: { eyes: ['dot', 'dot'], mouth: [46, 44, 49, 50, 56, 50, 60, 44, 64, 50, 71, 50, 74, 44], extras: [] },
  sad: { eyes: ['dot', 'dot'], mouth: [46, 50, 50, 44, 56, 42, 60, 42, 64, 42, 70, 44, 74, 50], extras: [] },
  smug: { eyes: ['lidded', 'lidded'], mouth: [46, 46, 52, 50, 58, 50, 62, 48, 66, 46, 70, 44, 74, 40], extras: [] },
  blush: { eyes: ['caret', 'caret'], mouth: [50, 44, 54, 48, 57, 49, 60, 49, 63, 49, 66, 48, 70, 44], extras: ['blush'] },
  laugh: { eyes: ['chevronR', 'chevronL'], mouth: [44, 40, 46, 56, 74, 56, 76, 40, 66, 40, 54, 40, 44, 40], extras: [], open: true },
  excited: { eyes: ['dot', 'dot'], mouth: [46, 40, 48, 54, 72, 54, 74, 40, 66, 40, 54, 40, 46, 40], extras: ['sweat'], open: true },
  sleepy: { eyes: ['lidded', 'lidded'], mouth: [48, 48, 52, 45, 56, 44, 60, 44, 64, 44, 68, 45, 72, 48], extras: [] },
};
export const FACE_NAMES = Object.keys(FACES) as FaceName[];

/** One eye as path data, centred on (cx, cy). Dots are drawn as a tiny closed stroke so every eye is a path. */
export function eyePath(kind: EyeKind, cx: number, cy: number): string {
  switch (kind) {
    case 'dot': return `M${cx - 0.5} ${cy} a0.5 0.5 0 1 0 1 0 a0.5 0.5 0 1 0 -1 0`;
    case 'caret': return `M${cx - 8} ${cy + 4} L${cx} ${cy - 4} L${cx + 8} ${cy + 4}`;
    case 'closed': return `M${cx - 8} ${cy} L${cx + 8} ${cy}`;
    case 'chevronL': return `M${cx + 6} ${cy - 6} L${cx - 4} ${cy} L${cx + 6} ${cy + 6}`;
    case 'chevronR': return `M${cx - 6} ${cy - 6} L${cx + 4} ${cy} L${cx - 6} ${cy + 6}`;
    case 'lidded': return `M${cx - 8} ${cy - 2} L${cx + 8} ${cy - 2} M${cx - 0.5} ${cy + 3} a0.5 0.5 0 1 0 1 0`;
  }
}
/** Interpolate two mouths (t in 0..1): the morph's whole maths. */
export const mixMouth = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + ((b[i] ?? v) - v) * t);

/** Which face a page shows in its top bar (D-21 placement). */
export function pageFace(page: 'Today' | 'Week' | 'Tasks' | 'Grades' | 'Stats', ctx: { hour: number; classesLeft?: number; dueToday?: number; open?: number; belowGoal?: number; atGoal?: number }): FaceName {
  if (page === 'Today') return ctx.hour >= 23 || ctx.hour < 5 ? 'sleepy' : ctx.classesLeft === 0 ? 'content' : 'smirk';
  if (page === 'Tasks') return (ctx.dueToday ?? 0) > 0 ? 'excited' : (ctx.open ?? 0) === 0 ? 'cat' : 'smirk';
  if (page === 'Grades') return (ctx.belowGoal ?? 0) > 0 ? 'sad' : (ctx.atGoal ?? 0) > 0 ? 'smug' : 'smirk';
  return 'smirk';
}
