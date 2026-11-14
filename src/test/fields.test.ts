/**
 * v0.5 U1 — every number is typed (the Stepper is gone). Renamed from `stepper-input.test.ts`, whose three
 * properties still hold for every field and are pinned again here against the new controls:
 *
 *  1. the keyboard matches the value (number pad for whole numbers);
 *  2. submitting or blurring commits a parsed, CLAMPED value through `onChange`;
 *  3. a garbage entry puts the last good value back — a typo never bricks a field or writes junk.
 *
 * Plus what is new: an empty goal means "none", a duration reads "1h30" and "2d", a time reads "930",
 * and the ruler and the slider answer TalkBack's increment/decrement.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));
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
    interpolate: (_v: number, _i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});


const { NumberField, DurationField, TimeField, Slider } = jest.requireActual<typeof import('../ui/fields')>('../ui/fields') as typeof import('../ui/fields');

let live: TestRenderer.ReactTestRenderer | undefined;
async function mount(node: React.ReactElement) {
  await act(async () => { live?.unmount(); });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(node); });
  live = r;
  return r;
}
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

type Input = { props: { onChangeText: (s: string) => void; onSubmitEditing: () => void; onBlur: () => void; onFocus: () => void; keyboardType?: string; value: string; placeholder?: string } };
const input = (r: TestRenderer.ReactTestRenderer, id: string) => r.root.findAll((n) => n.props?.testID === id && typeof n.props?.onChangeText === 'function')[0] as unknown as Input;
async function type(r: TestRenderer.ReactTestRenderer, id: string, text: string, how: 'submit' | 'blur' = 'submit') {
  await act(async () => { input(r, id).props.onFocus(); });
  await act(async () => { input(r, id).props.onChangeText(text); });
  await act(async () => { if (how === 'submit') input(r, id).props.onSubmitEditing(); else input(r, id).props.onBlur(); });
}

describe('NumberField', () => {
  it('opens the number pad, commits a typed number clamped into range, on submit or on blur', async () => {
    const seen: (number | null)[] = [];
    const r = await mount(React.createElement(NumberField, { label: 'goal', value: 40, min: 0, max: 100, unit: '%', onChange: (v: number | null) => seen.push(v) }));
    expect(input(r, 'num-goal').props.keyboardType).toBe('number-pad');
    expect(input(r, 'num-goal').props.value).toBe('40');
    await type(r, 'num-goal', '78');
    await type(r, 'num-goal', '250');
    await type(r, 'num-goal', '62', 'blur');
    expect(seen).toEqual([78, 100, 62]);
  });
  it('a typo puts the stored value back and writes nothing', async () => {
    const seen: (number | null)[] = [];
    const r = await mount(React.createElement(NumberField, { label: 'goal', value: 40, min: 0, max: 100, onChange: (v: number | null) => seen.push(v) }));
    await type(r, 'num-goal', 'abc');
    expect(seen).toEqual([]);
    expect(input(r, 'num-goal').props.value).toBe('40');
  });
  it('an empty field means "none" only where none is allowed', async () => {
    const seen: (number | null)[] = [];
    const r = await mount(React.createElement(NumberField, { label: 'goal', value: 80, min: 0, max: 100, emptyLabel: 'none', onChange: (v: number | null) => seen.push(v) }));
    await type(r, 'num-goal', '');
    expect(seen).toEqual([null]);
    const r2 = await mount(React.createElement(NumberField, { label: 'weight', value: 10, min: 0, max: 100, onChange: (v: number | null) => seen.push(v) }));
    await type(r2, 'num-weight', '');
    expect(seen).toEqual([null]); // nothing more: an empty weight keeps 10
  });
  /* like the time field (phone test #13): "numbers-and-punctuation" is iOS only, so on Android a decimal or signed
     field opened the text keyboard. `numeric` has the digits, the point and the minus. */
  it('a decimal or signed field opens a number keyboard Android has', async () => {
    const r = await mount(React.createElement(NumberField, { label: 'score', value: 70, min: 0, max: 100, decimals: 1, onChange: () => {} }));
    expect(input(r, 'num-score').props.keyboardType).toBe('numeric');
    const r2 = await mount(React.createElement(NumberField, { label: 'shift', value: 0, min: -10, max: 10, onChange: () => {} }));
    expect(input(r2, 'num-shift').props.keyboardType).toBe('numeric');
  });
  it('keeps the decimals it is asked to, and reads a comma as the decimal mark', async () => {
    const seen: (number | null)[] = [];
    const r = await mount(React.createElement(NumberField, { label: 'score', value: 70, min: 0, max: 100, decimals: 1, onChange: (v: number | null) => seen.push(v) }));
    await type(r, 'num-score', '87,25');
    expect(seen).toEqual([87.3]);
  });
});

