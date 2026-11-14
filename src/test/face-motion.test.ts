/**
 * v0.7 U7 — `Face.tsx` itself: what it asks Reanimated for. Reanimated is replaced by a recorder, so every write to
 * a shared value is kept as the animation it describes (`timing`, `spring`, `seq`, `delay`, `repeat`) and the value
 * is settled to where that animation ends. Timers are Jest's fake ones. That is enough to pin the contracts:
 *
 *  · the twelve faces render as five paths with a label each; a decorative face is hidden from TalkBack;
 *  · a name change morphs in 220 ms on the UI thread, and is a cut under reduced motion or off-screen;
 *  · between motions NOTHING animates: a blink is one 140 ms sequence after a 3.5–7 s JS timer, never a
 *    `withRepeat` of `withDelay`s (those ask for a frame on every vsync while they wait);
 *  · breathing is three 4 s breaths, only ≥ 64 dp, re-armed by a new face or a reaction;
 *  · bounce, droop and look are the D-21 numbers, and do nothing under reduced motion;
 *  · unmounting cancels every animation and every timer (F13).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

type Anim = { anim: 'timing'; to: number; ms?: number } | { anim: 'spring'; to: number; cfg?: object } | { anim: 'seq'; items: unknown[] } | { anim: 'delay'; ms: number; inner: unknown } | { anim: 'repeat'; inner: unknown; n: number };
interface SV { v: unknown; writes: unknown[]; get(): unknown; set(n: unknown): void }
const mockMade: SV[] = [];
const mockCancelled: SV[] = [];
const mockUi = { calls: 0 };
let mockReduce = false;

jest.mock('../ui/theme-context', () => ({ useTheme: () => ({ dark: false }), useReduceMotion: () => mockReduce }));
jest.mock('react-native-svg', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Svg = (p: { children?: React.ReactNode }) => R.createElement('Svg', p, p.children);
  return { __esModule: true, default: Svg, Path: 'Path' };
});
jest.mock('react-native-reanimated', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const settle = (a: unknown): unknown => {
    if (!a || typeof a !== 'object' || !('anim' in a)) return a;
    const x = a as Anim;
    if (x.anim === 'timing' || x.anim === 'spring') return x.to;
    if (x.anim === 'seq') return settle(x.items[x.items.length - 1]);
    return settle(x.inner);
  };
  const useSharedValue = (v: unknown) => {
    const r = R.useRef<SV | null>(null);
    if (!r.current) {
      const s: SV = { v, writes: [], get: () => s.v, set: (n) => { s.writes.push(n); s.v = settle(n); } };
      mockMade.push(s); r.current = s;
    }
    return r.current;
  };
  const createAnimatedComponent = (C: unknown) => {
    const A = ({ animatedProps, ...p }: { animatedProps?: object }) => R.createElement(C as string, { ...p, ...animatedProps });
    return A;
  };
  const api = {
    __esModule: true,
    View: (p: object) => R.createElement(View, p),
    createAnimatedComponent,
    useSharedValue,
    useAnimatedProps: (fn: () => object) => fn(),
    useAnimatedStyle: (fn: () => object) => fn(),
    runOnUI: (fn: (...a: unknown[]) => void) => (...a: unknown[]) => { mockUi.calls++; fn(...a); },
    cancelAnimation: (s: SV) => { mockCancelled.push(s); },
    withTiming: (to: number, c?: { duration?: number }) => ({ anim: 'timing', to, ms: c?.duration }),
    withSpring: (to: number, cfg?: object) => ({ anim: 'spring', to, cfg }),
    withSequence: (...items: unknown[]) => ({ anim: 'seq', items }),
    withDelay: (ms: number, inner: unknown) => ({ anim: 'delay', ms, inner }),
    withRepeat: (inner: unknown, n: number) => ({ anim: 'repeat', inner, n }),
    Easing: { bezier: () => 'bezier', linear: 'linear', sin: 'sin', quad: 'quad', in: (f: unknown) => f, out: (f: unknown) => f, inOut: (f: unknown) => f },
  };
  return { ...api, default: api };
});

// eslint-disable-next-line import/first
import { Face, type FaceHandle, type FaceProps } from '../ui/mascot/Face';
// eslint-disable-next-line import/first
import { FACES, FACE_NAMES, eyePath, mouthPath, BLINK, BOUNCE, BOUNCE_SPRING, BREATHS, DROOP, LOOK_HOLD_MS, LOOK_SPRING, SLOW_BLINK } from '../ui/mascot/faces';

/** The shared values in the order `Face` makes them. */
const ORDER = ['from', 'to', 't', 'blink', 'peek', 'lx', 'ly', 'lift', 'breath'] as const;
const sv = (k: (typeof ORDER)[number]) => mockMade[ORDER.indexOf(k)]!;
const animated = () => (['t', 'blink', 'lx', 'ly', 'lift', 'breath'] as const).map(sv);
const isAnim = (w: unknown, kind: Anim['anim']) => !!w && typeof w === 'object' && (w as Anim).anim === kind;
/** Does an animation (or anything inside it) contain a part of this kind? */
const has = (w: unknown, kind: Anim['anim']): boolean => {
  if (!w || typeof w !== 'object' || !('anim' in w)) return false;
  const x = w as Anim;
  if (x.anim === kind) return true;
  if (x.anim === 'seq') return x.items.some((i) => has(i, kind));
  return 'inner' in x ? has(x.inner, kind) : false;
};

