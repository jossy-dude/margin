import type {
  Alarm, AttRecord, AttStatus, AttWhy, Course, DayMark, DayStatus, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, Snapshot, SubjectVariant, Task, TaskKind, Trip,
} from './types';
import { ST, WHY_LABEL, legacyStatus, occKey, whyOf } from './attendance';
import { splitRooms } from './rooms';
import { DEFAULT_SETTINGS } from './defaults';
import { parseCsv } from './csv';
import { fromMin, hm } from './time';
import { isYmd, validRange } from './semester';

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

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt);
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
const nonEmpty = (v: unknown): string | null => { const s = str(v)?.trim(); return s ? s : null; };
/** Same kind of value as the default: a boolean for a boolean, a plain object for an object, and so on. */
const sameShape = (v: unknown, dflt: unknown) => (Array.isArray(dflt) ? Array.isArray(v) : isRec(dflt) ? isRec(v) : typeof v === typeof dflt && (typeof v !== 'number' || Number.isFinite(v)));
/** A subject's rooms from a file row: `rooms` (a list or a string) wins, else the legacy `room` string,
 *  split the way migration 5 split it. `null` = the row names no room (so a merge keeps the phone's). */
const roomsIn = (row: Rec): string[] | null => { const r = splitRooms(row.rooms ?? row.room); return r.length ? r : null; };

/** The statuses a day mark can hold, and the words the app prints for them (`ST`). The brief's prose
 *  says "(`cancelled`, `holiday`, …)"; `domain/types.ts` has no `holiday` — it is a *reason* on a
 *  cancelled day, not a status — so both the letters and the printed words are accepted, and nothing
 *  outside the type is invented. */
const DAY_STATUS: DayStatus[] = ['p', 'a', 'c'];
const ATT_STATUS: AttStatus[] = ['p', 'a', 'c'];
const TASK_KINDS: TaskKind[] = ['assignment', 'exam', 'reading', 'project', 'lab', 'deadline', 'other'];

/** A status cell, read as a v0.6 state + why: the letters of every generation (`l n s t` included),
 *  the words the app prints (`Present`, `Late`, `Sick`…), and the export's own "Absent · Sick" form. */
