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
export interface Pal { ink: string; dial: string; second: string; mut: string; shadow: string; dark: boolean }
const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (from: string, to: string, t: number) => {
  const a = chan(to), b = chan(from);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return to;
  return `#${a.map((v, i) => Math.round(b[i]! + (v - b[i]!) * t).toString(16).padStart(2, '0')).join('')}`;
};
export function dialPal(c: Pick<Colors, 'ink' | 'card' | 'acc' | 'shadow'>, dark: boolean): Pal {
  return { ink: c.ink, dial: c.card, second: c.acc, mut: mix(c.card, c.ink, 0.5), shadow: c.shadow, dark };
}

const f1 = (v: number) => +v.toFixed(1);
const P = (r: number, i: number, n = 12): [number, number] => { const a = (i / n) * 2 * Math.PI; return [f1(r * Math.sin(a)), f1(-r * Math.cos(a))]; };
const each = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">${body}</svg>`;
/** A stroke never thinner than ~0.6 dp at the size it is drawn, so a small dial keeps its minute track. */
const sw = (px: number, u: number) => f1(Math.max(u, 120 / px));
const tick = (r1: number, r2: number, i: number, n: number, stroke: string, w: number) => { const [x1, y1] = P(r1, i, n), [x2, y2] = P(r2, i, n); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}"/>`; };

/** Case radius. The box is 200 units; the 8 left over is where the case's shadow falls. */
export const CASE_R = 92;
const DIAL_R = 89.2;
/** The sector ring: the hairline circle the batons stand on. */
const SECTOR_R = 61;

/** The dial without hands. */
export function dialSvg(pal: Pal, px = 200): string {
  const { ink, dial, mut, shadow, dark } = pal;
  const defs = `<defs>` +
    `<radialGradient id="mcs" cx="0" cy="3.5" r="${CASE_R + 7}" gradientUnits="userSpaceOnUse"><stop offset="0.86" stop-color="${shadow}" stop-opacity="${dark ? 0.5 : 0.24}"/><stop offset="1" stop-color="${shadow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="mcd" cx="0" cy="-14" r="${DIAL_R + 14}" gradientUnits="userSpaceOnUse"><stop offset="0.5" stop-color="${ink}" stop-opacity="0"/><stop offset="1" stop-color="${ink}" stop-opacity="${dark ? 0.1 : 0.07}"/></radialGradient>` +
    `</defs>`;
  const track = each(60, (i) => (i % 5 ? tick(80, 83.5, i, 60, mut, sw(px, 0.8)) : ''));
  const batons = each(12, (i) => {
    if (i === 0) { const w = sw(px, 2.2); return `<line x1="-2.8" y1="-83.5" x2="-2.8" y2="-${SECTOR_R}" stroke="${ink}" stroke-width="${w}"/><line x1="2.8" y1="-83.5" x2="2.8" y2="-${SECTOR_R}" stroke="${ink}" stroke-width="${w}"/>`; }
    return tick(i % 3 ? 71 : SECTOR_R, 83.5, i, 12, ink, sw(px, i % 3 ? 1.7 : 2.2));
  });
  return svg(`${defs}<circle cy="3.5" r="${CASE_R + 7}" fill="url(#mcs)"/>` +
    `<circle r="${CASE_R}" fill="${ink}"/><circle r="${DIAL_R}" fill="${dial}"/><circle r="${DIAL_R}" fill="url(#mcd)"/>` +
    `<circle r="${SECTOR_R}" fill="none" stroke="${mut}" stroke-width="${sw(px, 0.8)}"/>` +
    track + batons);
}

export type HandKind = 'hour' | 'minute' | 'second';
/** Hands point to 12 and turn about the dial centre (the host view is the dial's size, so its centre is the pivot). */
export function handSvg(kind: HandKind, pal: Pal, px = 200): string {
  const { ink, dial, second } = pal;
  if (kind === 'second') {
    return svg(`<path d="M0 22V-83" stroke="${second}" stroke-width="${sw(px, 1.1)}" stroke-linecap="round"/>` +
      `<path d="M0 9V22" stroke="${second}" stroke-width="${sw(px, 2.8)}" stroke-linecap="round"/>` +
      `<circle r="3.6" fill="${second}"/><circle r="1.3" fill="${dial}"/>`);
  }
  // Pencil hands: a slender stick with the faintest taper and a rounded end. The hour hand stops at the sector
  // ring and is half as broad again, so the two can never be confused, even as silhouettes.
  const hour = kind === 'hour', L = hour ? 50 : 79, w0 = hour ? 2.5 : 1.75, w1 = hour ? 1.9 : 1.25, t = 10;
  return svg(`<path d="M-${w0} ${t}L-${w1} -${L}H${w1}L${w0} ${t}Z" fill="${ink}" stroke="${ink}" stroke-width="${hour ? 1.6 : 1.3}" stroke-linejoin="round"/>` +
    (hour ? '' : `<circle r="5" fill="${ink}"/>`));
}

/** Whole face as one static SVG at a moment — previews, the tools, and the visual check in tests. */
export function compositeSvg(pal: Pal, t = { h: 10, m: 10, s: 30 }, px = 200): string {
  const strip = (s: string) => s.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const ha = (t.h % 12) * 30 + t.m * 0.5, ma = t.m * 6 + t.s * 0.1, sa = t.s * 6;
  return svg(`${strip(dialSvg(pal, px))}<g transform="rotate(${ha})">${strip(handSvg('hour', pal, px))}</g><g transform="rotate(${ma})">${strip(handSvg('minute', pal, px))}</g><g transform="rotate(${sa})">${strip(handSvg('second', pal, px))}</g>`);
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
