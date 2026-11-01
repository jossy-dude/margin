/**
 * S1 (v0.5) — reproduce the Today breakage the owner reported (O4: "adding 2 classes broke the app" was
 * TWO CLASSES IN THE SAME TIME SLOT), plus the cases the spec lists beside it: a very long name, the same
 * subject twice in a day, an emoji name, and a cancelled earlier class. Each case renders the real Today
 * screen over a hydrated store and reads the deck model, so what fails here is what a student saw.
 *
 * Cases that are broken today are `it.failing` — they document the bug and turn red the moment S2 fixes
 * it, which is the signal to flip them to `it`.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { dayBlock } from '../domain/attendance';
import type { Course, Meeting } from '../domain/types';
import { deckOf, TodayScreen } from '../screens/Today';
import { hydrate, stopResync } from '../store/store';

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
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withDecay: () => 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});


jest.mock('../ui/live', () => ({ useScreenLive: () => true }));

/** Monday 5 Oct 2026, 10:15 — inside the 10:00 slot. */
const NOW = new Date(2026, 9, 5, 10, 15).getTime();
const course = (id: string, name: string, rooms: string[] = []): Course => ({ id, name, rooms, teacher: '', goal: null, sort: id.charCodeAt(0), demo: false, bar: null });
const meeting = (id: string, courseId: string, start: string, end: string): Meeting => ({ id, courseId, weekday: 0, start, end, demo: false });

const COURSES = [
  course('A', 'Database Systems', ['LR-601']), course('B', 'Database Systems LAB', ['Lab 2']),
  course('L', 'Introduction to the Theory of Computation and Formal Languages, Section B'), course('E', 'Música 🎵 y Arte'),
];
const MEETINGS = [
  meeting('m1', 'L', '08:00', '09:00'),
  meeting('m2', 'A', '10:00', '11:30'), meeting('m3', 'B', '10:00', '11:30'), // two classes, one slot
  meeting('m4', 'A', '13:00', '14:00'), // the same subject again later
  meeting('m5', 'E', '15:00', '16:00'),
];
const CANCEL_FIRST = { '2026-10-05|08:00|L': { key: '2026-10-05|08:00|L', status: 'c' as const, at: NOW, reason: '' } };

let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); jest.useRealTimers(); });
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}
async function today(attendance = {}) {
  jest.useFakeTimers({ now: NOW });
  const repo = new MemoryRepository(() => NOW);
  await repo.seed({ courses: COURSES, meetings: MEETINGS, attendance, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], settings: { onboarded: 9 } });
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(TodayScreen)); });
  live = r;
  return { r, text: leaves(r.toJSON()).join(' | ') };
}
const block = (attendance = {}) => dayBlock(NOW, MEETINGS, COURSES, attendance, {}, null);

describe('S1: Today with the cases that broke it', () => {
  it('renders at all with two classes in one slot, a long name, an emoji name and the same subject twice', async () => {
    const { text } = await today();
    expect(text).toContain('Database Systems');
  });

  it.failing('the deck says both classes in the slot are on now, not just the first', () => {
    const d = deckOf(block().periods, NOW, true);
    expect(d.state).toBe('live');
    // what a student needs: the card knows there are two, so it can show both
    expect((d as unknown as { concurrent?: number }).concurrent).toBe(2);
  });

  it.failing('"After" names the next class after the slot, never the other class in the same slot', async () => {
    const { text } = await today();
    expect(text).not.toMatch(/After \| Database Systems LAB/);
    expect(text).toMatch(/After \| Database Systems · LR-601/); // the 13:00 class
  });

  it('a cancelled earlier class does not make the count read "Period 3 of 2"', () => {
    const d = deckOf(block(CANCEL_FIRST).periods, NOW, true);
    const [, at, of] = /Period (\d+) of (\d+)/.exec(d.position) ?? [];
    expect(Number(at)).toBeLessThanOrEqual(Number(of));
  });

  it('the emoji name and the long name come through whole into the model (the card clamps, the data does not)', () => {
    const labels = block().periods.map((p) => p.label);
    expect(labels).toContain('Música 🎵 y Arte');
    expect(labels).toContain('Introduction to the Theory of Computation and Formal Languages, Section B');
  });
});