let live: TestRenderer.ReactTestRenderer | null = null;
const handle = React.createRef<FaceHandle>();
function mount(p: Partial<FaceProps> = {}) {
  mockMade.length = 0; mockCancelled.length = 0; mockUi.calls = 0;
  act(() => { live = TestRenderer.create(React.createElement(Face, { name: 'smirk', ref: handle, ...p })); });
  expect(mockMade).toHaveLength(ORDER.length); // the order above still mirrors Face.tsx
  return live!;
}
const update = (p: Partial<FaceProps>) => act(() => { live!.update(React.createElement(Face, { name: 'smirk', ref: handle, ...p })); });
const unmount = () => { act(() => { live?.unmount(); }); live = null; };
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
let random: jest.SpyInstance;
beforeEach(() => { jest.useFakeTimers(); random = jest.spyOn(Math, 'random').mockReturnValue(0.5); });
afterEach(() => { unmount(); mockReduce = false; random.mockRestore(); jest.useRealTimers(); });

/** Total length of a sequence of timings and delays, in ms. */
const msOf = (a: unknown): number => {
  const x = a as Anim;
  if (x.anim === 'timing') return x.ms ?? 0;
  if (x.anim === 'delay') return x.ms + msOf(x.inner);
  if (x.anim === 'seq') return x.items.reduce<number>((s, i) => s + msOf(i), 0);
  return 0;
};

describe('Face renders', () => {
  it('all twelve faces, as five paths at rest, with their words', () => {
    for (const name of FACE_NAMES) {
      const r = mount({ name, size: 64 });
      const paths = r.root.findAll((n) => (n.type as unknown) === 'Path');
      expect(paths).toHaveLength(5);
      expect(paths.length).toBeLessThanOrEqual(6);
      const ds = paths.map((p) => p.props.d as string);
      expect(ds).toContain(eyePath(FACES[name].eyes[0], 0));
      expect(ds).toContain(eyePath(FACES[name].eyes[1], 1));
      expect(ds).toContain(mouthPath(FACES[name].mouth));
      const [blush, sweat] = paths;
      expect(blush!.props.opacity).toBe(FACES[name].extras.includes('blush') ? 1 : 0);
      expect(sweat!.props.opacity).toBe(FACES[name].extras.includes('sweat') ? 1 : 0);
      const host = r.root.findAll((n) => n.props.accessibilityRole === 'image')[0]!;
      expect(host.props.accessible).toBe(true);
      expect(host.props.accessibilityLabel).toBe(`Jot, ${FACES[name].label}`);
      unmount();
    }
  });
  it('is 120/64 as wide as it is tall, and a label can be given', () => {
    const r = mount({ size: 32, label: 'Jot is happy for you' });
    const host = r.root.findAll((n) => n.props.accessibilityRole === 'image')[0]!;
    expect(host.props.style).toEqual(expect.arrayContaining([{ width: 60, height: 32 }]));
    expect(host.props.accessibilityLabel).toBe('Jot is happy for you');
  });
  it('a decorative face is hidden from TalkBack, where the words beside it say the same', () => {
    const r = mount({ decorative: true, testID: 'f' });
    expect(r.root.findAll((n) => n.props.accessibilityRole === 'image')).toHaveLength(0);
    const host = r.root.findAll((n) => n.props.testID === 'f' && n.props.importantForAccessibility !== undefined)[0]!;
    expect(host.props).toMatchObject({ accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true });
    expect(host.props.accessibilityLabel).toBeUndefined();
  });
});

describe('morph', () => {
  it('does not morph on mount; a new name morphs on the UI thread in 220 ms, linear time', () => {
    mount();
    expect(sv('t').writes).toEqual([]);
    update({ name: 'laugh' });
    expect(mockUi.calls).toBe(1);
    expect(sv('t').writes).toEqual([0, { anim: 'timing', to: 1, ms: 220 }]);
    expect((sv('to').v as { mouth: number[] }).mouth).toEqual([...FACES.laugh.mouth]);
  });
  it('is a cut under reduced motion: no animation, from and to both the new face', () => {
    mockReduce = true;
    mount();
    update({ name: 'sad' });
    expect(mockUi.calls).toBe(0);
    expect(sv('t').writes).toEqual([1]);
    expect(sv('from').v).toEqual(sv('to').v);
    expect((sv('to').v as { mouth: number[] }).mouth).toEqual([...FACES.sad.mouth]);
  });
  it('is a cut while the page is hidden, and when the `reduce` prop forces it', () => {
    mount({ awake: false });
    update({ name: 'cat', awake: false });
    expect(sv('t').writes).toEqual([1]);
    unmount();
    mount({ reduce: true });
    update({ name: 'cat', reduce: true });
    expect(sv('t').writes).toEqual([1]);
  });
});

