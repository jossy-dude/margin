import { dumpBeforeMigration, dumpName, dumpPayload, keepNewest, safetyInfo, shareNewestSafetyCopy, shouldBackup } from '../services/safety';

/**
 * `safety.ts` splits in two: the pure decisions (name, due?, which to drop, payload) and the expo-file-system
 * calls that cannot run under jest. The mock below is a real in-memory filesystem — directories map to
 * maps of file name → contents — so the I/O layer is exercised too, not stubbed out.
 *
 * `jest.mock` factories are hoisted above the module body, so their state is reached through `__state`.
 */
type FsState = { dirs: Map<string, Map<string, string>>; listFails: boolean };
jest.mock('expo-file-system', () => {
  const state: FsState = { dirs: new Map(), listFails: false };
  const uriOf = (p: unknown): string => (typeof p === 'string' ? p : (p as { uri: string }).uri);
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) { this.uri = parts.map(uriOf).join('/'); }
    get exists() { return state.dirs.has(this.uri); }
    create() { if (!state.dirs.has(this.uri)) state.dirs.set(this.uri, new Map()); }
    list() {
      if (state.listFails) throw new Error('the folder would not list');
      return [...(state.dirs.get(this.uri) ?? new Map<string, string>()).keys()].map((name) => ({ name }));
    }
  }
  class File {
    uri: string;
    name: string;
    private parent: string;
    constructor(...parts: unknown[]) {
      const all = parts.map(uriOf);
      this.name = all[all.length - 1] ?? '';
      this.parent = all.slice(0, -1).join('/');
      this.uri = all.join('/');
    }
    create() { const d = state.dirs.get(this.parent); if (!d) throw new Error('no folder'); if (!d.has(this.name)) d.set(this.name, ''); }
    write(text: string) { const d = state.dirs.get(this.parent); if (!d) throw new Error('no folder'); d.set(this.name, text); }
    delete() { const d = state.dirs.get(this.parent); if (!d?.delete(this.name)) throw new Error('no file'); }
    rename(to: string) { const d = state.dirs.get(this.parent); if (!d?.has(this.name)) throw new Error('no file'); d.set(to, d.get(this.name)!); d.delete(this.name); this.name = to; }
  }
  return { Directory, File, Paths: { document: 'doc' }, __state: state };
});
jest.mock('expo-sharing', () => {
  const state = { available: true, calls: [] as { uri: string; opts: unknown }[] };
  return {
    __state: state,
    isAvailableAsync: async () => state.available,
    shareAsync: async (uri: string, opts: unknown) => { state.calls.push({ uri, opts }); },
  };
});
jest.mock('../services/problems', () => ({ recordCrash: jest.fn(() => null) }));

const fs = (jest.requireMock('expo-file-system') as { __state: FsState }).__state;
const sharing = (jest.requireMock('expo-sharing') as { __state: { available: boolean; calls: { uri: string; opts: unknown }[] } }).__state;
const recordCrash = (jest.requireMock('../services/problems') as { recordCrash: jest.Mock }).recordCrash;

const DIR = 'doc/marginalia/backups';
const at = (y: number, m: number, d: number, h = 0, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s).getTime();
const seed = (names: string[]) => { const m = new Map<string, string>(); for (const n of names) m.set(n, '{}'); fs.dirs.set(DIR, m); };
const names = () => [...(fs.dirs.get(DIR)?.keys() ?? [])].sort();

beforeEach(() => {
  fs.dirs.clear();
  fs.listFails = false;
  sharing.available = true;
  sharing.calls = [];
  recordCrash.mockClear();
});
afterEach(() => { jest.restoreAllMocks(); });

describe('the pure half of the safety copies', () => {
  it('names the file from the versions and the local stamp', () => {
    expect(dumpName(2, 3, at(2026, 10, 23, 14, 12, 5))).toBe('pre-migration-2-to-3-20261023-141205.json');
  });

  it('is due exactly when the database is behind the code', () => {
    expect(shouldBackup(2, 3)).toBe(true);
    expect(shouldBackup(0, 3)).toBe(true);
    expect(shouldBackup(3, 3)).toBe(false);
    expect(shouldBackup(4, 3)).toBe(false); // a downgrade is not this build's business
    expect(shouldBackup(2.5, 3)).toBe(false);
  });

  it('keeps the newest copies, with a floor of one so the just-written copy survives', () => {
    const newestFirst = ['d', 'c', 'b', 'a'];
    expect(keepNewest(newestFirst)).toEqual(['a']);
    expect(keepNewest(newestFirst, 2)).toEqual(['b', 'a']);
    expect(keepNewest(newestFirst, 0)).toEqual(['c', 'b', 'a']); // 0 means 1, not "delete everything"
    expect(keepNewest(newestFirst, -5)).toEqual(['c', 'b', 'a']);
    expect(keepNewest([])).toEqual([]);
  });

  it('writes the payload shape the brief promises', () => {
    expect(dumpPayload(2, 3, 99, { course: [{ id: 'C1' }] })).toEqual({
      app: 'margin', kind: 'pre-migration', from: 2, to: 3, at: 99, tables: { course: [{ id: 'C1' }] },
    });
  });
});

