/**
 * F3 — what a failed write does TODAY, pinned so F5 changes it on purpose rather than by accident.
 *
 * DECISIONS D5(a) chose not to roll back: the optimistic change stays on screen, the failure is a
 * "Couldn't save" toast plus a Problems-log entry. Every assertion about that is marked
 * `CURRENT behaviour, changes in F5`. The repository is a `MemoryRepository` whose writes are broken
 * after hydrate, so the read side still works and the failure is the write alone.
 *
 * `expo-file-system` is replaced by an in-memory file so the real Problems log can be written without
 * a device, wherever that module lives.
 */
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import type { Task } from '../domain/types';

type Store = typeof import('../store/store');

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();
  class File {
    private k: string;
    constructor(...parts: string[]) { this.k = parts.join('/'); }
    get exists() { return files.has(this.k); }
    create() { files.set(this.k, ''); }
    delete() { files.delete(this.k); }
    write(s: string) { files.set(this.k, s); }
    textSync() { return files.get(this.k) ?? ''; }
    text() { return Promise.resolve(files.get(this.k) ?? ''); }
  }
  return { File, Paths: { document: 'doc' } };
});
const mockOpenRepo = jest.fn();
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));

const NOW = new Date(2026, 9, 5, 8).getTime();
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const FAIL = "Couldn't save: the disk is full";

const made: Store[] = [];
function freshStore(): Store {
  let s!: Store;
  jest.isolateModules(() => { s = jest.requireActual<Store>('../store/store'); });
  made.push(s);
  return s;
}
beforeEach(() => { jest.useFakeTimers({ now: NOW }); mockOpenRepo.mockReset(); });
afterEach(() => { for (const s of made.splice(0)) s.stopResync(); jest.useRealTimers(); });

/** Every write the store makes rejects from here on; reads keep working. */
function breakWrites(r: MemoryRepository) {
  const fail = async () => { throw new Error('the disk is full'); };
  r.upsert = fail; r.remove = fail; r.restore = fail; r.putSettings = fail;
  r.saveSemester = fail; r.setActiveSemester = fail; r.clearActiveSchedule = fail; r.purgeDemo = fail;
}
const task = (id: string): Task => ({ id, title: 'Problem set 6', courseId: 'E', kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });

async function brokenStore(seed?: (r: MemoryRepository) => Promise<void>) {
  const r = new MemoryRepository(() => NOW);
  if (seed) await seed(r);
  const s = freshStore();
  await s.hydrate(r);
  s.stopResync();
  s.set({ toast: null });
  const before = await r.load();
  breakWrites(r);
  return { r, s, before };
}

