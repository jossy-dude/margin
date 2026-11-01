import { detectDataset, detectImportFormat, parseImport, parseImportFile, planCsv } from '../domain/importPlan';
import { parseCsv } from '../domain/csv';
import type { AttRecord, Course, DayMark, Mark, Snapshot, Task } from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import { buildTables, toCsv, toJson } from '../services/export';
import { seedSnapshot } from '../data/seed';

/** A fixed clock: `createdAt`/`at` default to `now`, so idempotency is only testable with one. */
const NOW = new Date(2026, 8, 1, 9).getTime();

/** The brief's own sample, character for character: it is what the owner will hand to an AI. */
const BRIEF = `{
  "semester": { "start": "2026-09-07", "end": "2026-12-20" },
  "courses": [{ "name": "DB Systems", "room": "B12", "teacher": "Ms. X",
                "meetings": [{ "weekday": 1, "start": "08:30", "end": "10:00" }] }],
  "days":    [{ "date": "2026-09-14", "status": "cancelled", "reason": "holiday" }],
  "tasks":   [{ "title": "Read chapter 1", "course": "DB Systems", "due": "2026-09-20T23:59" }],
  "marks":   [{ "course": "DB Systems", "name": "Quiz 1", "score": 18, "weight": 10 }]
}`;

const parse = (text: string, courses?: Course[]) => parseImport(text, { courses, now: NOW });
const json = (v: unknown) => JSON.stringify(v);
const course = (id: string, name: string): Course => ({ id, name, rooms: [], teacher: '', goal: null, sort: 0, demo: false });

/** Every message the plan carries, joined: a readable failure is the parser's whole job. */
const messages = (p: ReturnType<typeof parse>) => p.problems.map((x) => `${x.where} · ${x.field}: ${x.message}`);

/**
 * The import path is fed pasted text, which is the input that is wrong most often. Two contracts matter:
 * a good file lands the same rows every time (so importing twice cannot duplicate a term), and a bad file
 * says what is wrong in words instead of throwing at a screen.
 */
