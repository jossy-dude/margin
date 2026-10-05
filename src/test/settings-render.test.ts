/**
 * A minimal render harness for the sheet layer: reanimated, safe-area and the audio, keep-awake and
 * notification services are native or platform modules that cannot load under jest, so they are
 * stubbed here. What is NOT stubbed is the code under test — the sheet, the store, the crash log.
 *
 * The point of rendering rather than reading the file is that this bug is about *how many times*
 * something runs. Only a real render can count that.
 *
 * `jest.mock` is hoisted above the imports, so each factory below re-requires what it needs; that is
 * the one place `require` is unavoidable here.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { hydrate, set } from '../store/store';
import { SettingsSheet } from '../sheets/Settings';
import { clearCrashes, recordCrash, type CrashEntry } from '../ui/crashlog';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0 }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));
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
    useSharedValue: (v: number) => ({ value: v }),
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
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: {}, FadeOut: {}, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

/** Counts every read of the crash log, so a test can assert how often the file is opened. The mock
 *  sits on `crashlog`'s own dependency (`expo-file-system`), so it counts real reads, not calls to a
 *  seam we chose. `textSync` is the blocking read the finding is about.
 *
 *  The state lives inside the factory and is reached through `__state`: a `jest.mock` factory is
 *  hoisted above the module body, so it cannot close over anything declared here. (`crashlog` caches
 *  its parse, so a test wanting a clean slate goes through the app's own `clearCrashes()`.) */
jest.mock('expo-file-system', () => {
  const state = { reads: 0, exists: true, entries: [] as string[] };
  class File {
    get exists() { return state.exists; }
    create() { state.exists = true; }
    delete() { state.exists = false; }
    write(text: string, opts?: { append?: boolean }) {
      state.exists = true;
      if (opts?.append) state.entries.push(...text.split('\n').filter(Boolean));
      else state.entries = text.split('\n').filter(Boolean);
    }
    textSync() { state.reads += 1; return state.entries.join('\n') + (state.entries.length ? '\n' : ''); }
  }
  return { File, Paths: { document: 'doc' }, __state: state };
});
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

const fs = (jest.requireMock('expo-file-system') as typeof import('expo-file-system') & { __state: { reads: number; exists: boolean; entries: string[] } }).__state;
const mockReads = () => fs.reads;
const mockReset = (count: number) => {
  clearCrashes(); // the app's own API: drops the cached parse and deletes the file
  fs.exists = true; // …then put the file back, as a clean install with a log would have
  fs.reads = 0;
  fs.entries = Array.from({ length: count }, (_, i) => JSON.stringify(entry(i)));
};

const NOW = new Date(2026, 9, 5, 8).getTime();
const entry = (i: number): CrashEntry => ({ id: `c${i}`, at: NOW - i * 1000, phase: 'runtime', route: 'Today', message: `boom ${i}`, stack: '', version: '1.0.0', sdk: '57.0.0' });

/** Every sheet this file mounts stays subscribed to the crash log, so the previous one has to be
 *  unmounted before the log is reset — otherwise its listener re-reads (and re-caches) an empty file
 *  during the reset, and the next mount sees the stale empty result. */
let live: TestRenderer.ReactTestRenderer | undefined;

const mount = async (crashes = 0) => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  mockReset(crashes);
  await hydrate(new MemoryRepository(() => NOW));
  set({ settingsPath: [] });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(SettingsSheet)); });
  live = r;
  return {
    r,
    json: () => JSON.stringify(r.toJSON()),
    /** Drive the greeting field the way typing does: change text, then let the sheet re-render. */
    async type(text: string) {
      const inputs = r.root.findAll((n) => typeof n.type !== 'string' && 'onChangeText' in (n.props as object));
      const field = inputs.find((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function');
      if (!field) throw new Error('no text field found in the sheet');
      await act(async () => { field.props.onChangeText(text); });
    },
  };
};

afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

describe('the Diagnostics hint does not re-read the crash log on every keystroke (BUG-008)', () => {
  it('reads the log once for the hint, not twice, and not at all per keystroke', async () => {
    const s = await mount(3);
    expect(s.json()).toContain('3 crashes recorded'); // the hint is right to begin with
    const afterMount = mockReads();
    expect(afterMount).toBeGreaterThan(0);

    for (const text of ['J', 'Jo', 'Jos', 'Joss', 'Jossy']) await s.type(text);

    expect(mockReads()).toBe(afterMount); // typing re-rendered the sheet and read the file zero more times
    expect(s.json()).toContain('Jossy'); // …and the field still took the text
  });

  it('still pluralises, and still reads at all', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');
    expect(mockReads()).toBeGreaterThan(0);
  });

  it('an empty log reads as zero rather than being skipped', async () => {
    const s = await mount(0);
    expect(s.json()).toContain('0 crashes recorded');
    expect(mockReads()).toBeGreaterThan(0);
  });

  it('the hint refreshes when you come back from Diagnostics, so a cleared log reads zero', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');

    await act(async () => { set({ settingsPath: ['diagnostics'] }); }); // you are on Diagnostics
    expect(s.json()).toContain('Test the crash reporter'); // that page, not the root
    expect(s.json()).not.toContain('Data & export');
    clearCrashes(); // …and you tap Clear

    await act(async () => { set({ settingsPath: [] }); }); // back to the root page
    expect(s.json()).toContain('0 crashes recorded'); // not the stale "1 crash recorded"
  });

  it('the read count does not depend on how many crashes are logged', async () => {
    const few = await mount(3);
    expect(few.json()).toContain('3 crashes recorded');
    const readsForThree = mockReads();

    const many = await mount(50); // the file's own cap
    expect(many.json()).toContain('50 crashes recorded');

    expect(mockReads()).toBe(readsForThree); // 50 records cost exactly what 3 do
    // a small constant: the parse happens once and is cached, and `crashCount` is then O(1). The
    // shipped code read the whole file twice per keystroke instead.
    expect(readsForThree).toBeGreaterThan(0);
    expect(readsForThree).toBeLessThan(4);
  });

  it('and a recorded crash updates the hint without anyone re-rendering the sheet by hand', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');
    await act(async () => { recordCrash(new Error('boom'), 'runtime', 'Today'); });
    expect(s.json()).toContain('2 crashes recorded'); // the subscription, not a page visit
  });
});
