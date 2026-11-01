/**
 * F3 — the store's navigation, sheet and toast actions, pinned before F4 splits `store/store.ts`.
 * None of these touch the repository; what matters is the state each one leaves and, for toasts,
 * how long they stay.
 */
import { act, dismissToast, getState, set, snapshotOf, subscribe, toast } from '../store/store';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));

const NOW = new Date(2026, 9, 5, 8).getTime();
beforeEach(() => { jest.useFakeTimers({ now: NOW }); set({ route: 'Today', prevRoute: null, sheet: null, settingsPath: [], toast: null }); });
afterEach(() => jest.useRealTimers());

describe('navigation and sheets', () => {
  it('go moves the route and remembers the previous one; going where you are writes nothing', () => {
    act.go('Tasks');
    expect(getState()).toMatchObject({ route: 'Tasks', prevRoute: 'Today' });
    const calls: number[] = [];
    const off = subscribe(() => calls.push(1));
    act.go('Tasks');
    off();
    expect(calls).toEqual([]);
  });

  it('open / close set and clear the sheet', () => {
    act.open({ t: 'task', id: 't1' });
    expect(getState().sheet).toEqual({ t: 'task', id: 't1' });
    act.close();
    expect(getState().sheet).toBeNull();
  });

  it('openSettingsAt lands on a page under Appearance in one write', () => {
    const calls: number[] = [];
    const off = subscribe(() => calls.push(1));
    act.openSettingsAt('clock');
    off();
    expect(calls).toHaveLength(1);
    expect(getState()).toMatchObject({ sheet: { t: 'settings' }, settingsPath: ['appearance', 'clock'] });
  });

  it('settingsPush / settingsPop walk the Settings stack', () => {
    act.settingsPush('reminders'); act.settingsPush('quiet');
    expect(getState().settingsPath).toEqual(['reminders', 'quiet']);
    act.settingsPop();
    expect(getState().settingsPath).toEqual(['reminders']);
  });
});

describe('toasts', () => {
  it('a plain toast clears itself after 2.6 s', () => {
    toast('Saved');
    jest.advanceTimersByTime(2599);
    expect(getState().toast?.text).toBe('Saved');
    jest.advanceTimersByTime(1);
    expect(getState().toast).toBeNull();
  });

  it('an undo toast stays 6 s', () => {
    toast('Task deleted', () => {});
    jest.advanceTimersByTime(5999);
    expect(getState().toast?.text).toBe('Task deleted');
    jest.advanceTimersByTime(1);
    expect(getState().toast).toBeNull();
  });

  it('a newer toast replaces the older one and runs its own clock', () => {
    toast('First', () => {});
    jest.advanceTimersByTime(1000);
    toast('Second');
    expect(getState().toast?.text).toBe('Second');
    jest.advanceTimersByTime(2599);
    expect(getState().toast?.text).toBe('Second');
    jest.advanceTimersByTime(1);
    expect(getState().toast).toBeNull();
  });

  it('dismissToast clears it at once', () => {
    toast('Saved');
    dismissToast();
    expect(getState().toast).toBeNull();
  });
});

it('snapshotOf carries the twelve persisted collections and the settings, nothing of the UI', () => {
  expect(Object.keys(snapshotOf()).sort()).toEqual(['adjusts', 'alarms', 'attendance', 'courses', 'dayMarks', 'focus', 'marks', 'meetings', 'notices', 'settings', 'tasks', 'trips']);
});
