/**
 * v0.7 R12 — the automatic weekly backup (DATA_MODEL.md "Never again", DESIGN.md "Your data"): once a week Margin
 * writes `margin-backup-<date>.json` (the same `margin/2` file Export writes, so Import and onboarding read it back)
 * into a folder the owner picked once, and keeps the newest four.
 */
import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate, stopResync } from '../store/store';
import { maybeBackup } from '../store/backup';
import { BACKUP_KEEP, backupDue, backupName, runBackup, type FolderPort } from '../services/backup';
import { parseImport } from '../domain/importPlan';
import { seedSnapshot } from '../data/seed';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('no device database in this suite'); } }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {},
  scheduleFocusEnd: async () => {}, cancelFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {}, applyLockscreenText: async () => {},
}));

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 14, 9).getTime();

/** A folder in memory, shaped like the SAF calls the real port makes. */
function folder(names: string[] = []) {
  const files = new Map<string, string>(names.map((n) => [n, '{}']));
  const port: FolderPort = {
    list: async () => [...files.keys()].map((name) => ({ name, uri: `f/${name}` })),
    write: async (_dir, name, text) => { files.set(name, text); },
    remove: async (uri) => { files.delete(uri.replace(/^f\//, '')); },
  };
  return { files, port };
}

describe('the backup file and when it is due', () => {
  it('is named by its day, like the owner\'s manual export', () => {
    expect(backupName(NOW)).toBe('margin-backup-2026-11-14.json');
  });
  it('is due with no backup yet, and again a week after the last one', () => {
    expect(backupDue(null, NOW)).toBe(true);
    expect(backupDue(NOW - 6 * DAY, NOW)).toBe(false);
    expect(backupDue(NOW - 7 * DAY, NOW)).toBe(true);
  });
});

describe('four rolling files', () => {
  it('writes the new file and keeps only the newest four backups; other files in the folder are left alone', async () => {
    const old = ['margin-backup-2026-10-10.json', 'margin-backup-2026-10-17.json', 'margin-backup-2026-10-24.json', 'margin-backup-2026-10-31.json', 'margin-backup-2026-11-07.json'];
    const { files, port } = folder([...old, 'notes.txt', 'margin-2026-11-01.json']);
    const r = await runBackup('dir', '{"x":1}', NOW, port);
    expect(r.name).toBe('margin-backup-2026-11-14.json');
    expect(files.get('margin-backup-2026-11-14.json')).toBe('{"x":1}');
    expect([...files.keys()].filter((n) => n.startsWith('margin-backup-')).sort()).toEqual(['margin-backup-2026-10-24.json', 'margin-backup-2026-10-31.json', 'margin-backup-2026-11-07.json', 'margin-backup-2026-11-14.json']);
    expect(BACKUP_KEEP).toBe(4);
    expect(files.has('notes.txt') && files.has('margin-2026-11-01.json')).toBe(true);
  });
  it('a second backup on the same day replaces that day\'s file instead of adding one', async () => {
    const { files, port } = folder(['margin-backup-2026-11-14.json']);
    await runBackup('dir', 'second', NOW, port);
    expect([...files.keys()]).toEqual(['margin-backup-2026-11-14.json']);
    expect(files.get('margin-backup-2026-11-14.json')).toBe('second');
  });
});

describe('the store runs it weekly', () => {
  beforeEach(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); });
  afterEach(() => { stopResync(); jest.useRealTimers(); });
  async function boot() {
    const repo = new MemoryRepository(() => NOW);
    await repo.seed(seedSnapshot(NOW));
    await hydrate(repo);
    stopResync();
  }
  it('does nothing until a folder is picked', async () => {
    await boot();
    const { files, port } = folder();
    expect(await maybeBackup(NOW, port)).toBe(false);
    expect(files.size).toBe(0);
  });
  it('with a folder: writes an export Import can read, remembers when, and waits a week for the next', async () => {
    await boot();
    act.setSettings({ backupUri: 'content://docs/Margin' });
    const { files, port } = folder();
    expect(await maybeBackup(NOW, port)).toBe(true);
    const text = files.get('margin-backup-2026-11-14.json')!;
    const plan = parseImport(text);
    expect(plan.problems).toEqual([]);
    expect(plan.snapshot.courses?.length).toBe(getState().courses.length);
    expect(plan.snapshot.tasks?.length).toBe(getState().tasks.length);
    expect(getState().settings.backupAt).toBe(NOW);
    expect(await maybeBackup(NOW + 3 * DAY, port)).toBe(false);
    expect(await maybeBackup(NOW + 7 * DAY, port)).toBe(true);
    expect(files.size).toBe(2);
  });
  it('a failed write is not remembered as a backup, so the next start tries again', async () => {
    await boot();
    act.setSettings({ backupUri: 'content://docs/Margin' });
    const { port } = folder();
    port.write = async () => { throw new Error('the grant is gone'); };
    expect(await maybeBackup(NOW, port)).toBe(false);
    expect(getState().settings.backupAt ?? null).toBeNull();
  });
});
