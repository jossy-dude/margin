import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { hydrate, stopResync } from '../store/store';
import { seedSnapshot } from '../data/seed';
import { doneByDay, focusMinutesByDay, lastDays, statsEmptyHint } from '../domain/analytics';
import type { FocusSession, Task } from '../domain/types';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

// the store debounces a queue rebuild into a timer; without dropping it, it fires after jest has
// torn the module registry down and takes the worker with it.
afterEach(() => stopResync());

const NOW = new Date(2026, 9, 5, 8).getTime();
const DAY = 86_400_000;

/** What Stats can actually draw: the totals over the same 105-day window its heatmaps use. Built from
 *  the real repository so the test sees the same numbers the screen would, not a hand-written list. */
async function windowTotals(snap: { focus: FocusSession[]; tasks: Task[] }) {
  const days = lastDays(105, NOW);
  return {
    focusMinutes: focusMinutesByDay(snap.focus, days).reduce((a, b) => a + b, 0),
    finished: doneByDay(snap.tasks, days).reduce((a, b) => a + b, 0),
  };
}

/** The dataset after Settings → Data & export → Clear demo history, through the real purge path. */
async function afterPurge() {
  const repo = new MemoryRepository(() => NOW);
  await hydrate(repo);
  await repo.seed(seedSnapshot(NOW));
  await repo.purgeDemo();
  const s = await repo.load();
  return {
    ...(await windowTotals(s)),
    focusSessions: s.focus.length,
    hasAnyFinishedTask: s.tasks.some((t) => t.status === 2),
  };
}

describe('the Stats empty-state hint actually fires (BUG-024)', () => {
  it('after Clear demo history — the exact state the device run photographed', async () => {
    const s = await afterPurge();
    // the shipped state: every demo focus session gone, one non-demo finished task surviving
    expect(s.focusSessions).toBe(0);
    expect(s.hasAnyFinishedTask).toBe(true);
    expect(s.finished).toBe(1);
    expect(s.focusMinutes).toBe(0); // the focus heatmap is blank: "0m in the last 15 weeks"

    const hint = statsEmptyHint({ focusMinutes: s.focusMinutes, finished: s.finished });
    expect(hint).not.toBe(null); // …so the page now says why, instead of leaving two charts unexplained
    expect(hint).toContain('focus session');
  });

  it('the old AND guard is what suppressed it, over that same real dataset', async () => {
    const s = await afterPurge();
    const old = s.focusSessions === 0 && !s.hasAnyFinishedTask;
    expect(old).toBe(false); // ← the shipped bug: no hint, blank charts
    expect(statsEmptyHint({ focusMinutes: s.focusMinutes, finished: s.finished })).not.toBe(null);
  });

  it('a genuinely empty database gets V13\'s exact wording', () => {
    expect(statsEmptyHint({ focusMinutes: 0, finished: 0 })).toBe('Finish a task or a focus session and the charts fill in.');
  });

  it('either half being empty names the half that is missing', () => {
    expect(statsEmptyHint({ focusMinutes: 120, finished: 3 })).toBe(null); // a real dataset gets no hint
    expect(statsEmptyHint({ focusMinutes: 0, finished: 3 })).toBe('Start a focus session and the focus charts fill in.');
    expect(statsEmptyHint({ focusMinutes: 120, finished: 0 })).toBe('Finish a task and the tasks charts fill in.');
    expect(statsEmptyHint({ focusMinutes: 0, finished: 0 })).toBe('Finish a task or a focus session and the charts fill in.');
  });

  it('focus older than the window is not data, because the heatmap cannot show it', () => {
    const days = lastDays(105, NOW);
    const yearAgo = NOW - 200 * DAY;
    expect(days.includes(new Date(yearAgo).toISOString().slice(0, 10))).toBe(false); // outside the window
    const stale = focusMinutesByDay([{ id: 'f', taskId: null, courseId: null, startedAt: yearAgo, endedAt: yearAgo, focusSec: 1800, breakSec: 0, overSec: 0, rounds: 1, planMin: 30, mode: 'focus', completed: true, demo: false }], days)
      .reduce((a, b) => a + b, 0);
    expect(stale).toBe(0); // …so the page holds one session and still cannot draw a single focus cell
    expect(statsEmptyHint({ focusMinutes: stale, finished: 0 })).toBe('Finish a task or a focus session and the charts fill in.');
    expect(statsEmptyHint({ focusMinutes: stale, finished: 4 })).toBe('Start a focus session and the focus charts fill in.');
  });

  it('Stats renders the hint this function returns, and the AND guard is gone', () => {
    const src = readFileSync(join(__dirname, '../screens/Stats.tsx'), 'utf8');
    expect(src).toContain('statsEmptyHint');
    expect(src).toContain('text={hint}');
    expect(src).not.toContain('st.focus.length === 0 && st.tasks.every');
  });
});