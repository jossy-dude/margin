/**
 * BUG #12 (phone test 2026-11-13): after a restart the sample term was gone but a finished sample task
 * survived, re-homed to "Personal" (its subject no longer existed), and Stats counted it. Removing the
 * sample term removes every sample item — tasks done or not, marks, attendance, alarms on its tasks —
 * and never re-homes one. An orphan already on disk is cleaned on the next start; the owner's rows are
 * never touched.
 *
 * `jest.mock` is hoisted above the imports, so the factory re-requires what it needs.
 */
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { act, boot, getState, hydrate, stopResync } from '../store/store';
import type { Course, Task } from '../domain/types';

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
beforeAll(() => jest.useFakeTimers());
afterAll(() => { jest.useRealTimers(); return stopResync(); });
afterEach(() => { stopResync(); jest.clearAllMocks(); });

const freshRepo = () => { const r = new MemoryRepository(() => NOW); mockOpenRepo.mockImplementation(() => r); return r; };
const mine = (over: Partial<Task> = {}): Task => ({ id: 't-mine', title: 'My essay', courseId: null, kind: 'assignment', dueAt: NOW + 86_400_000, startAt: null, estimateMin: 60, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...over });
const myCourse: Course = { id: 'c-mine', name: 'My subject', rooms: [], teacher: '', goal: null, sort: 0, demo: false };

describe('removing the sample term removes every sample item', () => {
  it('a sample task finished through the form in the tour does not survive as a "Personal" task', async () => {
    const real = freshRepo();
    await boot();
    const t = getState().tasks.find((x) => x.id === 'seed-task-2')!;
    await act.saveTask({ ...t, status: 2, completedAt: NOW, demo: false }); // the form save clears the flag
    await act.setAtt('2026-10-05|08:30|E', 'p');                       // attendance on a sample class
    await act.saveTask(mine());
    await act.adoptDemo(false);
    const l = await real.load();
    expect(l.tasks.map((x) => x.id)).toEqual(['t-mine']);
    expect(Object.keys(l.attendance)).toEqual([]);
    expect(getState().tasks.map((x) => x.id)).toEqual(['t-mine']);
  });
});

describe('an orphan sample row already on disk is cleaned on the next start', () => {
  it('removes sample rows whose subject is gone, keeps the owner\'s rows', async () => {
    const real = freshRepo();
    const seed = seedSnapshot(NOW);
    const done = { ...seed.tasks.find((x) => x.id === 'seed-task-1')!, demo: false };   // the phone's orphan
    const open = seed.tasks.find((x) => x.id === 'seed-task-4')!;                       // demo-flagged, subject gone
    const loose = seed.tasks.find((x) => x.id === 'seed-task-8')!;                      // demo-flagged, no subject
    const mark = seed.marks[0]!;
    await real.importSnapshot({
      courses: [myCourse], tasks: [done, open, loose, mine(), mine({ id: 't-mine-2', courseId: 'c-mine' })], marks: [mark],
      attendance: { '2026-10-05|08:30|E': { key: '2026-10-05|08:30|E', status: 'p', at: NOW, reason: '' } },
      alarms: [{ id: 'a1', at: NOW + 1000, label: 'x', enabled: true, kind: 'task', taskId: 'seed-task-4' }, { id: 'a2', at: NOW + 1000, label: 'y', enabled: true, kind: 'task', taskId: 't-mine' }],
      settings: { ...seed.settings, onboarded: 99, seededAt: 0 },
    });
    await hydrate(real);
    const l = await real.load();
    expect(l.tasks.map((x) => x.id).sort()).toEqual(['t-mine', 't-mine-2']);
    expect(l.marks).toEqual([]);
    expect(l.attendance).toEqual({});
    expect(l.alarms.map((a) => a.id)).toEqual(['a2']);
    expect(getState().tasks.map((x) => x.id).sort()).toEqual(['t-mine', 't-mine-2']);
  });

  it('leaves an install that still holds the sample subjects alone', async () => {
    const real = freshRepo();
    const seed = seedSnapshot(NOW);
    await real.importSnapshot({ ...seed, tasks: [...seed.tasks, mine()], settings: { ...seed.settings, onboarded: 99 } });
    await hydrate(real);
    expect((await real.load()).tasks).toHaveLength(seed.tasks.length + 1);
  });
});
