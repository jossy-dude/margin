/**
 * v0.6 — the paper texture is drawn in code. The photograph and the crumpled sheet are gone (owner:
 * "too dark … the crumple"), so nothing here decodes a bitmap: one seeded tile of flecks, as an SVG pattern.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { grainOn, paperFlecks } from '../ui/paper-flecks';
import { skyPhase, sunRays } from '../ui/collage/sky';
import { DEFAULT_SETTINGS } from '../domain/defaults';

describe('the drawn paper', () => {
  it('is the same tile every time: the flecks are seeded, not random', () => {
    expect(paperFlecks()).toEqual(paperFlecks());
    expect(paperFlecks(1)).not.toEqual(paperFlecks(2));
  });
  it('keeps every fibre inside the tile, so none is cut at a seam', () => {
    for (const f of paperFlecks().fibres) { const [x, y] = f.d.slice(1).split('q')[0]!.split(' ').map(Number); expect(x).toBeGreaterThanOrEqual(10); expect(x).toBeLessThanOrEqual(122); expect(y).toBeGreaterThanOrEqual(10); expect(y).toBeLessThanOrEqual(122); }
  });
  it('reads a stored crumple or photo as grain, and only "none" as none', () => {
    expect(['crumple', 'photo', 'grain'].map(grainOn)).toEqual([1, 1, 1]);
    expect(grainOn('none')).toBe(0);
    expect(DEFAULT_SETTINGS.texture).toBe('grain');
  });
  it('ships no texture bitmap', () => {
    for (const f of ['textures/t1.jpg', 'textures/grain.png', 'paper/crumple.webp']) expect(existsSync(join(__dirname, '..', '..', 'assets', f))).toBe(false);
  });
});

describe('the sun on the first page', () => {
  it('follows the clock: dawn, day, dusk, night', () => {
    expect([5, 7, 8, 16, 17, 19, 20, 4, 0].map(skyPhase)).toEqual(['dawn', 'dawn', 'day', 'day', 'dusk', 'dusk', 'night', 'night', 'night']);
  });
  it('has twelve rays', () => { expect((sunRays(50).match(/M/g) ?? []).length).toBe(12); });
});
