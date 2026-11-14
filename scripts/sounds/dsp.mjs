// Sound processing and measurement on mono Float32 PCM at 48 kHz. No dependencies: ffmpeg only decodes and encodes
// (see build.mjs); every trim, fade, filter, gain and measurement happens here, so the numbers in the audition page
// and in measurements.json come from one place.

export const SR = 48000;
const dB = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const lin = (d) => 10 ** (d / 20);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);

// ---------- filters ----------

/** Apply a biquad (direct form I) with coefficients b0 b1 b2 a1 a2 (a0 = 1). Returns a new array. */
function iir(x, [b0, b1, b2, a1, a2]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

/** RBJ cookbook 2nd-order low- or high-pass (Butterworth Q by default). */
export function pass(x, type, f0, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * f0) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  return iir(x, [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * c) / a0, (1 - al) / a0]);
}

/** ITU-R BS.1770 K-weighting at 48 kHz (high shelf, then RLB high-pass). */
function kweight(x) {
  const s1 = iir(x, [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585]);
  return iir(s1, [1, -2, 1, -1.99004745483398, 0.99007225036621]);
}

// ---------- editing ----------

export function slice(x, start = 0, dur = Infinity) {
  const a = Math.max(0, Math.round(start * SR)), b = Math.min(x.length, Number.isFinite(dur) ? a + Math.round(dur * SR) : x.length);
  return x.slice(a, b);
}

export function peakOf(x) { let p = 0; for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; } return p; }

/** Short RMS envelope, one value per `win` seconds. */
function envelope(x, win = 0.005) {
  const n = Math.max(1, Math.round(win * SR)), out = new Float32Array(Math.ceil(x.length / n));
  for (let k = 0; k < out.length; k++) {
    let s = 0; const a = k * n, b = Math.min(x.length, a + n);
    for (let i = a; i < b; i++) s += x[i] * x[i];
    out[k] = Math.sqrt(s / Math.max(1, b - a));
  }
  return { env: out, hop: n };
}

/** First sample at or above `rel` dB under the peak (the onset). */
export function onsetIndex(x, rel = -40) {
  const t = peakOf(x) * lin(rel);
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= t) return i;
  return 0;
}

/** Last sample whose 5 ms RMS is within `rel` dB of the loudest 5 ms (where the tail is gone). */
export function endIndex(x, rel = -50) {
  const { env, hop } = envelope(x);
  const t = peakOf(env) * lin(rel);
  for (let k = env.length - 1; k >= 0; k--) if (env[k] >= t) return Math.min(x.length, (k + 1) * hop);
  return x.length;
}

/** Fade in over `a` seconds (linear) and out over `b` seconds (raised cosine), in place. */
export function fades(x, a, b) {
  const na = Math.min(x.length, Math.round(a * SR)), nb = Math.min(x.length, Math.round(b * SR));
  for (let i = 0; i < na; i++) x[i] *= i / na;
  for (let i = 0; i < nb; i++) { const g = Math.cos(((i + 1) / nb) * (Math.PI / 2)) ** 2; x[x.length - nb + i] *= g; }
  return x;
}

export function gain(x, d) { const g = lin(d); for (let i = 0; i < x.length; i++) x[i] *= g; return x; }

/** Sum parts at offsets (seconds) with per-part gain (dB). */
export function mix(parts) {
  const len = Math.max(...parts.map((p) => Math.round((p.at ?? 0) * SR) + p.x.length));
  const y = new Float32Array(len);
  for (const p of parts) { const o = Math.round((p.at ?? 0) * SR), g = lin(p.gain ?? 0); for (let i = 0; i < p.x.length; i++) y[o + i] += p.x[i] * g; }
  return y;
}

/**
 * Make a seamless loop `len` seconds long.
 * mode 'xfade' (recordings): the `xf` seconds after the loop end are crossfaded (equal power) into the loop start, so
 *   playback runs straight from the last sample back into the first.
 * mode 'wrap' (a rendered pattern): everything after `len` is added back onto the start, like a ring that keeps
 *   ringing into the next bar. Silence pads the end when the source is shorter than `len`.
 */
export function loop(x, len, mode = 'xfade', xf = 1) {
  const n = Math.round(len * SR), y = new Float32Array(n);
  for (let i = 0; i < n && i < x.length; i++) y[i] = x[i];
  if (mode === 'wrap') { for (let i = n; i < x.length; i++) y[(i - n) % n] += x[i]; return y; }
  const m = Math.min(Math.round(xf * SR), x.length - n);
  for (let i = 0; i < m; i++) {
    const t = (i / m) * (Math.PI / 2);
    y[i] = x[i] * Math.sin(t) + x[n + i] * Math.cos(t);
  }
  return y;
}

// ---------- measurement ----------

