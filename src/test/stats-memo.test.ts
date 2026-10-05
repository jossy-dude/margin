import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { hydrate, set } from '../store/store';
import { StatsScreen } from '../screens/Stats';

/**
 * Counts how often each analytics derivation runs while the Stats screen is mounted. This bug is
 * about *how many times* work happens per render, so it needs a real render — a mock on the screen's
 * own dependency counts real calls, not calls to a seam chosen for the test.
 */
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
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

jest.mock('../domain/analytics', () => {
  const real = jest.requireActual<typeof import('../domain/analytics')>('../domain/analytics');
  const counts: Record<string, number> = {};
  const wrap = (prop: string, v: (...a: unknown[]) => unknown) => (...args: unknown[]) => { counts[prop] = (counts[prop] ?? 0) + 1; return v(...args); };
  const api: Record<string, unknown> = { __counts: counts };
  for (const prop of Object.keys(real)) {
    const v = (real as unknown as Record<string, unknown>)[prop];
    api[prop] = typeof v === 'function' ? wrap(prop, v as (...a: unknown[]) => unknown) : v;
  }
  return api;
});

const NOW = new Date(2026, 9, 5, 8).getTime();
interface Counted { __counts: Record<string, number> }
const countsOf = (): Record<string, number> => (jest.requireMock('../domain/analytics') as Counted).__counts;

const mount = async () => {
  await hydrate(new MemoryRepository(() => NOW));
  for (const k of Object.keys(countsOf())) delete countsOf()[k];
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(StatsScreen)); });
  live = r;
  return { r, json: () => JSON.stringify(r.toJSON()) };
};

/** `useNow(60_000)` arms a real timer, so the renderer has to be torn down or jest leaks a worker. */
let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

/** The derivations that depend only on the data, so they need not re-run for anything else. */
const DATA_ONLY = ['onTimeStats', 'focusBySubject', 'gradeBars', 'doneByHour', 'focusByHour', 'markSeries'];

describe('Stats does not re-derive the whole dataset on every render (BUG-014)', () => {
  it('renders the real page, so the counts below are not measuring a blank screen', async () => {
    const s = await mount();
    expect(s.json()).toContain('At a glance');
    expect(s.json()).toContain('Focus heatmap');
    for (const name of DATA_ONLY) expect({ name, ran: countsOf()[name]! > 0 }).toEqual({ name, ran: true });
  });

  it('a store write it subscribes to, but no chart reads, re-renders it without re-deriving', async () => {
    // `plan` is read by the Reminders card and by no derivation, so this is a re-render that changes
    // nothing a chart is built from. Using a field the screen does not subscribe to would prove
    // nothing: the screen would not have re-rendered at all.
    const s = await mount();
    const before = { ...countsOf() };
    expect(before['gradeBars']).toBeGreaterThan(0); // they did run on mount

    await act(async () => { set({ plan: { count: 7, deferred: 0, shifted: 0, next: null, at: NOW } }); });

    for (const name of DATA_ONLY) expect({ name, ran: countsOf()[name], before: before[name] }).toEqual({ name, ran: before[name], before: before[name] });
    expect(s.json()).toContain('7 scheduled'); // …so it really did re-render, and really did show the new value
  });

  it('a plain re-render does not re-derive either', async () => {
    const s = await mount();
    const before = { ...countsOf() };
    await act(async () => { s.r.update(React.createElement(StatsScreen)); });
    expect({ gradeBars: countsOf()['gradeBars'], before: before['gradeBars'] }).toEqual({ gradeBars: before['gradeBars'], before: before['gradeBars'] });
  });

  it('a write to the data a chart reads does re-run it — otherwise the memo is stale', async () => {
    await mount();
    const before = countsOf()['gradeBars'] ?? 0;
    await act(async () => { set({ marks: [] }); });
    expect(countsOf()['gradeBars']!).toBeGreaterThan(before);
  });

  it('the day series are keyed on the day, not on the 60 s tick', () => {
    // `useNow(60_000)` re-renders every minute. `lastDays` depends only on the day, so keying the
    // series on `now` would re-run them 1440 times a day for a window that has not moved.
    const src = readFileSync(join(__dirname, '../screens/Stats.tsx'), 'utf8');
    expect(src).toContain('startOfDay(now)');
    expect(src).not.toContain('A.lastDays(105, now)');
    expect(src).toContain('[day]');
  });

  it('and the attendance derivations stay keyed on `now`, because a class that has ended counts as here', () => {
    // These three must NOT move into the day bucket: `effective()` infers "Here" once a class has
    // ended, so freezing them at midnight would leave a whole day of classes reading as unmarked.
    const src = readFileSync(join(__dirname, '../screens/Stats.tsx'), 'utf8');
    expect(src).toContain('overallAttendance');
    expect(src).toContain('attendanceByCourse');
    expect(src).toContain('attendanceHeat');
    expect(src).toContain('[courses, meetings, attendance, dayMarks, now]');
  });
});