import type {
  AttRecord, AttStatus, AttWhy, Course, DayMark, DayStatus, Mark, Meeting, SemesterRow, Settings, Snapshot, SubjectVariant, Task, TaskKind, 
} from './types';
import { ST, WHY_LABEL, legacyStatus, whyOf } from './attendance';
import { splitRooms } from './rooms';
import { fromMin, hm } from './time';

/* The import path's shared pieces (v0.8 §2.4 split): types, cell readers and counts used by both the JSON
   (`importPlan.ts`) and the CSV (`importCsv.ts`) halves. */
/**
 * The import path's pure half: text in, a plan out. No React, no store, no I/O — `store.importPlan`
 * is what writes, and `Repository.importSnapshot` is what lands it in one transaction.
 *
 * Two shapes are accepted, because there are two real sources:
 *
 *  A. **This app's own JSON export** (`{ app: 'margin', …, raw: Snapshot }`) — the export's missing
 *     other half. Only `raw` is read; the spreadsheet-shaped tables above it are for people.
 *  B. **A compact shape for an AI to produce** — courses with their meetings, day marks, tasks and
 *     marks, referenced by course *name*. See `briefs/v031-A-data.md` for the sample.
 *
 * Every failure is a `Problem` the sheet can print, never a throw: this parser is fed pasted text,
 * which is exactly the input that is wrong most often.
 */
export interface Problem { where: string; field: string; message: string }

/** One subject variant is a `SubjectVariant`: as the full-dataset file spells it and as v0.5's
 *  `subject_variants` table stores it (`id, subject_id, name, room, teacher, note, ord`). `plan.variants`
 *  is the preview's copy; `snapshot.variants` is what the repository writes — both built from the same
 *  map below, so the preview cannot promise a row the write does not carry. */

/** How one dataset's rows will land. `write` and `skip` are exact; `add`/`update` split `write` and
 *  are `null` when the plan cannot see what is already on the phone. A preview that calls a row "new"
 *  without knowing is exactly the overstatement this type exists to prevent. */
export interface DatasetCount {
  /** Rows this import writes — what the Import button and the toast count. */
  write: number;
  /** Rows the file carried that this import does not write (a table a later workstream owns, a class
   *  that has not happened, a row that could not be read). A subject row that names a subject already
   *  on the phone is NOT here: it merges over that row, so it is written. */
  skip: number;
  /** Written rows that create an id the phone does not have yet; `null` when unknowable. */
  add: number | null;
  /** Written rows that overwrite an id the phone already has; `null` when unknowable. */
  update: number | null;
}

export interface ImportPlan {
  snapshot: Partial<Snapshot>;
  /** Rows that will be written, per dataset. Every dataset this parser produces one for is written by
   *  `importSnapshot`, variants included since v0.5's table landed — a count that overstated the write
   *  would be the same lie as one that understated it. */
  counts: Record<string, number>;
  /** Every dataset the file carried, with the add/update/skip split the preview prints. */
  breakdown: Record<string, DatasetCount>;
  problems: Problem[];
  warnings: string[];
  /** Datasets the file carried, normalised, for the preview to count and name. `snapshot` is what the
   *  repository writes; these are the same rows in the shape the preview reads, so the two cannot
   *  disagree — they are built from one set of maps in `parseImport`. */
  profileName?: string;
  settings?: Partial<Settings>;
  variants?: SubjectVariant[];
  attendance?: AttRecord[];
  marks?: Mark[];
  tasks?: Task[];
  /** Archived terms (`margin/2`), written as history beside the rows. */
  semesters?: SemesterRow[];
}
export interface ImportOptions {
  /** The courses already on this phone. A compact file's course name is resolved against these
   *  case-insensitively, so an import adds a term's tasks to subjects the user already has instead
   *  of duplicating them under new ids — and a course row that names one merges over it field by
   *  field, the way the CSV door merges (a field the file does not carry keeps the phone's value). */
  courses?: readonly Course[];
  /** The phone's rows for the datasets a CSV can name by id, key or date. A row that lands on one of
   *  these merges field by field: a column the CSV does not carry (or an empty cell) keeps the value
   *  already on the phone, because a paste can add but cannot wipe (D11). Passing them also lets the
   *  preview split `add` from `update`; leaving one out keeps that split honest as `null`. */
  meetings?: readonly Meeting[];
  tasks?: readonly Task[];
  attendance?: Record<string, AttRecord>;
  dayMarks?: Record<string, DayMark>;
  marks?: readonly Mark[];
  /** The variants already on this phone, so the preview can split a variant row into new/updated the
   *  way it does for subjects. Optional: without it the split is honestly `null`. */
  variants?: readonly SubjectVariant[];
  now?: number;
}

