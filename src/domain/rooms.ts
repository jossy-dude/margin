import type { Course, Meeting, SubjectVariant } from './types';

/** The separators a person actually typed between two rooms in the one `room` field v0.1–v0.3 had
 *  ("LR-601, LR-303", "B12 / B14", "A1; A2", "Lab 2 · Lab 3"). A hyphen is NOT one: "LR-601" is a room. */
const SEP = /\s*[,/;·]\s*/;

/** One free-text room string as a clean list: split, trimmed, empties dropped, duplicates (ignoring
 *  case) dropped with the first spelling kept. Pure, so migration 5's backfill and every import reader
 *  split the same way. */
export function splitRooms(raw: unknown): string[] {
  if (Array.isArray(raw)) return dedupe(raw.map((x) => String(x ?? '').trim()));
  if (typeof raw !== 'string') return [];
  return dedupe(raw.split(SEP).map((x) => x.trim()));
}
function dedupe(xs: string[]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const x of xs) { const k = x.toLocaleLowerCase(); if (x && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

/** Where one class happens: the room the meeting picked, else its variant's room, else the subject's first. */
export function roomOf(m: Pick<Meeting, 'room' | 'variantId'> | null | undefined, c: Pick<Course, 'rooms'> | null | undefined, variants: readonly SubjectVariant[] = []): string {
  const own = m?.room?.trim();
  if (own) return own;
  const v = m?.variantId ? variants.find((x) => x.id === m.variantId) : undefined;
  return v?.room.trim() || c?.rooms[0]?.trim() || '';
}

/** A subject's rooms as one line for a card, a CSV cell or a notification ("LR-601 · LR-303"). */
export const roomsLabel = (c: Pick<Course, 'rooms'> | null | undefined) => (c?.rooms ?? []).join(' · ');
