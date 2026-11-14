/**
 * v0.7 U7 — the morph, driven frame by frame through the same worklets `Face.tsx` hands the UI thread.
 *
 * Every one of the 144 ordered pairs of faces must morph: the mouth keeps one command structure the whole way
 * (Reanimated interpolates nothing itself; the worklet rebuilds `d`, and a structure change mid-morph would draw a
 * different shape), t = 0 is exactly the first face and t = 1 exactly the second, eyes of different kinds swap
 * inside a blink (shut by 80 ms, open again by 220 ms) without ever showing both, and extras fade.
 */
import {
  EYE_IN_MS, EYE_OUT_MS, FACES, FACE_NAMES, MORPH_MS, ease, extraAt, eyeFrame, eyePath, eyeProps, mouthAt, mouthPath, poseAt, poseOf, shapePath, EYE_SHAPES, EYE_X, EYE_Y, type EyeKind,
} from '../ui/mascot/faces';

const shape = (d: string) => d.replace(/[-\d.]+/g, 'n');
const FRAMES = Array.from({ length: 23 }, (_, i) => i / 22); // every 10 ms of the 220 ms morph

describe('every pair of faces morphs', () => {
  it('the mouth keeps its structure on every frame and lands exactly on both ends', () => {
    const mouthShape = shape(mouthPath(FACES.smirk.mouth));
    for (const a of FACE_NAMES) for (const b of FACE_NAMES) {
      const A = poseOf(a), B = poseOf(b);
      expect(mouthAt(A, B, 0)).toBe(mouthPath(FACES[a].mouth));
      expect(mouthAt(A, B, 1)).toBe(mouthPath(FACES[b].mouth));
      for (const t of FRAMES) expect(shape(mouthAt(A, B, t))).toBe(mouthShape);
    }
  });
  it('the eyes start as the first face, end as the second, and are always one drawn shape', () => {
    for (const a of FACE_NAMES) for (const b of FACE_NAMES) {
      const A = poseOf(a), B = poseOf(b);
      for (const side of [0, 1] as const) {
        expect(eyeProps(A, B, 0, side, 0, false, 0, 0)).toEqual({ d: eyePath(FACES[a].eyes[side], side) });
        expect(eyeProps(A, B, 1, side, 0, false, 0, 0)).toEqual({ d: eyePath(FACES[b].eyes[side], side) });
        for (const t of FRAMES) expect(eyeProps(A, B, t, side, 0, false, 0, 0).d.startsWith('M')).toBe(true);
      }
    }
  });
  it('extras fade in and out with the mouth', () => {
    for (const a of FACE_NAMES) for (const b of FACE_NAMES) {
      const A = poseOf(a), B = poseOf(b);
      expect(extraAt(A.blush, B.blush, 0)).toBe(A.blush);
      expect(extraAt(A.blush, B.blush, 1)).toBe(B.blush);
      expect(extraAt(A.sweat, B.sweat, 1)).toBe(B.sweat);
    }
    expect(extraAt(0, 1, 0.5)).toBeCloseTo(0.5, 6);
    // monotone: an extra never flickers on the way
    let prev = -1;
    for (const t of FRAMES) { const v = extraAt(0, 1, t); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});

describe('an eye that changes kind swaps inside a blink: shut by 80 ms, open again by 220 ms', () => {
  /** How tall an eye is drawn (its points' y spread), in face units. */
  const tall = (d: string) => { const ys = (d.match(/-?[\d.]+/g) ?? []).map(Number).filter((_, i) => i % 2 === 1); return Math.max(...ys) - Math.min(...ys); };
  it('follows the D-21 timing', () => {
    expect([MORPH_MS, EYE_OUT_MS, EYE_IN_MS]).toEqual([220, 80, 120]);
    expect(eyeFrame('dot', 'caret', 0)).toEqual({ kind: 'dot', open: 1 });
    expect(eyeFrame('dot', 'caret', 40 / 220)).toEqual({ kind: 'dot', open: expect.closeTo(0.54, 6) });
    const handover = eyeFrame('dot', 'caret', 80 / 220);
    expect(handover.kind).toBe('caret');
    expect(handover.open).toBeCloseTo(0.08, 6);
    expect(eyeFrame('dot', 'caret', 140 / 220).open).toBeCloseTo(0.54, 6); // eased: half open half way through
    expect(eyeFrame('dot', 'caret', 1)).toEqual({ kind: 'caret', open: 1 });
  });
  it('at the handover every kind is a flat dash, so the swap is never seen', () => {
    const kinds = Object.keys(EYE_SHAPES) as EyeKind[];
    for (const a of kinds) for (const b of kinds) {
      if (a === b) continue;
      const P = { eyes: [a, a] as [EyeKind, EyeKind], mouth: [...FACES.smirk.mouth], blush: 0, sweat: 0 };
      const Q = { eyes: [b, b] as [EyeKind, EyeKind], mouth: [...FACES.smirk.mouth], blush: 0, sweat: 0 };
      expect(tall(eyeProps(P, Q, 79.9 / 220, 0, 0, false, 0, 0).d)).toBeLessThan(1.2);
      expect(tall(eyeProps(P, Q, 80 / 220, 0, 0, false, 0, 0).d)).toBeLessThan(1.2);
    }
  });
  it('the same kind never blinks for a morph', () => {
    for (const t of FRAMES) expect(eyeFrame('dot', 'dot', t)).toEqual({ kind: 'dot', open: 1 });
  });
});

describe('an interrupted morph continues from where it was', () => {
  it('poseAt is the morph frozen at t: its mouth is the drawn mouth at that frame', () => {
    const A = poseOf('smirk'), B = poseOf('laugh');
    for (const t of [0.1, 0.3, 0.5, 0.9]) {
      const P = poseAt(A, B, t);
      expect(mouthPath(P.mouth)).toBe(mouthAt(A, B, t));
      // a new morph that starts from P begins exactly where the old one was
      expect(mouthAt(P, poseOf('sad'), 0)).toBe(mouthAt(A, B, t));
    }
    // before the eye handover the frozen pose still has the old eyes, after it the new ones
    expect(poseAt(A, B, 0.2).eyes).toEqual(['dot', 'dot']);
    expect(poseAt(A, B, 0.5).eyes).toEqual(['chevronR', 'chevronL']);
    expect(poseAt(A, poseOf('blush'), 0.5).blush).toBeCloseTo(ease(0.5), 6);
  });
  it('the ease is a smoothstep, pinned at both ends and clamped', () => {
    expect([ease(-1), ease(0), ease(0.5), ease(1), ease(2)]).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('blink, peek and look move the eyes the way D-21 says', () => {
  const A = poseOf('smirk');
  it('a blink squashes an open eye to 8 % about its centre; shut and smiling eyes do not blink', () => {
    const shut = eyeProps(A, A, 1, 0, 1, false, 0, 0).d;
    expect(shut).toBe(shapePath(EYE_SHAPES.dot[0], EYE_X[0], EYE_Y, 1, 0.08, 0, 0));
    for (const n of ['happy', 'content', 'laugh'] as const) {
      const P = poseOf(n);
      expect(eyeProps(P, P, 1, 0, 1, false, 0, 0).d).toBe(eyePath(FACES[n].eyes[0], 0));
    }
  });
  it('a content face peeks open only on a slow blink, out of its closed line', () => {
    const C = poseOf('content');
    expect(eyeProps(C, C, 1, 0, 0.5, false, 0, 0).d).toBe(eyePath('closed', 0));
    const open = eyeProps(C, C, 1, 0, 1, true, 0, 0).d;
    expect(open).toBe(eyePath('dot', 0));
    expect(eyeProps(C, C, 1, 0, 0, true, 0, 0).d).toBe(eyePath('closed', 0));
  });
  it('dot eyes look up to 2.5 units; other kinds hold still', () => {
    const looked = eyeProps(A, A, 1, 1, 0, false, 2.5, -1).d;
    expect(looked).toBe(shapePath(EYE_SHAPES.dot[1], EYE_X[1], EYE_Y, 1, 1, 2.5, -1));
    const H = poseOf('happy');
    expect(eyeProps(H, H, 1, 1, 0, false, 2.5, -1).d).toBe(eyePath('caret', 1));
  });
});
