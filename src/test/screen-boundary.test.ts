/**
 * W1/D — one page's own error boundary.
 *
 * The point of rendering rather than reading `App.tsx` is that the whole claim is about what survives
 * a throw: a failure inside one page must leave the sibling content (the shell, the other pages' nav)
 * drawn, must record the crash once with the route it happened on, and must be recoverable by the
 * button in the fallback. None of that can be read off the file.
 *
 * The crash log itself is REAL here — it is driven through its mocked `expo-file-system`, so the
 * assertion is about the entry that would reach Diagnostics, not about a call to a seam we chose.
 * Everything else below is a native module that cannot load under jest. `React.createElement` rather
 * than JSX because jest's `testMatch` is `src/**\/*.test.ts`.
 */
import React from 'react';
import { Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ScreenBoundary } from '../ui/ScreenBoundary';
import { clearCrashes, readCrashes } from '../ui/crashlog';

jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('the database is not used in this test'); } }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));
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
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});
/** An in-memory `expo-file-system`, with `delete` really dropping the bytes — `clearCrashes()` is
 *  this test's clean slate, and a mock that kept them would leak entries between cases. */
jest.mock('expo-file-system', () => {
  const state = { exists: false, lines: [] as string[] };
  class File {
    get exists() { return state.exists; }
    create() { state.exists = true; }
    delete() { state.exists = false; state.lines = []; }
    write(text: string, opts?: { append?: boolean }) {
      state.exists = true;
      if (opts?.append) state.lines.push(...text.split('\n').filter(Boolean));
      else state.lines = text.split('\n').filter(Boolean);
    }
    textSync() { return state.lines.join('\n') + (state.lines.length ? '\n' : ''); }
  }
  return { File, Paths: { document: 'doc' }, __state: state };
});
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

let live: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => clearCrashes()); // the log is a file at module scope; each case starts clean
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

/** React logs every boundary catch through `console.error`; the failure here is the fixture, not news. */
const mount = async (ui: React.ReactElement) => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  let r!: TestRenderer.ReactTestRenderer;
  try { await act(async () => { r = TestRenderer.create(ui); }); } finally { spy.mockRestore(); }
  live = r;
  return { r, json: () => JSON.stringify(r.toJSON()) };
};
const Boom = () => { throw new Error('kaboom in Stats'); };
const shell = (child: React.ReactElement) => React.createElement(View, null, React.createElement(Text, null, 'nav still here'), child);

describe('a failure in one page does not take the shell down (W1/D)', () => {
  it('the fallback replaces the failed page, and the sibling content outside it still renders', async () => {
    const s = await mount(shell(React.createElement(ScreenBoundary, { route: 'Stats' }, React.createElement(Boom))));
    expect(s.json()).toContain('This page hit a problem');
    expect(s.json()).toContain('kaboom in Stats'); // the message is shown, not just "something failed"
    expect(s.json()).toContain('nav still here'); // …which the full-shell CrashScreen used to replace
  });

  it('the crash is recorded once, as a runtime problem on the route it happened on', async () => {
    await mount(shell(React.createElement(ScreenBoundary, { route: 'Stats' }, React.createElement(Boom))));
    const entries = readCrashes(); // newest first, read back out of the log file itself
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ phase: 'runtime', route: 'Stats' });
    expect(entries[0]?.message).toContain('kaboom in Stats');
  });

  it('Try again remounts the page, so a one-off failure is recoverable in place', async () => {
    // The flag is flipped by the TEST, not by the first render: React re-renders a boundary's children
    // once during error recovery, so a "throw on the first call" child recovers by itself and the
    // fallback never paints. Keeping `fail` true through the mount is what makes this deterministic.
    let fail = true;
    const Flaky = () => {
      if (fail) throw new Error('the draw failed');
      return React.createElement(Text, null, 'drawn on the retry');
    };
    const s = await mount(React.createElement(ScreenBoundary, { route: 'Week' }, React.createElement(Flaky)));
    expect(s.json()).toContain('This page hit a problem');
    expect(s.json()).toContain('the draw failed'); // the card names it, not "Unknown error"

    fail = false;
    const retry = s.r.root.findAll((n) => n.props?.label === 'Try again' && typeof n.props?.onPress === 'function').pop();
    expect(retry).toBeDefined();
    await act(async () => { retry!.props.onPress(); });
    expect(s.json()).toContain('drawn on the retry');
    expect(s.json()).not.toContain('This page hit a problem');
    expect(readCrashes()).toHaveLength(1); // the retry did not append a second entry
  });
});
