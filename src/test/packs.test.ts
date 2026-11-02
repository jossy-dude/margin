/**
 * Class timetables (owner, collage pass): Share timetable writes ONLY the subjects, variants, rooms, weekly
 * classes and term dates; a built-in pack is that file, applied as the ordinary merge-only import, so
 * applying it twice changes nothing and nothing the user had is removed.
 */
import { toTimetableJson } from '../services/export';
import { parseImport } from '../domain/importPlan';
import { PACKS } from '../domain/packs';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { act as storeAct, getState, hydrate, stopResync } from '../store/store';
import type { Course, Meeting, Snapshot, SubjectVariant } from '../domain/types';

jest.mock('expo-haptics', () => ({ NotificationFeedbackType: { Success: 'Success' } }), { virtual: true });
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));

const NOW = new Date(2026, 10, 2, 9).getTime();
const C: Course[] = [{ id: 'p-db', name: 'Database Systems', rooms: ['LR-601', 'LR-303'], teacher: 'Dr. A', goal: null, sort: 0, demo: false }, { id: 'demo-x', name: 'Sample', rooms: [], teacher: '', goal: null, sort: 1, demo: true }];
const V: SubjectVariant[] = [{ id: 'p-db-lab', subjectId: 'p-db', name: 'Lab', room: 'LAB-2', teacher: '', note: '', ord: 0 }];
const M: Meeting[] = [
  { id: 'p-m1', courseId: 'p-db', weekday: 0, start: '08:30', end: '10:20', room: 'LR-601', variantId: null, demo: false },
  { id: 'p-m2', courseId: 'p-db', weekday: 2, start: '14:00', end: '15:50', room: 'LAB-2', variantId: 'p-db-lab', demo: false },
  { id: 'demo-m', courseId: 'demo-x', weekday: 1, start: '09:00', end: '09:50', demo: true },
];
const snap = (): Snapshot => ({ ...seedSnapshot(NOW), courses: C, meetings: M, variants: V, settings: { ...seedSnapshot(NOW).settings, semesterStart: '2026-09-07', semesterEnd: '2027-01-15', name: 'Jossy' } });

afterEach(() => { stopResync(); PACKS.length = 0; });

describe('Share timetable', () => {
  it('carries only the timetable, never the sample rows or anything personal', () => {
    const f = JSON.parse(toTimetableJson(snap(), NOW, { program: 'DRB2603', section: 'B', title: 'DRB2603 · Section B' }));
    expect(f.pack).toEqual({ program: 'DRB2603', section: 'B', title: 'DRB2603 · Section B' });
    expect(Object.keys(f.raw).sort()).toEqual(['courses', 'meetings', 'settings', 'variants']);
    expect(f.raw.courses.map((c: Course) => c.id)).toEqual(['p-db']);
    expect(f.raw.meetings.map((m: Meeting) => m.id)).toEqual(['p-m1', 'p-m2']);
    expect(f.raw.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '2027-01-15' });
    expect(JSON.stringify(f)).not.toContain('Jossy');
  });
  it('imports back cleanly: subjects, the lab and the weekly classes, with no warnings', () => {
    const plan = parseImport(toTimetableJson(snap(), NOW, { program: 'X', section: 'A', title: 'X A' }), { courses: [], meetings: [], tasks: [], attendance: {}, dayMarks: {}, marks: [], variants: [], now: NOW });
    expect(plan.problems).toEqual([]);
    expect(plan.warnings).toEqual([]);
    expect(plan.counts.courses).toBe(1);
    expect(plan.counts.meetings).toBe(2);
  });
});

describe('a built-in pack', () => {
  it('applies as a merge, and applying it twice doubles nothing', async () => {
    PACKS.push({ id: 'x-a', program: 'X', section: 'A', title: 'X · Section A', data: () => JSON.parse(toTimetableJson(snap(), NOW, { program: 'X', section: 'A', title: 'X · Section A' })) });
    const repo = new MemoryRepository(() => NOW);
    await hydrate(repo);
    expect(await storeAct.applyPack('x-a')).toBe(true);
    const once = { c: getState().courses.length, m: getState().meetings.length, v: (getState().variants ?? []).length };
    expect(once).toEqual({ c: 1, m: 2, v: 1 });
    expect(await storeAct.applyPack('x-a')).toBe(true);
    expect({ c: getState().courses.length, m: getState().meetings.length, v: (getState().variants ?? []).length }).toEqual(once);
  });
  it('an unknown pack says so instead of throwing', async () => {
    await hydrate(new MemoryRepository(() => NOW));
    expect(await storeAct.applyPack('nope')).toBe(false);
    expect(getState().toast?.text).toContain('not in this build');
  });
});
