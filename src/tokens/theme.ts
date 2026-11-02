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
  /* Dark card stock (v0.5 U2). The page keeps the luminance the owner approved when "too dark" was
     fixed (`paper` was lifted then, and stays). What changes is the card: it used to be DARKER than the
     page (#353029 on #3C352C), so every card read as a hole cut in the paper. Real card stock laid on a
     dark desk under a lamp is a shade lighter than the sheet under it, so `card` now sits above `paper`
     (1.13:1, enough to read as a layer, not a slab). Two inks were re-measured on the lighter card and
     nudged up to stay over 4.5:1: `bad` (#F08C7A → #F4998A, 4.99:1) and the sienna `acc` (#E0A47A →
     #E3AA82, 5.28:1). `desk`, `slab` and the deck are untouched — their pairs did not move. */
  dark: { paper: '#3C352C', card: '#433D35', desk: '#1F1B16', ink: '#F2EAD8', mut: '#BCB19C', acc: '#E3AA82', hl: '#4A3F22', rule: '#F2EAD83D', dot: '#F2EAD81F', shadow: '#000000', ok: '#8FC49A', warn: '#E3B04B', bad: '#F4998A', slab: '#1F1B16', slabInk: '#F2EAD8', slabMut: '#C9BEA8', deck: '#F2EAD8', deckInk: '#2B2620', deckMut: '#665B4B', grain: 0.4, photo: 0.18, onAcc: '#2B2620' },
};
/**
 * Collage (v0.5 look 2, now the default). The app as a desk of cut and torn paper rather than one ruled
 * notebook: an off-white recycled sheet for the page, bright card for what sits on it, charcoal ink, and a
 * denim-blue paper for the one card that matters most (the command deck). The coloured papers that
 * subjects, notes and the "+" desk are cut from live in `TINTS`.
 *
 * Dark is black construction paper, not a dimmed cream: the page is a cool charcoal sheet and the cards are
 * a grey stock one shade lighter, so a card still reads as a layer laid on top. The deck stays denim, deeper.
 * Measured (scratch `contrast.mjs`, pinned in ui.test.ts): ink 13.5 / 11.7–14.7:1, mut 5.6–6.6:1,
 * acc 5.5–8.1:1, deckInk 5.9–7.2:1, deckMut 4.9–5.6:1, and every status ink over 5:1 on card.
 */
const COLLAGE: Record<'light' | 'dark', Colors> = {
  light: { paper: '#F3EFE7', card: '#FBF9F4', desk: '#E2DBCE', ink: '#232428', mut: '#625E57', acc: '#35619A', hl: '#F1D98C', rule: '#23242826', dot: '#2324281C', shadow: '#1E1A14', ok: '#4A6A43', warn: '#8E5F10', bad: '#AE3B28', slab: '#232428', slabInk: '#F3EFE7', slabMut: '#CFC9BD', deck: '#36608F', deckInk: '#F7F3EA', deckMut: '#D5E0EC', grain: 0.32, photo: 0.18, onAcc: '#FBF9F4' },
  dark: { paper: '#1E2125', card: '#282C31', desk: '#121417', ink: '#EEEAE2', mut: '#AAA59B', acc: '#9BBBE0', hl: '#4A4128', rule: '#EEEAE233', dot: '#EEEAE21A', shadow: '#000000', ok: '#9CC48F', warn: '#E6B95A', bad: '#F09A86', slab: '#121417', slabInk: '#EEEAE2', slabMut: '#B9B4AA', deck: '#2F5079', deckInk: '#F3EFE7', deckMut: '#C9D6E6', grain: 0.4, photo: 0.18, onAcc: '#1E2125' },
};
/** The coloured papers of the collage, per theme. Light ones are pale stock (text sits on them at ink and
 *  `mut` strength: mut ≥ 4.65:1 on every one); `mustard`, `denim`, `moss` and `tomato` are the saturated
 *  papers used for shapes and art, never under body text. */
