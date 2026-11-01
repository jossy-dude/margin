import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, SubjectVariant, Task } from './types';
import { newSemesterRange } from './semester';
import { uid } from './time';

/**
 * The archived shape of a term.
 *
 * Rolling over clears the day tables — that is the point of a semester boundary, and it is what keeps
 * Today and Week from filling up with last term's classes. What it must not do is lose them, so the
 * live rows are frozen into one JSON string on the archived semester row before anything is cleared.
 * The envelope carries a version so a future release can read a snapshot it knows, and refuse one it
 * does not, instead of guessing at a shape that has since gained a column.
 *
 * Everything here is pure: no store, no repository, no clock of its own. The caller builds the string
 * from rows it already has, and the history viewer reads it back with `readSnapshot`.
 */
export const ARCHIVE_VERSION = 10;
/** Envelopes this release can read: v9 (v0.5 before D4, without notes, day marks, curves and focus) and v10. */
const READABLE = new Set([9, 10]);

/** The datasets a term archives. The six the plan names (schedule, subjects + variants, attendance,
 *  grades, tasks, settings), with `variants` folded in beside `courses` because a variant's meaning
 *  is "one of this subject's identities". */
export interface ArchivedData {
  courses: Course[]; meetings: Meeting[]; variants: SubjectVariant[];
  attendance: Record<string, AttRecord>; marks: Mark[]; tasks: Task[];
  settings: Partial<Settings>;
  /** v10 (D4): everything else the roll-over clears or resets, so a closed term is whole. A v9 archive
   *  reads back with these empty — it never had them. */
  notices: Notice[]; dayMarks: Record<string, DayMark>; adjusts: Record<string, number>; focus: FocusSession[];
}
export interface ArchiveEnvelope { v: number; datasets: ArchivedData }

/**
 * The snapshot written to `semesters.snapshot_json`.
 *
 * The `variants` argument is an optional seventh rather than a reshuffle of the six the brief fixed:
 * a call site that only has the schedule keeps compiling, and the archive is still complete for the
 * call sites that own variants. `JSON.stringify` is the copy — the caller's live arrays are never
 * retained, so a later edit to the current term cannot reach back into an archived one.
 */
export function buildSnapshot(
  courses: Course[], meetings: Meeting[], attendance: Record<string, AttRecord>,
  marks: Mark[], tasks: Task[], settings: Partial<Settings>, variants: SubjectVariant[] = [],
  rest: { notices?: Notice[]; dayMarks?: Record<string, DayMark>; adjusts?: Record<string, number>; focus?: FocusSession[] } = {},
): string {
  const envelope: ArchiveEnvelope = { v: ARCHIVE_VERSION, datasets: { courses, meetings, variants, attendance, marks, tasks, settings, notices: rest.notices ?? [], dayMarks: rest.dayMarks ?? {}, adjusts: rest.adjusts ?? {}, focus: rest.focus ?? [] } };
  return JSON.stringify(envelope);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/**
 * The archive back, or `null` when it cannot be trusted.
 *
 * `null` rather than a throw or a partial object: this is read to populate a history screen, and one
 * damaged row must not take the page down or — worse — render an empty term as if the user had taught
 * nothing that year. All seven datasets are required because `buildSnapshot` always writes all seven;
 * anything less is not a snapshot this release produced.
 */
export function readSnapshot(json: string): ArchiveEnvelope | null {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return null; }
  if (!isObj(parsed) || typeof parsed.v !== 'number' || !READABLE.has(parsed.v) || !isObj(parsed.datasets)) return null;
  const d = parsed.datasets;
  if (!isArr(d.courses) || !isArr(d.meetings) || !isArr(d.variants) || !isArr(d.marks) || !isArr(d.tasks) || !isObj(d.attendance) || !isObj(d.settings)) return null;
  return {
    v: ARCHIVE_VERSION,
    datasets: {
      courses: d.courses as Course[], meetings: d.meetings as Meeting[], variants: d.variants as SubjectVariant[],
      attendance: d.attendance as Record<string, AttRecord>, marks: d.marks as Mark[], tasks: d.tasks as Task[],
      settings: d.settings as Partial<Settings>,
      notices: isArr(d.notices) ? d.notices as Notice[] : [], dayMarks: isObj(d.dayMarks) ? d.dayMarks as Record<string, DayMark> : {},
      adjusts: isObj(d.adjusts) ? d.adjusts as Record<string, number> : {}, focus: isArr(d.focus) ? d.focus as FocusSession[] : [],
    },
  };
}

/** What a term is called before the user renames it. Year-only, because the app does not know whether
 *  September is the start of "Autumn" or of "Semester 2" on this campus — the name is one tap away and
 *  a wrong guess would be printed as fact on the Semesters page. Shared with the migration's carry so
 *  a migrated term and a rolled-over one cannot disagree about the default. */
export const semesterName = (start: string): string => `Semester ${start.slice(0, 4)}`;

/**
 * The row a roll-over creates when the user has no range in mind: today, and the 15-week seed after it
 * (`newSemesterRange`, the same fallback the migration uses). Active on construction — the caller
 * saves it and makes it active in the same pass, so a term is never left archived-but-live.
 */
export function newSemester(now: number): SemesterRow {
  const { start, end } = newSemesterRange(now);
  return {
    id: uid('sem'), name: semesterName(start), start, end, active: true,
    snapshotJson: null, createdAt: new Date(now).toISOString(), archivedAt: null,
  };
}
