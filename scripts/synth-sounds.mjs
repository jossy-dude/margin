// Deterministic synthesis of every UI sound. Seeded noise => byte-identical output on every run.
//
//   node scripts/synth-sounds.mjs              -> rewrites assets/sounds-candidates/ (the audition set)
//   node scripts/synth-sounds.mjs --live       -> rewrites assets/sounds/ (only once the set is approved)
//
// The live folder is never touched by a bare run. Every recipe is built from the same material
// vocabulary: card stock, masking tape, pencil, rubber stamps and a knurled brass dial.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SR = 44100;
const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = join(HERE, '..', 'assets', 'sounds');
const CAND = join(HERE, '..', 'assets', 'sounds-candidates');

const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mk = (sec) => new Float64Array(Math.ceil(sec * SR));

function biquad(x, type, f, q = 0.7071) {
  const w = (2 * Math.PI * f) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; }
  else if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al, y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const o = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}
const env = (t, att, dec) => (t < att ? t / att : 1) * Math.exp((-6.9 * Math.max(0, t - att)) / dec);
/** A peak-normalised band of noise: the raw material of every paper, tape and ink sound here. */
function burst(r, sec, f, q, dec, att = 0.0012, type = 'bp') {
  const x = mk(sec); for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1;
  const y = biquad(x, type, f, q);
  let pk = 1e-9; for (let i = 0; i < y.length; i++) pk = Math.max(pk, Math.abs(y[i]));
  for (let i = 0; i < y.length; i++) y[i] = (y[i] / pk) * env(i / SR, att, dec);
  return y;
}
function tone(sec, f0, f1, dec, shape = 'sine', att = 0.002) {
  const x = mk(sec); let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR, f = f0 * Math.pow(f1 / f0, t / sec); ph += (2 * Math.PI * f) / SR;
    const s = shape === 'square' ? (Math.sin(ph) >= 0 ? 0.6 : -0.6) : shape === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : Math.sin(ph);
    x[i] = s * env(t, att, dec);
  }
  return x;
}
/** The felt body of an impact. Its glide endpoint never dives below the phone's audible floor. */
const BODY_FLOOR = 185;
const body = (sec, f0, f1, dec, att = 0.0035) => tone(sec, f0, Math.max(f1, BODY_FLOOR), dec, 'triangle', att);
/** The flat contact of a palm or a card on the desk: 600-1200 Hz is what a phone speaker actually reproduces. */
const slap = (r, sec, f, dec, q = 0.7, att = 0.0015) => burst(r, sec, f, q, dec, att, 'lp');
/** A short dry stroke of a nib or a pencil: bright, band-limited, no pitch. */
const stroke = (r, sec, f, q, dec, att = 0.002) => burst(r, sec, f, q, dec, att);
/** Struck brass / school bell: inharmonic partials, never an equal-tempered interval. */
const metal = (f, sec, amp, decay) => { const x = mk(sec); [[1, 1], [2.02, 0.5], [2.98, 0.3], [4.16, 0.19], [5.43, 0.11], [6.79, 0.06]].forEach(([m, a]) => { const p = tone(sec, f * m, f * m, decay * (1 / (0.55 + 0.45 * m)), 'sine', 0.0012); for (let i = 0; i < x.length; i++) x[i] += p[i] * a * amp; }); return x; };
function add(dst, src, at = 0, g = 1) { const o = Math.round(at * SR); for (let i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * g; }
const crunch = (x, drive) => { const k = Math.tanh(drive); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive) / k; return x; };

const S = {}, NOTE = {};
const R = (n) => rng(1000 + n);
/* Saturation sweet spot: above ~1.6 the tanh harmonic floor swamps the band and the sound gets duller, not crunchier. */
const DRIVE = 1.4;

