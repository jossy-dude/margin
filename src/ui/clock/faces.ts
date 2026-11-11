/**
 * The clock (v0.7). ONE face.
 *
 * History, because each step was an owner verdict: nine engraved faces ("useless and hard to read"), then three
 * watches — Field, Studio, Diver — which read well but still looked like stock watch drawings ("I don't like the
 * clock design overall"). The owner chose one refined analog face instead of a catalogue.
 *
 * So this is a single dial in the manner of a thin dress watch: a slim case, a quiet domed dial, twelve fine
 * batons with a double one at twelve, a minute track fine enough to recede, two slender lance hands, and one
 * coloured thing — the second hand, in the user's own accent pen. No numerals: on a 115 dp masthead they were
 * 10 dp tall and crowded the hands, and a phone is never held upside down, so the double baton is orientation
 * enough. Nothing turns but the hands.
 *
 * Everything is one static dial document plus three hand documents the UI thread rotates; nothing is redrawn
 * per tick. Colours come from the palette (`ink`, `card`, `acc`, `shadow`), so the dial is the look's own card
 * stock in light and in dark, and no hex lives here (`color-drift.test.ts`).
 */
import type { Colors } from '../../tokens/theme';

/** What the dial is drawn with. `mut` is a flat tone between dial and ink (a printed grey, never translucent ink). */
export interface Pal { ink: string; dial: string; second: string; mut: string; shadow: string; dark: boolean; bezel: string; hourPaint: string; minPaint: string; wood: string; rubber: string; mark: string }
/** The coloured papers the clock is cut from. Without them it falls back to tones mixed from the palette. */
export interface ClockPapers { kraft: string; mustard: string; denim: string; cream: string; blush: string; tomato: string }
/** One class on the rim: minutes of the day it starts and ends, and whether it is already over. */
export interface Arc { from: number; to: number; done?: boolean }

const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (from: string, to: string, t: number) => {
  const a = chan(to), b = chan(from);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return to;
  return `#${a.map((v, i) => Math.round(b[i]! + (v - b[i]!) * t).toString(16).padStart(2, '0')).join('')}`;
};

export function dialPal(c: Pick<Colors, 'ink' | 'card' | 'acc' | 'shadow'>, dark: boolean, t?: ClockPapers): Pal {
  const tone = (k: number) => mix(c.card, c.ink, k);
  return { ink: c.ink, dial: c.card, second: c.acc, mut: tone(0.5), shadow: c.shadow, dark,
    bezel: t?.kraft ?? tone(0.3), hourPaint: t?.denim ?? tone(0.7), minPaint: t?.mustard ?? tone(0.4), wood: t?.cream ?? tone(0.12), rubber: t?.blush ?? tone(0.25), mark: t?.tomato ?? tone(0.6) };
}

