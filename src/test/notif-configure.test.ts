import { CAT_ATT, CAT_TASK } from '../domain/notifActions';

/** What boot has to register before a single reminder can reach the user: a handler so anything that
 *  arrives is shown, categories so the buttons exist, channels so Android delivers at all. They used to
 *  share one try/catch, so a phone that refused a category registration silently lost its channels too
 *  (F-04.1) — a notification with no channel is dropped by Android and nothing reports it. Each guard is
 *  exercised here on its own, which is the whole point of splitting them. */

type Fail = { handler: boolean; category: boolean; channel: string | null };
const mockState = {
  fail: { handler: false, category: false, channel: null } as Fail,
  handler: [] as unknown[],
  categories: [] as string[],
  channels: [] as { id: string; cfg: Record<string, unknown> }[],
};
/** The factory is hoisted above the module body, so it may only *close over* `mockState` — every read
 *  happens inside a function the test calls, never while the mock is being built. */
jest.mock('../services/notifApi', () => ({
  setNotificationHandler: (h: unknown) => { if (mockState.fail.handler) throw new Error('handler refused'); mockState.handler.push(h); },
  setNotificationCategoryAsync: async (id: string) => { if (mockState.fail.category) throw new Error('category refused'); mockState.categories.push(id); },
  setNotificationChannelAsync: async (id: string, cfg: Record<string, unknown>) => { if (mockState.fail.channel === id) throw new Error('channel refused'); mockState.channels.push({ id, cfg }); },
  AndroidImportance: { HIGH: 4, DEFAULT: 3, MIN: 1, LOW: 2, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getAllScheduledNotificationsAsync: async () => [],
  scheduleNotificationAsync: async () => undefined,
  cancelScheduledNotificationAsync: async () => undefined,
  cancelAllScheduledNotificationsAsync: async () => undefined,
  getPermissionsAsync: async () => ({ status: 'granted', canAskAgain: true }),
  requestPermissionsAsync: async () => ({ status: 'granted', canAskAgain: false }),
  getLastNotificationResponse: () => null,
  addNotificationResponseReceivedListener: () => ({ remove: () => undefined }),
  addNotificationReceivedListener: () => ({ remove: () => undefined }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

/** `configured` is module state, so every scenario needs its own copy of the module. `isolateModules`
 *  rather than `resetModules`, so the rest of jest's own setup is not re-required with it. */
type N = typeof import('../services/notifications');
const reset = (fail: Partial<Fail> = {}) => {
  mockState.fail = { handler: false, category: false, channel: null, ...fail };
  mockState.handler = []; mockState.categories = []; mockState.channels = [];
};
/** The module under test is not mocked (its *dependency* is), so `requireActual` — inside the
 *  isolated registry, which is what gives `configured` its fresh false. */
const load = (onPlatform?: (p: { OS: string }) => void): N => {
  let m!: N;
  jest.isolateModules(() => {
    onPlatform?.((jest.requireMock('react-native') as { Platform: { OS: string } }).Platform);
    m = jest.requireActual('../services/notifications') as N;
  });
  return m;
};
const boot = async (platform?: { OS: string }) => { const m = load(platform && ((p) => { p.OS = platform.OS; })); await m.configureNotifications(); return m; };
const behaves = async () => await (mockState.handler[0] as { handleNotification: () => Promise<unknown> }).handleNotification();
const channels = () => Object.fromEntries(mockState.channels.map((c) => [c.id, c.cfg]));

describe('configureNotifications', () => {
  it('registers a handler that shows what arrives, both categories, and all three channels', async () => {
    reset();
    await boot();
    expect(mockState.handler).toHaveLength(1);
    expect(await behaves()).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
    expect(mockState.categories).toEqual([CAT_ATT, CAT_TASK]);
    expect(mockState.channels.map((c) => c.id)).toEqual(['classes', 'tasks', 'focus']);
  });

  it('gives each channel a name, a description, an importance and a vibration pattern', async () => {
    reset();
    await boot();
    const c = channels();
    for (const id of ['classes', 'tasks', 'focus'] as const) {
      expect({ id, name: typeof c[id]!.name, desc: typeof c[id]!.description }).toEqual({ id, name: 'string', desc: 'string' });
      expect((c[id]!.name as string).length).toBeGreaterThan(0);
      expect((c[id]!.vibrationPattern as number[]).length).toBeGreaterThan(0);
    }
    // The two reminder channels are heads-up; the focus one is not allowed to interrupt.
    expect([c.classes!.importance, c.tasks!.importance, c.focus!.importance]).toEqual([4, 4, 3]);
    expect([c.classes!.enableVibrate, c.tasks!.enableVibrate]).toEqual([true, true]);
  });

  it('a category this phone refuses no longer costs the channels (F-04.1)', async () => {
    reset({ category: true });
    await expect(boot()).resolves.toBeDefined(); // …the refusal must not escape either
    expect(mockState.channels.map((c) => c.id)).toEqual(['classes', 'tasks', 'focus']);
    expect(mockState.handler).toHaveLength(1);
  });

  it('a handler this phone refuses still leaves the categories and the channels in place', async () => {
    reset({ handler: true });
    await boot();
    expect({ categories: mockState.categories, channels: mockState.channels.length }).toEqual({ categories: [CAT_ATT, CAT_TASK], channels: 3 });
  });

  it('one channel refused does not cost the other two', async () => {
    reset({ channel: 'tasks' });
    await boot();
    expect(mockState.channels.map((c) => c.id)).toEqual(['classes', 'focus']);
  });

  it('a second call changes nothing — boot configures once, not once per screen', async () => {
    reset();
    const m = load();
    await m.configureNotifications(); await m.configureNotifications(); await m.configureNotifications();
    expect({ handler: mockState.handler.length, categories: mockState.categories.length, channels: mockState.channels.length })
      .toEqual({ handler: 1, categories: 2, channels: 3 });
  });

  it('on iOS there are no channels to create, and the handler and categories still go in', async () => {
    reset();
    await boot({ OS: 'ios' });
    expect(mockState.channels).toHaveLength(0);
    expect({ handler: mockState.handler.length, categories: mockState.categories.length }).toEqual({ handler: 1, categories: 2 });
  });
});
