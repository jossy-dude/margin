/**
 * v0.5 D1 — variants as a model: a subject owns variants, each variant owns its classes, attendance and
 * marks, and they all roll up into the subject. The owner's real data is the case: "Database" and a
 * separate "Database LAB" subject, which "Make this a variant of…" folds together without losing a row.
 */
import { MemoryRepository } from '../data/memory';
import { occKey, parseOccKey } from '../domain/attendance';
import { roomOf, splitRooms } from '../domain/rooms';
import { batchOf, duplicateMeeting, makeVariantChange } from '../domain/variants';
import type { Course, Mark, Meeting, Snapshot } from '../domain/types';
import { act, getState, hydrate, stopResync } from '../store/store';
import { db } from '../store/persist';

jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => undefined,
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));
afterEach(() => stopResync());

const course = (id: string, name: string, rooms: string[] = []): Course => ({ id, name, rooms, teacher: 'Abebe', goal: null, sort: id.length, demo: false, bar: null });
const meeting = (id: string, courseId: string, start = '08:30', extra: Partial<Meeting> = {}): Meeting => ({ id, courseId, weekday: 1, start, end: '10:00', demo: false, ...extra });
const mark = (id: string, courseId: string): Mark => ({ id, courseId, name: id, score: 80, weight: 10, on: true, sort: 0, demo: false });

function snap(): Snapshot {
  return {
    courses: [course('DB', 'Database', ['LR-601', 'LR-303']), course('DBL', 'Database LAB', ['Lab 2'])],
    meetings: [meeting('M1', 'DB'), meeting('M2', 'DBL', '14:00', { room: null })],
    attendance: { '2026-10-06|14:00|DBL': { key: '2026-10-06|14:00|DBL', status: 'l', at: 1, reason: 'bus' } },
    dayMarks: {}, tasks: [{ id: 'T1', title: 'Lab sheet', courseId: 'DBL', kind: 'lab', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false }],
    notices: [], marks: [mark('K1', 'DB'), mark('K2', 'DBL')], adjusts: { DBL: 2 }, focus: [], trips: [], alarms: [], variants: [], settings: {},
  };
}

describe('rooms', () => {
  it('splits the legacy string on , / ; · and keeps hyphenated room names whole', () => {
    expect(splitRooms('LR-601, LR-303')).toEqual(['LR-601', 'LR-303']);
    expect(splitRooms(' A1 / a1 ;B2 · ,')).toEqual(['A1', 'B2']);
    expect(splitRooms(null)).toEqual([]);
    expect(splitRooms(['x', ' y ', 'X'])).toEqual(['x', 'y']);
  });
  it('a class is in its own room, else its variant\'s, else the subject\'s first', () => {
    const c = course('DB', 'Database', ['LR-601', 'LR-303']);
    const v = [{ id: 'v1', subjectId: 'DB', name: 'Lab', room: 'Lab 2', teacher: '', note: '', ord: 0 }];
    expect(roomOf({ room: 'LR-303' }, c, v)).toBe('LR-303');
    expect(roomOf({ variantId: 'v1' }, c, v)).toBe('Lab 2');
    expect(roomOf({}, c, v)).toBe('LR-601');
    expect(roomOf(null, null)).toBe('');
  });
});

describe('attendance keys', () => {
  it('a meeting without a variant keeps the v0.1 key; a variant meeting adds ~variant', () => {
    expect(occKey('2026-10-06', { start: '08:30', courseId: 'DB' })).toBe('2026-10-06|08:30|DB');
    expect(occKey('2026-10-06', { start: '08:30', courseId: 'DB', variantId: 'v1' })).toBe('2026-10-06|08:30|DB~v1');
    expect(parseOccKey('2026-10-06|08:30|DB~v1')).toEqual({ date: '2026-10-06', start: '08:30', courseId: 'DB', variantId: 'v1' });
    expect(parseOccKey('2026-10-06|08:30|DB')).toEqual({ date: '2026-10-06', start: '08:30', courseId: 'DB', variantId: null });
    expect(parseOccKey('junk')).toBeNull();
  });
  it('refuses a second class with the same subject, variant, day and start — but not a variant in the same slot', () => {
    const ms = [meeting('M1', 'DB')];
    expect(duplicateMeeting(meeting('M9', 'DB'), ms)?.id).toBe('M1');
    expect(duplicateMeeting(meeting('M1', 'DB'), ms)).toBeUndefined(); // editing itself
    expect(duplicateMeeting(meeting('M9', 'DB', '08:30', { variantId: 'v1' }), ms)).toBeUndefined();
  });
});

