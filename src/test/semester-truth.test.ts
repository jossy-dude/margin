/**
 * WS2 review, I1 and I3 — the `semesters` row is the truth on READ, and the cache is invalidated on a wipe.
 *
 * v0.9 made the active row the source of truth and `settings.semesterStart/End` its mirror, but nothing
 * repaired the mirror: two live writers (`adoptDemo`'s hand-over and the tour's last step → `setSettings`)
 * wrote the KV alone, `ensureActiveSemester` returns early when a row exists, and `loadSemesters`'
 * `moved` branch re-read the KV instead of re-mirroring — so after a first run the Settings → Semesters
 * page printed the reverse (the row) while Grades and export printed the tour's range, forever.
 *
 * The fix is one-directional and it is a read: whenever the store loads the terms, a mirror that
 * disagrees with the active row is written back FROM the row. That makes a KV-only writer harmless
 * instead of chasing every writer, which is what this file pins.
 *
 * The second claim is about a stale CACHE rather than a stale disk: `resetAll` re-opens the database
 * but used to keep the pre-wipe rows in `state.semesters`, so the first Settings → Attendance edit
 * found a ghost active row and wrote it back into the fresh file.
 *
 * Everything below drives the real store over the in-memory repository (the same port SQLite
 * implements), with `openRepository` mocked because there is no device here.
 */
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import type { SemesterRow } from '../domain/types';
import { act, boot, getState, hydrate, stopResync } from '../store/store';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, lockText: null, platform: 'test' }),
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  applyLockscreenText: async () => {}, onOpened: () => {}, onReceived: () => {},
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

const mockOpenRepo = jest.fn();
jest.mock('../data/sqliteExpo', () => ({ openRepository: () => mockOpenRepo() }));

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05

const row = (extra: Partial<SemesterRow> = {}): SemesterRow => ({
  id: 's1', name: 'Autumn 2026', start: '2026-09-07', end: '2026-12-20', active: true,
  snapshotJson: null, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null, ...extra,
});
/** The range the tour's last step (or `adoptDemo`) writes into the KV alone — never into the row. */
const TOUR = { semesterStart: '2027-01-11', semesterEnd: '2027-05-07' };

/** A repository holding one active term that is already mirrored, so nothing is drifted yet. */
async function live(start = '2026-09-07', end = '2026-12-20') {
  const r = new MemoryRepository(() => NOW);
  await r.saveSemester(row({ start, end }));
  await r.setActiveSemester('s1');
  return r;
}
const activeOf = async (r: MemoryRepository) => (await r.listSemesters()).find((x) => x.active)!;

afterEach(() => { stopResync(); jest.clearAllMocks(); });

describe('the active row is authoritative over the settings mirror', () => {
  it('repairs a KV-only range at boot, so every view reads the row', async () => {
    const r = await live();
    await r.putSettings(TOUR); // a writer that only knew the settings, before this store ever ran

    await hydrate(r);

    expect(getState().settings.semesterStart).toBe('2026-09-07');
    expect(getState().settings.semesterEnd).toBe('2026-12-20');
    // repaired on disk too: a restart, an export and the next session all read the row's range
    expect((await r.load()).settings.semesterStart).toBe('2026-09-07');
    expect((await r.load()).settings.semesterEnd).toBe('2026-12-20');
    // and the page's own source is that same row, untouched
    expect(getState().semesters.find((x) => x.active)?.id).toBe('s1');
    expect((await activeOf(r)).start).toBe('2026-09-07');
  });

  it('a KV-only write during the session is harmless: the next term read puts the row back', async () => {
    const r = await live();
    await hydrate(r);

    act.setSettings(TOUR); // the tour's hand-over, exactly: settings only
    expect(getState().settings.semesterStart).toBe(TOUR.semesterStart);

    await act.loadSemesters();

    expect(getState().settings.semesterStart).toBe('2026-09-07');
    expect(getState().settings.semesterEnd).toBe('2026-12-20');
    expect((await r.load()).settings.semesterStart).toBe('2026-09-07');
    expect((await activeOf(r)).start).toBe('2026-09-07'); // the row was never the thing that moved
  });

  /* The composition that produced the report: the tour's range is written during the demo session, then
     `adoptDemo` copies the session's settings into the REAL database — whose active term was created at
     `init()`, before the tour existed. Adoption is also a repository swap, so it is where the cache has
     to stop belonging to the demo repository. */
  it('reconciles the tour hand-over against the term the real database already had', async () => {
    const real = await live();
    mockOpenRepo.mockImplementation(() => real);
    await boot();
    expect(getState().tasks.length).toBeGreaterThan(0);
    expect(getState().tasks.every((t) => t.demo)).toBe(true); // a first run: the samples are in memory

    act.setSettings(TOUR);            // the tour's last step
    await act.adoptDemo(false);       // App.tsx: hand the session over to the real database
    // Adoption reads the real terms, so the mirror is already the row's — not the tour's.
    expect((await real.load()).settings.semesterStart).toBe('2026-09-07');
    expect(getState().settings.semesterStart).toBe('2026-09-07');

    await act.loadSemesters();        // and a later read changes nothing
    expect((await real.load()).settings.semesterStart).toBe('2026-09-07');
    expect((await real.load()).settings.semesterEnd).toBe('2026-12-20');
  });
});

