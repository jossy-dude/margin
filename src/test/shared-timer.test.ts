import { fromHub, opFor, parseHubTimer, type Ctx, type HubTimer } from '../domain/sharedTimer';
import { initTimer, toggle, startBreak, type TimerState } from '../domain/timer';

const T0 = 1_800_000_000_000;
const ctx = (o: Partial<Ctx> = {}): Ctx => ({ sharedId: null, me: 'PHONE', now: T0, offset: 0, flow: true, breakMs: 5 * 60_000, breaksAllowed: 2, knownTask: (id) => (id === 'task1' ? { courseId: 'c1' } : null), ...o });
const hub = (o: Partial<HubTimer> = {}): HubTimer => ({ timerId: 'DESK1', status: 'running', durationMs: 25 * 60_000, startedAt: T0 - 5 * 60_000, endsAt: T0 + 20 * 60_000, remainingMs: null, label: 'Maths', task: null, flow: true, rev: 1, by: 'DESKTOP', ...o });
const running = (min = 25, at = T0): TimerState => toggle(initTimer({ planMin: min, title: 'Read' }), at).state;

describe('shared timer: hub → Margin', () => {
  test('a timer started on the desktop shows on the phone with the same time left', () => {
    const r = fromHub(initTimer(), hub(), ctx());
    expect(r.action).toBe('set');
    expect(r.sharedId).toBe('DESK1');
    expect(r.state?.running).toBe(true);
    expect(r.state?.phase).toBe('focus');
    expect(r.state?.focusLeftMs).toBe(20 * 60_000);
    expect(r.state?.title).toBe('Maths');
    expect(r.owner).toBe('DESKTOP');
  });
  test('the hub clock offset is applied: a phone 30 s behind still shows the same end', () => {
    // hub clock = phone clock + 30 s → at phone T0 the hub is at T0+30 s, 19.5 min left
    const r = fromHub(initTimer(), hub(), ctx({ offset: 30_000 }));
    expect(r.state?.focusLeftMs).toBe(20 * 60_000 - 30_000);
  });
  test('paused on the desktop pauses the phone at the hub’s remaining time', () => {
    const local = running(25, T0 - 60_000);
    const r = fromHub(local, hub({ timerId: 'P1', status: 'paused', remainingMs: 12 * 60_000 }), ctx({ sharedId: 'P1' }));
    expect(r.action).toBe('set');
    expect(r.state?.running).toBe(false);
    expect(r.state?.focusLeftMs).toBe(12 * 60_000);
  });
  test('resumed on the desktop ends a break on the phone', () => {
    const local = startBreak(running(25, T0 - 10 * 60_000), T0 - 60_000);
    expect(local.phase).toBe('break');
    const r = fromHub(local, hub({ timerId: 'P1', endsAt: T0 + 14 * 60_000 }), ctx({ sharedId: 'P1' }));
    expect(r.state?.phase).toBe('focus');
    expect(r.state?.running).toBe(true);
    expect(r.state?.focusLeftMs).toBe(14 * 60_000);
  });
  test('our own echo changes nothing', () => {
    const local = running(25, T0);
    const r = fromHub(local, hub({ timerId: 'P1', by: 'PHONE', endsAt: T0 + 25 * 60_000 + 800 }), ctx({ sharedId: 'P1' }));
    expect(r.action).toBe('none');
  });
  test('a drift over 3 s is corrected, a flowing round is never pulled back', () => {
    const local = running(25, T0);
    expect(fromHub(local, hub({ timerId: 'P1', endsAt: T0 + 20 * 60_000 }), ctx({ sharedId: 'P1' })).state?.focusLeftMs).toBe(20 * 60_000);
    const flowing = running(1, T0 - 2 * 60_000);
    expect(fromHub(flowing, hub({ timerId: 'P1', endsAt: T0 - 60_000 }), ctx({ sharedId: 'P1' })).action).toBe('none');
  });
  test('stopped on another device clears the phone; it saves only when the phone started it; our own stop does nothing', () => {
    const local = running(25, T0 - 10 * 60_000);
    expect(fromHub(local, hub({ timerId: 'P1', status: 'stopped', by: 'DESKTOP', owner: 'DESKTOP' }), ctx({ sharedId: 'P1' }))).toMatchObject({ action: 'end', save: false });
    expect(fromHub(local, hub({ timerId: 'P1', status: 'stopped', by: 'DESKTOP', owner: 'PHONE' }), ctx({ sharedId: 'P1' }))).toMatchObject({ action: 'end', save: true });
    expect(fromHub(local, hub({ timerId: 'P1', status: 'stopped', by: 'PHONE' }), ctx({ sharedId: 'P1' })).action).toBe('none');
    expect(fromHub(local, hub({ timerId: 'OTHER', status: 'stopped' }), ctx({ sharedId: 'P1' })).action).toBe('none');
  });
  test('the round ending (done) leaves each device to its own end, so flow keeps counting', () => {
    expect(fromHub(running(), hub({ timerId: 'P1', status: 'done' }), ctx({ sharedId: 'P1' })).action).toBe('none');
  });
  test('starting while the desktop already runs one joins it, without saving the 1-second start', () => {
    const local = running(25, T0 - 1000);
    const r = fromHub(local, hub({ conflict: 'running' }), ctx({ sharedId: 'MINE' }));
    expect(r.action).toBe('set');
    expect(r.sharedId).toBe('DESK1');
    expect(r.saveFirst).toBe(false);
  });
  test('a session of our own replaced by another device keeps its minutes first', () => {
    const local = running(25, T0 - 10 * 60_000);
    const r = fromHub(local, hub(), ctx({ sharedId: 'MINE' }));
    expect(r.saveFirst).toBe(true);
  });
  test('a task Margin knows comes along; an Obsidian-only task does not', () => {
    expect(fromHub(initTimer(), hub({ task: { marginId: 'task1' } }), ctx()).state?.taskId).toBe('task1');
    expect(fromHub(initTimer(), hub({ task: { marginId: 'task1' } }), ctx()).state?.courseId).toBe('c1');
    expect(fromHub(initTimer(), hub({ task: { path: 'Daily.md', blockId: 'ab12' } }), ctx()).state?.taskId).toBeNull();
  });
});