/** The tables a CSV may be. One CSV is one table: a header row names the columns, and the sheet asks
 *  the person which table it is when the header alone could be more than one. */
export type DatasetKind = 'courses' | 'timetable' | 'attendance' | 'dayMarks' | 'tasks' | 'marks';

export type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
export const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
export const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
export const int = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt);
export const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
export const nonEmpty = (v: unknown): string | null => { const s = str(v)?.trim(); return s ? s : null; };
/** Same kind of value as the default: a boolean for a boolean, a plain object for an object, and so on. */
export const sameShape = (v: unknown, dflt: unknown) => (Array.isArray(dflt) ? Array.isArray(v) : isRec(dflt) ? isRec(v) : typeof v === typeof dflt && (typeof v !== 'number' || Number.isFinite(v)));
/** A subject's rooms from a file row: `rooms` (a list or a string) wins, else the legacy `room` string,
 *  split the way migration 5 split it. `null` = the row names no room (so a merge keeps the phone's). */
export const roomsIn = (row: Rec): string[] | null => { const r = splitRooms(row.rooms ?? row.room); return r.length ? r : null; };

/** The statuses a day mark can hold, and the words the app prints for them (`ST`). The brief's prose
 *  says "(`cancelled`, `holiday`, …)"; `domain/types.ts` has no `holiday` — it is a *reason* on a
 *  cancelled day, not a status — so both the letters and the printed words are accepted, and nothing
 *  outside the type is invented. */
export const DAY_STATUS: DayStatus[] = ['p', 'a', 'c'];
export const ATT_STATUS: AttStatus[] = ['p', 'a', 'c'];
export const TASK_KINDS: TaskKind[] = ['assignment', 'exam', 'reading', 'project', 'lab', 'deadline', 'other'];

/** A status cell, read as a v0.6 state + why: the letters of every generation (`l n s t` included),
 *  the words the app prints (`Present`, `Late`, `Sick`…), and the export's own "Absent · Sick" form. */
export function readStatus(v: unknown): { status: AttStatus; why: AttWhy } | null {
  const s = str(v)?.trim();
  if (!s) return null;
  const [head, tail] = s.split('·').map((x) => x.trim());
  const base = legacyStatus(head);
  if (!base) return null;
  if (tail) {
    const w = (Object.keys(WHY_LABEL) as Exclude<AttWhy, ''>[]).find((k) => WHY_LABEL[k].toLowerCase() === tail.toLowerCase());
    return { status: base.status, why: whyOf(base.status, w) || base.why };
  }
  return base;
}
export const dayStatus = (v: unknown): DayStatus | null => readStatus(v)?.status ?? null;
export const attStatus = (v: unknown): AttStatus | null => readStatus(v)?.status ?? null;
/** The why a row carries: its own `why` field when it names one this state offers, else the one its
 *  status cell implied (an old `s` is Absent · Sick), else none. */
export const whyIn = (status: AttStatus, statusCell: unknown, why: unknown): AttWhy => whyOf(status, why) || (readStatus(statusCell)?.status === status ? readStatus(statusCell)!.why : '');
/** A why rides on the record only when there is one, so a plain mark keeps the shape it always had. */
export const W = (why: AttWhy) => (why ? { why } : {});
/** A merge that names a status replaces the why too — the old reason belonged to the old status. */
export const noWhy = <T extends { why?: AttWhy }>(r: T): Omit<T, 'why'> => { const rest = { ...r }; delete rest.why; return rest; };
export const statusProblem = () => `status must be one of ${DAY_STATUS.join(', ')} — or ${DAY_STATUS.map((k) => ST[k]).join(', ')}.`;

/** Statuses this app's export writes when a class has not finished: `effective()` returns no status
 *  yet, so the export prints `upcoming` (and marks the row's source `future`) in its CSV table, and a
 *  compact file spells the same thing `null` — or omits the field. Such a row has nothing to write —
 *  importing it must not invent a "Here" the user never marked — but it is also not an error, or the
 *  app would refuse its own export. The CSV planner and the compact JSON reader both skip it. */
export const UPCOMING = ['upcoming', 'future'];
export const isUpcoming = (v: unknown): boolean => {
  const s = str(v)?.trim().toLowerCase();
  return !!s && UPCOMING.includes(s);
};

