import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  AndroidImportance,
  DEFAULT_ACTION_IDENTIFIER,
  cancelAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  setNotificationCategoryAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from '../services/notifApi';
import type { NotificationAction } from '../services/notifApi';
import { DEFAULT_ACTION, NOTIF_CATEGORIES } from '../domain/notifActions';

const API = {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync,
  setNotificationChannelAsync,
  setNotificationCategoryAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  getLastNotificationResponse,
};

describe('notifApi (deep imports, see STATE.md deviation ledger)', () => {
  it('never resolves to the expo-notifications package root', () => {
    expect(require.resolve('expo-notifications')).toMatch(/build[/\\]index\.js$/);
    expect(require.resolve('../services/notifApi')).not.toMatch(/node_modules[/\\]expo-notifications[/\\]build[/\\]index\.js$/);
  });

  it('exposes every function notifications.ts uses', () => {
    for (const [name, fn] of Object.entries(API)) expect([name, typeof fn]).toEqual([name, 'function']);
  });

  it('exposes the trigger and channel enums with the members the planner sets', () => {
    expect(SchedulableTriggerInputTypes.DATE).toBe('date');
    expect(SchedulableTriggerInputTypes.TIME_INTERVAL).toBe('timeInterval');
    expect(AndroidImportance.DEFAULT).toBe(5);
    expect(AndroidImportance.HIGH).toBe(6);
  });

  it('the plain-tap action id the dispatcher branches on is the one the package sends', () => {
    // `domain/notifActions.ts` carries its own copy of this string so it can stay pure and importable
    // from anywhere. If the package ever changes it, that copy silently becomes a button id.
    expect({ ours: DEFAULT_ACTION, theirs: DEFAULT_ACTION_IDENTIFIER }).toEqual({ ours: 'expo.modules.notifications.actions.DEFAULT', theirs: DEFAULT_ACTION_IDENTIFIER });
  });

  it('the button shape the categories are registered in is the one the package documents', () => {
    // `{ identifier, buttonTitle }` is the whole of `NotificationAction` that the app needs; the
    // optional `textInput`/`options` are never set, so no action can prompt for text or skip auth.
    for (const b of NOTIF_CATEGORIES.flatMap((c) => c.actions)) {
      const a: NotificationAction = b;
      expect({ identifier: a.identifier, buttonTitle: a.buttonTitle, textInput: a.textInput, options: a.options }).toEqual({ identifier: b.identifier, buttonTitle: b.buttonTitle, textInput: undefined, options: undefined });
    }
  });
});