describe('blink: one timer per blink, nothing animating in between', () => {
  it('waits on a JS timer, then plays one 140 ms blink on the UI thread, and queues the next', () => {
    mount({ size: 28 }); // Math.random = 0.5 → 3.5 + 1.75 s, single
    expect(sv('blink').writes).toEqual([]);
    expect(jest.getTimerCount()).toBe(1);
    advance(5249);
    expect(sv('blink').writes).toEqual([]);
    advance(1);
    expect(sv('blink').writes).toHaveLength(1);
    const b = sv('blink').writes[0] as { items: Anim[] };
    expect(b.items.map((i) => (i as { to: number }).to)).toEqual([1, 0]);
    expect(msOf(b)).toBe(BLINK.closeMs + BLINK.openMs);
    expect(BLINK.closeMs + BLINK.openMs).toBe(140);
    expect(jest.getTimerCount()).toBe(1); // the next one is queued
    advance(5250);
    expect(sv('blink').writes).toHaveLength(2);
  });
  it('never parks a repeat or a waiting delay on the UI thread (they cost a frame every vsync)', () => {
    mount({ size: 28 });
    advance(60_000);
    expect(sv('blink').writes.length).toBeGreaterThanOrEqual(10);
    for (const w of sv('blink').writes) { expect(has(w, 'repeat')).toBe(false); expect(msOf(w)).toBeLessThanOrEqual(400); }
  });
  it('one time in five it blinks twice, 90 ms apart', () => {
    random.mockReturnValue(0.1); // 3850 ms, double
    mount();
    advance(3850);
    const b = sv('blink').writes[0] as { items: Anim[] };
    expect(b.items).toHaveLength(4);
    expect(msOf(b)).toBe(140 + BLINK.doubleGapMs + 140);
  });
  it('the slow blink waits 6–10 s and takes its time; a content face peeks', () => {
    mount({ name: 'content', slowBlink: true, size: 72 }); // 8 s
    expect(sv('peek').v).toBe(true);
    advance(7999);
    expect(sv('blink').writes).toEqual([]);
    advance(1);
    const b = sv('blink').writes[0];
    expect(msOf(b)).toBe(SLOW_BLINK.inMs + SLOW_BLINK.holdMs + SLOW_BLINK.outMs);
    update({ name: 'content', slowBlink: false, size: 72 });
    expect(sv('peek').v).toBe(false);
  });
  it('a blink on demand plays at once and leaves the schedule alone', () => {
    mount();
    act(() => { handle.current!.blink(); });
    expect(msOf(sv('blink').writes[0])).toBe(140);
    expect(jest.getTimerCount()).toBe(1);
  });
});

describe('breathing', () => {
  it('is 1 → 1.02 → 1 over 4 s, three times, only at ≥ 64 dp', () => {
    mount({ size: 63 });
    expect(sv('breath').writes.some((x) => isAnim(x, 'repeat'))).toBe(false);
    unmount();
    mount({ size: 64 });
    const w = sv('breath').writes.find((x) => isAnim(x, 'repeat')) as { inner: { items: { to: number }[] }; n: number };
    expect(w.n).toBe(BREATHS);
    expect(BREATHS).toBe(3);
    expect(w.inner.items.map((i) => i.to)).toEqual([1.02, 1]);
    expect(msOf(w.inner)).toBe(4000);
    update({ size: 64, breathe: false });
    expect(sv('breath').v).toBe(1);
  });
  it('a new face or a reaction breathes again; nothing else does', () => {
    mount({ size: 96 });
    const repeats = () => sv('breath').writes.filter((x) => isAnim(x, 'repeat')).length;
    expect(repeats()).toBe(1);
    update({ size: 96, look: { x: 1, y: 0 } });
    expect(repeats()).toBe(1);
    update({ size: 96, name: 'happy' });
    expect(repeats()).toBe(2);
    update({ size: 96, name: 'happy', react: { motion: 'bounce', n: 1 } });
    expect(repeats()).toBe(3);
  });
});

