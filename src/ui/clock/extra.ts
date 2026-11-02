/**
 * The second family of faces (owner's references, collage pass): four engraved clocks whose character is what
 * lies AROUND the time — a crescent cut from iron, a sunburst of rays, acanthus crests, a watch on its chain.
 *
 * Same engine, same rules as faces.ts: a 200-unit viewBox, every stroke floored to half a device pixel (`sw`),
 * numerals floored to 8 px (`num`), every tone a flat pre-mix of ink into the dial (`engrave`, `TONE`), no
 * translucency, ids suffixed per instance. These faces have no full dial disc where the reference has none: the
 * crescent and the sunburst are cut straight onto the page's paper, which is the point of them.
 */
import { DIAL } from '../../tokens/theme';
import { TONE, dot, engrave, num, sw, type Pal } from './faces';

const PI = Math.PI, f1 = (v: number) => +v.toFixed(1);
const P = (r: number, a: number, cx = 0, cy = 0): [number, number] => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
const each = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const RN = 'XII I II III IV V VI VII VIII IX X XI'.split(' ');
const deg = (d: number) => (d * PI) / 180;
/** An arc of radius r from clock-angle a0 to a1 (radians, clockwise from 12). */
const arc = (r: number, a0: number, a1: number, cx = 0, cy = 0) => { const [x0, y0] = P(r, a0, cx, cy), [x1, y1] = P(r, a1, cx, cy); return `M${f1(x0)} ${f1(y0)}A${r} ${r} 0 ${a1 - a0 > PI ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`; };
/** Seeded random for the print spatter, so a face spatters the same way every render. */
const rnd = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** Roman numerals on a ring, each turned to face the centre (the bottom half upside-down turned upright). */
function romans(pal: Pal, px: number, font: string, ns: number, r: number, only?: (j: number) => boolean, upright = false, cx = 0, cy = 0) {
  const s = num(px, ns), ink = engrave(pal, TONE.structure + 0.06);
  return each(12, (j) => {
    if (only && !only(j)) return '';
    const [x, y] = P(r, (j * PI) / 6, cx, cy), rot = upright ? 0 : j > 3 && j < 9 ? j * 30 + 180 : j * 30;
    return `<text x="${f1(x)}" y="${f1(y + s * 0.34)}" font-size="${s}" font-family="${font}" fill="${ink}" text-anchor="middle"${rot ? ` transform="rotate(${rot} ${f1(x)} ${f1(y)})"` : ''}>${RN[j]}</text>`;
  });
}

/* ── Half Moon Iron (ref: a laser-cut metal wall clock) ─────────────────────────────────────────────────────
   Only the left crescent exists: a railed minute band, a band of heavy Roman numerals, and an inner rim, each
   ending in a curled scroll. Everything is iron (ink), cut straight onto the page — there is no dial disc, so the
   paper shows through the whole right half. A heavy hub; behind it a small escape wheel that jumps once a
   second (`spinLayers`), the one moving part an iron clock like this shows. */
