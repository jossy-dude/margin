/**
 * v0.7.7.2 (SPEC §3): Grades shows `Lecture | Lab` for a subject with a lab part, both percentages always, and
 * ticking a lab cell never moves the lecture's percentage.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { act as store, getState, hydrate, stopResync, dismissToast } from '../store/store';
import { GradesScreen } from '../screens/Grades';
import { ScreenLive } from '../ui/live';
import { REAL_COURSES, REAL_MEETINGS, REAL_VARIANTS } from './fixtures/real-timetable';
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));
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
       exactly what a smoke render wants. Same shape as `onboarding.test.ts`. */
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
    ...Object.fromEntries(['FadeIn', 'FadeOut', 'FadeInDown', 'FadeOutDown', 'FadeInRight', 'FadeOutRight', 'FadeInLeft', 'FadeOutLeft'].map((k) => { const b: Record<string, () => unknown> = {}; b.duration = b.easing = b.delay = () => b; return [k, b]; })),
  };
  return { ...api, default: api };
});


// Tuesday 2026-11-24, 18:00: both of Tuesday's DB classes have ended, so they read as inferred "present".
const NOW = new Date(2026, 10, 24, 18).getTime();
beforeEach(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); });
afterEach(() => { stopResync(); dismissToast(); jest.useRealTimers(); });

async function mount() {
  const repo = new MemoryRepository(() => NOW);
  for (const c of REAL_COURSES.filter((x) => x.id === 'db')) await repo.upsert('course', c);
  for (const v of REAL_VARIANTS) await repo.upsert('variant', v);
  for (const m of REAL_MEETINGS.filter((x) => x.courseId === 'db')) await repo.upsert('meeting', m);
  await hydrate(repo);
  await act(async () => { getState(); });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ScreenLive.Provider, { value: true }, React.createElement(GradesScreen))); });
  return r;
}
const tab = (r: TestRenderer.ReactTestRenderer, name: string) => r.root.findAll((n) => n.props.testID === `part-${name}` && typeof n.props.onPress === 'function')[0]!;
const cells = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('att-cell-') && typeof n.props.onLongPress === 'function');

describe('Grades with a lab part', () => {
  it('shows Lecture | Lab with both percentages, and the lab strip marks its cells', async () => {
    const r = await mount();
    expect(tab(r, 'lecture').props.accessibilityLabel).toMatch(/^Lecture, \d+ percent$/);
    expect(tab(r, 'lab').props.accessibilityLabel).toMatch(/^Lab, \d+ percent$/);
    expect(cells(r).every((c) => !String(c.props.testID).includes('~db~lab'))).toBe(true); // the lecture strip first
    await act(async () => { tab(r, 'lab').props.onPress(); });
    const lab = cells(r);
    expect(lab.length).toBeGreaterThan(0);
    expect(lab.every((c) => String(c.props.testID).endsWith('~db~lab'))).toBe(true);
    expect(r.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.endsWith('~db~lab-dot') && typeof n.type === 'string').length).toBe(lab.length);
    expect(lab[0]!.props.accessibilityLabel).toMatch(/^Lab · /);
    await act(async () => { r.unmount(); });
  });
  it('marking a lab class absent moves the Lab percentage and never the Lecture\'s', async () => {
    const r = await mount();
    const lecBefore = tab(r, 'lecture').props.accessibilityLabel, labBefore = tab(r, 'lab').props.accessibilityLabel;
    const key = `2026-11-24|09:45|db~db~lab`;
    await act(async () => { store.setAtt(key, 'a'); });
    expect(getState().attendance[key]?.status).toBe('a');
    expect(tab(r, 'lecture').props.accessibilityLabel).toBe(lecBefore);
    expect(tab(r, 'lab').props.accessibilityLabel).not.toBe(labBefore);
    await act(async () => { r.unmount(); });
  });
});
