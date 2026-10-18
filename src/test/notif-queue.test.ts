import { sync, status, ensurePermission, scheduleFocusEnd, cancelFocusEnd, TEST_ACTION_ID } from '../services/notifications';
import type { Plan, Planned } from '../domain/reminders';

/** The OS queue as a real object rather than a mock that always answers "empty": every claim the
 *  rebuild and Delivery status make is about the *difference* between what is queued and what the plan
 *  wants, and an always-empty fake cannot express a difference. */

type Q = { identifier: string; trigger: Record<string, unknown>; content: Record<string, unknown> };
const mockState = {
  queue: new Map<string, Q>(),
  perms: { status: 'granted', canAskAgain: true } as { status: string; canAskAgain: boolean },
  requests: 0,
  readFails: false,
  permsFails: false,
};
/** Hoisted factory: `mockState` is only ever read inside a function the test calls. */
jest.mock('../services/notifApi', () => ({
  getAllScheduledNotificationsAsync: async () => { if (mockState.readFails) throw new Error('queue unreadable'); return [...mockState.queue.values()]; },
  scheduleNotificationAsync: async (o: Q) => { mockState.queue.set(o.identifier, o); },
  cancelScheduledNotificationAsync: async (id: string) => { mockState.queue.delete(id); },
  cancelAllScheduledNotificationsAsync: async () => { mockState.queue.clear(); },
  getPermissionsAsync: async () => { if (mockState.permsFails) throw new Error('no module'); return { ...mockState.perms }; },
  requestPermissionsAsync: async () => { mockState.requests++; mockState.perms = { status: 'granted', canAskAgain: false }; return { ...mockState.perms }; },
  setNotificationHandler: () => undefined,
  setNotificationChannelAsync: async () => undefined,
  setNotificationCategoryAsync: async () => undefined,
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  addNotificationReceivedListener: () => ({ remove: () => undefined }),
}));

/* Future on purpose: `scheduleFocusEnd` refuses a time already gone, and the queue keeps exactly what
   the plan holds, so every timestamp here has to be ahead of the wall clock the test runs on. */
const NOW = Date.now() + 3_600_000;
const item = (o: Partial<Planned>): Planned => ({ id: 'ended-k-600', kind: 'ended', at: NOW + 600_000, title: 'Economics just ended', body: 'b', channel: 'classes', route: 'Today', entityId: '2026-10-06|08:30|E', ...o });
const plan = (...items: Planned[]): Plan => ({ items, deferred: 0, dropped: [] });
const RESERVED = ['focus-end', 'test', TEST_ACTION_ID];

beforeEach(() => {
  mockState.queue.clear(); mockState.perms = { status: 'granted', canAskAgain: true };
  mockState.requests = 0; mockState.readFails = false; mockState.permsFails = false;
});

describe('sync makes the queue equal the plan', () => {
  it('the same plan twice adds nothing the second time — ids encode entity and minute', async () => {
    const p = plan(item({}));
    const first = await sync(p, '#8A4B27'), second = await sync(p, '#8A4B27');
    expect({ first, second }).toEqual({ first: { added: 1, removed: 0, planned: [{ id: 'ended-k-600', kind: 'ended', at: NOW + 600_000 }] }, second: { added: 0, removed: 0, planned: [] } });
    expect(mockState.queue.size).toBe(1);
  });

  it('a reminder moved by an hour cancels the old one and schedules the new one', async () => {
    await sync(plan(item({})), '#000');
    const moved = plan(item({ id: 'ended-k-1200', at: NOW + 1_200_000 }));
    const r = await sync(moved, '#000');
    expect(r).toMatchObject({ added: 1, removed: 1 });
    expect([...mockState.queue.keys()]).toEqual(['ended-k-1200']);
  });

  it('never cancels the focus, test and action-test notifications the OS holds for us', async () => {
    for (const id of RESERVED) mockState.queue.set(id, { identifier: id, trigger: {}, content: {} });
    const r = await sync(plan(), '#000'); // an empty plan would otherwise cancel everything
    expect({ r, kept: [...mockState.queue.keys()].sort() }).toEqual({ r: { added: 0, removed: 0, planned: [] }, kept: [...RESERVED].sort() });
  });

  it('schedules a DATE trigger on the channel the reminder belongs to', async () => {
    await sync(plan(item({ id: 'c1', channel: 'classes' }), item({ id: 't1', kind: 'task', channel: 'tasks', route: 'Tasks', entityId: 'x' })), '#000');
    const got = [...mockState.queue.values()].map((q) => ({ id: q.identifier, type: q.trigger.type, channelId: q.trigger.channelId, date: (q.trigger.date as Date).getTime() }));
    expect(got).toEqual([
      { id: 'c1', type: 'date', channelId: 'classes', date: NOW + 600_000 },
      { id: 't1', type: 'date', channelId: 'tasks', date: NOW + 600_000 },
    ]);
  });

  it('carries the entity id, the due time and the category the buttons need', async () => {
    await sync(plan(item({})), '#000');
    const c = mockState.queue.get('ended-k-600')!.content;
    expect(c.data).toMatchObject({ route: 'Today', entityId: '2026-10-06|08:30|E', kind: 'ended', planned: 'ended-k-600', at: NOW + 600_000 });
    expect(c.categoryIdentifier).toBe('mgatt');
  });

  it('a queue it cannot read is reported as nothing new, not as a crash', async () => {
    mockState.readFails = true;
    expect(await sync(plan(item({})), '#000')).toEqual({ added: 0, removed: 0, planned: [] });
    expect(mockState.queue.size).toBe(0);
  });
});

