/**
 * F3 — the semester actions, pinned at the store before F4 splits `store/store.ts`.
 *
 * `semesters-sheet.test.ts` drives the same actions through the page; this file pins the store half on
 * its own: what changes synchronously, what the repository ends up holding, what the archive contains,
 * and what the roll-over clears (since D4: everything it clears is archived first).
 */
import { MemoryRepository } from '../data/memory';
import { readSnapshot } from '../domain/archive';
import type { Course, SemesterRow, SubjectVariant } from '../domain/types';
import { act, getState, hydrate, set, stopResync } from '../store/store';

const mockSync = jest.fn(async (_plan: unknown, _accent: string) => ({ added: 0, removed: 0, planned: [] as { id: string; kind: string; at: number }[] }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: (plan: unknown, accent: string) => mockSync(plan, accent),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const settle = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); await flush(); };

beforeEach(() => { jest.useFakeTimers({ now: NOW }); mockSync.mockClear(); });
afterEach(() => { stopResync(); jest.useRealTimers(); });

const row = (extra: Partial<SemesterRow> = {}): SemesterRow => ({
  id: 's1', name: 'Autumn 2026', start: '2026-09-07', end: '2026-12-20', active: true,
  snapshotJson: null, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null, ...extra,
});
const course: Course = { id: 'E', name: 'Organic Chemistry', rooms: ['B-12'], teacher: 'Hale', goal: null, sort: 0, demo: false };
const variant: SubjectVariant = { id: 'v1', subjectId: 'E', name: 'Group B', room: 'B-14', teacher: 'Hale', note: '', ord: 0 };
const ATT = '2026-09-14|09:00|E';

/** A running term with one row in every table a roll-over reads or clears, plus last year's archive. */
async function store() {
  const r = new MemoryRepository(() => NOW);
  await r.saveSemester(row({ id: 's0', name: 'Spring 2026', start: '2026-01-12', end: '2026-05-01', active: false, archivedAt: '2026-05-02T10:00:00.000Z' }));
  await r.saveSemester(row());
  await r.setActiveSemester('s1');
  await r.upsert('course', course);
  await r.upsert('variant', variant);
  await r.upsert('meeting', { id: 'm1', courseId: 'E', weekday: 0, start: '09:00', end: '09:50', demo: false });
  await r.upsert('task', { id: 't1', title: 'Lab report', courseId: 'E', kind: 'lab', dueAt: NOW, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });
  await r.upsert('notice', { id: 'n1', courseId: 'E', text: 'Goggles', dueAt: NOW, priority: 0, demo: false });
  await r.upsert('mark', { id: 'k1', courseId: 'E', name: 'Quiz', score: 80, weight: 10, on: true, sort: 0, demo: false });
  await r.upsert('attendance', { key: ATT, status: 'p', why: 'late', at: NOW, reason: 'bus' });
  await r.upsert('dayMark', { date: '2026-09-15', status: 'c', at: NOW, reason: 'strike' });
  await hydrate(r);
  await settle(1500); mockSync.mockClear();
  jest.setSystemTime(NOW); // the action under test runs at NOW exactly
  set({ toast: null });
  return r;
}
const active = async (r: MemoryRepository) => (await r.listSemesters()).find((x) => x.active)!;

describe('renameSemester', () => {
  it('trims the name, shows it at once, and saves it', async () => {
    const r = await store();
    const done = act.renameSemester('s1', '  Autumn term  ');
    expect(getState().semesters.find((x) => x.id === 's1')?.name).toBe('Autumn term');
    await done;
    expect((await active(r)).name).toBe('Autumn term');
  });

  it('ignores a blank name, the same name, and an unknown id', async () => {
    const r = await store();
    const spy = jest.spyOn(r, 'saveSemester');
    await act.renameSemester('s1', '   ');
    await act.renameSemester('s1', 'Autumn 2026');
    await act.renameSemester('nope', 'X');
    expect(spy).not.toHaveBeenCalled();
    expect(getState().semesters.find((x) => x.id === 's1')?.name).toBe('Autumn 2026');
  });
});

