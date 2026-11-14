/**
 * F3 — the store's session lifecycle, pinned before F4 splits `store/store.ts`.
 *
 * `boot` / `hydrate` decide which repository the session writes to; `adoptDemo`, `resetAll` and
 * `purgeDemo` move the session between repositories or empty one. All of them lean on module state
 * (`demoMode`, `real`, `repo`), so every test here builds its OWN store module with
 * `jest.isolateModules` — the same technique `rev.test.ts` uses — and nothing leaks between cases.
 *
 * `openRepository` (the device database) is mocked to hand back a `MemoryRepository`; the reminder
 * rebuild is observed where it lands, at `services/notifications.sync`.
 */
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { TOUR_VERSION } from '../domain/defaults';
import { parseImport } from '../domain/importPlan';
import type { Alarm, Course, FocusSession, Mark, Meeting, Notice, Task, Trip } from '../domain/types';

type Store = typeof import('../store/store');

const mockOpenRepo = jest.fn();
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));
const mockSync = jest.fn(async (_plan: unknown, _accent: string) => ({ added: 0, removed: 0, planned: [] as { id: string; kind: string; at: number }[] }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: (plan: unknown, accent: string) => mockSync(plan, accent),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));

/** Monday 5 Oct 2026, 08:00. */
const NOW = new Date(2026, 9, 5, 8).getTime();
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const settle = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); await flush(); };

const made: Store[] = [];
/** A store module nobody has booted yet: `demoMode` off, no repository, empty state. */
function freshStore(): Store {
  let s!: Store;
  jest.isolateModules(() => { s = jest.requireActual<Store>('../store/store'); });
  made.push(s);
  return s;
}
/** What `openRepository()` answers for this test. */
const device = (r = new MemoryRepository(() => NOW)) => { mockOpenRepo.mockImplementation(async () => r); return r; };

beforeEach(() => { jest.useFakeTimers({ now: NOW }); mockOpenRepo.mockReset(); mockSync.mockClear(); });
afterEach(() => { for (const s of made.splice(0)) s.stopResync(); jest.useRealTimers(); });

async function rebuildsAfter(delay: number) {
  if (delay > 0) { await settle(delay - 1); expect(mockSync).not.toHaveBeenCalled(); }
  await settle(1);
  expect(mockSync).toHaveBeenCalledTimes(1);
  mockSync.mockClear();
}

const mine = (id = 't-mine'): Task => ({ id, title: 'My essay', courseId: null, kind: 'assignment', dueAt: NOW + 86_400_000, startAt: null, estimateMin: 60, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });
const myCourse: Course = { id: 'c-mine', name: 'Latin', rooms: ['L1'], teacher: 'Varro', goal: null, sort: 9, demo: false };
const myMeeting: Meeting = { id: 'm-mine', courseId: 'c-mine', weekday: 1, start: '11:00', end: '11:50', demo: false };
const myNotice: Notice = { id: 'n-mine', courseId: null, text: 'Pay the fee', dueAt: NOW, priority: 1, demo: false };
const myMark: Mark = { id: 'k-mine', courseId: 'c-mine', name: 'Oral', score: 88, weight: 20, on: true, sort: 0, demo: false };
const myTrip: Trip = { id: 'trip-1', startedAt: NOW - 1_800_000, endedAt: NOW, route: 'bus 12', note: '' };
const myAlarm: Alarm = { id: 'al-1', at: NOW + 3_600_000, label: 'Leave', enabled: true, kind: 'leave', taskId: null };
const session: Omit<FocusSession, 'id' | 'demo'> = { taskId: 't-mine', courseId: null, startedAt: NOW - 1_200_000, endedAt: NOW, focusSec: 1200, breakSec: 0, overSec: 0, rounds: 0, planMin: 25, mode: 'focus', completed: false };
const noDemo = (s: Store) => {
  const st = s.getState();
  return [st.courses, st.meetings, st.tasks, st.notices, st.marks, st.focus].every((rows) => rows.every((r) => !r.demo));
};

