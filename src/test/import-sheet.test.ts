/**
 * The two doors into the import page, driven as a reader drives them: the file picker (the phone's
 * document picker is mocked, the reading and the planning are real) and the paste box.
 *
 * Only the platform pieces are stubbed — the picker, the audio/keep-awake/notification services, the
 * reanimated and safe-area shims the sheet layer needs under jest. Everything the test asserts is the
 * app's own code: `services/pickFile`, the import planner and the page.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { getState, hydrate, set, stopResync } from '../store/store';
import type { Course } from '../domain/types';
import { ImportPage } from '../sheets/Import';
import { pickImportFile } from '../services/pickFile';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, platform: 'android', lockText: null }),
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  applyLockscreenText: async () => {}, onOpened: () => {}, onReceived: () => {},
}));
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

/** The phone's document picker, answering whatever the test set up. `jest.mock` is hoisted, so the
 *  answer lives inside the factory and is reached through `__state`. */
jest.mock('expo-document-picker', () => {
  const state: { result: unknown; asked?: Record<string, unknown> } = { result: { canceled: true, assets: null } };
  return { getDocumentAsync: jest.fn(async (opts: Record<string, unknown>) => { state.asked = opts; return state.result; }), __state: state };
});
jest.mock('expo-file-system', () => {
  const state = { text: '' };
  class File {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    text() { return Promise.resolve(state.text); }
  }
  return { File, Paths: { document: 'doc', cache: 'cache' }, __state: state };
});

const fs = jest.requireMock('expo-file-system') as { __state: { text: string } };
const picker = jest.requireMock('expo-document-picker') as { __state: { result: unknown; asked?: Record<string, unknown> } };

const NOW = new Date(2026, 9, 5, 8).getTime();
const course = (id: string, name: string): Course => ({ id, name, rooms: [], teacher: '', goal: null, sort: 0, demo: false });

const TERM = JSON.stringify({
  semester: { start: '2026-09-07', end: '2026-12-20' },
  courses: [{ name: 'DB Systems', meetings: [{ weekday: 1, start: '08:30', end: '10:00' }] }],
  tasks: [{ title: 'Read chapter 1', course: 'DB Systems', due: '2026-09-20T23:59' }],
});

let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

/** Every string in the rendered tree, in order, joined — how a reader reads the page. */
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}

const mount = async () => {
  await hydrate(new MemoryRepository(() => NOW));
  set({ settingsPath: [], courses: [course('C1', 'DB Systems')] });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ImportPage)); });
  live = r;
  return {
    r,
    text: () => leaves(r.toJSON()).join(''),
    /** Press a control the way a finger does: the button acts on press-in, not on release. */
    async press(testID: string) {
      const nodes = r.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPressIn === 'function');
      if (!nodes.length) throw new Error(`no button with testID "${testID}"`);
      await act(async () => { (nodes[0]!.props as { onPressIn: () => void }).onPressIn(); });
    },
  };
};

describe('pickImportFile', () => {
  it('cancelling the picker is null, not an error', async () => {
    picker.__state.result = { canceled: true, assets: null };
    await expect(pickImportFile()).resolves.toBe(null);
  });

  it('reads the picked file and hands back its name and text', async () => {
    picker.__state.result = { canceled: false, assets: [{ name: 'term.json', uri: 'file:///cache/term.json', size: 12 }] };
    fs.__state.text = TERM;
    await expect(pickImportFile()).resolves.toEqual({ name: 'term.json', text: TERM });
    expect(picker.__state.asked?.multiple).toBe(false);
    expect(picker.__state.asked?.type).toEqual(expect.arrayContaining(['application/json', 'text/csv']));
  });
});