function readStatus(v: unknown): { status: AttStatus; why: AttWhy } | null {
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
const dayStatus = (v: unknown): DayStatus | null => readStatus(v)?.status ?? null;
const attStatus = (v: unknown): AttStatus | null => readStatus(v)?.status ?? null;
/** The why a row carries: its own `why` field when it names one this state offers, else the one its
 *  status cell implied (an old `s` is Absent · Sick), else none. */
const whyIn = (status: AttStatus, statusCell: unknown, why: unknown): AttWhy => whyOf(status, why) || (readStatus(statusCell)?.status === status ? readStatus(statusCell)!.why : '');
/** A why rides on the record only when there is one, so a plain mark keeps the shape it always had. */
const W = (why: AttWhy) => (why ? { why } : {});
/** A merge that names a status replaces the why too — the old reason belonged to the old status. */
const noWhy = <T extends { why?: AttWhy }>(r: T): Omit<T, 'why'> => { const rest = { ...r }; delete rest.why; return rest; };
const statusProblem = () => `status must be one of ${DAY_STATUS.join(', ')} — or ${DAY_STATUS.map((k) => ST[k]).join(', ')}.`;

/** Statuses this app's export writes when a class has not finished: `effective()` returns no status
 *  yet, so the export prints `upcoming` (and marks the row's source `future`) in its CSV table, and a
 *  compact file spells the same thing `null` — or omits the field. Such a row has nothing to write —
 *  importing it must not invent a "Here" the user never marked — but it is also not an error, or the
 *  app would refuse its own export. The CSV planner and the compact JSON reader both skip it. */
const UPCOMING = ['upcoming', 'future'];
const isUpcoming = (v: unknown): boolean => {
  const s = str(v)?.trim().toLowerCase();
  return !!s && UPCOMING.includes(s);
};

/** `HH:MM`, tolerating `H:MM`, normalised to two digits. Null when it is not a real time of day. */
function clock(v: unknown): string | null {
  const s = str(v)?.trim();
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const m = hm(s);
  if (m < 0 || m >= 1440) return null;
  return fromMin(m);
}

/** ISO, `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` (a space is accepted in place of the `T`). Local time, as
 *  a person writing "2026-09-20T23:59" means it. A number is already epoch ms, which is what shape A
 *  carries. */
function parseWhen(v: unknown): number | null {
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
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
const derived = (kind: string, key: string) => `imp-${kind}-${shortHash(key)}`;

/** Every top-level key the two shapes may carry. Shape A's list is the export's own table names (see
 *  `toJson`) plus the envelope; anything else is reported, not guessed at. */
const A_KEYS = new Set(['app', 'version', 'format', 'pack', 'semesters', 'Variants', 'Semesters', 'exportedAt', 'raw', 'Summary', 'Courses', 'Timetable', 'Attendance', 'Day marks', 'Tasks', 'Subtasks', 'Reminders', 'Notices', 'Marks', 'Focus sessions', 'Trips', 'Alarms', 'Settings']);
const B_KEYS = new Set(['app', 'version', 'exportedAt', 'profileName', 'semester', 'courses', 'days', 'attendance', 'tasks', 'marks']);

export function parseImport(text: string, opts: ImportOptions = {}): ImportPlan {
  const now = opts.now ?? Date.now();
  const problems: Problem[] = [];
  const warnings: string[] = [];
  const problem = (where: string, field: string, message: string) => { problems.push({ where, field, message }); };

  const courses = new Map<string, Course>();
  const meetings = new Map<string, Meeting>();
  const tasks = new Map<string, Task>();
  const notices = new Map<string, Notice>();
  const attendance = new Map<string, AttRecord>();
  const dayMarks = new Map<string, DayMark>();
  const marks = new Map<string, Mark>();
  const adjusts = new Map<string, number>();
  const variantRows = new Map<string, SubjectVariant>();
  const focus = new Map<string, FocusSession>();
  const trips = new Map<string, Trip>();
  const alarms = new Map<string, Alarm>();
  /** Archived terms a `margin/2` export carries. History only: written by `saveSemester` beside the
   *  rows, never made active, and a term the phone already has (same id) is left as the phone has it. */
  const archived: SemesterRow[] = [];
  /* The phone's rows by id, as the CSV door's `existingById`: the map a raw or compact course row
     is merged against, so neither JSON door can wipe a subject the phone already has. */
  const existingById = new Map((opts.courses ?? []).map((c) => [c.id, c]));
  let settings: Partial<Settings> = {};
  let profileName: string | undefined;

  const unknownKeys = (row: Rec, allowed: readonly string[], where: string) => {
    for (const k of Object.keys(row)) if (!allowed.includes(k)) warnings.push(`${where}: "${k}" is not part of the import and was ignored.`);
  };
  const asRows = (v: unknown, where: string): unknown[] => {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v;
    problem(where, 'value', 'Expected a list.');
    return [];
  };
  const duplicate = (what: string, at: string) => warnings.push(`${at}: ${what} is listed twice; the later row wins.`);
  /** Rows read per dataset, so `skip` can be exact: read − written. Ragged or unreadable rows count
   *  here too — the file carried them, and the import does not write them. */
  const read: Record<string, number> = {};
  const reads = (kind: string, n: number) => { if (n) read[kind] = (read[kind] ?? 0) + n; };

  /* ── read the envelope ───────────────────────────────────────────────────────────────────────── */
  if (!text.trim()) {
    problem('file', 'text', 'Paste the JSON first.');
    return { snapshot: {}, counts: {}, breakdown: {}, problems, warnings };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) {
    problem('file', 'json', `That is not valid JSON: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    return { snapshot: {}, counts: {}, breakdown: {}, problems, warnings };
  }
  if (!isRec(parsed)) {
    problem('file', 'json', 'The file must be a JSON object.');
    return { snapshot: {}, counts: {}, breakdown: {}, problems, warnings };
  }
  const app = parsed.app;
  if (app !== undefined && app !== 'margin') {
    problem('file', 'app', `This is not a Margin file (app is "${String(app)}").`);
    return { snapshot: {}, counts: {}, breakdown: {}, problems, warnings };
  }
  const shapeA = app === 'margin' || (app === undefined && 'raw' in parsed);

  if (shapeA) {
    for (const k of Object.keys(parsed)) if (!A_KEYS.has(k)) warnings.push(`"${k}" is not part of a Margin export and was ignored.`);
    const raw = parsed.raw;
    if (!isRec(raw)) {
      problem('file', 'raw', 'This looks like a Margin export, but the "raw" snapshot it should carry is missing.');
      return { snapshot: {}, counts: {}, breakdown: {}, problems, warnings };
    }
    readRaw(raw);
    readArchived(parsed.semesters);
  } else {
    for (const k of Object.keys(parsed)) if (!B_KEYS.has(k)) warnings.push(`"${k}" is not part of the import and was ignored.`);
    readCompact(parsed);
  }

  /* What will actually land, and what the file carried. Variants are written like every other dataset
     since v0.5's migration gave them a table — the row is a `put`, so it carries a `rev` and reaches
     `importSnapshot` with the rest. */
  const writes: Record<string, number> = {
    courses: courses.size, meetings: meetings.size, tasks: tasks.size, notices: notices.size,
    attendance: attendance.size, dayMarks: dayMarks.size, marks: marks.size, adjusts: adjusts.size,
    variants: variantRows.size, focus: focus.size, trips: trips.size, alarms: alarms.size, semesters: archived.length,
  };
  const counts = Object.fromEntries(Object.entries(writes).filter(([, n]) => n > 0));
  const snapshot: Partial<Snapshot> = {};
  if (courses.size) snapshot.courses = [...courses.values()];
  if (meetings.size) snapshot.meetings = [...meetings.values()];
  if (tasks.size) snapshot.tasks = [...tasks.values()];
  if (notices.size) snapshot.notices = [...notices.values()];
  if (variantRows.size) snapshot.variants = [...variantRows.values()];
  if (attendance.size) snapshot.attendance = Object.fromEntries(attendance);
  if (dayMarks.size) snapshot.dayMarks = Object.fromEntries(dayMarks);
  if (marks.size) snapshot.marks = [...marks.values()];
  if (adjusts.size) snapshot.adjusts = Object.fromEntries(adjusts);
  if (focus.size) snapshot.focus = [...focus.values()];
  if (trips.size) snapshot.trips = [...trips.values()];
  if (alarms.size) snapshot.alarms = [...alarms.values()];
  if (Object.keys(settings).length) snapshot.settings = settings;
  const breakdown = datasetCounts(snapshot, read, writes, opts);

  const plan: ImportPlan = { snapshot, counts, breakdown, problems, warnings };
  if (profileName) plan.profileName = profileName;
  if (settings.semesterStart) plan.settings = { semesterStart: settings.semesterStart, semesterEnd: settings.semesterEnd ?? '' };
  if (variantRows.size) plan.variants = [...variantRows.values()];
  if (attendance.size) plan.attendance = [...attendance.values()];
  if (marks.size) plan.marks = [...marks.values()];
  if (tasks.size) plan.tasks = [...tasks.values()];
  if (archived.length) plan.semesters = archived;
  return plan;

  /* ── margin/2: the archived terms beside `raw` ──────────────────────────────────────────────── */
  function readArchived(v: unknown) {
    const rows = asRows(v, 'semesters');
    reads('semesters', rows.length);
    for (const [i, row] of rows.entries()) {
      const at = `semesters[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      const id = nonEmpty(row.id), snap = str(row.snapshotJson), start = str(row.start) ?? '', end = str(row.end) ?? '';
      if (!id || !snap) { problem(at, 'row', 'An archived term needs its id and its saved snapshot.'); continue; }
      try { JSON.parse(snap); } catch { problem(at, 'snapshotJson', 'The saved term is not readable.'); continue; }
      archived.push({ id, name: str(row.name) ?? '', start, end, active: false, snapshotJson: snap, createdAt: str(row.createdAt) ?? '', archivedAt: str(row.archivedAt) ?? new Date(now).toISOString() });
    }
  }

  /* ── shape A: this app's own export, read from `raw` ─────────────────────────────────────────── */
  function readRaw(raw: Rec) {
    const courseRows = asRows(raw.courses, 'courses');
    reads('courses', courseRows.length);
    for (const [i, row] of courseRows.entries()) {
      const at = `courses[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'name', 'room', 'rooms', 'teacher', 'goal', 'sort', 'demo', 'bar'], at);
      const name = nonEmpty(row.name);
      if (!name) { problem(at, 'name', 'A course needs a name.'); continue; }
      const id = nonEmpty(row.id) ?? derived('course', name.toLowerCase());
      /* The merge rule is release-wide, not per-shape (round 5): a raw row that omits — or blanks —
         a field keeps the phone's value, so a sparse raw cannot wipe a subject the way the compact
         and CSV doors cannot. The app's own export provides every field, so a real re-import still
         writes the full row it always did. */
      const phoneRow = existingById.get(id);
      courses.set(id, phoneRow ? {
        ...phoneRow,
        name,
        rooms: roomsIn(row) ?? phoneRow.rooms,
        teacher: nonEmpty(row.teacher) ?? phoneRow.teacher,
        goal: num(row.goal) ?? phoneRow.goal,
        sort: num(row.sort) === null ? phoneRow.sort : int(row.sort, i),
        demo: typeof row.demo === 'boolean' ? row.demo : phoneRow.demo,
      } : { id, name, rooms: roomsIn(row) ?? [], teacher: str(row.teacher) ?? '', goal: num(row.goal), sort: int(row.sort, i), demo: bool(row.demo, false), bar: str(row.bar) });
    }

    const meetingRows = asRows(raw.meetings, 'meetings');
    reads('meetings', meetingRows.length);
    for (const [i, row] of meetingRows.entries()) {
      const at = `meetings[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'courseId', 'weekday', 'start', 'end', 'demo', 'variantId', 'room'], at);
      const courseId = nonEmpty(row.courseId);
      if (!courseId) { problem(at, 'courseId', 'A class needs the course it belongs to.'); continue; }
      const weekday = num(row.weekday);
      if (weekday === null || weekday < 0 || weekday > 6) { problem(at, 'weekday', 'weekday must be 0 (Mon) … 6 (Sun).'); continue; }
      const start = clock(row.start), end = clock(row.end);
      if (!start || !end) { problem(at, start ? 'end' : 'start', 'Times are 24-hour "HH:MM".'); continue; }
      const id = nonEmpty(row.id) ?? derived('meeting', `${courseId}|${weekday}|${start}`);
      if (meetings.has(id)) duplicate('this class', at);
      meetings.set(id, { id, courseId, weekday: Math.round(weekday), start, end, demo: bool(row.demo, false), variantId: nonEmpty(row.variantId), room: nonEmpty(row.room) });
    }

    /* v0.5: a subject's variants, as `snapshotOf` carries them (`margin/2`). A variant whose subject is
       neither in this file nor on the phone would be an orphan nothing can show, so it is a problem. */
    const variantList = asRows(raw.variants, 'variants');
    reads('variants', variantList.length);
    for (const [i, row] of variantList.entries()) {
      const at = `variants[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'subjectId', 'name', 'room', 'teacher', 'note', 'ord'], at);
      const subjectId = nonEmpty(row.subjectId), name = nonEmpty(row.name);
      if (!subjectId || (!courses.has(subjectId) && !existingById.has(subjectId))) { problem(at, 'subjectId', 'A variant needs a subject in this file or on the phone.'); continue; }
      if (!name) { problem(at, 'name', 'A variant needs a name.'); continue; }
      const id = nonEmpty(row.id) ?? derived('variant', `${subjectId}|${name.toLowerCase()}`);
      if (variantRows.has(id)) duplicate('this variant', at);
      variantRows.set(id, { id, subjectId, name, room: str(row.room) ?? '', teacher: str(row.teacher) ?? '', note: str(row.note) ?? '', ord: int(row.ord, i) });
    }

    const taskRows = asRows(raw.tasks, 'tasks');
    reads('tasks', taskRows.length);
    for (const [i, row] of taskRows.entries()) {
      const at = `tasks[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'title', 'courseId', 'kind', 'dueAt', 'startAt', 'estimateMin', 'priority', 'notes', 'status', 'createdAt', 'completedAt', 'reminders', 'subtasks', 'demo'], at);
      const title = nonEmpty(row.title);
      if (!title) { problem(at, 'title', 'A task needs a title.'); continue; }
      const dueAt = row.dueAt === undefined || row.dueAt === null ? null : parseWhen(row.dueAt);
      const startAt = row.startAt === undefined || row.startAt === null ? null : parseWhen(row.startAt);
      const id = nonEmpty(row.id) ?? derived('task', `${title}|${nonEmpty(row.courseId) ?? ''}|${dueAt ?? ''}`);
      if (tasks.has(id)) duplicate('this task', at);
      const kind = TASK_KINDS.find((k) => k === row.kind) ?? 'other';
      tasks.set(id, {
        id, title, courseId: nonEmpty(row.courseId), kind,
        dueAt, startAt, estimateMin: num(row.estimateMin), priority: clampInt(row.priority, 0, 3, 0) as 0 | 1 | 2 | 3,
        notes: str(row.notes) ?? '', status: clampInt(row.status, 0, 2, 0) as 0 | 1 | 2,
        createdAt: num(row.createdAt) ?? now, completedAt: num(row.completedAt),
        reminders: Array.isArray(row.reminders) ? (row.reminders as Task['reminders']) : [],
        subtasks: Array.isArray(row.subtasks) ? (row.subtasks as Task['subtasks']) : [],
        demo: bool(row.demo, false),
      });
    }

    const noticeRows = asRows(raw.notices, 'notices');
    reads('notices', noticeRows.length);
    for (const [i, row] of noticeRows.entries()) {
      const at = `notices[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'courseId', 'text', 'dueAt', 'priority', 'demo'], at);
      const body = nonEmpty(row.text);
      if (!body) { problem(at, 'text', 'A note needs its text.'); continue; }
      const courseId = nonEmpty(row.courseId);
      const id = nonEmpty(row.id) ?? derived('notice', `${courseId ?? ''}|${body}`);
      if (notices.has(id)) duplicate('this note', at);
      notices.set(id, { id, courseId, text: body, dueAt: parseWhen(row.dueAt) ?? now, priority: clampInt(row.priority, 0, 3, 0) as 0 | 1 | 2 | 3, demo: bool(row.demo, false) });
    }

    const markRows = asRows(raw.marks, 'marks');
    reads('marks', markRows.length);
    for (const [i, row] of markRows.entries()) {
      const at = `marks[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'courseId', 'name', 'score', 'weight', 'on', 'sort', 'demo', 'variantId'], at);
      const courseId = nonEmpty(row.courseId), name = nonEmpty(row.name);
      if (!courseId) { problem(at, 'courseId', 'A mark needs the course it belongs to.'); continue; }
      if (!name) { problem(at, 'name', 'A mark needs a name.'); continue; }
      const id = nonEmpty(row.id) ?? derived('mark', `${courseId}|${name}`);
      if (marks.has(id)) duplicate('this mark', at);
      marks.set(id, { id, courseId, name, score: num(row.score), weight: num(row.weight) ?? 0, on: bool(row.on, true), sort: int(row.sort, i), demo: bool(row.demo, false), variantId: nonEmpty(row.variantId) });
    }

    const attendanceRows = entriesOf(raw.attendance);
    reads('attendance', attendanceRows.length);
    for (const [key, row] of attendanceRows) {
      const at = `attendance[${key}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['key', 'status', 'at', 'reason', 'why'], at);
      const k = nonEmpty(row.key) ?? key;
      const status = typeof row.status === 'string' && row.status.length === 1 ? attStatus(row.status) : null;
      if (!status) { problem(at, 'status', `status must be one of ${ATT_STATUS.join(', ')}.`); continue; }
      attendance.set(k, { key: k, status, at: num(row.at) ?? now, reason: str(row.reason) ?? '', ...W(whyIn(status, row.status, row.why)) });
    }

    const dayRows = entriesOf(raw.dayMarks);
    reads('dayMarks', dayRows.length);
    for (const [key, row] of dayRows) {
      const at = `dayMarks[${key}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['date', 'status', 'at', 'reason', 'why'], at);
      const date = nonEmpty(row.date) ?? key;
      if (!isYmd(date)) { problem(at, 'date', 'A day mark needs a YYYY-MM-DD date.'); continue; }
      const status = dayStatus(row.status);
      if (!status) { problem(at, 'status', statusProblem()); continue; }
      dayMarks.set(date, { date, status, at: num(row.at) ?? now, reason: str(row.reason) ?? '', ...W(whyIn(status, row.status, row.why)) });
    }

    const adjustRows = entriesOf(raw.adjusts);
    reads('adjusts', adjustRows.length);
    for (const [key, row] of adjustRows) {
      const at = `adjusts[${key}]`;
      const courseId = isRec(row) ? nonEmpty(row.courseId) ?? key : key;
      const adj = isRec(row) ? num(row.adj) : num(row);
      if (adj === null) { problem(at, 'adj', 'A curve needs a number.'); continue; }
      adjusts.set(courseId, adj);
    }

    if (raw.settings !== undefined) {
      if (!isRec(raw.settings)) problem('settings', 'value', 'Expected an object.');
      else {
        const start = str(raw.settings.semesterStart);
        if (isYmd(start)) {
          settings.semesterStart = start;
          if ('semesterEnd' in raw.settings) {
            const end = str(raw.settings.semesterEnd)?.trim() ?? '';
            if (!end) settings.semesterEnd = '';
            else if (isYmd(end) && validRange(start, end)) settings.semesterEnd = end;
            else warnings.push('settings: the semester end date is not usable and was left as it was.');
          }
        }
        /* v0.5: a backup restores the person's choices too (name, theme, pen, paper, sounds, reminders…).
           Only keys this build knows, each with the type its default has, so a file can neither inject
           a key nothing reads nor turn a toggle into text. Bookkeeping that belongs to the phone that
           wrote the file (the sample stamp, the tour version) never travels. */
        for (const [k, dflt] of Object.entries(DEFAULT_SETTINGS)) {
          if (k === 'semesterStart' || k === 'semesterEnd' || k === 'seededAt' || !(k in raw.settings)) continue;
          const v = raw.settings[k];
          if (sameShape(v, dflt)) (settings as Record<string, unknown>)[k] = k === 'notif' ? { ...(dflt as object), ...(v as object) } : v;
          else warnings.push(`settings.${k}: not the kind of value this setting takes; the phone's own was kept.`);
        }
        /* v0.7 R2: one-week class moves live in the settings (`settings.moves`, not a default key), so they are read
           here: each with its ids, YYYY-MM-DD dates and HH:MM times, or it is left out with a warning. */
        if (Array.isArray(raw.settings.moves)) {
          const hm = (x: unknown) => typeof x === 'string' && /^\d{2}:\d{2}$/.test(x);
          const ok = raw.settings.moves.filter((v): v is { id: string; meetingId: string; date: string; to: string; start: string; end: string } =>
            isRec(v) && !!nonEmpty(v.id) && !!nonEmpty(v.meetingId) && typeof v.date === 'string' && isYmd(v.date) && typeof v.to === 'string' && isYmd(v.to) && hm(v.start) && hm(v.end));
          if (ok.length < raw.settings.moves.length) warnings.push(`settings.moves: ${raw.settings.moves.length - ok.length} class move(s) could not be read and were left out.`);
          if (ok.length) settings.moves = ok.map((v) => ({ id: v.id, meetingId: v.meetingId, date: v.date, to: v.to, start: v.start, end: v.end }));
        }
        if (settings.name) profileName = settings.name;
      }
    }

    /* v0.5: study history, commutes and alarms come back too, so an export is a whole backup. A row is
       taken as the export wrote it when every field it needs reads; anything else is one problem. */
    const focusRows = asRows(raw.focus, 'focus');
    reads('focus', focusRows.length);
    for (const [i, row] of focusRows.entries()) {
      const at = `focus[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      const id = nonEmpty(row.id), startedAt = num(row.startedAt), endedAt = num(row.endedAt);
      if (!id || startedAt === null || endedAt === null) { problem(at, 'row', 'A focus session needs its id, start and end.'); continue; }
      focus.set(id, {
        id, taskId: nonEmpty(row.taskId), courseId: nonEmpty(row.courseId), startedAt, endedAt,
        focusSec: int(row.focusSec, 0), breakSec: int(row.breakSec, 0), overSec: int(row.overSec, 0), rounds: int(row.rounds, 1),
        planMin: int(row.planMin, 25), mode: str(row.mode) ?? 'focus', completed: bool(row.completed, false), demo: bool(row.demo, false),
      });
    }
    const tripRows = asRows(raw.trips, 'trips');
    reads('trips', tripRows.length);
    for (const [i, row] of tripRows.entries()) {
      const at = `trips[${i}]`, id = isRec(row) ? nonEmpty(row.id) : null, startedAt = isRec(row) ? num(row.startedAt) : null;
      if (!isRec(row) || !id || startedAt === null) { problem(at, 'row', 'A trip needs its id and start.'); continue; }
      trips.set(id, { id, startedAt, endedAt: num(row.endedAt), route: str(row.route) ?? '', note: str(row.note) ?? '' });
    }
    const alarmRows = asRows(raw.alarms, 'alarms');
    reads('alarms', alarmRows.length);
    for (const [i, row] of alarmRows.entries()) {
      const at = `alarms[${i}]`, id = isRec(row) ? nonEmpty(row.id) : null, when = isRec(row) ? num(row.at) : null;
      if (!isRec(row) || !id || when === null) { problem(at, 'row', 'An alarm needs its id and time.'); continue; }
      alarms.set(id, { id, at: when, label: str(row.label) ?? '', enabled: bool(row.enabled, true), kind: str(row.kind) ?? 'leave', taskId: nonEmpty(row.taskId) });
    }
  }

  /* ── shape B: the compact shape an AI writes ──────────────────────────────────────────────────── */
  function readCompact(obj: Rec) {
    /* Existing subjects first, so a file that names "DB Systems" lands its tasks on the subject the
       user already has instead of creating a second one. */
    const byName = new Map<string, string>();
    for (const c of opts.courses ?? []) byName.set(c.name.trim().toLowerCase(), c.id);

    if (obj.profileName !== undefined) {
      if (typeof obj.profileName !== 'string') problem('file', 'profileName', 'The profile name must be text.');
      else if (obj.profileName.trim()) { profileName = obj.profileName.trim(); settings = { ...settings, name: profileName }; }
    }

    const courseOf = (row: Rec, at: string): string | null => {
      const name = nonEmpty(row.name);
      if (!name) { problem(at, 'name', 'A course needs a name.'); return null; }
      const key = name.toLowerCase();
      /* Which row this is, the CSV door's own order: an explicit id is the file's claim about the
         row, so it is resolved against the phone first; the name second. */
      const rowId = nonEmpty(row.id);
      const existing = (rowId ? existingById.get(rowId)?.id : undefined) ?? byName.get(key);
      if (existing) {
        if (courses.has(existing)) duplicate(`the course "${name}"`, at);
        const phoneRow = existingById.get(existing);
        if (phoneRow) {
          /* Field-level merge, the CSV door's rule: a field the row carries overwrites the phone's
             value; one it leaves out — or leaves empty — keeps it. `goal`, `sort` and `demo` are
             not shape-B fields and live only in the spread, so none of them can be reset from the
             file. The merged row lands in the plan, so the counts call it what it is — an update —
             instead of reading as a row the import skipped. */
          courses.set(existing, {
            ...phoneRow,
            name,
            rooms: roomsIn(row) ?? phoneRow.rooms,
            teacher: nonEmpty(row.teacher) ?? phoneRow.teacher,
          });
        } else {
          /* A duplicate named in this file only (the phone was not handed in): the later row wins,
             exactly as it always has. */
          courses.set(existing, { ...(courses.get(existing) as Course), name, rooms: roomsIn(row) ?? [], teacher: str(row.teacher) ?? '' });
        }
        byName.set(key, existing); /* a row that renames the subject by id keeps its own name resolvable */
        return existing;
      }
      const id = rowId ?? derived('course', key);
      courses.set(id, { id, name, rooms: roomsIn(row) ?? [], teacher: str(row.teacher) ?? '', goal: null, sort: courses.size, demo: false, bar: null });
      byName.set(key, id);
      return id;
    };

    const compactCourses = asRows(obj.courses, 'courses');
    reads('courses', compactCourses.length);
    for (const [i, row] of compactCourses.entries()) {
      const at = `courses[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'name', 'room', 'rooms', 'teacher', 'meetings', 'variants'], at);
      const courseId = courseOf(row, at);
      if (!courseId) continue;
      const variantList = asRows(row.variants, `${at}.variants`);
      reads('variants', variantList.length);
      for (const [j, v] of variantList.entries()) {
        const vAt = `${at}.variants[${j}]`;
        if (!isRec(v)) { problem(vAt, 'row', 'Expected an object.'); continue; }
        unknownKeys(v, ['id', 'name', 'room', 'teacher', 'note'], vAt);
        const name = nonEmpty(v.name);
        if (!name) { problem(vAt, 'name', 'A variant needs a name.'); continue; }
        const id = nonEmpty(v.id) ?? derived('variant', `${courseId}|${name.toLowerCase()}`);
        if (variantRows.has(id)) duplicate('this variant', vAt);
        variantRows.set(id, { id, subjectId: courseId, name, room: str(v.room) ?? '', teacher: str(v.teacher) ?? '', note: str(v.note) ?? '', ord: j });
      }
      const meetingList = asRows(row.meetings, `${at}.meetings`);
      reads('meetings', meetingList.length);
      for (const [j, m] of meetingList.entries()) {
        const mAt = `${at}.meetings[${j}]`;
        if (!isRec(m)) { problem(mAt, 'row', 'Expected an object.'); continue; }
        unknownKeys(m, ['id', 'weekday', 'start', 'end'], mAt);
        const weekday = num(m.weekday);
        if (weekday === null || weekday < 0 || weekday > 6) { problem(mAt, 'weekday', 'weekday must be 0 (Mon) … 6 (Sun).'); continue; }
        const start = clock(m.start), end = clock(m.end);
        if (!start || !end) { problem(mAt, start ? 'end' : 'start', 'Times are 24-hour "HH:MM".'); continue; }
        const id = nonEmpty(m.id) ?? derived('meeting', `${courseId}|${weekday}|${start}`);
        if (meetings.has(id)) duplicate('this class', mAt);
        meetings.set(id, { id, courseId, weekday: Math.round(weekday), start, end, demo: false });
      }
    }

    const dayList = asRows(obj.days, 'days');
    reads('dayMarks', dayList.length);
    for (const [i, row] of dayList.entries()) {
      const at = `days[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['date', 'status', 'reason', 'why'], at);
      const date = nonEmpty(row.date);
      if (!isYmd(date)) { problem(at, 'date', 'A day needs a YYYY-MM-DD date.'); continue; }
      const status = dayStatus(row.status);
      if (!status) { problem(at, 'status', statusProblem()); continue; }
      if (dayMarks.has(date)) duplicate(`the day mark for ${date}`, at);
      dayMarks.set(date, { date, status, at: now, reason: str(row.reason) ?? '', ...W(whyIn(status, row.status, row.why)) });
    }

    const compactAttendance = asRows(obj.attendance, 'attendance');
    reads('attendance', compactAttendance.length);
    for (const [i, row] of compactAttendance.entries()) {
      const at = `attendance[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['key', 'date', 'course', 'start', 'status', 'reason', 'at', 'why'], at);
      const date = nonEmpty(row.date);
      if (!isYmd(date)) { problem(at, 'date', 'Use YYYY-MM-DD.'); continue; }
      const start = clock(row.start);
      if (!start) { problem(at, 'start', 'Times are 24-hour "HH:MM".'); continue; }
      const key = nonEmpty(row.course)?.toLowerCase();
      const courseId = key ? byName.get(key) : undefined;
      if (!courseId) { problem(at, 'course', `No course called "${String(row.course ?? '')}" in this file or on the phone.`); continue; }
      const status = attStatus(row.status);
      if (!status) {
        /* The CSV door's rule: a class that has not happened yet carries no mark — the file says
           `null` (the JSON spelling of the export's `upcoming`), or the word itself, or leaves the
           status out — so there is nothing to write and the row is a skip, never a problem that
           disables Import for data this app itself can produce. Any other unreadable status
           ("maybe", a number) is still refused: a typo must be named, not silently dropped. */
        if (row.status === null || row.status === undefined || row.status === '' || isUpcoming(row.status)) continue;
        problem(at, 'status', `status must be one of ${ATT_STATUS.join(', ')}.`);
        continue;
      }
      const k = nonEmpty(row.key) ?? occKey(date, { start, courseId });
      if (attendance.has(k)) duplicate('this attendance mark', at);
      /* A mark the phone already has is merged, not replaced (round 5): its `at` stamp — when the
         class was actually marked — and its reason survive a row that does not carry them, and a
         row may provide `at` itself. A new occurrence still defaults to this import's clock. */
      const existing = opts.attendance?.[k];
      const fileAt = row.at === undefined || row.at === null ? null : parseWhen(row.at);
      if (row.at !== undefined && row.at !== null && fileAt === null) {
        problem(at, 'at', 'Use milliseconds, an ISO date, or YYYY-MM-DDTHH:mm.');
        continue;
      }
      attendance.set(k, existing
        ? { ...noWhy(existing), status, at: fileAt ?? existing.at, reason: nonEmpty(row.reason) ?? existing.reason, ...W(whyIn(status, row.status, row.why)) }
        : { key: k, status, at: fileAt ?? now, reason: str(row.reason) ?? '', ...W(whyIn(status, row.status, row.why)) });
    }

    const compactTasks = asRows(obj.tasks, 'tasks');
    reads('tasks', compactTasks.length);
    for (const [i, row] of compactTasks.entries()) {
      const at = `tasks[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'title', 'course', 'due', 'start', 'kind', 'notes'], at);
      const title = nonEmpty(row.title);
      if (!title) { problem(at, 'title', 'A task needs a title.'); continue; }
      let courseId: string | null = null;
      if (row.course !== undefined && row.course !== null && row.course !== '') {
        const key = nonEmpty(row.course)?.toLowerCase();
        courseId = key ? byName.get(key) ?? null : null;
        if (!courseId) { problem(at, 'course', `No course called "${String(row.course)}" in this file or on the phone.`); continue; }
      }
      const dueAt = row.due === undefined || row.due === null ? null : parseWhen(row.due);
      if (row.due !== undefined && row.due !== null && dueAt === null) { problem(at, 'due', 'Use ISO or YYYY-MM-DDTHH:mm.'); continue; }
      const startAt = row.start === undefined || row.start === null ? null : parseWhen(row.start);
      if (row.start !== undefined && row.start !== null && startAt === null) { problem(at, 'start', 'Use ISO or YYYY-MM-DDTHH:mm.'); continue; }
      const kind = TASK_KINDS.find((k) => k === row.kind) ?? 'other';
      if (row.kind !== undefined && !TASK_KINDS.some((k) => k === row.kind)) warnings.push(`${at}: "${String(row.kind)}" is not a task kind; it was imported as "other".`);
      const id = nonEmpty(row.id) ?? derived('task', `${title}|${courseId ?? ''}|${dueAt ?? ''}`);
      if (tasks.has(id)) duplicate('this task', at);
      tasks.set(id, { id, title, courseId, kind, dueAt, startAt, estimateMin: null, priority: 0, notes: str(row.notes) ?? '', status: 0, createdAt: now, completedAt: null, reminders: [], subtasks: [], demo: false });
    }

    const compactMarks = asRows(obj.marks, 'marks');
    reads('marks', compactMarks.length);
    for (const [i, row] of compactMarks.entries()) {
      const at = `marks[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'course', 'name', 'score', 'weight'], at);
      const name = nonEmpty(row.name);
      if (!name) { problem(at, 'name', 'A mark needs a name.'); continue; }
      const key = nonEmpty(row.course)?.toLowerCase();
      const courseId = key ? byName.get(key) : undefined;
      if (!courseId) { problem(at, 'course', `No course called "${String(row.course ?? '')}" in this file or on the phone.`); continue; }
      const id = nonEmpty(row.id) ?? derived('mark', `${courseId}|${name}`);
      if (marks.has(id)) duplicate('this mark', at);
      marks.set(id, { id, courseId, name, score: num(row.score), weight: num(row.weight) ?? 0, on: true, sort: marks.size, demo: false });
    }

    if (obj.semester !== undefined) {
      if (!isRec(obj.semester)) problem('semester', 'value', 'Expected an object with a start and, optionally, an end.');
      else {
        unknownKeys(obj.semester, ['start', 'end'], 'semester');
        const start = nonEmpty(obj.semester.start);
        if (!isYmd(start)) problem('semester', 'start', 'Use YYYY-MM-DD.');
        else {
          const end = str(obj.semester.end)?.trim() ?? '';
          if (end && !isYmd(end)) problem('semester', 'end', 'Use YYYY-MM-DD, or leave it out for no end date.');
          else if (!validRange(start, end)) problem('semester', 'end', 'The end date is before the start.');
          else settings = { ...settings, semesterStart: start, semesterEnd: end };
        }
      }
    }
  }
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
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
function datasetCounts(
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
function entriesOf(v: unknown): [string, unknown][] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((row, i) => [String(i), row]);
  if (isRec(v)) return Object.entries(v);
  return [];
}

