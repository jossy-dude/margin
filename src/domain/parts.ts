import type { ComponentKind, SubjectVariant } from './types';
import type { SlotDraft } from './schedule';

/**
 * v0.71: a subject's parts (the lecture, a lab, a tutorial…) as the subject sheet edits them. A lab often has
 * its own teacher, its own room and its own group number, counts for a share of the grade (DB: lab 30 %) and
 * keeps its own attendance (it already does: the attendance key carries the variant id). The data has held all
 * of this since migration 7 (`SubjectVariant.teacher/room/note/weight/attGoal`); this is the editor's half.
 *
 * Keyed by the row kind in lower case, `''` being the lecture (the subject's own classes, the base part).
 */
export interface PartDraft { teacher: string; room: string; group: string; share: number | null; attGoal: number | null }
export const blankPart = (): PartDraft => ({ teacher: '', room: '', group: '', share: null, attGoal: null });
const key = (kind: string) => kind.trim().toLocaleLowerCase();
export const baseIdOf = (courseId: string) => `${courseId}~base`;

/** The distinct kinds the schedule rows use, the lecture first. */
export function kindsIn(rows: readonly SlotDraft[]): string[] {
  const out: string[] = [];
  for (const r of rows) { const k = r.kind.trim(); if (!out.some((x) => key(x) === key(k))) out.push(k); }
  return out.sort((a, b) => (a ? 1 : 0) - (b ? 1 : 0));
}
/** True when the subject has more than its lecture, so it is worth showing the parts. */
export const hasParts = (rows: readonly SlotDraft[]) => rows.some((r) => r.kind.trim() !== '');

/** The drafts a sheet opens with, from the subject's stored parts. */
export function partDraftsOf(courseId: string, variants: readonly SubjectVariant[]): Record<string, PartDraft> {
  const out: Record<string, PartDraft> = {};
  for (const v of variants.filter((x) => x.subjectId === courseId)) {
    out[v.isBase ? '' : key(v.name)] = { teacher: v.isBase ? '' : v.teacher, room: v.isBase ? '' : v.room, group: v.note, share: v.weight ?? null, attGoal: v.attGoal ?? null };
  }
  return out;
}

const kindOf = (name: string): ComponentKind => {
  const n = name.toLocaleLowerCase();
  return n.includes('lab') ? 'lab' : n.includes('tut') ? 'tutorial' : n.includes('pract') ? 'practical' : n.includes('semin') ? 'seminar' : 'other';
};

/**
 * The parts to write for a subject: the base part (made when the subject first gets a lab, so the lecture can
 * carry a share and a goal of its own) and each kind's part with the sheet's teacher, room, group, share and
 * goal folded in. `own` is what is stored, `made` what `planSchedule` just minted for new kinds. The lecture's
 * teacher and room are the subject's own (top of the sheet), so the base copies them.
 */
export function planParts(courseId: string, kinds: readonly string[], drafts: Readonly<Record<string, PartDraft>>, own: readonly SubjectVariant[], made: readonly SubjectVariant[], subject: { teacher: string; rooms: readonly string[] }): SubjectVariant[] {
  if (!kinds.some((k) => k.trim())) return [...made];
  const mine = own.filter((v) => v.subjectId === courseId), pool = [...mine, ...made];
  const out: SubjectVariant[] = [];
  for (const k of kinds.some((x) => !x.trim()) ? kinds : ['', ...kinds]) {
    const d = drafts[key(k)] ?? blankPart();
    const clean = (n: number | null) => (n !== null && n > 0 ? Math.min(100, n) : null);
    if (!k.trim()) {
      const base: SubjectVariant = mine.find((v) => v.isBase) ?? { id: baseIdOf(courseId), subjectId: courseId, name: 'Lecture', room: '', teacher: '', note: '', ord: -1, kind: 'lecture', isBase: true, scale: 100 };
      out.push({ ...base, teacher: subject.teacher.trim(), room: subject.rooms[0] ?? '', note: d.group.trim(), weight: clean(d.share), attGoal: clean(d.attGoal) });
      continue;
    }
    const v = pool.find((x) => !x.isBase && key(x.name) === key(k));
    if (!v) continue;
    out.push({ ...v, kind: v.kind ?? kindOf(v.name), teacher: d.teacher.trim(), room: d.room.trim(), note: d.group.trim(), weight: clean(d.share), attGoal: clean(d.attGoal) });
  }
  for (const m of made) if (!out.some((v) => v.id === m.id)) out.push(m);
  return out;
}

/** A part with its own room puts its classes there: the row's room is cleared, so `roomOf` falls to the part's. */
export function roomsForParts(rows: readonly SlotDraft[], drafts: Readonly<Record<string, PartDraft>>): SlotDraft[] {
  return rows.map((r) => { const k = key(r.kind); return k && drafts[k]?.room.trim() ? { ...r, room: '' } : r; });
}

/** "Lecture 70 % · Lab 30 %", or a nudge when the shares are set but do not add up to 100. */
export function sharesNote(kinds: readonly string[], drafts: Readonly<Record<string, PartDraft>>): string {
  const set = kinds.map((k) => ({ k: k || 'Lecture', s: drafts[key(k)]?.share ?? null }));
  if (!set.some((x) => x.s)) return 'No shares: every mark counts the same, as before.';
  const sum = set.reduce((a, x) => a + (x.s ?? 0), 0);
  const line = set.map((x) => `${x.k} ${x.s ?? 0} %`).join(' · ');
  return sum === 100 ? line : `${line} — adds up to ${sum} %, they are scaled to 100.`;
}
