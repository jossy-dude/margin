/**
 * Stats "Are you showing up?": a subject that meets twice on one day (a lecture and a lab on Monday) gives two
 * dots with the same date. They used to be keyed by date alone, and React warned "Encountered two children with
 * the same key" (Stats.tsx → ShowingUp). Every dot needs its own key.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ShowingUp, type SubjectAtt } from '../ui/stats/sections';
import type { Course } from '../domain/types';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => { const C = (p: object) => R.createElement(RNView, p); C.displayName = 'AnimatedProxy'; return C; };
  const api = {
    __esModule: true, View: mk(), Text: mk(), ScrollView: mk(), Image: mk(),
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (v: unknown) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(), useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }), useAnimatedReaction: () => {},
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, sin: 4, linear: 1, bezier: () => (t: number) => t },
    interpolate: (_v: number, _i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f,
    withTiming: (to: number) => to, withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
  };
  return { ...api, default: api };
});

const course = { id: 'db', name: 'Database' } as Course;
const row: SubjectAtt = {
  course, rate: 1, here: 3, held: 3, canMiss: 0,
  dots: [
    { date: '2026-11-09', status: 'p', inferred: false },
    { date: '2026-11-09', status: 'p', inferred: false },
    { date: '2026-11-11', status: 'p', inferred: true },
  ],
} as SubjectAtt;
const b = { held: 3, present: 3, late: 0, absent: 0, cancelled: 0, why: { a: {}, c: {} } } as unknown as React.ComponentProps<typeof ShowingUp>['b'];

it('two classes of one subject on the same day draw two dots without a key clash', async () => {
  const err = jest.spyOn(console, 'error').mockImplementation(() => {});
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(ShowingUp, { b, rows: [row], tint: () => '#ccc' })); });
  const keyWarnings = err.mock.calls.filter((c) => String(c[0]).includes('same key'));
  err.mockRestore();
  expect(keyWarnings).toEqual([]);
  r.unmount();
});
