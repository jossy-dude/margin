import { F } from './geom';
import { resolveInk, twoInks, type Inks } from './ink';
import { instrument } from './catalogue';
import { HBAND, type Shape } from './types';

/** The app's data face, with a typewriter fallback so the offline raster approximates the real
 *  metrics instead of silently swapping to a proportional face and hiding a digit that does not fit. */
export const DATA_FONT = 'SpecialElite_400Regular, "Courier New", ui-monospace, monospace';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One shape as SVG markup. A `run` is two paths: the resting draw, then the lit run over it. */
export function shapeSvg(s: Shape, k: Inks, ctxP = 1): string {
  if (s.t === 'g') return `<g${s.tf ? ` transform="${s.tf}"` : ''}>${s.ch.map((q) => shapeSvg(q, k, ctxP)).join('')}</g>`;
  const c = resolveInk(s.ink, k);
  const o = s.op === undefined ? '' : ` opacity="${F(s.op)}"`;
  switch (s.t) {
    case 'p': {
      const st = `stroke="${c}" stroke-width="${s.sw ?? 1.5}" fill="${s.f ? c : 'none'}"${o}${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.cap ? ` stroke-linecap="${s.cap}" stroke-linejoin="round"` : ''}`;
      return `<path d="${s.d}" ${st}/>`;
    }
    // The resting draw is the WHOLE line; the live run is a dash window of `len` px slid from one
    // end to the other, so at p=1 it is all of it and at p=0 none of it. `len` was measured as the
    // points were made, so the window is the true fraction of the true length.
    case 'run':
      // a run shorter than half a pixel has nothing to reveal, and `dasharray="0 0"` means SOLID —
      // which would draw a dot at the origin of a machine that is finished
      if (s.len < 0.5) return `<path d="${s.d}" fill="none" stroke="${k.rest}" stroke-width="${s.sw}" opacity=".5"${o}/>`;
      return (
        `<path d="${s.d}" fill="none" stroke="${k.rest}" stroke-width="${s.sw}" opacity=".5"${o}/>` +
        `<path d="${s.d}" fill="none" stroke="${c}" stroke-width="${s.sw}"${o}${s.cap ? ` stroke-linecap="${s.cap}" stroke-linejoin="round"` : ''} stroke-dasharray="${F(s.len)} ${F(s.len)}" stroke-dashoffset="${F(s.len * (1 - ctxP))}"/>`
      );
    case 'r':
      return `<rect x="${F(s.x)}" y="${F(s.y)}" width="${F(Math.max(0, s.w))}" height="${F(Math.max(0, s.h))}"${s.rx === undefined ? '' : ` rx="${F(s.rx)}"`} fill="${s.f ? c : 'none'}" stroke="${s.f ? 'none' : c}" stroke-width="${s.sw ?? 1.4}"${o}/>`;
    case 'c':
      return `<circle cx="${F(s.cx)}" cy="${F(s.cy)}" r="${F(s.r)}" fill="${s.f ? c : 'none'}" stroke="${s.f ? 'none' : c}" stroke-width="${s.sw ?? 1.4}"${o}/>`;
    case 'l':
      return `<line x1="${F(s.x1)}" y1="${F(s.y1)}" x2="${F(s.x2)}" y2="${F(s.y2)}" stroke="${c}" stroke-width="${s.sw ?? 1.3}"${o}${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}${s.cap ? ` stroke-linecap="${s.cap}"` : ''}/>`;
    case 'x':
      return `<text x="${F(s.x)}" y="${F(s.y + (s.size ?? 8) * 0.34)}" fill="${c}" font-family='${DATA_FONT}' font-size="${s.size ?? 8}" text-anchor="${s.anchor ?? 'start'}">${esc(s.s)}</text>`;
  }
}

export interface Doc { w: number; h?: number; inks: Inks; p?: number }

/** A whole instrument as one standalone `<svg>` document, 1 user unit = 1 pixel, no preserveAspectRatio
 *  override needed because `width` and `height` ARE the viewBox. Nothing can stretch. */
export function svgDoc(shapes: Shape[], d: Doc): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${F(d.w)} ${F(d.h ?? HBAND)}" width="${F(d.w)}" height="${F(d.h ?? HBAND)}">` +
    shapes.map((s) => shapeSvg(s, d.inks, d.p ?? 1)).join('') +
    '</svg>'
  );
}
/**
 * A whole instrument as one markup string, ready for `<SvgXml>`.
 *
 * This exists for the Settings picker. That sheet mounts EVERY bar kind live at once — 26 of them —
 * and a live preview is 20–95 react-native-svg nodes each, so the whole sheet is ~800 nodes and every
 * Reanimated worklet in it. Rendering the 25 unselected kinds as static `SvgXml` strings with the dash
 * offset already baked in costs one string each, and the selected kind stays live so the user can see
 * it move. The geometry is the same code either way: there is no second drawing to drift.
 *
 * @param p   0..1 remaining. The picker passes the demo moment's real value, not a fixed 0.5.
 */
export function previewSvg(id: string, o: { p: number; w: number; ink: string; slab: string; acc: string; warn: string; total?: number; left?: number; late?: boolean }): string {
  const def = instrument(id);
  if (!def) return '';
  const total = o.total ?? 50 * 60_000;
  return svgDoc(def.build({ p: o.p, w: o.w, total, left: o.left ?? o.p * total, late: o.late ?? false }), {
    w: o.w,
    inks: twoInks(o.ink, o.slab, o.acc, o.warn),
    p: o.p,
  });
}