/* ── CSV: one table in, the same plan shape out ────────────────────────────────────────────────────
 *
 * A CSV is one table, not a whole file, so the planner takes the table and says which one it is rather
 * than guessing from the name. The column names are the export's own (`toCsv` in `services/export.ts`
 * writes `date,course,start,status,source` for Attendance, and so on), so a table this app exported can
 * be imported back — the columns that hold a *derived* value (`total`, `source`, `on time`, `marked at`)
 * are known and skipped silently; a column nothing knows is one warning, once.
 *
 * Every failure is a `Problem` on the row's own line number, and the rows that could be read still
 * land: a CSV is the format people hand-edit, so one bad cell must not throw away the rest of a term.
 */

const normHeader = (h: string) => h.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');

interface CsvSpec {
  /** Logical column → the names it may arrive under, first match wins. */
  cols: Record<string, readonly string[]>;
  /** Columns the export writes that this import does not need back: read, not warned about. */
  ignored?: readonly string[];
}

const CSV_SPEC: Record<DatasetKind, CsvSpec> = {
  courses: { cols: { id: ['id'], name: ['name', 'subject'], room: ['room'], teacher: ['teacher'], goal: ['goal', 'target'] }, ignored: ['total'] },
  timetable: { cols: { course: ['course', 'subject'], variant: ['variant', 'group'], weekday: ['weekday', 'day'], start: ['start', 'from'], end: ['end', 'to'], room: ['room'] } },
  attendance: { cols: { date: ['date'], course: ['course', 'subject'], start: ['start'], status: ['status'], reason: ['reason'] }, ignored: ['source'] },
  dayMarks: { cols: { date: ['date'], status: ['status'], reason: ['reason'] }, ignored: ['marked at'] },
  tasks: {
    cols: { id: ['id'], title: ['title', 'task'], course: ['course', 'subject'], kind: ['kind'], due: ['due'], start: ['start'], estimateMin: ['estimate min', 'estimate'], priority: ['priority'], status: ['status'], notes: ['notes'] },
    ignored: ['created', 'completed', 'on time'],
  },
  marks: { cols: { course: ['course', 'subject'], variant: ['variant', 'group'], name: ['item', 'name', 'mark'], score: ['score'], weight: ['weight'], on: ['counted', 'on'] } },
};
/** Every table a CSV may be, in the order the sheet offers them. */
export const DATASETS = Object.keys(CSV_SPEC) as DatasetKind[];
const WEEKDAY_WORDS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const TASK_STATUS_WORDS = ['open', 'in progress', 'done'];

