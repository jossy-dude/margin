// Generates every paper bitmap the app draws: the crumpled-paper texture, the mascot's cut pieces and the
// onboarding collage. Deterministic: seeds are fixed, so a re-run tears every piece the same way.
//
//   node scripts/paper-art.mjs                 -> writes assets/paper/*.webp and assets/paper/manifest.json
//   node scripts/paper-art.mjs --preview <png> -> also writes a contact sheet of everything, assembled
//   node scripts/paper-art.mjs --only a,b      -> regenerates just those names
//
// How a piece is made lives in scripts/paper-art/recipes.js (torn edge, white core, fibre, dye) and
// scripts/paper-art/crumple.js (crease facets). Both run inside headless Chromium (Playwright, already a dev
// dependency): the browser rasterises SVG filters and a canvas encodes WebP with alpha. The phone only ever
// decodes images; it never runs a filter.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'paper');
const args = process.argv.slice(2);
const preview = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;

/* ── Palette (the collage papers) ─────────────────────────────────────────────────────────────────────── */
const P = {
  denim: '#4C79AE', denimDark: '#3C6593', denimLight: '#6E98C6', denimBack: '#A9C0DC', denimFeet: '#2F5482',
  cream: '#F4EFE3', ink: '#1F2023', tomato: '#D7553B', blush: '#E8917A', kraftTape: '#D9C39A',
  mustard: '#E1B03C', sage: '#A9BA98', moss: '#58714D', kraft: '#C49B6D', sky: '#BCD0E3', sand: '#E8D7BA', paper: '#F7F3EA',
};

/* ── The mascot, "Scrap" (design frame 240 × 270) ─────────────────────────────────────────────────────── */
const BODY = 'M40 252 C14 226 10 150 18 110 C28 52 74 18 124 16 L160 15 L222 72 C234 124 236 200 206 248 C176 266 78 268 40 252 Z';
const FLAP = 'M160 15 L222 72 C200 74 182 76 166 77 C163 58 161 36 160 15 Z';
const PATCH = 'M21 150 C48 136 88 160 104 196 C114 220 110 246 104 260 C80 258 56 256 40 251 C24 226 15 186 21 150 Z';
const SLIVER = 'M40 74 C58 42 98 26 132 28 C112 44 80 60 40 74 Z';
const TAPE = 'M0 0 H66 V20 H0 Z';

const mascot = (seed) => ({
  name: `scrap-body-${seed}`, scale: 2.6, compose: [
    { shape: `<path d="${BODY}"/>`, w: 240, h: 270, color: P.denim, seed: 10 + seed, tear: 7, rimTear: 12 },
    { shape: `<path d="${PATCH}"/>`, w: 240, h: 270, color: P.denimDark, seed: 30 + seed, tear: 6, rimTear: 10, shadow: 0.2 },
    { shape: `<path d="${SLIVER}"/>`, w: 240, h: 270, color: P.denimLight, seed: 50 + seed, tear: 4, rimTear: 7, shadow: 0.12 },
    { shape: `<path d="${FLAP}"/>`, w: 240, h: 270, color: P.denimBack, seed: 70 + seed, tear: 3.5, rimTear: 5, shadow: 0.34, shadowBlur: 3.5, shadowY: 4 },
    { shape: `<path d="${TAPE}" transform="translate(178 196) rotate(-30 33 10)"/>`, w: 240, h: 270, color: P.kraftTape, seed: 90 + seed, tear: 2.5, rimTear: 3, rimOn: false, shadow: 0.12, alpha: 0.82, fibre: 0.1 },
  ], crumple: { meshes: [[150, 9, 3 + seed], [60, 3, 4 + seed], [24, 0.9, 5 + seed]], strength: 1, maxA: 0.26 },
});

