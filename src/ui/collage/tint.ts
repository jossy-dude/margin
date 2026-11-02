import type { Tints } from '../../tokens/theme';
import { hashSeed } from '../hand';

/** The pale papers a subject can be cut from, in the order they are dealt. Text sits on every one of them
 *  at ink and `mut` strength (measured ≥ 4.65:1, tokens/theme `TINTS`). */
const PALE: (keyof Tints)[] = ['sky', 'sage', 'sand', 'blush', 'cream'];

/** A subject's paper colour: stable per subject id, so a subject is the same colour everywhere it appears. */
export const subjectTint = (id: string, tints: Tints): string => tints[PALE[hashSeed(id) % PALE.length]!];