/** Cells addressed by their logical name; `''` when the file has no such column. */
type Cells = (row: readonly string[], key: string) => string;

function columns(header: readonly string[], kind: DatasetKind, warnings: string[]): Cells {
  const spec = CSV_SPEC[kind];
  const at = new Map<string, number>();
  header.forEach((h, i) => { const n = normHeader(h); if (n && !at.has(n)) at.set(n, i); });
  const index: Record<string, number> = {};
  const used = new Set<number>();
  for (const [key, names] of Object.entries(spec.cols)) {
    const i = names.map((n) => at.get(n)).find((x) => x !== undefined);
    if (i !== undefined) { index[key] = i; used.add(i); }
  }
  header.forEach((h, i) => {
    const n = normHeader(h);
    if (used.has(i) || !n || spec.ignored?.includes(n)) return;
    warnings.push(`"${h.trim()}" is not imported and was ignored.`);
  });
  return (row, key) => { const i = index[key]; return i === undefined ? '' : (row[i] ?? '').trim(); };
}

/** `0`…`6`, or the English day name the export writes (`Mon`…`Sun`). Null when it is neither. */
function weekdayCell(v: string): number | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (/^[0-6]$/.test(s)) return Number(s);
  const i = WEEKDAY_WORDS.findIndex((d) => s.startsWith(d));
  return i < 0 ? null : i;
}

