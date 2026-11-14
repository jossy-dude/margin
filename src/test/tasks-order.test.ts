/**
 * v0.7 R3 — To-do: a swipe to done can be undone like a swipe to delete, and "My order" (`task.ord`, migration 7) is
 * kept across restarts.
 */
import { MemoryRepository } from '../data/memory';
import { act, dismissToast, getState, hydrate, stopResync } from '../store/store';
import { sortTasks } from '../domain/taskOrder';
import type { Task } from '../domain/types';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {},
  scheduleFocusEnd: async () => {}, cancelFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));

const NOW = new Date(2026, 10, 14, 9).getTime();
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: `Task ${id}`, courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...over });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

beforeEach(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); });
afterEach(() => { stopResync(); dismissToast(); jest.useRealTimers(); });

async function boot(repo: MemoryRepository) { await hydrate(repo); stopResync(); }

describe('swipe to done has an Undo', () => {
  it('finishing a task by swipe says so with Undo, and Undo puts it back exactly as it was', async () => {
    const repo = new MemoryRepository(() => NOW);
    const t = task('a', { subtasks: [{ id: 's1', t: 'outline', done: false }] });
    await repo.upsert('task', t);
    await boot(repo);
    act.completeTask('a');
    expect(getState().tasks[0]!.status).toBe(2);
    const toast = getState().toast!;
    expect(toast.text).toBe('Done: Task a');
    expect(typeof toast.undo).toBe('function');
    toast.undo!();
    await flush();
    expect(getState().tasks[0]).toEqual(t);
    expect((await repo.load()).tasks[0]).toEqual(t);
  });
  it('a swipe on a done task reopens it, quietly', async () => {
    const repo = new MemoryRepository(() => NOW);
    await repo.upsert('task', task('a', { status: 2, completedAt: NOW }));
    await boot(repo);
    act.completeTask('a');
    expect(getState().tasks[0]!.status).toBe(0);
    expect(getState().toast).toBeNull();
  });
});

describe('My order', () => {
  it('sorts by the order you gave, tasks never moved after the rest, newest first among those', () => {
    const list = [task('a', { ord: 2 }), task('b', { ord: 1 }), task('c', { createdAt: NOW + 1 }), task('d')];
    expect(sortTasks(list, 'mine').map((t) => t.id)).toEqual(['b', 'a', 'c', 'd']);
  });
  it('moving a task lands it before the one you drop it on, and the order survives a restart', async () => {
    const repo = new MemoryRepository(() => NOW);
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) await repo.upsert('task', task(id, { createdAt: NOW - i }));
    await boot(repo);
    act.setSettings({ taskSort: 'mine' });
    act.moveTask('d', 'a'); // d to the top
    act.moveTask('b', null); // b to the end
    await flush();
    const ids = () => sortTasks(getState().tasks, getState().settings.taskSort).map((t) => t.id);
    expect(ids()).toEqual(['d', 'a', 'c', 'b']);
    // a restart: a new session on the same database
    await boot(repo);
    expect(getState().settings.taskSort).toBe('mine');
    expect(ids()).toEqual(['d', 'a', 'c', 'b']);
  });
});