describe('a rejected entity write', () => {
  it.each<[string, (s: Store) => void, (s: Store) => boolean]>([
    ['saveTask', (s) => s.act.saveTask(task('t-new')), (s) => s.getState().tasks.some((t) => t.id === 't-new')],
    ['saveCourse', (s) => s.act.saveCourse({ id: 'c-new', name: 'Latin', room: '', teacher: '', goal: null, sort: 1, demo: false }), (s) => s.getState().courses.some((c) => c.id === 'c-new')],
    ['saveMark', (s) => s.act.saveMark({ id: 'k-new', courseId: 'E', name: 'Oral', score: 9, weight: 1, on: true, sort: 0, demo: false }), (s) => s.getState().marks.some((m) => m.id === 'k-new')],
    ['setAdjust', (s) => s.act.setAdjust('E', 5), (s) => s.getState().adjusts.E === 5],
    ['setSettings', (s) => s.act.setSettings({ name: 'Sam' }), (s) => s.getState().settings.name === 'Sam'],
    ['setNotif', (s) => s.act.setNotif({ classLeadMin: 20 }), (s) => s.getState().settings.notif.classLeadMin === 20],
    ['setDay', (s) => s.act.setDay('2026-10-05', 'c'), (s) => s.getState().dayMarks['2026-10-05']?.status === 'c'],
  ])('%s keeps the optimistic change on screen and toasts the failure', async (_name, run, shown) => {
    const { r, s, before } = await brokenStore();
    run(s);
    await flush();
    // CURRENT behaviour, changes in F5: no rollback — the screen keeps what the disk refused.
    expect(shown(s)).toBe(true);
    expect(s.getState().toast?.text).toBe(FAIL);
    expect(s.getState().toast?.undo).toBeUndefined();
    expect(await r.load()).toEqual(before); // nothing reached the repository
  });

  it('a rejected delete replaces the undo toast with the failure, and the row stays gone from screen only', async () => {
    const { r, s } = await brokenStore(async (rr) => { await rr.upsert('task', task('t1')); });
    s.act.removeTask('t1');
    expect(s.getState().toast?.text).toBe('Task deleted');
    await flush();
    // CURRENT behaviour, changes in F5: the undo is lost to the failure toast and nothing is reverted.
    expect(s.getState().tasks).toEqual([]);
    expect(s.getState().toast?.text).toBe(FAIL);
    expect(s.getState().toast?.undo).toBeUndefined();
    expect((await r.load()).tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('a rejected removeCourse cascade leaves the screen cascaded and the repository whole', async () => {
    const { r, s } = await brokenStore(async (rr) => {
      await rr.upsert('course', { id: 'E', name: 'Chem', room: '', teacher: '', goal: null, sort: 0, demo: false });
      await rr.upsert('meeting', { id: 'm1', courseId: 'E', weekday: 0, start: '09:00', end: '09:50', demo: false });
      await rr.upsert('mark', { id: 'k1', courseId: 'E', name: 'Quiz', score: 1, weight: 1, on: true, sort: 0, demo: false });
    });
    s.act.removeCourse('E');
    await flush();
    // CURRENT behaviour, changes in F5
    expect([s.getState().courses, s.getState().meetings, s.getState().marks].every((x) => x.length === 0)).toBe(true);
    expect(s.getState().toast?.text).toBe(FAIL);
    const l = await r.load();
    expect([l.courses.length, l.meetings.length, l.marks.length]).toEqual([1, 1, 1]);
  });
});

describe('a rejected semester write', () => {
  const withTerm = async (rr: MemoryRepository) => {
    await rr.saveSemester({ id: 's1', name: 'Autumn 2026', start: '2026-09-07', end: '2026-12-20', active: true, snapshotJson: null, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null });
    await rr.setActiveSemester('s1');
    await rr.upsert('meeting', { id: 'm1', courseId: 'E', weekday: 0, start: '09:00', end: '09:50', demo: false });
  };

  it('setSemesterRange keeps the new range on screen and toasts; the row on disk is unchanged', async () => {
    const { r, s } = await brokenStore(withTerm);
    await s.act.setSemesterRange('s1', '2026-09-14', '2027-01-15');
    // CURRENT behaviour, changes in F5
    expect(s.getState().semesters[0]).toMatchObject({ start: '2026-09-14', end: '2027-01-15' });
    expect(s.getState().settings.semesterStart).toBe('2026-09-14');
    expect(s.getState().toast?.text).toBe(FAIL);
    expect((await r.listSemesters())[0]).toMatchObject({ start: '2026-09-07', end: '2026-12-20' });
  });

  it('rollOverSemester stops at the archive write: nothing is cleared, and it says so', async () => {
    const { r, s } = await brokenStore(withTerm);
    await s.act.rollOverSemester(true);
    expect(s.getState().toast?.text).toBe("Couldn't start a new semester: the disk is full");
    expect(s.getState().meetings.map((m) => m.id)).toEqual(['m1']);
    expect((await r.load()).meetings.map((m) => m.id)).toEqual(['m1']);
    expect((await r.listSemesters()).map((x) => x.id)).toEqual(['s1']);
  });
});

describe('a rejected session write', () => {
  it('purgeDemo still clears the samples from screen and ends on its own toast', async () => {
    const { r, s } = await brokenStore(async (rr) => { await rr.seed(seedSnapshot(NOW)); });
    await s.act.purgeDemo();
    // CURRENT behaviour, changes in F5: the failure toast is overwritten and the screen drops rows the disk kept.
    expect(s.getState().tasks).toEqual([]);
    expect(s.getState().toast?.text).toBe('Sample data removed');
    expect((await r.load()).tasks.length).toBeGreaterThan(0);
  });

  it('adoptDemo whose real-database writes fail still switches to the real database', async () => {
    const real = new MemoryRepository(() => NOW);
    mockOpenRepo.mockImplementation(async () => real);
    const s = freshStore();
    await s.boot();
    s.act.saveTask(task('t-mine'));
    await flush();
    real.upsert = async () => { throw new Error('the disk is full'); };
    real.putSettings = async () => { throw new Error('the disk is full'); };

    await s.act.adoptDemo(false);
    // CURRENT behaviour, changes in F5: a half-adopted database, and the session moves on regardless.
    expect(s.R()).toBe(real);
    expect((await real.load()).tasks).toEqual([]);
    expect(s.getState().tasks.map((t) => t.id)).toEqual(['t-mine']);
    expect(s.getState().toast?.text).toBe('Your planner is empty — add your first class');
  });
});
