// v0.7.7.5 (SPEC §1 A): Daylight's ground. Twelve baked skies, one per keyframe and mode, so a 0.58 pane has
// something to be glass over: a three-stop gradient, a sun or moon glow at x = 70 % whose height follows the hour,
// one haze band, two or three soft clouds at 8–15 %, stars at night.
//
//   node tools/sky.mjs        → assets/sky/{light,dark}-{dawn,morning,noon,afternoon,dusk,night}.webp
//                               assets/sky/stats.json (each sky's lightest and darkest pixel, for the contrast test)
//
// Needs rsvg-convert and ImageMagick (magick). 412×915 (the A51's dp size), each WebP ≤ 150 KB.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const W = 412, H = 915, OUT = 'assets/sky';
mkdirSync(OUT, { recursive: true });
const tmp = join(tmpdir(), `marrow-sky-${process.pid}`);
mkdirSync(tmp, { recursive: true });

/* [top, middle, bottom], the glow's colour and opacity, its height as a fraction of the screen, cloud opacity, stars */
const SKIES = {
  light: {
    dawn: { stops: ['#E9A994', '#F5D2BD', '#FCEEE2'], glow: ['#FFE1B8', 0.85], y: 0.40, cloud: 0.14, stars: 0 },
    morning: { stops: ['#8DBDEB', '#C6DFF5', '#EEF5FB'], glow: ['#FFF6DE', 0.75], y: 0.26, cloud: 0.15, stars: 0 },
    noon: { stops: ['#74AEE6', '#B9D9F4', '#F1F7FC'], glow: ['#FFFFFF', 0.80], y: 0.12, cloud: 0.13, stars: 0 },
    afternoon: { stops: ['#9EC0E6', '#D5E1EE', '#F5ECDF'], glow: ['#FFF0D2', 0.70], y: 0.24, cloud: 0.12, stars: 0 },
    dusk: { stops: ['#8D7DC4', '#CFA2C2', '#F2D6CB'], glow: ['#FFD2B0', 0.75], y: 0.40, cloud: 0.10, stars: 0 },
    night: { stops: ['#4F6699', '#7F95C0', '#B8C5DE'], glow: ['#E8EEFF', 0.55], y: 0.18, cloud: 0.08, stars: 18 },
  },
  dark: {
    dawn: { stops: ['#1A1F3D', '#43365A', '#6A4A58'], glow: ['#F2A982', 0.35], y: 0.40, cloud: 0.08, stars: 6 },
    morning: { stops: ['#112039', '#233859', '#355079'], glow: ['#BFD6F5', 0.25], y: 0.26, cloud: 0.09, stars: 0 },
    noon: { stops: ['#10213A', '#213859', '#2E4B71'], glow: ['#D6E4F7', 0.22], y: 0.12, cloud: 0.09, stars: 0 },
    afternoon: { stops: ['#172137', '#2E3552', '#48435F'], glow: ['#E8CDB0', 0.22], y: 0.24, cloud: 0.08, stars: 0 },
    dusk: { stops: ['#181530', '#3B294B', '#5C3951'], glow: ['#E59A8E', 0.30], y: 0.40, cloud: 0.08, stars: 10 },
    night: { stops: ['#060A17', '#121A32', '#1D2546'], glow: ['#C9D6FF', 0.28], y: 0.18, cloud: 0.06, stars: 70 },
  },
};

/* a small seeded random, so the stars and clouds never move between builds */
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function svg(mode, key, k) {
  const r = rng(hash(`${mode}-${key}`)), gx = W * 0.7, gy = H * k.y;
  const clouds = [0, 1, 2].map((i) => {
    const cx = W * (0.15 + 0.35 * i + r() * 0.15), cy = H * (0.1 + 0.18 * i + r() * 0.08), rx = 120 + r() * 70, ry = 26 + r() * 16;
    return `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${ry.toFixed(0)}" fill="#FFFFFF" opacity="${(k.cloud * (0.7 + r() * 0.5)).toFixed(3)}" filter="url(#soft)"/>`;
  }).join('');
  const stars = Array.from({ length: k.stars }, () => {
    const x = r() * W, y = r() * H * 0.55, a = 0.35 + r() * 0.55, rad = 0.6 + r() * 0.9;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#FFFFFF" opacity="${a.toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${k.stops[0]}"/><stop offset="0.55" stop-color="${k.stops[1]}"/><stop offset="1" stop-color="${k.stops[2]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="${gx}" cy="${gy}" r="${W * 0.62}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${k.glow[0]}" stop-opacity="${k.glow[1]}"/>
      <stop offset="0.18" stop-color="${k.glow[0]}" stop-opacity="${(k.glow[1] * 0.45).toFixed(3)}"/>
      <stop offset="1" stop-color="${k.glow[0]}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="${mode === 'dark' ? 0.05 : 0.16}"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-50%" y="-200%" width="200%" height="500%"><feGaussianBlur stdDeviation="18"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect y="${(H * 0.58).toFixed(0)}" width="${W}" height="${(H * 0.16).toFixed(0)}" fill="url(#haze)"/>
  ${stars}
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${clouds}
</svg>`;
}

const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
const stats = {};
for (const [mode, keys] of Object.entries(SKIES)) {
  stats[mode] = {};
  for (const [key, k] of Object.entries(keys)) {
    const base = join(tmp, `${mode}-${key}`);
    writeFileSync(`${base}.svg`, svg(mode, key, k));
    execFileSync('rsvg-convert', [`${base}.svg`, '-o', `${base}.png`]);
    /* the contrast floor comes from the sky WITHOUT its stars: a 1 dp star is not something text sits on */
    writeFileSync(`${base}-bare.svg`, svg(mode, key, { ...k, stars: 0 }));
    execFileSync('rsvg-convert', [`${base}-bare.svg`, '-o', `${base}-bare.png`]);
    const png = PNG.sync.read(readFileSync(`${base}-bare.png`));
    let lo = [1e9, 0, 0, 0], hi = [-1, 0, 0, 0];
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]], L = lum(r, g, b);
      if (L < lo[0]) lo = [L, r, g, b];
      if (L > hi[0]) hi = [L, r, g, b];
    }
    const top = [png.data[0], png.data[1], png.data[2]];
    stats[mode][key] = { darkest: hex(lo[1], lo[2], lo[3]), lightest: hex(hi[1], hi[2], hi[3]), top: hex(...top) };
    const out = join(OUT, `${mode}-${key}.webp`);
    execFileSync('magick', [`${base}.png`, '-quality', '94', '-define', 'webp:method=6', out]);
    const kb = statSync(out).size / 1024;
    if (kb > 150) throw new Error(`${out} is ${kb.toFixed(0)} KB (limit 150)`);
    console.log(`${out} ${kb.toFixed(0)} KB · ${stats[mode][key].darkest}…${stats[mode][key].lightest}`);
  }
}
writeFileSync(join(OUT, 'stats.json'), `${JSON.stringify(stats, null, 2)}\n`);
rmSync(tmp, { recursive: true, force: true });
