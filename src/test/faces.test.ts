import { FACES, SKELETON, MESHES, meshFractions, gearGeometry, compositeSvg, dialPal, spinLayers, staticSvg, handSvg, engrave, type FaceId } from '../ui/clock/faces';
import { palettes, ONYX, DIAL } from '../tokens/theme';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const lum = (h: string) => { const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

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
    // written at every size the app actually draws a face at: 96 (Settings picker), 124 (Today) and 400 (the
    // contact sheet). The engine compensates weight and numeral size for the render scale, so these are three
    // genuinely different drawings and the point of writing all three is that they have to be looked at.
    for (const f of FACES) for (const dark of [false, true]) {
      const pal = dialPal(f, palettes.refined[dark ? 'dark' : 'light'], dark);
      for (const [i, secs] of [0, 1.7, 5.3].entries()) {
        const t = { h: 10, m: 10, s: 30 };
        for (const px of [96, 124, 400]) { const s = compositeSvg(f, pal, 'Newsreader', t, secs, px); expect(s.startsWith('<svg')).toBe(true); expect(s).not.toContain('NaN'); if (i === 0) writeFileSync(`/tmp/faces/${f.id}-${dark ? 'dark' : 'light'}${px === 400 ? '' : `-${px}`}.svg`, s); }
      }
    }
  });
  it('only faces with motion declare spin layers', () => { const ids = (['g', 'rb', 'c', 'sl', 's'] as FaceId[]).filter((i) => spinLayers(i, dialPal(FACES[0]!, palettes.refined.light, false)).length); expect(ids).toEqual(['g', 'rb', 'sl', 's']); });
  it('every moving part turns about the dial centre, inside its own viewBox', () => {
    const pal = dialPal(FACES[0]!, palettes.refined.light, false);
    for (const f of FACES) for (const l of spinLayers(f.id, pal)) {
      const vb = l.svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/)!.slice(1).map(Number);
      // the host lays the layer out as a square of side 2R centred on (x,y), so a turn about (0,0) inside that
      // box is a turn about the layer's own axis: the box has to be exactly centred and wide enough for the art
      expect(vb[0]).toBe(-vb[2]! / 2); expect(vb[1]).toBe(-vb[3]! / 2);
      expect(Math.max(...[...l.svg.matchAll(/[rc]="(-?[\d.]+)/g)].map((m) => Number(m[1])))).toBeLessThanOrEqual(vb[2]! / 2);
      expect(l.osc ? l.osc.swing : Math.abs(l.dps)).toBeGreaterThan(0);
    }
  });
  it('the same ornament drawing is used in both themes: no face is a near-black disc in the light theme', () => {
    for (const p of ['refined', 'original'] as const) for (const f of FACES) {
      expect(lum(dialPal(f, palettes[p].light, false).dial)).toBeGreaterThan(0.5);
      expect(lum(dialPal(f, palettes[p].dark, true).dial)).toBeLessThan(0.2);
    }
  });
  it('every dial colour comes from the palette, in both palettes and both themes, and stays legible', () => {
    for (const p of ['refined', 'original'] as const) for (const mode of ['light', 'dark'] as const) for (const f of FACES) {
      const c = palettes[p][mode], pal = dialPal(f, c, mode === 'dark'), tone = Object.values(c);
      // the dial ground is a MATERIAL (DIAL/ONYX), not a theme surface, so only its ink and accent have to come from the theme
      const MATERIALS: readonly string[] = [ONYX.dark, DIAL.light, DIAL.dark];
      for (const v of [pal.ink, pal.accent, ...(MATERIALS.includes(pal.dial) ? [] : [pal.dial])]) expect(tone).toContain(v);
      expect(cr(pal.ink, pal.dial)).toBeGreaterThanOrEqual(4.5);
      // the second hand and the Scales sub-seconds hand are hairlines in their own red-brown material: 3:1 as non-text
      expect(cr(pal.second, pal.dial)).toBeGreaterThanOrEqual(3);
    }
  });
  it('the faintest ornament tone the engine can emit is still a readable 3:1 against its own dial', () => {
    // tone() pre-mixes ink into the dial, so every engraved stroke reads the same on cream and on onyx. The
    // guard is on the tone itself, not on a per-theme branch, so a new ornament cannot reintroduce haze.
    for (const p of ['refined', 'original'] as const) for (const mode of ['light', 'dark'] as const) {
      const pal = dialPal(FACES[1]!, palettes[p][mode], mode === 'dark');
      for (const t of [0.5, 0.55, 0.6, 0.68, 0.7, 0.8, 0.85, 0.9, 0.95]) expect(cr(engrave(pal, t), pal.dial)).toBeGreaterThanOrEqual(3);
    }
  });
  it('nothing is stroked translucent any more — ornament is a flat tone, which is what stops it stacking into haze', () => {
    const pal = dialPal(FACES[0]!, palettes.refined.light, false);
    for (const f of FACES) for (const s of [staticSvg(f, pal, 'Newsreader'), ...spinLayers(f.id, pal).map((l) => l.svg), handSvg('hour', pal), handSvg('minute', pal), handSvg('second', pal)]) {
      expect(s).not.toMatch(/(stroke|fill)-opacity=/);
    }
  });
});

/**
 * R11: an element id inside a component that can be mounted twice. `staticSvg` emits exactly one — Scales and
 * Lily's `clipPath id="sc"`, which clips the scale band to r=62 — and two copies of that face really are mounted
 * at the same time: the live clock on Today and its thumbnail in Settings → Clock face. `inMountWindow` keeping
 * two screens mounted made that coexistence permanent rather than accidental.
 *
 * `qa/FINDINGS-UNSTATED.md` F-14 called this latent rather than broken, and it still is: `EXPO_GO_AUDIT` B11 saw
 * the case survive. So this does not claim a bug the renderer does not have — it claims that the *shape* is now
 * impossible, which is checkable here and was not before.
 */
describe('the one element id the dial engine emits is per-instance', () => {
  it('two composites of the same face never share an element id', () => {
    const f = FACES.find((x) => x.id === 'sl')!;
    const pal = dialPal(f, palettes.refined.dark, true);
    const idsOf = (s: string) => [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    const a = compositeSvg(f, pal, 'Newsreader', { h: 10, m: 10, s: 30 }, 0, 400, 'one');
    const b = compositeSvg(f, pal, 'Newsreader', { h: 10, m: 10, s: 30 }, 0, 400, 'two');
    // the id exists, so the test is not passing because the clip went away
    expect(idsOf(a)).toEqual(['scone']);
    expect(idsOf(a)).not.toEqual(idsOf(b));
    // and each document's own reference resolves inside itself
    expect(a).toContain('clip-path="url(#scone)"');
    expect(b).toContain('clip-path="url(#sctwo)"');
    expect(a).not.toContain('url(#sctwo)');
  });

  it('the clip is still doing its job at the default suffix, so the faces render unchanged', () => {
    const sl = FACES.find((x) => x.id === 'sl')!, s = staticSvg(sl, dialPal(sl, palettes.refined.dark, true), 'Newsreader', 400);
    expect(s).toContain('<clipPath id="sca"><circle r="62"/></clipPath>');
    expect(s).toContain('clip-path="url(#sca)"');
    // every other face emits no id at all
    for (const f of FACES) if (f.id !== 'sl') expect(staticSvg(f, dialPal(f, palettes.refined.light, false), 'Newsreader', 400)).not.toMatch(/\bid="/);
  });

  it('and no screen hardcodes an element id any more', () => {
    // Week's grid used to open with a `<Pattern id="hx">` that NOTHING filled — `rg 'url(#hx)'` returned no
    // hits, so it was markup that produced nothing, and it has been deleted rather than suffixed.
    // comments are stripped first, because the note recording the Week deletion has to quote the old id
    const code = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const rel of ['screens/Week.tsx', 'screens/Focus.tsx', 'ui/DayBar.tsx', 'ui/instruments/InstrumentBar.tsx', 'ui/PaperBg.tsx', 'ui/kit.tsx']) {
      expect({ rel, hardcoded: /id="[A-Za-z][\w-]*"/.test(code(rel)) }).toEqual({ rel, hardcoded: false });
    }
    // Focus's one pattern is now per-instance and XML-legal
    const focus = readFileSync(join(__dirname, '..', 'screens', 'Focus.tsx'), 'utf8');
    expect(focus).toMatch(/useId\(\)\.replace\(\/\[\^a-zA-Z0-9_-\]\/g, ''\)/);
    expect(focus).toContain('fill={`url(#${hid})`}');
  });
});