/** `HH:MM`, tolerating `H:MM`, normalised to two digits. Null when it is not a real time of day. */
export function clock(v: unknown): string | null {
  const s = str(v)?.trim();
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const m = hm(s);
  if (m < 0 || m >= 1440) return null;
  return fromMin(m);
}

/** ISO, `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` (a space is accepted in place of the `T`). Local time, as
 *  a person writing "2026-09-20T23:59" means it. A number is already epoch ms, which is what shape A
 *  carries. */
export function parseWhen(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = str(v)?.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(s);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), 0, 0);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/** FNV-1a, 32-bit, base 36. Short, stable, and dependency-free — the whole point is that the same
 *  natural key produces the same row id on every import, so importing one file twice cannot duplicate
 *  anything. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export const derived = (kind: string, key: string) => `imp-${kind}-${shortHash(key)}`;

/** Every top-level key the two shapes may carry. Shape A's list is the export's own table names (see
 *  `toJson`) plus the envelope; anything else is reported, not guessed at. */
export const A_KEYS = new Set(['app', 'version', 'format', 'pack', 'semesters', 'Variants', 'Semesters', 'exportedAt', 'raw', 'Summary', 'Courses', 'Timetable', 'Attendance', 'Day marks', 'Tasks', 'Subtasks', 'Reminders', 'Notices', 'Marks', 'Focus sessions', 'Trips', 'Alarms', 'Settings']);
export const B_KEYS = new Set(['app', 'version', 'exportedAt', 'profileName', 'semester', 'courses', 'days', 'attendance', 'tasks', 'marks']);

export function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = num(v);
  return n === null ? dflt : Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Turn what was read and what will be written into the preview's numbers.
 *
 * `write` and `skip` are exact for every dataset. `add`/`update` split `write` for every dataset whose
 * rows are already on the phone in `opts` (subjects, and — since the CSV door resolves ids/keys/dates —
 * classes, tasks, attendance, day marks and marks). A dataset whose existing rows were not handed in
 * keeps `null` and the preview says "add or update" instead of calling a row new.
 */
export function datasetCounts(
  snapshot: Partial<Snapshot>, read: Record<string, number>, writes: Record<string, number>, opts: ImportOptions,
): Record<string, DatasetCount> {
  const written: Record<string, readonly string[]> = {
    courses: (snapshot.courses ?? []).map((c) => c.id),
    meetings: (snapshot.meetings ?? []).map((m) => m.id),
    tasks: (snapshot.tasks ?? []).map((t) => t.id),
    notices: (snapshot.notices ?? []).map((n) => n.id),
    attendance: Object.keys(snapshot.attendance ?? {}),
    dayMarks: Object.keys(snapshot.dayMarks ?? {}),
    marks: (snapshot.marks ?? []).map((m) => m.id),
    adjusts: Object.keys(snapshot.adjusts ?? {}),
    variants: (snapshot.variants ?? []).map((v) => v.id),
  };
  const phone: Record<string, readonly string[] | undefined> = {
    courses: opts.courses?.map((c) => c.id),
    meetings: opts.meetings?.map((m) => m.id),
    tasks: opts.tasks?.map((t) => t.id),
    notices: undefined,
    attendance: opts.attendance ? Object.keys(opts.attendance) : undefined,
    dayMarks: opts.dayMarks ? Object.keys(opts.dayMarks) : undefined,
    marks: opts.marks?.map((m) => m.id),
    adjusts: undefined,
    variants: opts.variants?.map((v) => v.id),
  };
  const out: Record<string, DatasetCount> = {};
  for (const kind of new Set([...Object.keys(read), ...Object.keys(writes)])) {
    const onPhone = phone[kind];
    const existing = new Set(onPhone ?? []);
    let add = 0, update = 0;
    for (const id of written[kind] ?? []) { if (existing.has(id)) update++; else add++; }
    out[kind] = {
      write: writes[kind] ?? 0,
      skip: Math.max(0, (read[kind] ?? 0) - (writes[kind] ?? 0)),
      add: onPhone ? add : null,
      update: onPhone ? update : null,
    };
  }
  return out;
}

/** `Record<k, row>` as entries, or an array of rows keyed by its own `key`/`date`. Anything else is
 *  ignored here and reported by the caller's own shape check, never a crash. */
export function entriesOf(v: unknown): [string, unknown][] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((row, i) => [String(i), row]);
  if (isRec(v)) return Object.entries(v);
  return [];
}

