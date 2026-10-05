import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { latch } from '../ui/latch';
import { act, getState, hydrate, type State } from '../store/store';
import { uid } from '../domain/time';
import type { Course, Mark, Meeting, Notice, Snapshot, Task } from '../domain/types';

const NOW = new Date(2026, 9, 5, 8).getTime();
const mockOpenRepo = jest.fn(async () => new MemoryRepository(() => NOW));
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));
beforeEach(() => jest.useFakeTimers()); // the store's resync/toast timers would otherwise outlive the suite
afterEach(() => jest.useRealTimers());

const task = (id: string): Task => ({ id, title: 'Problem set 6', courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });
const course = (id: string): Course => ({ id, name: 'Organic Chemistry', room: 'B-12', teacher: 'Hale', goal: null, sort: 0 });
const meeting = (id: string): Meeting => ({ id, courseId: 'E', weekday: 0, start: '09:00', end: '09:50' });
const mark = (id: string): Mark => ({ id, courseId: 'E', name: 'Quiz 3', score: 70, weight: 10, on: true, sort: 0 });
const notice = (id: string): Notice => ({ id, courseId: null, text: 'Bring the sources', dueAt: NOW, read: false, priority: 0 });

/** One case per create-form, driven the way a fast double-tap drives it: the same record saved twice,
 *  before the sheet's 210 ms close animation has finished. */
function formCase<R>(name: string, prefix: string, key: keyof Snapshot, row: (id: string) => R, save: (r: R) => void, count: (s: State) => number, of: (s: State, id: string) => number) {
  it(`${name}: the id the form minted once is what makes the repeat a re-save`, async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    const before = count(getState()), id = uid(prefix);
    save(row(id)); save(row(id)); // the second tap inside the close animation
    expect(of(getState(), id)).toBe(1);
    expect(count(getState()) - before).toBe(1);
    expect((await repo.load())[key]).toHaveLength(count(getState()));
  });

  it(`${name}: (so the case above is not vacuous) two ids really do append two`, async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    const before = count(getState());
    save(row(uid(prefix))); save(row(uid(prefix)));
    expect(count(getState()) - before).toBe(2); // this is the BUG-032 shape
  });
}

describe('a submit pressed twice writes one record (BUG-032)', () => {
  formCase<Task>('task', 't', 'tasks', task, (t) => act.saveTask(t), (s) => s.tasks.length, (s, id) => s.tasks.filter((x) => x.id === id).length);
  formCase<Course>('course', 'c', 'courses', course, (c) => act.saveCourse(c), (s) => s.courses.length, (s, id) => s.courses.filter((x) => x.id === id).length);
  formCase<Meeting>('meeting', 'm', 'meetings', meeting, (m) => act.saveMeeting(m), (s) => s.meetings.length, (s, id) => s.meetings.filter((x) => x.id === id).length);
  formCase<Mark>('mark', 'k', 'marks', mark, (m) => act.saveMark(m), (s) => s.marks.length, (s, id) => s.marks.filter((x) => x.id === id).length);
  formCase<Notice>('notice', 'n', 'notices', notice, (n) => act.saveNotice(n), (s) => s.notices.length, (s, id) => s.notices.filter((x) => x.id === id).length);

  it('latch refuses the repeat, so the second press does not even reach the store', () => {
    const submit = latch(), run = jest.fn();
    expect(submit(run)).toBe(true); expect(run).toHaveBeenCalledTimes(1);
    expect(submit(run)).toBe(false); expect(submit(run)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('latch reads the handler at call time, so the second press cannot save a stale draft', () => {
    const submit = latch(), seen: string[] = [];
    submit(() => seen.push('first')); submit(() => seen.push('second'));
    expect(seen).toEqual(['first']);
  });
});

describe('forms.tsx wiring — the store cannot see the file', () => {
  const lines = readFileSync(join(__dirname, '../sheets/forms.tsx'), 'utf8').split('\n');
  it('each of the five create-forms mints its record id once per form instance, never inside the save', () => {
    for (const p of ['t', 'c', 'm', 'k', 'n']) {
      const hits = lines.filter((l) => l.includes(`uid('${p}')`));
      expect({ prefix: p, mintSites: hits.length }).toEqual({ prefix: p, mintSites: 1 });
      expect(hits[0]).toContain('useState'); // …in a lazy initialiser, so a repeat save reuses it
    }
  });
  it('all five submits go through the latch', () => {
    expect(lines.filter((l) => l.includes('useState(latch)')).length).toBe(5);
    expect(lines.filter((l) => l.includes('submit(() =>')).length).toBe(5);
  });
  it('no create-form still mints an id inside its handler', () => {
    expect(lines.filter((l) => /uid\('[tcmkn]'\)/.test(l) && !l.includes('useState'))).toEqual([]);
  });
});