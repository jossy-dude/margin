import { onOpened, sendActionTest, sync } from '../services/notifications';
import { scheduleNotificationAsync } from '../services/notifApi';
import { makeTheme } from '../tokens/theme';
import type { Plan, Planned } from '../domain/reminders';
import type { Settings } from '../domain/types';
import {
  applyAction, CAT_ATT, CAT_TASK, DEFAULT_ACTION, dispatchOpened, logState, NOTIF_CATEGORIES, onceGuard,
  planCategory, resolveAction, responseKey, statusHint, testTarget, type NotifData, type NotifEffects,
} from '../domain/notifActions';
import { relFire } from '../domain/time';

/** `jest.mock` is hoisted above the module body, so the fake OS's mutable state has to live in a name the
 *  hoister lets the factory close over (see the note in settings-render.test.ts). */
type Handler = (r: unknown) => void;
const mockOs: { last: unknown; handlers: Handler[] } = { last: null, handlers: [] };
jest.mock('../services/notifApi', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => [] as never[]),
  scheduleNotificationAsync: jest.fn(async () => undefined),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  setNotificationCategoryAsync: jest.fn(async () => undefined),
  getLastNotificationResponse: jest.fn(() => mockOs.last),
  addNotificationResponseReceivedListener: jest.fn((cb: Handler) => { mockOs.handlers.push(cb); return { remove: () => undefined }; }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: () => undefined })),
}));

const plan: Plan = { items: [{ id: 'task-a-600', kind: 'task', at: Date.now() + 600_000, title: 't', body: 'b', channel: 'tasks', route: 'Tasks', entityId: 'a' } as Planned], deferred: 0, dropped: [] };
const PENS = ['warm', 'graphite', 'red', 'blue'] as const;
const accentOf = (pen: (typeof PENS)[number], palette: Settings['palette'] = 'refined') => makeTheme({ theme: 'light', palette, pen }, false).c.acc;
const KEY = '2026-10-06|08:30|E';
const NOW = new Date(2026, 9, 6, 8, 0).getTime();

/** A real response, as the OS hands one back: two strings the app owns nothing about. */
const response = (actionIdentifier: string, data: NotifData, identifier = 'ended-2026-10-06|08:30|E-600') => ({ actionIdentifier, notification: { date: NOW, request: { identifier, content: { title: 't', body: 'b', data } } } });
const effects = () => {
  const calls = { att: [] as [string, string][], task: [] as string[], toast: [] as string[], go: [] as string[], log: [] as [string, string, number][] };
  const fx: NotifEffects = {
    tasks: [{ id: 'task-1', status: 0, title: 'Problem set' }, { id: 'task-2', status: 2, title: 'Already done' }],
    meetings: [{ start: '08:30', courseId: 'E' }],
    setAtt: (key, status) => calls.att.push([key, status]),
    toggleTask: (id) => calls.task.push(id),
    toast: (text) => calls.toast.push(text),
    go: (route) => calls.go.push(route),
    log: (id, kind, at) => calls.log.push([id, kind, at]),
  };
  return { fx, calls };
};

describe('notification accent (BUG-009)', () => {
  it('each pen gives a different accent, so a fixed hex cannot pass this', () => { expect(new Set(PENS.map((p) => accentOf(p))).size).toBe(PENS.length); });

  it('is the accent handed in by the caller, for every pen', async () => {
    for (const pen of PENS) {
      (scheduleNotificationAsync as jest.Mock).mockClear();
      await sync(plan, accentOf(pen));
      expect((scheduleNotificationAsync as jest.Mock).mock.calls[0]![0].content.color).toBe(accentOf(pen));
    }
  });

  it('follows the palette too, not only the pen', async () => {
    for (const palette of ['refined', 'original'] as const) {
      (scheduleNotificationAsync as jest.Mock).mockClear();
      await sync(plan, accentOf('warm', palette));
      expect((scheduleNotificationAsync as jest.Mock).mock.calls[0]![0].content.color).toBe(accentOf('warm', palette));
    }
    expect(accentOf('warm')).not.toBe(accentOf('warm', 'original'));
  });
});

