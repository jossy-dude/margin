import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate, resync, stopResync, wireLifecycle } from '../store/store';
import { seedSnapshot } from '../data/seed';
import type { Plan } from '../domain/reminders';
import type { Opened } from '../domain/notifActions';
import type { NotifLogRow } from '../data/repository';

/** The store is the only place the plan, the OS queue and the log are wired together, so this is the
 *  level where "did the reminder reach the phone", "did the button write the record" and "does Delivery
 *  status now say it was opened" can be asked together. `services/notifications` is replaced wholesale
 *  and its calls are recorded — the plan is read straight off the argument the store hands it. */

const mockPerm = { read: 'undetermined', ask: 'granted' };
const mockSync = jest.fn(async (_plan: Plan, _accent: string) => ({ added: 0, removed: 0, planned: [] as { id: string; kind: string; at: number }[] }));
/* Answering an ask is what a phone does: the answer then sticks, so the *next* rebuild reads granted
   instead of asking again. Returning `undetermined` forever would say the user never decided. */
const mockEnsure = jest.fn(async (ask = false) => { if (ask) mockPerm.read = mockPerm.ask; return mockPerm.read; });
const mockStatus = jest.fn(async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, platform: 'test' }));
const mockCancelAll = jest.fn(async () => undefined);
/** D4: the store must re-apply the channels when the lock-screen toggle moves, and must not touch the
 *  channels for every other reminder setting. Recorded so both halves can be asserted. */
const mockLockscreen = jest.fn(async (_lockText: boolean) => undefined);
/** `wireLifecycle` registers once for the life of the module, so the callbacks are held outside the
 *  per-test call history — clearing them would unregister what the first test wired up. */
const mockCb: { opened: ((o: Opened) => void) | null; received: ((kind: string, id: string, at: number) => void) | null } = { opened: null, received: null };
jest.mock('../services/notifications', () => ({
  ensurePermission: (ask?: boolean) => mockEnsure(ask),
  sync: (plan: Plan, accent: string) => mockSync(plan, accent),
  cancelAll: () => mockCancelAll(),
  status: () => mockStatus(),
  onOpened: (cb: (o: Opened) => void) => { mockCb.opened = cb; return () => undefined; },
  onReceived: (cb: (kind: string, id: string, at: number) => void) => { mockCb.received = cb; return () => undefined; },
  scheduleFocusEnd: async () => undefined,
  cancelFocusEnd: async () => undefined,
  applyLockscreenText: (lockText: boolean) => mockLockscreen(lockText),
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));

/** Monday 12 Oct 2026, 08:00 — the clock every timestamp in this suite is read from, so nothing here
 *  depends on the day the tests happen to run. */
const MON = new Date(2026, 9, 12, 8, 0).getTime();
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const settle = async (ms: number) => { await jest.advanceTimersByTimeAsync(ms); await flush(); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(MON);
  mockPerm.read = 'granted'; mockPerm.ask = 'granted'; // the state of a phone that has already decided
  mockSync.mockClear(); mockEnsure.mockClear(); mockStatus.mockClear(); mockCancelAll.mockClear(); mockLockscreen.mockClear();
  // `mockCb` is deliberately *not* cleared: `wireLifecycle` registers once per module, so its
  // callbacks stay live for every later test in this file.
});
// the store debounces a queue rebuild into a timer; without dropping it, it fires after jest has
// torn its module registry down and takes the worker with it.
afterEach(() => { stopResync(); jest.useRealTimers(); });

async function boot() {
  const repo = new MemoryRepository(() => Date.now());
  await repo.seed(seedSnapshot());
  await hydrate(repo);
  await settle(1500); // the delay hydrate gives its first rebuild
  return repo;
}
const plan = () => mockSync.mock.calls[mockSync.mock.calls.length - 1]![0];
/** `wireLifecycle` must have run in the test — the registration only happens once per module. */
const opened = () => { expect(mockCb.opened).not.toBeNull(); return mockCb.opened!; };
const received = () => { expect(mockCb.received).not.toBeNull(); return mockCb.received!; };