describe('the focus-end notification', () => {
  it('is scheduled as a DATE trigger on the focus channel', async () => {
    await scheduleFocusEnd(NOW + 90_000, 'Round finished', 'Take a break');
    const q = mockState.queue.get('focus-end')!;
    expect(q.trigger).toMatchObject({ type: 'date', channelId: 'focus' });
    expect((q.trigger.date as Date).getTime()).toBe(NOW + 90_000);
    expect(q.content).toMatchObject({ title: 'Round finished', body: 'Take a break', data: { route: 'Today', kind: 'focus' } });
  });

  it('replaces whatever was queued, so restarting a round cannot leave two', async () => {
    await scheduleFocusEnd(NOW + 60_000, 'first', 'b');
    await scheduleFocusEnd(NOW + 120_000, 'second', 'b');
    expect([...mockState.queue.keys()]).toEqual(['focus-end']);
    expect((mockState.queue.get('focus-end')!.trigger.date as Date).getTime()).toBe(NOW + 120_000);
  });

  it('is not scheduled at a time already gone, but the stale one is still cancelled', async () => {
    await scheduleFocusEnd(NOW + 60_000, 'stale', 'b');
    await scheduleFocusEnd(Date.now() + 500, 'late', 'b');
    expect(mockState.queue.has('focus-end')).toBe(false);
    expect(await cancelFocusEnd()).toBeUndefined();
  });
});

describe('status() says only what the phone can prove', () => {
  it('counts what is queued and takes the next fire time from the DATE triggers', async () => {
    await scheduleFocusEnd(NOW + 300_000, 't', 'b');
    await sync(plan(item({ id: 'a', at: NOW + 900_000 }), item({ id: 'b', at: NOW + 60_000, title: 'earlier one' })), '#000');
    const s = await status();
    expect({ scheduled: s.scheduled, next: s.next, queueRead: s.queueRead, permission: s.permission }).toEqual({ scheduled: 3, next: NOW + 60_000, queueRead: true, permission: 'granted' });
  });

  it('never takes a relative timer as a fire time — a 10 s test is not "next at 8:00"', async () => {
    mockState.queue.set('test', { identifier: 'test', trigger: { type: 'timeInterval', seconds: 10 }, content: {} });
    await sync(plan(item({ id: 'a', at: NOW + 900_000 })), '#000');
    expect(await status()).toMatchObject({ scheduled: 2, next: NOW + 900_000 });
  });

  it('a queue it cannot read is reported as unreadable, never as an empty one', async () => {
    mockState.readFails = true;
    expect(await status()).toMatchObject({ scheduled: 0, next: null, queueRead: false, permission: 'granted' });
  });

  it('a blocked app is reported as blocked, without being asked again', async () => {
    mockState.perms = { status: 'denied', canAskAgain: false };
    expect(await status()).toMatchObject({ permission: 'denied', queueRead: true });
    expect(mockState.requests).toBe(0);
  });
});

describe('ensurePermission asks only when it may', () => {
  it('does not wake the OS when it is already granted', async () => {
    expect(await ensurePermission(true)).toBe('granted');
    expect(mockState.requests).toBe(0);
  });

  it('asks when the phone has never been asked, and takes the answer', async () => {
    mockState.perms = { status: 'undetermined', canAskAgain: true };
    expect(await ensurePermission(true)).toBe('granted');
    expect(mockState.requests).toBe(1);
  });

  it('does not ask when the caller only wants to read — that is what every rebuild does', async () => {
    mockState.perms = { status: 'undetermined', canAskAgain: true };
    expect(await ensurePermission(false)).toBe('undetermined');
    expect(mockState.requests).toBe(0);
  });

  it('takes no for an answer instead of asking a phone that will not show the prompt', async () => {
    mockState.perms = { status: 'denied', canAskAgain: false };
    expect(await ensurePermission(true)).toBe('denied');
    expect(mockState.requests).toBe(0);
  });

  it('says "unavailable" when the module itself is missing', async () => {
    mockState.permsFails = true;
    expect(await ensurePermission(true)).toBe('unavailable');
    expect(mockState.requests).toBe(0);
  });
});