describe('boot', () => {
  it('a fresh install runs the tour on a seeded memory copy: the real database receives nothing', async () => {
    const real = device();
    const s = freshStore();
    await s.boot();
    expect(mockOpenRepo).toHaveBeenCalledTimes(1);
    expect(s.getState().ready).toBe(true);
    expect(s.getState().tasks.length).toBeGreaterThan(0);
    expect(s.getState().tasks.every((t) => t.demo)).toBe(true);
    expect(s.R()).not.toBe(real);

    s.act.saveTask(mine());
    await flush();
    expect((await s.R().load()).tasks.some((t) => t.id === 't-mine')).toBe(true); // the tour's write lands in memory
    expect((await real.load()).tasks).toEqual([]);                                // …never on disk

    await settle(5000);
    expect(mockSync).not.toHaveBeenCalled(); // the demo session plans no OS reminder at all
  });

  it('a device with a row the user made hydrates from its own database, tour or no tour', async () => {
    const real = device();
    await real.upsert('task', mine());
    const s = freshStore();
    await s.boot();
    expect(s.R()).toBe(real);
    expect(s.getState().tasks.map((t) => t.id)).toEqual(['t-mine']);
    await rebuildsAfter(1500); // a real session plans, 1.5 s after hydrate
  });

  it('a device that finished the tour but has no rows hydrates the real (empty) database', async () => {
    const real = device();
    await real.putSettings({ onboarded: TOUR_VERSION });
    const s = freshStore();
    await s.boot();
    expect(s.R()).toBe(real);
    expect(s.getState().courses).toEqual([]);
    expect(s.getState().tasks).toEqual([]);
    await rebuildsAfter(1500);
  });
});

describe('hydrate', () => {
  it('loads the snapshot, its settings, a timer from the preset, and the reconciled terms', async () => {
    const r = new MemoryRepository(() => NOW);
    await r.upsert('course', myCourse);
    await r.putSettings({ focusPresetMin: 40, focusFlow: false, name: 'Sam' });
    const s = freshStore();
    await s.hydrate(r);

    const st = s.getState();
    expect(st).toMatchObject({ ready: true, error: null, now: NOW });
    expect(st.courses).toEqual([myCourse]);
    expect(st.settings).toMatchObject({ name: 'Sam', focusPresetMin: 40 });
    expect(st.timer).toMatchObject({ phase: 'set', running: false, planMin: 40, flow: false });
    const rows = await r.listSemesters();
    expect(st.semesters).toEqual(rows);
    expect(st.semesters.filter((x) => x.active)).toHaveLength(1);
    expect(st.settings.semesterStart).toBe(rows[0]!.start); // the settings mirror reads the active row
    expect(s.R()).toBe(r);
    await rebuildsAfter(1500);
  });

  it('a repository that cannot load leaves an error on screen, and the app still reaches ready', async () => {
    const r = new MemoryRepository(() => NOW);
    r.load = async () => { throw new Error('the disk is gone'); };
    const s = freshStore();
    await s.hydrate(r);
    expect(s.getState()).toMatchObject({ ready: true, error: 'the disk is gone' });
    expect(s.R()).toBe(r); // the repository was adopted before the load failed
  });
});

