/**
 * v0.7 U7 — the faces in the app (mascot INTEGRATE.md §1-2): a page-wide empty state carries a 64 dp face and the
 * top bar none; otherwise the top bar rests on the page's face and answers what happens on that page; an outcome
 * snackbar carries a 20 dp face, a plain or undo one none.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { act as store, getState, hydrate, stopResync, toast, dismissToast } from '../store/store';
import { TasksScreen } from '../screens/Tasks';
import { GradesScreen } from '../screens/Grades';
import { StatsScreen } from '../screens/Stats';
import { Face } from '../ui/mascot/Face';
import { ScreenLive } from '../ui/live';
import type { Task } from '../domain/types';
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
const task = (i: number, over: Partial<Task> = {}): Task => ({ id: `t${i}`, title: `Problem set ${i}`, courseId: null, kind: 'assignment', dueAt: NOW + 3_600_000, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, ...over });

beforeEach(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); });
afterEach(() => { stopResync(); dismissToast(); jest.useRealTimers(); });

async function mount(el: React.ReactElement, tasks: Task[] = []) {
  const repo = new MemoryRepository(() => NOW);
  for (const t of tasks) await repo.upsert('task', t);
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  // the navigator marks the page under the finger live; only that page's face listens
  await act(async () => { r = TestRenderer.create(React.createElement(ScreenLive.Provider, { value: true }, el)); });
  return r;
}
const faces = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Face).map((f) => ({ name: f.props.name as string, size: f.props.size as number }));
const topFace = (r: TestRenderer.ReactTestRenderer) => r.root.findAll((n) => n.props.testID === 'top-face' && typeof n.type !== 'string');

describe('one face per page', () => {
  it('an empty To-do is all clear: the cat at 64 dp, and no face in the top bar', async () => {
    const r = await mount(React.createElement(TasksScreen));
    expect(faces(r)).toEqual([{ name: 'cat', size: 64 }]);
    expect(topFace(r)).toHaveLength(0);
    await act(async () => { r.unmount(); });
  });
  it('Grades with no subjects is a wink at 64 dp, and no face in the top bar', async () => {
    const r = await mount(React.createElement(GradesScreen));
    expect(faces(r)).toEqual([{ name: 'wink', size: 64 }]);
    expect(topFace(r)).toHaveLength(0);
    await act(async () => { r.unmount(); });
  });
  it('Stats with nothing to report: a 64 dp wink on its card, and no face in the top bar', async () => {
    const r = await mount(React.createElement(StatsScreen));
    expect(faces(r)).toEqual([{ name: 'wink', size: 64 }]);
    expect(topFace(r)).toHaveLength(0);
    await act(async () => { r.unmount(); });
  });
  it('a To-do with work due today: the top bar is excited at 28 dp, a button TalkBack reads as Jot', async () => {
    const r = await mount(React.createElement(TasksScreen), [task(1)]);
    expect(faces(r)).toEqual([{ name: 'excited', size: 28 }]);
    const b = topFace(r)[0]!;
    expect(b.props.accessibilityRole).toBe('button');
    expect(String(b.props.accessibilityLabel)).toMatch(/^Jot, /);
    await act(async () => { r.unmount(); });
  });
});

describe('the top bar answers', () => {
  it('ticking a task done makes it happy with a bounce, then it goes back', async () => {
    const r = await mount(React.createElement(TasksScreen), [task(1), task(2, { dueAt: null })]);
    const box = r.root.find((n) => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel === 'Mark Problem set 2 done' && typeof n.props.onPress === 'function');
    await act(async () => { box.props.onPress(); });
    const f = r.root.findAllByType(Face).find((x) => x.props.size === 28)!;
    expect(f.props.name).toBe('happy');
    expect(f.props.react).toMatchObject({ motion: 'bounce' });
    await act(async () => { jest.advanceTimersByTime(2400); });
    expect(r.root.findAllByType(Face).find((x) => x.props.size === 28)!.props.name).toBe('excited');
    await act(async () => { r.unmount(); });
  });
  it('reopening a done task is not news', async () => {
    const r = await mount(React.createElement(TasksScreen), [task(1), task(2, { status: 2, completedAt: NOW })]);
    await act(async () => { store.setSettings({ taskFilter: 'done' }); });
    const box = r.root.find((n) => n.props.accessibilityRole === 'checkbox' && n.props.accessibilityLabel === 'Mark Problem set 2 not done' && typeof n.props.onPress === 'function');
    await act(async () => { box.props.onPress(); });
    const f = r.root.findAllByType(Face).find((x) => x.props.size === 28);
    expect(f?.props.name).not.toBe('happy');
    await act(async () => { store.setSettings({ taskFilter: 'open' }); r.unmount(); });
  });
});

describe('snackbars', () => {
  it('toast() can say how it went; plain and undo toasts say nothing', () => {
    toast('Saved', undefined, 'success');
    expect(getState().toast).toMatchObject({ text: 'Saved', kind: 'success' });
    toast('Import failed: x', undefined, 'error');
    expect(getState().toast?.kind).toBe('error');
    toast('Task deleted', () => {});
    expect(getState().toast?.kind).toBeUndefined();
  });
});
