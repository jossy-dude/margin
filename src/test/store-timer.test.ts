/**
 * F3 — the focus-timer actions, pinned before F4 splits `store/store.ts`.
 *
 * The pure state machine has its own tests (`clock-engine`, `rev`); this file pins what the STORE adds
 * around it: how a round is opened from a task, the OS "round finished" notification it schedules or
 * cancels, when it commits a tick, what a finish writes, and what it says.
 */
import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate, set, stopResync } from '../store/store';
import type { Task } from '../domain/types';
import { view } from '../domain/timer';

const mockScheduleEnd = jest.fn(async (_at: number, _title: string, _body: string) => undefined);
const mockCancelEnd = jest.fn(async () => undefined);
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {},
  scheduleFocusEnd: (at: number, title: string, body: string) => mockScheduleEnd(at, title, body),
  cancelFocusEnd: () => mockCancelEnd(),
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));

const NOW = new Date(2026, 9, 5, 8).getTime();
const MIN = 60_000;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const at = (ms: number) => jest.setSystemTime(NOW + ms);
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: 'Essay draft', courseId: 'E', kind: 'assignment', dueAt: NOW + 86_400_000, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...extra });

beforeEach(() => { jest.useFakeTimers({ now: NOW }); });
afterEach(() => { stopResync(); jest.useRealTimers(); });

async function store(tasks: Task[] = [], settings: Parameters<MemoryRepository['putSettings']>[0] = {}) {
  const repo = new MemoryRepository(() => NOW);
  for (const t of tasks) await repo.upsert('task', t);
  await repo.putSettings(settings);
  await hydrate(repo);
  stopResync();
  set({ toast: null, route: 'Today', prevRoute: null, focusTaskId: null });
  mockScheduleEnd.mockClear(); mockCancelEnd.mockClear();
  return repo;
}

describe('focusOpen', () => {
  it.each([
    [37, 35], [2, 5], [300, 240], [90, 90],
  ])('a task estimated at %i min opens a %i-min round (nearest 5, clamped to 5…240)', async (estimate, plan) => {
    await store([task('t1', { estimateMin: estimate })]);
    act.focusOpen('t1');
    expect(getState().timer).toMatchObject({ phase: 'set', running: false, planMin: plan, taskId: 't1', courseId: 'E', title: 'Essay draft' });
  });

  it('a task without an estimate, or no task, opens the preset; no task is "Free focus"', async () => {
    await store([task('t1')], { focusPresetMin: 30, breakMin: 7, breaksPerRound: 3, focusFlow: false });
    act.focusOpen('t1');
    expect(getState().timer).toMatchObject({ planMin: 30, breakMs: 7 * MIN, breaksAllowed: 3, flow: false });
    act.focusOpen(null);
    expect(getState().timer).toMatchObject({ planMin: 30, taskId: null, courseId: null, title: 'Free focus' });
  });

  it('records the task and navigates to Focus, remembering where it came from', async () => {
    await store([task('t1')]);
    act.focusOpen('t1');
    expect(getState()).toMatchObject({ focusTaskId: 't1', route: 'Focus', prevRoute: 'Today' });
  });

  it('a paused round is replaced by the new one; a running round is kept', async () => {
    await store([task('a', { estimateMin: 20 }), task('b', { estimateMin: 50 })]);
    act.focusOpen('a'); act.timerToggle();
    at(MIN); act.focusOpen('b');
    expect(getState().timer).toMatchObject({ taskId: 'a', running: true, phase: 'focus' });
    expect(getState().focusTaskId).toBe('b'); // the id still moves, the round does not
    act.timerToggle(); // pause
    act.focusOpen('b');
    expect(getState().timer).toMatchObject({ taskId: 'b', planMin: 50, phase: 'set', running: false });
  });
});

describe('dial and start/pause', () => {
  it('timerSetMin moves the plan while the dial is set, and is ignored once a round runs', async () => {
    await store();
    act.focusOpen(null);
    act.timerSetMin(45);
    expect(getState().timer).toMatchObject({ planMin: 45, focusLeftMs: 45 * MIN });
    act.timerToggle();
    act.timerSetMin(10);
    expect(getState().timer.planMin).toBe(45);
  });

  it('timerSetFlow sets flow on the current round', async () => {
    await store();
    act.focusOpen(null);
    act.timerSetFlow(false);
    expect(getState().timer.flow).toBe(false);
  });

  it('starting schedules the "Round finished" notification for the end of the plan; pausing cancels it', async () => {
    await store([task('t1', { estimateMin: 25 })]);
    act.focusOpen('t1');
    const t = act.timerToggle();
    expect(t).toBe(getState().timer);
    expect(t).toMatchObject({ phase: 'focus', running: true });
    expect(mockScheduleEnd.mock.calls).toEqual([[NOW + 25 * MIN, 'Round finished', 'Essay draft · 25 min done. Take a breath.']]);
    expect(mockCancelEnd).not.toHaveBeenCalled();

    at(10 * MIN);
    act.timerToggle();
    expect(getState().timer.running).toBe(false);
    expect(mockCancelEnd).toHaveBeenCalledTimes(1);
  });
});

