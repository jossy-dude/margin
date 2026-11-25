import type { AttRecord, ComponentKind, Course, Meeting, SubjectVariant } from './types';
import type { SlotDraft } from './schedule';
import { emptyRows, type Change } from './variants';
import { occKey, parseOccKey } from './attendance';
import { weekdayOf } from './time';

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

/* ── v0.7.7.2 (SPEC §3): a subject's parts as Grades, Stats, Today and Week read them ──────────────────────── */

/** One part of a subject: the base "Lecture" (classes with no variant id) or one of its variants. */
export interface Part { id: string; name: string; kind: ComponentKind; isBase: boolean; goal: number; variant: SubjectVariant | null }

/**
 * The subject's parts, the lecture first: its explicit parts (variants) plus the base part for classes that
 * carry no variant id. A subject with no variants has exactly one part, the base. A subject whose variants
 * include no base row still gets a base part when some of its classes have no variant id ("a lab with no base row").
 */
export function partsOf(courseId: string, variants: readonly SubjectVariant[], meetings: readonly Pick<Meeting, 'courseId' | 'variantId'>[] = []): Part[] {
  const mine = variants.filter((v) => v.subjectId === courseId).sort((a, b) => a.ord - b.ord);
  const goalOf = (v: SubjectVariant | null) => (v?.attGoal && v.attGoal > 0 ? v.attGoal : 80);
  const baseRow = mine.find((v) => v.isBase) ?? null;
  const out: Part[] = [];
  const bareClasses = meetings.some((m) => m.courseId === courseId && !m.variantId);
  if (baseRow || bareClasses || mine.length === 0) {
    out.push({ id: baseRow?.id ?? baseIdOf(courseId), name: baseRow?.name || 'Lecture', kind: 'lecture', isBase: true, goal: goalOf(baseRow), variant: baseRow });
  }
  for (const v of mine) if (!v.isBase) out.push({ id: v.id, name: v.name, kind: v.kind ?? kindOf(v.name), isBase: false, goal: goalOf(v), variant: v });
  return out;
}
/** True when a class of the part's subject belongs to this part. */
export const inPart = (part: Pick<Part, 'id' | 'isBase'>, m: Pick<Meeting, 'variantId'>) => (part.isBase ? !m.variantId || m.variantId === part.id : m.variantId === part.id);
/** Where a part's teacher's count lives in `settings.teacherAbsent`: the lecture keeps the subject's own key, so
 *  every count typed before parts existed stays on the lecture; any other part is `courseId~variantId`. */
export const teacherKey = (courseId: string, part: Pick<Part, 'id' | 'isBase'>) => (part.isBase ? courseId : `${courseId}~${part.id}`);
/** The part a class belongs to, for a label ("DS · Lab"): null for the lecture of a subject that has no other part. */
export function partLabel(courseId: string, variantId: string | null | undefined, variants: readonly SubjectVariant[]): string | null {
  if (!variantId) return null;
  const v = variants.find((x) => x.id === variantId && x.subjectId === courseId);
  return v && !v.isBase ? v.name : null;
}

/** A room name that reads as a lab: "LAB301", "LB302", "Lab 2". */
export const LAB_ROOM = /^(LAB|LB)\s?\d/i;
/** The class's own room, else the subject's first. */
const roomOfMeeting = (course: Pick<Course, 'rooms'>, m: Pick<Meeting, 'room'>) => (m.room?.trim() || course.rooms[0] || '').trim();

/**
 * The "Split the lab classes" offer (D11): a subject with no parts whose classes sit, some of them, in a lab
 * room. Returns the lab rooms and the classes in them, or null when there is nothing to offer: the subject
 * already has parts, no class is in a lab room, or every class is (then there is no lecture to split from).
 */
