import type { Settings } from '../domain/types';

/** Single source of colour truth. `refined` = the cream/warm pass; `original` = v10's oklch tokens converted to sRGB. */
export interface Colors {
  paper: string; card: string; desk: string; ink: string; mut: string; acc: string; hl: string; rule: string; dot: string; shadow: string;
  ok: string; warn: string; bad: string; slab: string; slabInk: string; slabMut: string; grain: number; photo: number; onAcc: string;
  /**
   * The command deck's own surface. `slab` is the ink bed Focus's dial and the bar picker's chips sit on;
   * this is the one card that INVERTS against the page — `marginalia-v10(1).html`'s `.dk` re-points
   * `--card` and `--ink` at each other, so the deck is the theme's INK in light and its PAPER-bright in
   * dark, and the card is always the highest-contrast object on the page. In light these repeat
   * `slab`/`slabInk` exactly, so the light card does not move; only dark does, from a surface 1.14:1
   * against the page (invisible) to 12.52:1. Measured: deckInk 12.5–14.8:1, deckMut 5.5–9.8:1.
   */
  deck: string; deckInk: string; deckMut: string;
}
const REFINED: Record<'light' | 'dark', Colors> = {
  light: { paper: '#FAF4E6', card: '#FFFBF1', desk: '#E9DFC9', ink: '#2A241C', mut: '#665B4B', acc: '#8A4B27', hl: '#F3E3A8', rule: '#2A241C33', dot: '#2A241C26', shadow: '#2A241C', ok: '#3F6B4A', warn: '#8F5A00', bad: '#9C3322', slab: '#2F2920', slabInk: '#FAF4E6', slabMut: '#D9CDB4', deck: '#2A241C', deckInk: '#FAF4E6', deckMut: '#D9CDB4', grain: 0.5, photo: 0.22, onAcc: '#FFFBF1' },
  /* Only `paper` moves. `card`, `desk`, `slab` and the deck's inks are contrast-tuned against their
     *  own pairs (ui.test.ts pins every pair at 4.5:1) and lifting them with the background silently
     *  breaks pairs that were passing — measured: deckMut on deck fell to 3.3:1, bad on card to 4.4:1.
     *  The page reads as "too dark" because of the paper, so the paper is the only token that lifts. */
  dark: { paper: '#3C352C', card: '#353029', desk: '#1F1B16', ink: '#F2EAD8', mut: '#BCB19C', acc: '#E0A47A', hl: '#4A3F22', rule: '#F2EAD83D', dot: '#F2EAD81F', shadow: '#000000', ok: '#8FC49A', warn: '#E3B04B', bad: '#F08C7A', slab: '#1F1B16', slabInk: '#F2EAD8', slabMut: '#C9BEA8', deck: '#F2EAD8', deckInk: '#2B2620', deckMut: '#665B4B', grain: 0.4, photo: 0.18, onAcc: '#2B2620' },
};
const ORIGINAL: Record<'light' | 'dark', Colors> = {
  light: { paper: '#FAF5EB', card: '#FEFBF5', desk: '#C0B9B2', ink: '#26201C', mut: '#57514C', acc: '#67696B', hl: '#E4DECD', rule: '#26201C33', dot: '#26201C26', shadow: '#26201C', ok: '#4B6B52', warn: '#8A5A12', bad: '#8F3A2C', slab: '#26201C', slabInk: '#FAF5EB', slabMut: '#C9C3BA', deck: '#26201C', deckInk: '#FAF5EB', deckMut: '#C9C3BA', grain: 0.6, photo: 0.3, onAcc: '#FEFBF5' },
  dark: { paper: '#10141A', card: '#1C1F26', desk: '#030407', ink: '#E7E4DC', mut: '#A8A49D', acc: '#A6A9AC', hl: '#3D434C', rule: '#E7E4DC3D', dot: '#E7E4DC1F', shadow: '#000000', ok: '#8FBF9A', warn: '#D9A94A', bad: '#E58A78', slab: '#E7E4DC', slabInk: '#10141A', slabMut: '#3D434C', deck: '#E7E4DC', deckInk: '#10141A', deckMut: '#57514C', grain: 0.5, photo: 0.25, onAcc: '#10141A' },
};
export const PENS: Record<Exclude<Settings['pen'], 'warm' | 'graphite'>, { light: string; dark: string }> = {
  red: { light: '#9C3322', dark: '#F08C7A' }, blue: { light: '#2F4F7A', dark: '#9DB9E3' },
};
export const palettes = { refined: REFINED, original: ORIGINAL };

