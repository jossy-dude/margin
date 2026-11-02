import type { Meeting, SubjectVariant } from './types';
import { fromMin, hm } from './time';

/**
 * A subject's weekly schedule as the subject sheet edits it (owner: "when I create the subject, let me add its
 * schedule right there"). One row per weekly class: the day, start and end, the room, and which KIND of class it
 * is — the lecture (the subject itself), or a lab / tutorial / … (a variant, which owns its own attendance and
 * marks). Pure: the sheet holds rows, and `planSchedule` turns them into what to write.
 */
export interface SlotDraft { key: string; id: string | null; weekday: number; start: number; end: number; room: string; kind: string }

/** The kinds a row can be. '' is the subject's own class (no variant). */
export const SLOT_KINDS = ['', 'Lab', 'Tutorial', 'Practical'] as const;
export const kindLabel = (k: string) => (k ? k : 'Lecture');

export function draftsOf(courseId: string, meetings: readonly Meeting[], variants: readonly SubjectVariant[]): SlotDraft[] {
  return meetings.filter((m) => m.courseId === courseId)
    .sort((a, b) => a.weekday - b.weekday || hm(a.start) - hm(b.start))
    .map((m) => ({ key: m.id, id: m.id, weekday: m.weekday, start: hm(m.start), end: hm(m.end), room: m.room ?? '', kind: variants.find((v) => v.id === m.variantId)?.name ?? '' }));
}

/** A sensible next row: the first weekday not used yet, at the time of the last row (or 09:00), 50 minutes.
 *  `key` is minted by the caller when the row is ADDED and becomes the new class's id, so saving twice writes
 *  the same row twice rather than two rows. */
export function nextDraft(rows: readonly SlotDraft[], room: string, key: string): SlotDraft {
  const used = new Set(rows.map((r) => r.weekday)), last = rows[rows.length - 1];
  const weekday = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.has(d)) ?? 0, start = last ? last.start : 9 * 60, end = last ? last.end : start + 50;
  return { key, id: null, weekday, start, end, room, kind: last?.kind ?? '' };
}

export interface SchedulePlan { meetings: Meeting[]; removed: string[]; variants: SubjectVariant[]; problems: string[] }

/**
 * What to write for a subject's rows: every row as a meeting (kept ids for rows that already existed), the
 * meetings that were removed, and the variants a new kind needs. Problems (a class that ends before it starts,
 * two rows that would share one attendance key) are reported and those rows are left out — never thrown.
 */
export function planSchedule(courseId: string, rows: readonly SlotDraft[], existing: readonly Meeting[], variants: readonly SubjectVariant[], vid: (kind: string) => string): SchedulePlan {
  const mine = existing.filter((m) => m.courseId === courseId), own = variants.filter((v) => v.subjectId === courseId);
  const made: SubjectVariant[] = [], problems: string[] = [], out: Meeting[] = [], seen = new Set<string>();
  const variantFor = (kind: string): string | null => {
    const k = kind.trim(); if (!k) return null;
    const hit = [...own, ...made].find((v) => v.name.toLocaleLowerCase() === k.toLocaleLowerCase());
    if (hit) return hit.id;
    const v: SubjectVariant = { id: vid(k), subjectId: courseId, name: k, room: '', teacher: '', note: '', ord: own.length + made.length };
    made.push(v); return v.id;
  };
  rows.forEach((r, i) => {
    const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][r.weekday] ?? '?';
    if (r.end <= r.start) { problems.push(`${day} row ${i + 1}: it has to end after it starts.`); return; }
    const variantId = variantFor(r.kind), sig = `${r.weekday}|${r.start}|${variantId ?? ''}`;
    if (seen.has(sig)) { problems.push(`${day} ${fromMin(r.start)}: that ${kindLabel(r.kind).toLowerCase()} is already listed.`); return; }
    seen.add(sig);
    out.push({ id: r.id ?? r.key, courseId, weekday: r.weekday, start: fromMin(r.start), end: fromMin(r.end), room: r.room.trim() || null, variantId, demo: false });
  });
  const keep = new Set(out.map((m) => m.id));
  return { meetings: out, removed: mine.filter((m) => !keep.has(m.id)).map((m) => m.id), variants: made, problems };
}