/** Loudest 100 ms window, K-weighted, in LUFS. Clips shorter than 100 ms count as 100 ms (short sounds read quieter,
 *  as they are heard). This is the number UI sounds are normalised by: integrated LUFS needs 400 ms blocks. */
export function loudMax(x, win = 0.1) {
  const k = kweight(x), n = Math.round(win * SR), hop = Math.round(0.005 * SR);
  const cs = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) cs[i + 1] = cs[i] + k[i] * k[i];
  let best = 0;
  if (k.length <= n) best = cs[k.length] / n;
  else for (let a = 0; a + n <= k.length; a += hop) best = Math.max(best, (cs[a + n] - cs[a]) / n);
  return best > 0 ? -0.691 + 10 * Math.log10(best) : -Infinity;
}

/** BS.1770 gated integrated loudness (null under 400 ms). */
export function loudInt(x) {
  const k = kweight(x), n = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  if (k.length < n) return null;
  const cs = new Float64Array(k.length + 1);
  for (let i = 0; i < k.length; i++) cs[i + 1] = cs[i] + k[i] * k[i];
  const z = [];
  for (let a = 0; a + n <= k.length; a += hop) z.push((cs[a + n] - cs[a]) / n);
  const L = (v) => -0.691 + 10 * Math.log10(v);
  const abs = z.filter((v) => v > 0 && L(v) > -70);
  if (!abs.length) return -Infinity;
  const rel = L(abs.reduce((s, v) => s + v, 0) / abs.length) - 10;
  const g = abs.filter((v) => L(v) > rel);
  return L(g.reduce((s, v) => s + v, 0) / g.length);
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Energy-weighted spectral centroid (Hz) and the share of energy a phone speaker can play (above 300 Hz). */
export function spectrum(x) {
  const N = 2048, hop = 1024, win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const bin = SR / N, lo = Math.round(300 / bin);
  let wsum = 0, csum = 0, eAll = 0, eHi = 0;
  for (let a = 0; a < Math.max(1, x.length - N + hop); a += hop) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[a + i] ?? 0) * win[i];
    fft(re, im);
    let e = 0, c = 0, h = 0;
    for (let k = 1; k < N / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; e += p; c += p * k * bin; if (k >= lo) h += p; }
    if (e > 0) { csum += c; wsum += e; eAll += e; eHi += h; }
  }
  return { centroid: wsum ? Math.round(csum / wsum) : null, phone: eAll ? Math.round((eHi / eAll) * 100) : null };
}

/** Peak-envelope bins for a waveform drawing: 0..100, on a 48 dB scale so decays stay visible. */
export function wave(x, bins = 96) {
  const out = [], n = x.length / bins;
  for (let b = 0; b < bins; b++) {
    let p = 0; for (let i = Math.floor(b * n); i < Math.floor((b + 1) * n); i++) p = Math.max(p, Math.abs(x[i]));
    out.push(Math.max(0, Math.round((1 + dB(p) / 48) * 100)));
  }
  return out;
}

/** Everything the audition page and the checks need, from one decoded clip. */
export function measure(x, { loop: isLoop = false } = {}) {
  const pk = peakOf(x);
  let ss = 0; for (let i = 0; i < x.length; i++) ss += x[i] * x[i];
  const on = onsetIndex(x), end = endIndex(x, -40);
  let pkAt = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) === pk) { pkAt = i; break; }
  let clip = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= 0.999) clip++;
  let padEnd = 0; for (let i = x.length - 1; i >= 0 && Math.abs(x[i]) < lin(-60); i--) padEnd++;
  const active = x.slice(on, Math.max(on + 1, end));
  let sa = 0; for (let i = 0; i < active.length; i++) sa += active[i] * active[i];
  const sp = spectrum(active);
  const m = {
    dur: Math.round((x.length / SR) * 1000) / 1000,
    peak: r1(dB(pk)),
    rms: r1(dB(Math.sqrt(ss / Math.max(1, x.length)))),
    rmsActive: r1(dB(Math.sqrt(sa / Math.max(1, active.length)))),
    loud: r1(loudMax(x)),
    lufs: r1(loudInt(x)),
    onsetMs: Math.round((on / SR) * 1000),
    peakMs: Math.round((pkAt / SR) * 1000),
    tailMs: Math.round(((end - pkAt) / SR) * 1000),
    padEndMs: Math.round((padEnd / SR) * 1000),
    centroid: sp.centroid,
    phone: sp.phone,
    clip,
    wave: wave(x),
  };
  if (isLoop) {
    // Level step across the loop seam: last 50 ms against the first 50 ms, and the sample jump at the join.
    const w = Math.round(0.05 * SR);
    const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)); };
    m.seamDb = r1(Math.abs(dB(rms(x.length - w, x.length)) - dB(rms(0, w))));
    m.seamJump = r1(dB(Math.abs(x[0] - x[x.length - 1]) + 1e-9));
  }
  return m;
}