const PIECES = [
  mascot(1), mascot(2), mascot(3),
  { name: 'scrap-eye', scale: 3, compose: [{ shape: '<circle cx="31" cy="31" r="30"/>', w: 62, h: 62, color: P.cream, seed: 201, fibre: 0.1, tear: 2.6, rimTear: 3.6, shadow: 0.2, shadowBlur: 2.5, shadowY: 2, pad: 10, edgeFreq: 0.06 }], crumple: { meshes: [[40, 2, 9], [16, 0.6, 10]], maxA: 0.18 } },
  { name: 'scrap-pupil', scale: 3, compose: [{ shape: '<circle cx="14" cy="14" r="13.5"/>', w: 28, h: 28, color: P.ink, seed: 211, tear: 1.6, rimTear: 2.2, rimOn: false, shadow: 0.25, shadowBlur: 1.5, shadowY: 1.2, pad: 8, edgeFreq: 0.09 }] },
  { name: 'scrap-lid', scale: 3, compose: [{ shape: '<circle cx="31" cy="31" r="31"/>', w: 62, h: 62, color: P.denim, seed: 221, fibre: 0.1, tear: 2.2, rimTear: 3.4, shadow: 0.3, shadowBlur: 2, shadowY: 2.5, pad: 10, edgeFreq: 0.06 }] },
  { name: 'scrap-cheek', scale: 3, compose: [{ shape: '<ellipse cx="13" cy="10" rx="13" ry="10"/>', w: 26, h: 20, color: P.blush, seed: 231, fibre: 0.1, tear: 2, rimTear: 2.6, rimOn: false, shadow: 0.1, shadowBlur: 1.5, shadowY: 1, pad: 8, edgeFreq: 0.08 }] },
  { name: 'scrap-foot', scale: 2.6, compose: [{ shape: '<ellipse cx="24" cy="11" rx="24" ry="11"/>', w: 48, h: 22, color: P.denimFeet, seed: 241, tear: 2.4, rimTear: 3.4, shadow: 0.22, shadowBlur: 2, shadowY: 2, pad: 10, edgeFreq: 0.06 }] },
  { name: 'scrap-mouth-smile', scale: 3, compose: [{ shape: '<path d="M0 0 H60 C60 22 46 34 30 34 C14 34 0 22 0 0 Z"/>', w: 60, h: 34, color: P.ink, seed: 251, tear: 2.2, rimTear: 3.2, shadow: 0.2, shadowBlur: 1.6, shadowY: 1.5, pad: 10, edgeFreq: 0.06 }] },
  { name: 'scrap-mouth-grin', scale: 3, compose: [
    { shape: '<path d="M0 0 H72 C72 26 56 42 36 42 C16 42 0 26 0 0 Z"/>', w: 72, h: 42, color: P.ink, seed: 261, tear: 2.4, rimTear: 3.4, shadow: 0.2, shadowBlur: 1.6, shadowY: 1.5, pad: 10, edgeFreq: 0.06 },
    { shape: '<path d="M20 40 C22 28 30 24 37 24 C44 24 52 28 54 38 C48 42 42 43 37 43 C30 43 25 42 20 40 Z"/>', w: 72, h: 42, color: P.tomato, seed: 262, tear: 1.6, rimTear: 2, rimOn: false, shadow: 0, pad: 10, edgeFreq: 0.08 },
  ] },
  { name: 'scrap-mouth-o', scale: 3, compose: [{ shape: '<ellipse cx="12" cy="14" rx="11.5" ry="13.5"/>', w: 24, h: 28, color: P.ink, seed: 271, tear: 1.8, rimTear: 2.6, shadow: 0.2, shadowBlur: 1.4, shadowY: 1.3, pad: 9, edgeFreq: 0.08 }] },
  { name: 'scrap-mouth-wow', scale: 3, compose: [
    { shape: '<ellipse cx="20" cy="24" rx="19" ry="23"/>', w: 40, h: 48, color: P.ink, seed: 281, tear: 2, rimTear: 3, shadow: 0.2, shadowBlur: 1.6, shadowY: 1.5, pad: 10, edgeFreq: 0.07 },
    { shape: '<path d="M8 40 C10 32 15 30 20 30 C25 30 30 32 32 40 C28 45 24 46 20 46 C16 46 12 45 8 40 Z"/>', w: 40, h: 48, color: P.tomato, seed: 282, tear: 1.4, rimTear: 2, rimOn: false, shadow: 0, pad: 10, edgeFreq: 0.08 },
  ] },
  { name: 'scrap-mouth-flat', scale: 3, compose: [{ shape: '<rect x="0" y="0" width="34" height="8" rx="4"/>', w: 34, h: 8, color: P.ink, seed: 291, tear: 1.4, rimTear: 2, shadow: 0.18, shadowBlur: 1.2, shadowY: 1.2, pad: 8, edgeFreq: 0.09 }] },
  { name: 'scrap-mouth-wobble', scale: 3, compose: [{ shape: '<path d="M2 9 C10 1 18 1 24 7 C30 13 38 13 44 5 L46 11 C38 20 30 20 24 14 C18 8 10 8 2 16 Z"/>', w: 48, h: 20, color: P.ink, seed: 301, tear: 1.4, rimTear: 2, shadow: 0.18, shadowBlur: 1.2, shadowY: 1.2, pad: 8, edgeFreq: 0.09 }] },

  /* ── Collage for onboarding and empty states ──────────────────────────────────────────────────────── */
  { name: 'art-sun', scale: 2, compose: [{ shape: '<circle cx="110" cy="110" r="108"/>', w: 220, h: 220, color: P.mustard, seed: 401, tear: 7, rimTear: 11 }], crumple: { meshes: [[110, 7, 41], [44, 2, 42]], maxA: 0.22 } },
  { name: 'art-dot', scale: 2, compose: [{ shape: '<circle cx="50" cy="50" r="48"/>', w: 100, h: 100, color: P.tomato, seed: 411, tear: 4, rimTear: 6 }], crumple: { meshes: [[60, 3, 43]], maxA: 0.18 } },
  { name: 'art-hill-sage', scale: 2, compose: [{ shape: '<path d="M0 46 C70 6 130 0 210 30 C280 56 340 20 420 34 L420 160 L0 160 Z"/>', w: 420, h: 160, color: P.sage, seed: 421, tear: 8, rimTear: 13 }], crumple: { meshes: [[140, 8, 44], [50, 2.4, 45]], maxA: 0.22 } },
  { name: 'art-hill-moss', scale: 2, compose: [{ shape: '<path d="M0 30 C90 54 150 8 240 18 C320 28 360 58 420 40 L420 130 L0 130 Z"/>', w: 420, h: 130, color: P.moss, seed: 431, tear: 8, rimTear: 13 }], crumple: { meshes: [[140, 8, 46], [50, 2.4, 47]], maxA: 0.22 } },
  { name: 'art-strip-kraft', scale: 2, compose: [{ shape: '<path d="M0 14 C120 0 300 22 420 8 L420 100 L0 100 Z"/>', w: 420, h: 100, color: P.kraft, seed: 441, tear: 8, rimTear: 13 }], crumple: { meshes: [[140, 8, 48], [50, 2.4, 49]], maxA: 0.24 } },
  { name: 'art-strip-denim', scale: 2, compose: [{ shape: '<path d="M0 20 C100 4 260 30 420 10 L420 120 L0 120 Z"/>', w: 420, h: 120, color: P.denim, seed: 451, tear: 8, rimTear: 13 }], crumple: { meshes: [[140, 8, 50], [50, 2.4, 51]], maxA: 0.24 } },
  { name: 'art-scrap-cream', scale: 2, compose: [{ shape: '<rect x="0" y="0" width="240" height="170" rx="4"/>', w: 240, h: 170, color: P.paper, seed: 461, tear: 10, rimTear: 17, edgeFreq: 0.018 }], crumple: { meshes: [[84, 3.4, 52], [34, 1.1, 53]], maxA: 0.16 } },
  { name: 'art-scrap-sky', scale: 2, compose: [{ shape: '<rect x="0" y="0" width="200" height="150" rx="4"/>', w: 200, h: 150, color: P.sky, seed: 471, tear: 10, rimTear: 17, edgeFreq: 0.018 }], crumple: { meshes: [[84, 3.4, 54], [34, 1.1, 55]], maxA: 0.16 } },
  { name: 'art-scrap-sand', scale: 2, compose: [{ shape: '<rect x="0" y="0" width="200" height="150" rx="4"/>', w: 200, h: 150, color: P.sand, seed: 481, tear: 10, rimTear: 17, edgeFreq: 0.018 }], crumple: { meshes: [[84, 3.4, 56], [34, 1.1, 57]], maxA: 0.16 } },
  { name: 'art-scrap-sage', scale: 2, compose: [{ shape: '<rect x="0" y="0" width="200" height="150" rx="4"/>', w: 200, h: 150, color: '#C9D4BE', seed: 491, tear: 10, rimTear: 17, edgeFreq: 0.018 }], crumple: { meshes: [[84, 3.4, 58], [34, 1.1, 59]], maxA: 0.16 } },
  { name: 'art-leaf', scale: 2, compose: [{ shape: '<path d="M30 0 C58 30 62 92 34 150 C30 156 28 156 26 150 C-2 92 2 30 30 0 Z"/>', w: 62, h: 156, color: P.moss, seed: 501, tear: 3.5, rimTear: 5.5 }], crumple: { meshes: [[50, 3, 60]], maxA: 0.2 } },
  { name: 'art-leaf-sage', scale: 2, compose: [{ shape: '<path d="M30 0 C58 30 62 92 34 150 C30 156 28 156 26 150 C-2 92 2 30 30 0 Z"/>', w: 62, h: 156, color: P.sage, seed: 511, tear: 3.5, rimTear: 5.5 }], crumple: { meshes: [[50, 3, 61]], maxA: 0.2 } },
  { name: 'art-ruled', scale: 2, compose: [{ shape: `<rect x="0" y="0" width="210" height="150" rx="3"/>${[30, 52, 74, 96, 118, 140].map((y) => `<rect x="0" y="${y}" width="210" height="1.3" fill="#8FB0D3"/>`).join('')}<rect x="30" y="0" width="1.4" height="150" fill="#D9786A"/>`, w: 210, h: 150, color: P.paper, seed: 521, tear: 10, rimTear: 17, edgeFreq: 0.018 }], crumple: { meshes: [[84, 3.4, 62], [34, 1.1, 63]], maxA: 0.16 } },
  { name: 'art-ruled-wide', scale: 2, compose: [{ shape: `<rect x="0" y="0" width="320" height="112" rx="3"/>${[26, 48, 70, 92].map((y) => `<rect x="0" y="${y}" width="320" height="1.3" fill="#8FB0D3"/>`).join('')}<rect x="34" y="0" width="1.4" height="112" fill="#D9786A"/>`, w: 320, h: 112, color: P.paper, seed: 541, tear: 9, rimTear: 15, edgeFreq: 0.02 }], crumple: { meshes: [[90, 3, 64], [34, 1.1, 65]], maxA: 0.16 } },
  { name: 'art-tape', scale: 2.4, compose: [{ shape: '<rect x="0" y="0" width="80" height="24"/>', w: 80, h: 24, color: P.kraftTape, seed: 531, tear: 2.4, rimTear: 3, rimOn: false, shadow: 0.1, alpha: 0.85, fibre: 0.1, pad: 10 }] },
];