// ---------------------------------------------------------------- paper
NOTE.place = 'a card laid down on the desk: soft card slap, then the edge settles';
/* 0.22s, not 0.42. The page placement is 200ms (see navigation/window.ts PLACE_MS), and a sound tail longer
 * than the gesture it belongs to becomes the perceived duration of the interaction — which is exactly the
 * "it takes half a second" complaint the faster transition was meant to remove. Same attack and the same
 * three layers (paper body, card slap, two edge strokes), only the decay is tighter: shortening the release
 * rather than truncating the file, so it cannot read as a cut.
 * NOTE on loudness: `encode` normalises every sound to the same 200Hz-8kHz RMS, so perceived level is matched
 * automatically and needs no per-sound trim. The peak RISES from 0.80 to the 0.97 ceiling because a shorter
 * tail is a denser transient (crest 19.2dB vs the old file's) — that is peak headroom, not loudness. It is
 * still 1.8dB of headroom below clipping, which is what `ui.test.ts` asserts. */
S.place = (() => { const r = R(1), o = mk(0.22); add(o, body(0.20, 250, 190, 0.11), 0, 0.7); add(o, slap(r, 0.09, 850, 0.055), 0, 0.85); add(o, stroke(r, 0.07, 2600, 0.9, 0.06), 0.006, 0.22); add(o, stroke(r, 0.07, 1400, 1.2, 0.07), 0.04, 0.16); return o; })();
NOTE.shuffle = 'four card edges squared on the desk, then one firm tap';
S.shuffle = (() => { const r = R(2), o = mk(0.30); add(o, body(0.06, 230, 195, 0.03), 0, 0.28); const at = [0, 0.042, 0.084, 0.126, 0.168]; at.forEach((t, i) => add(o, stroke(r, 0.07, 2400 + r() * 2400, 0.9 + r() * 0.7, 0.03 + 0.01 * r(), 0.0018), t + r() * 0.008, 0.62 - 0.02 * i)); add(o, slap(r, 0.09, 700, 0.042), 0.166, 0.5); return o; })();
NOTE.crumple = 'a sheet crushed in the fist: dense crackle that builds fast, then lets go';
S.crumple = (() => { const r = R(3), o = mk(0.40); const mass = mk(0.38); for (let i = 0; i < mass.length; i++) mass[i] = r() * 2 - 1; const m = biquad(mass, 'lp', 1400, 0.6); for (let i = 0; i < m.length; i++) { const t = i / SR; m[i] *= Math.min(1, t / 0.012) * Math.exp(-3.4 * t); } add(o, m, 0, 0.5); for (let t = 0; t < 0.33; t += 0.0022 + r() * 0.009 * (1 + t * 2.4)) add(o, burst(r, 0.006, 1800 + r() * 5200, 1 + r() * 3, 0.0028, 0.0003), t, (0.3 + 0.7 * r()) * Math.min(1, 0.3 + t * 4) * Math.sqrt(Math.max(0, 1 - t / 0.35))); add(o, slap(r, 0.09, 620, 0.045), 0.31, 0.4); crunch(o, DRIVE); return o; })();
NOTE.thud = 'a folder slapped flat on the desk: weight you feel, weight you can hear';
S.thud = (() => { const r = R(4), o = mk(0.24); add(o, body(0.22, 215, 190, 0.085), 0, 0.8); add(o, slap(r, 0.12, 620, 0.045), 0, 0.9); add(o, stroke(r, 0.09, 1500, 5, 0.05), 0, 0.13); return o; })();
NOTE.flutter = 'a page falling through air, fluttering on its own edge';
S.flutter = (() => { const r = R(5), x = mk(0.42); for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1; const y = biquad(x, 'bp', 2200, 0.55); for (let i = 0; i < y.length; i++) { const t = i / SR; y[i] *= Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 13 * t - 1.2), 2) * Math.min(1, t / 0.008) * Math.exp(-2.6 * t); } return y; })();
// ---------------------------------------------------------------- the old clock
NOTE.tick = 'clock escapement, the high half of the beat';
S.tick = (() => { const r = R(6), o = mk(0.045); add(o, stroke(r, 0.038, 2900, 9, 0.0105, 0.0004), 0, 1); add(o, tone(0.032, 1500, 1150, 0.006, 'sine', 0.0005), 0, 0.38); add(o, stroke(r, 0.02, 4200, 14, 0.004, 0.0003), 0, 0.16); return o; })();
NOTE.tock = 'clock escapement, the low half: same wood, duller and a touch slower';
S.tock = (() => { const r = R(7), o = mk(0.045); add(o, stroke(r, 0.038, 1850, 7, 0.0135, 0.0004), 0, 1); add(o, tone(0.032, 900, 700, 0.0105, 'sine', 0.0005), 0, 0.46); add(o, stroke(r, 0.02, 3300, 12, 0.005, 0.0003), 0, 0.14); return o; })();
// ---------------------------------------------------------------- rubber stamps
/* A real ink stamp is two sounds: the press, then the rubber peeling off the sheet. The peel is
   what carries on a phone, so it is never quieter than the press. */