export function halfMoon(pal: Pal, font: string, px: number, ns: number): string {
  const iron = engrave(pal, 0.96), A0 = deg(188), A1 = deg(368);
  const rail = `<g fill="none" stroke="${iron}" stroke-width="${sw(px, 2.4)}" stroke-linecap="round"><path d="${arc(95, A0, A1 - deg(0.5))}"/><path d="${arc(88.5, A0 + deg(2), A1 - deg(2))}"/></g>`;
  const ladder = `<g stroke="${iron}" stroke-width="${sw(px, 1.5)}">${each(31, (i) => { const a = A0 + deg(2) + (i * (A1 - A0 - deg(4))) / 30, [x0, y0] = P(88.5, a), [x1, y1] = P(95, a); return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"/>`; })}</g>`;
  const band = `<g fill="none" stroke="${iron}" stroke-linecap="round"><path d="${arc(83, A0 + deg(4), A1 - deg(6))}" stroke-width="${sw(px, 2.2)}"/><path d="${arc(57, deg(200), deg(352))}" stroke-width="${sw(px, 3)}"/></g>`;
  /* the scrolls that end each band: a curl turning back on itself, the way a smith finishes a bar */
  const curl = (r: number, a: number, dir: 1 | -1, sz: number) => { const [x, y] = P(r, a), [tx, ty] = P(r + sz * 0.2, a + dir * deg(4)); return `<path d="M${f1(x)} ${f1(y)}Q${f1(tx + dir * sz)} ${f1(ty - sz * 0.4)} ${f1(tx + dir * sz * 0.4)} ${f1(ty + sz * 0.6)}Q${f1(tx)} ${f1(ty + sz * 0.7)} ${f1(tx - dir * sz * 0.1)} ${f1(ty + sz * 0.25)}" fill="none" stroke="${iron}" stroke-width="${sw(px, 2)}" stroke-linecap="round"/>`; };
  const scrolls = curl(57, deg(352), 1, 7) + curl(57, deg(200), -1, 7) + curl(83, A1 - deg(6), 1, 6);
  const numerals = romans(pal, px, font, ns, 70.5, (j) => j === 0 || j >= 7);
  const hub = `<circle r="${f1(Math.max(7.5, dot(px, 7.5)))}" fill="${iron}"/><circle r="2.6" fill="${pal.dial === DIAL.dark ? engrave(pal, 0.2) : pal.dial}"/>`;
  return `${rail}${ladder}${band}${scrolls}${numerals}${hub}`;
}
export function escapeWheel(pal: Pal, px: number): { svg: string; R: number } {
  const R = 16, n = 15, iron = engrave(pal, TONE.figure);
  let d = '';
  for (let i = 0; i < n; i++) { const a = (i * 2 * PI) / n, [x0, y0] = P(9.5, a), [x1, y1] = P(14.5, a + deg(6)), [x2, y2] = P(10.5, a + deg(20)); d += `${i ? 'L' : 'M'}${f1(x0)} ${f1(y0)}L${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`; }
  return { R, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}"><path d="${d}Z" fill="none" stroke="${iron}" stroke-width="${sw(px, 1.4)}" stroke-linejoin="round"/>${each(5, (i) => { const [x, y] = P(6.5, (i * 2 * PI) / 5); return `<line x2="${f1(x)}" y2="${f1(y)}" stroke="${iron}" stroke-width="${sw(px, 1.2)}"/>`; })}</svg>` };
}

/* ── Sunburst Engraving (ref: an engraved ornamental ring) ─────────────────────────────────────────────────
   Twelve cartouche cells ARE the hour marks, bracketed by fleurons; a small enamel dial sits in the hollow
   middle; eight spears radiate out to the edge of the plate. The spears turn very slowly as one ring
   (`spinLayers`), a sun barely moving; a small star at the centre turns against them. */
