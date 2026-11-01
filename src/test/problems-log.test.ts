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
import { openRepository } from '../store/openRepository';
import type { Task } from '../domain/types';

jest.mock('../services/problems', () => ({ recordCrash: jest.fn(() => null) }));
const recordCrash = (jest.requireMock('../services/problems') as { recordCrash: jest.Mock }).recordCrash;
/** The adapter records the ports it was opened with, so the wiring in `store/openRepository.ts` can be
 *  asserted by what those ports DO, not by reading the file. */
const mockAdapterDeps: { report: (e: unknown, phase: 'data', where: string) => void; beforeMigration: unknown }[] = [];
jest.mock('../data/sqliteExpo', () => ({ openRepository: async (deps: never) => { mockAdapterDeps.push(deps); throw new Error('the database is not used in this test'); } }));
jest.mock('../services/safety', () => ({ dumpBeforeMigration: jest.fn(async () => null) }));
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
  it('a rejected save records a problem on the current route, takes the row back, and toasts', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    const t = task('t-fail');
    repo.upsert = async () => { throw new Error('the database is full'); }; // the one write that fails

    storeAct.saveTask(t);
    await flush(); // `persist` reports from a `.catch`, i.e. a microtask later

    expect(recordCrash).toHaveBeenCalledWith(expect.any(Error), 'save', 'Today');
    expect(String((recordCrash.mock.calls[0]?.[0] as Error).message)).toBe('the database is full');
    // F5 superseded DECISIONS D5(a): the optimistic row IS rolled back, so the screen never shows a
    // row the disk refused (store-failures.test.ts covers every entity).
    expect(getState().tasks.some((x) => x.id === 't-fail')).toBe(false);
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
    /* F4 split `store.ts` into modules behind a barrel, so this reads the whole store directory. It stays
       a source check (with the two behaviour tests above covering `persist` and `schedNotif`) because the
       other two arms — `logNotif` and the OTA marker — only fail on a device's notification callback or a
       post-update reload, which this suite cannot drive. */
    const dir = join(__dirname, '..', 'store');
    const src = ['persist.ts', 'reminders.ts', 'ota.ts'].map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    // persist + logNotif + schedNotif + the OTA update marker's write (v0.5 WS4). The last one is a
    // fourth write that must not vanish: a marker that fails to save means the post-reload sentence is
    // never shown, and the Problems log is the only place that can say why.
    expect(src.match(/recordCrash\(e, 'save', getState\(\)\.route\)/g)).toHaveLength(4);
    expect(src).not.toContain('.catch(() => undefined)');
  });
});

describe('the device repository reports into the Problems log (F2)', () => {
  it('a row the adapter skips lands in the log as a data problem, and the safety copy is the real one', async () => {
    await expect(openRepository()).rejects.toThrow('not used in this test');
    const deps = mockAdapterDeps.at(-1)!;
    deps.report(new Error('task row skipped: bad JSON'), 'data', 'task');
    expect(recordCrash).toHaveBeenCalledWith(expect.objectContaining({ message: 'task row skipped: bad JSON' }), 'data', 'task');
    expect(deps.beforeMigration).toBe((jest.requireMock('../services/safety') as { dumpBeforeMigration: unknown }).dumpBeforeMigration);
  });
});