describe('breaks', () => {
  it('a break before five minutes of focus is refused and schedules nothing', async () => {
    await store();
    act.focusOpen(null); act.timerToggle(); mockScheduleEnd.mockClear();
    at(4 * MIN);
    act.timerBreak();
    expect(getState().timer.phase).toBe('focus');
    expect(mockScheduleEnd).not.toHaveBeenCalled();
  });

  it('a break after five minutes starts and schedules "Break is over"; back-now resumes and re-schedules the round', async () => {
    await store([], { breakMin: 5 });
    act.focusOpen(null); act.timerToggle(); mockScheduleEnd.mockClear();
    at(6 * MIN);
    act.timerBreak();
    expect(getState().timer).toMatchObject({ phase: 'break', running: true, breaksUsed: 1 });
    expect(mockScheduleEnd.mock.calls).toEqual([[NOW + 6 * MIN + 5 * MIN, 'Break is over', 'Back to it when you are ready.']]);

    mockScheduleEnd.mockClear();
    at(8 * MIN);
    act.timerBackNow();
    const t = getState().timer;
    expect(t).toMatchObject({ phase: 'focus', running: true });
    expect(mockScheduleEnd.mock.calls).toEqual([[NOW + 8 * MIN + t.focusLeftMs, 'Round finished', 'Free focus · done.']]);
  });
});

describe('timerPump (the UI ticker)', () => {
  it('writes nothing while idle, and nothing on a tick without an event', async () => {
    await store();
    act.focusOpen(null);
    const idle = getState();
    act.timerPump(NOW + MIN);
    expect(getState()).toBe(idle);

    act.timerToggle();
    const running = getState().timer;
    act.timerPump(NOW + 3 * MIN);
    expect(getState().timer).toBe(running); // a tick that crossed no boundary costs no store write
  });

  it('commits the round and raises a timer event when the round runs out', async () => {
    await store();
    act.focusOpen(null); act.timerToggle();
    const end = NOW + 25 * MIN;
    at(25 * MIN);
    act.timerPump(end);
    expect(getState().timer).toMatchObject({ rounds: 1, focusLeftMs: 0 });
    expect(getState().fev).toEqual({ k: 'roundDone', at: end });
  });
});

describe('timerFinish', () => {
  it('one minute of focus is saved — on screen and in the repository — with a toast, and the dial resets', async () => {
    const repo = await store([task('t1', { estimateMin: 50 })], { focusPresetMin: 25 });
    act.focusOpen('t1'); act.timerToggle();
    at(MIN);
    const sum = act.timerFinish();
    expect(sum).toMatchObject({ focusSec: 60, taskId: 't1', courseId: 'E', completed: false });
    expect(getState().focus.at(-1)).toMatchObject({ focusSec: 60, taskId: 't1', demo: false });
    expect(getState().toast?.text).toBe('Saved 1 min of focus');
    expect(mockCancelEnd).toHaveBeenCalled();
    // the next round keeps the task but starts from the PRESET, not the task's estimate
    expect(getState().timer).toMatchObject({ phase: 'set', running: false, planMin: 25, taskId: 't1', courseId: 'E', title: 'Essay draft' });
    await flush();
    expect((await repo.load()).focus).toHaveLength(1);
  });

  it('59 seconds is not saved, and says so', async () => {
    const repo = await store();
    act.focusOpen(null); act.timerToggle();
    at(59_000);
    expect(act.timerFinish()).toBeNull();
    expect(getState().focus).toEqual([]);
    expect(getState().toast?.text).toBe('Under a minute, so nothing was saved');
    await flush();
    expect((await repo.load()).focus).toEqual([]);
  });

  it('the discard path (save = false) writes nothing and stays silent', async () => {
    const repo = await store();
    act.focusOpen(null); act.timerToggle();
    at(10 * MIN);
    expect(act.timerFinish(false)).toBeNull();
    expect(getState().focus).toEqual([]);
    expect(getState().toast).toBeNull();
    expect(mockCancelEnd).toHaveBeenCalled();
    expect(getState().timer.phase).toBe('set');
    await flush();
    expect((await repo.load()).focus).toEqual([]);
  });

  it('timerSwap is ignored once a round has started', async () => {
    await store([task('a'), task('b')]);
    act.focusOpen('a'); act.timerToggle();
    act.timerSwap();
    expect(getState().timer.taskId).toBe('a');
  });
});

/* phone test #17 (unconfirmed on the phone: "Pause may not pause", 24:58 then 24:44 in two screenshots). The clock the
   Focus page draws is `view(timer, now)`; once Pause is pressed it must not move, however long the page waits. */
describe('Pause holds the clock still', () => {
  it('the time left after Pause is the same 14 s later, and Resume carries on from it', async () => {
    await store();
    act.timerToggle(); // start
    at(2_000);
    act.timerToggle(); // pause
    const held = view(getState().timer, NOW + 2_000).leftMs;
    expect(getState().timer.running).toBe(false);
    at(16_000);
    expect(view(getState().timer, NOW + 16_000).leftMs).toBe(held);
    act.timerToggle(); // resume
    at(20_000);
    expect(view(getState().timer, NOW + 20_000).leftMs).toBe(held - 4_000);
  });
});