describe('which reminders carry which buttons', () => {
  it('classes and ended ones carry the attendance category; tasks and exams carry the done one', () => {
    expect([planCategory('class'), planCategory('ended')]).toEqual([CAT_ATT, CAT_ATT]);
    expect([planCategory('task'), planCategory('exam')]).toEqual([CAT_TASK, CAT_TASK]);
  });

  it('a start nudge carries nothing, because its entity id is a task id with a letter bolted on', () => {
    // `start` and `startBy` both plan `entityId = taskId + 's' | 'b'`, and `uid()` is base36 — its
    // alphabet contains `s` and `b`, so a real task id can end in either. A button that had to guess
    // could mark the wrong task, so there is no button.
    expect(planCategory('start')).toBeNull();
    expect(planCategory('focus')).toBeNull();
    expect(planCategory('nonsense')).toBeNull();
  });

  it('a task id that happens to end in s or b changes nothing, because nothing is parsed', () => {
    const tricky = { kind: 'task' as const, entityId: 't1a0b9s' };
    expect(planCategory(tricky.kind)).toBe(CAT_TASK);
    expect(resolveAction('task.done', tricky)).toEqual({ kind: 'task', taskId: 't1a0b9s' }); // …verbatim
  });

  it('the category ids avoid the characters the package says break matching', () => {
    for (const c of NOTIF_CATEGORIES) expect(c.identifier).not.toMatch(/[:-]/);
  });

  it('every button the categories register is one the dispatcher can turn into a write', () => {
    for (const c of NOTIF_CATEGORIES) for (const b of c.actions) {
      const kind = c.identifier === CAT_ATT ? 'ended' : 'task';
      const a = resolveAction(b.identifier, { kind, entityId: kind === 'ended' ? KEY : 'task-1' });
      expect({ button: b.identifier, resolved: a !== null, buttonTitle: b.buttonTitle.length <= 8 }).toEqual({ button: b.identifier, resolved: true, buttonTitle: true });
    }
  });

  it('and the titles are the app&rsquo;s own words for the statuses it writes', () => {
    const titles = NOTIF_CATEGORIES[0]!.actions.map((a) => a.buttonTitle);
    expect(titles).toEqual(['Here', 'Late', 'Absent']);
    expect(resolveAction('att.here', { kind: 'ended', entityId: KEY })).toEqual({ kind: 'att', status: 'p', key: KEY });
    expect(resolveAction('att.late', { kind: 'ended', entityId: KEY })).toEqual({ kind: 'att', status: 'l', key: KEY });
    expect(resolveAction('att.absent', { kind: 'ended', entityId: KEY })).toEqual({ kind: 'att', status: 'a', key: KEY });
  });
});

describe('an action is only applied when the notification it came from can support it', () => {
  it('a plain tap resolves to nothing, so it navigates exactly as it did before', () => {
    expect(resolveAction(DEFAULT_ACTION, { kind: 'ended', entityId: KEY })).toBeNull();
    expect(resolveAction('', { kind: 'task', entityId: 'task-1' })).toBeNull();
  });

  it('an unknown or stale action id degrades to navigation instead of throwing', () => {
    for (const id of ['att.sideways', 'task.undo', 'DEFAULT', 'att.here.v2', '..', 'x'.repeat(300)]) {
      expect({ id, resolved: resolveAction(id, { kind: 'ended', entityId: KEY }) }).toEqual({ id, resolved: null });
    }
  });

  it('only an identifier a registered button actually uses can ever resolve to a write', () => {
    // Not a restatement of the table above: this is the property that stops a near-miss string, a
    // button renamed in one place only, or an id left over from a build that no longer exists from
    // reaching the attendance or the task write. Every other spelling, for every kind, resolves to null.
    const nearMisses = ['att', 'att.here ', 'att.Here', 'att.here.v2', 'att.herex', 'xatt.here', 'att.late.', 'task.done.', 'task', 'task.', 'task.donev2', 'ATT.HERE', 'here', 'done'];
    for (const kind of ['class', 'ended', 'task', 'exam', 'start']) {
      for (const id of nearMisses) {
        expect({ kind, id, resolvedTo: resolveAction(id, { kind, entityId: KEY }) }).toEqual({ kind, id, resolvedTo: null });
      }
    }
  });

  it('a category button on a reminder that has no such category is refused', () => {
    expect(resolveAction('att.here', { kind: 'task', entityId: 'task-1' })).toBeNull();
    expect(resolveAction('task.done', { kind: 'ended', entityId: KEY })).toBeNull();
    expect(resolveAction('task.done', { kind: 'start', entityId: 'task-1s' })).toBeNull();
  });

  it('no entity id means no target, however good the action id is', () => {
    expect(resolveAction('att.here', { kind: 'ended' })).toBeNull();
    expect(resolveAction('att.here', { kind: 'ended', entityId: '' })).toBeNull();
  });

  it('a data payload from an old build cannot crash it', () => {
    expect(resolveAction('att.here', { kind: {}, entityId: [] as unknown as string })).toBeNull();
    expect(resolveAction(String(null), {})).toBeNull();
  });
});

