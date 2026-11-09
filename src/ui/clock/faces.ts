/**
 * The clock faces (v0.6). Three watches, chosen for one job: telling the time at a glance on a 112 dp header.
 *
 * The owner retired the nine engraved faces ("useless and hard to read"): Roman numerals, guilloché and turning
 * centre ornaments all competed with the hands. Each face below is a real watch TYPE — a field watch, a studio
 * dress watch, a diver — with Arabic numerals, a quiet centre (a pin, nothing turning) and hands shaped so the
 * hour and the minute can never be confused. Everything is one static dial document plus three hand documents
 * that the UI thread rotates; nothing is redrawn per frame.
 *
 * Colours come from the palette (`c.ink`) and the dial materials in `tokens/theme.ts` (`DIAL`, `SECOND`), so a
 * face is white enamel in light and black lacquer in dark, and no hex lives here (`color-drift.test.ts`).
 */
import type { Colors } from '../../tokens/theme';
import { DIAL, SECOND } from '../../tokens/theme';

export type FaceId = 'field' | 'studio' | 'diver';
export type Beat = 'tick' | 'sweep' | 'mech';
export interface FaceSpec { id: FaceId; n: string; d: string; beat: Beat; date?: boolean }
export const FACES: FaceSpec[] = [
  { id: 'field', n: 'Field', d: 'All twelve numerals and a minute track. The quartz second steps.', beat: 'tick' },
  { id: 'studio', n: 'Studio', d: 'Four big numerals, thin batons, slim hands. The second sweeps.', beat: 'sweep' },
  { id: 'diver', n: 'Diver', d: 'A dark minute bezel, bold markers and the date.', beat: 'mech', date: true },
];
/** Any stored id — including the nine retired faces (`g`, `rb`, `c`, …) — resolves to a face that exists. */
export const faceById = (id: string): FaceSpec => FACES.find((f) => f.id === id) ?? (FACES[0] as FaceSpec);

/** `bezel`/`bezelInk`: the Diver's ring stays dark in both themes — ink in light, a charcoal tone in dark. */
export interface Pal { ink: string; dial: string; second: string; mut: string; bezel: string; bezelInk: string }
const chan = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** A flat tone `t` of the way from the dial to the ink — a printed grey, never translucent ink. */
const mix = (dial: string, ink: string, t: number) => {
  const a = chan(ink), b = chan(dial);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return ink;
  return `#${a.map((v, i) => Math.round(b[i]! + (v - b[i]!) * t).toString(16).padStart(2, '0')).join('')}`;
};
export function dialPal(c: Pick<Colors, 'ink'>, dark: boolean): Pal {
  const dial = dark ? DIAL.dark : DIAL.light;
  return { ink: c.ink, dial, second: dark ? SECOND.dark : SECOND.light, mut: mix(dial, c.ink, 0.55), bezel: dark ? mix(dial, c.ink, 0.2) : c.ink, bezelInk: dark ? c.ink : dial };
}

const f1 = (v: number) => +v.toFixed(1);
const P = (r: number, i: number, n = 12): [number, number] => { const a = (i / n) * 2 * Math.PI; return [f1(r * Math.sin(a)), f1(-r * Math.cos(a))]; };
const each = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join('');
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200">${body}</svg>`;
/** A stroke never thinner than ~0.6 dp at the size it is drawn, so a 96 dp thumbnail keeps its minute track. */
const sw = (px: number, u: number) => f1(Math.max(u, 120 / px));
const text = (x: number, y: number, s: number, fill: string, font: string, v: string, anchor = 'middle') =>
  `<text x="${x}" y="${f1(y + s * 0.36)}" font-size="${s}" font-family="${font}" fill="${fill}" text-anchor="${anchor}">${v}</text>`;
