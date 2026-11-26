/** D14 (v0.7.8.7): Notebook is one skin. "Original" was Refined with a cooler desk and nothing else. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { withDefaults, LOOK_V } from '../domain/defaults';

describe('Notebook: one skin', () => {
  it('a phone that chose Original reads as Notebook (refined)', () => {
    expect(withDefaults({ palette: 'original', lookV: LOOK_V }).palette).toBe('refined');
  });
  it('the other skins are left alone', () => {
    for (const p of ['collage', 'plain', 'refined', 'daylight'] as const) expect(withDefaults({ palette: p, lookV: LOOK_V }).palette).toBe(p);
  });
  it('Settings offers no Refined / Original choice any more', () => {
    const src = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
    expect(src).not.toContain("['original', 'Original']");
  });
});