NOTE['stamp-here'] = 'the attendance stamp: pressed down, then peeled back off the paper';
S['stamp-here'] = (() => { const r = R(8), o = mk(0.18); add(o, body(0.09, 240, 190, 0.035), 0, 0.55); add(o, slap(r, 0.05, 700, 0.02), 0, 0.5); add(o, stroke(r, 0.06, 950, 1.3, 0.022), 0.038, 0.7); add(o, stroke(r, 0.03, 5200, 1, 0.01), 0.034, 0.11); return o; })();
NOTE['stamp-late'] = 'the same stamp, pressed faster and lighter: it knows it is late';
S['stamp-late'] = (() => { const r = R(9), o = mk(0.16); add(o, body(0.08, 285, 215, 0.03), 0, 0.45); add(o, slap(r, 0.045, 900, 0.018), 0, 0.45); add(o, stroke(r, 0.05, 1150, 1.4, 0.018), 0.03, 0.62); add(o, stroke(r, 0.04, 1350, 1.6, 0.014), 0.055, 0.2); return o; })();
NOTE['stamp-absent'] = 'pressed, held, then dragged away: the ink never gets to settle';
S['stamp-absent'] = (() => { const r = R(10), o = mk(0.34); add(o, body(0.14, 205, 190, 0.06), 0, 0.6); add(o, slap(r, 0.08, 620, 0.03), 0, 0.55); const sm = mk(0.20); for (let i = 0; i < sm.length; i++) sm[i] = r() * 2 - 1; const s1 = biquad(sm, 'lp', 1100, 0.6); for (let i = 0; i < s1.length; i++) { const t = i / SR; s1[i] *= Math.min(1, t / 0.05) * Math.exp(-2.6 * t); } add(o, s1, 0.03, 0.4); add(o, stroke(r, 0.09, 700, 1.1, 0.04), 0.2, 0.45); add(o, body(0.08, 200, 190, 0.04), 0.2, 0.2); return o; })();
NOTE['stamp-sick'] = 'two light presses, the second one losing its nerve';
S['stamp-sick'] = (() => { const r = R(11), o = mk(0.26); [0, 0.075].forEach((t, i) => { const g = 1 - i * 0.3; add(o, body(0.07, 255, 200, 0.028), t, 0.4 * g); add(o, slap(r, 0.04, 800, 0.016), t, 0.4 * g); add(o, stroke(r, 0.05, 1000, 1.2, 0.02), t + 0.026, 0.5 * g); }); return o; })();
NOTE['stamp-cancel'] = 'three dry pen strokes across the name';
S['stamp-cancel'] = (() => { const r = R(12), o = mk(0.19); add(o, body(0.07, 235, 190, 0.035), 0, 0.42); [3400, 4100, 5000].forEach((f, i) => add(o, stroke(r, 0.11, f, 1.6, 0.05, 0.004), i * 0.038, 0.5 - i * 0.06)); return o; })();
// ---------------------------------------------------------------- done / bell / toggles
NOTE.done = 'a pencil tick across the box, then the pen settling back on the paper';
S.done = (() => { const r = R(13), o = mk(0.34); add(o, stroke(r, 0.07, 2400, 1.1, 0.038, 0.003), 0, 0.45); add(o, stroke(r, 0.11, 1700, 0.9, 0.062, 0.004), 0.055, 0.6); add(o, stroke(r, 0.025, 6000, 1, 0.008), 0.06, 0.09); add(o, slap(r, 0.07, 900, 0.04), 0.13, 0.5); add(o, body(0.12, 215, 190, 0.05), 0.13, 0.3); add(o, stroke(r, 0.05, 3000, 1.2, 0.02), 0.19, 0.2); return o; })();
NOTE.notify = 'one strike of the school bell on the brass';
S.notify = (() => { const r = R(14), o = mk(0.85); add(o, metal(620, 0.82, 0.9, 0.42), 0, 0.9); add(o, stroke(r, 0.03, 3000, 1, 0.012), 0, 0.35); add(o, stroke(r, 0.04, 1200, 2, 0.02), 0, 0.2); return o; })();
NOTE['toggle-on'] = 'a masking-tape tab pulled tight: it grips';
S['toggle-on'] = (() => { const r = R(15), o = mk(0.075); add(o, body(0.04, 250, 190, 0.02), 0, 0.3); add(o, stroke(r, 0.035, 2200, 1.4, 0.016), 0, 0.4); add(o, stroke(r, 0.04, 2800, 3, 0.02), 0.022, 0.8); add(o, stroke(r, 0.02, 5200, 1.2, 0.008), 0.02, 0.12); return o; })();
NOTE['toggle-off'] = 'the same tab let go: it drops, no snap';
S['toggle-off'] = (() => { const r = R(16), o = mk(0.075); add(o, body(0.045, 235, 190, 0.025), 0, 0.25); add(o, stroke(r, 0.04, 1900, 1.3, 0.018), 0, 0.45); add(o, stroke(r, 0.05, 1000, 2, 0.03), 0.018, 0.6); return o; })();
// ---------------------------------------------------------------- the knurled brass dial
/* Four velocity layers. Brightness is carried by the GAIN BALANCE between the pawl click, the HF
   tick and the body, not by the bandpass width: widening the filter is swamped by the saturation
   and leaves the centroid flat. Slow drag = soft click, fast drag = bright tick + more brass ring. */
