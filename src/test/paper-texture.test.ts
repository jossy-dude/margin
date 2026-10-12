import { readFileSync } from 'fs';
import { join } from 'path';

/* Every texture is tiled at its OWN natural size.
 *
 * `tiled()` used to hardcode '256px 256px' for both textures. That is exact for grain.png, which IS
 * 256 square — so the bug was invisible for nine textures' worth of testing and showed up only on the
 * photograph, t1.jpg at 520 square, which was rescaled to 49% and repeated every 256 px across the
 * whole app. The owner's report was "the background image is not well aligned".
 *
 * This reads the real bytes rather than trusting a comment, so swapping an asset without moving its
 * tile size fails here instead of shipping as ragged paper. */
const TEX = join(__dirname, '..', '..', 'assets', 'textures');

/** Intrinsic pixel size of a PNG or a baseline JPEG, read from the file's own header. */
function sizeOf(file: string): [number, number] {
  const b = readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return [b.readUInt32BE(16), b.readUInt32BE(20)]; // PNG IHDR
  for (let i = 2; i < b.length - 9;) {                                    // JPEG: walk to the SOF frame header
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1] ?? -1;                                   // indexed reads are `number | undefined` here
    if (m === 0xd8 || m === 0xd9 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 5), b.readUInt16BE(i + 7)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`no size found for ${file}`);
}

describe('a tiled paper texture is as big as the bitmap it tiles', () => {
  const src = readFileSync(join(__dirname, '..', 'ui', 'PaperBg.tsx'), 'utf8');
  const constant = (name: string) => {
    // matches `const GRAIN_PX = 256` and the `, PHOTO_PX = 520` that shares its declaration
    const m = new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(src);
    if (!m) throw new Error(`${name} is not declared in PaperBg.tsx`);
    return Number(m[1]);
  };

  it('grain tiles at its own 256 px square', () => {
    expect(sizeOf(join(TEX, 'grain.png'))).toEqual([256, 256]);
    expect(constant('GRAIN_PX')).toBe(256);
  });

  it("the photograph tiles at its own size, not at grain's", () => {
    const [w, h] = sizeOf(join(TEX, 't1.jpg'));
    // non-square assets cannot be expressed by one backgroundSize square at all
    expect(w).toBe(h);
    expect(constant('PHOTO_PX')).toBe(w);
  });

  it('the photograph is not still pointed at grain’s tile size', () => {
    // the regression itself: the photo layer must name PHOTO_PX...
    const photoLine = src.split('\n').find((l) => l.includes('tiled(PHOTO_WEB'))!;
    expect(photoLine).toContain('PHOTO_PX');
    // ...and `tiled` must interpolate the size it is given rather than baking one in. Checked against
    // the implementation line, not the file, because the prose above documents the old literal.
    const impl = src.split('\n').find((l) => l.includes('backgroundSize:'))!;
    expect(impl).toContain('${px}px');
    expect(impl).not.toMatch(/\d+px/);
  });
});
