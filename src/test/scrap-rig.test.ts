/** Scrap's rig: the poses a screen asks for, and where a finger or a caret puts his eyes. (Replaces the
 *  Teddy `numLook` tests: the Rive bear was removed for the cut-paper mascot.) */
import { gazeAlong, gazeAt, MOODS } from '../ui/mascot/scrap-rig';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Scrap moods', () => {
  it('every mood names a mouth that exists as a paper piece, and lids stay in 0…1', () => {
    for (const [name, p] of Object.entries(MOODS)) {
      expect(existsSync(join(__dirname, '..', '..', 'assets', 'paper', `scrap-mouth-${p.mouth}.webp`))).toBe(true);
      for (const v of [p.lidTop, p.lidLow]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
      expect(p.say.length).toBeGreaterThan(0);
      expect(name).toMatch(/^[a-z]+$/);
    }
  });
  it('happy and proud squint from below (smiling eyes); sleepy closes from above', () => {
    expect(MOODS.happy.lidLow).toBeGreaterThan(0.4);
    expect(MOODS.proud.lidLow).toBeGreaterThan(0.4);
    expect(MOODS.sleepy.lidTop).toBeGreaterThan(0.4);
  });
});

describe('gaze', () => {
  it('looks toward a finger and saturates instead of overshooting', () => {
    const r = gazeAt(80, -40), far = gazeAt(4000, 0);
    expect(r.x).toBeGreaterThan(0); expect(r.y).toBeLessThan(0);
    expect(far.x).toBeLessThan(1); expect(far.x).toBeGreaterThan(0.99);
    expect(gazeAt(0, 0)).toEqual({ x: 0, y: 0 });
  });
  it('reads along a name left to right, looking down at the field', () => {
    expect(gazeAlong(0).x).toBeCloseTo(-0.75);
    expect(gazeAlong(11).x).toBeCloseTo(0);
    expect(gazeAlong(99).x).toBeCloseTo(0.75);
    expect(gazeAlong(5).y).toBeGreaterThan(0);
  });
});

describe('every piece Scrap draws is generated and bundled', () => {
  it('lists each bitmap the component requires', () => {
    const src = readFileSync(join(__dirname, '..', 'ui', 'mascot', 'Scrap.tsx'), 'utf8');
    const files = [...src.matchAll(/assets\/paper\/([\w-]+\.webp)/g)].map((m) => m[1]!);
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of files) expect(existsSync(join(__dirname, '..', '..', 'assets', 'paper', f))).toBe(true);
  });
});
