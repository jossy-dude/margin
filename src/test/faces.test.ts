import { FACES, SKELETON, MESHES, meshFractions, gearGeometry, compositeSvg, dialPal, spinLayers, type FaceId } from '../ui/clock/faces';
import { writeFileSync, mkdirSync } from 'node:fs';

describe('skeleton gear train (real meshing, not eyeballed)', () => {
  it.each(MESHES)('wheels %i→%i: centre distance = rp+rp, speed = −ωA·NA/NB, positive root clearance (no tip hits a root)', (a, b) => {
    const A = SKELETON[a]!, B = SKELETON[b]!, d = Math.hypot(A.x - B.x, A.y - B.y), ga = gearGeometry(A), gb = gearGeometry(B);
    expect(d).toBeCloseTo(ga.rp + gb.rp, 2);
    expect(B.w).toBeCloseTo((-A.w * A.n) / B.n, 2);
    expect(d - ga.ra - gb.rf).toBeGreaterThanOrEqual(0.2); expect(d - gb.ra - ga.rf).toBeGreaterThanOrEqual(0.2);
  });
  it.each(MESHES)('wheels %i→%i: a tooth meets a space at the contact, and keeps meeting it as they turn', (a, b) => {
    const A = SKELETON[a]!, B = SKELETON[b]!;
    for (const t of [0, 0.37, 2.9, 11.3]) {
      const turn = (g: typeof A) => ({ ...g, ph: g.ph + g.w * t }), { fa, fb } = meshFractions(turn(A), turn(B));
      const sum = (((fa + fb) % 1) + 1) % 1; expect(Math.abs(sum - 0.5)).toBeLessThan(1e-6);
    }
  });
});
describe('faces', () => {
  it('ships five distinct faces, none of the removed duplicates', () => { expect(FACES.map((f) => f.id)).toEqual(['g', 'rb', 'c', 'sl', 's']); expect(new Set(FACES.map((f) => f.n)).size).toBe(5); });
  it('renders every face in both themes at three moments and writes them for the visual check', () => {
    mkdirSync('/tmp/faces', { recursive: true });
    for (const f of FACES) for (const dark of [false, true]) {
      const pal = dialPal(f, dark, dark ? '#E0A47A' : '#8A4B27');
      for (const [i, secs] of [0, 1.7, 5.3].entries()) { const s = compositeSvg(f, pal, 'Newsreader', { h: 10, m: 10, s: 30 }, secs); expect(s.startsWith('<svg')).toBe(true); expect(s).not.toContain('NaN'); if (i === 0) writeFileSync(`/tmp/faces/${f.id}-${dark ? 'dark' : 'light'}.svg`, s); }
    }
  });
  it('only faces with motion declare spin layers', () => { const ids = (['g', 'rb', 'c', 'sl', 's'] as FaceId[]).filter((i) => spinLayers(i, dialPal(FACES[0]!, false, '#000')).length); expect(ids).toEqual(['rb', 'sl', 's']); });
});