NOTE['detent-1'] = 'the pawl, barely engaged: a slow drag';
NOTE['detent-2'] = 'the pawl catching: a steady drag';
NOTE['detent-3'] = 'the pawl biting and the wheel ringing: a quick drag';
NOTE['detent-4'] = 'the pawl slamming the knurl: a fast drag';
[0.25, 0.5, 0.75, 1].forEach((k, i) => { S[`detent-${i + 1}`] = (() => { const r = R(20 + i), o = mk(0.075), att = 0.0016 - 0.0011 * k; add(o, stroke(r, 0.045, 2000 + k * 1250, 1.7, 0.020, att), 0, 0.85 - 0.15 * k); add(o, stroke(r, 0.035, 1400 + k * 520, 1.4, 0.013, att), 0.011, 0.42); add(o, stroke(r, 0.045, 4400, 12, 0.034 - 0.010 * k, att * 0.8), 0.004, 0.05 + 0.45 * k); add(o, stroke(r, 0.04, 1150 + 350 * k, 6, 0.030, 0.001), 0.002, 0.15 - 0.07 * k); add(o, stroke(r, 0.035, 2600 + 900 * k, 8, 0.022 - 0.004 * k, att), 0.001, 0.2 * (k - 0.25)); add(o, body(0.06, 250, 190, 0.05), 0, 0.34 - 0.10 * k); crunch(o, DRIVE); return o; })(); });
NOTE.bump = 'the dial hits its end stop and the brass rings out';
S.bump = (() => { const r = R(30), o = mk(0.12); add(o, body(0.11, 240, 195, 0.04), 0, 0.8); add(o, slap(r, 0.05, 750, 0.02), 0, 0.9); add(o, stroke(r, 0.06, 1650, 7, 0.035), 0.002, 0.3); crunch(o, DRIVE); return o; })();
NOTE.thunk = 'the knob is engaged and pushed: felt, then brass';
S.thunk = (() => { const r = R(31), o = mk(0.19); add(o, body(0.18, 230, 190, 0.09), 0, 0.85); add(o, slap(r, 0.10, 680, 0.045, 0.6), 0, 0.8); add(o, stroke(r, 0.09, 1400, 6, 0.06), 0.004, 0.22); crunch(o, DRIVE); return o; })();
NOTE.clack = 'the collar latching into place, or tape pressed down hard';
S.clack = (() => { const r = R(32), o = mk(0.10); add(o, stroke(r, 0.045, 1250, 1.2, 0.02), 0, 0.9); add(o, body(0.09, 260, 200, 0.05), 0, 0.5); add(o, stroke(r, 0.02, 4000, 0.8, 0.008), 0, 0.15); crunch(o, 1.6); return o; })();
NOTE.blip = 'the teacher taps the page twice with the pen: off track';
S.blip = (() => { const r = R(33), o = mk(0.13); [0, 0.058].forEach((t, i) => { add(o, stroke(r, 0.035, 2000 - i * 500, 2.2 - i * 0.2, 0.016), t, 0.9 - i * 0.1); add(o, body(0.04, 250, 195, 0.02), t, 0.25); add(o, stroke(r, 0.02, 5000, 1, 0.005), t, 0.11); }); return o; })();
NOTE['round-done'] = 'the bell twice for the end of the round, then the register shut';
S['round-done'] = (() => { const r = R(34), o = mk(0.75); add(o, metal(660, 0.52, 0.85, 0.3), 0, 0.85); add(o, metal(620, 0.5, 0.6, 0.26), 0.23, 0.8); add(o, slap(r, 0.10, 380, 0.06, 0.6), 0, 0.5); add(o, body(0.12, 195, 190, 0.08), 0, 0.4); add(o, stroke(r, 0.05, 1500, 1.1, 0.03), 0, 0.3); return o; })();
// ---------------------------------------------------------------- break
NOTE['break-start'] = 'the school bell, softer, with the clapper rattling in its crown';
S['break-start'] = (() => { const r = R(35), o = mk(0.55); add(o, metal(700, 0.52, 0.7, 0.28), 0, 0.8); [0, 0.009, 0.019].forEach((t, i) => add(o, stroke(r, 0.03, 1600, 3, 0.014), t, 0.35 / (i + 1))); add(o, slap(r, 0.05, 600, 0.02), 0, 0.4); return o; })();
NOTE['tape-peel'] = 'masking tape lifted off the page: a rising zip, then the tab lets go';
S['tape-peel'] = (() => { const r = R(36), n = 0.42, x = mk(n); for (let i = 0; i < x.length; i++) x[i] = r() * 2 - 1; const lo = biquad(x, 'bp', 3000, 0.8), hi = biquad(x, 'bp', 4600, 0.8); let ph = 0; for (let i = 0; i < lo.length; i++) { const t = i / SR; ph += (2 * Math.PI * (55 + 40 * (t / n))) / SR; const am = (0.35 + 0.65 * Math.abs(Math.sin(ph))) * Math.min(1, t / 0.004) * Math.min(1, t / 0.010) * Math.exp(-1.1 * t); lo[i] = lo[i] * am * (1 - t / n) + hi[i] * am * (t / n); } const o = mk(0.44); add(o, lo, 0, 0.9); add(o, stroke(r, 0.07, 1400, 1.6, 0.03), 0.375, 0.45); add(o, body(0.05, 235, 190, 0.03), 0.375, 0.24); add(o, stroke(r, 0.02, 6000, 1, 0.008), 0.37, 0.08); return o; })();
// ---------------------------------------------------------------- the teacher's pen
/* Its own sound, not the clock tick: muting the tick must not mute the off-track warning. */
NOTE.nudge = 'the pen underlines a line twice: you are off track';
S.nudge = (() => { const r = R(37), o = mk(0.17); add(o, stroke(r, 0.05, 2600, 1.1, 0.028, 0.003), 0, 0.85); add(o, stroke(r, 0.05, 2100, 1.1, 0.03, 0.003), 0.038, 0.6); add(o, stroke(r, 0.08, 1500, 0.9, 0.05, 0.004), 0.076, 0.75); add(o, body(0.08, 235, 190, 0.04), 0.076, 0.35); add(o, stroke(r, 0.02, 4500, 0.8, 0.006), 0.08, 0.1); return o; })();

