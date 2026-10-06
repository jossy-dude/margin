import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ART, ART_R, BALANCE, ESC_DEG, ESC_TEETH, FACES, MESHES, SKELETON, TONE, dialPal, engrave, escapementAngle,
  escapementTurn, hair, meshPhase, spinLayers, staticSvg, sw, handSvg, type FaceId, type FaceSpec,
} from '../ui/clock/faces';
import { palettes, PENS, SECOND, type Colors } from '../tokens/theme';

/**
 * The clock engine's two contracts, both of which used to be broken and neither of which a number can catch:
 *
 *  A. NOTHING SUB-PIXEL.  Every drawing goes into one fixed 200-unit box, so `u` units is `u * px / 200`
 *     device pixels.  The html engine compensated (`w = x => max(x, 200/px * .5)`) and the port dropped the render
 *     size, which left 48 chapter ticks 0.43 px wide in the 96 dp Settings picker — antialiased into a broken dash,
 *     and 48 broken dashes in a ring is grain.  These tests hold the floor at every size the app draws at.
 *  B. EVERY FIGURE HAS ITS OWN VELOCITY.  A centre artifact that moves as one uniform spin is a loading icon.
 *
 * and the Focus dial's, which is the other half of the owner's complaint:
 *
 *  C. THE COUNTDOWN IS A MECHANISM.  Continuous and derived, with a discrete asymmetric release, and nothing that
 *     carries meaning moves.  Nothing scales.
 */