const f1 = (v: number) => +v.toFixed(1);
/** A point at radius `r`, `i` steps of `n` round the dial from twelve. */
const P = (r: number, i: number, n = 12): [number, number] => { const a = (i / n) * 2 * Math.PI; return [f1(r * Math.sin(a)), f1(-r * Math.cos(a))]; };
const each = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">${body}</svg>`;
/** A stroke width in dial units that never draws thinner than ~0.6 dp at `px`. */
const sw = (px: number, u: number) => f1(Math.max(u, 120 / px));
const tick = (r1: number, r2: number, i: number, n: number, stroke: string, w: number, cap = '') => { const [x1, y1] = P(r1, i, n), [x2, y2] = P(r2, i, n); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"${cap}/>`; };

export const CASE_R = 92;
const DIAL_R = 81, RIM_R = 86.5, GRID = 18;

/** Today's classes as highlighter strokes on the rim. The dial is twelve hours round, so 08:00 and 20:00 share a place. */
export function rimArcs(arcs: Arc[], pal: Pal): string {
  return arcs.filter((a) => a.to > a.from).map((a) => {
    const span = Math.min(a.to - a.from, 719), [x1, y1] = P(RIM_R, a.from % 720, 720), [x2, y2] = P(RIM_R, (a.from + span) % 720, 720);
    return `<path d="M${x1} ${y1}A${RIM_R} ${RIM_R} 0 ${span > 360 ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke="${pal.mark}" stroke-opacity="${a.done ? 0.3 : 1}" stroke-width="6.5" stroke-linecap="round"/>`;
  }).join('');
}

/**
 * The dial: a kraft-paper bezel with a stitched seam, a graph-paper face, chunky quarter batons and
 * dots for the other hours. Nothing on it turns; the hands are separate documents.
 */
export function dialSvg(pal: Pal, px = 200, arcs: Arc[] = []): string {
  const { ink, dial, mut, shadow, dark, bezel } = pal;
  const defs = `<defs><radialGradient id="mcs" cx="0" cy="3.5" r="${CASE_R + 7}" gradientUnits="userSpaceOnUse"><stop offset="0.86" stop-color="${shadow}" stop-opacity="${dark ? 0.5 : 0.24}"/><stop offset="1" stop-color="${shadow}" stop-opacity="0"/></radialGradient></defs>`;
  /* Graph paper without a clip: each line is the chord of the dial at that offset. */
  const grid = each(2 * Math.floor(DIAL_R / GRID) + 1, (k) => {
    const o = (k - Math.floor(DIAL_R / GRID)) * GRID, h = f1(Math.sqrt(DIAL_R * DIAL_R - o * o) - 1), w = sw(px, 0.7);
    return `<line x1="${o}" y1="${-h}" x2="${o}" y2="${h}" stroke="${mut}" stroke-opacity="0.28" stroke-width="${w}"/><line x1="${-h}" y1="${o}" x2="${h}" y2="${o}" stroke="${mut}" stroke-opacity="0.28" stroke-width="${w}"/>`;
  });
  const batons = each(12, (i) => {
    if (i === 0) return `<line x1="-4" y1="-76" x2="-4" y2="-62" stroke="${ink}" stroke-width="4.4" stroke-linecap="round"/><line x1="4" y1="-76" x2="4" y2="-62" stroke="${ink}" stroke-width="4.4" stroke-linecap="round"/>`;
    if (i % 3 === 0) return tick(62, 76, i, 12, ink, 4.8, ' stroke-linecap="round"');
    const [x, y] = P(72, i); return `<circle cx="${x}" cy="${y}" r="2.6" fill="${ink}"/>`;
  });
  return svg(`${defs}<circle cy="3.5" r="${CASE_R + 7}" fill="url(#mcs)"/>` +
    `<circle r="${CASE_R}" fill="${bezel}"/>` +
    `<circle r="${RIM_R}" fill="none" stroke="${dial}" stroke-opacity="0.75" stroke-width="${sw(px, 1.1)}" stroke-dasharray="3.2 3.6" stroke-linecap="round"/>` +
    rimArcs(arcs, pal) +
    `<circle r="${DIAL_R}" fill="${dial}" stroke="${ink}" stroke-opacity="0.18" stroke-width="${sw(px, 0.9)}"/>` +
    grid + batons);
}

export type HandKind = 'hour' | 'minute' | 'second';
/**
 * The hour and minute hands are two pencils — a short blue one and a long yellow one — pinned through
 * the dial by a brad. The second hand is a needle in the accent pen. Each is drawn pointing at twelve.
 */
export function handSvg(kind: HandKind, pal: Pal, px = 200): string {
  const { ink, dial, second, wood, rubber, mut } = pal;
  if (kind === 'second') {
    return svg(`<path d="M0 22V-78" stroke="${second}" stroke-width="${sw(px, 1.2)}" stroke-linecap="round"/>` +
      `<circle cy="16" r="4" fill="none" stroke="${second}" stroke-width="${sw(px, 1.6)}"/>` +
      `<circle r="5.4" fill="${pal.minPaint}" stroke="${ink}" stroke-width="${sw(px, 0.9)}"/><circle r="1.7" fill="${dial}"/>`);
  }
  const hour = kind === 'hour', L = hour ? 50 : 76, w = hour ? 4.4 : 3.3, paint = hour ? pal.hourPaint : pal.minPaint, o = sw(px, 0.9);
  const cone = L - (hour ? 11 : 12), tip = L - 4, lead = f1((w * 4) / (L - cone));
  return svg(
    `<path d="M-${w} 16H${w}V11H-${w}Z" fill="${rubber}" stroke="${ink}" stroke-width="${o}" stroke-linejoin="round"/>` +
    `<path d="M-${w} 11H${w}V7.5H-${w}Z" fill="${mut}" stroke="${ink}" stroke-width="${o}" stroke-linejoin="round"/>` +
    `<path d="M-${w} 7.5H${w}V-${cone}H-${w}Z" fill="${paint}" stroke="${ink}" stroke-width="${o}" stroke-linejoin="round"/>` +
    `<path d="M-${f1(w * 0.3)} 6V-${cone - 1}" stroke="${dial}" stroke-opacity="0.45" stroke-width="${sw(px, 0.9)}"/>` +
    `<path d="M-${w} -${cone}L0 -${L}L${w} -${cone}Z" fill="${wood}" stroke="${ink}" stroke-width="${o}" stroke-linejoin="round"/>` +
    `<path d="M-${lead} -${tip}L0 -${L}L${lead} -${tip}Z" fill="${ink}"/>`);
}

export function compositeSvg(pal: Pal, t = { h: 10, m: 10, s: 30 }, px = 200, arcs: Arc[] = []): string {
  const strip = (s: string) => s.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const ha = (t.h % 12) * 30 + t.m * 0.5, ma = t.m * 6 + t.s * 0.1, sa = t.s * 6;
  return svg(`${strip(dialSvg(pal, px, arcs))}<g transform="rotate(${ha})">${strip(handSvg('hour', pal, px))}</g><g transform="rotate(${ma})">${strip(handSvg('minute', pal, px))}</g><g transform="rotate(${sa})">${strip(handSvg('second', pal, px))}</g>`);
}

/**
 * Hand angles for a UTC instant, given a timezone offset in ms. Pure, so it can be asserted without a renderer.
 *
 * `Date.now()` is UTC milliseconds; local wall time is `now - offset`, because `getTimezoneOffset()` is minutes
 * *west* of UTC. The result is wrapped into one day. **The offset is a parameter**, read fresh on every tick by
 * `ClockFace`, because an app left open across a DST change must not stay an hour wrong.
 *
 * `sa` is the second hand's angle and it is CUMULATIVE over the day (whole seconds × 6°), not wrapped to 360:
 * the hand is eased from one second to the next, and easing from 354° to 0° would spin it backwards once a minute.
 */
export function handAngles(utcMs: number, offsetMs: number): { ha: number; ma: number; sec: number; sa: number } {
  const ms = (((utcMs - offsetMs) % 86_400_000) + 86_400_000) % 86_400_000;
  return { ha: (ms / 3_600_000 % 12) * 30, ma: (ms / 60_000 % 60) * 6, sec: (ms % 60_000) / 1000, sa: Math.floor(ms / 1000) * 6 };
}