describe('the rebuild the store drives', () => {
  /* First on purpose: `askedPermission` is module state, so the ask can only be counted from a boot
     that has not happened yet in this file. */
  it('asks the phone for permission exactly once, on the first rebuild', async () => {
    mockPerm.read = 'undetermined'; // a phone that has never been asked
    await boot();
    const asks = () => mockEnsure.mock.calls.filter((c) => c[0] === true).length;
    expect({ asked: asks(), synced: mockSync.mock.calls.length }).toEqual({ asked: 1, synced: 1 });
    resync(0); await settle(10);
    resync(0); await settle(10);
    expect(asks()).toBe(1); // …and never again, however often the app rebuilds
    expect(mockEnsure.mock.calls.some((c) => c[0] === false)).toBe(true); // it still *reads*, every time
  });

  it('hands the phone a plan of future reminders, in order, with unique ids', async () => {
    await boot();
    const p = plan();
    expect(p.items.length).toBeGreaterThan(0);
    expect(p.items.every((x) => x.at > Date.now())).toBe(true);
    for (let i = 1; i < p.items.length; i++) expect(p.items[i]!.at).toBeGreaterThanOrEqual(p.items[i - 1]!.at);
    expect(new Set(p.items.map((x) => x.id)).size).toBe(p.items.length);
    expect(getState().plan?.count).toBe(p.items.length); // …the same numbers Delivery status shows
  });

  it('gives a class reminder the occurrence key the timetable grid reads back', async () => {
    await boot();
    const cls = plan().items.find((x) => x.kind === 'class');
    expect(cls).toBeDefined();
    // `date|time|course` is what `occKey` builds and what `applyAction` splits on; without the pipes
    // a Here/Late/Absent button has nothing to parse and marks nothing (F-04.2).
    expect(cls!.entityId).toMatch(/^\d{4}-\d\d-\d\d\|\d\d:\d\d\|\w+$/);
  });

  it('rebuilds when a task is ticked off, so its reminder leaves the queue', async () => {
    await boot();
    expect(plan().items.some((x) => x.entityId === 'seed-task-3')).toBe(true); // due 20:00, reminded 19:00
    act.toggleTask('seed-task-3');
    await settle(700);
    expect(getState().tasks.find((x) => x.id === 'seed-task-3')!.status).toBe(2);
    expect(plan().items.some((x) => x.entityId === 'seed-task-3')).toBe(false);
  });

  it('rebuilds when reminders are turned down, and the plan reflects the new setting', async () => {
    await boot();
    act.setNotif({ classSoon: false });
    await settle(500);
    expect(plan().items.every((x) => x.kind !== 'class')).toBe(true);
    expect(plan().items.some((x) => x.kind === 'ended')).toBe(true); // only the heads-up went away
  });

  /* D4. Android keeps a channel's settings, so writing `lockText` into the settings is not enough — the
     two reminder channels have to be re-applied. And it must be *only* that toggle: re-applying on
     every reminder setting would rewrite channels the user may have tuned by hand. */
  it('re-applies the lock-screen channels when — and only when — that toggle moves', async () => {
    await boot();
    act.setNotif({ classSoon: false });
    await settle(500);
    expect(mockLockscreen).not.toHaveBeenCalled();
    act.setNotif({ lockText: false });
    await settle(500);
    expect(mockLockscreen.mock.calls).toEqual([[false]]);
    expect(getState().settings.notif.lockText).toBe(false);
    act.setNotif({ lockText: true });
    await settle(500);
    expect(mockLockscreen.mock.calls).toEqual([[false], [true]]);
  });

  it('does not hand the plan to the OS when permission is refused', async () => {    mockPerm.read = 'denied';
    await boot();
    expect(mockSync).not.toHaveBeenCalled();
    act.setNotif({ enabled: false });
    await settle(500);
    expect(mockCancelAll).toHaveBeenCalled(); // turning them off clears what is already queued
  });
});