export function sunburst(pal: Pal, px: number): string {
  const ink = engrave(pal, TONE.structure), fig = engrave(pal, TONE.figure), sub = engrave(pal, TONE.sub);
  const dial = `<circle r="52.5" fill="${pal.dial}"/><circle r="52.5" fill="none" stroke="${ink}" stroke-width="${sw(px, 1.8)}"/><circle r="68.5" fill="none" stroke="${ink}" stroke-width="${sw(px, 1.8)}"/>`;
  const cells = each(12, (j) => {
    const a0 = (j * PI) / 6 - deg(12.5), a1 = (j * PI) / 6 + deg(12.5), ri = 55, ro = 66, [x0, y0] = P(ro, a0), [x1, y1] = P(ro, a1), [x2, y2] = P(ri, a1), [x3, y3] = P(ri, a0);
    const cell = `<path d="M${f1(x0)} ${f1(y0)}A${ro} ${ro} 0 0 1 ${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}A${ri} ${ri} 0 0 0 ${f1(x3)} ${f1(y3)}Z" fill="none" stroke="${fig}" stroke-width="${sw(px, 1.3)}" stroke-linejoin="round"/>`;
    const [mx, my] = P(60.5, (j * PI) / 6), main = j % 3 === 0;
    /* the mark in the cell: a drop pointing in, heavier at the quarters */
    const mark = main
      ? `<path d="M${f1(mx)} ${f1(my)}m0 -4.5c2.4 2.6 2.4 5.6 0 9c-2.4 -3.4 -2.4 -6.4 0 -9z" fill="${ink}" transform="rotate(${j * 30} ${f1(mx)} ${f1(my)})"/>`
      : `<circle cx="${f1(mx)}" cy="${f1(my)}" r="${dot(px, 1.7)}" fill="${ink}"/>`;
    /* the fleuron on the boundary between this cell and the next, pointing out */
    const [fx, fy] = P(70.5, (j * PI) / 6 + deg(15));
    const fleur = `<g transform="translate(${f1(fx)} ${f1(fy)}) rotate(${j * 30 + 15})" fill="none" stroke="${sub}" stroke-width="${sw(px, 1.1)}" stroke-linecap="round"><path d="M0 1V-5.5M0 -2.5C-3 -3 -4 -6 -2 -7.5M0 -2.5C3 -3 4 -6 2 -7.5"/></g>`;
    return cell + mark + fleur;
  });
  return `${dial}${cells}`;
}
export function sunRays(pal: Pal, px: number): { svg: string; R: number } {
  const R = 99, fig = engrave(pal, TONE.figure), sub = engrave(pal, TONE.sub);
  const ray = (a: number, long: boolean) => {
    const r0 = 73, r1 = long ? 97 : 88, [x0, y0] = P(r0, a), [x1, y1] = P(r1, a), [dx, dy] = P(r0 + (r1 - r0) * 0.55, a), w = 2.2, [lx, ly] = P(r1 - 6, a - deg(long ? 1.6 : 2)), [rx, ry] = P(r1 - 6, a + deg(long ? 1.6 : 2));
    return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${fig}" stroke-width="${sw(px, 1.2)}"/>` +
      `<path d="M${f1(x1)} ${f1(y1)}L${f1(lx)} ${f1(ly)}L${f1(rx)} ${f1(ry)}Z" fill="${fig}"/>` +
      `<g transform="translate(${f1(dx)} ${f1(dy)}) rotate(${f1((a * 180) / PI)})"><path d="M0 -${w * 1.6}L${w} 0L0 ${w * 1.6}L-${w} 0Z" fill="${pal.dial === DIAL.dark ? engrave(pal, 0.2) : pal.dial}" stroke="${sub}" stroke-width="${sw(px, 1)}"/></g>`;
  };
  const body = each(8, (i) => ray((i * PI) / 4, i % 2 === 0)) + each(16, (i) => { const [x, y] = P(76, (i * PI) / 8 + PI / 16); return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${dot(px, 1.1)}" fill="${sub}"/>`; });
  return { R, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}">${body}</svg>` };
}
export function sunStar(pal: Pal, px: number): { svg: string; R: number } {
  const R = 10, fig = engrave(pal, TONE.figure);
  const pts = Array.from({ length: 16 }, (_, i) => P(i % 2 ? 3.4 : 9, (i * PI) / 8)).map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('') + 'Z';
  return { R, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}"><path d="${pts}" fill="none" stroke="${fig}" stroke-width="${sw(px, 1.1)}" stroke-linejoin="round"/><circle cy="-9" r="${dot(px, 1.4)}" fill="${pal.accent}"/></svg>` };
}

/* ── Atelier Filigree (ref: an antique engraved clock face) ───────────────────────────────────────────────
   A smaller enamel dial inside a heavy bezel, with acanthus crests outside it at the four quarters, a 5…60
   minute ring inside the bezel, upright Roman hours, a small-seconds dial above six, and the spatter of a worn
   print drifting off the left edge. The small seconds tick (`spinLayers`, a ticking layer). */
const SUB_AF = { x: 0, y: 30, r: 13 } as const;
export const FILIGREE_SUB = SUB_AF;
function crest(ink: string, sub: string, px: number): string {
  /* one crest, pointing up from the bezel at y=0: a spear with leaves, a shield, and a pair of C-scrolls */
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="M0 0V-22M0 -22L-2.4 -18M0 -22L2.4 -18" stroke="${ink}" stroke-width="${sw(px, 1.4)}"/>` +
    `<path d="M0 -15C-2.6 -13.4 -3.6 -11 -1 -9.6M0 -15C2.6 -13.4 3.6 -11 1 -9.6M0 -19.5C-2 -18.8 -2.6 -17 -0.6 -16M0 -19.5C2 -18.8 2.6 -17 0.6 -16" stroke="${sub}" stroke-width="${sw(px, 1)}"/>` +
    `<path d="M-4.6 -3.5H4.6V-8.2C4.6 -10.4 2.4 -11.8 0 -12.8C-2.4 -11.8 -4.6 -10.4 -4.6 -8.2Z" fill="${ink}"/>` +
    `<path d="M-5 -2C-10 -3 -15 -7 -14.5 -12C-14 -16 -9.5 -16.2 -9 -13C-8.6 -10.6 -11.4 -10 -11.6 -11.8M5 -2C10 -3 15 -7 14.5 -12C14 -16 9.5 -16.2 9 -13C8.6 -10.6 11.4 -10 11.6 -11.8" stroke="${ink}" stroke-width="${sw(px, 1.6)}"/>` +
    `<path d="M-6 -1C-12 1 -19 0 -22 -4M6 -1C12 1 19 0 22 -4" stroke="${sub}" stroke-width="${sw(px, 1.1)}"/>` +
    `<path d="M-22 -4C-23.4 -6.4 -21.4 -8.2 -19.6 -6.8M22 -4C23.4 -6.4 21.4 -8.2 19.6 -6.8" stroke="${sub}" stroke-width="${sw(px, 1.1)}"/>` +
    `</g>`;
}
export function filigree(pal: Pal, font: string, px: number, ns: number): string {
  const ink = engrave(pal, TONE.structure), sub = engrave(pal, TONE.sub), tex = engrave(pal, TONE.texture), R = 72;
  const crests = [0, 90, 180, 270].map((a) => `<g transform="rotate(${a}) translate(0 ${-R - 1})">${crest(ink, sub, px)}</g>`).join('');
  /* the worn print: spatter thick near the left edge and thinning out — seeded, so it never jumps */
  const r = rnd(7), spatter = each(px < 150 ? 26 : 54, () => { const t = r(), x = -76 - t * 22 + r() * 6, y = (r() * 2 - 1) * (30 + t * 40), rr = (1 - t) * 1.4 + 0.4; return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${dot(px, rr)}" fill="${tex}"/>`; });
  const bezel = `<circle r="${R + 1.5}" fill="${ink}"/><circle r="${R - 1}" fill="${pal.dial}"/><circle r="${R - 3.5}" fill="none" stroke="${sub}" stroke-width="${sw(px, 1)}"/>`;
  const mins = each(60, (j) => { const a = (j * PI) / 30, [x0, y0] = P(64.5, a), [x1, y1] = P(j % 5 ? 62.5 : 61, a); return j % 5 ? `<circle cx="${f1(x0)}" cy="${f1(y0)}" r="${dot(px, 0.7)}" fill="${ink}"/>` : `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${ink}" stroke-width="${sw(px, 1.6)}"/>`; });
  /* the minute figures are a second, smaller voice: on a small plate they would be floored to the hours' size
     and crowd them, so below 150 px the ring of ticks says it alone */
  const s5 = num(px, ns * 0.55);
  const fives = px < 150 ? '' : each(12, (j) => { const [x, y] = P(58, (j * PI) / 6); return `<text x="${f1(x)}" y="${f1(y + s5 * 0.34)}" font-size="${s5}" font-family="${font}" fill="${sub}" text-anchor="middle">${j === 0 ? 60 : j * 5}</text>`; });
  const hours = romans(pal, px, font, ns, 41, (j) => j !== 6, true);
  const subd = `<circle cx="${SUB_AF.x}" cy="${SUB_AF.y}" r="${SUB_AF.r}" fill="none" stroke="${ink}" stroke-width="${sw(px, 1.3)}"/>` + each(12, (j) => { const a = (j * PI) / 6, [x0, y0] = P(SUB_AF.r - 1, a, SUB_AF.x, SUB_AF.y), [x1, y1] = P(SUB_AF.r - (j % 3 ? 2.6 : 4), a, SUB_AF.x, SUB_AF.y); return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${ink}" stroke-width="${sw(px, 1)}"/>`; });
  return `${spatter}${crests}${bezel}${mins}${fives}${hours}${subd}`;
}

/* ── Fob Watch (ref: an engraved pocket watch on its chain) ────────────────────────────────────────────────
   Chain, bow, pendant and knurled crown above a thick milled case; an enamel dial with upright Roman hours,
   spade hands and a small-seconds dial. The whole watch hangs from the top of the plate and swings a few degrees
   on its chain (`ClockFace`, `swing`), and its small seconds tick. Centre of the dial: (0, 26). */
export const FOB = { cx: 0, cy: 26, case: 62, dial: 53, sub: { x: 0, y: 26 + 25, r: 10 } } as const;
export function fob(pal: Pal, font: string, px: number, ns: number): string {
  const ink = engrave(pal, TONE.structure), fig = engrave(pal, TONE.figure), sub = engrave(pal, TONE.sub), { cx, cy } = FOB;
  /* the chain: links alternating face-on (ring) and edge-on (bar), from the top of the plate to the bow */
  const chain = each(5, (i) => { const y = -98 + i * 7.6; return i % 2 ? `<rect x="-1.4" y="${f1(y - 3.6)}" width="2.8" height="7.2" rx="1.4" fill="${fig}"/>` : `<ellipse cx="0" cy="${f1(y)}" rx="3.4" ry="4.6" fill="none" stroke="${fig}" stroke-width="${sw(px, 1.5)}"/>`; });
  const bow = `<ellipse cx="0" cy="-49" rx="10.5" ry="11.5" fill="none" stroke="${ink}" stroke-width="${sw(px, 4)}"/><ellipse cx="0" cy="-49" rx="10.5" ry="11.5" fill="none" stroke="${pal.dial === DIAL.dark ? engrave(pal, 0.3) : pal.dial}" stroke-width="${sw(px, 1)}"/>`;
  const pendant = `<path d="M-3.6 -38.5H3.6L5 -32H-5Z" fill="${ink}"/><rect x="-6.5" y="-32.5" width="13" height="5" rx="1.6" fill="${fig}"/>${each(6, (i) => `<line x1="${f1(-5.2 + i * 2.08)}" y1="-32" x2="${f1(-5.2 + i * 2.08)}" y2="-28" stroke="${pal.dial === DIAL.dark ? engrave(pal, 0.3) : pal.dial}" stroke-width="${sw(px, 0.6)}"/>`)}<rect x="-3.2" y="-28" width="6.4" height="5" fill="${ink}"/>`;
  /* the case: a heavy ring, its milled edge, then the bezel step down to the enamel */
  const caseRing = `<circle cx="${cx}" cy="${cy}" r="${FOB.case + 2}" fill="${ink}"/>` + `<circle cx="${cx}" cy="${cy}" r="${FOB.case - 3}" fill="${fig}"/>` +
    `<g stroke="${pal.dial === DIAL.dark ? engrave(pal, 0.3) : pal.dial}" stroke-width="${sw(px, 0.8)}">${each(px < 150 ? 48 : 90, (i) => { const n = px < 150 ? 48 : 90, a = (i * 2 * PI) / n, [x0, y0] = P(FOB.case + 1.6, a, cx, cy), [x1, y1] = P(FOB.case - 0.6, a, cx, cy); return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"/>`; })}</g>` +
    `<circle cx="${cx}" cy="${cy}" r="${FOB.dial + 1.6}" fill="${ink}"/><circle cx="${cx}" cy="${cy}" r="${FOB.dial}" fill="${pal.dial}"/>`;
  const track = `<circle cx="${cx}" cy="${cy}" r="${FOB.dial - 3}" fill="none" stroke="${sub}" stroke-width="${sw(px, 0.9)}"/>` + each(60, (j) => { const a = (j * PI) / 30, [x0, y0] = P(FOB.dial - 3, a, cx, cy), [x1, y1] = P(FOB.dial - (j % 5 ? 5 : 7), a, cx, cy); return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${ink}" stroke-width="${sw(px, j % 5 ? 0.8 : 1.6)}"/>`; });
  const hours = romans(pal, px, font, ns, 40, (j) => j !== 6, true, cx, cy);
  const s = FOB.sub, subd = `<circle cx="${s.x}" cy="${s.y}" r="${s.r}" fill="none" stroke="${ink}" stroke-width="${sw(px, 1.1)}"/>` + each(12, (j) => { const a = (j * PI) / 6, [x0, y0] = P(s.r - 0.8, a, s.x, s.y), [x1, y1] = P(s.r - (j % 3 ? 2.2 : 3.6), a, s.x, s.y); return `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${ink}" stroke-width="${sw(px, 0.9)}"/>`; });
  return `${chain}${bow}${pendant}${caseRing}${track}${hours}${subd}`;
}

/** A small-seconds hand for a sub-dial, centred on its own axis (the host turns it with the seconds). */
export function subSecondsHand(pal: Pal, px: number, r: number): { svg: string; R: number } {
  const R = r + 1;
  return { R, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R} ${-R} ${2 * R} ${2 * R}"><path d="M0 ${f1(r * 0.25)}V${f1(-r * 0.86)}" stroke="${pal.second}" stroke-width="${sw(px, 1.1)}" stroke-linecap="round"/><circle r="${dot(px, 1.5)}" fill="${pal.second}"/></svg>` };
}
