import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from '../services/notifApi';

const API = {
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getAllScheduledNotificationsAsync,
  scheduleNotificationAsync,
  cancelScheduledNotificationAsync,
  cancelAllScheduledNotificationsAsync,
  setNotificationChannelAsync,
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
});