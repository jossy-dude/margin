/**
 * W1/C — the Problems log (audits H1, L1).
 *
 * Two kinds of failure used to leave no trace outside a 2.6 s toast: a rejected write (H1) and a
 * rejected `notif_log` bookkeeping call (L1). Both now go through the same `recordCrash(e, 'save', …)`.
 * The crash log is doubled here so the call is what is asserted — `settings-render.test.ts` is where
 * the page that shows the entries is rendered.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { act as storeAct, getState, hydrate, stopResync } from '../store/store';
import type { Task } from '../domain/types';

jest.mock('../ui/crashlog', () => ({ recordCrash: jest.fn(() => null) }));
const recordCrash = (jest.requireMock('../ui/crashlog') as { recordCrash: jest.Mock }).recordCrash;
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('the database is not used in this test'); } }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
/** What the phone's notification module answers. The mutable object is reached from inside the
 *  factory's own functions, which run long after this module body has been evaluated. */
const notifAnswers = { planned: [] as { id: string; kind: string; at: number }[] };
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: async () => ({ added: 0, removed: 0, planned: notifAnswers.planned }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));

const NOW = new Date(2026, 9, 5, 8, 0, 0, 0).getTime();
const task = (id: string): Task => ({ id, title: 'Problem set 6', courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });
/** Let every queued microtask run: `persist`/`schedNotif` report from a `.catch`, i.e. a turn later. */
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => { jest.useFakeTimers({ now: NOW }); recordCrash.mockClear(); notifAnswers.planned = []; });
afterEach(() => { stopResync(); jest.useRealTimers(); });

describe('a failed write is still there tomorrow (W1/C · audit H1)', () => {
  it('a rejected save records a problem on the current route, keeps the row, and still toasts', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    const t = task('t-fail');
    repo.upsert = async () => { throw new Error('the database is full'); }; // the one write that fails

    storeAct.saveTask(t);
    await flush(); // `persist` reports from a `.catch`, i.e. a microtask later

    expect(recordCrash).toHaveBeenCalledWith(expect.any(Error), 'save', 'Today');
    expect(String((recordCrash.mock.calls[0]?.[0] as Error).message)).toBe('the database is full');
    // DECISIONS D5(a): the optimistic row is NOT rolled back. C1's serialised writes removed the
    // failure reachable from ordinary use, so a revert can wait until one is actually seen.
    expect(getState().tasks.some((x) => x.id === 't-fail')).toBe(true);
    expect(getState().toast?.text).toContain("Couldn't save");
    expect(getState().toast?.text).toContain('the database is full');
  });

  it('a failed reminder-bookkeeping write is a breadcrumb, not a broken scheduling pass', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    repo.schedNotif = async () => { throw new Error('the bookkeeping write failed'); };
    notifAnswers.planned = [{ id: 'n1', kind: 'classSoon', at: NOW + 600_000 }];

    jest.advanceTimersByTime(2000); // hydrate's own resync(1500)
    await flush();

    expect(recordCrash.mock.calls.map((c) => [c[1], String((c[0] as Error).message)])).toContainEqual(['save', 'the bookkeeping write failed']);
    expect(getState().plan).not.toBeNull(); // …and the pass still finished, which is the whole point of swallowing
  });

  it('both bookkeeping arms report; the old silent `.catch(() => undefined)` is gone', () => {
    const src = readFileSync(join(__dirname, '..', 'store', 'store.ts'), 'utf8');
    expect(src.match(/recordCrash\(e, 'save', state\.route\)/g)).toHaveLength(3); // persist + logNotif + schedNotif
    expect(src).not.toContain('.catch(() => undefined)');
  });
});
