import type { Tints } from '../../tokens/theme';
import { hashSeed } from '../hand';
import { getState } from '../../store/core';

/** The pale papers a subject can be cut from, in the order they are dealt. Text sits on every one of them
 *  at ink and `mut` strength (measured ≥ 4.65:1, tokens/theme `TINTS`). */
export const PALE: (keyof Tints)[] = ['sky', 'sage', 'sand', 'blush', 'cream'];

/** A subject's paper colour: the one the owner chose on its Subject page (v0.8 §3.3, one of `PALE`), else stable per
 *  subject id, so a subject is the same colour everywhere it appears and in every skin. */
export const subjectTint = (id: string, tints: Tints): string => {
  const own = getState().courses.find((c) => c.id === id)?.color as keyof Tints | undefined;
  return tints[own && PALE.includes(own) ? own : PALE[hashSeed(id) % PALE.length]!];
};
