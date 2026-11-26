/** Notebook, original (v0.7.7.6): v10's colours on the same hand-cut notebook as refined. */
import { paperSkin } from './paperBase';
import type { Skin, SkinInks } from './types';

export const originalSkin = (k: SkinInks): Skin => paperSkin('original', k);
