/**
 * What the four paper skins share (v0.7.7.6, SPEC §1 B): the faces, inks and instruments they had before the skin
 * object existed, so moving onto it changes nothing on screen. Each skin file states only where it differs.
 */
import type { Face, Skin, SkinId, SkinInks } from './types';

const F = (fam: string, k: number, track = 0, extra: Partial<Face> = {}): Face => ({ fam, k, track, ...extra });
export const HAND = { body: F('Caveat_500Medium', 1), bold: F('Caveat_700Bold', 1), voice: F('Newsreader_400Regular_Italic', 1), mono: F('DMMono_500Medium', 0.82, -0.2), marker: F('PermanentMarker_400Regular', 1) };

export function paperSkin(id: SkinId, k: SkinInks, over: { ground?: Partial<Skin['ground']>; surface?: Partial<Skin['surface']>; type?: Partial<Skin['type']>; instruments?: Partial<Skin['instruments']> } = {}): Skin {
  return {
    id,
    ground: { kind: 'paper', ruling: 'lines', margin: true, grain: true, ...over.ground },
    surface: { edge: 'hand', radius: 14, fill: k.card, fillStrong: k.paper, ring: k.ink, rim: null, lift: { y: 2.8, blur: 0, alpha: 0.16 }, scrim: `${k.shadow.slice(0, 7)}6B`, ...over.surface },
    type: { display: HAND.marker, title: HAND.bold, body: HAND.body, label: HAND.bold, num: HAND.mono, voice: HAND.voice, ...over.type },
    ink: { ink: k.ink, ink2: k.mut, ink3: k.mut, accent: k.acc, onAccent: k.onAcc, now: k.acc, deck: k.deck, deckInk: k.deckInk, deckMut: k.deckMut, deckRim: null, ok: k.ok, warn: k.warn, bad: k.bad },
    instruments: { clock: 'paper', bar: 'hatch', check: 'dashed', tag: 'sticker', field: 'hand', addTile: 'note', mascot: true, tape: true, subjectMark: 'tab', overdue: 'outline', hatch: true, ...over.instruments },
    motion: { pressMs: 120, pressScale: 0.97, sheet: 'paper' },
  };
}