/** Art constants that are deliberately theme-independent, so they are tokens rather than literals
 *  pasted into components. `ONYX.dark` is the dial material of the dark-native clock faces: they keep it in the
 *  dark theme, where the theme's cream ink reads off it, and turn to `card` in the light theme (see `dialPal`) —
 *  a cream dial with cream hands would be invisible, and an onyx dial would be a black hole in the cream app.
 *  It should not follow `palette: 'original'` — but it does not belong in a screen.
 *
 *  `ONYX.light` used to sit beside it, "the same material a shade down … for the plate work". It was read by
 *  nothing, and the plate work was abandoned: `assets/plates/` does not exist, `FACES` has five entries, and
 *  the `plates:gen` / `plates:preview` npm scripts were deleted with a test that keeps them deleted
 *  (`scripts.test.ts`). A token that only exists to serve a feature that does not is residue,
 *  so it is gone; if the plates ever come back the material comes back
 *  with them. See `STATE.md` deviation 10. */
export const ONYX = { dark: '#17130F' } as const;
/** Dial materials for the clock faces, alongside ONYX and for the same reason: a dial is a physical plate,
 *  not a themed surface, so the same plate must not change material when the app flips to dark. ENAMEL is
 *  true white porcelain and LACQUER is true black lacquer — the two extremes, because an engraved ground
 *  only reads as engraving when the ink is as far from it as it can get, and that is what stops a dial
 *  reading as haze. `refined.dark.card` is `#353029`, a brown-grey that belongs to no material and that
 *  made the ornament read as dust; a cream dial is likewise four steps off `paper`, so the dial stopped
 *  being an object. SECOND is the sweep hand and the Scales sub-seconds: it is red-brown, a
 *  lacquered-steel colour and not a theme accent — `refined.dark.acc` is `#E0A47A`,
 *  a pale peach that reads grey at hairline width. Contrast against their own grounds: 6.7:1 in light,
 *  5.2:1 in dark, both over the 3:1 a non-text accent needs. Like ONYX, none of these follow
 *  `palette: 'original'`: they are materials, not theme colours. */
export const DIAL = { light: '#FFFFFF', dark: '#000000' } as const;
export const SECOND = { light: '#8A4B27', dark: '#C0663A' } as const;
export const TAPE = {
  light: { fill: '#E7D9AE99', edge: '#B8A56E55' },
  dark: { fill: '#C9B98F55', edge: '#C9B98F66' },
} as const;

export const FONT = { hand: 'Caveat_500Medium', handBold: 'Caveat_700Bold', serif: 'Newsreader_400Regular_Italic', serifB: 'Newsreader_600SemiBold_Italic', marker: 'PermanentMarker_400Regular', type: 'SpecialElite_400Regular' } as const;
/** v10 hand-drawn radii (--rg, --r) as CSS-style elliptical corners */
export const RG = { h: [255, 14, 225, 14], v: [14, 225, 14, 255] } as const;
export const RS = { h: [30, 12, 26, 10], v: [10, 24, 12, 30] } as const;

export interface Theme { c: Colors; dark: boolean; font: typeof FONT }
export function makeTheme(s: Pick<Settings, 'theme' | 'palette' | 'pen'>, systemDark: boolean): Theme {
  const dark = s.theme === 'auto' ? systemDark : s.theme === 'dark', mode = dark ? 'dark' : 'light';
  const base = palettes[s.palette][mode];
  let acc = base.acc;
  if (s.pen === 'red' || s.pen === 'blue') acc = PENS[s.pen][mode];
  else if (s.pen === 'graphite') acc = palettes.original[mode].acc;
  return { c: { ...base, acc }, dark, font: FONT };
}
export const hexA = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
