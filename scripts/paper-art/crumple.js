// Crumpled paper as geometry, not noise (runs in the headless page, see `scripts/paper-art.mjs`).
//
// A crumpled sheet is flat facets meeting at creases. So: a few jittered triangle meshes at different
// scales (big folds, smaller wrinkles), each vertex lifted by a random height, summed into one height field
// that is planar inside every triangle and kinked along every edge. Lit from the top left, each facet takes
// its own flat shade and the kinks become crease lines. The vertex grid wraps, so the field tiles.

/* eslint-disable */
(function () {
  const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  /** Adds one wrapped, jittered, randomly-diagonalled triangle mesh's heights into `hf` (w×h). */
  function addMesh(hf, w, h, cell, amp, seed, jitter = 0.3) {
    const r = rng(seed), nx = Math.max(2, Math.round(w / cell)), ny = Math.max(2, Math.round(h / cell)), cx = w / nx, cy = h / ny;
    const vx = [], vy = [], vz = [], diag = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      vx.push((i + (r() - 0.5) * 2 * jitter) * cx); vy.push((j + (r() - 0.5) * 2 * jitter) * cy); vz.push((r() - 0.5) * 2 * amp);
      diag.push(r() < 0.5);
    }
    const V = (i, j) => { const ii = ((i % nx) + nx) % nx, jj = ((j % ny) + ny) % ny, k = jj * nx + ii; return [vx[k] + Math.floor(i / nx) * w, vy[k] + Math.floor(j / ny) * h, vz[k]]; };
    const tri = (a, b, c) => {
      const minX = Math.floor(Math.min(a[0], b[0], c[0])), maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
      const minY = Math.floor(Math.min(a[1], b[1], c[1])), maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
      const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-9) return;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
        if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
        const X = ((x % w) + w) % w, Y = ((y % h) + h) % h, k = Y * w + X;
        if (hf.seen[k] === hf.pass) continue; hf.seen[k] = hf.pass;
        hf.z[k] += l1 * a[2] + l2 * b[2] + l3 * c[2];
      }
    };
    hf.pass++;
    for (let j = -1; j <= ny; j++) for (let i = -1; i <= nx; i++) {
      const k = (((j % ny) + ny) % ny) * nx + (((i % nx) + nx) % nx);
      const p00 = V(i, j), p10 = V(i + 1, j), p01 = V(i, j + 1), p11 = V(i + 1, j + 1);
      if (diag[k]) { tri(p00, p10, p11); tri(p00, p11, p01); } else { tri(p00, p10, p01); tri(p10, p11, p01); }
    }
  }

  /**
   * Shading for a crumpled sheet: Float32 `L`, 1 = a flat facet facing up, below 1 = turned from the lamp.
   * meshes: [[cellPx, heightPx, seed], …]
   */
  function field(w, h, meshes, light = [-0.62, -0.78, 1.25]) {
    const hf = { z: new Float32Array(w * h), seen: new Int32Array(w * h), pass: 0 };
    for (const [cell, amp, seed] of meshes) addMesh(hf, w, h, cell, amp, seed);
    const ln = Math.hypot(...light), L = new Float32Array(w * h), lx = light[0] / ln, ly = light[1] / ln, lz = light[2] / ln;
    const at = (x, y) => hf.z[((y + h) % h) * w + ((x + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 2, dy = (at(x, y + 1) - at(x, y - 1)) / 2, n = Math.hypot(dx, dy, 1);
      L[y * w + x] = ((-dx * lx - dy * ly + lz) / n) / lz;
    }
    return L;
  }

  /** Paints `L` onto a canvas as black-with-alpha creases and white-with-alpha ridges. Returns the canvas. */
  function toShade(L, w, h, { dark = 0.5, light = 0.55, maxA = 0.42, blur = 0.7, speck = 0, seed = 1 } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data, r = rng(seed);
    for (let i = 0; i < w * h; i++) {
      let v = L[i] - 1;
      if (speck) v += (r() - 0.5) * speck;
      const a = v < 0 ? Math.min(maxA, -v * dark) : Math.min(maxA, v * light), c = v < 0 ? 0 : 255;
      d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c; d[i * 4 + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    if (!blur) return cv;
    // Blur with wrap: draw the tile 3×3 into a bigger canvas, blur, cut the centre back out.
    const big = document.createElement('canvas'); big.width = w * 3; big.height = h * 3;
    const bg = big.getContext('2d'); bg.filter = `blur(${blur}px)`;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) bg.drawImage(cv, i * w, j * h);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    out.getContext('2d').drawImage(big, w, h, w, h, 0, 0, w, h);
    return out;
  }

  /** Multiply-ready greyscale (opaque) version of `L`, for use inside SVG filters via feImage. */
  function toMultiply(L, w, h, { k = 0.5, lift = 0.0, blur = 0.6 } = {}) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'), img = g.createImageData(w, h), d = img.data;
    for (let i = 0; i < w * h; i++) {
      const v = Math.max(0, Math.min(1.2, 1 + (L[i] - 1) * k + lift)), c = Math.round(Math.min(255, v * 232));
      d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (!blur) return cv;
    const o = document.createElement('canvas'); o.width = w; o.height = h; const og = o.getContext('2d'); og.filter = `blur(${blur}px)`; og.drawImage(cv, 0, 0); return o;
  }

  window.Crumple = { field, toShade, toMultiply, rng };
})();
