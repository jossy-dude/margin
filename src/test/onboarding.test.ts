/**
 * v0.5 onboarding (collage): five pages with Scrap, replacing the ten-step coach tour. What is pinned:
 * the gate is one version number; nothing is written until the end; the data door decides what happens
 * to the sample semester; a replay never offers the samples and never touches the user's data; and the
 * system's notification prompt only ever follows its explanation and a tap.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BackHandler } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { getState, hydrate, set, stopResync } from '../store/store';
import { DEFAULT_SETTINGS, TOUR_VERSION, toured } from '../domain/defaults';
import { ThemeProvider } from '../ui/theme-context';

const askLog: boolean[] = [];
jest.mock('../services/notifications', () => {
  const ensurePermission = async (ask = true) => { askLog.push(ask); return ask ? 'granted' : 'undetermined'; };
  return new Proxy({ ensurePermission }, { get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : k === '__esModule' ? true : async () => ({ added: 0, removed: 0, planned: [], permission: 'undetermined' })) });
});
jest.mock('expo-haptics', () => ({ NotificationFeedbackType: { Success: 'Success' }, Haptics: { notificationAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve() } }), { virtual: true });
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
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
    /* `get`/`set` alongside `.value`: the app writes shared values through the compiler-safe forms
       (`app.json` has `reactCompiler: true`, and `navigation/Book.tsx` documents why). These doubles
       predate that; `set` is a no-op so a render reads the value it was constructed with, which is
       exactly what a smoke render wants. */
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
    /* Layout-animation builders are called as `FadeOut.duration(n)` in production. */
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});


// eslint-disable-next-line import/first
import { Onboarding } from '../onboarding/Onboarding';

const NOW = new Date(2026, 9, 5, 8).getTime();
let live: TestRenderer.ReactTestRenderer | undefined;
beforeAll(() => { jest.spyOn(BackHandler, 'addEventListener').mockImplementation((() => ({ remove: () => {} })) as never); });
afterAll(() => { jest.restoreAllMocks(); });
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); askLog.length = 0; });

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); });
async function mount(firstRun: boolean, settings: Record<string, unknown> = {}) {
  const repo = new MemoryRepository(() => NOW);
  await repo.seed(seedSnapshot(NOW));
  await hydrate(repo);
  set({ route: 'Today', sheet: null, toast: null, settingsPath: [], settings: { ...getState().settings, reduceMotion: 'on', onboarded: undefined, ...settings } });
  await act(async () => { live = TestRenderer.create(React.createElement(ThemeProvider, null, React.createElement(Onboarding, { firstRun }))); });
  const root = live!.root;
  const text = () => root.findAll((n) => String(n.type) === 'Text').map((n) => String(n.children[0] ?? '')).join(' ');
  const byId = (id: string) => root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0] ?? root.findAll((n) => n.props.testID === id)[0];
  const tab = (i: number) => root.findAll((n) => n.props.accessibilityLabel === `Page ${i} of 5` && typeof n.props.onPress === 'function')[0]!;
  const press = async (id: string) => {
    if (id === 'onboarding-start') await act(async () => { tab(5).props.onPress(); }); // Start lives on the last page
    const n = byId(id); if (!n) throw new Error(`no ${id}`); await act(async () => { n.props.onPressIn?.(); n.props.onPress?.(); }); await tick();
  };
  const type = async (s: string) => { const n = root.findAll((x) => x.props.testID === 'onboarding-name' && typeof x.props.onChangeText === 'function')[0]!; await act(async () => { n.props.onChangeText(s); }); };
  return { root, text, press, type };
}

describe('the gate is one number', () => {
  it('build 2 is the five-page onboarding, so everyone who finished the coach tour sees it once', () => {
    expect(TOUR_VERSION).toBe(2);
    expect(toured(undefined)).toBe(false);
    expect(toured(1)).toBe(false);
    expect(toured(2)).toBe(true);
    expect('onboarded' in DEFAULT_SETTINGS).toBe(false);
  });
  it('App.tsx shows the onboarding, and the coach tour is gone', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('<Onboarding firstRun={first} />');
    expect(app).not.toMatch(/Coach/);
  });
});

