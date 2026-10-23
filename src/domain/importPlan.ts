import type {
  AttRecord, AttStatus, Course, DayMark, DayStatus, Mark, Meeting, Notice, Settings, Snapshot, Task, TaskKind,
} from './types';
import { ST } from './attendance';
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
export interface ImportPlan {
  snapshot: Partial<Snapshot>;
  counts: Record<string, number>;
  problems: Problem[];
  warnings: string[];
}
export interface ImportOptions {
  /** The courses already on this phone. A compact file's course name is resolved against these
   *  case-insensitively, so an import adds a term's tasks to subjects the user already has instead
   *  of duplicating them under new ids. */
  courses?: readonly Course[];
  now?: number;
}

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown, dflt: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : dflt);
const bool = (v: unknown, dflt: boolean): boolean => (typeof v === 'boolean' ? v : dflt);
const nonEmpty = (v: unknown): string | null => { const s = str(v)?.trim(); return s ? s : null; };

/** The statuses a day mark can hold, and the words the app prints for them (`ST`). The brief's prose
 *  says "(`cancelled`, `holiday`, …)"; `domain/types.ts` has no `holiday` — it is a *reason* on a
 *  cancelled day, not a status — so both the letters and the printed words are accepted, and nothing
 *  outside the type is invented. */
const DAY_STATUS: DayStatus[] = ['p', 'a', 's', 'c'];
const ATT_STATUS: AttStatus[] = ['p', 'l', 'n', 'a', 's', 'c', 't'];
const TASK_KINDS: TaskKind[] = ['assignment', 'exam', 'reading', 'project', 'lab', 'deadline', 'other'];