export function labSplitOffer(course: Pick<Course, 'id' | 'rooms'>, meetings: readonly Meeting[], variants: readonly SubjectVariant[]): { rooms: string[]; meetingIds: string[] } | null {
  if (variants.some((v) => v.subjectId === course.id)) return null;
  const mine = meetings.filter((m) => m.courseId === course.id);
  const lab = mine.filter((m) => LAB_ROOM.test(roomOfMeeting(course, m)));
  if (!lab.length || lab.length === mine.length) return null;
  return { rooms: [...new Set(lab.map((m) => roomOfMeeting(course, m)))], meetingIds: lab.map((m) => m.id) };
}

/**
 * Split a subject's lab classes into a Lab part, in one change with one undo:
 *  - the base part (Lecture) and a Lab part (kind `lab`, the subject's goal) are made;
 *  - the lab classes point at the Lab part, each keeping the room it was in;
 *  - their attendance is RE-KEYED (`date|start|courseId` → `date|start|courseId~labId`), so no mark is lost.
 * Day marks are keyed by date alone and cover every class that day, so they need nothing. The undo is the same
 * change read backwards, which restores every key byte for byte.
 */
export function splitLabChange(s: { courses: readonly Course[]; meetings: readonly Meeting[]; variants: readonly SubjectVariant[]; attendance: Readonly<Record<string, AttRecord>> }, courseId: string, labId: string): Change | null {
  const course = s.courses.find((c) => c.id === courseId);
  if (!course) return null;
  const offer = labSplitOffer(course, s.meetings, s.variants);
  if (!offer) return null;
  const before = emptyRows(), after = emptyRows();
  after.variants.push(
    { id: baseIdOf(courseId), subjectId: courseId, name: 'Lecture', room: course.rooms.find((r) => !LAB_ROOM.test(r)) ?? '', teacher: course.teacher, note: '', ord: -1, kind: 'lecture', isBase: true, scale: 100, weight: null, attGoal: null },
    { id: labId, subjectId: courseId, name: 'Lab', room: offer.rooms[0] ?? '', teacher: '', note: '', ord: 0, kind: 'lab', isBase: false, scale: 100, weight: null, attGoal: null },
  );
  const ids = new Set(offer.meetingIds);
  const moved = s.meetings.filter((m) => ids.has(m.id));
  before.meetings.push(...moved);
  after.meetings.push(...moved.map((m) => ({ ...m, variantId: labId, room: m.room?.trim() ? m.room : roomOfMeeting(course, m) })));
  /* every record of a moved class, under the key it had (no variant suffix), moves to the lab's key */
  const slots = new Set(moved.map((m) => `${m.start}|${courseId}`)), kept = s.meetings.filter((m) => m.courseId === courseId && !ids.has(m.id));
  for (const r of Object.values(s.attendance)) {
    const k = parseOccKey(r.key);
    if (!k || k.courseId !== courseId || k.variantId || !slots.has(`${k.start}|${courseId}`)) continue;
    /* same start on that weekday; a start no lecture shares counts on any day (a class moved for one week) */
    const wd = weekdayOf(new Date(`${k.date}T00:00:00`));
    if (!moved.some((m) => m.start === k.start && m.weekday === wd) && kept.some((m) => m.start === k.start)) continue;
    before.attendance.push(r);
    after.attendance.push({ ...r, key: occKey(k.date, { start: k.start, courseId, variantId: labId }) });
  }
  return { before, after };
}

/** "marks Lecture and Lab" (v0.7.7.2): what a whole-day mark covers, said on the Mark day sheet when one of the
 *  day's subjects has classes in two parts that day. Null when every class that day is a plain lecture. */
export function dayPartsNote(weekday: number, meetings: readonly Meeting[], variants: readonly SubjectVariant[]): string | null {
  const names: string[] = [];
  for (const m of meetings.filter((x) => x.weekday === weekday)) {
    if (!variants.some((v) => v.subjectId === m.courseId && !v.isBase)) continue;
    const n = partLabel(m.courseId, m.variantId, variants) ?? 'Lecture';
    if (!names.includes(n)) names.push(n);
  }
  if (names.length < 2) return null;
  return `marks ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
