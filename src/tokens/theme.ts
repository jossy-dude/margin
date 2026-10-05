import type { Settings } from '../domain/types';

/** Single source of colour truth. `refined` = the cream/warm pass; `original` = v10's oklch tokens converted to sRGB. */
export interface Colors {
  paper: string; card: string; desk: string; ink: string; mut: string; acc: string; hl: string; rule: string; dot: string; shadow: string;
  ok: string; warn: string; bad: string; slab: string; slabInk: string; slabMut: string; grain: number; photo: number; onAcc: string;
}
const REFINED: Record<'light' | 'dark', Colors> = {
  light: { paper: '#FAF4E6', card: '#FFFBF1', desk: '#E9DFC9', ink: '#2A241C', mut: '#665B4B', acc: '#8A4B27', hl: '#F3E3A8', rule: '#2A241C33', dot: '#2A241C26', shadow: '#2A241C', ok: '#3F6B4A', warn: '#8F5A00', bad: '#9C3322', slab: '#2F2920', slabInk: '#FAF4E6', slabMut: '#D9CDB4', grain: 0.5, photo: 0.22, onAcc: '#FFFBF1' },
  dark: { paper: '#2B2620', card: '#353029', desk: '#1F1B16', ink: '#F2EAD8', mut: '#BCB19C', acc: '#E0A47A', hl: '#4A3F22', rule: '#F2EAD83D', dot: '#F2EAD81F', shadow: '#000000', ok: '#8FC49A', warn: '#E3B04B', bad: '#F08C7A', slab: '#1F1B16', slabInk: '#F2EAD8', slabMut: '#C9BEA8', grain: 0.4, photo: 0.18, onAcc: '#2B2620' },
};
const ORIGINAL: Record<'light' | 'dark', Colors> = {
  light: { paper: '#FAF5EB', card: '#FEFBF5', desk: '#C0B9B2', ink: '#26201C', mut: '#57514C', acc: '#67696B', hl: '#E4DECD', rule: '#26201C33', dot: '#26201C26', shadow: '#26201C', ok: '#4B6B52', warn: '#8A5A12', bad: '#8F3A2C', slab: '#26201C', slabInk: '#FAF5EB', slabMut: '#C9C3BA', grain: 0.6, photo: 0.3, onAcc: '#FEFBF5' },
  dark: { paper: '#10141A', card: '#1C1F26', desk: '#030407', ink: '#E7E4DC', mut: '#A8A49D', acc: '#A6A9AC', hl: '#3D434C', rule: '#E7E4DC3D', dot: '#E7E4DC1F', shadow: '#000000', ok: '#8FBF9A', warn: '#D9A94A', bad: '#E58A78', slab: '#E7E4DC', slabInk: '#10141A', slabMut: '#3D434C', grain: 0.5, photo: 0.25, onAcc: '#10141A' },
};
export const PENS: Record<Exclude<Settings['pen'], 'warm' | 'graphite'>, { light: string; dark: string }> = {
  red: { light: '#9C3322', dark: '#F08C7A' }, blue: { light: '#2F4F7A', dark: '#9DB9E3' },
};
export const palettes = { refined: REFINED, original: ORIGINAL };

/** Art constants that are deliberately theme-independent, so they are tokens rather than literals
 *  pasted into components. The onyx dial of the dark-native clock faces stays dark in both themes
 *  (a cream dial with cream hands would be invisible), and the washi tape is a material, not a
 *  palette entry. Neither should follow `palette: 'original'` — but neither belongs in a screen. */
export const ONYX = { light: '#26201A', dark: '#17130F' } as const;
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
