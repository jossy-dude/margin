import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { hydrate, stopResync } from '../store/store';
import { seedSnapshot } from '../data/seed';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

// the store debounces a queue rebuild into a timer; without dropping it, it fires after jest has
// torn the module registry down and takes the worker with it.
afterEach(() => stopResync());

const NOW = new Date(2026, 9, 5, 8).getTime();
const settingsCopy = () => {
  const src = readFileSync(join(__dirname, '../sheets/Settings.tsx'), 'utf8');
  return src.slice(src.indexOf('Remove all sample data'), src.indexOf('Settings → Reset wipes the whole database file.') + 'Settings → Reset wipes the whole database file.'.length);
};

async function seeded() {
  const repo = new MemoryRepository(() => NOW);
  await hydrate(repo);
  await repo.seed(seedSnapshot(NOW));
  return { repo, before: await repo.load() };
}

describe('Remove all sample data takes the whole sample semester, and nothing else (BUG-025)', () => {
  it('removes the sample subjects, timetable, tasks, notes, grades and history in one action', async () => {
    const { repo, before } = await seeded();
    expect(before.courses.some((c) => c.demo)).toBe(true);
    expect(before.meetings.some((m) => m.demo)).toBe(true);
    expect(before.tasks.some((t) => t.demo)).toBe(true);
    expect(before.notices.some((n) => n.demo)).toBe(true);
    expect(before.marks.some((m) => m.demo)).toBe(true);
    expect(before.focus.every((f) => f.demo)).toBe(true);

    await repo.purgeDemo();
    const after = await repo.load();
    expect(after.courses).toHaveLength(0);
    expect(after.meetings).toHaveLength(0);
    expect(after.tasks).toHaveLength(0);
    expect(after.notices).toHaveLength(0);
    expect(after.marks).toHaveLength(0);
    expect(after.focus).toHaveLength(0);
  });

  it('leaves everything the flag never covered (attendance, day marks, adjustments, settings) untouched', async () => {
    const { repo, before } = await seeded();
    await repo.purgeDemo();
    const after = await repo.load();
    for (const k of ['attendance', 'dayMarks', 'adjusts'] as const) {
      expect({ table: k, same: JSON.stringify(after[k]) === JSON.stringify(before[k]) }).toEqual({ table: k, same: true });
    }
    expect(after.settings).toEqual(before.settings);
  });

  it("and leaves the user's own rows alone — every one they created or edited", async () => {
    const { repo } = await seeded();
    /* One row per table, flagged the way a form save flags it (`demo: false`). If any create/edit
       path stopped clearing the flag, its row here would be deleted with the sample set. */
    await repo.upsert('course', { id: 'mine-c', name: 'Real course', room: '', teacher: '', goal: null, sort: 9, demo: false });
    await repo.upsert('meeting', { id: 'mine-m', courseId: 'mine-c', weekday: 0, start: '09:00', end: '09:50', demo: false });
    await repo.upsert('task', { id: 'mine-t', title: 'Real task', courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 2, createdAt: NOW, completedAt: NOW, reminders: [], subtasks: [], demo: false });
    await repo.upsert('notice', { id: 'mine-n', courseId: null, text: 'Bring it', dueAt: NOW, priority: 0, demo: false });
    await repo.upsert('mark', { id: 'mine-k', courseId: 'mine-c', name: 'Quiz', score: 80, weight: 10, on: true, sort: 0, demo: false });
    await repo.upsert('focus', { id: 'mine-f', taskId: null, courseId: 'mine-c', startedAt: NOW, endedAt: NOW + 600_000, focusSec: 600, breakSec: 0, overSec: 0, rounds: 1, planMin: 25, mode: 'focus', completed: true, demo: false });

    await repo.purgeDemo();
    const after = await repo.load();
    expect(after.courses.map((c) => c.id)).toEqual(['mine-c']);
    expect(after.meetings.map((m) => m.id)).toEqual(['mine-m']);
    expect(after.tasks.map((t) => t.id)).toEqual(['mine-t']);
    expect(after.notices.map((n) => n.id)).toEqual(['mine-n']);
    expect(after.marks.map((m) => m.id)).toEqual(['mine-k']);
    expect(after.focus.map((f) => f.id)).toEqual(['mine-f']);
  });

  it('the seed flags every row it creates as sample data — subjects and open tasks included', () => {
    // this is the fact BUG-025 was about: the old seed flagged only the history, so the sample
    // semester was indistinguishable from the user's own and could not be removed as a whole.
    const s = seedSnapshot(NOW);
    expect(s.courses.every((c) => c.demo)).toBe(true);
    expect(s.meetings.every((m) => m.demo)).toBe(true);
    expect(s.notices.every((n) => n.demo)).toBe(true);
    expect(s.marks.every((m) => m.demo)).toBe(true);
    expect(s.tasks.every((t) => t.demo)).toBe(true); // open and finished alike
    expect(s.focus.every((f) => f.demo)).toBe(true);
  });

  it('the row names what it removes, and that anything created or edited stays', () => {
    const copy = settingsCopy();
    for (const phrase of ['sample subjects', 'timetable', 'tasks', 'notes', 'grades', 'history', 'Anything you created or edited stays']) {
      expect(copy).toContain(phrase);
    }
    expect(copy).toContain('Reset'); // …and where the full demo set *can* be replaced
  });

  it('the button is armed by a first tap, so one tap can never destroy anything', () => {
    const src = readFileSync(join(__dirname, '../sheets/Settings.tsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // the two-tap danger pattern, on its own flag so it cannot borrow Reset's arming
    expect(code).toContain("label={surePurge ? 'Tap again to remove the sample data' : 'Remove all sample data'}");
    expect(code).toContain('kind={surePurge ? \'danger\' : \'ghost\'}');
    const arm = code.slice(code.indexOf('function armPurge'));
    expect(arm).toContain('if (!surePurge) { setSurePurge(true); return; }'); // the first tap only arms
    expect(arm).toContain('void act.purgeDemo()'); // …the second one does it
  });
});
