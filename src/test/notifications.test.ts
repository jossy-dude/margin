import { sync } from '../services/notifications';
import { scheduleNotificationAsync } from '../services/notifApi';
import { makeTheme } from '../tokens/theme';
import type { Plan, Planned } from '../domain/reminders';
import type { Settings } from '../domain/types';

jest.mock('../services/notifApi', () => ({
  getAllScheduledNotificationsAsync: jest.fn(async () => [] as never[]),
  scheduleNotificationAsync: jest.fn(async () => undefined),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const plan: Plan = { items: [{ id: 'task-a-600', kind: 'task', at: Date.now() + 600_000, title: 't', body: 'b', channel: 'tasks', route: 'Tasks', entityId: 'a' } as Planned], deferred: 0, dropped: [] };
const PENS = ['warm', 'graphite', 'red', 'blue'] as const;
const accentOf = (pen: (typeof PENS)[number], palette: Settings['palette'] = 'refined') => makeTheme({ theme: 'light', palette, pen }, false).c.acc;

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