describe('five pages, every one of them reachable and said out loud', () => {
  it('renders all five titles, and a numbered tab for each page', async () => {
    const s = await mount(true);
    for (const t of ["Hi, I'm Jot.", 'Everything has its place.', 'What should I call you?', 'When does your term run?', 'A nudge before class.']) expect(s.text()).toContain(t);
    const tabs = s.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
    expect(tabs.map((n) => n.props.accessibilityLabel)).toEqual([1, 2, 3, 4, 5].map((i) => `Page ${i} of 5`));
    expect(s.root.findAll((n) => n.props.accessibilityRole === 'header' && typeof n.type === 'string').length).toBeGreaterThanOrEqual(5);
  });
  it('a first run offers the sample semester and no "keep"; a replay offers "keep" and no samples', async () => {
    let s = await mount(true);
    expect(s.root.findAll((n) => n.props.testID === 'door-sample').length).toBeGreaterThan(0);
    expect(s.root.findAll((n) => n.props.testID === 'door-keep').length).toBe(0);
    await act(async () => { live?.unmount(); });
    s = await mount(false);
    expect(s.root.findAll((n) => n.props.testID === 'door-keep').length).toBeGreaterThan(0);
    expect(s.root.findAll((n) => n.props.testID === 'door-sample').length).toBe(0);
  });
});

describe('nothing is written until the end, then all of it in order', () => {
  it('typing a name writes nothing; Start writes the name, the onboarding and puts the samples away', async () => {
    const s = await mount(true);
    await s.type('  Sam  ');
    expect(getState().settings.name).toBe('');
    expect(getState().settings.onboarded).toBeUndefined();
    await s.press('onboarding-start');
    expect(getState().settings.name).toBe('Sam');
    expect(getState().settings.onboarded).toBe(TOUR_VERSION);
    expect(getState().courses.filter((c) => c.demo)).toEqual([]);       // "Set it up by hand" is the default
  });
  it('"Look around first" keeps the sample semester', async () => {
    const s = await mount(true);
    const before = getState().courses.length;
    await s.press('door-sample');
    await s.press('onboarding-start');
    expect(getState().courses.length).toBe(before);
    expect(getState().settings.onboarded).toBe(TOUR_VERSION);
  });
  it('"Bring a file" finishes and opens Import, where a file or a paste both land', async () => {
    const s = await mount(true);
    await s.press('door-import');
    await s.press('onboarding-start');
    expect(getState().sheet).toEqual({ t: 'settings' });
    expect(getState().settingsPath).toEqual(['data', 'import']);
  });
  it('a replay that keeps the planner removes nothing, sample-flagged or not', async () => {
    const s = await mount(false);
    const before = getState().courses.length;
    await s.press('onboarding-start');
    expect(getState().courses.length).toBe(before);
    expect(getState().settings.onboarded).toBe(TOUR_VERSION);
  });
  it('Skip finishes once, keeping the samples on a first run', async () => {
    const s = await mount(true);
    const before = getState().courses.length;
    await s.press('onboarding-skip');
    await s.press('onboarding-skip');
    expect(getState().settings.onboarded).toBe(TOUR_VERSION);
    expect(getState().courses.length).toBe(before);
  });
});

describe('the notification prompt follows its explanation and a tap, never an arrival', () => {
  it('opening the onboarding only READS the permission; the Allow button asks', async () => {
    const s = await mount(true);
    expect(askLog.every((a) => a === false)).toBe(true);
    const allow = s.root.findAll((n) => n.props.accessibilityLabel === 'Allow reminders' && typeof n.props.onPress === 'function')[0]!;
    await act(async () => { allow.props.onPressIn?.(); allow.props.onPress?.(); });
    await tick();
    expect(askLog).toContain(true);
    expect(s.text()).toContain('Reminders are on.');
  });
  it('the planner no longer asks by itself when it schedules', () => {
    expect(readFileSync(join(__dirname, '..', 'store', 'reminders.ts'), 'utf8')).not.toContain('ensurePermission(true)');
  });
});