/** A blank cell is null (the row simply does not say); a non-number is a warning, not a problem —
 *  a target of "high" is a value the person can fix in the app, and it must not block the term. */
function numberOf(v: string, warnings: string[], at: string, field: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) { warnings.push(`${at}: ${field} "${s}" is not a number and was ignored.`); return null; }
  return n;
}

function statusCell(v: string, warnings: string[], at: string): 0 | 1 | 2 {
  const s = v.trim().toLowerCase();
  const i = TASK_STATUS_WORDS.indexOf(s);
  if (i >= 0) return i as 0 | 1 | 2;
  if (s === '0' || s === '1' || s === '2') return Number(s) as 0 | 1 | 2;
  if (s) warnings.push(`${at}: "${v.trim()}" is not a task status; it was imported as open.`);
  return 0;
}

function countedCell(v: string, warnings: string[], at: string): boolean {
  const s = v.trim().toLowerCase();
  if (!s || s === 'true' || s === 'yes' || s === '1' || s === 'counted' || s === 'on') return true;
  if (s === 'false' || s === 'no' || s === '0' || s === 'off') return false;
  warnings.push(`${at}: "counted" is "${v.trim()}", which is neither yes nor no; the mark counts.`);
  return true;
}

/** Which table a header names, when it names one plainly: `weekday,start,end` is a timetable,
 *  `title` is tasks, `date,status,course` is attendance. A header that could be more than one table —
 *  `course,name,score` reads as either subjects or marks — returns null, and `planCsv` then asks. */
