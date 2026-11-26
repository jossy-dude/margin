/** Collage (v0.7.7.6): torn coloured paper with a white core, a grotesque for what is read, a mono for figures. */
import { paperSkin } from './paperBase';
import type { Skin, SkinInks } from './types';

export const collageSkin = (k: SkinInks): Skin => paperSkin('collage', k, {
  surface: { edge: 'torn', lift: { y: 3.6, blur: 0, alpha: 0.09 } },
  type: {
    display: { fam: 'Fraunces_900Black', k: 0.9, track: -0.4 }, title: { fam: 'BricolageGrotesque_600SemiBold', k: 0.84, track: -0.1 },
    body: { fam: 'BricolageGrotesque_400Regular', k: 0.84, track: 0 }, label: { fam: 'BricolageGrotesque_600SemiBold', k: 0.84, track: -0.1 },
    num: { fam: 'SpecialElite_400Regular', k: 0.9, track: 0 },
  },
});