const lum = (h: string) => { const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const themeOf = (p: 'refined' | 'original', m: 'light' | 'dark'): Colors => palettes[p][m];
const palOf = (f: FaceSpec, p: 'refined' | 'original', m: 'light' | 'dark') => dialPal(f, themeOf(p, m), m === 'dark');

/** every size the app actually draws a face at: Settings picker, Today, Focus dial, and the contact sheet */
const SIZES = [96, 124, 182, 196, 200, 400];
const widths = (svg: string) => [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
const radii = (svg: string) => [...svg.matchAll(/r="([\d.]+)"/g)].map((m) => Number(m[1]));

describe('A. nothing is drawn thinner than the rasteriser can render', () => {
  it('the floor is half a device pixel at every real size, and only below 200 does it bite', () => {
    expect(hair(400)).toBe(0.25);   // a 400 dp render: nothing is ever sub-pixel, the floor is inert
    expect(hair(200)).toBe(0.5);    // the reference size
    expect(hair(124)).toBeCloseTo(0.81, 2);
    expect(hair(96)).toBeCloseTo(1.04, 2);
    // a hairline that was 0.9 units — the stippled chapter ticks — is now never thinner than the floor
    expect(sw(96, 0.9)).toBeCloseTo(hair(96), 2);
    expect(sw(400, 0.9)).toBe(0.9);
  });

  it('no face puts a load-bearing rule under half a device pixel, at any size, in either theme', () => {
    for (const px of SIZES) for (const f of FACES) for (const p of ['refined', 'original'] as const) for (const m of ['light', 'dark'] as const) {
      const got = widths(staticSvg(f, palOf(f, p, m), 'Newsreader', px));
      expect(got.length).toBeGreaterThan(0);
      for (const w of got) {
        const thin = w < hair(px) - 1e-6;
        expect({ face: f.id, px, palette: p, theme: m, w, floor: hair(px), thin }).toEqual({ face: f.id, px, palette: p, theme: m, w, floor: hair(px), thin: false });
      }
    }
  });

  it('the same holds for every centre artifact and for the hands', () => {
    for (const px of SIZES) for (const f of FACES) {
      const pal = palOf(f, 'refined', 'light');
      // 's' is skipped here on purpose: its wheels come out of the locked gearSvg/balanceSvg, covered below
      if (f.id !== 's') for (const l of spinLayers(f.id, pal, px)) for (const w of widths(l.svg))
        expect({ face: f.id, px, w, thin: w < hair(px) - 1e-6 }).toEqual({ face: f.id, px, w, thin: false });
      for (const k of ['hour', 'minute', 'second'] as const) for (const w of widths(handSvg(k, pal, px)))
        expect(w).toBeGreaterThanOrEqual(hair(px) - 1e-6);
    }
  });

  it('the Skeleton wheel train is the one documented exemption: the gear is locked, so its weights stay put', () => {
    // qa/COORDINATION.md §3 bans touching gearSvg/balanceSvg, and they keep literal weights below the floor at 96 dp.
    // It is a real trade, not a shrug: the wheels read anyway because what you see on a wheel is its fill, not its
    // outline. If the lock is ever lifted, this test fails and the floor gets applied instead.
    const s = FACES.find((f) => f.id === 's')!, pal = palOf(s, 'refined', 'light');
    const below = spinLayers('s', pal, 96).flatMap((l) => widths(l.svg)).filter((w) => w < hair(96) - 1e-6);
    expect(below.length).toBeGreaterThan(0);
    // ...but the plate the movement is drawn on — pitch circles, bridge, jewels — is not the gear, and is floored
    for (const w of widths(staticSvg(s, pal, 'Newsreader', 96))) expect(w).toBeGreaterThanOrEqual(hair(96) - 1e-6);
  });

  it('numerals never fall below 8 device px, because below that they are a smudge and not a numeral', () => {
    for (const f of FACES) {
      const big = Number(staticSvg(f, palOf(f, 'refined', 'light'), 'Newsreader', 400).match(/font-size="([\d.]+)"/)![1]);
      const small = Number(staticSvg(f, palOf(f, 'refined', 'light'), 'Newsreader', 96).match(/font-size="([\d.]+)"/)![1]);
      expect(big).toBeGreaterThanOrEqual(f.ns);
      expect(small).toBeGreaterThanOrEqual((200 / 96) * 8);
      expect(small).toBeGreaterThan(big); // a 96 dp picker gets a proportionally larger numeral
    }
  });

  it('a dense weave thins with the plate instead of merging into a grey disc, and gains weight as it thins', () => {
    // 20 half-pixel ellipses in a 96 px dial is a grey circle. Fewer, heavier lines is what a rose engine does on
    // a small plate, and it is the only reason the centre reads at 96 dp at all.
    const pal = palOf(FACES[0]!, 'refined', 'light');
    const lines = (px: number) => (ART.guilloche(pal, px).match(/<ellipse/g) ?? []).length;
    expect(lines(400)).toBe(20); expect(lines(200)).toBe(14); expect(lines(96)).toBe(8);
    expect(ART.guilloche(pal, 96)).toContain('opacity="0.82"');
    expect(ART.guilloche(pal, 400)).toContain('opacity="0.62"');
    expect((ART.latOut(pal, 96).match(/<circle/g) ?? []).length).toBe(10);
    expect((ART.latOut(pal, 400).match(/<circle/g) ?? []).length).toBe(18);
  });

  it('a dense mesh composites as one group, so its crossings cannot stack into a puddle', () => {
    const pal = palOf(FACES[0]!, 'refined', 'light');
    for (const [name, art] of [['guilloche', ART.guilloche(pal, 200)], ['latOut', ART.latOut(pal, 200)], ['latIn', ART.latIn(pal, 200)]] as const) {
      const groups = art.match(/<g /g) ?? [];
      expect({ name, groups: groups.length, stray: /stroke-opacity|fill-opacity/.test(art) }).toEqual({ name, groups: groups.length, stray: false });
      expect(art.startsWith('<g opacity=')).toBe(true);
      // every stroke inside is the flat ink, so the mesh tone is a function of the group and nothing else
      expect(art.match(new RegExp(`stroke="[^"]+"`, 'g'))).toEqual([`stroke="${pal.ink}"`]);
    }
  });
});

describe('B. every centre artifact has its own velocity', () => {
  const pal = palOf(FACES[0]!, 'refined', 'light');
  const moving = FACES.filter((f) => spinLayers(f.id, pal, 200).length);

  it('a face with no ornament does not claim motion, and a face with ornament does', () => {
    expect(spinLayers('c', pal, 200)).toEqual([]);            // Celtic Knot is a static engraving
    expect(moving.map((f) => f.id)).toEqual(['g', 'rb', 'sl', 's']);
  });

  it('no face that moves more than one part moves them all at one speed', () => {
    const multi = moving.filter((f) => spinLayers(f.id, pal, 200).filter((l) => !l.osc).length > 1).map((f) => f.id);
    expect(multi).toEqual(['rb', 's']);          // only these two have more than one turning part
    for (const id of multi) {
      // signed, not magnitude: Rosette's two lattices run at +12 and −12, which is two velocities and one figure.
      // Collapsing to |dps| would call that a uniform spin, which is exactly what it is not.
      const speeds = new Set(spinLayers(id as FaceId, pal, 200).filter((l) => !l.osc).map((l) => l.dps));
      expect({ id, distinctSpeeds: [...speeds].length, speeds: [...speeds] }).toEqual({ id, distinctSpeeds: expect.any(Number), speeds: expect.any(Array) });
      expect([...speeds].length).toBeGreaterThan(1);
    }
  });

  it("Rosette Blanc's two lattices counter-rotate at equal and opposite speed (prompt.md V4)", () => {
    const [a, b] = spinLayers('rb', pal, 200);
    expect([a!.dps, b!.dps]).toEqual([12, -12]);
    // and they are offset by half a step, which is what makes the weave slide instead of just spin
    const firstOffset = (l: typeof a) => Number(l!.svg.match(/transform="rotate\(([\d.-]+)\)"/)![1]);
    expect(firstOffset(a)).toBe(0);
    expect(firstOffset(b)).toBeCloseTo(360 / 9 / 2, 3);
  });

  it("the Skeleton's wheels obey their gear ratio and its balance oscillates instead of spinning", () => {
    const ls = spinLayers('s', pal, 200), bal = ls.find((l) => l.osc)!;
    expect(ls.filter((l) => !l.osc).map((l) => l.dps)).toEqual([18, -28.8, 24, -32]);
    expect(bal.dps).toBe(0);
    expect(bal.osc).toEqual({ swing: 105, period: 0.8 });
  });

  it('the centre artifact is sized so the Focus capsule cannot cover it', () => {
    // Focus draws the face at FACE=196 over a 200-unit viewBox, and its readout capsule claims 22 units of the
    // 282-unit dial. This is the invariant behind "make the centre artifact fully visible": without it the old
    // 104-unit disc claimed 57 units and hid every artifact on every face.
    const k = 196 / 200, CAP_R = 22;
    expect(ART_R * k).toBeGreaterThan(CAP_R + 12);
    // and the artifact is on every face that has one, so no face can ship with a centre the readout swallows
    for (const id of ['g', 'rb'] as FaceId[]) expect(spinLayers(id, palOf(FACES[0]!, 'refined', 'light'), 196).map((l) => l.R * k).every((r) => r > CAP_R)).toBe(true);
  });
});

describe('C. the countdown is a mechanism, not a pulse', () => {
  it('one tooth per second: the turn is derived, continuous and monotonic', () => {
    expect(ESC_TEETH).toBe(30);
    expect(ESC_DEG).toBe(12);
    expect(escapementTurn(0)).toBe(0);
    expect(escapementTurn(1)).toBe(12);            // exactly one tooth per elapsed second
    expect(escapementTurn(30)).toBe(360);          // and one full turn per half minute
    expect(escapementTurn(25 * 60)).toBe(18_000);  // a 25-minute round turns it fifty times
    let prev = -1;
    for (let s = 0; s <= 600; s += 0.37) { const v = escapementTurn(s); expect(v).toBeGreaterThan(prev); prev = v; }
    // derived, not stepped: any sub-second remainder lands between two whole seconds
    expect(escapementTurn(10.5)).toBeCloseTo(126, 6);
  });

  it('the release is discrete, asymmetric, and bounded — it must not read as a breath', () => {
    // the shape the sequence runs: 0 → 1 in 38 ms, back through rest to −0.42 in 62 ms, then to 0 in 90 ms
    const at = (kick: number) => escapementAngle(10, kick);
    expect(at(0)).toBe(-120);
    expect(at(1)).toBe(-118.3);        // impulse: 1.7° forward against the turn
    expect(at(-0.42)).toBeCloseTo(-120.714, 6);   // overshoot PAST rest, which is what a sprung lever does
    expect(at(0)).toBe(-120);
    // asymmetric: it spends longer coming back than it takes to leave, and it overshoots, so the two halves of the
    // cycle are different shapes — the opposite of a scale pulse
    expect(at(1) - at(0)).toBeCloseTo(1.7, 6);
    expect(at(0) - at(-0.42)).toBeCloseTo(0.714, 6);
    expect(0.714).toBeLessThan(1.7);
  });

  it('the numeral never moves: nothing in the Focus dial scales the readout', () => {
    const focus = readFileSync(join(__dirname, '../screens/Focus.tsx'), 'utf8');
    // the old countdown was `scale: 1 + tick.value * 0.045` on the readout; that shape is gone for good
    expect(focus).not.toMatch(/scale:\s*1\s*\+\s*tick\.value/);
    // and the readout's type and size are untouched
    expect(focus).toContain('<Txt f="type" s={27}');
    // the only transform on the escapement is a rotation
    expect(focus.match(/escapementAngle\(elapsed\.value, kick\.value\)/g)!.length).toBe(1);
  });

  it('the frame loops are gated: a hidden or still dial runs no frames', () => {
    const clock = readFileSync(join(__dirname, '../ui/clock/ClockFace.tsx'), 'utf8');
    // `useFrameCallback`'s second argument is only read at mount, so the real gate is the explicit setActive
    expect(clock).toContain('const ticking = live && !fixed;');
    expect(clock).toContain('frame.setActive(ticking)');
    // and the static path never builds a frame loop at all
    expect(clock).toContain('if (!live && !hands && !fixed)');

    const focus = readFileSync(join(__dirname, '../screens/Focus.tsx'), 'utf8');
    // the escapement turns only while a round is counting, and never under reduce-motion
    expect(focus).toContain('spin.setActive(running && !reduce)');
    expect(focus).toContain('if (!running || reduce) { kick.value = 0; return; }');
    // both hosts pass the screen they are on, so an off-screen clock is not ticking either
    for (const [host, prop] of [['Today', "live={st.route === 'Today'}"], ['Focus', 'live={route === \'Focus\'}']] as const)
      expect({ host, ok: readFileSync(join(__dirname, `../screens/${host}.tsx`), 'utf8').includes(prop) }).toEqual({ host, ok: true });
  });
});

describe('D. the second hand is a material of its own, not the theme accent', () => {
  it('the sweep hand and the Scales sub-seconds both read pal.second', () => {
    const pal = dialPal(FACES[0]!, themeOf('refined', 'light'), false);
    expect(handSvg('second', pal, 200)).toContain(`stroke="${pal.second}"`);
    // and the hand and the hour/minute hands are never the same ink
    expect(handSvg('hour', pal, 200)).toContain(`stroke="${pal.ink}"`);
    expect(spinLayers('sl', pal, 200)[0]!.svg).toContain(`stroke="${pal.second}"`);
  });

  it('pal.second is the red-brown material, not the accent and not a literal in faces.ts', () => {
    // The sweep hand is a *material* (lacquered red-brown steel, prompt.md V4), so it does not follow the
    // accent pen: `refined.dark.acc` is #E0A47A, a pale peach that reads grey at hairline width. It comes
    // from tokens/theme.ts like ONYX and DIAL, never from a hex pasted into the engine.
    for (const m of ['light', 'dark'] as const) {
      expect(dialPal({ native: 'light' }, themeOf('refined', m), m === 'dark').second).toBe(SECOND[m]);
    }
    // deliberately independent of both the pen and the palette: changing those must not repaint the hand
    for (const p of ['refined', 'original'] as const) for (const pen of ['red', 'blue'] as const) {
      const c = { ...themeOf(p, 'light'), acc: PENS[pen].light };
      expect(dialPal({ native: 'light' }, c, false).second).toBe(SECOND.light);
    }
    // The whole point of the token: `refined.dark.acc` is #E0A47A and `SECOND.dark` is not. (In LIGHT the
    // two coincide — refined's light accent already is that red-brown — so the assertion belongs in dark.)
    expect(themeOf('refined', 'dark').acc).not.toBe(SECOND.dark);
    expect(dialPal({ native: 'light' }, themeOf('refined', 'dark'), true).second).not.toBe(themeOf('refined', 'dark').acc);
  });

  it('whatever it resolves to, the sweep hand clears 3:1 against its own dial in every palette and theme', () => {
    for (const p of ['refined', 'original'] as const) for (const m of ['light', 'dark'] as const) for (const f of FACES) {
      const pal = palOf(f, p, m);
      expect({ p, m, cr: cr(pal.second, pal.dial) >= 3 }).toEqual({ p, m, cr: true });
    }
  });
});

describe('E. the engraving ramp is a ramp, and it holds in both palettes', () => {
  it('the tone hierarchy is strictly ordered, so ornament can never out-weigh structure', () => {
    expect(TONE.texture).toBeLessThan(TONE.sub);
    expect(TONE.sub).toBeLessThan(TONE.figure);
    expect(TONE.figure).toBeLessThan(TONE.structure);
    for (const t of Object.values(TONE)) expect(t).toBeGreaterThanOrEqual(0.6);
  });

  it('every tone the engine emits is readable against its own dial, on both grounds', () => {
    for (const p of ['refined', 'original'] as const) for (const m of ['light', 'dark'] as const) {
      const pal = dialPal({ native: 'light' }, themeOf(p, m), m === 'dark');
      for (const t of Object.values(TONE)) expect({ p, m, t, cr: cr(engrave(pal, t), pal.dial) >= 3 }).toEqual({ p, m, t, cr: true });
    }
  });

  it('the smallest plate a face is ever drawn at still leaves its artifact inside its own viewBox', () => {
    for (const px of SIZES) for (const f of FACES) {
      const pal = palOf(f, 'refined', 'light');
      for (const l of spinLayers(f.id, pal, px)) {
        const vb = l.svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/)!.slice(1).map(Number);
        expect({ face: f.id, px, centred: vb[0] === -vb[2]! / 2 && vb[1] === -vb[3]! / 2 }).toEqual({ face: f.id, px, centred: true });
        expect(Math.max(...radii(l.svg).map(Math.abs))).toBeLessThanOrEqual(vb[2]! / 2 + 0.5);
      }
    }
  });
});

describe('the gear lock held', () => {
  it('the train, its centres, its ratio and its balance are the committed numbers', () => {
    // qa/COORDINATION.md §3: the gear is the app's own engineering and must not change. If any of these moves,
    // the clock's most loved artifact has been edited by mistake.
    expect(MESHES).toEqual([[0, 1], [1, 2], [0, 3]]);
    expect(SKELETON.map((g) => [g.n, g.m, g.x, g.y, g.w, g.spokes, g.t])).toEqual([
      [16, 2, -18, 12, 18, 4, 0.5], [10, 2, 8, 12, -28.8, 0, 0.62],
      [12, 2, 22.1413, -4.853, 24, 3, 0.4], [9, 2, -8.4329, 35.097, -32, 0, 0.55],
    ]);
    expect(BALANCE).toEqual({ x: 29, y: 33, period: 0.8, swing: 105 });
  });

  it('the phases are still solved, not typed in: each is what meshPhase derives from the one before it', () => {
    // the phases are computed, so "byte-identical" has to mean "still derived from RAW by the same solver", not
    // "equal to some literal" — a literal would be the one thing prompt.md N7 forbids.
    const raw = SKELETON.map((g) => ({ n: g.n, m: g.m, x: g.x, y: g.y, t: g.t, w: g.w, spokes: g.spokes }));
    expect(SKELETON[0]!.ph).toBe(0);
    for (const [a, b] of MESHES) expect(SKELETON[b]!.ph).toBeCloseTo(meshPhase(SKELETON[a]!, raw[b]!), 9);
  });

  it('and the render-size floor cannot reach the gear: neither locked function takes a size', () => {
    const src = readFileSync(join(__dirname, '../ui/clock/faces.ts'), 'utf8');
    const gear = src.slice(src.indexOf('export function gearSvg'), src.indexOf('/* Skeleton movement'));
    expect(gear).toContain('export function gearSvg(g: Gear, pal: Pal)');
    expect(gear).toContain('export function balanceSvg(pal: Pal)');
    expect(gear).not.toContain('px');
    expect(gear).not.toContain('sw(');
  });
});

describe('the face list itself', () => {
  it('still ships five, in Settings order, with the two light-native faces first', () => {
    expect(FACES.map((f) => f.id)).toEqual(['g', 'rb', 'c', 'sl', 's']);
    expect(FACES.slice(0, 2).map((f) => f.native)).toEqual(['light', 'light']);
    expect(FACES.map((f) => f.id).every((id) => ['g', 'rb', 'c', 'sl', 's'].includes(id as FaceId))).toBe(true);
  });
});