/* The page texture: crumple facets only, tileable, black creases and white ridges on transparency. */
const TEXTURES = [
  { name: 'crumple', w: 1024, h: 1800, meshes: [[300, 30, 701], [118, 9, 702], [44, 2.4, 703]], opt: { dark: 0.9, light: 0.85, maxA: 0.34, blur: 1.1 } },
];

mkdirSync(OUT, { recursive: true });
const page = await (await chromium.launch()).newPage();
await page.setContent(`<html><body><script>${readFileSync(join(HERE, 'paper-art', 'crumple.js'), 'utf8')};${readFileSync(join(HERE, 'paper-art', 'recipes.js'), 'utf8')}</script></body></html>`);

const manifest = {};
const save = (name, b64, w, h, scale) => { writeFileSync(join(OUT, `${name}.webp`), Buffer.from(b64, 'base64')); manifest[name] = { w: +(w / scale).toFixed(1), h: +(h / scale).toFixed(1), scale }; };

for (const spec of PIECES) {
  if (only && !only.has(spec.name)) continue;
  const r = await page.evaluate(async (s) => {
    let base = null;
    for (const part of s.compose) {
      const cv = await window.PaperArt.rasterise(window.PaperArt.piece(part), s.scale);
      if (!base) { base = cv; continue; }
      const g = base.getContext('2d'); g.globalAlpha = part.alpha ?? 1; g.drawImage(cv, 0, 0); g.globalAlpha = 1;
    }
    if (s.compose[0].alpha && s.compose.length === 1) { // a single translucent piece (tape): re-draw at its alpha
      const o = document.createElement('canvas'); o.width = base.width; o.height = base.height; const g = o.getContext('2d'); g.globalAlpha = s.compose[0].alpha; g.drawImage(base, 0, 0); base = o;
    }
    if (s.crumple) window.PaperArt.crumpleOver(base, { ...s.crumple, meshes: s.crumple.meshes.map(([c, a, sd]) => [c * s.scale, a * s.scale, sd]) });
    return { b64: base.toDataURL('image/webp', 0.86).split(',')[1], w: base.width, h: base.height };
  }, spec);
  save(spec.name, r.b64, r.w, r.h, spec.scale);
  console.log(`${spec.name.padEnd(22)} ${r.w}×${r.h}  ${Math.round(r.b64.length * 0.75 / 1024)} KB`);
}
for (const t of TEXTURES) {
  if (only && !only.has(t.name)) continue;
  const r = await page.evaluate((t) => {
    const L = window.Crumple.field(t.w, t.h, t.meshes), cv = window.Crumple.toShade(L, t.w, t.h, t.opt);
    return { b64: cv.toDataURL('image/webp', 0.82).split(',')[1] };
  }, t);
  save(t.name, r.b64, t.w, t.h, 2);
  console.log(`${t.name.padEnd(22)} ${t.w}×${t.h}  ${Math.round(r.b64.length * 0.75 / 1024)} KB`);
}
// A partial run (--only) merges into the existing manifest instead of dropping every other entry.
{
  const path = join(OUT, 'manifest.json');
  let prev = {};
  try { prev = only ? JSON.parse(readFileSync(path, 'utf8')) : {}; } catch { prev = {}; }
  writeFileSync(path, JSON.stringify({ ...prev, ...manifest }, null, 1) + '\n');
}