describe('quiet when it should be', () => {
  it('no timer and no breath under reduced motion, or while the page is hidden; waking starts them', () => {
    mockReduce = true;
    mount({ size: 160 });
    expect(jest.getTimerCount()).toBe(0);
    expect(sv('breath').writes.some((x) => isAnim(x, 'repeat'))).toBe(false);
    unmount();
    mockReduce = false;
    mount({ size: 160, awake: false });
    expect(jest.getTimerCount()).toBe(0);
    expect(sv('breath').writes.some((x) => isAnim(x, 'repeat'))).toBe(false);
    update({ size: 160, awake: true });
    expect(jest.getTimerCount()).toBe(1);
    expect(sv('breath').writes.some((x) => isAnim(x, 'repeat'))).toBe(true);
    update({ size: 160, awake: false });
    expect(jest.getTimerCount()).toBe(0);
    expect(sv('blink').v).toBe(0); // a blink cut off by hiding the page leaves the eyes open
  });
});

describe('one-shots', () => {
  it('bounce: up 6 units in 100 ms, then the {10, 300} spring home', () => {
    mount();
    act(() => { handle.current!.bounce(); });
    expect(sv('lift').writes).toEqual([{ anim: 'seq', items: [{ anim: 'timing', to: BOUNCE.units, ms: BOUNCE.riseMs }, { anim: 'spring', to: 0, cfg: BOUNCE_SPRING }] }]);
    expect([BOUNCE.units, BOUNCE_SPRING]).toEqual([-6, { damping: 10, stiffness: 300 }]);
  });
  it('droop: 2 units down and back in 400 ms', () => {
    mount();
    act(() => { handle.current!.droop(); });
    const w = sv('lift').writes[0] as { items: { to: number }[] };
    expect(w.items.map((i) => i.to)).toEqual([DROOP.units, 0]);
    expect(DROOP.units).toBe(2);
    expect(msOf(w)).toBe(400);
  });
  it('the `react` prop plays on a new count, never on mount', () => {
    mount({ react: { motion: 'bounce', n: 3 } });
    expect(sv('lift').writes).toEqual([]);
    update({ react: { motion: 'bounce', n: 3 } });
    expect(sv('lift').writes).toEqual([]);
    update({ react: { motion: 'droop', n: 4 } });
    expect(sv('lift').writes).toHaveLength(1);
    expect((sv('lift').writes[0] as { items: { to: number }[] }).items[0]!.to).toBe(DROOP.units);
  });
  it('look: dot eyes spring up to 2.5 units that way, and a timer brings them back 1.2 s later', () => {
    mount();
    update({ look: { x: 1, y: -3 } });
    expect(sv('lx').writes).toEqual([{ anim: 'spring', to: 2.5, cfg: LOOK_SPRING }]);
    expect(sv('ly').writes).toEqual([{ anim: 'spring', to: -2.5, cfg: LOOK_SPRING }]); // clamped
    advance(LOOK_HOLD_MS - 1);
    expect(sv('lx').writes).toHaveLength(1);
    advance(1);
    expect(sv('lx').writes[1]).toEqual({ anim: 'spring', to: 0, cfg: LOOK_SPRING });
    expect(LOOK_HOLD_MS).toBe(1200);
  });
  it('a new look restarts the 1.2 s hold, so eyes reading along a field stay on it while you type', () => {
    mount();
    act(() => { handle.current!.look(-0.4, 0); });
    expect((sv('lx').writes[0] as { to: number }).to).toBeCloseTo(-1, 6);
    advance(1000);
    act(() => { handle.current!.look(0.4, 0); });
    advance(1000);
    expect(sv('lx').writes.map((w) => (w as { to: number }).to)).toEqual([-1, 1]);
    advance(200);
    expect((sv('lx').writes[2] as { to: number }).to).toBe(0);
  });
  it('flipping visibility does not replay the last `look`', () => {
    mount({ look: { x: 1, y: 0 } });
    expect(sv('lx').writes).toHaveLength(1);
    update({ look: { x: 1, y: 0 }, awake: false });
    update({ look: { x: 1, y: 0 }, awake: true });
    expect(sv('lx').writes).toHaveLength(1);
  });
  it('do nothing under reduced motion', () => {
    mockReduce = true;
    mount();
    act(() => { handle.current!.bounce(); handle.current!.droop(); handle.current!.blink(); handle.current!.look(1, 1); });
    update({ look: { x: -1, y: 0 }, react: { motion: 'bounce', n: 9 } });
    for (const k of ['lift', 'lx', 'ly', 'blink'] as const) expect(sv(k).writes.filter((w) => typeof w === 'object')).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('unmount', () => {
  it('cancels every animation the face owns and every timer it set (F13)', () => {
    mount({ size: 96 });
    act(() => { handle.current!.look(1, 0); });
    expect(jest.getTimerCount()).toBe(2); // the next blink, the look coming back
    const owned = animated();
    mockCancelled.length = 0;
    unmount();
    for (const s of owned) expect(mockCancelled).toContain(s);
    expect(jest.getTimerCount()).toBe(0);
  });
});