function dayStatus(v: unknown): DayStatus | null {
  const s = str(v)?.trim().toLowerCase();
  if (!s) return null;
  return DAY_STATUS.find((k) => k === s) ?? DAY_STATUS.find((k) => ST[k].toLowerCase() === s) ?? null;
}
const statusProblem = () => `status must be one of ${DAY_STATUS.join(', ')} — or ${DAY_STATUS.map((k) => ST[k]).join(', ')}.`;

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
const A_KEYS = new Set(['app', 'version', 'exportedAt', 'raw', 'Summary', 'Courses', 'Timetable', 'Attendance', 'Day marks', 'Tasks', 'Subtasks', 'Reminders', 'Notices', 'Marks', 'Focus sessions', 'Trips', 'Alarms', 'Settings']);
const B_KEYS = new Set(['app', 'version', 'exportedAt', 'semester', 'courses', 'days', 'tasks', 'marks']);

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
  let settings: Partial<Settings> = {};

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

  /* ── read the envelope ───────────────────────────────────────────────────────────────────────── */
  if (!text.trim()) {
    problem('file', 'text', 'Paste the JSON first.');
    return { snapshot: {}, counts: {}, problems, warnings };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch (e) {
    problem('file', 'json', `That is not valid JSON: ${String((e as Error)?.message ?? e).slice(0, 80)}`);
    return { snapshot: {}, counts: {}, problems, warnings };
  }
  if (!isRec(parsed)) {
    problem('file', 'json', 'The file must be a JSON object.');
    return { snapshot: {}, counts: {}, problems, warnings };
  }
  const app = parsed.app;
  if (app !== undefined && app !== 'margin') {
    problem('file', 'app', `This is not a Margin file (app is "${String(app)}").`);
    return { snapshot: {}, counts: {}, problems, warnings };
  }
  const shapeA = app === 'margin' || (app === undefined && 'raw' in parsed);

  if (shapeA) {
    for (const k of Object.keys(parsed)) if (!A_KEYS.has(k)) warnings.push(`"${k}" is not part of a Margin export and was ignored.`);
    const raw = parsed.raw;
    if (!isRec(raw)) {
      problem('file', 'raw', 'This looks like a Margin export, but the "raw" snapshot it should carry is missing.');
      return { snapshot: {}, counts: {}, problems, warnings };
    }
    readRaw(raw);
  } else {
    for (const k of Object.keys(parsed)) if (!B_KEYS.has(k)) warnings.push(`"${k}" is not part of the import and was ignored.`);
    readCompact(parsed);
  }

  const counts: Record<string, number> = {
    courses: courses.size, meetings: meetings.size, tasks: tasks.size, notices: notices.size,
    attendance: attendance.size, dayMarks: dayMarks.size, marks: marks.size, adjusts: adjusts.size,
  };
  const used = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
  const snapshot: Partial<Snapshot> = {};
  if (courses.size) snapshot.courses = [...courses.values()];
  if (meetings.size) snapshot.meetings = [...meetings.values()];
  if (tasks.size) snapshot.tasks = [...tasks.values()];
  if (notices.size) snapshot.notices = [...notices.values()];
  if (attendance.size) snapshot.attendance = Object.fromEntries(attendance);
  if (dayMarks.size) snapshot.dayMarks = Object.fromEntries(dayMarks);
  if (marks.size) snapshot.marks = [...marks.values()];
  if (adjusts.size) snapshot.adjusts = Object.fromEntries(adjusts);
  if (Object.keys(settings).length) snapshot.settings = settings;
  return { snapshot, counts: used, problems, warnings };

  /* ── shape A: this app's own export, read from `raw` ─────────────────────────────────────────── */
  function readRaw(raw: Rec) {
    for (const [i, row] of asRows(raw.courses, 'courses').entries()) {
      const at = `courses[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'name', 'room', 'teacher', 'goal', 'sort', 'demo'], at);
      const name = nonEmpty(row.name);
      if (!name) { problem(at, 'name', 'A course needs a name.'); continue; }
      const id = nonEmpty(row.id) ?? derived('course', name.toLowerCase());
      courses.set(id, { id, name, room: str(row.room) ?? '', teacher: str(row.teacher) ?? '', goal: num(row.goal), sort: int(row.sort, i), demo: bool(row.demo, false) });
    }

    for (const [i, row] of asRows(raw.meetings, 'meetings').entries()) {
      const at = `meetings[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'courseId', 'weekday', 'start', 'end', 'demo'], at);
      const courseId = nonEmpty(row.courseId);
      if (!courseId) { problem(at, 'courseId', 'A class needs the course it belongs to.'); continue; }
      const weekday = num(row.weekday);
      if (weekday === null || weekday < 0 || weekday > 6) { problem(at, 'weekday', 'weekday must be 0 (Mon) … 6 (Sun).'); continue; }
      const start = clock(row.start), end = clock(row.end);
      if (!start || !end) { problem(at, start ? 'end' : 'start', 'Times are 24-hour "HH:MM".'); continue; }
      const id = nonEmpty(row.id) ?? derived('meeting', `${courseId}|${weekday}|${start}`);
      if (meetings.has(id)) duplicate('this class', at);
      meetings.set(id, { id, courseId, weekday: Math.round(weekday), start, end, demo: bool(row.demo, false) });
    }

    for (const [i, row] of asRows(raw.tasks, 'tasks').entries()) {
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

    for (const [i, row] of asRows(raw.notices, 'notices').entries()) {
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

    for (const [i, row] of asRows(raw.marks, 'marks').entries()) {
      const at = `marks[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'courseId', 'name', 'score', 'weight', 'on', 'sort', 'demo'], at);
      const courseId = nonEmpty(row.courseId), name = nonEmpty(row.name);
      if (!courseId) { problem(at, 'courseId', 'A mark needs the course it belongs to.'); continue; }
      if (!name) { problem(at, 'name', 'A mark needs a name.'); continue; }
      const id = nonEmpty(row.id) ?? derived('mark', `${courseId}|${name}`);
      if (marks.has(id)) duplicate('this mark', at);
      marks.set(id, { id, courseId, name, score: num(row.score), weight: num(row.weight) ?? 0, on: bool(row.on, true), sort: int(row.sort, i), demo: bool(row.demo, false) });
    }

    for (const [key, row] of entriesOf(raw.attendance)) {
      const at = `attendance[${key}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['key', 'status', 'at', 'reason'], at);
      const k = nonEmpty(row.key) ?? key;
      const status = ATT_STATUS.find((s) => s === row.status);
      if (!status) { problem(at, 'status', `status must be one of ${ATT_STATUS.join(', ')}.`); continue; }
      attendance.set(k, { key: k, status, at: num(row.at) ?? now, reason: str(row.reason) ?? '' });
    }

    for (const [key, row] of entriesOf(raw.dayMarks)) {
      const at = `dayMarks[${key}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['date', 'status', 'at', 'reason'], at);
      const date = nonEmpty(row.date) ?? key;
      if (!isYmd(date)) { problem(at, 'date', 'A day mark needs a YYYY-MM-DD date.'); continue; }
      const status = dayStatus(row.status);
      if (!status) { problem(at, 'status', statusProblem()); continue; }
      dayMarks.set(date, { date, status, at: num(row.at) ?? now, reason: str(row.reason) ?? '' });
    }

    for (const [key, row] of entriesOf(raw.adjusts)) {
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
      }
    }

    /* Out of scope for v1, and said out loud rather than silently dropped. */
    for (const [name, list] of [['focus sessions', raw.focus], ['trips', raw.trips], ['alarms', raw.alarms]] as const) {
      if (Array.isArray(list) && list.length) warnings.push(`${list.length} ${name} are not imported; this version brings in courses, classes, tasks, notes, attendance, day marks, marks and curves.`);
    }
  }

  /* ── shape B: the compact shape an AI writes ──────────────────────────────────────────────────── */
  function readCompact(obj: Rec) {
    /* Existing subjects first, so a file that names "DB Systems" lands its tasks on the subject the
       user already has instead of creating a second one. */
    const byName = new Map<string, string>();
    for (const c of opts.courses ?? []) byName.set(c.name.trim().toLowerCase(), c.id);

    const courseOf = (row: Rec, at: string): string | null => {
      const name = nonEmpty(row.name);
      if (!name) { problem(at, 'name', 'A course needs a name.'); return null; }
      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        if (courses.has(existing)) {
          duplicate(`the course "${name}"`, at);
          courses.set(existing, { ...(courses.get(existing) as Course), name, room: str(row.room) ?? '', teacher: str(row.teacher) ?? '' });
        }
        return existing;
      }
      const id = nonEmpty(row.id) ?? derived('course', key);
      courses.set(id, { id, name, room: str(row.room) ?? '', teacher: str(row.teacher) ?? '', goal: null, sort: courses.size, demo: false });
      byName.set(key, id);
      return id;
    };

    for (const [i, row] of asRows(obj.courses, 'courses').entries()) {
      const at = `courses[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['id', 'name', 'room', 'teacher', 'meetings'], at);
      const courseId = courseOf(row, at);
      if (!courseId) continue;
      for (const [j, m] of asRows(row.meetings, `${at}.meetings`).entries()) {
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

    for (const [i, row] of asRows(obj.days, 'days').entries()) {
      const at = `days[${i}]`;
      if (!isRec(row)) { problem(at, 'row', 'Expected an object.'); continue; }
      unknownKeys(row, ['date', 'status', 'reason'], at);
      const date = nonEmpty(row.date);
      if (!isYmd(date)) { problem(at, 'date', 'A day needs a YYYY-MM-DD date.'); continue; }
      const status = dayStatus(row.status);
      if (!status) { problem(at, 'status', statusProblem()); continue; }
      if (dayMarks.has(date)) duplicate(`the day mark for ${date}`, at);
      dayMarks.set(date, { date, status, at: now, reason: str(row.reason) ?? '' });
    }

    for (const [i, row] of asRows(obj.tasks, 'tasks').entries()) {
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

    for (const [i, row] of asRows(obj.marks, 'marks').entries()) {
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
          else settings = { semesterStart: start, semesterEnd: end };
        }
      }
    }
  }
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = num(v);
  return n === null ? dflt : Math.min(max, Math.max(min, Math.round(n)));
}

/** `Record<k, row>` as entries, or an array of rows keyed by its own `key`/`date`. Anything else is
 *  ignored here and reported by the caller's own shape check, never a crash. */
function entriesOf(v: unknown): [string, unknown][] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((row, i) => [String(i), row]);
  if (isRec(v)) return Object.entries(v);
  return [];
}
