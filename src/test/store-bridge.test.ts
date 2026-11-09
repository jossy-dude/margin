/** v0.6 — the bridge through the store: Bone's file in, Margin's envelope out (docs/BRIDGE.md). */
import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate } from '../store/store';
import { BRIDGE_FORMAT } from '../domain/bridge';

const NOW = new Date(2026, 10, 9, 10).getTime();
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

const bone = (tasks: unknown[]) => JSON.stringify({ format: BRIDGE_FORMAT, app: 'bone', writtenAt: NOW, tasks });

describe('the bridge through the store', () => {
  it('an Obsidian task lands in the planner with its reminder, and a second read changes nothing', async () => {
    let t = NOW; const repo = new MemoryRepository(() => t); await hydrate(repo);
    const file = bone([{ id: 'ab12', origin: 'obsidian', updatedAt: NOW, data: { title: 'Revise joins', due: '2026-11-12', time: '17:00', prio: 4 } }]);
    t = NOW + 10;
    expect(await act.bridgeIn(file, NOW + 10)).toMatchObject({ ok: true, added: 1, updated: 0, removed: 0 });
    expect(getState().tasks.find((x) => x.id === 'ob-ab12')).toMatchObject({ title: 'Revise joins', origin: 'obsidian', reminders: [{ minutes: 0 }] });
    expect(await act.bridgeIn(file, NOW + 20)).toMatchObject({ ok: true, added: 0, updated: 0, stale: 1 });
  });
  it('a file that is not a bridge file changes nothing and says why', async () => {
    const repo = new MemoryRepository(() => NOW); await hydrate(repo);
    const before = getState().tasks.length;
    expect(await act.bridgeIn('not json')).toMatchObject({ ok: false, problems: ['The bridge file is not valid JSON.'] });
    expect(getState().tasks.length).toBe(before);
  });
  it("Margin's envelope carries only what changed since the last one", async () => {
    let t = NOW; const repo = new MemoryRepository(() => t); await hydrate(repo);
    const task = { id: 'm1', title: 'Essay', courseId: null, kind: 'assignment' as const, dueAt: null, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false };
    await repo.upsert('task', task);
    t = NOW + 100;
    const first = await act.bridgeOut({ now: NOW + 100 });
    expect(first!.tasks.map((x) => x.id)).toEqual(['m1']);
    t = NOW + 200; await repo.upsert('task', { ...task, id: 'm2' });
    const second = await act.bridgeOut({ now: NOW + 300 });
    expect(second!.tasks.map((x) => x.id)).toEqual(['m2']);
  });
});
