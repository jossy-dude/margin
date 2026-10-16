/**
 * A sheet that saves and stays open is a sheet that looks broken.
 *
 * ## The defect this file exists for
 *
 * Every form in the app closes itself through `useSheet()`. That hook reads a React context, and
 * the `Sheet` that *provides* it is the form's own child element:
 *
 * ```tsx
 * export function TaskSheet(props) {
 *   const { close } = useSheet();          // ← runs while TaskSheet renders
 *   return <Sheet onClose={act.close}>…</Sheet>;   // ← the provider is BELOW this line
 * }
 * ```
 *
 * A provider cannot reach its own parent, so `useSheet()` in a form body reads the context
 * **default** — `{ close: () => undefined }`. Every one of those `close()` calls was a no-op, in
 * all seven forms plus the Add sheet: 24 call sites, including every Save, every Delete, every
 * attendance mark, "Back to automatic", and both "focus on this" buttons.
 *
 * What the user saw is the worst version of it. The store write happened first and it *did* land —
 * the data was saved — so the screen behind the sheet updated while the sheet stayed on top of it,
 * still holding the old values. Tapping Save again re-saved. Deleting a task left the form open on
 * a task that no longer existed. Nothing said "done"; there was no way out but the ✕, the dim area
 * or a back gesture, which are the three affordances that do work — so the one button labelled
 * "Save" was the one that did nothing, in every form, forever.
 *
 * ## Why this is a rendering test and not a source assertion
 *
 * The wiring is the whole claim, and reading `forms.tsx` shows a `close()` that looks correct in
 * all 24 places. Only a mount can tell whether the value that `close` closes over is the real
 * callback or the context default. So each case drives the shipped button and asks the store and
 * the tree what happened.
 *
 * ## Why the harness runs the deferred-close honestly
 *
 * `close()` is deferred: the sheet animates out for 210 ms and only then removes itself from the
 * store. Reanimated is stubbed here, and a stub that drops its completion callback turns every
 * deferred close into a fake failure — which is the opposite of what this file is for. The stub
 * therefore stores `withTiming`'s callback and runs it from the shared value's `set`, which is what
 * Reanimated does when the tween finishes. `src/test/after-close.test.ts` covers the same deferral
 * against the real `Sheet`.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { getState, hydrate, set, stopResync } from '../store/store';
import { initTimer } from '../domain/timer';
import { Overlay } from '../ui/Overlay';
import { ThemeProvider } from '../ui/theme-context';
import type { SheetSpec } from '../store/store';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, pause: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) => R.createElement(R.Fragment, null, children as React.ReactNode);
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaProvider: Provider };
});
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => { const C = (p: object) => R.createElement(RNView, p); C.displayName = 'AnimatedProxy'; return C; };
  const layout = { duration: () => ({ easing: () => ({}) }) };
  const api = {
    __esModule: true, View: mk(), Text: mk(), ScrollView: mk(), Image: mk(), createAnimatedComponent: (c: unknown) => c,
    /* `withTiming(to, config, cb)` parks the callback on the returned value and the shared value's
       `set` runs it — the tween finishing. A `set` that ignored it would make all 24 deferred
       closes look broken, which is the failure mode this file exists to catch for real. */
    useSharedValue: (v: number) => { const sv = { value: v, get: () => sv.value, set: (x: number | { done?: (d: boolean) => void }) => { if (typeof x === 'object' && x.done) { x.done(true); return; } sv.value = x as number; } }; return sv; },
    useAnimatedStyle: (fn: () => object) => fn(), useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }), useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {}, useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }), useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: () => false, useWeb: false }),
    setGestureState: () => {}, isSharedValue: () => false, makeShareable: (v: unknown) => v,
    startMapper: () => {}, stopMapper: () => {}, makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, bezier: () => (t: number) => t, back: () => (t: number) => t },
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => (cb ? { done: cb } : to),
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: layout, FadeOut: layout, FadeInDown: layout, FadeOutDown: layout,
  };
  /* `default` is the same object: `react-native-gesture-handler` reads `Reanimated.default.createAnimatedComponent`
     at import time, and a default that lacks it takes the whole suite down before a test runs. */
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 10, 20).getTime();

