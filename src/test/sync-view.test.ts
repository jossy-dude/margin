import { syncView, problemOf } from '../domain/syncView';

const NOW = new Date(2026, 10, 20, 20, 31).getTime();
const base = { paired: true, live: true, obsidian: false, vault: true, lastOk: NOW, presence: [{ role: 'desktop-obsidian' }], path: 'Wi-Fi', addr: '192.168.1.11:7428' };

describe('Obsidian & Sync page', () => {
  it('connected: four devices, the path, up to date', () => {
    const v = syncView(base, NOW, false);
    expect(v.devices.map((d) => `${d.name}:${d.dot}`)).toEqual(['Marrow (this phone):on', 'Obsidian on the phone:off', 'Desktop hub:on', 'Obsidian on the desktop:on']);
    expect(v.connection).toBe('Home Wi-Fi · desktop at 192.168.1.11');
    expect(v.stage?.text).toBe('Up to date · 20:31');
    expect(v.ok).toBe(true);
  });
  it('a stage with a size reads with its numbers', () => {
    expect(syncView({ ...base, stage: 'Comparing files', stageDone: 1204, stageOf: 2850 }, NOW, false).stage).toEqual({ text: 'Comparing files 1,204 / 2,850', done: 1204, of: 2850 });
  });
  it('offline and the folder lost: the plain cause and one action each', () => {
    const v = syncView({ ...base, live: false, vault: false, lastPath: 'Tailscale', errors: [{ at: NOW, msg: 'The desktop was not found on this network (tried 192.168.1.11:7428). Is bone-syncd running and the computer awake?' }] }, NOW, false);
    expect(v.connection).toBe('Offline: desktop not found on this network (last time: Tailscale).');
    expect(v.problems.map((p) => p.action)).toEqual(['folder', 'hub']);
    expect(v.ok).toBe(false);
  });
  it('problems are told apart by what to do', () => {
    expect(problemOf('The desktop does not know this phone any more. Pair again (Settings → Obsidian & sync).', 0).action).toBe('pair');
    expect(problemOf("Couldn't write Daily/x.md on the phone", 0).action).toBe('retry');
  });
});
