import { parseImport } from '../domain/importPlan';
import type { Course } from '../domain/types';
import { toJson } from '../services/export';
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
const course = (id: string, name: string): Course => ({ id, name, room: '', teacher: '', goal: null, sort: 0, demo: false });

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
      expect(c).toMatchObject({ name: 'DB Systems', room: 'B12', teacher: 'Ms. X' });
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
      expect(p.snapshot.courses![0]).toMatchObject({ name: 'maths', room: 'B2' });
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

    it('reuses a subject already on the phone instead of creating a second one', () => {
      const phone = [course('E', 'Economics')];
      const p = parse(json({
        courses: [{ name: 'economics', room: 'A1' }],
        tasks: [{ title: 'Essay', course: 'ECONOMICS' }],
        marks: [{ course: 'Economics', name: 'Quiz', score: 5, weight: 10 }],
      }), phone);
      expect(p.snapshot.courses).toBeUndefined(); // no second Economics row
      expect(p.snapshot.tasks![0]!.courseId).toBe('E');
      expect(p.snapshot.marks![0]!.courseId).toBe('E');
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
  });

  describe('the app\'s own export (shape A)', () => {
    const raw = {
      courses: [{ id: 'C1', name: 'Economics', room: 'A1', teacher: 'Mr T', goal: 80, sort: 0, demo: false }],
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