// ---------------------------------------------------------------- normalise + write
/* Loudness is matched on 200 Hz-8 kHz RMS, not full-band peak: a sound whose energy sits below
   200 Hz is inaudible on a phone speaker no matter how loud the file is. */
const TARGET_DB = -20.5, PEAK_CEIL = 0.97;
const bandRms = (x) => { const b = biquad(biquad(x, 'hp', 200), 'lp', 8000); let s = 0; for (let i = 0; i < b.length; i++) s += b[i] * b[i]; return Math.sqrt(s / b.length); };

function spectrum(x) {
  /* N=4096 at hop=512 (87.5% overlap). Two things matter here:
     - overlap: a 45 ms tick fits in ONE 4096 frame and Hann is ~0.01 at the frame edge, so a wide
       hop leaves the whole sound under the closed part of the window and only leakage survives.
     - centring: content at the very START of a short file (tick is 6 ms of sound in a 45 ms file)
       is never under any frame's thick part, because the only frame containing it starts at 0.
       Short files are zero-padded symmetrically to N so the sound sits under the window's middle. */
  const N = 4096, hop = 512, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const pad = x.length < N ? (N - x.length) >> 1 : 0, m = x.length + 2 * pad;
  let low = 0, tot = 0, num = 0;
  for (let s0 = 0; s0 < m; s0 += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N && s0 + i < m; i++) { const j = s0 + i - pad; if (j >= 0 && j < x.length) re[i] = x[j] * win[i]; }
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], h = len / 2; const vr = re[i + k + h] * cr - im[i + k + h] * ci, vi = re[i + k + h] * ci + im[i + k + h] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + h] = ur - vr; im[i + k + h] = ui - vi; const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc; } }
    }
    for (let k = 1; k < N / 2; k++) { const e = re[k] * re[k] + im[k] * im[k], f = (k * SR) / N; tot += e; if (f < 200) low += e; num += f * e; }
  }
  return { sub200: tot ? (100 * low) / tot : 0, centroid: tot ? num / tot : 0 };
}

