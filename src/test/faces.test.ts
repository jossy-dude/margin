/** v0.7 U7 — the twelve faces: all present, morphable mouths, ≤ 6 strokes, parser-safe paths. (Which face shows
 *  where is `face-moments.test.ts`.) */
import { BLUSH_D, EYE_SHAPES, FACES, FACE_NAMES, SWEAT_D, VIEW_H, VIEW_W, eyePath, mixMouth, mouthPath, nextBlink, strokeFor, type EyeKind } from '../ui/mascot/faces';

const ALL_EYES = Object.keys(EYE_SHAPES) as EyeKind[];

describe('faces', () => {
  it('has the twelve named faces, each with words for TalkBack', () => {
    expect([...FACE_NAMES].sort()).toEqual(['blush', 'cat', 'content', 'excited', 'happy', 'laugh', 'sad', 'sleepy', 'smirk', 'smug', 'surprised', 'wink']);
    for (const n of FACE_NAMES) expect(FACES[n].label.length).toBeGreaterThan(2);
    expect(new Set(FACE_NAMES.map((n) => FACES[n].label)).size).toBe(12);
  });
  it('every mouth has the same command structure, so any two morph', () => {
    const shape = (d: string) => d.replace(/[-\d.]+/g, 'n');
    const shapes = new Set(FACE_NAMES.map((n) => shape(mouthPath(FACES[n].mouth))));
    expect(shapes.size).toBe(1);
    for (const n of FACE_NAMES) expect(FACES[n].mouth).toHaveLength(14);
    expect(mixMouth(FACES.smirk.mouth, FACES.sad.mouth, 0)).toEqual(FACES.smirk.mouth);
    expect(mixMouth(FACES.smirk.mouth, FACES.sad.mouth, 1).map((v) => Math.round(v * 1e6) / 1e6)).toEqual(FACES.sad.mouth);
  });
  it('extras are their own layer: blush on one face, sweat on one (the rendered path count is in face-motion.test.ts)', () => {
    expect(FACES.blush.extras).toEqual(['blush']);
    expect(FACES.excited.extras).toEqual(['sweat']);
    for (const n of FACE_NAMES.filter((x) => x !== 'blush' && x !== 'excited')) expect(FACES[n].extras).toEqual([]);
  });
  it('every path uses only M, L and C, the commands every renderer parses alike (no arcs)', () => {
    const cmds = (d: string) => new Set(d.replace(/[-\d.\s]+/g, ''));
    for (const k of ALL_EYES) for (const side of [0, 1] as const) {
      const d = eyePath(k, side);
      expect([...cmds(d)].every((c) => 'MLC'.includes(c))).toBe(true);
      expect(d.startsWith('M')).toBe(true);
    }
    for (const n of FACE_NAMES) expect([...cmds(mouthPath(FACES[n].mouth))].sort()).toEqual(['C', 'M']);
    for (const d of [BLUSH_D, SWEAT_D]) expect([...cmds(d)].sort()).toEqual(['L', 'M']);
  });
  it('eyes sit on their centres and stay inside the box', () => {
    // the caret, as traced: a soft ^ over the eye centre, its feet below it
    expect(eyePath('caret', 0)).toBe('M24 29.3C26.5 25.5 28.8 21 30.8 21C32.8 21 35.5 25 38 28.5');
    const nums = (d: string) => (d.match(/-?[\d.]+/g) ?? []).map(Number);
    for (const k of ALL_EYES) for (const side of [0, 1] as const) {
      const v = nums(eyePath(k, side)), xs = v.filter((_, i) => i % 2 === 0), ys = v.filter((_, i) => i % 2 === 1);
      expect(Math.min(...xs)).toBeGreaterThan(side === 0 ? 15 : 75);
      expect(Math.max(...xs)).toBeLessThan(side === 0 ? 45 : 105);
      expect(Math.min(...ys)).toBeGreaterThan(14);
      expect(Math.max(...ys)).toBeLessThan(40);
    }
    // a dot is a solid disc: the inner ring's stroke covers its centre at the thinnest stroke the face is drawn with
    expect(EYE_SHAPES.dot[0]).toEqual([3, 0, 0, 3.7, 3, 0, 0, 1.2]);
    expect(1.2 - 3.6 / 2).toBeLessThan(0);
    expect(3.7 - 3.6 / 2).toBeLessThan(1.2 + 3.6 / 2);
    expect([VIEW_W, VIEW_H]).toEqual([120, 64]);
  });
  it('the stroke never draws thinner than 1.75 dp, and is the drawing\'s own 3.6 units when big', () => {
    for (const size of [20, 24, 28, 64, 72, 96, 160]) expect((strokeFor(size) * size) / VIEW_H).toBeGreaterThanOrEqual(1.75 - 1e-9);
    expect(strokeFor(160)).toBe(3.6);
    expect(strokeFor(64)).toBe(3.6);
  });
  it('blinks wait 3.5–7 s, one in five is a double; the slow (Focus) blink waits 6–10 s and never doubles', () => {
    const at = (v: number) => () => v;
    expect(nextBlink(at(0))).toEqual({ gap: 3500, double: true });
    expect(nextBlink(at(0.999999))).toEqual({ gap: 7000, double: false });
    expect(nextBlink(at(0.2)).double).toBe(false);
    expect(nextBlink(at(0.19)).double).toBe(true);
    expect(nextBlink(at(0), true)).toEqual({ gap: 6000, double: false });
    expect(nextBlink(at(0.999999), true)).toEqual({ gap: 10000, double: false });
    let doubles = 0, seed = 7;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 5000; i++) if (nextBlink(rand).double) doubles++;
    expect(doubles / 5000).toBeGreaterThan(0.17);
    expect(doubles / 5000).toBeLessThan(0.23);
  });
});