export function detectDataset(header: readonly string[]): DatasetKind | null {
  const keys = new Set(header.map(normHeader));
  if (keys.has('weekday') && keys.has('start')) return 'timetable';
  if (keys.has('title')) return 'tasks';
  if (keys.has('date') && keys.has('status')) return keys.has('course') || keys.has('subject') ? 'attendance' : 'dayMarks';
  if (keys.has('item') && keys.has('score')) return 'marks';
  if (keys.has('name') && (keys.has('room') || keys.has('teacher') || keys.has('goal'))) return 'courses';
  return null;
}

/**
 * One CSV table as a plan. `dataset` is explicit because one CSV is one table, and some headers are
 * genuinely two tables (`course,name,score` is either a subject list or a marks list). The sheet asks
 * the person, and this function refuses to guess: with no dataset it returns the problem asking for one.
 */
export function planCsv(
  header: readonly string[], rows: readonly (readonly string[])[], dataset: DatasetKind | undefined, opts: ImportOptions = {},
): ImportPlan {
  const now = opts.now ?? Date.now();
  const problems: Problem[] = [];
  const warnings: string[] = [];
  const problem = (where: string, field: string, message: string) => { problems.push({ where, field, message }); };
  const snapshot: Partial<Snapshot> = {};
  const counts: Record<string, number> = {};
  const plan: ImportPlan = { snapshot, counts, breakdown: {}, problems, warnings };

  if (!header.length) { problem('file', 'text', 'That CSV is empty.'); return plan; }
  if (!dataset) {
    problem('file', 'dataset', `This CSV could be more than one table; say which one it is: ${DATASETS.join(', ')}.`);
    return plan;
  }

  /* One CSV is one table: every non-ragged row is read, and the ones the branch does not write become
     the preview's `skip` (a not-yet-happened attendance row, a duplicate natural key). */
  const read: Record<string, number> = { [dataset]: rows.length };
  const col = columns(header, dataset, warnings);
  const phone = new Map<string, string>();
  const existingById = new Map<string, Course>();
  const taskById = new Map((opts.tasks ?? []).map((t) => [t.id, t]));
  const markById = new Map((opts.marks ?? []).map((m) => [m.id, m]));
  for (const c of opts.courses ?? []) { phone.set(c.name.trim().toLowerCase(), c.id); existingById.set(c.id, c); }
  const courseIdOf = (name: string) => (name ? phone.get(name.trim().toLowerCase()) ?? null : null);
  const missingCourse = (name: string) => `No subject called "${name}" on the phone; import the Subjects table first.`;
  /** A variant named in a CSV cell, under its subject, by name (case-insensitive). An empty cell is "the
   *  subject itself"; a name the phone does not have is a warning and the row lands on the subject. */
  const variantIdOf = (courseId: string, name: string, at: string): string | null => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    const v = (opts.variants ?? []).find((x) => x.subjectId === courseId && x.name.trim().toLowerCase() === n);
    if (!v) warnings.push(`${at}: no variant called "${name}" under that subject; the row was put on the subject itself.`);
    return v?.id ?? null;
  };

  /** Every row, with the line number a spreadsheet shows; a row that is not as wide as the header is
   *  reported and skipped rather than padded, because padding would invent values. */
  const each = (fn: (row: readonly string[], i: number, at: string) => void) => {
    rows.forEach((row, i) => {
      const at = `line ${i + 2}`;
      if (row.length !== header.length) { problem(at, 'row', `Expected ${header.length} fields, found ${row.length}.`); return; }
      fn(row, i, at);
    });
  };

  switch (dataset) {
    case 'courses': {
      const out = new Map<string, Course>();
      each((row, i, at) => {
        const name = col(row, 'name');
        if (!name) { problem(at, 'name', 'A subject needs a name.'); return; }
        /* Resolve the name against the subjects already on the phone, exactly as the JSON shape does:
           a hand-written Subjects table naming "DB Systems" must update that subject, not add a second
           one under `imp-course-…`. An explicit id still wins — it is the file's own claim about which
           row this is. */
        const id = col(row, 'id') || courseIdOf(name) || derived('course', name.toLowerCase());
        if (out.has(id)) warnings.push(`${at}: this subject is listed twice; the later row wins.`);
        /* Field-level merge for a subject the phone already has: a column the CSV does not carry — or
           an empty cell — keeps the existing value. `goal` uses the same rule when the cell is not a
           number. `sort` and `demo` are not CSV columns at all, so the spread keeps the user's order
           instead of re-numbering their subjects from this file's row order. A NEW subject still takes
           the columns exactly as written. */
        const phoneRow = existingById.get(id);
        out.set(id, phoneRow ? {
          ...phoneRow,
          name,
          rooms: col(row, 'room') ? splitRooms(col(row, 'room')) : phoneRow.rooms,
          teacher: col(row, 'teacher') || phoneRow.teacher,
          goal: numberOf(col(row, 'goal'), warnings, at, 'goal') ?? phoneRow.goal,
        } : {
          id, name, rooms: splitRooms(col(row, 'room')), teacher: col(row, 'teacher'),
          goal: numberOf(col(row, 'goal'), warnings, at, 'goal'), sort: i, demo: false, bar: null,
        });
      });
      if (out.size) { snapshot.courses = [...out.values()]; counts.courses = out.size; }
      break;
    }

    case 'timetable': {
      const out = new Map<string, Meeting>();
      each((row, _i, at) => {
        const course = col(row, 'course');
        if (!course) { problem(at, 'course', 'A class needs the subject it belongs to.'); return; }
        const courseId = courseIdOf(course);
        if (!courseId) { problem(at, 'course', missingCourse(course)); return; }
        const weekday = weekdayCell(col(row, 'weekday'));
        if (weekday === null) { problem(at, 'weekday', 'weekday must be 0 (Mon) … 6 (Sun), or a day name.'); return; }
        const start = clock(col(row, 'start')), end = clock(col(row, 'end'));
        if (!start || !end) { problem(at, !start ? 'start' : 'end', 'Times are 24-hour "HH:MM".'); return; }
        const variantId = variantIdOf(courseId, col(row, 'variant'), at);
        const id = derived('meeting', `${courseId}${variantId ? `~${variantId}` : ''}|${weekday}|${start}`);
        if (out.has(id)) warnings.push(`${at}: this class is listed twice; the later row wins.`);
        out.set(id, { id, courseId, weekday, start, end, demo: false, variantId, room: col(row, 'room') || null });
      });
      if (out.size) { snapshot.meetings = [...out.values()]; counts.meetings = out.size; }
      break;
    }

    case 'attendance': {
      const out = new Map<string, AttRecord>();
      each((row, _i, at) => {
        const date = col(row, 'date');
        if (!isYmd(date)) { problem(at, 'date', 'Use YYYY-MM-DD.'); return; }
        const start = clock(col(row, 'start'));
        if (!start) { problem(at, 'start', 'Times are 24-hour "HH:MM".'); return; }
        const course = col(row, 'course');
        const courseId = courseIdOf(course);
        if (!courseId) { problem(at, 'course', missingCourse(course)); return; }
        const statusCell = col(row, 'status');
        if (isUpcoming(statusCell)) return; // not written: the class has not finished, so there is no mark to record
        const key = occKey(date, { start, courseId });
        if (out.has(key)) warnings.push(`${at}: this attendance mark is listed twice; the later row wins.`);
        /* Merge over the mark already on the phone: an empty status/reason keeps what is there, and the
           `at` stamp (not a CSV column) is never reset to this import's clock. */
        const existing = opts.attendance?.[key];
        const status = statusCell ? attStatus(statusCell) : existing?.status;
        if (!status) { problem(at, 'status', `status must be one of ${ATT_STATUS.join(', ')}.`); return; }
        const why = statusCell ? whyIn(status, statusCell, col(row, 'why')) : existing?.why ?? '';
        out.set(key, existing
          ? { ...noWhy(existing), status, reason: col(row, 'reason') || existing.reason, ...W(why) }
          : { key, status, at: now, reason: col(row, 'reason'), ...W(why) });
      });
      if (out.size) { snapshot.attendance = Object.fromEntries(out); counts.attendance = out.size; plan.attendance = [...out.values()]; }
      break;
    }

    case 'dayMarks': {
      const out = new Map<string, DayMark>();
      each((row, _i, at) => {
        const date = col(row, 'date');
        if (!isYmd(date)) { problem(at, 'date', 'Use YYYY-MM-DD.'); return; }
        if (out.has(date)) warnings.push(`${at}: the day mark for ${date} is listed twice; the later row wins.`);
        /* Same field-level merge: an empty status/reason keeps the phone's day mark, and `at` stays. */
        const existing = opts.dayMarks?.[date];
        const statusCell = col(row, 'status');
        const status = statusCell ? dayStatus(statusCell) : existing?.status;
        if (!status) { problem(at, 'status', statusProblem()); return; }
        const why = statusCell ? whyIn(status, statusCell, col(row, 'why')) : existing?.why ?? '';
        out.set(date, existing
          ? { ...noWhy(existing), status, reason: col(row, 'reason') || existing.reason, ...W(why) }
          : { date, status, at: now, reason: col(row, 'reason'), ...W(why) });
      });
      if (out.size) { snapshot.dayMarks = Object.fromEntries(out); counts.dayMarks = out.size; }
      break;
    }

    case 'tasks': {
      const out = new Map<string, Task>();
      each((row, _i, at) => {
        const titleCell = col(row, 'title');
        const explicitId = col(row, 'id');
        const preexisting = explicitId ? taskById.get(explicitId) : undefined;
        /* An empty title cell keeps the phone's title when the row names a task that exists; with no
           title and no existing row there is nothing to identify it by. */
        const title = titleCell || preexisting?.title || '';
        if (!title) { problem(at, 'title', 'A task needs a title.'); return; }
        const course = col(row, 'course');
        const courseId = course ? courseIdOf(course) : null;
        if (course && !courseId) { problem(at, 'course', missingCourse(course)); return; }
        const due = col(row, 'due'), dueAt = due ? parseWhen(due) : null;
        if (due && dueAt === null) { problem(at, 'due', 'Use ISO or YYYY-MM-DDTHH:mm.'); return; }
        const start = col(row, 'start'), startAt = start ? parseWhen(start) : null;
        if (start && startAt === null) { problem(at, 'start', 'Use ISO or YYYY-MM-DDTHH:mm.'); return; }
        const kindCell = col(row, 'kind').toLowerCase();
        const kind = TASK_KINDS.find((k) => k === kindCell) ?? 'other';
        if (kindCell && !TASK_KINDS.some((k) => k === kindCell)) warnings.push(`${at}: "${col(row, 'kind')}" is not a task kind; it was imported as "other".`);
        const id = explicitId || derived('task', `${title}|${courseId ?? ''}|${dueAt ?? ''}`);
        if (out.has(id)) warnings.push(`${at}: this task is listed twice; the later row wins.`);
        const existing = preexisting ?? taskById.get(id);
        if (existing) {
          /* Field-level merge (D11): every field this row does not carry — `createdAt`,
             `completedAt`, `reminders`, `subtasks`, the notes and the estimate — keeps the phone's
             value. An empty cell counts as not carried, so a title-only row cannot reset a task. */
          const notes = col(row, 'notes');
          const estimateCell = col(row, 'estimateMin');
          const priorityCell = col(row, 'priority');
          const statusRaw = col(row, 'status');
          out.set(id, {
            ...existing,
            title,
            courseId: course ? courseId : existing.courseId,
            kind: kindCell ? kind : existing.kind,
            dueAt: due ? dueAt : existing.dueAt,
            startAt: start ? startAt : existing.startAt,
            estimateMin: estimateCell ? numberOf(estimateCell, warnings, at, 'estimate') ?? existing.estimateMin : existing.estimateMin,
            priority: priorityCell
              ? clampInt(numberOf(priorityCell, warnings, at, 'priority') ?? existing.priority, 0, 3, 0) as 0 | 1 | 2 | 3
              : existing.priority,
            notes: notes || existing.notes,
            status: statusRaw ? statusCell(statusRaw, warnings, at) : existing.status,
          });
          return;
        }
        out.set(id, {
          id, title, courseId, kind, dueAt, startAt,
          estimateMin: numberOf(col(row, 'estimateMin'), warnings, at, 'estimate'),
          priority: clampInt(numberOf(col(row, 'priority'), warnings, at, 'priority'), 0, 3, 0) as 0 | 1 | 2 | 3,
          notes: col(row, 'notes'), status: statusCell(col(row, 'status'), warnings, at),
          createdAt: now, completedAt: null, reminders: [], subtasks: [], demo: false,
        });
      });
      if (out.size) { snapshot.tasks = [...out.values()]; counts.tasks = out.size; plan.tasks = [...out.values()]; }
      break;
    }

    case 'marks': {
      const out = new Map<string, Mark>();
      each((row, _i, at) => {
        const course = col(row, 'course');
        const courseId = courseIdOf(course);
        const name = col(row, 'name');
        if (!name) { problem(at, 'name', 'A mark needs a name.'); return; }
        if (!courseId) { problem(at, 'course', missingCourse(course)); return; }
        const id = derived('mark', `${courseId}|${name}`);
        const variantId = variantIdOf(courseId, col(row, 'variant'), at);
        if (out.has(id)) warnings.push(`${at}: this mark is listed twice; the later row wins.`);
        const existing = markById.get(id);
        if (existing) {
          /* Same field-level merge: an empty score, weight or counted cell keeps the phone's mark,
             and its place in the list (`sort`) and `demo` flag stay as the phone had them. */
          const scoreCell = col(row, 'score');
          const weightCell = col(row, 'weight');
          const onCell = col(row, 'on');
          out.set(id, {
            ...existing, courseId, name, variantId: col(row, 'variant') ? variantId : existing.variantId ?? null,
            score: (scoreCell ? numberOf(scoreCell, warnings, at, 'score') : existing.score),
            weight: (weightCell ? numberOf(weightCell, warnings, at, 'weight') ?? existing.weight : existing.weight),
            on: onCell ? countedCell(onCell, warnings, at) : existing.on,
          });
          return;
        }
        out.set(id, {
          id, courseId, name, score: numberOf(col(row, 'score'), warnings, at, 'score'),
          weight: numberOf(col(row, 'weight'), warnings, at, 'weight') ?? 0,
          on: countedCell(col(row, 'on'), warnings, at), sort: out.size, demo: false, variantId,
        });
      });
      if (out.size) { snapshot.marks = [...out.values()]; counts.marks = out.size; plan.marks = [...out.values()]; }
      break;
    }
  }

  plan.breakdown = datasetCounts(snapshot, read, counts, opts);
  return plan;
}