function encode(data) {
  const n = data.length, fade = Math.round(0.004 * SR);
  for (let i = 0; i < n; i++) if (i > n - fade) data[i] *= (n - i) / fade;
  let mean = 0; for (let i = 0; i < n; i++) mean += data[i]; mean /= n;
  for (let i = 0; i < n; i++) data[i] -= mean;
  const g = Math.pow(10, TARGET_DB / 20) / bandRms(data);
  for (let i = 0; i < n; i++) data[i] *= g;
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(data[i]));
  if (pk > PEAK_CEIL) { const c = PEAK_CEIL / pk; for (let i = 0; i < n; i++) data[i] *= c; }
  const pcm = Buffer.alloc(n * 2);
  let sum = 0, clip = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, data[i]));
    if (Math.abs(v) >= 0.999) clip++;
    sum += v;
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return { buf: Buffer.concat([h, pcm]), clip, dc: sum / n };
}

const live = process.argv.includes('--live');
const OUT = live ? LIVE : CAND;
mkdirSync(OUT, { recursive: true });

/* `--only <name>[,<name>]` regenerates just those sounds and merges their rows into the existing manifest
 * instead of rewriting it. The live set is an APPROVED set: each file's peak was balanced by ear against
 * the others, so a full `--live` run re-grades all 28 and silently changes the mix. Use `--only` when one
 * sound's recipe changed. A bare run still writes every candidate, which is the audition path. */
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg > -1 ? process.argv[onlyArg + 1].split(',').map((s) => s.trim()) : null;
if (ONLY) for (const n of ONLY) if (!S[n]) { console.error(`unknown sound '${n}'`); process.exit(1); }
const NAMES = ONLY ?? Object.keys(S);