describe('a notification the user acted on', () => {
  it('marks the class under the same key the timetable uses, and opens Today (F-04.2)', async () => {
    await boot();
    wireLifecycle();
    const ended = plan().items.find((x) => x.kind === 'ended')!;
    expect(ended).toBeDefined();
    opened()({ route: 'Today', kind: ended.kind, id: ended.id, at: ended.at, action: { kind: 'att', status: 'p', key: ended.entityId } });
    expect(getState().attendance[ended.entityId]).toMatchObject({ status: 'p', key: ended.entityId });
    expect(getState().toast?.text).toBe('Marked Here'); // the timetable check passed, so it was written
    expect(getState().route).toBe('Today');
  });

  it('a stale class key is refused with a line instead of writing a record nothing reads', async () => {
    await boot();
    wireLifecycle();
    opened()({ route: 'Today', kind: 'ended', id: 'ended-old', at: MON, action: { kind: 'att', status: 'a', key: '2020-01-01|08:00|GONE' } });
    expect(getState().attendance['2020-01-01|08:00|GONE']).toBeUndefined();
    expect(getState().toast?.text).toBe('That class is no longer in your timetable');
  });

  it('a plain tap navigates to the page the reminder pointed at and writes nothing', async () => {
    await boot();
    wireLifecycle();
    act.go('Today');
    const t = plan().items.find((x) => x.kind === 'task')!;
    expect(t).toBeDefined();
    opened()({ route: 'Tasks', kind: 'task', id: t.id, at: t.at, action: null });
    expect(getState().route).toBe('Tasks');
    expect(Object.keys(getState().attendance)).toHaveLength(0);
  });

  it('a Done button on an open task completes it, and never un-completes a finished one', async () => {
    await boot();
    wireLifecycle();
    opened()({ route: 'Tasks', kind: 'task', id: 'task-x', at: MON, action: { kind: 'task', taskId: 'seed-task-3' } });
    expect(getState().tasks.find((x) => x.id === 'seed-task-3')!.status).toBe(2);
    opened()({ route: 'Tasks', kind: 'task', id: 'task-x', at: MON, action: { kind: 'task', taskId: 'seed-task-3' } });
    expect(getState().tasks.find((x) => x.id === 'seed-task-3')!.status).toBe(2);
    expect(getState().toast?.text).toBe('Flashcards: key dates is already done');
  });

  it('records the ring and the open, and the log page sees them without waiting for a rebuild', async () => {
    const repo = await boot();
    wireLifecycle();
    const rangAt = Date.now();
    received()('ended', 'ended-1', MON + 60_000);
    await flush();
    expect(row(await repo.notifLog(), 'ended-1')).toMatchObject({ dueAt: MON + 60_000, shownAt: rangAt, openedAt: null });
    expect(getState().notifLog.find((r) => r.id === 'ended-1')?.shownAt).toBe(rangAt); // …already on screen

    await settle(5_000); // it rang five minutes ago and is still in the shade
    const openedAt = Date.now();
    opened()({ route: 'Today', kind: 'ended', id: 'ended-1', at: MON + 60_000, action: null });
    await flush();
    expect(row(await repo.notifLog(), 'ended-1')?.openedAt).toBe(openedAt);
    expect(getState().notifLog.find((r) => r.id === 'ended-1')?.openedAt).toBe(openedAt);
    expect(getState().route).toBe('Today');
  });

  it('a reminder kind that has no row in the log is not invented one', async () => {
    const repo = await boot();
    wireLifecycle();
    received()('focus', 'focus-end', MON);
    opened()({ route: 'Today', kind: 'focus', id: 'focus-end', at: MON, action: null });
    await flush();
    expect(row(await repo.notifLog(), 'focus-end')).toBeNull();
  });
});

const row = (rows: NotifLogRow[], id: string) => rows.find((r) => r.id === id) ?? null;