describe('make this a variant of…', () => {
  it('moves classes, marks, tasks and attendance under the parent, and nothing is lost', () => {
    const c = makeVariantChange(snap(), 'DBL', 'DB', 'v1')!;
    const a = c.after;
    expect(a.variants).toEqual([{ id: 'v1', subjectId: 'DB', name: 'Database LAB', room: 'Lab 2', teacher: 'Abebe', note: '', ord: 0 }]);
    expect(a.courses.map((x) => [x.id, x.rooms])).toEqual([['DB', ['LR-601', 'LR-303', 'Lab 2']]]);
    expect(a.meetings).toEqual([{ ...meeting('M2', 'DB', '14:00'), variantId: 'v1', room: 'Lab 2' }]);
    expect(a.marks).toEqual([{ ...mark('K2', 'DB'), variantId: 'v1' }]);
    expect(a.tasks.map((t) => t.courseId)).toEqual(['DB']);
    expect(a.attendance).toEqual([{ key: '2026-10-06|14:00|DB~v1', status: 'l', at: 1, reason: 'bus' }]);
    const b = batchOf(c.before, c.after);
    expect(b.remove).toEqual([{ entity: 'course', id: 'DBL' }, { entity: 'attendance', id: '2026-10-06|14:00|DBL' }]);
  });
  it('is null for the same subject or a missing one', () => {
    expect(makeVariantChange(snap(), 'DB', 'DB', 'v')).toBeNull();
    expect(makeVariantChange(snap(), 'nope', 'DB', 'v')).toBeNull();
  });

  it('through the store: one transaction, and the undo puts every row back on screen and on disk', async () => {
    const repo = new MemoryRepository(() => 1);
    await repo.seed(snap());
    db.real = repo; db.demo = false;
    await hydrate(repo);
    act.makeVariantOf('DBL', 'DB');
    expect(getState().courses.map((c) => c.id)).toEqual(['DB']);
    expect(getState().variants.map((v) => v.name)).toEqual(['Database LAB']);
    await new Promise((r) => setTimeout(r, 0));
    let l = await repo.load();
    expect(l.courses.map((c) => c.id)).toEqual(['DB']);
    expect(l.meetings.find((m) => m.id === 'M2')).toMatchObject({ courseId: 'DB', room: 'Lab 2' });
    expect(Object.keys(l.attendance)).toEqual([expect.stringMatching(/^2026-10-06\|14:00\|DB~/)]);
    expect(l.adjusts).toEqual({ DBL: 2 }); // the child's curve stays with it, for the undo

    getState().toast?.undo?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(getState().courses.map((c) => c.id).sort()).toEqual(['DB', 'DBL']);
    expect(getState().variants).toEqual([]);
    l = await repo.load();
    expect(l.courses.map((c) => c.id).sort()).toEqual(['DB', 'DBL']);
    expect(l.courses.find((c) => c.id === 'DB')?.rooms).toEqual(['LR-601', 'LR-303']);
    expect(l.variants).toEqual([]);
    const m2 = l.meetings.find((m) => m.id === 'M2');
    expect(m2?.courseId).toBe('DBL'); expect(m2?.variantId ?? null).toBeNull();
    expect(Object.keys(l.attendance)).toEqual(['2026-10-06|14:00|DBL']);
  });

  it('deleting a subject takes its variants too, and the undo brings them back', async () => {
    const repo = new MemoryRepository(() => 1);
    await repo.seed({ ...snap(), variants: [{ id: 'v1', subjectId: 'DB', name: 'Lab', room: 'Lab 2', teacher: '', note: '', ord: 0 }] });
    db.real = repo; db.demo = false;
    await hydrate(repo);
    act.removeCourse('DB');
    await new Promise((r) => setTimeout(r, 0));
    expect((await repo.load()).variants ?? []).toEqual([]);
    getState().toast?.undo?.();
    await new Promise((r) => setTimeout(r, 0));
    expect((await repo.load()).variants!.map((v) => v.id)).toEqual(['v1']);
  });
});
