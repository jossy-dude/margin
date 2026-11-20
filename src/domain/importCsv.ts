import { ATT_STATUS, DatasetKind, Problem, TASK_KINDS, W, attStatus, clampInt, clock, datasetCounts, dayStatus, derived, isUpcoming, noWhy, parseWhen, statusProblem, whyIn } from './importShared';
import type { AttRecord, Course, DayMark, Mark, Meeting, Snapshot, Task } from './types';
import { occKey } from './attendance';
import { splitRooms } from './rooms';
import { isYmd } from './semester';
import type { ImportOptions, ImportPlan } from './importShared';
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