describe('shared timer: Margin → hub', () => {
  test('start, pause, resume, finish', () => {
    const set = initTimer({ planMin: 25, title: 'Read', taskId: 'task1' });
    const on = toggle(set, T0).state;
    const s = opFor(set, on, null, T0);
    expect(s.op).toMatchObject({ op: 'start', durationMs: 25 * 60_000, label: 'Read', task: { marginId: 'task1' }, flow: true });
    const id = s.sharedId!;
    const off = toggle(on, T0 + 60_000).state;
    expect(opFor(on, off, id, T0).op).toEqual({ op: 'pause', timerId: id });
    expect(opFor(off, toggle(off, T0 + 120_000).state, id, T0).op).toEqual({ op: 'resume', timerId: id });
    expect(opFor(on, initTimer(), id, T0)).toEqual({ op: { op: 'stop', timerId: id }, sharedId: null });
  });
  test('a break is a pause to everyone else', () => {
    const on = running(25, T0 - 10 * 60_000);
    const br = startBreak(on, T0);
    expect(opFor(on, br, 'X', T0).op).toEqual({ op: 'pause', timerId: 'X' });
  });
  test('resuming with no shared id (started offline) announces a new timer', () => {
    const off = toggle(running(25, T0 - 60_000), T0).state;
    expect(opFor(off, toggle(off, T0 + 1000).state, null, T0).op?.op).toBe('start');
  });
  test('parse ignores raw ops relayed from phone Obsidian', () => {
    expect(parseHubTimer(JSON.stringify({ t: 'timer', op: 'pause', timerId: 'X' }))).toBeNull();
    expect(parseHubTimer('nope')).toBeNull();
    expect(parseHubTimer(JSON.stringify(hub()))?.timerId).toBe('DESK1');
  });
});
