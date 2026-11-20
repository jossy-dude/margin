import { ATT_STATUS, A_KEYS, B_KEYS, Problem, Rec, TASK_KINDS, W, attStatus, bool, clampInt, clock, datasetCounts, dayStatus, derived, entriesOf, int, isRec, isUpcoming, noWhy, nonEmpty, num, parseWhen, roomsIn, sameShape, statusProblem, str, whyIn } from './importShared';
import type { Alarm, AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, Snapshot, SubjectVariant, Task, Trip } from './types';
import { detectDataset, planCsv } from './importCsv';
import { parseCsv } from './csv';
import { isYmd, validRange } from './semester';
import { occKey } from './attendance';
import { DEFAULT_SETTINGS } from './defaults';
import type { ImportOptions, ImportPlan } from './importShared';
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


/* The import path's public face stays here; its CSV half and shared types live beside it (v0.8 §2.4 split). */
export { DATASETS, detectDataset, planCsv } from './importCsv';
export type { DatasetCount, DatasetKind, ImportOptions, ImportPlan, Problem } from './importShared';
