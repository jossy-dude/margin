import type { AttRecord, Course, FocusSession, Mark, Meeting, Notice, Snapshot, SubjectVariant, Task } from './types';
import { occKey, parseOccKey } from './attendance';
import { splitRooms } from './rooms';

/**
 * The rows one compound edit touches, as they are BEFORE and AFTER it. A change is described by the two
 * sets instead of by a list of operations, because then its undo is the same change read backwards:
 * apply = show `after` in place of `before`, undo = show `before` in place of `after`. The repository
 * half follows from the same pair (`batchOf`): every row of the target set is written, every row only
 * the source set has is tombstoned — in one transaction.
 */
export interface RowSet {
  courses: Course[]; meetings: Meeting[]; marks: Mark[]; tasks: Task[]; notices: Notice[];
  focus: FocusSession[]; variants: SubjectVariant[]; attendance: AttRecord[];
}
export const emptyRows = (): RowSet => ({ courses: [], meetings: [], marks: [], tasks: [], notices: [], focus: [], variants: [], attendance: [] });
export interface Change { before: RowSet; after: RowSet }

/** The repository writes that turn `from` into `to`. Entity names match `SPECS`. */
export type BatchPut =
  | { entity: 'course'; value: Course } | { entity: 'meeting'; value: Meeting } | { entity: 'mark'; value: Mark }
  | { entity: 'task'; value: Task } | { entity: 'notice'; value: Notice } | { entity: 'focus'; value: FocusSession }
  | { entity: 'variant'; value: SubjectVariant } | { entity: 'attendance'; value: AttRecord };
export interface Batch { put: BatchPut[]; remove: { entity: BatchPut['entity']; id: string }[] }
const KEYS: [keyof RowSet, BatchPut['entity']][] = [
  ['courses', 'course'], ['variants', 'variant'], ['meetings', 'meeting'], ['marks', 'mark'],
  ['tasks', 'task'], ['notices', 'notice'], ['focus', 'focus'], ['attendance', 'attendance'],
];
export const pkOfRow = (k: keyof RowSet, r: unknown) => (k === 'attendance' ? (r as AttRecord).key : (r as { id: string }).id);
export function batchOf(from: RowSet, to: RowSet): Batch {
  const out: Batch = { put: [], remove: [] };
  for (const [k, entity] of KEYS) {
    const keep = new Set((to[k] as unknown[]).map((r) => pkOfRow(k, r)));
    for (const r of to[k] as unknown[]) out.put.push({ entity, value: r } as BatchPut);
    for (const r of from[k] as unknown[]) { const id = pkOfRow(k, r); if (!keep.has(id)) out.remove.push({ entity, id }); }
  }
  return out;
}

/** A class that would share its attendance key with one already in the timetable: same subject, same
 *  variant, same weekday and the same start. Two of those cannot be marked apart, so the second is refused. */
export function duplicateMeeting(m: Meeting, meetings: readonly Meeting[]): Meeting | undefined {
  return meetings.find((x) => x.id !== m.id && x.courseId === m.courseId && (x.variantId ?? null) === (m.variantId ?? null) && x.weekday === m.weekday && x.start === m.start);
}

/**
 * "Make this a variant of…": subject `childId` becomes a variant of subject `parentId`, and everything
 * it owned moves with it — its classes, marks, tasks, notes, focus sessions and attendance — so nothing
 * is lost and the parent's stats roll it up. The child's own variants become the parent's. The child's
 * rooms join the parent's list, and each of its classes keeps the room it was in. The child's grade
 * curve stays on disk with the (tombstoned) child, so an undo brings it back exactly.
 *
 * Returns `null` when the move is meaningless (same subject, either missing).
 */
export function makeVariantChange(s: Pick<Snapshot, 'courses' | 'meetings' | 'marks' | 'tasks' | 'notices' | 'focus' | 'attendance'> & { variants?: SubjectVariant[] }, childId: string, parentId: string, newId: string): Change | null {
  const child = s.courses.find((c) => c.id === childId), parent = s.courses.find((c) => c.id === parentId);
  if (!child || !parent || childId === parentId) return null;
  const variants = s.variants ?? [];
  const before = emptyRows(), after = emptyRows();
  const ord = variants.filter((v) => v.subjectId === parentId).length;
  const v: SubjectVariant = { id: newId, subjectId: parentId, name: child.name, room: child.rooms[0] ?? '', teacher: child.teacher, note: '', ord };
  after.variants.push(v);
  const childVariants = variants.filter((x) => x.subjectId === childId);
  before.variants.push(...childVariants);
  after.variants.push(...childVariants.map((x, i) => ({ ...x, subjectId: parentId, ord: ord + 1 + i })));

  before.courses.push(child, parent);
  after.courses.push({ ...parent, rooms: splitRooms([...parent.rooms, ...child.rooms]), demo: parent.demo && child.demo });

  for (const m of s.meetings.filter((x) => x.courseId === childId)) {
    before.meetings.push(m);
    after.meetings.push({ ...m, courseId: parentId, variantId: m.variantId ?? newId, room: m.room || child.rooms[0] || null });
  }
  for (const m of s.marks.filter((x) => x.courseId === childId)) { before.marks.push(m); after.marks.push({ ...m, courseId: parentId, variantId: m.variantId ?? newId }); }
  for (const t of s.tasks.filter((x) => x.courseId === childId)) { before.tasks.push(t); after.tasks.push({ ...t, courseId: parentId }); }
  for (const n of s.notices.filter((x) => x.courseId === childId)) { before.notices.push(n); after.notices.push({ ...n, courseId: parentId }); }
  for (const f of s.focus.filter((x) => x.courseId === childId)) { before.focus.push(f); after.focus.push({ ...f, courseId: parentId }); }
  for (const a of Object.values(s.attendance)) {
    const k = parseOccKey(a.key);
    if (!k || k.courseId !== childId) continue;
    before.attendance.push(a);
    after.attendance.push({ ...a, key: occKey(k.date, { start: k.start, courseId: parentId, variantId: k.variantId ?? newId }) });
  }
  return { before, after };
}

/** Deleting a variant takes its classes and marks with it (they were its own); attendance stays as history. */
export function removeVariantChange(s: Pick<Snapshot, 'meetings' | 'marks'> & { variants?: SubjectVariant[] }, id: string): Change | null {
  const v = (s.variants ?? []).find((x) => x.id === id);
  if (!v) return null;
  const before = emptyRows();
  before.variants.push(v);
  before.meetings.push(...s.meetings.filter((m) => m.variantId === id));
  before.marks.push(...s.marks.filter((m) => m.variantId === id));
  return { before, after: emptyRows() };
}