export interface Tints { sky: string; sage: string; sand: string; cream: string; blush: string; mustard: string; denim: string; moss: string; tomato: string; kraft: string }
export const TINTS: Record<'light' | 'dark', Tints> = {
  light: { sky: '#D3E0EC', sage: '#D5DECB', sand: '#EEE2CC', cream: '#F5EEDF', blush: '#F2D3C7', mustard: '#E1B03C', denim: '#4C79AE', moss: '#58714D', tomato: '#D7553B', kraft: '#C49B6D' },
  dark: { sky: '#2C3A49', sage: '#2E3830', sand: '#3B3429', cream: '#34312B', blush: '#46302B', mustard: '#B88F2E', denim: '#3F6896', moss: '#4F6845', tomato: '#B5503A', kraft: '#7E6447' },
};
const ORIGINAL: Record<'light' | 'dark', Colors> = {
  light: { paper: '#FAF5EB', card: '#FEFBF5', desk: '#C0B9B2', ink: '#26201C', mut: '#57514C', acc: '#67696B', hl: '#E4DECD', rule: '#26201C33', dot: '#26201C26', shadow: '#26201C', ok: '#4B6B52', warn: '#8A5A12', bad: '#8F3A2C', slab: '#26201C', slabInk: '#FAF5EB', slabMut: '#C9C3BA', deck: '#26201C', deckInk: '#FAF5EB', deckMut: '#C9C3BA', grain: 0.6, photo: 0.3, onAcc: '#FEFBF5' },
  dark: { paper: '#10141A', card: '#1C1F26', desk: '#030407', ink: '#E7E4DC', mut: '#A8A49D', acc: '#A6A9AC', hl: '#3D434C', rule: '#E7E4DC3D', dot: '#E7E4DC1F', shadow: '#000000', ok: '#8FBF9A', warn: '#D9A94A', bad: '#E58A78', slab: '#E7E4DC', slabInk: '#10141A', slabMut: '#3D434C', deck: '#E7E4DC', deckInk: '#10141A', deckMut: '#57514C', grain: 0.5, photo: 0.25, onAcc: '#10141A' },
};
/**
 * The four pens are inks, not palettes (v0.5 U2). A pen used to borrow its palette's accent, so in the
 * Original palette "Warm sienna" was the same grey as "Graphite" — two names, one ink. Now each pen is
 * one ink with a measured pair per theme, whatever paper it writes on: a brown fountain-pen sienna, a
 * pencil graphite with its faint blue sheen, a red ink, a blue ballpoint. Every value clears 4.5:1 on
 * paper and card, and under `onAcc` as a filled button, in both palettes and both themes (ui.test.ts).
 */
export const PENS: Record<Settings['pen'], { light: string; dark: string }> = {
  /* The collage's own ink: the denim of its paper, deep enough to write with (5.5:1 on paper). */
  denim: { light: '#35619A', dark: '#9BBBE0' },
  warm: { light: '#8A4B27', dark: '#E3AA82' },
  graphite: { light: '#55585D', dark: '#B9BDC2' },
  red: { light: '#A3291F', dark: '#F4998A' },
  blue: { light: '#24448A', dark: '#9DB9E3' },
};
/** The red margin rule of a ruled exercise book: the same in every palette and with every pen, because
 *  it is printed on the paper, not written on it. */
export const MARGIN = { light: '#C0392B', dark: '#E0705F' } as const;
export const palettes = { collage: COLLAGE, refined: REFINED, original: ORIGINAL };

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
/** Paper constants of the collage, theme-independent because they are materials: the white core that
 *  shows along a tear (bleached pulp is white whatever the dye), and the ink and hint of a cream scrap that
 *  is cream in both themes (the onboarding's ruled strip), so its writing must not follow the theme. */
export const PAPER = { core: '#FFFFFF', scrapInk: '#232428', scrapHint: '#8A847A' } as const;
export const TAPE = {
  light: { fill: '#E7D9AE99', edge: '#B8A56E55', shadow: '#2A241C1A', shine: '#FFFFFF59' },
  dark: { fill: '#C9B98F55', edge: '#C9B98F66', shadow: '#00000052', shine: '#FFFFFF1F' },
} as const;