const rows = [], manifest = ONLY && existsSync(join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')) : {};
for (const name of NAMES) {
  const data = S[name];
  if (!data) continue;
  const { buf, clip, dc } = encode(data);
  writeFileSync(join(OUT, `${name}.wav`), buf);
  let peak = 0, sq = 0, bsq = 0;
  const b = biquad(biquad(data, 'hp', 200), 'lp', 8000);
  for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; sq += data[i] * data[i]; bsq += b[i] * b[i]; }
  const rms = Math.sqrt(sq / data.length), br = Math.sqrt(bsq / data.length);
  const sp = spectrum(data);
  const row = { name, sec: +(data.length / SR).toFixed(3), peak: +peak.toFixed(3), rmsDb: +(20 * Math.log10(rms)).toFixed(1), bandDb: +(20 * Math.log10(br)).toFixed(1), sub200: +sp.sub200.toFixed(1), centroid: Math.round(sp.centroid), crest: +(20 * Math.log10(peak / rms)).toFixed(1), clipped: clip, dc: +dc.toFixed(5) };
  rows.push(row);
  manifest[name] = { seconds: row.sec, peak: row.peak, dc: row.dc, clipped: clip };
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

const pad = (s, w) => String(s).padEnd(w);
console.log(`${live ? 'LIVE' : 'candidate'} -> ${OUT}`);
console.log(`${pad('sound', 15)}${pad('sec', 7)}${pad('peak', 7)}${pad('dBFS', 7)}${pad('BL dBFS', 9)}${pad('sub200%', 9)}${pad('centroid', 10)}${pad('crest', 7)}`);
for (const r of rows) console.log(`${pad(r.name, 15)}${pad(r.sec, 7)}${pad(r.peak, 7)}${pad(r.rmsDb, 7)}${pad(r.bandDb, 9)}${pad(r.sub200, 9)}${pad(r.centroid, 10)}${pad(r.crest, 7)}`);
const b = rows.map((r) => r.bandDb);
console.log(`n=${rows.length}  band spread=${(Math.max(...b) - Math.min(...b)).toFixed(1)} dB  max peak=${Math.max(...rows.map((r) => r.peak)).toFixed(3)}  max sub200=${Math.max(...rows.map((r) => r.sub200)).toFixed(1)}%  clipped=${rows.reduce((a, r) => a + r.clipped, 0)}  max|dc|=${Math.max(...rows.map((r) => Math.abs(r.dc))).toFixed(5)}`);

if (!live) {
  const lines = [
    'MARGIN - UI SOUND CANDIDATES', '',
    `Generated by scripts/synth-sounds.mjs. ${rows.length} candidates. Open each URL in a phone browser.`,
    `Loudness is matched on 200 Hz-8 kHz RMS (BL dBFS); the live assets/sounds/ set is untouched until you approve.`,
    'sub200% = share of spectral energy below 200 Hz, i.e. what a phone speaker cannot reproduce.', '',
    `${pad('sound', 15)}${pad('url path', 22)}${pad('sec', 7)}${pad('peak', 7)}${pad('BL dBFS', 9)}${pad('sub200%', 9)}${pad('centroid', 10)}  what it should feel like`,
  ];
  for (const r of rows) lines.push(`${pad(r.name, 15)}${pad(`${r.name}.wav`, 22)}${pad(r.sec, 7)}${pad(r.peak, 7)}${pad(r.bandDb, 9)}${pad(r.sub200, 9)}${pad(r.centroid, 10)}  ${NOTE[r.name]}`);
  lines.push('', 'ORDER', '  paper   : place, shuffle, crumple, thud, flutter, nudge', '  clock   : tick, tock', '  stamp   : stamp-here, stamp-late, stamp-absent, stamp-sick, stamp-cancel', '  done    : done', '  notify  : notify', '  toggle  : toggle-on, toggle-off', '  dial    : detent-1..4 (drag speed), bump, thunk, clack, blip, round-done', '  break   : break-start, tape-peel');
  writeFileSync(join(OUT, 'INDEX.txt'), lines.join('\n') + '\n');
}