import { dayPartsNote, inPart, labSplitOffer, partLabel, partsOf, teacherKey } from '../domain/parts';
import type { Meeting, SubjectVariant } from '../domain/types';
import { REAL_COURSES, REAL_MEETINGS, REAL_VARIANTS } from './fixtures/real-timetable';

/* v0.7.7.2 (SPEC §3): one list of a subject's parts for Grades, Stats, Today and Week. */
const v = (id: string, subjectId: string, name: string, over: Partial<SubjectVariant> = {}): SubjectVariant => ({ id, subjectId, name, room: '', teacher: '', note: '', ord: 0, ...over });
const mt = (courseId: string, variantId: string | null = null): Pick<Meeting, 'courseId' | 'variantId'> => ({ courseId, variantId });

describe('partsOf', () => {
  it('a subject with no parts has one part, the Lecture', () => {
    expect(partsOf('cp', REAL_VARIANTS, REAL_MEETINGS).map((p) => [p.name, p.isBase])).toEqual([['Lecture', true]]);
  });
  it('base + lab: the lecture first, each with its own goal (80 % unless set)', () => {
    const ps = partsOf('db', [...REAL_VARIANTS.slice(0, 1), { ...REAL_VARIANTS[1]!, attGoal: 90 }], REAL_MEETINGS);
    expect(ps.map((p) => [p.name, p.kind, p.isBase, p.goal])).toEqual([['Lecture', 'lecture', true, 80], ['Lab', 'lab', false, 90]]);
  });
  it('a lab with no base row still gets a Lecture for the classes with no variant id', () => {
    const ps = partsOf('x', [v('lab', 'x', 'Lab')], [mt('x'), mt('x', 'lab')]);
    expect(ps.map((p) => p.name)).toEqual(['Lecture', 'Lab']);
    expect(ps[0]!.id).toBe('x~base');
  });
  it('a lab with no base row and every class in the lab has no Lecture', () => {
    expect(partsOf('x', [v('lab', 'x', 'Lab')], [mt('x', 'lab')]).map((p) => p.name)).toEqual(['Lab']);
  });
  it('sorts each class into its part', () => {
    const [lec, lab] = partsOf('db', REAL_VARIANTS, REAL_MEETINGS);
    const db = REAL_MEETINGS.filter((m) => m.courseId === 'db');
    expect(db.filter((m) => inPart(lec!, m)).map((m) => m.id)).toEqual(['db-mon', 'db-tue']);
    expect(db.filter((m) => inPart(lab!, m)).map((m) => m.id)).toEqual(['db-lab']);
  });
});

describe('teacher count keys', () => {
  it('the lecture keeps the subject key, so old counts stay on it; a lab is courseId~variantId', () => {
    const [lec, lab] = partsOf('db', REAL_VARIANTS, REAL_MEETINGS);
    expect(teacherKey('db', lec!)).toBe('db');
    expect(teacherKey('db', lab!)).toBe('db~db~lab');
  });
});

describe('labels', () => {
  it('says Lab on a lab class and nothing on a lecture', () => {
    expect(partLabel('db', 'db~lab', REAL_VARIANTS)).toBe('Lab');
    expect(partLabel('db', 'db~base', REAL_VARIANTS)).toBeNull();
    expect(partLabel('db', null, REAL_VARIANTS)).toBeNull();
  });
  it('the Mark day sheet says it marks Lecture and Lab on a day that has both', () => {
    expect(dayPartsNote(1, REAL_MEETINGS, REAL_VARIANTS)).toBe('marks Lecture and Lab');
    expect(dayPartsNote(0, REAL_MEETINGS, REAL_VARIANTS)).toBeNull(); // Monday: DB's lecture only
    expect(dayPartsNote(3, REAL_MEETINGS, REAL_VARIANTS)).toBeNull(); // CP has no parts yet
  });
});

describe('the split offer (real timetable)', () => {
  it('offers Computer Programming\'s LAB301 classes, not Database Systems (it has parts)', () => {
    const cp = REAL_COURSES.find((c) => c.id === 'cp')!, db = REAL_COURSES.find((c) => c.id === 'db')!;
    expect(labSplitOffer(cp, REAL_MEETINGS, REAL_VARIANTS)).toEqual({ rooms: ['LAB301'], meetingIds: ['cp-thu'] });
    expect(labSplitOffer(db, REAL_MEETINGS, REAL_VARIANTS)).toBeNull();
  });
  it('offers nothing to a subject whose classes are all in lecture rooms, or all in labs', () => {
    expect(labSplitOffer(REAL_COURSES.find((c) => c.id === 'dm')!, REAL_MEETINGS, REAL_VARIANTS)).toBeNull();
    const all = REAL_MEETINGS.map((m) => (m.courseId === 'cp' ? { ...m, room: 'LB302' } : m));
    expect(labSplitOffer(REAL_COURSES.find((c) => c.id === 'cp')!, all, REAL_VARIANTS)).toBeNull();
  });
  it('reads LAB301, LB302 and "Lab 2" as labs, LR302 not', () => {
    const c = { id: 'z', rooms: ['LR302'] }, ms = (room: string): Meeting[] => [{ id: 'a', courseId: 'z', weekday: 0, start: '08:00', end: '09:00', room, demo: false }, { id: 'b', courseId: 'z', weekday: 1, start: '08:00', end: '09:00', room: 'LR302', demo: false }];
    for (const r of ['LAB301', 'LB302', 'Lab 2']) expect(labSplitOffer(c, ms(r), [])).not.toBeNull();
    expect(labSplitOffer(c, ms('LR303'), [])).toBeNull();
  });
});