describe('erasing everything also invalidates the term cache (I3)', () => {
  it('drops the pre-wipe rows, so the next range edit lands in the healed term, not a ghost', async () => {
    const before = new MemoryRepository(() => NOW);
    await before.saveSemester(row({ id: 's0', name: 'Autumn 2025', start: '2025-09-01', end: '2025-12-19', active: false, archivedAt: '2025-12-20T00:00:00.000Z' }));
    await before.saveSemester(row({ id: 's1' }));
    await before.setActiveSemester('s1');
    await hydrate(before);
    await act.loadSemesters(); // the Semesters page was opened, so the cache holds both rows
    expect(getState().semesters).toHaveLength(2);

    const after = new MemoryRepository(() => NOW); // what openRepository() hands back post-wipe
    mockOpenRepo.mockImplementation(() => after);
    await act.resetAll();
    // Settings → Attendance, without visiting Semesters first — the order that wrote the ghost back
    await act.setActiveRange('2026-09-07', '2026-12-20');

    const rows = await after.listSemesters();
    expect(rows).toHaveLength(1);
    expect(rows.filter((x) => x.active)).toHaveLength(1);
    expect(rows[0]!.id).not.toBe('s1');
    expect(rows[0]!.start).toBe('2026-09-07');
    expect(rows[0]!.end).toBe('2026-12-20');
    expect(getState().semesters.map((x) => x.id)).not.toContain('s1');
    expect((await after.load()).settings.semesterStart).toBe('2026-09-07');
  });
});

/* A repository swap is where a cached term becomes a phantom: `boot()` hydrates from the DEMO
   repository, so `state.semesters` holds the sample term until something replaces it. Adoption used to
   swap `repo` and leave that cache alone — and the next Settings → Attendance edit (no Semesters visit
   first) saved the sample-id row into the real file and deactivated the term the user actually had. */
describe('adoption does not carry the demo repository\'s term into the real one (N1)', () => {
  it('keeps exactly the real term, by its own id, and lands the edited range on it', async () => {
    const real = new MemoryRepository(() => NOW);
    await real.saveSemester(row({ id: 'real1', name: 'My term' }));
    await real.setActiveSemester('real1');
    mockOpenRepo.mockImplementation(() => real);

    await boot();                                   // a first run: the samples, and their term, are in memory
    expect(getState().semesters.filter((x) => x.active).map((x) => x.id)).not.toEqual(['real1']);

    act.setSettings(TOUR);                          // the tour's last step, on the demo repository
    await act.adoptDemo(true);                      // App.tsx: the hand-over to the real database

    // Settings → Attendance, with the Semesters page never opened: the order that wrote the phantom back
    await act.setActiveRange(TOUR.semesterStart, TOUR.semesterEnd);

    const rows = await real.listSemesters();
    expect(rows).toHaveLength(1);                   // a phantom would make this two
    expect(rows[0]!.id).toBe('real1');              // the user's term, not a sample-id copy
    expect(rows[0]!.active).toBe(true);             // …and still the active one
    expect(rows[0]!.start).toBe(TOUR.semesterStart);
    expect(rows[0]!.end).toBe(TOUR.semesterEnd);
    expect(getState().semesters.filter((x) => x.active).map((x) => x.id)).toEqual(['real1']); // the cache never held the phantom
  });

  it('the sample semester itself still never reaches the real database', async () => {
    const real = new MemoryRepository(() => NOW);
    mockOpenRepo.mockImplementation(() => real);
    await boot();
    const seed = seedSnapshot(NOW).settings;
    expect(getState().settings.semesterStart).toBe(seed.semesterStart);
    expect((await real.load()).courses).toHaveLength(0);
    expect(getState().semesters).toHaveLength(1); // the demo repository's own term, not the real one's
  });
});
