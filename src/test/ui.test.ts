import { palettes, RG } from '../tokens/theme';
import { handPath, outline, scaleRadii } from '../ui/hand';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const lum = (h: string) => { const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/**
 * Every text/background pair the app can actually draw, checked in BOTH palettes and BOTH themes.
 *
 * It used to assert sixteen pairs for `refined` only, which is how `qa/FINDINGS-UNSTATED.md` F-06 could be
 * true and the suite green: in `original`, `mut`/`hl` is 4.02 and `mut`/`desk` is 4.03. `COORDINATION.md` §4
 * says *"extend it rather than weakening it"*, so this is an extension and not a replacement — the original
 * sixteen rows are all still here, and they now run in all four combinations.
 *
 * The third column is where each pair is drawn, and it is the reason this table can be trusted: every row is
 * a pair a reader can go and look at in the source. A pair that is *not* drawn has no row — it is asserted
 * as a negative below, so the two facts cannot be confused. Adding a row for a pair the palette cannot
 * deliver is how this suite would quietly start asserting something false.
 */
type Reach = [fg: string, bg: string, where: string];
const PAIRS: Reach[] = [
  ['ink', 'paper', 'every page: the ScrollView over PaperBg'],
  ['ink', 'card', 'every card: HandBox default fill'],
  ['mut', 'paper', 'captions on a page'],
  ['mut', 'card', 'captions on a card, and Sheet (PaperBg card)'],
  ['ink', 'hl', 'the highlighted title on an important note; the Tight box; a selected clock thumb'],
  ['acc', 'paper', 'the + button glyph and the selected-tab pill'],
  ['acc', 'card', 'Focus dial caption on its hub'],
  ['ok', 'card', 'a Here/Sick chip and the Done swatch'],
  ['warn', 'card', 'a late due-time, the Tight mark on a task card'],
  ['bad', 'card', 'an absent cell, an overdue task card'],
  ['ink', 'desk', "the Focus page's margin note over the desk-scrimmed photograph (dark); the dial's bed ring and escapement left with the redesign"],
  ['slabInk', 'slab', 'the Focus dial hub and the Settings bar-picker slab title'],
  ['slabMut', 'slab', 'the Settings bar-picker slab caption'],
  ['onAcc', 'acc', 'a primary button, a selected chip, the + button'],
  ['deckInk', 'deck', 'every word on the Today command deck'],
  ['deckMut', 'deck', 'the deck\'s position line and its After row'],
];
describe('every text/background pair the app draws clears 4.5:1 — in BOTH palettes and BOTH themes', () => {
  for (const name of ['refined', 'original'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      const c = palettes[name][mode];
      it.each(PAIRS)(`${name}.${mode}: %s on %s — %s`, (fg, bg, _where) => {
        expect(cr((c as never)[fg], (c as never)[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  /**
   * The two rules the reachable table exists to enforce, stated on their own so that a future
   * surface cannot be painted with a token that happens to pass today.
   *
   *  1. **`hl` takes `ink`.** It is the only text token that clears 4.5 on the highlight in all four
   *     combinations, which is why the important-note card, the Tight box and the selected clock thumb all
   *     print ink on it and keep the accent/amber on the stroke. `mut`/`hl` fails in `original.dark` and
   *     `warn`/`hl` fails in `original.light`; neither may be used for text there again.
   *  2. **`ink` is the floor, not `mut`, for anything on `desk`.** `mut`/`desk` is 4.03 in
   *     `original.light`.
   */
  it('the highlight and the desk only take ink as text, in every combination', () => {
    for (const name of ['refined', 'original'] as const) for (const mode of ['light', 'dark'] as const) {
      const c = palettes[name][mode];
      for (const bg of ['hl', 'desk'] as const) expect(cr(c.ink, c[bg])).toBeGreaterThanOrEqual(4.5);
    }
    // and the two failures that motivated the rule, pinned so nobody re-introduces them by accident
    expect(cr(palettes.original.dark.mut, palettes.original.dark.hl)).toBeLessThan(4.5);
    expect(cr(palettes.original.light.warn, palettes.original.light.hl)).toBeLessThan(4.5);
    expect(cr(palettes.original.light.mut, palettes.original.light.desk)).toBeLessThan(4.5);
  });

  /**
   * The pairs the reachable table deliberately does NOT assert, asserted here as negatives. They are the
   * three live failures `qa/FINDINGS-UNSTATED.md` F-06 found, they are fixed at the use site rather than in
   * the palette, and if any of them ever clears 4.5 it will be because someone re-valued `ORIGINAL` — which
   * `COORDINATION.md` §4 forbids. So the numbers are pinned from both sides: reachable rows must pass, these
   * must still fail, and the table must not have grown a row for one of them.
   */
  it('none of the three known failures has been papered over, and the table has not grown a row for one', () => {
    expect(cr(palettes.original.dark.mut, palettes.original.dark.hl)).toBeLessThan(4.5);      // mut on a highlight
    expect(cr(palettes.original.light.warn, palettes.original.light.hl)).toBeLessThan(4.5);    // warn words on a highlight
    expect(cr(palettes.original.light.mut, palettes.original.light.desk)).toBeLessThan(4.5);   // mut on the dial bed
    const asserted = new Set(PAIRS.map(([fg, bg]) => `${fg}/${bg}`));
    for (const bad of ['mut/hl', 'warn/hl', 'mut/desk', 'ink/deck']) expect(asserted.has(bad)).toBe(false);
    expect(PAIRS.every(([fg, bg]) => fg !== bg)).toBe(true);
  });
});
describe('the palette invariants that are not contrast', () => {
  it('dark paper is not pitch black and light paper is lighter than the original desk', () => {
    expect(lum(palettes.refined.dark.paper)).toBeGreaterThan(0.018);
    expect(lum(palettes.refined.light.desk)).toBeGreaterThan(lum(palettes.original.light.desk));
  });
  it('every palette keeps its own values: both names still exist and all four modes are populated', () => {
    expect(Object.keys(palettes).sort()).toEqual(['original', 'refined']);
    for (const p of Object.values(palettes)) for (const mode of ['light', 'dark'] as const) expect(p[mode].paper).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
describe('hand-drawn geometry', () => {
  it('scales overflowing elliptical radii exactly like CSS', () => {
    const r = scaleRadii(RG, 340, 120); expect(r.f).toBeCloseTo(120 / 269, 5);
    expect(r.h[0]).toBeCloseTo(255 * (120 / 269), 4); expect(r.v[3]).toBeCloseTo(255 * (120 / 269), 4);
    expect(scaleRadii(RG, 2000, 2000).f).toBe(1);
  });
  it('outline stays inside its box and the path is closed, deterministic and seed-dependent', () => {
    for (const [x, y] of outline(300, 90, RG)) { expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(300 + 1e-6); expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(90 + 1e-6); }
    const a = handPath(300, 90, RG, 3), b = handPath(300, 90, RG, 3), c = handPath(300, 90, RG, 4);
    expect(a).toBe(b); expect(a).not.toBe(c); expect(a.endsWith('Z')).toBe(true); expect(handPath(1, 1, RG, 1)).toBe('');
  });
});

/* ------------------------------------------------------------------ WAV, no dependencies.
   The manifest is written by the same script that writes the audio, so grading the manifest
   against itself proves nothing. Everything below opens the real bytes. */
interface Wav { x: Float64Array; rate: number }
function readWav(path: string): Wav {
  const b = readFileSync(path);
  if (b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WAVE') throw new Error(`${path}: not RIFF/WAVE`);
  let off = 12, rate = 0, bits = 0, fmt = 0, ch = 1, data: Buffer | null = null;
  while (off + 8 <= b.length) {
    const id = b.toString('latin1', off, off + 4), sz = b.readUInt32LE(off + 4);
    if (id === 'fmt ') { fmt = b.readUInt16LE(off + 8); ch = b.readUInt16LE(off + 10); rate = b.readUInt32LE(off + 12); bits = b.readUInt16LE(off + 22); }
    else if (id === 'data') data = b.subarray(off + 8, Math.min(off + 8 + sz, b.length));
    off = off + 8 + sz + (sz % 2);
  }
  if (!data || fmt !== 1 || bits !== 16) throw new Error(`${path}: expected 16-bit PCM`);
  const n = Math.floor(data.length / 2 / ch), x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = (data.readInt16LE(i * 2 * ch) as number) / 32768;
  return { x, rate };
}
/** 2nd-order RBJ section, Q defaulting to Butterworth. */
function biquad(x: Float64Array, type: 'lp' | 'hp', f: number, rate: number, q = 0.7071): Float64Array {
  const w = (2 * Math.PI * f) / rate, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al, y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const o = (b0 * (x[i] as number) + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i] as number; y2 = y1; y1 = o; y[i] = o; }
  return y;
}
const rms = (x: Float64Array) => { let s = 0; for (const v of x) s += v * v; return Math.sqrt(s / x.length); };
/** 200 Hz-8 kHz RMS: the band a phone speaker can actually reproduce. */
const bandRms = (x: Float64Array, rate: number) => rms(biquad(biquad(x, 'hp', 200, rate), 'lp', 8000, rate));
/** Energy-weighted spectrum: sub-200 Hz share and spectral centroid.
    N=4096 at hop=512, and short files are centred in the frame. Both matter: a 45 ms tick is one
    frame, and content sitting at the start of the frame lands where a Hann window is shut, which
    would report pure leakage instead of the sound. */
function spectrum(x: Float64Array, rate: number) {
  const N = 4096, hop = 512, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const pad = x.length < N ? (N - x.length) >> 1 : 0, m = x.length + 2 * pad;
  let low = 0, tot = 0, num = 0;
  for (let s = 0; s < m; s += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N && s + i < m; i++) { const j = s + i - pad; if (j >= 0 && j < x.length) re[i] = (x[j] as number) * (win[i] as number); }
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i] as number; re[i] = re[j] as number; re[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const h = len / 2, ur = re[i + k] as number, ui = im[i + k] as number; const vr = (re[i + k + h] as number) * cr - (im[i + k + h] as number) * ci, vi = (re[i + k + h] as number) * ci + (im[i + k + h] as number) * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + h] = ur - vr; im[i + k + h] = ui - vi; const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc; } }
    }
    for (let k = 1; k < N / 2; k++) { const e = (re[k] as number) ** 2 + (im[k] as number) ** 2, f = (k * rate) / N; tot += e; if (f < 200) low += e; num += f * e; }
  }
  return { sub200: tot ? (100 * low) / tot : 100, centroid: tot ? num / tot : 0 };
}
const stats = (x: Float64Array, rate: number) => {
  let peak = 0, sum = 0;
  for (const v of x) { const a = Math.abs(v); if (a > peak) peak = a; sum += v; }
  return { seconds: x.length / rate, peak, dc: sum / x.length, bandDb: 20 * Math.log10(bandRms(x, rate)), ...spectrum(x, rate) };
};

const LIVE = join(__dirname, '../../assets/sounds');
const CAND = join(__dirname, '../../assets/sounds-candidates');
/** Every sound src/services/fx.ts can ask for. nudge is new: the off-track warning had been
    borrowing tick.wav, so muting the clock also silenced the warning. */
const EXPECTED = ['blip', 'break-start', 'bump', 'clack', 'crumple', 'detent-1', 'detent-2', 'detent-3', 'detent-4', 'done', 'flutter', 'notify', 'nudge', 'place', 'round-done', 'shuffle', 'stamp-absent', 'stamp-cancel', 'stamp-here', 'stamp-late', 'stamp-sick', 'tape-peel', 'thud', 'thunk', 'tick', 'tock', 'toggle-off', 'toggle-on'];
/** Fired faster than the eye can follow, so these must stay inside the 30-120 ms window. */
const RAPID = ['tick', 'tock', 'toggle-on', 'toggle-off', 'clack', 'detent-1', 'detent-2', 'detent-3', 'detent-4'];

describe('synthesised sounds', () => {
  const m = JSON.parse(readFileSync(join(LIVE, 'manifest.json'), 'utf8')) as Record<string, { seconds: number; peak: number; dc: number; clipped: number }>;
  it('every sound is short, never clips and has no DC offset', () => {
    expect(Object.keys(m).length).toBeGreaterThanOrEqual(25);
    for (const [k, v] of Object.entries(m)) { expect([k, v.clipped]).toEqual([k, 0]); expect(Math.abs(v.dc)).toBeLessThan(0.01); expect(v.seconds).toBeLessThan(1.3); expect(v.seconds).toBeGreaterThan(0.04); }
  });
  it('the live manifest matches the bytes on disk, not just itself', () => {
    for (const [k, v] of Object.entries(m)) {
      const w = readWav(join(LIVE, `${k}.wav`)), s = stats(w.x, w.rate);
      expect({ sound: k, seconds: +s.seconds.toFixed(3) }).toEqual({ sound: k, seconds: v.seconds });
      // the manifest stores a float-rounded value, so compare to the precision it claims
      expect({ sound: k, peak: +s.peak.toFixed(3) }).toEqual({ sound: k, peak: +v.peak.toFixed(3) });
      expect(s.peak).toBeLessThan(1);
      expect(Math.abs(s.dc)).toBeLessThan(0.01);
    }
  });
});
describe('candidate palette (audition set, not yet wired into the app)', () => {
  const files = readdirSync(CAND).filter((f) => f.endsWith('.wav')).map((f) => f.replace('.wav', '')).sort();
  it('covers exactly the sounds fx.ts asks for, no gaps and no strays', () => {
    expect(files).toEqual(EXPECTED);
    expect(files).toHaveLength(28);
  });
  const all = new Map(files.map((n) => { const w = readWav(join(CAND, `${n}.wav`)); return [n, stats(w.x, w.rate)] as const; }));
  it('the spectral metric is trustworthy (a 1 kHz tone must measure as 1 kHz, not as leakage)', () => {
    const x = new Float64Array(Math.round(0.3 * 44100));
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 44100);
    const s = spectrum(x, 44100);
    expect(s.centroid).toBeGreaterThan(950); expect(s.centroid).toBeLessThan(1050); expect(s.sub200).toBeLessThan(1);
  });
  it('nothing clips and no candidate carries a DC offset', () => {
    for (const [n, s] of all) {
      expect({ sound: n, peak: s.peak < 1 }).toEqual({ sound: n, peak: true });
      expect({ sound: n, dc: Math.abs(s.dc) < 0.001 }).toEqual({ sound: n, dc: true });
    }
  });
  it('no sound buries its energy below 200 Hz, where a phone speaker has no output', () => {
    for (const [n, s] of all) expect({ sound: n, sub200: +s.sub200.toFixed(1) < 40 }).toEqual({ sound: n, sub200: true });
  });
  it('the dial ratchet gets brighter with every step of drag speed, and never dulls', () => {
    const c = [1, 2, 3, 4].map((i) => (all.get(`detent-${i}`) as { centroid: number }).centroid);
    expect(c[0]!).toBeLessThan(c[1]!); expect(c[1]!).toBeLessThan(c[2]!); expect(c[2]!).toBeLessThan(c[3]!);
    expect((c[3] as number) / (c[0] as number)).toBeGreaterThan(1.5);
  });
  it('effective loudness is matched across the set, so no candidate is buried or blasts', () => {
    const d = [...all.values()].map((s) => s.bandDb);
    expect(Math.max(...d) - Math.min(...d)).toBeLessThan(6);
  });
  it('rapid-fire sounds stay inside the 30-120 ms window and nothing runs long', () => {
    for (const n of RAPID) { const s = all.get(n) as { seconds: number }; expect({ sound: n, rapid: s.seconds >= 0.03 && s.seconds <= 0.12 }).toEqual({ sound: n, rapid: true }); }
    for (const [n, s] of all) { expect({ sound: n, len: s.seconds > 0.03 && s.seconds < 1.3 }).toEqual({ sound: n, len: true }); }
  });
});