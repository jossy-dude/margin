import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { hydrate } from '../store/store';
import { seedSnapshot } from '../data/seed';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0 }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

const NOW = new Date(2026, 9, 5, 8).getTime();
const settingsCopy = () => {
  const src = readFileSync(join(__dirname, '../sheets/Settings.tsx'), 'utf8');
  return src.slice(src.indexOf('Clear demo history'), src.indexOf('Settings → Reset replaces the whole demo set.') + 'Settings → Reset replaces the whole demo set.'.length);
};

async function seeded() {
  const repo = new MemoryRepository(() => NOW);
  await hydrate(repo);
  await repo.seed(seedSnapshot(NOW));
  return { repo, before: await repo.load() };
}

describe('Clear demo history does exactly what it says, and says all of it (BUG-025)', () => {
  it('removes the sample finished tasks and the sample focus sessions', async () => {
    const { repo, before } = await seeded();
    expect(before.tasks.some((t) => t.demo)).toBe(true);
    expect(before.focus.every((f) => f.demo)).toBe(true);

    await repo.purgeDemo();
    const after = await repo.load();
    expect(after.tasks.some((t) => t.demo)).toBe(false);
    expect(after.focus).toHaveLength(0);
  });

  it('leaves every other table exactly as it found it', async () => {
    const { repo, before } = await seeded();
    await repo.purgeDemo();
    const after = await repo.load();
    // the finding measured all of these surviving on device ("Subjects / timetable / open tasks /
    // notes populated → all unchanged"), so the test asserts the whole set rather than one table
    for (const k of ['courses', 'meetings', 'attendance', 'dayMarks', 'notices', 'marks', 'adjusts'] as const) {
      expect({ table: k, same: JSON.stringify(after[k]) === JSON.stringify(before[k]) }).toEqual({ table: k, same: true });
    }
    expect(after.settings).toEqual(before.settings);
  });

  it('and leaves the user\'s own finished task alone — the one that hid the Stats hint', async () => {
    const { repo } = await seeded();
    await repo.purgeDemo();
    const after = await repo.load();
    const mine = after.tasks.filter((t) => !t.demo && t.status === 2);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((t) => !t.demo)).toBe(true);
    expect(after.tasks.filter((t) => t.status !== 2).length).toBeGreaterThan(0); // the open ones stay too
  });

  it('the seed really does flag only the history as demo, which is why the rest survives', () => {
    // this is the fact behind the finding: the demo set is only *partly* flagged, so "demo" and
    // "yours" are indistinguishable for the subjects, timetable, notes, marks and open tasks.
    const s = seedSnapshot(NOW);
    expect(s.courses.every((c) => !('demo' in c))).toBe(true); // no demo flag exists on them at all
    expect(s.notices.every((n) => !('demo' in n))).toBe(true);
    expect(s.marks.every((m) => !('demo' in m))).toBe(true);
    expect(s.tasks.filter((t) => !t.demo).length).toBeGreaterThan(0); // seeded open tasks, flagged as yours
    expect(s.tasks.filter((t) => t.demo).every((t) => t.status === 2)).toBe(true);
  });

  it('the hint under the button names what stays, so "your own data" cannot read as "no demo left"', () => {
    const copy = settingsCopy();
    for (const phrase of ['sample finished tasks', 'focus sessions', 'sample subjects', 'timetable', 'notes', 'open tasks']) {
      expect(copy).toContain(phrase);
    }
    expect(copy).toContain('Reset'); // …and where the full demo set *can* be replaced
  });
});