describe('the write an action asks for', () => {
  it('attendance goes through with the occurrence key untouched', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'att', status: 'l', key: KEY }, fx)).toBe(true);
    expect(calls.att).toEqual([[KEY, 'l']]);
  });

  it('a class that has left the timetable is reported, not written into the table', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'att', status: 'a', key: '2026-10-06|09:15|GONE' }, fx)).toBe(false);
    expect(calls.att).toEqual([]);
    expect(calls.toast).toEqual(['That class is no longer in your timetable']);
  });

  it('a malformed key is refused the same way', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'att', status: 'p', key: 'garbage' }, fx)).toBe(false);
    expect(calls.att).toEqual([]);
  });

  it('an open task is completed through toggleTask', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'task', taskId: 'task-1' }, fx)).toBe(true);
    expect(calls.task).toEqual(['task-1']);
  });

  it('a task that is already done is not toggled back — a button that says Done cannot un-Done', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'task', taskId: 'task-2' }, fx)).toBe(false);
    expect(calls.task).toEqual([]);
    expect(calls.toast).toEqual(['Already done is already done']);
  });

  it('a deleted task is reported rather than silently dropped', () => {
    const { fx, calls } = effects();
    expect(applyAction({ kind: 'task', taskId: 'gone' }, fx)).toBe(false);
    expect(calls.task).toEqual([]);
    expect(calls.toast).toHaveLength(1);
  });
});

describe('one tap of a notification does its logging, its write and its navigation', () => {
  it('an action writes and still opens the page that shows it', () => {
    const { fx, calls } = effects();
    dispatchOpened({ route: 'Tasks', kind: 'task', id: 'task-a-600', at: NOW, action: { kind: 'task', taskId: 'task-1' } }, fx);
    expect(calls.log).toEqual([['task-a-600', 'task', NOW]]);
    expect(calls.task).toEqual(['task-1']);
    expect(calls.go).toEqual(['Tasks']);
  });

  it('a plain tap navigates and writes nothing — the behaviour that shipped before actions existed', () => {
    const { fx, calls } = effects();
    dispatchOpened({ route: 'Tasks', kind: 'task', id: 'task-a-600', at: NOW, action: null }, fx);
    dispatchOpened({ route: 'Today', kind: 'ended', id: 'e1', at: NOW, action: null }, fx);
    expect(calls.att).toEqual([]); expect(calls.task).toEqual([]); expect(calls.go).toEqual(['Tasks', 'Today']);
  });

  it('an ended reminder lands on Today whatever route its payload claimed', () => {
    const { fx, calls } = effects();
    dispatchOpened({ route: 'Tasks', kind: 'ended', id: 'e1', at: NOW, action: { kind: 'att', status: 'p', key: KEY } }, fx);
    expect(calls.go).toEqual(['Today']);
    expect(calls.att).toEqual([[KEY, 'p']]);
  });

  it('an action that cannot be applied still navigates, so the user is never left with nothing', () => {
    const { fx, calls } = effects();
    dispatchOpened({ route: 'Today', kind: 'ended', id: 'e1', at: NOW, action: { kind: 'att', status: 'a', key: 'x|y|Z' } }, fx);
    expect(calls.go).toEqual(['Today']);
    expect(calls.toast).toHaveLength(1);
  });
});