const tick = (r1: number, r2: number, i: number, n: number, stroke: string, w: number) => { const [x1, y1] = P(r1, i, n), [x2, y2] = P(r2, i, n); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`; };

/** The dial without hands. `day` is the date window's number (Diver); the window is left empty without it. */
export function dialSvg(f: FaceSpec, pal: Pal, font: string, px = 200, day?: number): string {
  const { ink, dial, mut, bezel: bz, bezelInk } = pal;
  if (f.id === 'studio') {
    return svg(`<circle r="99" fill="${dial}"/><circle r="97" fill="none" stroke="${mut}" stroke-width="${sw(px, 0.8)}"/>` +
      each(60, (i) => (i % 5 ? (() => { const [x, y] = P(92, i, 60); return `<circle cx="${x}" cy="${y}" r="${f1(Math.max(0.9, 90 / px))}" fill="${mut}"/>`; })() : '')) +
      each(12, (i) => (i % 3 ? tick(78, 91, i, 12, ink, sw(px, 2.6)) : '')) +
      [0, 3, 6, 9].map((i) => { const [x, y] = P(73, i); return text(x, y, 27, ink, font, String(i || 12)); }).join(''));
  }
  if (f.id === 'diver') {
    const bezel = each(12, (i) => {
      if (i === 0) return `<path d="M0 -84L-6 -95H6Z" fill="${bezelInk}"/>`;
      const [x, y] = P(89.5, i);
      return i % 2 === 0 ? text(x, y, 11, bezelInk, font, String(i * 5)) : `<circle cx="${x}" cy="${y}" r="1.8" fill="${bezelInk}"/>`;
    });
    const marks = each(12, (i) => {
      if (i === 3) return '';
      if (i === 0 || i === 6 || i === 9) { const [x, y] = P(57, i); return text(x, y, 21, ink, font, String(i || 12)); }
      const [x, y] = P(66, i); return `<circle cx="${x}" cy="${y}" r="4.6" fill="${ink}"/>`;
    });
    const win = `<rect x="47" y="-8.5" width="25" height="17" rx="2.5" fill="${dial}" stroke="${ink}" stroke-width="${sw(px, 1.3)}"/>${day ? text(59.5, 0, 12, ink, font, String(day)) : ''}`;
    return svg(`<circle r="99" fill="${bz}"/><circle r="79" fill="${dial}"/><circle r="79" fill="none" stroke="${mut}" stroke-width="${sw(px, 0.8)}"/>${bezel}` +
      each(60, (i) => (i % 5 ? tick(73, 77, i, 60, mut, sw(px, 0.9)) : tick(71, 77, i, 60, ink, sw(px, 1.8)))) + marks + win);
  }
  // field
  return svg(`<circle r="99" fill="${ink}"/><circle r="96" fill="${dial}"/>` +
    each(60, (i) => (i % 5 ? tick(88, 92, i, 60, mut, sw(px, 0.9)) : tick(84, 92, i, 60, ink, sw(px, 2.2)))) +
    each(12, (i) => { const [x, y] = P(69, i); return text(x, y, 17, ink, font, String(i || 12)); }));
}

export type HandKind = 'hour' | 'minute' | 'second';
/** Hands point to 12 and turn about the dial centre (the host view is the dial's size, so its centre is the pivot). */
export function handSvg(kind: HandKind, f: FaceSpec, pal: Pal, px = 200): string {
  const { ink, dial, second } = pal;
  if (kind === 'second') {
    if (f.id === 'diver') return svg(`<path d="M0 20V-82" stroke="${second}" stroke-width="${sw(px, 1.3)}" stroke-linecap="round"/><circle cy="-58" r="4.6" fill="${dial}" stroke="${second}" stroke-width="${sw(px, 1.8)}"/><circle r="3.6" fill="${second}"/>`);
    if (f.id === 'studio') return svg(`<path d="M0 16V-90" stroke="${second}" stroke-width="${sw(px, 1)}" stroke-linecap="round"/><circle r="2.6" fill="${second}"/>`);
    return svg(`<path d="M0 18V-86" stroke="${second}" stroke-width="${sw(px, 1.3)}" stroke-linecap="round"/><circle cy="14" r="3" fill="${second}"/><circle r="3.2" fill="${second}"/>`);
  }
  const hour = kind === 'hour';
  if (f.id === 'studio') {
    const L = hour ? 50 : 82;
    return svg(`<path d="M0 10V-${L}" stroke="${ink}" stroke-width="${sw(px, hour ? 4.4 : 2.8)}" stroke-linecap="round"/><circle r="${hour ? 4.4 : 3.4}" fill="${ink}"/>`);
  }
  if (f.id === 'diver') {
    if (hour) return svg(`<path d="M0 12V-36" stroke="${ink}" stroke-width="${sw(px, 5)}" stroke-linecap="round"/><path d="M-10 -34L0 -54L10 -34Z" fill="${ink}"/><path d="M-4.2 -37L0 -46L4.2 -37Z" fill="${dial}"/><circle r="5.2" fill="${ink}"/>`);
    return svg(`<path d="M-4.2 12L-4.6 -60L0 -76L4.6 -60L4.2 12Z" fill="${ink}"/><path d="M0 -12V-62" stroke="${dial}" stroke-width="${sw(px, 1.8)}" stroke-linecap="round"/><circle r="5.2" fill="${ink}"/>`);
  }
  // field: swords with a lume slot, the hour one broad and short
  const L = hour ? 52 : 80, w = hour ? 5.6 : 3.8;
  return svg(`<path d="M-${w * 0.8} 12L-${w} -${f1(L * 0.8)}L0 -${L}L${w} -${f1(L * 0.8)}L${w * 0.8} 12Z" fill="${ink}"/><path d="M0 -10V-${f1(L * 0.78)}" stroke="${dial}" stroke-width="${sw(px, hour ? 1.8 : 1.3)}" stroke-linecap="round"/><circle r="4.6" fill="${ink}"/><circle r="1.6" fill="${dial}"/>`);
}

/** Whole face as one static SVG at a moment — the Settings thumbnails, and the visual check in tests. */
export function compositeSvg(f: FaceSpec, pal: Pal, font: string, t = { h: 10, m: 10, s: 30 }, px = 200, day = 9): string {
  const strip = (s: string) => s.replace(/^<svg[^>]*>|<\/svg>$/g, '');
  const ha = (t.h % 12) * 30 + t.m * 0.5, ma = t.m * 6 + t.s * 0.1, sa = t.s * 6;
  return svg(`${strip(dialSvg(f, pal, font, px, day))}<g transform="rotate(${ha})">${strip(handSvg('hour', f, pal, px))}</g><g transform="rotate(${ma})">${strip(handSvg('minute', f, pal, px))}</g><g transform="rotate(${sa})">${strip(handSvg('second', f, pal, px))}</g>`);
}

/**
 * Hand angles for a UTC instant, given a timezone offset in ms. Pure, so it can be asserted without a renderer.
 *
 * `Date.now()` is UTC milliseconds; local wall time is `now - offset`, because `getTimezoneOffset()` is minutes
 * *west* of UTC. The result is wrapped into one day. **The offset is a parameter**, re-read by `ClockFace`, because
 * an app left open across a DST change must not stay an hour wrong. **This function is a worklet**: `ClockFace`'s
 * frame callback runs on the UI runtime, and calling a plain JS function from there throws.
 */
export function handAngles(utcMs: number, offsetMs: number): { ha: number; ma: number; sec: number } {
  'worklet';
  const ms = (utcMs - offsetMs) % 86_400_000;
  return { ha: (ms / 3_600_000 % 12) * 30, ma: (ms / 60_000 % 60) * 6, sec: (ms % 60_000) / 1000 };
}
