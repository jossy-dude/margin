/** v0.7 U7 — the twelve faces: all present, morphable mouths, ≤ 6 strokes, page faces. */
import { FACES, FACE_NAMES, eyePath, mixMouth, mouthPath, pageFace } from '../ui/mascot/faces';
import { Face } from '../ui/mascot/Face';

describe('faces', () => {
  it('has the twelve named faces', () => {
    expect(FACE_NAMES.sort()).toEqual(['blush', 'cat', 'content', 'excited', 'happy', 'laugh', 'sad', 'sleepy', 'smirk', 'smug', 'surprised', 'wink']);
    expect(typeof Face).toBe('function');
  });
  it('every mouth has the same command structure, so any two morph', () => {
    const shape = (d: string) => d.replace(/[-\d.]+/g, 'n');
    const shapes = new Set(FACE_NAMES.map((n) => shape(mouthPath(FACES[n].mouth))));
    expect(shapes.size).toBe(1);
    expect(mixMouth(FACES.smirk.mouth, FACES.sad.mouth, 0)).toEqual(FACES.smirk.mouth);
    expect(mixMouth(FACES.smirk.mouth, FACES.sad.mouth, 1)).toEqual(FACES.sad.mouth);
  });
  it('a face draws in at most 6 strokes', () => {
    for (const n of FACE_NAMES) expect(3 + FACES[n].extras.length).toBeLessThanOrEqual(6);
    expect(eyePath('caret', 30, 26)).toBe('M22 30 L30 22 L38 30');
  });
  it('page faces follow the day', () => {
    expect(pageFace('Today', { hour: 23 })).toBe('sleepy');
    expect(pageFace('Today', { hour: 18, classesLeft: 0 })).toBe('content');
    expect(pageFace('Tasks', { hour: 9, dueToday: 2 })).toBe('excited');
    expect(pageFace('Tasks', { hour: 9, open: 0 })).toBe('cat');
    expect(pageFace('Grades', { hour: 9, belowGoal: 1 })).toBe('sad');
    expect(pageFace('Stats', { hour: 9 })).toBe('smirk');
  });
});