describe('the import page', () => {
  it('offers both doors: pick a file, or paste into the box', async () => {
    const s = await mount();
    expect(s.text()).toContain('Pick file');
    expect(s.text()).toContain('Check');
    const inputs = s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import');
    expect(inputs.length).toBeGreaterThan(0); // the paste box, in the tree (composite + host node)
  });

  it('a picked JSON file lands in the box and is previewed straight away', async () => {
    picker.__state.result = { canceled: false, assets: [{ name: 'term.json', uri: 'file:///cache/term.json' }] };
    fs.__state.text = TERM;
    const s = await mount();
    await s.press('import-pick');
    expect(s.text()).toContain('1 class');
    expect(s.text()).toContain('1 task');
    expect(s.text()).toContain('Semester');
    expect(s.text()).not.toContain('problems stop the import');
  });

  it('a picked CSV asks which table it is, and the answer plans the rows', async () => {
    picker.__state.result = { canceled: false, assets: [{ name: 'marks.csv', uri: 'file:///cache/marks.csv' }] };
    // "name" is a subject's name in one table and a mark's name in another, so the header alone is not
    // enough to say which — this is the file the selector exists for.
    fs.__state.text = 'course,name,score,weight\nDB Systems,Quiz 1,18,10\nDB Systems,Quiz 2,14,10\n';
    const s = await mount();
    await s.press('import-pick');
    expect(s.text()).toContain('say which one it is');
    await s.press('import-dataset-marks');
    expect(s.text()).not.toContain('say which one it is');
    expect(s.text()).toContain('2 marks');
  });

  it('a picked file that cannot be read is a problem on the page, never a crash', async () => {
    picker.__state.result = { canceled: false, assets: [{ name: 'broken.json', uri: 'file:///cache/broken.json' }] };
    fs.__state.text = '{ "courses": [ }';
    const s = await mount();
    await s.press('import-pick');
    expect(s.text()).toContain('That is not valid JSON');
    expect(s.text()).toContain('One problem stops the import');
  });

  it('the preview says which rows are new and which update what is already there', async () => {
    const s = await mount(); // the phone already has "DB Systems" as C1
    const field = s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import')[0]!;
    await act(async () => { (field.props as { onChangeText: (v: string) => void }).onChangeText('name,room\nDB Systems,B12\nMaths,A1\n'); });
    await s.press('import-check');
    // v0.5 D3: the preview is a ledger — the count and its split are two cells of one line now
    expect(s.text()).toContain('2 subjects1 new, 1 updated');
    expect(s.text()).toContain('Import 2 rows');
  });

  /* F1 round 4 / v0.5: the subject row merges over C1, and the variant now has a table of its own —
     so the preview must claim BOTH rows, because both are really written (WS2 wired the write). */
  it('a file whose subject is on the phone offers that row and its variant, and both are really written', async () => {
    const s = await mount(); // "DB Systems" is already on the phone as C1
    const field = s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import')[0]!;
    const onlyVariants = JSON.stringify({ courses: [{ name: 'DB Systems', variants: [{ name: 'Lab' }] }] });
    await act(async () => { (field.props as { onChangeText: (v: string) => void }).onChangeText(onlyVariants); });
    await s.press('import-check');
    expect(s.text()).toContain('1 subject1 updated');
    expect(s.text()).toContain('1 variant1 new'); // the phone had no variants before this file
    expect(s.text()).toContain('Import 2 rows');
    const commit = s.r.root.findAll((n) => n.props?.testID === 'import-commit' && typeof n.props?.onPressIn === 'function')[0]!;
    expect((commit.props as { disabled?: boolean }).disabled).toBe(false);

    // the count the button promised is the count the database got — the whole point of the re-enable
    await s.press('import-commit');
    expect(getState().variants!.map((v) => v.name)).toEqual(['Lab']);
    expect(getState().toast?.text).toBe('Imported 2 rows');
  });

  /* F2 round 4: a compact file can carry an occurrence that has not finished (`status: null`, the
     JSON spelling of the export's `upcoming`), and it must end on the skipped line, never on a
     problem that disables Import. */
  it('an unfinished class in a JSON file is skipped, and Import stays enabled', async () => {
    const s = await mount();
    const field = s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import')[0]!;
    const week = JSON.stringify({
      courses: [{ name: 'DB Systems' }],
      attendance: [{ date: '2026-10-05', course: 'DB Systems', start: '08:30', status: null }],
    });
    await act(async () => { (field.props as { onChangeText: (v: string) => void }).onChangeText(week); });
    await s.press('import-check');
    expect(s.text()).toContain('1 subject1 updated');
    expect(s.text()).toContain('Skipped (not written): 1 attendance mark');
    expect(s.text()).not.toContain('problems stop the import');
    const commit = s.r.root.findAll((n) => n.props?.testID === 'import-commit' && typeof n.props?.onPressIn === 'function')[0]!;
    expect((commit.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('a large picked file is shown as a slip, planned from memory, and Paste instead brings the box back', async () => {
    const tasks = Array.from({ length: 400 }, (_, i) => ({ title: `Task number ${i} with a long enough title`, course: 'DB Systems', due: '2026-10-20T23:59' }));
    picker.__state.result = { canceled: false, assets: [{ name: 'big.json', uri: 'file:///cache/big.json' }] };
    fs.__state.text = JSON.stringify({ courses: [{ name: 'DB Systems' }], tasks });
    const s = await mount();
    await s.press('import-pick');
    expect(s.text()).toContain('big.json');
    expect(s.text()).toContain('read from the file, not shown');
    expect(s.text()).toContain('400 tasks');
    expect(s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import')).toHaveLength(0);
    await s.press('import-clear');
    expect(s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import').length).toBeGreaterThan(0);
  });

  it('pasting still works, through the same preview', async () => {
    const s = await mount();
    const field = s.r.root.findAll((n) => n.props?.accessibilityLabel === 'JSON to import')[0]!;
    await act(async () => { (field.props as { onChangeText: (v: string) => void }).onChangeText(TERM); });
    await s.press('import-check');
    expect(s.text()).toContain('1 class');
    expect(s.text()).toContain('1 task');
  });
});