export const FONT = { hand: 'Caveat_500Medium', handBold: 'Caveat_700Bold', serif: 'Newsreader_400Regular_Italic', serifB: 'Newsreader_600SemiBold_Italic', marker: 'PermanentMarker_400Regular', type: 'SpecialElite_400Regular',
  sans: 'BricolageGrotesque_400Regular', sansMid: 'BricolageGrotesque_600SemiBold', sansBlack: 'BricolageGrotesque_800ExtraBold', mono: 'DMMono_500Medium' } as const;

/**
 * What each text role is set in, per look. A role (`hand`, `bold`, `marker`…) is what a screen asks for;
 * the look decides the face. The ink looks keep the notebook hand they always had. The collage sets its
 * words like the cut-paper references do: a characterful grotesque for everything read (Bricolage), a mono
 * for figures (DM Mono), the italic serif for asides, and Caveat kept only where something should look
 * genuinely handwritten (`script`).
 *
 * `k` scales the size a screen asks for. Every size in the app was tuned for Caveat, whose x-height is small;
 * Bricolage at the same number reads a size and a half larger. The LINE HEIGHT stays computed from the
 * requested size (see `Txt`), so a re-faced line keeps the exact box it had and no layout moves.
 */
export type FontKey = 'hand' | 'bold' | 'serif' | 'serifB' | 'marker' | 'type' | 'script';
export interface Face { fam: string; k: number; track: number }
export type TypeMap = Record<FontKey, Face>;
const INK_TYPE: TypeMap = {
  hand: { fam: FONT.hand, k: 1, track: 0 }, bold: { fam: FONT.handBold, k: 1, track: 0 }, serif: { fam: FONT.serif, k: 1, track: 0 }, serifB: { fam: FONT.serifB, k: 1, track: 0 },
  marker: { fam: FONT.marker, k: 1, track: 0 }, type: { fam: FONT.type, k: 1, track: 0 }, script: { fam: FONT.hand, k: 1, track: 0 },
};
const COLLAGE_TYPE: TypeMap = {
  hand: { fam: FONT.sans, k: 0.84, track: 0 }, bold: { fam: FONT.sansMid, k: 0.84, track: -0.1 }, serif: { fam: FONT.serif, k: 1, track: 0 }, serifB: { fam: FONT.serifB, k: 1, track: 0 },
  marker: { fam: FONT.sansBlack, k: 0.88, track: -0.6 }, type: { fam: FONT.mono, k: 0.86, track: -0.2 }, script: { fam: FONT.hand, k: 1, track: 0 },
};
/** v10 hand-drawn radii (--rg, --r) as CSS-style elliptical corners */
export const RG = { h: [255, 14, 225, 14], v: [14, 225, 14, 255] } as const;
export const RS = { h: [30, 12, 26, 10], v: [10, 24, 12, 30] } as const;

/** `look` is how a surface is cut: `ink` = the notebook's hand-cut outline with a hard offset shadow,
 *  `collage` = torn coloured paper with a white core along the tear and a soft lift shadow. */
export type Look = 'ink' | 'collage';
export interface Theme { c: Colors; dark: boolean; font: typeof FONT; look: Look; type: TypeMap; tints: Tints }
export function makeTheme(s: Pick<Settings, 'theme' | 'palette' | 'pen'>, systemDark: boolean): Theme {
  const dark = s.theme === 'auto' ? systemDark : s.theme === 'dark', mode = dark ? 'dark' : 'light';
  const pal = palettes[s.palette] ? s.palette : 'collage', base = palettes[pal][mode];
  const acc = (PENS[s.pen] ?? PENS.denim)[mode], collage = pal === 'collage';
  return { c: { ...base, acc }, dark, font: FONT, look: collage ? 'collage' : 'ink', type: collage ? COLLAGE_TYPE : INK_TYPE, tints: TINTS[mode] };
}
export const hexA = (hex: string, a: number) => `${hex.slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
