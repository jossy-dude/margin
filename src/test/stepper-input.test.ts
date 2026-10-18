/**
 * v0.2 — the number field stops being a "+ a hundred times" torture device.
 *
 * Jossy's report (2026-10-19): "the grade expectation field is + icon and i have to press it
 * hundred times… grade goal or any other number field that is usually above 10 using + icon is a
 * crime… even keyboard is better." The grade goal is a Stepper 0–100; the custom reminder lead is
 * a Stepper 5–10080 (over two thousand taps for one week). One change in `Stepper` fixes every
 * number field at once: the centre value becomes tappable — tap it, a numeric keyboard appears,
 * type 78, submit, done. The −/+ buttons stay for ±1 nudges.
 *
 * Three properties are pinned here, and the third is the one that would silently regress:
 *
 *  1. tapping the value swaps the label for a TextInput (keyboard entry is reachable);
 *  2. submitting or blurring commits a parsed, CLAMPED number through `onChange`;
 *  3. a garbage/empty entry reverts to the previous value — a typo must never brick a field.
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
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const { Stepper } = jest.requireActual<typeof import('../ui/kit')>('../ui/kit') as typeof import('../ui/kit');

let live: TestRenderer.ReactTestRenderer | undefined;
async function mount(node: React.ReactElement) {
  await act(async () => { live?.unmount(); });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(node); });
  live = r;
  return r;
}
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

/** The value display: the Pressable a user taps to type. Found by its accessibility label. */
const valueNode = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel === `Set ${label} by typing`
    && typeof (n.props as { onPress?: unknown }).onPress === 'function')[0] as unknown as { props: { onPress?: () => void } };

/** The live text input (only rendered while editing). Found by its accessibility label. */
const inputNode = (r: TestRenderer.ReactTestRenderer, label: string) =>
  r.root.findAll((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel === `Set ${label} by typing`
    && typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function')[0] as unknown as { props: { onChangeText?: (s: string) => void; onSubmitEditing?: () => void; onEndEditing?: () => void; keyboardType?: string; value?: string } } | undefined;

describe('a stepper\'s value is tappable — tap it and the keyboard takes over', () => {
  it('the value carries a "type it" path, separate from the +/− buttons', async () => {
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: () => {} }));
    const n = valueNode(r, 'goal');
    expect(n).toBeDefined();
    // and it is NOT one of the +/− buttons
    const inc = r.root.findAll((x) => (x.props as { accessibilityLabel?: string }).accessibilityLabel === 'Increase goal')[0];
    expect(n).not.toBe(inc);
  });

  it('tapping the value reveals a numeric text input pre-filled with the current value', async () => {
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: () => {} }));
    expect(inputNode(r, 'goal')).toBeUndefined(); // closed at rest
    await act(async () => { valueNode(r, 'goal').props.onPress?.(); });
    const input = inputNode(r, 'goal');
    expect(input).toBeDefined();
    expect(input?.props.keyboardType).toBe('numeric');
    expect(String(input?.props.value)).toBe('40');
  });

  it('submitting a typed number commits it through onChange, clamped to the range', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: (v: number) => seen.push(v) }));
    // each entry opens, types, commits — the input closes on commit, so it is reopened per value
    const type = async (s: string) => { await act(async () => { valueNode(r, 'goal').props.onPress?.(); }); const i = inputNode(r, 'goal'); await act(async () => { i?.props.onChangeText?.(s); }); await act(async () => { i?.props.onSubmitEditing?.(); }); };
    await type('78');
    expect(seen).toEqual([78]);
    // typed above the ceiling — it clamps, never escapes
    await type('250');
    expect(seen).toEqual([78, 100]);
    // and below the floor
    await type('-5');
    expect(seen).toEqual([78, 100, 0]);
  });

  it('a blur commits too — lifting the finger off the keyboard must not lose the number', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: (v: number) => seen.push(v) }));
    await act(async () => { valueNode(r, 'goal').props.onPress?.(); });
    const input = inputNode(r, 'goal');
    await act(async () => { input?.props.onChangeText?.('62'); });
    await act(async () => { input?.props.onEndEditing?.(); });
    expect(seen).toEqual([62]);
  });

  it('garbage or an empty entry reverts to the previous value — a typo cannot brick the field', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: (v: number) => seen.push(v) }));
    const type = async (s: string) => { await act(async () => { valueNode(r, 'goal').props.onPress?.(); }); const i = inputNode(r, 'goal'); await act(async () => { i?.props.onChangeText?.(s); }); await act(async () => { i?.props.onSubmitEditing?.(); }); };
    await type('abc');
    expect(seen).toHaveLength(0); // nothing committed
    await type('');
    expect(seen).toHaveLength(0); // still nothing
    // and the field still shows the original value, not the garbage
    expect(inputNode(r, 'goal')).toBeUndefined();
  });

  it('committing closes the input — one tap, one typed number, back to the label', async () => {
    const r = await mount(React.createElement(Stepper, { label: 'goal', value: 40, min: 0, max: 100, onChange: () => {} }));
    await act(async () => { valueNode(r, 'goal').props.onPress?.(); });
    expect(inputNode(r, 'goal')).toBeDefined();
    const input = inputNode(r, 'goal');
    await act(async () => { input?.props.onChangeText?.('55'); });
    await act(async () => { input?.props.onSubmitEditing?.(); });
    expect(inputNode(r, 'goal')).toBeUndefined();
  });
});