describe('the same user action can arrive twice and must be applied once', () => {
  it('a key is claimed once, and only once', () => {
    const claim = onceGuard();
    expect([claim('a'), claim('a'), claim('a')]).toEqual([true, false, false]);
  });

  it('different notifications and different buttons are different actions', () => {
    const claim = onceGuard();
    expect([claim(responseKey('att.late', 'n1')), claim(responseKey('att.late', 'n2')), claim(responseKey('att.absent', 'n1'))]).toEqual([true, true, true]);
    expect(claim(responseKey('att.late', 'n1'))).toBe(false);
  });

  it('it forgets, rather than growing for the life of the session', () => {
    const claim = onceGuard(4);
    for (let i = 0; i < 20; i++) claim(`k${i}`);
    expect(claim('k0')).toBe(true); // evicted, so it is a new key as far as the guard is concerned
    expect(claim('k19')).toBe(false);
  });

  it('a plain tap is collapsed the same way, so a cold start cannot double-navigate', () => {
    const claim = onceGuard();
    expect([claim(responseKey(DEFAULT_ACTION, 'n1')), claim(responseKey(DEFAULT_ACTION, 'n1'))]).toEqual([true, false]);
  });

  /** The defect this whole guard exists for. Tapping an action on Android launches the app, so on a
   *  cold start the same response is handed over twice: once by `getLastNotificationResponse` and once
   *  by the response listener. Without the guard that is two attendance writes, two toasts and two
   *  undo entries for one thumb. */
  it('one tap of "Late" on a killed app produces exactly one attendance write', () => {
    mockOs.last = response('att.late', { kind: 'ended', entityId: KEY, route: 'Today', planned: 'ended-1-600', at: NOW });
    mockOs.handlers = [];
    const { fx, calls } = effects();
    onOpened((o) => dispatchOpened(o, fx)); // …this reads `last` itself, as a cold start does
    for (const h of mockOs.handlers) h(mockOs.last); // …and then the listener delivers the very same response

    expect(calls.att).toEqual([[KEY, 'l']]);
    expect(calls.toast).toEqual([]);
    expect(calls.go).toEqual(['Today']);
  });

  it('and still exactly one when the app was already running', () => {
    mockOs.last = null; mockOs.handlers = [];
    const { fx, calls } = effects();
    onOpened((o) => dispatchOpened(o, fx));
    const r = response('task.done', { kind: 'task', entityId: 'task-1', route: 'Tasks', planned: 'task-1-600', at: NOW });
    for (const h of mockOs.handlers) h(r);
    expect(calls.task).toEqual(['task-1']);
    expect(calls.go).toEqual(['Tasks']);
  });

  it('two different reminders tapped one after the other both apply', () => {
    mockOs.last = null; mockOs.handlers = [];
    const { fx, calls } = effects();
    onOpened((o) => dispatchOpened(o, fx));
    for (const h of mockOs.handlers) {
      h(response('att.here', { kind: 'ended', entityId: KEY, planned: 'e1', at: NOW }, 'n1'));
      h(response('att.absent', { kind: 'ended', entityId: '2026-10-06|10:00|M', planned: 'e2', at: NOW }, 'n2'));
    }
    expect(calls.att).toEqual([[KEY, 'p']]); // the second key is not in the meetings list, so it is refused
    expect(calls.toast).toEqual(['That class is no longer in your timetable']);
  });
});

describe('what goes out on the wire', () => {
  const at = NOW + 600_000;
  const item = (o: Partial<Planned>): Planned => ({ id: 'x-1-1', kind: 'ended', at, title: 'Economics just ended', body: 'b', channel: 'classes', route: 'Today', entityId: KEY, ...o });

  it('a reminder carries its buttons, the time it is for, and the id the log is keyed on', async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    await sync({ items: [item({})], deferred: 0, dropped: [] }, '#8A4B27');
    const sent = (scheduleNotificationAsync as jest.Mock).mock.calls[0]![0];
    expect(sent.content.categoryIdentifier).toBe(CAT_ATT);
    expect(sent.content.data).toEqual({ route: 'Today', entityId: KEY, kind: 'ended', planned: 'x-1-1', at });
  });

  it('a start nudge carries the same data and no category, so nothing claims it can act', async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    await sync({ items: [item({ kind: 'start', channel: 'tasks', route: 'Tasks', entityId: 'task-1s' })], deferred: 0, dropped: [] }, '#8A4B27');
    expect((scheduleNotificationAsync as jest.Mock).mock.calls[0]![0].content.categoryIdentifier).toBeUndefined();
  });

  it('and it reports back exactly what it newly scheduled, for the log to record', async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    const r = await sync({ items: [item({}), item({ id: 'y-2-2', kind: 'task', entityId: 'task-1', channel: 'tasks', route: 'Tasks' })], deferred: 3, dropped: [{ id: 'z', why: 'weekend' }] }, '#8A4B27');
    expect(r.added).toBe(2);
    expect(r.planned).toEqual([{ id: 'x-1-1', kind: 'ended', at }, { id: 'y-2-2', kind: 'task', at }]);
  });

  it('the test notification borrows a real entity id but logs under its own, so it cannot forge a row', async () => {
    (scheduleNotificationAsync as jest.Mock).mockClear();
    expect(await sendActionTest(item({}), '#8A4B27', 10)).toBe(true);
    const sent = (scheduleNotificationAsync as jest.Mock).mock.calls[0]![0];
    expect(sent.content.categoryIdentifier).toBe(CAT_ATT);
    expect({ entityId: sent.content.data.entityId, planned: sent.content.data.planned }).toEqual({ entityId: KEY, planned: 'action-test' });
    expect(sent.content.data.at).toBeGreaterThan(Date.now());
  });
});

