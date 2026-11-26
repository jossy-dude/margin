/** Notebook, refined (v0.7.7.6): cream paper, the hand-cut edge, the pen accent. The default notebook. */
import { paperSkin } from './paperBase';
import type { Skin, SkinInks } from './types';

export const refinedSkin = (k: SkinInks): Skin => paperSkin('refined', k);
