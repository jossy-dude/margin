/** E3 (D2a, v0.7.8.8): paper edges are traced once per shape and shared across mounts. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { edgeCacheSize, handPath, handPathCached, tornPaths, tornPathsCached } from '../ui/hand';

const C = { h: [8, 8, 8, 8], v: [8, 8, 8, 8] };
describe('edge cache', () => {
  it('the same shape gives the same path object, at the rounded size', () => {
    const a = handPathCached(300.3, 66.2, C, 42), b = handPathCached(299.8, 65.9, C, 42);
    expect(a).toBe(b);
    expect(a).toBe(handPath(300, 66, C, 42));
  });
  it('a different seed, size, corners or amplitude is its own path', () => {
    const a = handPathCached(300, 66, C, 42);
    expect(handPathCached(300, 66, C, 43)).not.toBe(a);
    expect(handPathCached(301, 66, C, 42)).not.toBe(a);
    expect(handPathCached(300, 66, { h: [4, 4, 4, 4], v: [4, 4, 4, 4] }, 42)).not.toBe(a);
    expect(handPathCached(300, 66, C, 42, 0.55)).not.toBe(a);
  });
  it('torn edges too', () => { expect(tornPathsCached(200.4, 80, 7)).toEqual(tornPaths(200, 80, 7)); });
  it('stays bounded on a long list', () => {
    for (let i = 0; i < 2000; i++) handPathCached(300, 60 + (i % 400), C, i);
    expect(edgeCacheSize()).toBeLessThanOrEqual(1600);
  });
  it('HandBox draws from the cache', () => {
    const kit = readFileSync(join(__dirname, '..', 'ui', 'kit.tsx'), 'utf8');
    expect(kit).toContain('handPathCached(sz.w, sz.h');
    expect(kit).toContain('tornPathsCached(sz.w, sz.h, sd)');
  });
});
