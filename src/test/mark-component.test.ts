/**
 * v0.7 R7 (DESIGN.md D-17 Mark: "course + component"): a mark is filed under one of its course's components, so the
 * component grades (R4) can count it. A course with one component, or none, asks nothing new.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { getState, hydrate, stopResync } from '../store/store';
import { MarkSheet } from '../sheets/forms';
import type { Course, SubjectVariant } from '../domain/types';
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

const NOW = new Date(2026, 10, 14, 9).getTime();
const db: Course = { id: 'db', name: 'Database Systems', rooms: [], teacher: '', goal: 85, sort: 0, demo: false };
const lecture: SubjectVariant = { id: 'v-lec', subjectId: 'db', name: 'Lecture', room: '', teacher: '', note: '', ord: 0, kind: 'lecture', weight: 70, isBase: true };
const lab: SubjectVariant = { id: 'v-lab', subjectId: 'db', name: 'Lab', room: '', teacher: '', note: '', ord: 1, kind: 'lab', weight: 30 };
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
afterEach(() => stopResync());

async function sheet(variants: SubjectVariant[]) {
  const repo = new MemoryRepository(() => NOW);
  await repo.upsert('course', db);
  for (const v of variants) await repo.upsert('variant', v);
  await hydrate(repo);
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(MarkSheet, { courseId: 'db' })); });
  const chip = (label: string) => r.root.findAll((n) => n.props.label === label && typeof n.props.onPress === 'function')[0];
  return { r, repo, chip };
}

it('a course with a lecture and a lab: the sheet asks which, and the mark is filed under the one picked', async () => {
  const { r, chip } = await sheet([lecture, lab]);
  expect(chip('Lecture')).toBeTruthy();
  expect(chip('Lab')).toBeTruthy();
  await act(async () => { chip('Lab')!.props.onPress(); });
  const name = r.root.findAll((n) => n.props.label === 'What was it?' && typeof n.props.onChangeText === 'function')[0]!;
  await act(async () => { name.props.onChangeText('Lab report 1'); });
  const save = r.root.findAll((n) => n.props.label === 'Save' && typeof n.props.onPress === 'function')[0]!;
  await act(async () => { save.props.onPress(); await flush(); });
  const m = getState().marks.find((x) => x.name === 'Lab report 1');
  expect(m?.variantId).toBe('v-lab');
  await act(async () => { r.unmount(); });
});

it('a course with one component or none shows no component choice', async () => {
  const { r, chip } = await sheet([]);
  expect(chip('Lecture')).toBeUndefined();
  await act(async () => { r.unmount(); });
  const two = await sheet([lecture]);
  expect(two.chip('Lecture')).toBeUndefined();
  await act(async () => { two.r.unmount(); });
});
