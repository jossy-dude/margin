/**
 * A button answers on the finger-DOWN frame.
 *
 * `navigation/Book.tsx`'s tab bar already did this and documented why; the rest of the kit never got
 * the same treatment, so every `Btn`, `Chip`, `Toggle`, `StepBtn` and the FAB fired their ACTION in
 * `onPress` — which React Native dispatches on RELEASE. That puts the user's own hold time, typically
 * 60–150 ms, in front of every single action in the app, and it is what "after I press a button"
 * actually was.
 *
 * This file drives a real render (react-test-renderer, same harness as `animation.test.ts`) because
 * the property is behavioural, not structural: it fires the press sequence the way React Native's
 * `Pressability` does and counts what the handler saw.
 *
 * Three things are pinned here, and the third is the one that would otherwise be a silent regression:
 *
 *  1. the action runs on press-IN, before the release;
 *  2. a `danger` button does NOT — a slide-off must never delete;
 *  3. a press-in-only button is INVISIBLE to TalkBack. Android's accessibility activation arrives as
 *     a non-pointer click and `Pressability.onClick` routes it straight to `onPress`, never running
 *     the responder sequence (`node_modules/react-native/Libraries/Pressability/Pressability.js`,
 *     the `onClick` handler). So `onPress` cannot simply be deleted — it stays as the accessibility
 *     path, and a guard keeps one tap firing exactly once on either path.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

const { Btn } = jest.requireActual<typeof import('../ui/kit')>('../ui/kit') as typeof import('../ui/kit');

/** The `Pressable` element a control rendered. `findAll` walks composites too, so filtering on a
 *  handler prop is what picks the one the user actually touches. */
interface ControlNode { props: { onPress?: () => void; onPressIn?: () => void; onPressOut?: () => void; disabled?: boolean } }
const control = (r: TestRenderer.ReactTestRenderer): ControlNode =>
  r.root.findAll((n) => typeof (n.props as { onPressIn?: unknown }).onPressIn === 'function')[0] as unknown as ControlNode;

let live: TestRenderer.ReactTestRenderer | undefined;
async function mount(node: React.ReactElement) {
  await act(async () => { live?.unmount(); });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(node); });
  live = r;
  return r;
}
/** A real tap, in the order React Native's `Pressability` fires it: grant, then release. */
async function tap(n: ControlNode) {
  await act(async () => { n.props.onPressIn?.(); n.props.onPressOut?.(); n.props.onPress?.(); });
}
/** TalkBack's activate: a non-pointer click that goes straight to `onPress`, with no press-in. */
async function a11yActivate(n: ControlNode) {
  await act(async () => { n.props.onPress?.(); });
}
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; });

/** `.test.ts` files are not compiled with the JSX plugin (see `testMatch` in package.json), so every
 *  element here is built the way the rest of the suite builds them: `React.createElement`. */
const mkBtn = (props: { label: string; kind?: 'primary' | 'ink' | 'ghost' | 'danger'; disabled?: boolean; onPress: () => void }) =>
  React.createElement(Btn, props as unknown as React.ComponentProps<typeof Btn>);

describe('a button acts on the finger-down frame, not on the lift', () => {
  it('a real tap runs the action once, and press-in is where it starts', async () => {
    const fired: number[] = [];
    const r = await mount(mkBtn({ label: 'Save', onPress: () => fired.push(fired.length) }));
    const n = control(r);
    expect(n.props.onPressIn).toBeDefined();
    // press-in ALONE must already have acted — that is the whole point: the release is not in the way
    await act(async () => { n.props.onPressIn?.(); });
    expect(fired).toHaveLength(1);
    // and the release must not run it a second time
    await act(async () => { n.props.onPressOut?.(); n.props.onPress?.(); });
    expect(fired).toHaveLength(1);
  });

  it('but a danger button waits for the lift, so a slide-off cannot delete', async () => {
    const fired: number[] = [];
    const r = await mount(mkBtn({ label: 'Delete', kind: 'danger', onPress: () => fired.push(fired.length) }));
    const n = control(r);
    await act(async () => { n.props.onPressIn?.(); });
    expect(fired).toHaveLength(0); // finger is still down — nothing has been destroyed
    await act(async () => { n.props.onPressOut?.(); n.props.onPress?.(); });
    expect(fired).toHaveLength(1);
  });

  it('a disabled button does not act on the press-in path', async () => {
    // Only press-in is asserted here. The release/click path is guarded by React Native itself —
    // `Pressability` short-circuits a disabled config before it ever reaches `onPress` — so calling
    // that handler directly in a test would be testing the harness, not the component. What the
    // component owns is that `down` refuses to act while disabled.
    const fired: number[] = [];
    const r = await mount(mkBtn({ label: 'Save', disabled: true, onPress: () => fired.push(fired.length) }));
    await act(async () => { control(r).props.onPressIn?.(); });
    expect(fired).toHaveLength(0);
  });

  it('the accessibility path still works, and still fires exactly once', async () => {
    // The regression this guards: moving the action to press-in and deleting `onPress` would leave
    // TalkBack activating a button that does nothing. `Pressability.onClick` is the only route a
    // non-pointer click has, and it dispatches `onPress` alone.
    const fired: number[] = [];
    const r = await mount(mkBtn({ label: 'Save', onPress: () => fired.push(fired.length) }));
    await a11yActivate(control(r));
    expect(fired).toHaveLength(1);
  });

  it('the guard cannot get stuck: every tap in a run fires exactly once', async () => {
    // The failure mode this whole design invites is a flag that is set and never cleared, after which
    // every subsequent button in the app is dead. Ten real taps must produce ten actions.
    const fired: number[] = [];
    const r = await mount(mkBtn({ label: 'Save', onPress: () => fired.push(fired.length) }));
    const n = control(r);
    for (let i = 0; i < 10; i++) await tap(n);
    expect(fired).toHaveLength(10);
    // and the accessibility path is still live after all of them
    await a11yActivate(n);
    expect(fired).toHaveLength(11);
  });
});

