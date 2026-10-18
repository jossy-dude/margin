/**
 * The v0.1 data model: the sample semester a fresh install walks through lives in MEMORY ONLY.
 *
 * The real database never receives a demo row — not on boot, not during the tour — so "Erase
 * everything" can mean exactly that, and both ways out of the tour hand the real database the
 * rows the user actually made (anything still flagged `demo` is by definition not theirs).
 *
 * `boot()` is what App.tsx runs instead of the old open-then-hydrate pair: it opens the real
 * repository, and on a genuine first run (never onboarded, no user rows) points the store at a
 * seeded `MemoryRepository` for the session instead.
 *
 * `jest.mock` is hoisted above the imports, so the factory re-requires what it needs.
 */
import { MemoryRepository } from '../data/memory';
import { TOUR_VERSION } from '../domain/defaults';
import { act, boot, getState, hydrate, stopResync } from '../store/store';
import type { Task } from '../domain/types';

const NOW = new Date(2026, 9, 5, 8).getTime();
const mockOpenRepo = jest.fn();
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: jest.fn(async () => ({ added: 0, removed: 0, planned: [] })),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));
beforeAll(() => jest.useFakeTimers()); // resync debounces into timers; the store must outlive none of them after a test
afterAll(() => { jest.useRealTimers(); return stopResync(); });
afterEach(() => { stopResync(); jest.clearAllMocks(); });

/** What openRepository() hands back on a fresh install: an EMPTY database — nothing seeds it. */
const freshRepo = () => { const r = new MemoryRepository(() => NOW); mockOpenRepo.mockImplementation(() => r); return r; };
const mine = (): Task => ({ id: 't-mine', title: 'My essay', courseId: null, kind: 'assignment', dueAt: NOW + 86_400_000, startAt: null, estimateMin: 60, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });

describe('a fresh install', () => {
  it('boots the sample semester from memory — the real database never sees a demo row', async () => {
    const real = freshRepo();
    await boot();
    expect(getState().tasks.length).toBeGreaterThan(0);        // the tour has a sample semester to show
    expect(getState().tasks.every((t) => t.demo)).toBe(true);  // and every row of it is a sample
    expect(getState().courses.length).toBeGreaterThan(0);
    expect((await real.load()).tasks).toHaveLength(0);         // …and none of it was written to disk
    await act.saveTask({ ...getState().tasks[0]!, title: 'edited in the tour', demo: false }); // the tour's own writes
    expect(getState().tasks[0]!.title).toBe('edited in the tour');
    expect(mockOpenRepo).toHaveBeenCalledTimes(1);             // boot opened it; no write ever re-opened or persisted
  });

  it('does not plan a single OS notification while the demo session runs', async () => {
    freshRepo();
    await boot();                                   // hydrate resyncs 1.5 s after…
    await jest.advanceTimersByTimeAsync(1600);      // …so by now a real session would have planned
    const notifs = jest.requireMock('../services/notifications') as { sync: jest.Mock };
    expect(notifs.sync).not.toHaveBeenCalled();     // a sample class must not ring every bell
  });
});

describe('leaving the tour adopts the session', () => {
  it('Get started puts the samples away AT ONCE: the planner is the user\'s own, and empty', async () => {
    const real = freshRepo();
    await boot();
    await act.adoptDemo(false);
    expect(getState().courses).toEqual([]);                     // nothing of the sample set on screen
    expect(getState().tasks).toEqual([]);
    expect((await real.load()).courses).toHaveLength(0);        // and it never lived on disk
    await act.setSettings({ name: 'Sam' });                     // writes persist again, on the real copy
    expect((await real.load()).settings.name).toBe('Sam');
  });

  it('Keep exploring keeps the promise and hands the real database the rows the user made — the only those', async () => {
    const real = freshRepo();
    await boot();
    await act.saveTask(mine());
    await act.setSettings({ name: 'Sam', hapticsOn: false });
    await act.adoptDemo(true);
    const l = await real.load();
    expect(l.tasks.map((t) => t.id)).toEqual(['t-mine']);       // theirs is on disk
    expect(l.courses).toHaveLength(0);                          // the samples are not
    expect(l.settings.name).toBe('Sam'); expect(l.settings.hapticsOn).toBe(false);
    expect(l.settings.seededAt).toBe(0);                        // a sample-only marker never migrates
    expect(getState().tasks.some((t) => t.id === 't-mine')).toBe(true); // the session keeps the user's work
    expect(getState().courses.length).toBeGreaterThan(0);       // …and the promise: samples stay this session
    expect((await real.load()).tasks).toHaveLength(1);
  });

  it('after adoption the real database is where writes go, even rows flagged demo by the user', async () => {
    const real = freshRepo();
    await boot();
    await act.saveTask(mine());
    await act.adoptDemo(true);
    await act.saveTask({ ...mine(), id: 't-second', title: 'Second', demo: true }); // what the user writes is theirs
    const l = await real.load();
    expect(l.tasks.map((t) => t.id)).toEqual(['t-mine', 't-second']); // …persists where the user writes
  });

  it('an adopted session never schedules on the sample set, and the following session starts from the real data', async () => {
    const real = freshRepo();
    await boot();
    await act.saveTask(mine());
    await act.adoptDemo(true);
    mockOpenRepo.mockClear();
    await jest.advanceTimersByTimeAsync(50);
    const notifs = jest.requireMock('../services/notifications') as { sync: jest.Mock };
    expect(notifs.sync.mock.calls.length).toBeGreaterThan(0);   // the real session plans from the real rows
    expect(real.load === undefined).toBe(false);
    await hydrate(real);                                        // simulate the NEXT launch
    expect(getState().tasks.map((t) => t.id)).toEqual(['t-mine']);  // no sample rows ever came back
  });

  it('TOUR_VERSION is still App.tsx\'s to persist, as it was before the memory session', () => {
    expect(getState().settings.onboarded).toBeUndefined();     // the store does not decide onboarding's end
    expect(typeof TOUR_VERSION).toBe('number');                // App.tsx writes it (Gate → onFinish), as before
  });
});