/**
 * The format a file or pasted text is, decided by the extension first and by content second: a name the
 * phone gave us is the strongest signal, and without one, JSON announces itself with a brace while CSV
 * is two lines that declare the same number of fields. Anything else is `unknown` — the plan says so
 * rather than trying to read it as one of the two.
 */
export function detectImportFormat(name: string | undefined, text: string): 'json' | 'csv' | 'unknown' {
  const ext = /\.([a-z0-9]+)$/i.exec(name?.trim() ?? '')?.[1]?.toLowerCase();
  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  const t = text.trim();
  if (!t) return 'unknown';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  const table = parseCsv(t);
  const first = table.rows[0];
  if (table.header.length > 1 && first && first.length === table.header.length) return 'csv';
  return 'unknown';
}

/** One entry point for both doors: a picked file's name and text, or pasted text with no name. */
export function parseImportFile(name: string | undefined, text: string, opts: ImportOptions = {}): ImportPlan {
  const format = detectImportFormat(name, text);
  if (format === 'json') return parseImport(text, opts);
  if (format === 'csv') {
    const table = parseCsv(text);
    return planCsv(table.header, table.rows, detectDataset(table.header) ?? undefined, opts);
  }
  return {
    snapshot: {}, counts: {}, breakdown: {}, warnings: [],
    problems: [{ where: 'file', field: 'format', message: `${name?.trim() || 'That file'} is not a JSON or CSV file.` }],
  };
}
