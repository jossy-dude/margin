/**
 * Daylight, rebuilt as a real overlay skin (v0.7.7.5, SPEC §1 A). The ground is a baked sky per hour
 * (`assets/sky`, `tools/sky.mjs`); every surface is a pane of glass over it, thin enough to see the sky's glow and
 * clouds through. There is no blur (a render pass per pane is too slow on the A51); the baked sky is already soft.
 *
 * Contrast is held on PIXELS, not on two hex stops: `tokens-v2.test.ts` composites each pane over the darkest and
 * lightest pixel of its sky (`assets/sky/stats.json`) and every ink and the accent must reach 4.5:1. Where a sky
 * failed at the spec's 0.58 the pane rose for that sky, never the text: `PANE_ALPHA` is that answer.
 *
 * `now` amber is only for the live class and its countdown. The accent follows the sky (D1) and keeps at least
 * 30° of hue from `now`.
 */
import type { Face, Skin } from './types';

/* Hanken Grotesk's four weights, as `tokens/theme.ts` FONT names them (kept literal so the skin needs no theme import) */
const HK = { r: 'HankenGrotesk_400Regular', m: 'HankenGrotesk_500Medium', s: 'HankenGrotesk_600SemiBold' } as const;

export type Scheme = 'light' | 'dark';
export type SkyKey = 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk';

/** The pane's opacity per sky: the lowest that keeps ink, ink2, ink3 and the accent at 4.5:1 over that sky. */
export const PANE_ALPHA: Record<Scheme, Record<SkyKey, number>> = {
  light: { dawn: 0.78, morning: 0.76, noon: 0.7, afternoon: 0.62, dusk: 0.82, night: 0.84 },
  dark: { dawn: 0.58, morning: 0.52, noon: 0.46, afternoon: 0.46, dusk: 0.46, night: 0.42 },
};
/** The accent by sky (D1): rose at dawn, blues through the day, violet at dusk, a soft periwinkle at night. */
export const DAY_ACCENT: Record<Scheme, Record<SkyKey, string>> = {
  light: { dawn: '#B24A5E', morning: '#2F6DB5', noon: '#2563A8', afternoon: '#3D62A0', dusk: '#8E4FA8', night: '#2F5596' },
  dark: { dawn: '#F0A0B0', morning: '#9CC2F0', noon: '#9AC0F0', afternoon: '#A8BDE6', dusk: '#D2A8E6', night: '#8FA9E8' },
};
/** Each sky's top colour (the first pixel of the baked image), for tinting the deck toward it. */
export const SKY_TOP: Record<Scheme, Record<SkyKey, string>> = {
  light: { dawn: '#E9A994', morning: '#8DBDEB', noon: '#74AEE6', afternoon: '#9EC0E6', dusk: '#8D7DC4', night: '#4F6699' },
  dark: { dawn: '#1A1F3D', morning: '#112039', noon: '#10213A', afternoon: '#172137', dusk: '#181530', night: '#060A17' },
};
export const NOW: Record<Scheme, string> = { light: '#E8961E', dark: '#F4B04A' };
export const DAY_INK: Record<Scheme, { ink: string; ink2: string; ink3: string }> = {
  light: { ink: '#1A1E24', ink2: '#48505B', ink3: '#5F6773' },
  dark: { ink: '#ECEEF1', ink2: '#B5BBC4', ink3: '#9A9CA6' },
};

const a2 = (alpha: number) => Math.round(alpha * 255).toString(16).padStart(2, '0').toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1, 7), 16), pb = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`.toUpperCase();
};

/** Hanken Grotesk for every role; no italic anywhere. Sizes are the spec's table, scaled like Plain's (`k`). */
const H = (fam: string, k: number, extra: Partial<Face> = {}): Face => ({ fam, k, track: 0, ...extra });
export const DAY_FACES = {
  display: H(HK.s, 0.9, { track: -0.3 }), title: H(HK.s, 0.88), body: H(HK.r, 0.88),
  label: H(HK.m, 0.88), num: H(HK.m, 0.9, { tnum: true }), voice: H(HK.r, 0.9),
};

export function daylightSkin(scheme: Scheme, sky: SkyKey): Skin {
  const dark = scheme === 'dark', alpha = PANE_ALPHA[scheme][sky], ink = DAY_INK[scheme];
  const pane = dark ? '#10141B' : '#FFFFFF';
  return {
    id: 'daylight',
    ground: { kind: 'sky', ruling: 'none', margin: false, grain: false },
    surface: {
      edge: 'glass', radius: 20, fill: `${pane}${a2(alpha)}`, fillStrong: dark ? '#14181FF0' : '#FFFFFFF0',
      ring: dark ? '#FFFFFF0F' : '#11182114', rim: dark ? '#FFFFFF38' : '#FFFFFFB3',
      lift: null, scrim: dark ? '#00000080' : '#0A101C61',
    },
    type: DAY_FACES,
    ink: {
      ...ink, accent: DAY_ACCENT[scheme][sky], onAccent: dark ? '#0E1116' : '#FFFFFF', now: NOW[scheme],
      /* the deck is dark glass in light mode (tinted a quarter toward the sky's top), and pale glass in dark mode —
         never the inverted pale slab it was */
      deck: dark ? '#FFFFFF1A' : `${mix('#0C1424', SKY_TOP.light[sky], 0.25)}B8`,
      deckInk: dark ? '#ECEEF1' : '#F4F7FB', deckMut: dark ? '#B5BBC4' : '#C3CBD7', deckRim: dark ? '#FFFFFF38' : null,
      ok: dark ? '#5CC48A' : '#287A4E', warn: dark ? '#E0A64A' : '#8A5A12', bad: dark ? '#F2768A' : '#B8304A',
    },
    instruments: { clock: 'ring', bar: 'capsule', check: 'round', tag: 'capsule', field: 'box', addTile: 'pane', mascot: false, tape: false, subjectMark: 'dot', overdue: 'bar', hatch: false },
    motion: { pressMs: 120, pressScale: 0.97, sheet: 'glass' },
  };
}
