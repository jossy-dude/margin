/* The speed profiler (v0.7.6). Off by default — `PERF=1 npx jest perf-profile` — because it times things.
 *
 * It mounts the REAL shell (navigator, every page, the overlay) over a seeded term, then does what the owner
 * reports as slow: the first draw, a visit to every tab, the tab switches after that, and a skin change.
 * React's Profiler gives the JS render time of each commit and how many components rendered in it. Node is
 * several times faster than the phone's JS thread, so the numbers are for comparing builds, not for reading
 * as milliseconds on the A51. */
import { counts, setHookLabel } from './perfHook';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { act as store, getState, hydrate, set, stopResync } from '../store/store';
import { Shell } from '../App';
import { ThemeProvider } from '../ui/theme-context';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, lockText: null, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) => R.createElement(R.Fragment, null, children as React.ReactNode);
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaProvider: Provider, SafeAreaView: Provider };
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
    /* `.easing()` too: the shell test below draws the real `Overlay`, whose toast enters with
       `FadeInDown.duration(220).easing(EASE)`. */
    ...Object.fromEntries(['FadeIn', 'FadeOut', 'FadeInDown', 'FadeOutDown', 'FadeInRight', 'FadeOutRight', 'FadeInLeft', 'FadeOutLeft'].map((k) => { const b: Record<string, () => unknown> = {}; b.duration = b.easing = b.delay = () => b; return [k, b]; })),
    FadeInDown: { duration: () => ({ easing: () => ({}) }) }, FadeOutDown: { duration: () => ({ easing: () => ({}) }) },
  };
  return { ...api, default: api };
});

jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

const run = process.env.PERF ? describe : describe.skip;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };

run('speed profile', () => {
  afterAll(() => stopResync());
  it('times the first draw, tab switches and a skin change', async () => {
    const repo = new MemoryRepository();
    const snap = seedSnapshot();
    /* a full term's worth of tasks, so To-do is as heavy as the owner's */
    const base = snap.tasks[0];
    if (base) for (let i = 0; i < 80; i++) snap.tasks.push({ ...base, id: `perf-${i}`, title: `Task ${i}`, dueAt: Date.now() + i * 3_600_000 });
    snap.settings = { ...snap.settings, onboarded: 999 };
    await repo.seed(snap);
    await hydrate(repo);
    const commits: { label: string; ms: number; n: number }[] = [];
    let label = 'mount', renders = 0;
    const onRender = (_id: string, _phase: string, actual: number) => { commits.push({ label, ms: actual, n: renders }); renders = 0; };
    /* every component render, counted through React's own dev hook would be heavy; count Profiler commits instead */
    let live: TestRenderer.ReactTestRenderer | undefined;
    const t0 = performance.now();
    await act(async () => { live = TestRenderer.create(React.createElement(React.Profiler, { id: 'app', onRender }, React.createElement(ThemeProvider, null, React.createElement(Shell)))); });
    await act(async () => { await flush(); });
    const wall: Record<string, number> = { mount: performance.now() - t0 };
    const step = async (name: string, fn: () => void) => {
      label = name; setHookLabel(name); const s = performance.now();
      await act(async () => { fn(); await flush(); });
      wall[name] = performance.now() - s;
    };
    for (const r of ['Week', 'Tasks', 'Grades', 'Stats', 'Today'] as const) await step(`first ${r}`, () => set({ route: r }));
    for (const r of ['Week', 'Tasks', 'Grades', 'Stats', 'Today'] as const) await step(`again ${r}`, () => set({ route: r }));
    const st = getState().settings;
    await step('skin dark', () => set({ settings: { ...st, theme: 'dark' } }));
    await step('skin light', () => set({ settings: { ...getState().settings, theme: 'light' } }));
    await step('skin daylight', () => set({ settings: { ...getState().settings, palette: 'daylight' as never } }));
    await step('go Tasks', () => set({ route: 'Tasks' }));
    await step('tick task', () => { void store.toggleTask('perf-3'); });
    await step('go Today', () => set({ route: 'Today' }));
    await step('tick task 2', () => { void store.toggleTask('perf-4'); });
    await step('sheet open', () => set({ sheet: { t: 'task' } }));
    await step('sheet close', () => set({ sheet: null }));
    const by: Record<string, { ms: number; commits: number }> = {};
    for (const c of commits) { const b = (by[c.label] ??= { ms: 0, commits: 0 }); b.ms += c.ms; b.commits++; }
    const rows = Object.keys(wall).map((k) => `${k.padEnd(14)} wall ${wall[k]!.toFixed(0).padStart(5)} ms · render ${(by[k]?.ms ?? 0).toFixed(0).padStart(5)} ms in ${by[k]?.commits ?? 0} commits`);
     
    console.log(`[perf]\n${rows.join('\n')}`);
    for (const k of ['tick task', 'tick task 2', 'sheet open']) {
      const top = Object.entries(counts[k] ?? {}).sort((a, b) => b[1] - a[1]).filter(([n]) => !/^(RNSVG|View$|Text$|Pressab|Animated|Rect$|Path$|Svg$|G$|TSpan|Circle|Line$)/.test(n)).slice(0, 40).map(([n, c]) => `${n}×${c}`).join(' ');
       
      console.log(`[perf] ${k}: ${Object.values(counts[k] ?? {}).reduce((a, b) => a + b, 0)} renders · ${top}`);
    }
    await act(async () => { live?.unmount(); });
    expect(rows.length).toBeGreaterThan(0);
  });
});