/* ═══════════════════════════════════════════════ the rest of the kit ════ */

const { Chip, Toggle, Stepper } = jest.requireActual<typeof import('../ui/kit')>('../ui/kit') as typeof import('../ui/kit');

/** The control with this accessibility label. Filtering on the label rather than on a handler prop is
 *  what stops a stepper's two buttons from collapsing onto each other. */
const byLabel = (r: TestRenderer.ReactTestRenderer, label: string): ControlNode =>
  r.root.findAll((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel === label
    && typeof (n.props as { onPressIn?: unknown }).onPressIn === 'function')[0] as unknown as ControlNode;

describe('every other control in the kit answers on the down frame too', () => {
  it('a chip selects on press-in, and the release does not select again', async () => {
    const fired: number[] = [];
    const r = await mount(React.createElement(Chip, { label: 'Algebra', onPress: () => fired.push(fired.length) }));
    const n = byLabel(r, 'Algebra');
    await act(async () => { n.props.onPressIn?.(); });
    expect(fired).toHaveLength(1);
    await act(async () => { n.props.onPressOut?.(); n.props.onPress?.(); });
    expect(fired).toHaveLength(1);
  });

  it('a switch flips on press-in, and the release does not flip it back', async () => {
    const seen: boolean[] = [];
    const r = await mount(React.createElement(Toggle, { label: 'Sound', value: false, onChange: (v: boolean) => seen.push(v) }));
    const n = byLabel(r, 'Sound');
    await act(async () => { n.props.onPressIn?.(); });
    expect(seen).toEqual([true]);
    await act(async () => { n.props.onPressOut?.(); n.props.onPress?.(); });
    expect(seen).toEqual([true]); // exactly one flip per press — a toggle that double-fires is a lie
  });

  it('a stepper steps on press-in and still keeps its long-press repeat', async () => {
    const seen: number[] = [];
    const r = await mount(React.createElement(Stepper, { label: 'Estimate', value: 30, min: 0, max: 120, step: 5, onChange: (v: number) => seen.push(v) }));
    const n = byLabel(r, 'Increase Estimate');
    await act(async () => { n.props.onPressIn?.(); });
    expect(seen).toEqual([35]); // the first step is on the down frame
    await act(async () => { n.props.onPressOut?.(); n.props.onPress?.(); });
    expect(seen).toEqual([35]);
    // and the repeat path is still there for a hold
    const long = r.root.findAll((x) => typeof (x.props as { onLongPress?: unknown }).onLongPress === 'function')[0] as unknown as ControlNode;
    expect(long).toBeDefined();
  });

  it('their accessibility path still works, on all three', async () => {
    for (const node of [
      React.createElement(Chip, { key: 'c', label: 'Algebra', onPress: () => {} }),
      React.createElement(Toggle, { key: 't', label: 'Sound', value: false, onChange: () => {} }),
      React.createElement(Stepper, { key: 's', label: 'Estimate', value: 30, min: 0, max: 120, onChange: () => {} }),
    ]) {
      const r = await mount(node);
      const target = node.type === Chip ? 'Algebra' : node.type === Toggle ? 'Sound' : 'Increase Estimate';
      const n = byLabel(r, target);
      expect(typeof n.props.onPress).toBe('function'); // never deleted: it is TalkBack's only route
    }
  });
});

describe('the + button opens the sheet on the down frame', () => {
  it('and keeps onPress as the accessibility route', () => {
    // `Fab` is module-local to Overlay.tsx, so this is a shape assertion rather than a render.
    const overlay = readFileSync(join(__dirname, '../ui', 'Overlay.tsx'), 'utf8');
    const fab = overlay.slice(overlay.indexOf('function Fab('), overlay.indexOf('function Fab(') + 900);
    expect(fab).toContain('usePressIn(onPress)');
    expect(fab).toContain('onPress={actLift}'); // the accessibility path is not deleted
    expect(fab).toContain('actIn();');          // and the action is dispatched from press-in
    expect(fab).not.toMatch(/onPressIn=\{\(\) => s\.set/);
  });
});
