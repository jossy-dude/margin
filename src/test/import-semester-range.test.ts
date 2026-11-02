/**
 * WS2 follow-up — an imported semester range must land in the ACTIVE term, not only in the settings KV.
 *
 * v0.5 made `semesters` the truth and `settings.semesterStart/End` its mirror. An import wrote the KV
 * alone, so the range died the next time `loadSemesters()` read the row: the file said "the term starts
 * 7 September" and the app went on printing last term's dates. These tests drive the real store and the
 * in-memory repository (the same port the SQLite adapter implements) through the JSON door that carries
 * `semester: { start, end }`, then re-hydrate to prove the row is what a reload reads.
 *
 * Merge-only holds here too: a file that says nothing about the term changes nothing, and a file that
 * names a start without an end does not clear a term the phone already closes.
 */
import { MemoryRepository } from '../data/memory';
import { parseImport } from '../domain/importPlan';
import { suggestEnd } from '../domain/semester';
import type { SemesterRow } from '../domain/types';
import { act, getState, hydrate, set, stopResync } from '../store/store';

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
jest.mock('expo-file-system', () => {
  class File {
    get exists() { return false; }
    create() {}
    delete() {}
    write() {}
    textSync() { return ''; }
  }
  return { File, Paths: { document: 'doc' } };
});
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) => R.createElement(R.Fragment, null, children as React.ReactNode);
  Provider.displayName = 'SafeAreaProvider';
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaProvider: Provider };
});
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => { const C = (p: object) => R.createElement(RNView, p); C.displayName = 'AnimatedProxy'; return C; };
  const api = {
    __esModule: true, View: mk(), Text: mk(), ScrollView: mk(), Image: mk(),
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (v: number) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedReaction: () => {}, useAnimatedScrollHandler: () => () => {}, useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }), useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: false, useWeb: false }),
    setGestureState: () => {}, isSharedValue: () => false, makeShareable: (v: unknown) => v,
    startMapper: () => {}, stopMapper: () => {}, makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, bezier: () => (t: number) => t, back: () => (t: number) => t },
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05

/** One active term the import will land on, with a range the assertions can tell apart from the file's. */
const row = (start: string, end: string): SemesterRow => ({
  id: 's1', name: 'Existing term', start, end, active: true,
  snapshotJson: null, createdAt: '2026-08-30T10:00:00.000Z', archivedAt: null,
});

async function seeded(start = '2026-01-12', end = '2026-05-01') {
  const r = new MemoryRepository(() => NOW);
  await r.saveSemester(row(start, end));
  await r.setActiveSemester('s1');
  await hydrate(r);
  set({ now: NOW, settingsPath: [] });
  return r;
}

/** The compact shape an AI writes: the term plus one subject and one task. */
const FILE = JSON.stringify({
  semester: { start: '2026-09-07', end: '2026-12-20' },
  courses: [{ name: 'Organic Chem', room: 'S3' }],
  tasks: [{ title: 'Name the functional groups', course: 'Organic Chem', due: '2026-10-30T09:00' }],
}, null, 2);

const activeOf = async (r: MemoryRepository) => (await r.listSemesters()).find((x) => x.active)!;
const importText = async (text: string) => {
  const plan = parseImport(text, { now: NOW });
  expect(plan.problems).toEqual([]);
  return act.importPlan(plan);
};

afterEach(() => { stopResync(); });

describe('an imported semester range lands in the active term', () => {
  it('writes the file\'s start and end into the active row, and the mirror', async () => {
    const r = await seeded();
    expect(await importText(FILE)).toBe(true);

    const active = await activeOf(r);
    expect(active.id).toBe('s1');
    expect(active.start).toBe('2026-09-07');
    expect(active.end).toBe('2026-12-20');
    expect(getState().settings.semesterStart).toBe('2026-09-07');
    expect(getState().settings.semesterEnd).toBe('2026-12-20');
    // the page reads `state.semesters`, so the import must not leave it holding last term's row
    expect(getState().semesters.find((x) => x.active)?.start).toBe('2026-09-07');
  });

  /* The defect this round fixes: the KV write alone died on the next `loadSemesters()`. A reload is a
     new store built from the repository, which is exactly what an app restart does. */
  it('a reload still reads the imported range, because the active row is what it reads', async () => {
    const r = await seeded();
    await importText(FILE);

    await hydrate(r); // fresh session, repository unchanged
    await act.loadSemesters();

    const active = await activeOf(r);
    expect(active.start).toBe('2026-09-07');
    expect(active.end).toBe('2026-12-20');
    expect(getState().settings.semesterStart).toBe('2026-09-07');
    expect(getState().settings.semesterEnd).toBe('2026-12-20');
  });

  it('a file with no semester range leaves the active term exactly as it was', async () => {
    const r = await seeded();
    const before = await activeOf(r);
    expect(await importText(JSON.stringify({
      tasks: [{ title: 'Read chapter 2', due: '2026-10-30T09:00' }],
    }))).toBe(true);

    const after = await activeOf(r);
    expect({ start: after.start, end: after.end, name: after.name }).toEqual({ start: before.start, end: before.end, name: before.name });
    expect(getState().settings.semesterStart).toBe(before.start);
    expect(getState().settings.semesterEnd).toBe(before.end);
  });

  it('a start with an empty end makes the term open-ended, as the file says', async () => {
    const r = await seeded();
    expect(await importText(JSON.stringify({ semester: { start: '2026-09-07' } }))).toBe(true);
    const active = await activeOf(r);
    expect(active.start).toBe('2026-09-07');
    expect(active.end).toBe('');
    expect(getState().settings.semesterEnd).toBe('');
  });

  /* A sparse raw export names the start and says nothing about the end. "Says nothing" is not "says
     empty": the phone's end survives (merge-only), and only a start that would strand an earlier end
     falls back to the domain's own seed. */
  it('a raw export carrying only a start keeps an end that still follows it', async () => {
    const r = await seeded('2026-08-01', '2027-01-10');
    const raw = JSON.stringify({ app: 'margin', raw: { settings: { semesterStart: '2026-09-07' } } });
    expect(await importText(raw)).toBe(true);
    const active = await activeOf(r);
    expect(active.start).toBe('2026-09-07');
    expect(active.end).toBe('2027-01-10');
    expect(getState().settings.semesterEnd).toBe('2027-01-10');
  });

  it('a start that strands the old end gets the domain\'s 15-week seed instead of an impossible pair', async () => {
    const r = await seeded(); // ends 2026-05-01
    const raw = JSON.stringify({ app: 'margin', raw: { settings: { semesterStart: '2026-09-07' } } });
    expect(await importText(raw)).toBe(true);
    const active = await activeOf(r);
    expect(active.start).toBe('2026-09-07');
    expect(active.end).toBe(suggestEnd('2026-09-07'));
    expect(getState().settings.semesterEnd).toBe(suggestEnd('2026-09-07'));
  });
});
