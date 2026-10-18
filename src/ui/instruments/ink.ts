/**
 * TWO INKS, and the one rule that decides where the accent is allowed.
 *
 * The reference paints every instrument in a bay's grey and a bay's white and spends no accent at
 * all — the accent there is on the scrub and the transport key, outside the art. The app draws the
 * bar on the command-deck slab, and `pal.acc` cannot actually be read on that slab in three of the
 * four palette/theme combinations (measured: 1.86:1 … 2.92:1 against a 3:1 floor for a non-text
 * graphic). So the accent is GATED: if it clears 3:1 on the slab the moving part takes it, and if it
 * does not the moving part takes full ink instead. That is not a fallback for looks — it is the
 * difference between an accent and an invisible one.
 *
 * What is never allowed: accent on the resting draw, on a label, on a housing, or anywhere but the
 * mover. `ink.test`-grade assertions live in `bars.test.ts`.
 */
import type { Ink } from './types';

/** Which of the two inks (or the signal tone) a shape is drawn in. */
export const resolveInk = (ink: Ink, k: Inks) => (ink === 'rest' ? k.rest : ink === 'live' ? k.live : k.signal);

export interface Inks { rest: string; live: string; signal: string; /** was the accent legible on this slab? */ accOk: boolean }

const chan = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
const rgb = (hex: string): [number, number, number] => {
  const ch = hex.slice(1, 7);
  return [0, 2, 4].map((i) => chan(ch, i)) as [number, number, number];
};
/** An eight-digit ink, `#RRGGBBAA` — what the resting draw is. */
export const isTranslucent = (hex: string) => hex.length >= 9;

/** WCAG relative luminance, sRGB. */
export const lum = (hex: string) => {
  const [r, g, b] = rgb(hex);
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r / 255) + 0.7152 * f(g / 255) + 0.0722 * f(b / 255);
};

/**
 * Contrast of `fg` against `bg`. A translucent `fg` is COMPOSITED over `bg` first — otherwise a
 * 34%-alpha resting draw measures as if it were the full ink and every gate on it is a fiction.
 */
export const contrast = (fg: string, bg: string) => {
  let a = fg;
  if (isTranslucent(fg)) {
    const al = chan(fg.slice(7, 9), 0) / 255, f = rgb(fg), b = rgb(bg);
    a = `#${[0, 1, 2].map((k) => Math.round(f[k]! * al + b[k]! * (1 - al)).toString(16).padStart(2, '0')).join('')}`;
  }
  const x = lum(a), y = lum(bg);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** The floor for a graphic that carries information and is not text. */
export const GRAPHIC_FLOOR = 3;

/** `#RRGGBB` + alpha, the app's own mixing move (`hexA` in tokens/theme). */
export const alpha = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

/**
 * @param live  the full-ink colour, `slabInk`
 * @param slab  the surface the instrument is drawn on, `slab`
 * @param acc   the accent, gated on contrast
 * @param late  the last-five-minutes tone, gated the same way (falls back to the accent)
 */
export function twoInks(live: string, slab: string, acc: string, late: string): Inks {
  const accOk = contrast(acc, slab) >= GRAPHIC_FLOOR;
  const lateOk = contrast(late, slab) >= GRAPHIC_FLOOR;
  return { rest: alpha(live, 0.34), live, signal: lateOk ? late : accOk ? acc : live, accOk };
}