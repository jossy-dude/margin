/**
 * v0.7 R1 — the Today route drawn for real over a hydrated store: the v0.7 page is what the route shows, the v0.6
 * one is one tap away and back (nothing it showed is out of reach), the page has ONE face (the top bar's), a tap on
 * it says a tip, and the face answers the two things done on this page: a class marked, a task done.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import type { Course, Meeting, Task } from '../domain/types';
import { Face } from '../ui/mascot/Face';
import { TodayPage } from '../screens/today/TodayPage';
import { TIPS } from '../screens/today/TodayV2';
import { splitPlace } from '../screens/today/kitv2';
import { getState, hydrate, stopResync } from '../store/store';

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
    useSharedValue: (v: unknown) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedReaction: () => {}, useAnimatedScrollHandler: () => () => {}, useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }), useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: false, useWeb: false }),
    setGestureState: () => {}, isSharedValue: () => false, makeShareable: (v: unknown) => v,
    startMapper: () => {}, stopMapper: () => {}, makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, sin: 4, linear: 1, bezier: () => (t: number) => t, back: () => (t: number) => t },
    interpolate: (_v: number, _i: number[], o: number[]) => o[0] ?? 0,
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

/** Thursday 12 Nov 2026, 09:20: inside Database Systems (09:00–09:50); Economics comes later. */
const NOW = new Date(2026, 10, 12, 9, 20).getTime();
const course = (id: string, name: string, rooms: string[]): Course => ({ id, name, rooms, teacher: '', goal: null, sort: id.charCodeAt(0), demo: false, bar: null });
const meeting = (id: string, courseId: string, start: string, end: string): Meeting => ({ id, courseId, weekday: 3, start, end, demo: false });
const task = (id: string, title: string, dueAt: number): Task => ({ id, title, courseId: 'B', kind: 'assignment', dueAt, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false });

let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); jest.useRealTimers(); });
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}
async function page(tasks: Task[] = []) {
  jest.useFakeTimers({ now: NOW });
  const repo = new MemoryRepository(() => NOW);
  await repo.seed({ courses: [course('B', 'Database Systems', ['L-4']), course('E', 'Intro to Economics', ['B-12'])], meetings: [meeting('m1', 'B', '09:00', '09:50'), meeting('m2', 'E', '13:15', '14:05')],
    attendance: {}, dayMarks: {}, tasks, notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], settings: { onboarded: 9 } });
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(TodayPage)); });
  live = r;
  return r;
}
const byId = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const press = async (r: TestRenderer.ReactTestRenderer, id: string) => { const n = byId(r, id); expect(n).toBeDefined(); await act(async () => { n!.props.onPress(); }); };
const has = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id).length > 0;
const faces = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Face);

describe('Today route (R1)', () => {
  it('shows the v0.7 Today; "Classic Today" shows the v0.6 one, and the pill brings the new one back', async () => {
    const r = await page();
    expect(has(r, 'today-v2')).toBe(true);
    expect(has(r, 'now-card')).toBe(true);
    expect(has(r, 'clock-face')).toBe(false);
    await press(r, 'today-classic');
    expect(has(r, 'today-v2')).toBe(false);
    expect(has(r, 'clock-face')).toBe(true); // the v0.6 page, whole: its clock, its deck, its lists
    expect(leaves(r.toJSON()).join(' | ')).toContain('This week');
    await press(r, 'today-new');
    expect(has(r, 'today-v2')).toBe(true);
  });

  it('has one face, in the top bar, hidden from TalkBack behind a button that names it; empty Due is words only', async () => {
    const r = await page();
    expect(faces(r)).toHaveLength(1);
    expect(faces(r)[0]!.props).toMatchObject({ name: 'smirk', size: 28, decorative: true, awake: true });
    const host = r.root.findAll((n) => n.props.testID === 'today-face' && n.props.accessibilityLabel !== undefined)[0]!;
    expect(host.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Jot, smiling. Tap for a tip' });
    expect(leaves(r.toJSON()).join(' | ')).toContain('Nothing due. Enjoy it.');
  });

  it('a tap on the face winks and says a tip, which goes after 4 s', async () => {
    const r = await page();
    await press(r, 'today-face');
    expect(faces(r)[0]!.props.name).toBe('wink');
    expect(has(r, 'today-tip')).toBe(true);
    expect(TIPS).toContain(leaves(r.root.findAll((n) => n.props.testID === 'today-tip')[0]!.children).join(''));
    await act(async () => { jest.advanceTimersByTime(4000); });
    expect(has(r, 'today-tip')).toBe(false);
    expect(faces(r)[0]!.props.name).toBe('smirk');
  });

  it('one tap on Mark marks the class present and the face hops happily; a task done does the same', async () => {
    const r = await page([task('t1', 'Reading response', NOW + 3_600_000)]);
    await press(r, 'now-mark');
    expect(getState().attendance['2026-11-12|09:00|B']?.status).toBe('p');
    expect(faces(r)[0]!.props).toMatchObject({ name: 'happy', react: { motion: 'bounce', n: 1 } });
    await act(async () => { jest.advanceTimersByTime(2400); });
    expect(faces(r)[0]!.props.name).toBe('smirk');
    await press(r, 'due-done-t1');
    expect(getState().tasks.find((t) => t.id === 't1')?.status).toBe(2);
    expect(faces(r)[0]!.props).toMatchObject({ name: 'happy', react: { motion: 'bounce', n: 2 } });
  });
});

describe('the v2 Tap', () => {
  it('places itself with its own flex and margins, and dips everything else (the week strip stretches)', () => {
    expect(splitPlace([{ flex: 1, minHeight: 64, borderRadius: 12, backgroundColor: 'red' }, { marginLeft: -12 }])).toEqual({
      place: { flex: 1, marginLeft: -12 },
      look: { minHeight: 64, borderRadius: 12, backgroundColor: 'red', flexGrow: 1 },
    });
    expect(splitPlace({ padding: 8 })).toEqual({ place: {}, look: { padding: 8 } });
    expect(splitPlace(undefined)).toEqual({ place: {}, look: {} });
  });
});