describe('DurationField', () => {
  it('reads "1h30" and "2d", clamps, and offers a none chip', async () => {
    const seen: (number | null)[] = [];
    const r = await mount(React.createElement(DurationField, { label: 'effort', value: 30, presets: [15, 30, 60], min: 0, max: 720, noneLabel: 'unknown', onChange: (v: number | null) => seen.push(v) }));
    await type(r, 'dur-effort', '1h30');
    await type(r, 'dur-effort', '2d');
    await type(r, 'dur-effort', 'soon');
    expect(seen).toEqual([90, 720]);
    const none = r.root.findAll((n) => n.props?.accessibilityLabel === 'unknown' && typeof n.props?.onPress === 'function')[0];
    expect(none).toBeDefined();
  });
});

describe('TimeField', () => {
  /* phone test #13: Android has no "numbers-and-punctuation" keyboard (iOS only), so the alarm time opened the full
     text keyboard. `numeric` is digits plus . and -, and `930`, `9.30` and a 12-hour field's half of the day need no more. */
  it('opens a number keyboard that Android has, not the text keyboard', async () => {
    const r = await mount(React.createElement(TimeField, { label: 'start', value: 540, ruler: false, onChange: () => {} }));
    expect(input(r, 'time-start').props.keyboardType).toBe('numeric');
  });
  it('reads 930 as 09:30, keeps a 12-hour field in its half of the day, and refuses junk', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(TimeField, { label: 'start', value: 540, ruler: false, onChange: (v: number) => seen.push(v) }));
    expect(input(r, 'time-start').props.value).toBe('09:00');
    await type(r, 'time-start', '930');
    await type(r, 'time-start', '9:75');
    expect(seen).toEqual([570]);
    const r2 = await mount(React.createElement(TimeField, { label: 'end', value: 13 * 60, hour12: true, ruler: false, onChange: (v: number) => seen.push(v) }));
    await type(r2, 'time-end', '230');
    expect(seen).toEqual([570, 14 * 60 + 30]);
  });
  it('a 12-hour field says AM or PM in full, so the half of the day is never hidden', async () => {
    const r = await mount(React.createElement(TimeField, { label: 'end', value: 13 * 60, hour12: true, ruler: false, onChange: () => {} }));
    expect(input(r, 'time-end').props.value).toMatch(/^1:00\s?PM$/);
  });
  it('the ruler is adjustable for TalkBack, five minutes a step', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(TimeField, { label: 'start', value: 540, onChange: (v: number) => seen.push(v) }));
    const ruler = r.root.findAll((n) => n.props?.testID === 'ruler-start' && typeof n.props?.onAccessibilityAction === 'function')[0]!;
    expect(ruler.props.accessibilityRole).toBe('adjustable');
    await act(async () => { ruler.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
    expect(seen).toEqual([545]);
  });
});

describe('Slider', () => {
  it('steps by its step for TalkBack and never leaves its range', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(Slider, { label: 'Paper volume', value: 100, step: 10, onChange: (v: number) => seen.push(v) }));
    const s = r.root.findAll((n) => n.props?.testID === 'slider-paper-volume' && typeof n.props?.onAccessibilityAction === 'function')[0]!;
    expect(s.props.accessibilityValue).toMatchObject({ min: 0, max: 100, now: 100, text: '100%' });
    await act(async () => { s.props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
    await act(async () => { s.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }); });
    expect(seen).toEqual([90]);
  });
});