if (preview) {
  const files = Object.keys(manifest).length ? Object.keys(manifest) : [];
  const img = (n) => `data:image/webp;base64,${readFileSync(join(OUT, `${n}.webp`)).toString('base64')}`;
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.setContent(`<html><body style="margin:0;padding:16px;background:#F2EEE6;font:12px system-ui">
    <div style="position:relative;width:240px;height:300px;display:inline-block;vertical-align:top;margin:10px">
      <img src="${img('scrap-body-1')}" style="position:absolute;left:-26px;top:-26px;width:${292}px">
      <img src="${img('scrap-eye')}" style="position:absolute;left:${88 - 41}px;top:${100 - 41}px;width:82px">
      <img src="${img('scrap-eye')}" style="position:absolute;left:${156 - 41}px;top:${96 - 41}px;width:82px">
      <img src="${img('scrap-pupil')}" style="position:absolute;left:${92 - 22}px;top:${106 - 22}px;width:44px">
      <img src="${img('scrap-pupil')}" style="position:absolute;left:${160 - 22}px;top:${102 - 22}px;width:44px">
      <img src="${img('scrap-mouth-smile')}" style="position:absolute;left:${124 - 40}px;top:${146 - 10}px;width:80px">
    </div>
    ${files.map((n) => `<figure style="display:inline-block;margin:6px;vertical-align:top"><img src="${img(n)}" style="max-width:300px;max-height:240px;display:block"><figcaption>${n}</figcaption></figure>`).join('')}
  </body></html>`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: preview, fullPage: true });
  console.log('preview', preview);
}
process.exit(0);