/** The demo set, so a form has real rows to edit rather than an empty state. */
const seed = async () => {
  const repo = new MemoryRepository(() => NOW);
  await repo.seed(seedSnapshot(NOW));
  await hydrate(repo);
  stopResync();
  set({ route: 'Today', prevRoute: null, settingsPath: [], toast: null, timer: initTimer(), focusTaskId: null, fev: null, plan: null, notifLog: [], notifStatus: null, ready: true });
  return repo;
};

let live: TestRenderer.ReactTestRenderer | undefined;

/** Open `sheet` and return a driver for the mounted tree. */
const open = async (sheet: SheetSpec) => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  await seed();
  set({ sheet });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ThemeProvider, null, React.createElement(Overlay))); });
  live = r;
  const press = async (label: string) => {
    const n = r.root.findAll((x) => (x.props as { accessibilityLabel?: string }).accessibilityLabel === label && typeof (x.props as { onPress?: unknown }).onPress === 'function')[0];
    if (!n) throw new Error(`no control labelled "${label}" on ${sheet.t}`);
    await act(async () => { (n.props as { onPress: () => void }).onPress(); });
    await act(async () => {}); // the deferred close lands on its own commit
  };
  const type = async (index: number, text: string) => {
    const inputs = r.root.findAll((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function');
    await act(async () => { (inputs[index]!.props as { onChangeText: (t: string) => void }).onChangeText(text); });
  };
  return { r, press, type, text: () => JSON.stringify(r.toJSON()) };
};

afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

describe('a form that writes its row also dismisses itself', () => {
  it('the task form: Save', async () => {
    const s = await open({ t: 'task' });
    await s.type(0, 'Problem set 6');
    expect(getState().sheet).not.toBeNull();
    await s.press('Add');
    expect(getState().tasks.some((t) => t.title === 'Problem set 6')).toBe(true); // the write landed…
    expect(getState().sheet).toBeNull();                                    // …and the sheet left
  });

  it('the task form: editing an existing task, Save', async () => {
    const s = await open({ t: 'task', id: 'seed-task-2' });
    await s.type(0, 'Reading response — Ch. 7, revised');
    await s.press('Save');
    expect(getState().tasks.find((t) => t.id === 'seed-task-2')?.title).toBe('Reading response — Ch. 7, revised');
    expect(getState().sheet).toBeNull();
  });

  it('the task form: Delete removes the row AND closes, so the form cannot outlive its task', async () => {
    const s = await open({ t: 'task', id: 'seed-task-2' });
    const before = getState().tasks.length;
    await s.press('Delete');
    expect(getState().tasks.length).toBe(before - 1);
    expect(getState().sheet).toBeNull();
  });

  it('the task form: "Focus on this" closes and then starts the session', async () => {
    const s = await open({ t: 'task', id: 'seed-task-2' });
    await s.press('Focus on this');
    expect(getState().sheet).toBeNull();
    expect(getState().route).toBe('Focus');
    expect(getState().timer.taskId).toBe('seed-task-2');
  });

  it('the attendance sheet: marking a class writes the mark and closes', async () => {
    const s = await open({ t: 'status', mode: 'class', key: '2026-10-05|08:30|E', title: 'Economics', date: '2026-10-05' });
    await s.press('Absent');
    expect(getState().attendance['2026-10-05|08:30|E']?.status).toBe('a');
    expect(getState().sheet).toBeNull();
  });

  it('the day sheet: marking a whole day writes the mark and closes', async () => {
    const s = await open({ t: 'status', mode: 'day', key: '2026-10-07', title: 'Wednesday', date: '2026-10-07' });
    await s.press('Sick');
    expect(getState().dayMarks['2026-10-07']?.status).toBe('s');
    expect(getState().sheet).toBeNull();
  });

  it('the subject form: Save', async () => {
    const s = await open({ t: 'course' });
    await s.type(0, 'Organic Chemistry');
    await s.press('Save');
    expect(getState().courses.some((c) => c.name === 'Organic Chemistry')).toBe(true);
    expect(getState().sheet).toBeNull();
  });

  it('the subject form: Delete subject', async () => {
    const s = await open({ t: 'course', id: 'E' });
    const before = getState().courses.length;
    await s.press('Delete subject');
    expect(getState().courses.length).toBe(before - 1);
    expect(getState().sheet).toBeNull();
  });

  it('the class form: Save', async () => {
    const s = await open({ t: 'meeting' });
    await s.press('Save');
    expect(getState().meetings.length).toBeGreaterThan(0);
    expect(getState().sheet).toBeNull();
  });

  it('the class form: Delete class', async () => {
    const s = await open({ t: 'meeting', id: 'm-0-08:30-E' });
    const before = getState().meetings.length;
    await s.press('Delete class');
    expect(getState().meetings.length).toBe(before - 1);
    expect(getState().sheet).toBeNull();
  });

  it('the mark form: Save', async () => {
    const s = await open({ t: 'mark', courseId: 'E' });
    await s.type(0, 'Quiz 3');
    await s.press('Save');
    expect(getState().marks.some((m) => m.name === 'Quiz 3')).toBe(true);
    expect(getState().sheet).toBeNull();
  });

  it('the mark form: Delete mark', async () => {
    const s = await open({ t: 'mark', courseId: 'E', id: 'seed-mark-E-0' });
    const before = getState().marks.length;
    await s.press('Delete mark');
    expect(getState().marks.length).toBe(before - 1);
    expect(getState().sheet).toBeNull();
  });

  it('the note form: Pin it', async () => {
    const s = await open({ t: 'notice' });
    await s.type(0, 'Bring the sources binder');
    await s.press('Pin it');
    expect(getState().notices.some((n) => n.text === 'Bring the sources binder')).toBe(true);
    expect(getState().sheet).toBeNull();
  });

  it('the note form: Delete note', async () => {
    const s = await open({ t: 'notice', id: 'seed-note-1' });
    const before = getState().notices.length;
    await s.press('Delete note');
    expect(getState().notices.length).toBe(before - 1);
    expect(getState().sheet).toBeNull();
  });

  it('the Add sheet: "Start a focus session" closes and goes to Focus', async () => {
    const s = await open({ t: 'add' });
    await s.press('Start a focus session');
    expect(getState().sheet).toBeNull();
    expect(getState().route).toBe('Focus');
  });

  it('"Back to automatic" clears the mark and closes', async () => {
    await seed();
    await act(async () => { live?.unmount(); });
    const repo = new MemoryRepository(() => NOW);
    await repo.seed(seedSnapshot(NOW));
    await hydrate(repo);
    stopResync();
    set({ sheet: { t: 'status', mode: 'class', key: '2026-10-05|08:30|E', title: 'Economics', date: '2026-10-05' }, attendance: { '2026-10-05|08:30|E': { key: '2026-10-05|08:30|E', status: 'a', at: NOW, reason: '' } } });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(React.createElement(ThemeProvider, null, React.createElement(Overlay))); });
    live = r;
    const n = r.root.findAll((x) => (x.props as { accessibilityLabel?: string }).accessibilityLabel === 'Back to automatic')[0]!;
    await act(async () => { (n.props as { onPress: () => void }).onPress(); });
    await act(async () => {});
    expect(getState().attendance['2026-10-05|08:30|E']).toBeUndefined();
    expect(getState().sheet).toBeNull();
  });
});

/**
 * The wiring assertion, because a rendering test cannot see WHY it failed. `useSheet()` is a
 * context read and `Sheet` is the provider, so the only correct arrangement is for the body to stop
 * reaching through context for its own closer at all.
 */
describe('no form reaches for its own closer through a context its own child provides', () => {
  it('no body calls the context hook, and all seven take the ref their own Sheet fills', () => {
    const src = readFileSync(join(__dirname, '..', 'sheets', 'forms.tsx'), 'utf8');
    /* `useSheetClose` contains the substring `useSheet`, so the guard looks for the *call* and for a
       destructuring of the bare hook: either would be a body reading the context default again. */
    expect(src).not.toMatch(/useSheet\s*\(\s*\)/);
    expect(/\{[^}]*\}\s*=\s*useSheet\b/.test(src)).toBe(false);
    expect((src.match(/useSheetClose\(\)/g) ?? []).length).toBe(7);
    /* One per form, and one more than the number of bodies — a `closeRef` prop that was passed but
       never filled, or filled but never passed, is the half-migrated state this guards against. */
    expect((src.match(/closeRef=\{closeRef\}/g) ?? []).length).toBe(7);
    expect((src.match(/<Sheet /g) ?? []).length).toBe(7);
  });
});
