import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { hydrate, stopResync } from '../store/store';
import { PAGE_ROWS, TasksScreen } from '../screens/Tasks';
import type { Task } from '../domain/types';

/**
 * F8/F9 — a thousand tasks. The To-do page draws one page of cards and a "Show more" row, so the first
 * visit and every refocus (which rebuilds the page's layout) stay proportional to what is on screen.
 */
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
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});


const NOW = new Date(2026, 9, 5, 8).getTime();
const task = (i: number): Task => ({ id: `t${i}`, title: `Problem set ${i} — مسألة ${i} 📚`, courseId: null, kind: 'assignment', dueAt: NOW + i * 3_600_000, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false });

afterEach(() => stopResync());

it('draws one page of cards out of 1,000 tasks, and Show more draws the next page', async () => {
  const repo = new MemoryRepository(() => NOW);
  for (let i = 0; i < 1000; i++) await repo.upsert('task', task(i));
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(TasksScreen)); });
  const cards = () => r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string' && /^Problem set \d+/.test(n.props.accessibilityLabel) && typeof n.type !== 'string').length;
  const firstPage = cards();
  expect(firstPage).toBeGreaterThan(0);
  const more = r.root.find((n) => n.props.testID === 'tasks-show-more' && typeof n.props.onPress === 'function');
  expect(String(more.props.label)).toBe(`Show ${PAGE_ROWS} more · ${1000 - PAGE_ROWS} not shown`);
  await act(async () => { more.props.onPress(); });
  expect(cards()).toBe(firstPage * 2);
  await act(async () => { r.unmount(); });
});