describe('adoptDemo — leaving the tour', () => {
  /** A demo session in which the user made one row of every kind, and touched every non-flagged table. */
  async function tourWithWork() {
    const real = device();
    const s = freshStore();
    await s.boot();
    s.act.saveTask(mine()); s.act.saveCourse(myCourse); s.act.saveMeeting(myMeeting);
    s.act.saveNotice(myNotice); s.act.saveMark(myMark); s.act.addSession(session);
    s.act.setAtt('2026-10-05|11:00|c-mine', 'p', 'bus', 'late'); s.act.setDay('2026-10-06', 'c', 'holiday'); s.act.setAdjust('c-mine', 2);
    await s.R().upsert('trip', myTrip); await s.R().upsert('alarm', myAlarm);
    s.act.setSettings({ name: 'Sam', hapticsOn: false });
    await flush();
    const demoRepo = s.R();
    return { real, s, demoRepo, before: await demoRepo.load() };
  }

  it('copies the user\'s rows, every stamp and curve, trips, alarms and settings — never a sample row', async () => {
    const { real, s, before } = await tourWithWork();
    expect(before.settings.seededAt).toBe(NOW); // the sample-only marker the hand-over must drop
    await s.act.adoptDemo(false);

    const l = await real.load();
    expect(l.courses).toEqual([myCourse]);
    expect(l.meetings).toEqual([myMeeting]);
    expect(l.tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(l.notices).toEqual([myNotice]);
    expect(l.marks).toEqual([myMark]);
    expect(l.focus.map((f) => [f.focusSec, f.demo])).toEqual([[1200, false]]);
    expect(l.attendance).toEqual(before.attendance);
    expect(l.dayMarks).toEqual(before.dayMarks);
    expect(l.adjusts).toEqual({ 'c-mine': 2 });
    expect(l.trips).toEqual([myTrip]);
    expect(l.alarms).toEqual([myAlarm]);
    expect(l.settings).toMatchObject({ name: 'Sam', hapticsOn: false, seededAt: 0 });
  });

  it('Get started: swaps to the real database, drops the samples from screen, reloads its terms, plans at once', async () => {
    const { real, s } = await tourWithWork();
    mockSync.mockClear();
    await s.act.adoptDemo(false);

    expect(s.R()).toBe(real);
    expect(noDemo(s)).toBe(true);
    expect(s.getState().tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(s.getState().courses.map((c) => c.id)).toEqual(['c-mine']);
    expect(s.getState().semesters).toEqual(await real.listSemesters());
    expect(s.getState().toast?.text).toBe('Your planner is empty — add your first class');
    await rebuildsAfter(0); // demo mode is off, so this rebuild really plans

    s.act.saveTask(mine('t-after'));
    await flush();
    expect((await real.load()).tasks.map((t) => t.id)).toEqual(['t-mine', 't-after']);
  });

  it('Keep exploring: the same hand-over, but the samples stay on screen for this session', async () => {
    const { real, s } = await tourWithWork();
    await s.act.adoptDemo(true);
    expect(s.R()).toBe(real);
    expect(s.getState().tasks.some((t) => t.demo)).toBe(true);
    expect(s.getState().tasks.some((t) => t.id === 't-mine')).toBe(true);
    expect((await real.load()).tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(s.getState().toast?.text).toBe('Your work is saved — the samples stay until the next session');
    await rebuildsAfter(0);
  });

  it('outside a demo session, Keep exploring does nothing and Get started purges sample rows', async () => {
    const real = device();
    await real.seed(seedSnapshot(NOW));
    await real.upsert('task', mine());
    const s = freshStore();
    await s.boot(); // a real row exists, so this is a real session even though the samples are on disk
    expect(s.R()).toBe(real);

    await expect(s.act.adoptDemo(true)).resolves.toBeUndefined();
    expect(s.getState().toast).toBeNull();
    expect(s.getState().tasks.some((t) => t.demo)).toBe(true);

    await s.act.adoptDemo(false);
    expect(noDemo(s)).toBe(true);
    expect(s.getState().toast?.text).toBe('Sample data removed');
    expect((await real.load()).tasks.map((t) => t.id)).toEqual(['t-mine']);
  });
});

describe('resetAll — erase everything', () => {
  it('wipes the open repository, re-opens a fresh one, and empties the store and its term cache', async () => {
    const before = new MemoryRepository(() => NOW);
    await before.seed(seedSnapshot(NOW));
    await before.upsert('task', mine());
    const s = freshStore();
    await s.hydrate(before);
    await settle(1500); mockSync.mockClear();
    expect(s.getState().semesters).toHaveLength(1);

    const after = device();
    await s.act.resetAll();
    const wiped = await before.load();
    expect([wiped.courses, wiped.tasks, wiped.marks, wiped.focus].every((x) => x.length === 0)).toBe(true);
    expect(mockOpenRepo).toHaveBeenCalledTimes(1);
    expect(s.R()).toBe(after);
    expect(s.getState()).toMatchObject({ ready: true, error: null, courses: [], tasks: [], semesters: [] });
    expect(s.getState().toast?.text).toBe('Everything erased');
    await rebuildsAfter(300);
  });

  it('inside the demo session it wipes the REAL database too, and lands on it with planning on', async () => {
    const real = device();
    await real.putSettings({ name: 'Kept' }); // a settings row, but no tour and no rows: still a first run
    const s = freshStore();
    await s.boot();
    expect(s.R()).not.toBe(real); // the tour runs on its memory copy

    await s.act.resetAll();
    // F5: "erase everything" means the device database even from inside the tour (the memory copy is
    // dropped with the session); before, the file was re-opened untouched and kept its settings.
    expect((await real.load()).settings.name).toBe('');
    expect(s.R()).toBe(real);
    expect(s.getState().tasks).toEqual([]);
    await rebuildsAfter(300); // demo mode is off again
  });
});

describe('purgeDemo', () => {
  it('removes the six sample collections from the repository and then from screen, keeping everything else', async () => {
    const r = new MemoryRepository(() => NOW);
    await r.seed(seedSnapshot(NOW));
    await r.upsert('task', mine());
    await r.upsert('attendance', { key: '2026-10-05|08:30|E', status: 'p', at: NOW, reason: '' });
    const s = freshStore();
    await s.hydrate(r);
    await settle(1500); mockSync.mockClear();

    const done = s.act.purgeDemo();
    expect(s.getState().tasks.some((t) => t.demo)).toBe(true); // the screen waits for the repository's answer
    await done;
    expect(noDemo(s)).toBe(true);
    expect(s.getState().tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(Object.keys(s.getState().attendance)).toEqual(['2026-10-05|08:30|E']);
    const l = await r.load();
    expect([l.courses, l.meetings, l.notices, l.marks, l.focus].every((x) => x.length === 0)).toBe(true);
    expect(l.tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(s.getState().toast?.text).toBe('Sample data removed');
    await rebuildsAfter(700);
  });
});

describe('importPlan', () => {
  const FILE = JSON.stringify({
    courses: [{ name: 'Organic Chem', room: 'S3' }],
    tasks: [{ title: 'Name the functional groups', course: 'Organic Chem', due: '2026-10-30T09:00' }],
  });

  it('a plan with problems is refused before anything is written', async () => {
    const r = new MemoryRepository(() => NOW);
    const s = freshStore();
    await s.hydrate(r);
    const plan = parseImport('{"tasks": [{"due": "not a date"}]}', { now: NOW });
    expect(plan.problems.length).toBeGreaterThan(0);
    await expect(s.act.importPlan(plan)).resolves.toBe(false);
    expect((await r.load()).tasks).toEqual([]);
    expect(s.getState().toast).toBeNull();
  });

  it('a clean plan lands in the repository and on screen, keeps a running focus round, and rebuilds at once', async () => {
    const r = new MemoryRepository(() => NOW);
    const s = freshStore();
    await s.hydrate(r);
    await settle(1500); mockSync.mockClear();
    s.act.focusOpen(null); s.act.timerToggle();
    const timer = s.getState().timer;

    const plan = parseImport(FILE, { now: NOW });
    expect(plan.problems).toEqual([]);
    await expect(s.act.importPlan(plan)).resolves.toBe(true);
    expect(s.getState().courses.map((c) => c.name)).toEqual(['Organic Chem']);
    expect(s.getState().tasks.map((t) => t.title)).toEqual(['Name the functional groups']);
    expect((await r.load()).tasks).toHaveLength(1);
    expect(s.getState().timer).toBe(timer); // the round was not reset
    const rows = Object.values(plan.counts).reduce((a, b) => a + b, 0);
    expect(s.getState().toast?.text).toBe(`Imported ${rows} row${rows === 1 ? '' : 's'}`);
    await rebuildsAfter(0);
  });
});

/* v0.7 R11 (DATA_MODEL.md "The move", step 5): a fresh install, onboarding's "Bring my data back", then the export
   the owner made on the old phone. On an empty database the merge-only import is a full restore: every collection
   comes back with the count it left with. */
describe('Bring my data back', () => {
  it('an export restored on an empty install has the same counts as the phone it came from', async () => {
    const { toJson } = jest.requireActual<typeof import('../services/export')>('../services/export');
    // the old phone: the sample term, but as the owner's own rows
    const own = <T extends { demo?: boolean }>(rows: T[]) => rows.map((r) => ({ ...r, demo: false }));
    const seed = seedSnapshot(NOW);
    const oldRepo = new MemoryRepository(() => NOW);
    await oldRepo.seed({ ...seed, courses: own(seed.courses), meetings: own(seed.meetings), tasks: own(seed.tasks), notices: own(seed.notices), marks: own(seed.marks), focus: own(seed.focus) });
    const old = freshStore();
    await old.hydrate(oldRepo);
    await old.act.loadSemesters();
    const was = old.getState(), file = toJson(old.snapshotOf(was), NOW, was.semesters);

    // the new phone: fresh install, onboarding with "Bring my data back"
    const real = device();
    const s = freshStore();
    await s.boot();
    await s.act.finishOnboarding({ door: 'import', name: '', semesterStart: s.getState().settings.semesterStart, semesterEnd: s.getState().settings.semesterEnd });
    expect(s.R()).toBe(real);
    expect(s.getState().settingsPath).toEqual(['data', 'import']);
    const st = s.getState();
    const plan = parseImport(file, { courses: st.courses, meetings: st.meetings, tasks: st.tasks, attendance: st.attendance, dayMarks: st.dayMarks, marks: st.marks, variants: st.variants, now: NOW });
    expect(plan.problems).toEqual([]);
    await expect(s.act.importPlan(plan)).resolves.toBe(true);

    const now = s.getState(), n = (x: object) => Object.keys(x).length;
    expect({ courses: now.courses.length, meetings: now.meetings.length, tasks: now.tasks.length, notices: now.notices.length, marks: now.marks.length, focus: now.focus.length, alarms: now.alarms.length, trips: now.trips.length, attendance: n(now.attendance), dayMarks: n(now.dayMarks), adjusts: n(now.adjusts) })
      .toEqual({ courses: was.courses.length, meetings: was.meetings.length, tasks: was.tasks.length, notices: was.notices.length, marks: was.marks.length, focus: was.focus.length, alarms: was.alarms.length, trips: was.trips.length, attendance: n(was.attendance), dayMarks: n(was.dayMarks), adjusts: n(was.adjusts) });
    expect(was.courses.length).toBeGreaterThan(0);
    expect((await real.load()).courses).toHaveLength(was.courses.length);
  });
});