describe('Delivery status says what the phone can actually prove', () => {
  it('a queue it could not read is never reported as an empty one', () => {
    expect(statusHint(null)).toBe('Check what is actually scheduled');
    expect(statusHint({ permission: 'granted', scheduled: 0, queueRead: false })).toBe('allowed · the queue could not be read');
    expect(statusHint({ permission: 'granted', scheduled: 7, queueRead: true })).toBe('7 queued');
  });

  it('a blocked app is not described as an empty queue', () => {
    expect(statusHint({ permission: 'denied', scheduled: 3, queueRead: true })).toBe('notifications are blocked. nothing queued');
    expect(statusHint({ permission: 'unavailable', scheduled: 0, queueRead: false })).toBe('notifications unavailable on this phone');
  });

  it('a reminder that rang while the app was closed is not credited with a time nobody saw', () => {
    const row = { id: 'ended-1-600', kind: 'ended', dueAt: NOW, shownAt: null, openedAt: NOW + 60_000 };
    expect(logState(row, NOW + 120_000)).toBe('opened, never rang in the app');
    expect(logState({ ...row, shownAt: NOW + 30_000 }, NOW + 120_000)).toBe('opened 1 min ago');
    expect(logState({ ...row, openedAt: null, shownAt: NOW + 30_000 }, NOW + 120_000)).toBe('rang 2 min ago, not opened');
    expect(logState({ ...row, shownAt: null, openedAt: null }, NOW)).toBe('queued');
    expect(logState({ ...row, shownAt: null, openedAt: null }, NOW + 600_000)).toBe('queued, but its time passed with no sign of it');
  });

  it('a reminder whose time is unknown says so rather than showing a wrong one', () => {
    expect(logState({ id: 'legacy', kind: 'ended', dueAt: 0, shownAt: null, openedAt: null }, NOW)).toBe('queued, but its time passed with no sign of it');
  });

  it('the next fire time is absolute and relative, and never a negative wait', () => {
    expect(relFire(NOW + 12 * 60_000, NOW)).toBe('in 12 min');
    expect(relFire(NOW + 3_600_000, NOW)).toBe('in 1 h');
    expect(relFire(NOW + 5 * 60_000, NOW)).toBe('in 5 min');
    expect(relFire(NOW + 20_000, NOW)).toBe('due now');
    expect(relFire(NOW - 20_000, NOW)).toBe('due now');
    expect(relFire(NOW - 5 * 60_000, NOW)).toBe('5 min overdue');
    expect(relFire(NOW + 2 * 86_400_000, NOW)).toBe('in 2 d');
    expect(relFire(NOW - 3 * 86_400_000, NOW)).toBe('3 d overdue');
  });

  it('the action test imitates something real, and never a start nudge', () => {
    const tasks = [{ id: 't1', title: 'Problem set', courseId: null, kind: 'assignment' as const, dueAt: NOW + 7_200_000, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false }];
    const start: Planned = { id: 'start-t1s-1', kind: 'start', at: NOW + 600_000, title: 'Start: Problem set', body: 'b', channel: 'tasks', route: 'Tasks', entityId: 't1s' };
    const t = testTarget(NOW, start, tasks, 'action-test');
    expect({ id: t!.id, entityId: t!.entityId, kind: t!.kind }).toEqual({ id: 'action-test', entityId: 't1', kind: 'task' });
    expect(testTarget(NOW, start, [], 'action-test')).toBeNull();
  });
});
