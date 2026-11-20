/**
 * v0.7 R2, v0.8 §2.1 — the view-model (Monday first, the picked day, the grid's span, due by day, a moved class where
 * it went), the drag's landing maths, and the ONE Week drawn for real in every skin: a held class opens the move
 * panel; "This week only" writes a one-off move, "Every week" moves the timetable; a clash cannot be saved.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import type { Course, Meeting, Task } from '../domain/types';
import { WeekScreen } from '../screens/Week';
import { dropSlot, hhmm, slotId, slotOf, weekView, type WeekInput } from '../screens/week/model';
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
    ...Object.fromEntries(['FadeIn', 'FadeOut', 'FadeInDown', 'FadeOutDown', 'FadeInRight', 'FadeOutRight', 'FadeInLeft', 'FadeOutLeft'].map((k) => { const b: Record<string, () => unknown> = {}; b.duration = b.easing = b.delay = () => b; return [k, b]; })),
  };
  return { ...api, default: api };
});
jest.mock('../ui/live', () => ({ useScreenLive: () => true }));


const THU = new Date(2026, 10, 12, 9, 20).getTime(); // Thursday 12 Nov 2026, in Database Systems
const course = (id: string, name: string, rooms: string[]): Course => ({ id, name, rooms, teacher: '', goal: null, sort: id.charCodeAt(0), demo: false, bar: null });
const mt = (id: string, courseId: string, weekday: number, start: string, end: string): Meeting => ({ id, courseId, weekday, start, end, demo: false });
const COURSES = [course('B', 'Database Systems', ['L-4']), course('E', 'Intro to Economics', ['B-12'])];
const MEETINGS = [mt('m1', 'B', 3, '09:00', '09:50'), mt('m2', 'E', 3, '13:15', '14:05'), mt('m3', 'E', 0, '08:30', '09:20'), mt('m4', 'E', 4, '13:15', '14:05')];
const task = (id: string, title: string, dueAt: number): Task => ({ id, title, courseId: 'B', kind: 'assignment', dueAt, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false });
const input = (over: Partial<WeekInput> = {}): WeekInput => ({ now: THU, off: 0, sel: null, meetings: MEETINGS, courses: COURSES, variants: [], attendance: {}, dayMarks: {}, tasks: [], hour12: false, ...over });

describe('Week v2 view-model', () => {
  it('Monday first; the picked day is today this week and Monday in another; the grid spans at least 08–16', () => {
    const vm = weekView(input());
    expect(vm.days.map((d) => d.dw)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(vm.sel.dw).toBe('Thu');
    expect(vm.sel.classes.map((x) => x.name)).toEqual(['Database Systems', 'Intro to Economics']);
    expect(vm.when).toBe('This week');
    expect(vm.label).toBe('9 Nov – 15 Nov');
    expect(vm.span).toEqual({ start: 480, end: 960 });
    const next = weekView(input({ off: 1 }));
    expect([next.when, next.sel.dw, next.sel.date]).toEqual(['Next week', 'Mon', '2026-11-16']);
  });
  it('due this week is grouped by day; a moved class shows where it went', () => {
    const vm = weekView(input({ tasks: [task('t1', 'Essay', new Date(2026, 10, 13, 17).getTime()), task('t2', 'Later', new Date(2026, 10, 20, 9).getTime())] }));
    expect(vm.due.map((g) => [g.label, g.rows.map((r) => r.title)])).toEqual([['Fri 13 Nov', ['Essay']]]);
    const moved = weekView(input({ moves: [{ id: 'v', meetingId: 'm2', date: '2026-11-12', to: '2026-11-13', start: '10:00', end: '10:50' }] }));
    expect(moved.days[3]!.classes.map((x) => x.name)).toEqual(['Database Systems']);
    expect(moved.days[4]!.classes.map((x) => [x.name, x.range])).toEqual([['Intro to Economics', '10:00–10:50'], ['Intro to Economics', '13:15–14:05']]);
  });
});

describe('the drag lands on a 5-minute slot inside the grid', () => {
  it('rounds to the nearest column and 5 minutes, and keeps the whole class inside 08–16', () => {
    // Thursday (3) 09:00, 50 min; columns 40 dp wide; 0.9 dp a minute
    expect(dropSlot(3, 540, 50, 41, 0.9 * 62, 40, 0.9, 480, 960)).toEqual({ day: 4, start: 600 });
    expect(dropSlot(3, 540, 50, -500, 0, 40, 0.9, 480, 960)).toEqual({ day: 0, start: 540 });
    expect(dropSlot(3, 540, 50, 500, 9999, 40, 0.9, 480, 960)).toEqual({ day: 6, start: 910 });
    expect(dropSlot(3, 540, 50, 0, -9999, 40, 0.9, 480, 960)).toEqual({ day: 3, start: 480 });
    expect(slotOf(slotId({ day: 5, start: 845 }))).toEqual({ day: 5, start: 845 });
    expect(hhmm(845)).toBe('14:05');
  });
});

let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); jest.useRealTimers(); });
async function page(palette: 'daylight' | 'collage' | 'plain' | 'refined' = 'daylight') {
  jest.useFakeTimers({ now: THU });
  const repo = new MemoryRepository(() => THU);
  await repo.seed({ courses: COURSES, meetings: MEETINGS, attendance: {}, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], settings: { onboarded: 9, palette, lookV: 2 } });
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(WeekScreen)); });
  live = r;
  return r;
}
const node = (r: TestRenderer.ReactTestRenderer, id: string, prop = 'onPress') => r.root.findAll((n) => n.props.testID === id && typeof n.props[prop] === 'function')[0];
const call = async (r: TestRenderer.ReactTestRenderer, id: string, prop = 'onPress') => { const n = node(r, id, prop); expect(n).toBeDefined(); await act(async () => { n!.props[prop](); }); };
const has = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id).length > 0;
const disabled = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props.testID === id && n.props.accessibilityState)[0]?.props.accessibilityState.disabled;

const hold = async (r: TestRenderer.ReactTestRenderer, key: string) => {
  const n = r.root.findAll((x) => x.props.testID === `week-cell-${key}` && typeof x.props.onAccessibilityAction === 'function')[0];
  expect(n).toBeDefined();
  await act(async () => { n!.props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } }); });
};

describe('Week route (R2, one Week in every skin)', () => {
  it('every Style draws the same Week, its classes ready to drag', async () => {
    for (const palette of ['daylight', 'collage', 'plain', 'refined'] as const) {
      const r = await page(palette);
      expect(has(r, 'week-cell-2026-11-12|09:00|B')).toBe(true);
      await act(async () => { r.unmount(); }); live = undefined;
    }
  });

  it('hold a class, pick Tuesday: "This week only" writes a one-off move and the class shows on Tuesday', async () => {
    const r = await page();
    await hold(r, '2026-11-12|13:15|E');
    expect(has(r, 'week-move')).toBe(true);
    expect(disabled(r, 'move-week')).toBe(true); // nothing changed yet
    await call(r, 'move-day-1');
    expect(disabled(r, 'move-week')).toBe(false);
    await call(r, 'move-week');
    expect(has(r, 'week-move')).toBe(false);
    expect(getState().settings.moves).toEqual([expect.objectContaining({ meetingId: 'm2', date: '2026-11-12', to: '2026-11-10', start: '13:15', end: '14:05' })]);
    expect(getState().meetings.find((m) => m.id === 'm2')).toMatchObject({ weekday: 3, start: '13:15' }); // the timetable is untouched
    expect(has(r, 'week-cell-2026-11-10|13:15|E')).toBe(true);
  });

  it('"Every week" moves the class in the timetable itself', async () => {
    const r = await page();
    await hold(r, '2026-11-12|09:00|B');
    await call(r, 'move-day-1');
    await call(r, 'move-every');
    expect(getState().meetings.find((m) => m.id === 'm1')).toMatchObject({ weekday: 1, start: '09:00', end: '09:50' });
    expect(getState().settings.moves ?? []).toEqual([]);
  });

  it('a slot where the same class already starts cannot be saved', async () => {
    const r = await page();
    await hold(r, '2026-11-12|13:15|E');
    await call(r, 'move-day-0'); // Monday: Economics is there at 08:30, not 13:15, so it can go
    expect(disabled(r, 'move-week')).toBe(false);
    await call(r, 'move-day-4'); // Friday: Economics already starts at 13:15
    expect(disabled(r, 'move-week')).toBe(true);
    expect(disabled(r, 'move-every')).toBe(true);
    expect(JSON.stringify(r.toJSON())).toContain('already starts at 13:15 on Fri');
  });
});
