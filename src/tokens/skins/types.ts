/**
 * v0.7.7.5 (SPEC §1): a skin is one object, not a branch in each component. Every part a look can differ in —
 * its ground, its surfaces, its type, its inks and its instruments (the clock, the progress bar, the check box,
 * the tags, the Add tiles, the mascot) — is a field here, and a component asks the skin instead of asking
 * "am I Daylight?". Release A (0.7.7.5) builds Daylight on it; release B moves the paper skins over.
 */
/** `tnum`: tabular figures, so a ticking number never shifts its neighbours (the plain look's numerals).
 *  `slant`: the face leans right past its advance width; a right-aligned field gives it 3 dp more room. */
export interface Face { fam: string; k: number; track: number; tnum?: boolean; w?: '400' | '500' | '600' | '700'; slant?: boolean }

export type SkinId = 'collage' | 'refined' | 'original' | 'plain' | 'daylight';
export interface Skin {
  id: SkinId;
  ground: { kind: 'paper' | 'flat' | 'sky'; ruling: 'lines' | 'dots' | 'grid' | 'none'; margin: boolean; grain: boolean };
  surface: {
    edge: 'torn' | 'hand' | 'hairline' | 'glass'; radius: number; fill: string; fillStrong: string;
    ring: string; rim: string | null; lift: { y: number; blur: number; alpha: number } | null; scrim: string;
  };
  type: { display: Face; title: Face; body: Face; label: Face; num: Face; voice: Face };
  ink: {
    ink: string; ink2: string; ink3: string; accent: string; onAccent: string; now: string;
    deck: string; deckInk: string; deckMut: string; deckRim: string | null; ok: string; warn: string; bad: string;
  };
  instruments: {
    clock: 'paper' | 'ring'; bar: 'hatch' | 'capsule'; check: 'dashed' | 'round'; tag: 'sticker' | 'capsule';
    field: 'hand' | 'box'; addTile: 'note' | 'pane'; mascot: boolean;
  };
  motion: { pressMs: number; pressScale: number; sheet: 'paper' | 'glass' };
}
