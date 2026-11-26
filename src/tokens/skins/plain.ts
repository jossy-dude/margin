/**
 * Plain (v0.7.7.6): smooth stock. No ruling and no red margin line (B1: it still drew both unless a separate paper
 * setting said "plain"), no grain, no tape, a rounded hairline card, one grotesque for every role.
 */
import { paperSkin } from './paperBase';
import type { Skin, SkinInks } from './types';

export const plainSkin = (k: SkinInks): Skin => paperSkin('plain', k, {
  ground: { kind: 'flat', ruling: 'none', margin: false, grain: false },
  surface: { edge: 'hairline', radius: 14, ring: `${k.ink.slice(0, 7)}17`, lift: { y: 6, blur: 16, alpha: 0.07 } },
  type: {
    display: { fam: 'Syne_800ExtraBold', k: 0.8, track: -0.6 }, title: { fam: 'HankenGrotesk_600SemiBold', k: 0.88, track: -0.1 },
    body: { fam: 'HankenGrotesk_400Regular', k: 0.88, track: 0 }, label: { fam: 'HankenGrotesk_500Medium', k: 0.9, track: 0 },
    num: { fam: 'HankenGrotesk_600SemiBold', k: 0.9, track: 0, tnum: true }, voice: { fam: 'HankenGrotesk_400Regular', k: 0.9, track: 0 },
  },
  instruments: { tape: false, subjectMark: 'dot', hatch: false },
});
