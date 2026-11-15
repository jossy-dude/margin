/** 2026-11-15: `.margin/margin.json` was corrupted on the phone. The SAF provider opens a document for writing
 *  without truncating it ("w" is not "wt" on Android's external storage provider), so a shorter write left the
 *  old file's tail after the new JSON. Writes now come back exactly as written, and a reader repairs the file. */
import { parseJsonLenient } from '../domain/jsonRepair';

/* a SAF provider that behaves like the phone's: writing overwrites from byte 0 and never truncates */
const mockDocs = new Map<string, string>();
let mockCreated = 0;
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    readDirectoryAsync: async (dir: string) => [...mockDocs.keys()].filter((u) => u.startsWith(`${dir}/`) && !u.slice(dir.length + 1).includes('/')),
    makeDirectoryAsync: async (dir: string, name: string) => { const u = `${dir}/${name}`; return u; },
    createFileAsync: async (dir: string, name: string) => { mockCreated++; const u = `${dir}/${name}.json`; mockDocs.set(u, ''); return u; },
    writeAsStringAsync: async (uri: string, text: string) => { const old = mockDocs.get(uri) ?? ''; mockDocs.set(uri, text + old.slice(text.length)); },
    readAsStringAsync: async (uri: string) => { const t = mockDocs.get(uri); if (t === undefined) throw new Error('gone'); return t; },
    deleteAsync: async (uri: string) => { mockDocs.delete(uri); },
  },
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- after the mocks above
const { writeVaultFile, readVaultFile, writeFolderFile } = require('../services/vaultFiles') as typeof import('../services/vaultFiles');

beforeEach(() => { mockDocs.clear(); mockDocs.set('V/.margin', ''); mockCreated = 0; });

it('a shorter write leaves no tail of the old file (vault and folder writes)', async () => {
  await writeVaultFile('V', 'margin.json', `${JSON.stringify({ tasks: ['a long list of things', 'and more'] })}\n`);
  await writeVaultFile('V', 'margin.json', '{"tasks":[]}\n');
  expect(await readVaultFile('V', 'margin.json')).toBe('{"tasks":[]}\n');
  mockDocs.set('B', '');
  await writeFolderFile('B', 'backup.json', '{"x":"0123456789"}');
  await writeFolderFile('B', 'backup.json', '{"x":1}');
  expect(mockDocs.get('B/backup.json')).toBe('{"x":1}');
});

it('an equal-or-longer write is a single write (no delete and recreate)', async () => {
  await writeVaultFile('V', 'margin.json', '{"a":1}');
  const n = mockCreated;
  await writeVaultFile('V', 'margin.json', '{"a":12}');
  expect(mockCreated).toBe(n);
  expect(await readVaultFile('V', 'margin.json')).toBe('{"a":12}');
});

describe('parseJsonLenient', () => {
  it('reads clean JSON as is', () => {
    expect(parseJsonLenient('{"a":1}\n')).toEqual({ value: { a: 1 }, repaired: false });
  });
  it('repairs a file with the old tail after it (the margin.json corruption)', () => {
    const r = parseJsonLenient('{"tasks":[],"s":"a}b"}\n "old": [1, 2]\n}\n');
    expect(r).toEqual({ value: { tasks: [], s: 'a}b' }, repaired: true });
  });
  it('gives up on a truncated or empty file', () => {
    expect(parseJsonLenient('{"tasks":[1,')).toBeNull();
    expect(parseJsonLenient('')).toBeNull();
    expect(parseJsonLenient('garbage')).toBeNull();
  });
});
