import { startOfDay } from '../../domain/time';
import type { Notice } from '../../domain/types';

/** The rules for pinned notes (no React, so they are testable on their own). */
export const NOTE_LEVEL = [
  { word: 'Note', icon: 'note' }, { word: 'Heads-up', icon: 'bell' }, { word: 'Important', icon: 'flag' }, { word: 'Urgent', icon: 'bell' },
] as const;

/** A note's date is shown only while it is still ahead: a past date is when it was pinned, not a deadline. */
export const noteDate = (n: Pick<Notice, 'dueAt'>, now: number) => (n.dueAt > startOfDay(now) && n.dueAt >= now - 60_000 ? n.dueAt : null);
/** Urgent first, then the soonest date, then the order they were pinned in. */
export const sortNotes = <T extends Pick<Notice, 'priority' | 'dueAt'>>(ns: T[], now: number): T[] =>
  ns.map((n, i) => ({ n, i })).sort((a, b) => b.n.priority - a.n.priority || (noteDate(a.n, now) ?? 9e15) - (noteDate(b.n, now) ?? 9e15) || a.i - b.i).map((x) => x.n);