describe('setSemesterRange', () => {
  it('the active term moves its row and the settings mirror together, on screen and on disk', async () => {
    const r = await store();
    const done = act.setSemesterRange('s1', '2026-09-14', '2027-01-15');
    expect(getState().semesters.find((x) => x.id === 's1')).toMatchObject({ start: '2026-09-14', end: '2027-01-15' });
    expect(getState().settings).toMatchObject({ semesterStart: '2026-09-14', semesterEnd: '2027-01-15' });
    await done;
    expect(await active(r)).toMatchObject({ id: 's1', start: '2026-09-14', end: '2027-01-15' });
    expect((await r.load()).settings).toMatchObject({ semesterStart: '2026-09-14', semesterEnd: '2027-01-15' });
  });

  it('an archived term moves only its own row; the app keeps reading the active term', async () => {
    const r = await store();
    await act.setSemesterRange('s0', '2026-01-19', '2026-05-08');
    expect(getState().semesters.find((x) => x.id === 's0')).toMatchObject({ start: '2026-01-19', end: '2026-05-08' });
    expect(getState().settings).toMatchObject({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    const rows = await r.listSemesters();
    expect(rows.find((x) => x.id === 's0')).toMatchObject({ start: '2026-01-19', active: false });
    expect(rows.find((x) => x.active)?.id).toBe('s1');
    expect((await r.load()).settings.semesterStart).toBe('2026-09-07');
  });

  it('an unknown id writes nothing', async () => {
    const r = await store();
    const spy = jest.spyOn(r, 'saveSemester');
    await act.setSemesterRange('nope', '2026-01-01', '2026-02-01');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('setActiveRange (Settings → Attendance)', () => {
  it('moves the mirror before the row write resolves, then saves the active row', async () => {
    const r = await store();
    const done = act.setActiveRange('2026-09-21', '2026-12-18');
    expect(getState().settings).toMatchObject({ semesterStart: '2026-09-21', semesterEnd: '2026-12-18' });
    await done;
    expect(await active(r)).toMatchObject({ id: 's1', start: '2026-09-21', end: '2026-12-18' });
    expect(getState().semesters.find((x) => x.active)).toMatchObject({ start: '2026-09-21' });
  });
});

describe('rollOverSemester', () => {
  it('keep attendance: archives the term, clears the schedule, keeps subjects and attendance, opens today\'s term', async () => {
    const r = await store();
    const timer = getState().timer;
    await act.rollOverSemester(true);

    const rows = await r.listSemesters();
    expect(rows).toHaveLength(3);
    const old = rows.find((x) => x.id === 's1')!;
    expect(old).toMatchObject({ active: false, archivedAt: new Date(NOW).toISOString() });
    const next = rows.find((x) => x.active)!;
    expect(next.id).not.toBe('s1');
    expect(next.start).toBe('2026-10-05');                 // `newSemester(state.now)`

    const l = await r.load();
    expect(l.courses).toEqual([course]);
    expect(l.variants).toEqual([variant]);
    expect(Object.keys(l.attendance)).toEqual([ATT]);
    expect([l.meetings, l.tasks, l.notices, l.marks].every((x) => x.length === 0)).toBe(true);
    expect(l.dayMarks).toEqual({});
    expect(l.settings).toMatchObject({ semesterStart: next.start, semesterEnd: next.end });

    const st = getState();
    expect(st.semesters).toEqual(rows);
    expect(st.meetings).toEqual([]); expect(st.tasks).toEqual([]); expect(st.notices).toEqual([]);
    expect(st.courses).toEqual([course]);
    expect(Object.keys(st.attendance)).toEqual([ATT]);
    expect(st.settings.semesterStart).toBe('2026-10-05');
    expect(st.timer).toBe(timer);                          // the roll-over keeps a running focus round
    expect(st.toast?.text).toBe('Autumn 2026 archived — attendance kept');
    await settle(0);
    expect(mockSync).toHaveBeenCalledTimes(1);             // rebuilt at once
  });

  it('the archive holds subjects, variants, timetable, attendance, marks, tasks and settings', async () => {
    const r = await store();
    await act.rollOverSemester(true);
    const old = (await r.listSemesters()).find((x) => x.id === 's1')!;
    const d = readSnapshot(old.snapshotJson!)!.datasets;
    expect(d.courses).toEqual([course]);
    expect(d.variants).toEqual([variant]);
    expect(d.meetings.map((m) => m.id)).toEqual(['m1']);
    expect(Object.keys(d.attendance)).toEqual([ATT]);
    expect(d.marks.map((m) => m.id)).toEqual(['k1']);
    expect(d.tasks.map((t) => t.id)).toEqual(['t1']);
    expect(d.settings).toMatchObject({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
  });

  it('the archive is whole: notes, day marks, curves and focus travel with the term (D4)', async () => {
    const r = await store();
    act.setAdjust('E', 4);
    await flush();
    await act.rollOverSemester(true);
    const old = (await r.listSemesters()).find((x) => x.id === 's1')!;
    const d = readSnapshot(old.snapshotJson!)!.datasets;
    expect(d.notices.map((n) => n.id)).toEqual(['n1']);
    expect(Object.keys(d.dayMarks)).toEqual(['2026-09-15']);
    expect(d.adjusts).toEqual({ E: 4 });
    expect((await r.load()).adjusts).toEqual({}); // and the curve resets for the new term
    expect(getState().adjusts).toEqual({});
  });

  it('start fresh: attendance goes with the schedule, and the toast does not mention it', async () => {
    const r = await store();
    await act.rollOverSemester(false);
    expect((await r.load()).attendance).toEqual({});
    expect(getState().attendance).toEqual({});
    expect(getState().toast?.text).toBe('Autumn 2026 archived');
  });

  it('with no active term in the cache it does nothing', async () => {
    const r = await store();
    set({ semesters: [] });
    const spy = jest.spyOn(r, 'clearActiveSchedule');
    await act.rollOverSemester(true);
    expect(spy).not.toHaveBeenCalled();
    expect(getState().toast).toBeNull();
  });
});
