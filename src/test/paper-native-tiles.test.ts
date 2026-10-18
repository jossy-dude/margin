import { readFileSync } from 'fs';
import { join } from 'path';

/* W2: on device the native paper arrived as ONE dense block of grain in the
 * top-left corner with bare paper everywhere else. `Image resizeMode="repeat"` is not a layout on
 * Android — Fresco's `TilePostprocessor` bakes a single bitmap the size of the View *at the moment the
 * image arrives* and draws it through `ScaleTypeStartInside`, which never scales up and is anchored
 * top-left. None of that is reachable from JavaScript, so tiling is a layout decision now: both native
 * textures render an explicit Yoga grid of `Image` tiles (`Tiles`), each stretched to its `px` box.
 *
 * This reads the component as text, so it cannot see a texture. What it can see is the construct that
 * must not come back — and this regression is invisible off-device, because the web path is a CSS
 * background that would stay perfect while the phone went back to a corner block. */
const raw = readFileSync(join(__dirname, '..', 'ui', 'PaperBg.tsx'), 'utf8');
const rawApp = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
const code = decomment(raw);
const app = decomment(rawApp);

/** The comments in both files name the removed constructs verbatim, so strip them: the pins are about
 *  code, and a prose mention must neither satisfy nor break one. */
function decomment(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/gm, '$1');
}

/** The line that mounts the tile grid for one texture. It has to be the ternary's `:` arm: the web's `?`
 *  arm is a CSS background, and `Tiles` landing there would leave native untiled again. */
function nativeArm(tile: string): string {
  const line = code.split('\n').find((l) => l.includes(`<Tiles src={${tile}}`));
  if (!line) throw new Error(`PaperBg.tsx mounts no <Tiles src={${tile}}> — the native ${tile} branch is not the grid`);
  expect(line).toMatch(/^\s*:\s*<Animated\.View/);
  return line;
}

describe('the native paper tiles with a grid, not with resizeMode="repeat"', () => {
  it('no branch asks the platform to repeat an image', () => {
    expect(code).not.toContain('resizeMode="repeat"');
    expect(code).not.toContain("resizeMode='repeat'");
    // Non-vacuity: the prose still names it, so this pin would catch a re-introduced attribute rather
    // than passing because the phrase is absent from the file as a whole.
    expect(raw).toContain('resizeMode="repeat"');
  });

  it('the grid is measured from the window and each tile is stretched to its box', () => {
    // No postprocessor, no platform-chosen size: `useWindowDimensions()` is the area Android draws in,
    // and `stretch` makes the tile fill exactly the `px` box Yoga gave it.
    expect(code).toMatch(/const \{ width, height \} = useWindowDimensions\(\)/);
    expect(code).toMatch(/<Image key=\{i\} source=\{src\} resizeMode="stretch"/);
  });

  it('the grain branch renders the grid, at GRAIN_PX', () => {
    expect(nativeArm('GRAIN_SRC')).toContain('px={GRAIN_PX}');
  });

  it('the photo branch renders the grid, at PHOTO_PX', () => {
    expect(nativeArm('PHOTO_SRC')).toContain('px={PHOTO_PX}');
  });

  it('native and web tile at one size, from one shared pair of constants', () => {
    // paper-texture.test.ts already owns the web's numbers (GRAIN_PX = 256, PHOTO_PX = the JPEG's real
    // width) and the `backgroundSize` interpolation, so pinning those again here would double-book them.
    // What only native needs is that `Tiles` is handed that same pair, which is what the two arms and
    // this declaration line together prove.
    expect(code).toMatch(/const GRAIN_PX = 256, PHOTO_PX = 520;/);
  });
});

describe('the status bar names its own colour instead of inheriting a black default', () => {
  it("imports StatusBar from 'react-native', not from the expo wrapper", () => {
    // expo-status-bar forwards only animated/hidden/barStyle/showHideTransition
    // (`NativeStatusBarWrapper.tsx:26-32`), so React Native filled the missing `backgroundColor` from
    // `window.statusBarColor` — `#000000` on the non-edge-to-edge vehicles, Android 13/14.
    const imp = app.split('\n').find((l) => l.includes("from 'react-native'"))!;
    expect(imp).toContain('StatusBar');
    expect(app).not.toMatch(/from 'expo-status-bar'/);
    expect(rawApp).toContain('expo-status-bar'); // the prose still discusses the wrapper it replaced
  });

  it('the rendered status bar is given the paper colour', () => {
    expect(app).toMatch(/<StatusBar [^>]*backgroundColor=\{c\.paper\}/);
  });
});