describe('parseImport', () => {
  describe('the compact shape (B) the owner hands to an AI', () => {
    const plan = parse(BRIEF);

    it('reads the brief\'s sample with no problems and no warnings', () => {
      expect(plan.problems).toEqual([]);
      expect(plan.warnings).toEqual([]);
      expect(plan.counts).toEqual({ courses: 1, meetings: 1, tasks: 1, dayMarks: 1, marks: 1 });
    });

    it('carries the semester range as settings, and only those two keys', () => {
      expect(plan.snapshot.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    });

    it('links the meeting, task and mark to the course by name, case-insensitively', () => {
      const c = plan.snapshot.courses![0]!;
      expect(c).toMatchObject({ name: 'DB Systems', rooms: ['B12'], teacher: 'Ms. X' });
      expect(c.id).toMatch(/^imp-course-/);
      expect(plan.snapshot.meetings![0]).toMatchObject({ courseId: c.id, weekday: 1, start: '08:30', end: '10:00' });
      expect(plan.snapshot.tasks![0]!.courseId).toBe(c.id);
      expect(plan.snapshot.marks![0]).toMatchObject({ courseId: c.id, name: 'Quiz 1', score: 18, weight: 10 });
    });

    it('reads "cancelled" as the DayStatus c, with the reason kept as a reason', () => {
      expect(plan.snapshot.dayMarks!['2026-09-14']).toMatchObject({ status: 'c', reason: 'holiday' });
    });

    it('reads a local wall-clock due time, not UTC', () => {
      expect(plan.snapshot.tasks![0]!.dueAt).toBe(new Date(2026, 8, 20, 23, 59).getTime());
    });

    it('is idempotent: the same file twice is the same rows, ids included', () => {
      expect(parse(BRIEF)).toEqual(plan);
    });

    it('accepts the printed day-status words too, because the app prints those', () => {
      const p = parse(json({ days: [
        { date: '2026-09-14', status: 'Cancelled' },
        { date: '2026-09-15', status: 'sick' },
        { date: '2026-09-16', status: 'p' },
      ] }));
      expect(p.problems).toEqual([]);
      expect(p.snapshot.dayMarks!['2026-09-14']!.status).toBe('c');
      expect(p.snapshot.dayMarks!['2026-09-15']!.status).toBe('s');
      expect(p.snapshot.dayMarks!['2026-09-16']!.status).toBe('p');
    });

    it('rejects "holiday" as a status, and names the statuses that exist', () => {
      const p = parse(json({ days: [{ date: '2026-09-14', status: 'holiday' }] }));
      expect(p.problems).toHaveLength(1);
      expect(p.problems[0]).toMatchObject({ where: 'days[0]', field: 'status' });
      expect(p.problems[0]!.message).toContain('p, a, s, c');
      expect(p.snapshot.dayMarks).toBeUndefined();
    });

    it('an explicit id wins over the derived one', () => {
      const p = parse(json({
        courses: [{ id: 'mine', name: 'Maths', meetings: [{ id: 'm1', weekday: 0, start: '08:00', end: '09:00' }] }],
        tasks: [{ id: 't1', title: 'Sheet 1', course: 'Maths' }],
        marks: [{ id: 'k1', course: 'Maths', name: 'Test', score: 10, weight: 5 }],
      }));
      expect(p.snapshot.courses![0]!.id).toBe('mine');
      expect(p.snapshot.meetings![0]!.id).toBe('m1');
      expect(p.snapshot.tasks![0]!.id).toBe('t1');
      expect(p.snapshot.marks![0]!.id).toBe('k1');
    });

    it('warns on a duplicate natural key and lets the later row win, keeping one row', () => {
      const p = parse(json({
        courses: [{ name: 'Maths' }, { name: 'maths', room: 'B2' }],
        tasks: [
          { title: 'Sheet 1', course: 'Maths', notes: 'first' },
          { title: 'Sheet 1', course: 'Maths', notes: 'second' },
        ],
      }));
      expect(p.problems).toEqual([]);
      expect(p.counts).toEqual({ courses: 1, tasks: 1 });
      expect(p.snapshot.courses![0]).toMatchObject({ name: 'maths', rooms: ['B2'] });
      expect(p.snapshot.tasks![0]!.notes).toBe('second');
      expect(p.warnings.some((w) => w.includes('courses[1]: the course "maths" is listed twice'))).toBe(true);
      expect(p.warnings.some((w) => w.includes('tasks[1]: this task is listed twice'))).toBe(true);
    });

    it('an unresolvable course is a problem, and that row is skipped rather than guessed at', () => {
      const p = parse(json({
        courses: [{ name: 'Maths' }],
        tasks: [{ title: 'Sheet 1', course: 'Ghost' }],
        marks: [{ course: 'Ghost', name: 'Test', score: 1, weight: 1 }],
      }));
      expect(p.snapshot.tasks).toBeUndefined();
      expect(p.snapshot.marks).toBeUndefined();
      expect(messages(p)).toEqual([
        'tasks[0] · course: No course called "Ghost" in this file or on the phone.',
        'marks[0] · course: No course called "Ghost" in this file or on the phone.',
      ]);
    });

    /* F1 round 4: the row a file carries for a subject the phone already has now MERGES over it
       (the CSV door's rule), so it is written, and the preview says "1 updated" — not a skip. */
    it('reuses a subject already on the phone: the row it carries merges in and counts as an update', () => {
      const phone = [course('E', 'Economics')];
      const p = parse(json({
        courses: [{ name: 'economics', room: 'A1' }],
        tasks: [{ title: 'Essay', course: 'ECONOMICS' }],
        marks: [{ course: 'Economics', name: 'Quiz', score: 5, weight: 10 }],
      }), phone);
      expect(p.snapshot.courses).toEqual([{ ...course('E', 'Economics'), name: 'economics', rooms: ['A1'] }]); // an update of E, not a second row
      expect(p.snapshot.tasks![0]!.courseId).toBe('E');
      expect(p.snapshot.marks![0]!.courseId).toBe('E');
      expect(p.counts).toEqual({ courses: 1, tasks: 1, marks: 1 });
      expect(p.breakdown.courses).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
    });

    it('a second file\'s room and teacher overwrite the phone\'s subject, and nothing else moves', () => {
      const phone = [{ ...course('E', 'Organic Chem'), rooms: ['S3'], teacher: 'Dr Who', goal: 80, sort: 4 }];
      const p = parse(json({ courses: [{ name: 'Organic Chem', rooms: ['S9'], teacher: 'Deveraux' }] }), phone);
      expect(p.problems).toEqual([]);
      expect(p.snapshot.courses).toEqual([{ id: 'E', name: 'Organic Chem', rooms: ['S9'], teacher: 'Deveraux', goal: 80, sort: 4, demo: false }]);
      expect(p.counts).toEqual({ courses: 1 });
      expect(p.breakdown.courses).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
    });

    it('a compact field the row leaves out — or leaves empty — keeps the phone\'s value', () => {
      const phone = [{ ...course('E', 'Organic Chem'), rooms: ['S3'], teacher: 'Dr Who', goal: 80, sort: 4 }];
      const absent = parse(json({ courses: [{ name: 'Organic Chem', room: 'S9' }] }), phone);
      expect(absent.snapshot.courses![0]).toMatchObject({ rooms: ['S9'], teacher: 'Dr Who', goal: 80, sort: 4 });
      const empty = parse(json({ courses: [{ name: 'Organic Chem', rooms: [], teacher: 'Deveraux' }] }), phone);
      expect(empty.snapshot.courses![0]).toMatchObject({ rooms: ['S3'], teacher: 'Deveraux' });
    });

    it('a compact row that claims the phone subject\'s id merges too, and its new name resolves in-file', () => {
      const phone = [{ ...course('C1', 'DB Systems'), goal: 70, sort: 2 }];
      const p = parse(json({
        courses: [{ id: 'C1', name: 'Data Systems', room: 'B12' }],
        tasks: [{ title: 'Sheet 1', course: 'Data Systems' }],
      }), phone);
      expect(p.problems).toEqual([]);
      expect(p.snapshot.courses).toEqual([{ ...course('C1', 'DB Systems'), name: 'Data Systems', rooms: ['B12'], goal: 70, sort: 2 }]);
      expect(p.snapshot.tasks![0]!.courseId).toBe('C1'); // the file's own new name still finds it
      expect(p.breakdown.courses).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
    });

    it('keeps a semester with no end date open-ended', () => {
      const p = parse(json({ semester: { start: '2026-09-07' } }));
      expect(p.problems).toEqual([]);
      expect(p.counts).toEqual({});
      expect(p.snapshot).toEqual({ settings: { semesterStart: '2026-09-07', semesterEnd: '' } });
    });

    it('rejects a semester whose end is before its start, and says which field', () => {
      const p = parse(json({ semester: { start: '2026-09-07', end: '2026-09-01' } }));
      expect(p.problems).toEqual([{ where: 'semester', field: 'end', message: 'The end date is before the start.' }]);
      expect(p.snapshot.settings).toBeUndefined();
    });

    it('rejects a malformed date and a malformed time with a readable field name', () => {
      const p = parse(json({
        semester: { start: '2026-9-7' },
        days: [{ date: '14/09/2026', status: 'c' }],
        courses: [{ name: 'Maths', meetings: [{ weekday: 1, start: '8.30', end: '10:00' }] }],
      }));
      expect(p.problems.map((x) => `${x.where}.${x.field}`)).toEqual(['courses[0].meetings[0].start', 'days[0].date', 'semester.start']);
      expect(p.problems.find((x) => x.where === 'semester')!.message).toBe('Use YYYY-MM-DD.');
      expect(p.problems.find((x) => x.where === 'days[0]')!.message).toBe('A day needs a YYYY-MM-DD date.');
    });

    it('warns on an unknown top-level key and an unknown nested key, and ignores both', () => {
      const p = parse(json({ semester: { start: '2026-09-07' }, mood: 'good', courses: [{ name: 'Maths', colour: 'red' }] }));
      expect(p.problems).toEqual([]);
      expect(p.warnings).toEqual([
        '"mood" is not part of the import and was ignored.',
        'courses[0]: "colour" is not part of the import and was ignored.',
      ]);
      expect(p.snapshot.courses![0]!.name).toBe('Maths');
    });

    it('warns on an unknown task kind and imports the task as "other"', () => {
      const p = parse(json({ tasks: [{ title: 'Thing', kind: 'essay' }] }));
      expect(p.problems).toEqual([]);
      expect(p.snapshot.tasks![0]!.kind).toBe('other');
      expect(p.warnings).toEqual(['tasks[0]: "essay" is not a task kind; it was imported as "other".']);
    });

    it('rejects a due date it cannot read instead of importing a task with no deadline', () => {
      const p = parse(json({ tasks: [{ title: 'Thing', due: 'next Friday' }] }));
      expect(p.problems).toHaveLength(1);
      expect(p.problems[0]).toMatchObject({ where: 'tasks[0]', field: 'due' });
      expect(p.snapshot.tasks).toBeUndefined();
    });

    it('rejects a weekday outside 0–6 and a non-24-hour time', () => {
      const p = parse(json({ courses: [{ name: 'Maths', meetings: [
        { weekday: 7, start: '08:00', end: '09:00' },
        { weekday: 1, start: '25:00', end: '26:00' },
      ] }] }));
      expect(p.problems.map((x) => x.field)).toEqual(['weekday', 'start']);
    });

    it('only reports counts that are non-zero', () => {
      const p = parse(json({ tasks: [{ title: 'One' }] }));
      expect(p.counts).toEqual({ tasks: 1 });
    });

    it('does not invent an add/update split for a dataset it cannot see on the phone', () => {
      const p = parse(json({ tasks: [{ title: 'One' }, { title: 'Two' }] }), []);
      expect(p.breakdown.tasks).toEqual({ write: 2, skip: 0, add: null, update: null });
    });

    it('leaves the subject split unknown when it was not handed the phone\'s subjects', () => {
      const p = parse(json({ courses: [{ name: 'Maths' }] }));
      expect(p.breakdown.courses).toEqual({ write: 1, skip: 0, add: null, update: null });
    });
  });

  describe('the app\'s own export (shape A)', () => {
    const raw = {
      courses: [{ id: 'C1', name: 'Economics', rooms: ['A1'], teacher: 'Mr T', goal: 80, sort: 0, demo: false }],
      meetings: [{ id: 'M1', courseId: 'C1', weekday: 0, start: '08:30', end: '10:00', demo: false }],
      tasks: [{ id: 'T1', title: 'Essay', courseId: 'C1', kind: 'assignment', dueAt: 123, startAt: null, estimateMin: null, priority: 1, notes: '', status: 0, createdAt: 1, completedAt: null, reminders: [], subtasks: [], demo: false }],
      notices: [{ id: 'N1', courseId: 'C1', text: 'Bring the book', dueAt: 5, priority: 2, demo: false }],
      marks: [{ id: 'K1', courseId: 'C1', name: 'Quiz', score: null, weight: 10, on: true, sort: 0, demo: false }],
      attendance: { '2026-09-08|08:30|C1': { key: '2026-09-08|08:30|C1', status: 'l', at: 5, reason: 'bus' } },
      dayMarks: { '2026-09-14': { date: '2026-09-14', status: 'c', at: 5, reason: 'holiday' } },
      adjusts: { C1: 2.5 },
      focus: [{ id: 'F1' }],
      trips: [{ id: 'TR1' }],
      alarms: [{ id: 'A1' }],
      settings: { semesterStart: '2026-09-07', semesterEnd: '2026-12-20' },
    };
    const exportText = json({ app: 'margin', version: 1, exportedAt: '2026-10-12T00:00:00.000Z', Summary: [], Courses: [], raw });
    const plan = parse(exportText);

    it('reads the snapshot under raw, and every entity in it', () => {
      expect(plan.problems).toEqual([]);
      expect(plan.counts).toEqual({ courses: 1, meetings: 1, tasks: 1, notices: 1, attendance: 1, dayMarks: 1, marks: 1, adjusts: 1 });
      expect(plan.snapshot.courses![0]!.id).toBe('C1');
      expect(plan.snapshot.attendance!['2026-09-08|08:30|C1']).toMatchObject({ status: 'l', reason: 'bus' });
      expect(plan.snapshot.dayMarks!['2026-09-14']!.status).toBe('c');
      expect(plan.snapshot.adjusts).toEqual({ C1: 2.5 });
    });

    it('reads the semester settings when the export carries them', () => {
      expect(plan.snapshot.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    });

    it('says out loud which entities this version does not import', () => {
      expect(plan.warnings).toEqual([
        '1 focus sessions are not imported; this version brings in courses, classes, tasks, notes, attendance, day marks, marks and curves.',
        '1 trips are not imported; this version brings in courses, classes, tasks, notes, attendance, day marks, marks and curves.',
        '1 alarms are not imported; this version brings in courses, classes, tasks, notes, attendance, day marks, marks and curves.',
      ]);
    });

    it('is idempotent from an export too', () => {
      expect(parse(exportText)).toEqual(plan);
    });

    it('re-importing its own rows reports updates when the phone already has them', () => {
      const phone = [course('C1', 'Economics')];
      const p = parse(json({ app: 'margin', raw: { courses: [{ id: 'C1', name: 'Economics' }] } }), phone);
      expect(p.counts).toEqual({ courses: 1 });
      expect(p.breakdown.courses).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
    });

    /* R1 round 5: the merge rule is release-wide, not per-shape — a sparse raw row keeps the fields
       it omits (or blanks) instead of wiping them, and a complete export behaves exactly as before
       because it provides every field. */
    it('a sparse raw course keeps the fields it omits, and overwrites the ones it provides', () => {
      const phone = [{ ...course('C1', 'Economics'), rooms: ['A1'], teacher: 'Mr T', goal: 80, sort: 3 }];
      const sparse = parse(json({ app: 'margin', raw: { courses: [{ id: 'C1', name: 'Economics' }] } }), phone);
      expect(sparse.problems).toEqual([]);
      expect(sparse.snapshot.courses).toEqual([{ ...course('C1', 'Economics'), rooms: ['A1'], teacher: 'Mr T', goal: 80, sort: 3 }]);
      expect(sparse.breakdown.courses).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
      const provided = parse(json({ app: 'margin', raw: { courses: [{ id: 'C1', name: 'Economics', room: 'B2', goal: 90, sort: 5 }] } }), phone);
      expect(provided.snapshot.courses).toEqual([{ ...course('C1', 'Economics'), rooms: ['B2'], teacher: 'Mr T', goal: 90, sort: 5 }]);
    });

    it('a raw course row that blanks a field keeps the phone\'s value, like every other door', () => {
      const phone = [{ ...course('C1', 'Economics'), rooms: ['A1'], teacher: 'Mr T', goal: 80, sort: 3 }];
      const p = parse(json({ app: 'margin', raw: { courses: [{ id: 'C1', name: 'Economics', rooms: [], teacher: '' }] } }), phone);
      expect(p.snapshot.courses).toEqual([{ ...course('C1', 'Economics'), rooms: ['A1'], teacher: 'Mr T', goal: 80, sort: 3 }]);
    });

    it('treats an object with raw but no app as an export, because the raw snapshot is the tell', () => {
      const p = parse(json({ raw: { courses: [{ id: 'C9', name: 'History' }] } }));
      expect(p.problems).toEqual([]);
      expect(p.snapshot.courses![0]!.id).toBe('C9');
    });

    it('a raw settings object with no semesterEnd key writes only the start', () => {
      const p = parse(json({ app: 'margin', raw: { settings: { semesterStart: '2026-09-07', name: 'Sam' } } }));
      expect(p.problems).toEqual([]);
      expect(p.snapshot.settings).toEqual({ semesterStart: '2026-09-07' });
    });

    it('warns on a key that is not part of a Margin export', () => {
      const p = parse(json({ app: 'margin', raw: {}, whatever: 1 }));
      expect(p.problems).toEqual([]);
      expect(p.warnings).toEqual(['"whatever" is not part of a Margin export and was ignored.']);
    });

    it('a Margin envelope with no raw is a problem, not an empty import', () => {
      const p = parse(json({ app: 'margin', Courses: [] }));
      expect(p.problems).toHaveLength(1);
      expect(p.problems[0]).toMatchObject({ where: 'file', field: 'raw' });
      expect(p.snapshot).toEqual({});
    });

    it('a raw that is not an object is the same problem', () => {
      expect(parse(json({ app: 'margin', raw: [] })).problems[0]).toMatchObject({ where: 'file', field: 'raw' });
    });

    it('round-trips the file this app itself writes (the export\'s missing half)', () => {
      const snap = seedSnapshot(NOW);
      const p = parse(toJson(snap, NOW));
      expect(p.problems).toEqual([]);
      expect(p.counts).toEqual({
        courses: snap.courses.length, meetings: snap.meetings.length, tasks: snap.tasks.length,
        notices: snap.notices.length, marks: snap.marks.length,
      });
      expect(p.snapshot.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '' });
      expect(p.warnings.every((w) => w.includes('focus sessions'))).toBe(true);
    });
  });

  describe('input that is not a file at all', () => {
    it('empty and whitespace-only text asks for the paste, rather than reporting broken JSON', () => {
      for (const text of ['', '   \n\t ']) {
        const p = parse(text);
        expect(p.problems).toHaveLength(1);
        expect(p.problems[0]).toMatchObject({ where: 'file', field: 'text' });
        expect(p.snapshot).toEqual({});
        expect(p.counts).toEqual({});
      }
    });

    it('invalid JSON is a problem with the parser\'s own reason, never a throw', () => {
      const p = parse('{ "courses": [ }');
      expect(p.problems).toHaveLength(1);
      expect(p.problems[0]).toMatchObject({ where: 'file', field: 'json' });
      expect(p.problems[0]!.message).toContain('That is not valid JSON');
    });

    it('a JSON value that is not an object is refused', () => {
      for (const text of ['[]', 'null', '"hi"', '3']) {
        const p = parse(text);
        expect(p.problems).toHaveLength(1);
        expect(p.problems[0]).toMatchObject({ where: 'file', field: 'json', message: 'The file must be a JSON object.' });
      }
    });

    it('a file from another app is named as such and stops there', () => {
      const p = parse(json({ app: 'other', courses: [{ name: 'Maths' }] }));
      expect(p.problems).toEqual([{ where: 'file', field: 'app', message: 'This is not a Margin file (app is "other").' }]);
      expect(p.snapshot).toEqual({});
    });
  });
});

/** The whole term in one file: profile, semester, subjects with variants, classes, attendance, day
 *  marks, tasks and marks. This is the shape WS1 Task 2 promises an AI (or a person) can hand over. */
const FULL = `{
  "profileName": "Sam",
  "semester": { "start": "2026-09-07", "end": "2026-12-20" },
  "courses": [{
    "name": "DB Systems", "room": "B12", "teacher": "Ms. X",
    "variants": [{ "name": "Lab Database", "room": "Lab 2", "teacher": "Mr Y", "note": "Thu group" }],
    "meetings": [{ "weekday": 1, "start": "08:30", "end": "10:00" }]
  }],
  "attendance": [{ "date": "2026-09-14", "course": "DB Systems", "start": "08:30", "status": "late", "reason": "bus" }],
  "days": [{ "date": "2026-09-15", "status": "c", "reason": "holiday" }],
  "tasks": [{ "title": "Read chapter 1", "course": "DB Systems", "due": "2026-09-20T23:59" }],
  "marks": [{ "course": "DB Systems", "name": "Quiz 1", "score": 18, "weight": 10 }]
}`;

describe('the full-dataset JSON shape', () => {
  const plan = parse(FULL);

  it('counts every dataset it writes, variants included', () => {
    expect(plan.problems).toEqual([]);
    expect(plan.warnings).toEqual([]);
    // v0.5's migration gave variants a table, so the preview, the button and the toast count them:
    // a count that excluded a row the import really writes is the same lie as one that invented it.
    expect(plan.counts).toEqual({ courses: 1, meetings: 1, attendance: 1, dayMarks: 1, tasks: 1, marks: 1, variants: 1 });
    expect(plan.breakdown.variants).toEqual({ write: 1, skip: 0, add: null, update: null });
    expect(plan.snapshot.variants).toEqual(plan.variants); // the preview and the write are one list
  });

  it('carries the profile name, and writes it with the semester range', () => {
    expect(plan.profileName).toBe('Sam');
    expect(plan.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    expect(plan.snapshot.settings).toEqual({ name: 'Sam', semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
  });

  it('plans a variant under the subject it belongs to, with its own id', () => {
    const course = plan.snapshot.courses![0]!;
    expect(plan.variants).toEqual([{ id: expect.stringMatching(/^imp-variant-/), subjectId: course.id, name: 'Lab Database', room: 'Lab 2', teacher: 'Mr Y', note: 'Thu group', ord: 0 }]);
  });

  it('reads a named attendance status as its letter, keyed the way the grid keys it', () => {
    const course = plan.snapshot.courses![0]!;
    expect(plan.attendance).toEqual([{ key: `2026-09-14|08:30|${course.id}`, status: 'l', at: NOW, reason: 'bus' }]);
    expect(plan.snapshot.attendance).toEqual({ [`2026-09-14|08:30|${course.id}`]: plan.attendance![0] });
  });

  it('exposes the tasks and marks it planned beside the snapshot', () => {
    expect(plan.tasks!.map((t) => t.title)).toEqual(['Read chapter 1']);
    expect(plan.marks!.map((m) => m.name)).toEqual(['Quiz 1']);
  });

  it('is idempotent: the whole file twice is the same plan', () => {
    expect(parse(FULL)).toEqual(plan);
  });

  it('a partial file lists the problems and still plans the datasets it could read (Review Focus 1)', () => {
    const p = parse(json({
      courses: [{ name: 'Maths' }],
      tasks: 'nope',
      attendance: [{ date: '14/09/2026', course: 'Maths', start: '08:00', status: 'p' }],
      marks: [{ course: 'Ghost', name: 'Test', score: 1, weight: 1 }],
    }));
    expect(p.snapshot.courses![0]!.name).toBe('Maths');
    expect(messages(p)).toEqual([
      'attendance[0] · date: Use YYYY-MM-DD.',
      'tasks · value: Expected a list.',
      'marks[0] · course: No course called "Ghost" in this file or on the phone.',
    ]);
  });

  it('a wrong-typed field is a problem, never a throw', () => {
    expect(() => parse(json({ profileName: 42, semester: 'autumn', courses: [{ name: 'Maths', variants: 'x' }] }))).not.toThrow();
    const p = parse(json({ profileName: 42, semester: 'autumn', courses: [{ name: 'Maths', variants: 'x' }] }));
    expect(messages(p)).toEqual([
      'file · profileName: The profile name must be text.',
      'courses[0].variants · value: Expected a list.',
      'semester · value: Expected an object with a start and, optionally, an end.',
    ]);
    expect(p.snapshot.courses![0]!.name).toBe('Maths');
    expect(p.snapshot.settings).toBeUndefined();
  });

  it('an unreadable attendance row is skipped, and the rest of the table still lands', () => {
    const p = parse(json({
      courses: [{ name: 'Maths' }],
      attendance: [
        { date: '2026-09-14', course: 'Maths', start: '08:00', status: 'p' },
        { date: '2026-09-15', course: 'Maths', start: '25:00', status: 'p' },
        { date: '2026-09-16', course: 'Maths', start: '08:00', status: 'maybe' },
      ],
    }));
    expect(p.attendance).toHaveLength(1);
    expect(messages(p)).toEqual([
      'attendance[1] · start: Times are 24-hour "HH:MM".',
      'attendance[2] · status: status must be one of p, l, n, a, s, c, t.',
    ]);
  });

  /* F2 round 4: a file this app itself exports carries classes that have not ended — `status` is
     null, absent, or the export's own `upcoming` word — and none of those may block Import. The CSV
     door skips such rows; the JSON door now does the same. */
  it('an unfinished class is a skip in the JSON door too: no problems, no row, not a refusal', () => {
    const p = parse(json({
      courses: [{ name: 'Maths' }],
      attendance: [
        { date: '2026-09-16', course: 'Maths', start: '08:30', status: 'p' },
        { date: '2026-09-17', course: 'Maths', start: '08:30', status: null },
        { date: '2026-09-18', course: 'Maths', start: '08:30', status: 'upcoming' },
        { date: '2026-09-19', course: 'Maths', start: '08:30' },
      ],
    }));
    expect(p.problems).toEqual([]);
    expect(p.counts).toEqual({ courses: 1, attendance: 1 });
    expect(p.breakdown.attendance).toEqual({ write: 1, skip: 3, add: null, update: null });
    expect(p.attendance!.map((a) => a.key)).toEqual([`2026-09-16|08:30|${p.snapshot.courses![0]!.id}`]);
  });

  it('a status the app never invented is still a problem, so a typo is named and not dropped', () => {
    const p = parse(json({
      courses: [{ name: 'Maths' }],
      attendance: [{ date: '2026-09-16', course: 'Maths', start: '08:30', status: 'maybe' }],
    }));
    expect(messages(p)).toEqual(['attendance[0] · status: status must be one of p, l, n, a, s, c, t.']);
  });

  /* R2 round 5: the mark's own `at` stamp belongs to the phone — a compact row over an occurrence
     the phone already has keeps it (and the reason) unless the file provides one. */
  it('a compact mark over an existing occurrence keeps its at and reason, and counts as an update', () => {
    const key = '2026-09-16|08:30|C1';
    const p = parseImport(json({
      courses: [{ name: 'Maths' }],
      attendance: [{ date: '2026-09-16', course: 'Maths', start: '08:30', status: 'p' }],
    }), { courses: [course('C1', 'Maths')], attendance: { [key]: { key, status: 'l', at: 555, reason: 'bus' } }, now: NOW });
    expect(p.problems).toEqual([]);
    expect(p.snapshot.attendance![key]).toEqual({ key, status: 'p', at: 555, reason: 'bus' });
    expect(p.breakdown.attendance).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
  });

  it('a compact row that provides at and reason writes them; a new occurrence still defaults to the clock', () => {
    const p = parseImport(json({
      attendance: [{ key: 'k1', date: '2026-09-16', course: 'Maths', start: '08:30', status: 'p', at: '2026-09-16T09:00', reason: 'tram' }],
    }), { courses: [course('C1', 'Maths')], attendance: {}, now: NOW });
    expect(p.problems).toEqual([]);
    expect(p.snapshot.attendance!['k1']).toEqual({ key: 'k1', status: 'p', at: new Date(2026, 8, 16, 9).getTime(), reason: 'tram' });
  });
});

describe('CSV planning', () => {
  const spec = parseCsv('date,course,start,status\n2026-09-14,DB Systems,08:30,late\n2026-09-15,db systems,08:30,Here\n2026-09-16,DB Systems,08:30,maybe\n');
  const p = planCsv(spec.header, spec.rows, 'attendance', { courses: [course('C1', 'DB Systems')], now: NOW });

  it('plans attendance rows from a CSV, resolving the subject by name', () => {
    expect(p.counts).toEqual({ attendance: 2 });
    expect(p.attendance!.map((a) => a.key)).toEqual(['2026-09-14|08:30|C1', '2026-09-15|08:30|C1']);
    expect(p.snapshot.attendance).toEqual({ '2026-09-14|08:30|C1': p.attendance![0], '2026-09-15|08:30|C1': p.attendance![1] });
  });

  it('names the line that could not be read, and keeps the rows that could', () => {
    expect(p.problems).toEqual([{ where: 'line 4', field: 'status', message: 'status must be one of p, l, n, a, s, c, t.' }]);
  });

  it('accepts the header this app exports, including the columns it does not need back', () => {
    const exported = parseCsv('date,course,start,status,source\n2026-09-14,DB Systems,08:30,Here,marked\n');
    const q = planCsv(exported.header, exported.rows, 'attendance', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.warnings).toEqual([]);
    expect(q.counts).toEqual({ attendance: 1 });
  });

  it('plans a subjects table, with its rooms and targets', () => {
    const t = parseCsv('name,room,teacher,goal\nDB Systems,B12,Ms. X,80\nMaths,A1,Mr T,\n');
    const q = planCsv(t.header, t.rows, 'courses', { now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.counts).toEqual({ courses: 2 });
    expect(q.snapshot.courses!.map((c) => [c.name, c.rooms.join(' · '), c.teacher, c.goal])).toEqual([
      ['DB Systems', 'B12', 'Ms. X', 80],
      ['Maths', 'A1', 'Mr T', null],
    ]);
    expect(q.snapshot.courses![0]!.id).toMatch(/^imp-course-/);
  });

  it('reuses a subject already on the phone, so a hand-written list updates instead of duplicating', () => {
    const t = parseCsv('name,room,teacher\nDB Systems,B12,Ms. X\nMaths,A1,Mr T\n');
    const q = planCsv(t.header, t.rows, 'courses', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.courses!.map((c) => c.id)).toEqual(['C1', expect.stringMatching(/^imp-course-/)]);
    expect(q.breakdown.courses).toEqual({ write: 2, skip: 0, add: 1, update: 1 });
    expect(q.counts).toEqual({ courses: 2 });
  });

  it('keeps the phone\'s fields that a subjects CSV does not carry', () => {
    const t = parseCsv('name,room\nDB Systems,B12\n');
    const phone = [{ ...course('C1', 'DB Systems'), teacher: 'Ms. X', goal: 80, sort: 3 }];
    const q = planCsv(t.header, t.rows, 'courses', { courses: phone, now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.courses).toEqual([
      { id: 'C1', name: 'DB Systems', rooms: ['B12'], teacher: 'Ms. X', goal: 80, sort: 3, demo: false },
    ]);
  });

  it('keeps the phone\'s target when the subjects CSV leaves the goal cell empty', () => {
    const t = parseCsv('name,goal\nDB Systems,\n');
    const phone = [{ ...course('C1', 'DB Systems'), goal: 75 }];
    const q = planCsv(t.header, t.rows, 'courses', { courses: phone, now: NOW });
    expect(q.snapshot.courses![0]!.goal).toBe(75);
  });

  it('does not let subjects CSV row order rewrite an existing subject\'s sort', () => {
    const t = parseCsv('name,room\nMaths,A1\nDB Systems,B12\n');
    const phone = [{ ...course('C1', 'DB Systems'), sort: 7 }];
    const q = planCsv(t.header, t.rows, 'courses', { courses: phone, now: NOW });
    expect(q.snapshot.courses!.find((c) => c.id === 'C1')!.sort).toBe(7);
    expect(q.snapshot.courses!.find((c) => c.name === 'Maths')!.sort).toBe(0);
  });

  it('a new subject still takes the CSV columns exactly as written', () => {
    const t = parseCsv('name,room,teacher,goal\nHistory,C3,Mr H,65\nGeography,C4,,\n');
    const q = planCsv(t.header, t.rows, 'courses', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.snapshot.courses).toEqual([
      { id: expect.stringMatching(/^imp-course-/), name: 'History', rooms: ['C3'], teacher: 'Mr H', goal: 65, sort: 0, demo: false, bar: null },
      { id: expect.stringMatching(/^imp-course-/), name: 'Geography', rooms: ['C4'], teacher: '', goal: null, sort: 1, demo: false, bar: null },
    ]);
    expect(q.breakdown.courses).toEqual({ write: 2, skip: 0, add: 2, update: 0 });
  });

  it('says the add/update split is unknown for a table it cannot see on the phone', () => {
    const t = parseCsv('title,course\n"Read chapter 1",DB Systems\n');
    const q = planCsv(t.header, t.rows, 'tasks', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.breakdown.tasks).toEqual({ write: 1, skip: 0, add: null, update: null });
  });

  it('plans a timetable against the subjects already on the phone, and refuses a class with no subject', () => {
    const t = parseCsv('course,weekday,start,end,room\nDB Systems,Tue,08:30,10:00,B12\nGhost,Wed,09:00,10:00,\n');
    const q = planCsv(t.header, t.rows, 'timetable', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.counts).toEqual({ meetings: 1 });
    expect(q.snapshot.meetings![0]).toMatchObject({ courseId: 'C1', weekday: 1, start: '08:30', end: '10:00' });
    expect(q.warnings).toEqual([]); // the export's own "room" column is known, and lives on the subject
    expect(messages(q)).toEqual(['line 3 · course: No subject called "Ghost" on the phone; import the Subjects table first.']);
  });

  it('plans a tasks table, reading the export\'s own due format and status word', () => {
    const t = parseCsv('title,course,due,status,kind,notes\n"Read chapter 1",DB Systems,2026-09-20 23:59,done,reading,first\n');
    const q = planCsv(t.header, t.rows, 'tasks', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.tasks![0]).toMatchObject({ title: 'Read chapter 1', courseId: 'C1', dueAt: new Date(2026, 8, 20, 23, 59).getTime(), status: 2, kind: 'reading', notes: 'first' });
  });

  it('merges a CSV task row over the task already on the phone', () => {
    const existing: Task = {
      id: 'T1', title: 'Old title', courseId: 'C1', kind: 'exam', dueAt: 111, startAt: 222,
      estimateMin: 90, priority: 2, notes: 'keep me', status: 1, createdAt: 5, completedAt: 6,
      reminders: [{ id: 'r1', mode: 'before', minutes: 60, label: '1 h before' }],
      subtasks: [{ id: 's1', t: 'part one', done: true }],
      demo: false,
    };
    const t = parseCsv('id,title\nT1,Read chapter 1\n');
    const q = planCsv(t.header, t.rows, 'tasks', { courses: [course('C1', 'DB Systems')], tasks: [existing], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.tasks).toEqual([{ ...existing, title: 'Read chapter 1' }]);
    expect(q.breakdown.tasks).toEqual({ write: 1, skip: 0, add: 0, update: 1 });
  });

  it('a brand-new CSV task row still takes the columns exactly as written', () => {
    const t = parseCsv('title,notes\nRead chapter 1,first\n');
    const q = planCsv(t.header, t.rows, 'tasks', { courses: [], tasks: [], now: NOW });
    expect(q.snapshot.tasks![0]).toMatchObject({
      title: 'Read chapter 1', notes: 'first', createdAt: NOW, completedAt: null,
      reminders: [], subtasks: [], status: 0, priority: 0,
    });
    expect(q.breakdown.tasks).toEqual({ write: 1, skip: 0, add: 1, update: 0 });
  });

  it('merges an attendance row over the mark already on the phone', () => {
    const key = '2026-09-14|08:30|C1';
    const existing: AttRecord = { key, status: 'l', at: 123, reason: 'bus' };
    const t = parseCsv('date,course,start,status,reason\n2026-09-14,DB Systems,08:30,,\n');
    const q = planCsv(t.header, t.rows, 'attendance', { courses: [course('C1', 'DB Systems')], attendance: { [key]: existing }, now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.attendance![key]).toEqual(existing);
  });

  it('merges a day mark over the one already on the phone', () => {
    const existing: DayMark = { date: '2026-09-15', status: 'c', at: 99, reason: 'holiday' };
    const t = parseCsv('date,status,reason\n2026-09-15,,\n');
    const q = planCsv(t.header, t.rows, 'dayMarks', { dayMarks: { '2026-09-15': existing }, now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.dayMarks!['2026-09-15']).toEqual(existing);
  });

  it('merges a marks row over the mark an earlier import created', () => {
    const first = planCsv(
      parseCsv('course,item,score,weight,counted\nDB Systems,Quiz 1,18,10,yes\n').header,
      parseCsv('course,item,score,weight,counted\nDB Systems,Quiz 1,18,10,yes\n').rows,
      'marks', { courses: [course('C1', 'DB Systems')], now: NOW },
    );
    const onPhone: Mark = { ...first.snapshot.marks![0]!, score: 17, on: false };
    const t = parseCsv('course,item,score,weight,counted\nDB Systems,Quiz 1,,,\n');
    const q = planCsv(t.header, t.rows, 'marks', { courses: [course('C1', 'DB Systems')], marks: [onPhone], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.snapshot.marks).toEqual([onPhone]);
  });

  it('a ragged row is a problem with its line number, and the rest of the file still plans', () => {
    const t = parseCsv('name,room\nMaths,A1\nHistory\nGeography,C3\n');
    const q = planCsv(t.header, t.rows, 'courses', { now: NOW });
    expect(q.counts).toEqual({ courses: 2 });
    expect(messages(q)).toEqual(['line 3 · row: Expected 2 fields, found 1.']);
  });

  it('an ambiguous header asks which table it is instead of guessing', () => {
    const t = parseCsv('date,course\n2026-09-14,DB Systems\n');
    expect(detectDataset(t.header)).toBe(null);
    const q = planCsv(t.header, t.rows, undefined, { now: NOW });
    expect(q.counts).toEqual({});
    expect(q.problems).toHaveLength(1);
    expect(q.problems[0]).toMatchObject({ where: 'file', field: 'dataset' });
    expect(q.problems[0]!.message).toContain('attendance');
  });

  it('an empty CSV is a problem, not a crash', () => {
    const q = planCsv([], [], 'courses');
    expect(q.problems).toEqual([{ where: 'file', field: 'text', message: 'That CSV is empty.' }]);
  });
});

/** The other half of the door: whatever `toCsv` writes, `planCsv` reads back. Attendance is the table
 *  that carries a status the app invented — `upcoming` — and refusing it used to disable Import for
 *  the app's own export. A class that has not finished has nothing to write, so the row is a skip. */
describe('the app\'s own CSV export, imported back', () => {
  const at = (day: number, h: number, m: number) => new Date(2026, 8, day, h, m).getTime();
  const snap: Snapshot = {
    courses: [course('C1', 'DB Systems')],
    meetings: [{ id: 'M1', courseId: 'C1', weekday: 0, start: '08:30', end: '10:00', demo: false }],
    tasks: [], notices: [], marks: [], attendance: {}, dayMarks: {}, adjusts: {}, focus: [], trips: [], alarms: [],
    settings: { ...DEFAULT_SETTINGS, semesterStart: '2026-09-07', semesterEnd: '' },
  };
  /* Monday 14 September, 08:45: the 7 September class has ended (and reads Here, inferred), the
     14 September class is still running, so the export writes it as `upcoming`. */
  const now = at(14, 8, 45);
  const attendanceTable = () => buildTables(snap, now).find((t) => t.name === 'Attendance')!;

  it('writes `upcoming` for a class that has not finished', () => {
    expect(attendanceTable().rows.map((r) => r[3])).toEqual(['p', 'upcoming']);
  });

  it('reads its own Attendance export back, treating `upcoming` as a skip and not a problem', () => {
    const csv = parseCsv(toCsv(attendanceTable()));
    const q = planCsv(csv.header, csv.rows, 'attendance', { courses: [course('C1', 'DB Systems')], now });
    expect(q.problems).toEqual([]);
    expect(q.counts).toEqual({ attendance: 1 });
    expect(q.breakdown.attendance).toEqual({ write: 1, skip: 1, add: null, update: null });
    expect(q.attendance!.map((a) => a.key)).toEqual(['2026-09-07|08:30|C1']);
  });

  it('a bare `upcoming` row is planned as nothing, not as a refused row', () => {
    const t = parseCsv('date,course,start,status,source\n2026-09-14,DB Systems,08:30,upcoming,future\n');
    const q = planCsv(t.header, t.rows, 'attendance', { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.problems).toEqual([]);
    expect(q.counts).toEqual({});
    expect(q.breakdown.attendance).toEqual({ write: 0, skip: 1, add: null, update: null });
  });
});

describe('detectImportFormat', () => {
  it('believes the extension first', () => {
    expect(detectImportFormat('margin-2026-10-28.json', 'name,room\n')).toBe('json');
    expect(detectImportFormat('ATTENDANCE.CSV', '{ "courses": [] }')).toBe('csv');
  });

  it('sniffs JSON content when there is no name, and CSV content when two lines line up', () => {
    expect(detectImportFormat(undefined, '  {"courses": []}')).toBe('json');
    expect(detectImportFormat(undefined, '[\n{ "name": "Maths" }\n]')).toBe('json');
    expect(detectImportFormat(undefined, 'name,room\nMaths,A1\n')).toBe('csv');
  });

  it('calls anything else unknown, and the plan says so instead of pretending', () => {
    expect(detectImportFormat('notes.txt', 'nothing here')).toBe('unknown');
    const p = parseImportFile('notes.txt', 'nothing here');
    expect(p.problems).toEqual([{ where: 'file', field: 'format', message: 'notes.txt is not a JSON or CSV file.' }]);
    expect(p.snapshot).toEqual({});
  });

  it('routes a JSON file through the JSON planner and a CSV file through the CSV one', () => {
    expect(parseImportFile('term.json', json({ tasks: [{ title: 'One' }] }), { now: NOW }).counts).toEqual({ tasks: 1 });
    const csvText = 'date,course,start,status\n2026-09-14,DB Systems,08:30,p\n';
    const q = parseImportFile('attendance.csv', csvText, { courses: [course('C1', 'DB Systems')], now: NOW });
    expect(q.counts).toEqual({ attendance: 1 });
  });
});