describe('dumpBeforeMigration', () => {
  it('writes nothing to a database with no user tables yet', async () => {
    const read = jest.fn(async () => []);
    await expect(dumpBeforeMigration(read, 2, 3)).resolves.toBeNull();
    expect(fs.dirs.has(DIR)).toBe(false); // an empty dump is not written, and the folder is not made
  });

  it('dumps every table sqlite_master names, with its rows', async () => {
    const tables: Record<string, Record<string, unknown>[]> = { course: [{ id: 'C1', name: 'Maths' }], setting: [{ k: 'name', v: '"Sam"' }] };
    const read = jest.fn(async (sql: string) => {
      if (sql.includes('sqlite_master')) return Object.keys(tables).map((name) => ({ name }));
      const name = /"([^"]+)"/.exec(sql)![1]!;
      return tables[name] ?? [];
    });
    const stamp = at(2026, 10, 23, 14, 12, 5);
    jest.spyOn(Date, 'now').mockReturnValue(stamp);

    await expect(dumpBeforeMigration(read, 2, 3)).resolves.toBe('pre-migration-2-to-3-20261023-141205.json');
    const body = JSON.parse(fs.dirs.get(DIR)!.get('pre-migration-2-to-3-20261023-141205.json')!);
    expect(body).toEqual({ app: 'margin', kind: 'pre-migration', from: 2, to: 3, at: stamp, tables });
    expect(read).toHaveBeenCalledWith('SELECT * FROM "course"');
    expect(read).toHaveBeenCalledWith('SELECT * FROM "setting"');
  });

  /* F6 reversed this: a copy that could not be made used to be logged and skipped, and the migration ran
     anyway — without the one thing that makes a bad migration recoverable. Now the open stops, says why,
     and the database is untouched. */
  it('a copy that cannot be made stops the migration with a sentence, and is logged', async () => {
    const read = jest.fn(async () => { throw new Error('database is locked'); });
    await expect(dumpBeforeMigration(read, 2, 3)).rejects.toThrow(/safety copy.*database is locked.*Nothing was changed/);
    expect(recordCrash).toHaveBeenCalledWith(expect.any(Error), 'boot', 'safety copy');
  });

  it('writes beside the final name and renames into place, so no half-written copy is ever listed', async () => {
    fs.dirs.delete(DIR);
    const read = jest.fn(async (sql: string) => (sql.includes('sqlite_master') ? [{ name: 'course' }] : [{ id: 'c1' }]));
    const name = await dumpBeforeMigration(read, 2, 3);
    expect(names()).toEqual([name]);
    expect(name).not.toMatch(/\.tmp$/);
  });

  it('keeps the newest three and deletes the oldest', async () => {
    const read = jest.fn(async (sql: string) => (sql.includes('sqlite_master') ? [{ name: 'course' }] : []));
    const times = [at(2026, 10, 23, 9, 0, 0), at(2026, 10, 23, 10, 0, 0), at(2026, 10, 23, 11, 0, 0), at(2026, 10, 23, 12, 0, 0)];
    const now = jest.spyOn(Date, 'now');
    for (const t of times) { now.mockReturnValue(t); await dumpBeforeMigration(read, 2, 3); }

    expect(names()).toEqual([
      'pre-migration-2-to-3-20261023-100000.json',
      'pre-migration-2-to-3-20261023-110000.json',
      'pre-migration-2-to-3-20261023-120000.json',
    ]);
  });
});

describe('what Settings → Data reads', () => {
  it('says "none" rather than failing when the folder does not exist', () => {
    expect(safetyInfo()).toEqual({ available: false, count: 0, newest: null, newestName: null });
  });

  it('an existing but empty folder is available with zero copies', () => {
    seed([]);
    expect(safetyInfo()).toEqual({ available: true, count: 0, newest: null, newestName: null });
  });

  it('reports the count and the newest by the stamp inside the name', () => {
    seed([
      'pre-migration-1-to-2-20260901-080000.json',
      'pre-migration-2-to-3-20261023-141205.json',
      'notes.txt', // not a dump; not counted
    ]);
    expect(safetyInfo()).toEqual({
      available: true,
      count: 2,
      newest: at(2026, 10, 23, 14, 12, 5),
      newestName: 'pre-migration-2-to-3-20261023-141205.json',
    });
  });

  it('a folder that will not list is the same honest "none", not a crash', () => {
    fs.dirs.set(DIR, new Map());
    fs.listFails = true;
    expect(safetyInfo()).toEqual({ available: false, count: 0, newest: null, newestName: null });
  });
});

describe('shareNewestSafetyCopy', () => {
  it('has nothing to share when there are no copies', async () => {
    await expect(shareNewestSafetyCopy()).resolves.toBe(false);
    expect(sharing.calls).toEqual([]);
  });

  it('hands the newest file to the system sheet with the JSON mime type', async () => {
    seed(['pre-migration-2-to-3-20261023-141205.json']);
    await expect(shareNewestSafetyCopy()).resolves.toBe(true);
    expect(sharing.calls).toEqual([{
      uri: `${DIR}/pre-migration-2-to-3-20261023-141205.json`,
      opts: { mimeType: 'application/json', dialogTitle: 'pre-migration-2-to-3-20261023-141205.json' },
    }]);
  });

  it('says so when the phone has no share sheet', async () => {
    seed(['pre-migration-2-to-3-20261023-141205.json']);
    sharing.available = false;
    await expect(shareNewestSafetyCopy()).resolves.toBe(false);
    expect(sharing.calls).toEqual([]);
  });
});
