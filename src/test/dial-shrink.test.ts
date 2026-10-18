import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** v0.1's first on-device look read the Focus dial oversized and dark mode grainy. Two fixes bind here:
 *  the whole instrument takes ONE shrink (so the geometry that was measured against the face's centre —
 *  the slip below the dial, the tape corner's margin against the feather — is re-derived, never
 *  re-eyeballed), and dark deepens its ground so the photograph's grain stops showing through the ink.
 *  Like the rest of this suite these are source contracts: the page is the spec. */
const focus = readFileSync(join(__dirname, '..', 'screens', 'Focus.tsx'), 'utf8');

describe('the Focus dial draws at 75 % of its design size, on the centre it was built for', () => {
  it('one SHRINK drives every dial figure, and no figure is re-scaled by hand', () => {
    expect(focus).toMatch(/const SHRINK = 0\.75/);
    // the pointer's own design frame: its stem, arrowhead and hub are drawn in 282/141 and scaled by their box
    expect(focus).toContain('const DRAW = 282, DRAW_C = DRAW / 2;');
    expect(focus).toContain('const D = DRAW * SHRINK, C0 = D / 2;');
    expect(focus).toContain('const FACE = 236 * SHRINK, FACE_BOX = FACE + 3, FACE_R = FACE / 2;');
    expect(focus).toContain('const FEATHER_R = 122 * SHRINK;');
    // the rim ring keeps its ink (the width is NOT shrunk) so it stays legible at the smaller radius
    expect(focus).toContain('const PROG_R = 135 * SHRINK, PROG_W = 6');
  });

  it('the dial hangs from its old centre (217, 491), so every measured clearance keeps and most gain', () => {
    expect(focus).toContain('left: 217 - C0');
    expect(focus).toContain('top: 491 - C0');
  });

  it('the pointer is drawn in the 282-unit frame and scaled by its box, so the hand never drifts', () => {
    expect(focus).toContain('<Svg width={D} height={D} viewBox={`0 0 ${DRAW} ${DRAW}`}>');
    expect(focus).toContain('M${DRAW_C} ${DRAW_C + 14}L${DRAW_C} 54');
    expect(focus).toContain('M${DRAW_C} 34L${DRAW_C + 6.5} 58L${DRAW_C - 6.5} 58Z');
    expect(focus).toContain('<Circle cx={DRAW_C} cy={DRAW_C} r={6.5}');
  });
});

describe('dark grounds the page so the grain goes, and only then seals the face', () => {
  it('the desk scrim sinks, the paper lift thins — the grain the user read is what the 0.82 scrim left', () => {
    expect(focus).toContain('{ backgroundColor: c.desk, opacity: 0.9 }');
    expect(focus).toContain('{ backgroundColor: c.paper, opacity: 0.05 }');
    expect(focus).not.toContain('opacity: 0.82');
    expect(focus).not.toContain('opacity: 0.07 }');
  });

  it('only dark seals the artwork: 0.95 under the deepened scrim, the tuned 0.86 in light', () => {
    expect(focus).toMatch(/faceOp = dark \? 0\.95 : 0\.86/);
    expect(focus).toContain('opacity: faceOp');
    // the old theme-blind constant is gone, not merely unused
    expect(focus).not.toMatch(/const FACE_OP = 0\.86/);
  });
});
