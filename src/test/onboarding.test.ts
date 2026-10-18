/**
 * The onboarding tour: the gating logic, the wiring contract, and the five screens rendered for real.
 *
 * Rendering is the point of most of this file. The claims worth defending are all claims about what a
 * reader or a screen-reader user actually gets — five screens, each with a heading, a Next button that
 * names its destination, a Skip on every screen, and a Back that is a *button* rather than only a
 * swipe. None of those can be checked by reading the source, and the tour's whole job is to be read.
 *
 * `jest.mock` is hoisted above the imports, so each factory re-requires what it needs.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { hydrate, stopResync } from '../store/store';
import { TOUR_VERSION, toured, withDefaults } from '../domain/defaults';
import { SCREENS, TOUR_LEN } from '../ui/onboard/screens';
import { Onboarding, type OnboardFinish } from '../screens/Onboarding';
import { ThemeProvider } from '../ui/theme-context';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
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
    interpolate: (_v: number, i: number[], o: number[]) => (typeof i[0] === 'number' ? (i[0] >= i[1]! ? o[0]! : o[o.length - 1]!) : o[0] ?? 0),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: {}, FadeOut: {}, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 8).getTime();

/** Every string in the rendered tree, in order — the page as a reader gets it. `toJSON` splits each
 *  interpolated value into its own node, so joining the leaves puts a sentence back together. */
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}

let live: TestRenderer.ReactTestRenderer | undefined;

const mount = async (opts: { reduce?: boolean; from?: number } = {}) => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  await hydrate(new MemoryRepository(() => NOW));
  const done: OnboardFinish[] = [];
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    // `createElement` rather than JSX: `testMatch` is `src/**/*.test.ts`, and babel parses those
    // without the JSX plugin. `settings-render.test.ts` mounts its subject the same way.
    r = TestRenderer.create(React.createElement(ThemeProvider, null,
      React.createElement(Onboarding, { onFinish: (how: OnboardFinish) => done.push(how), reduce: opts.reduce ?? false, from: opts.from ?? 0 })));
  });
  live = r;
  return {
    r, done,
    text: () => leaves(r.toJSON()).join(''),
    json: () => JSON.stringify(r.toJSON()),
    /** Every pressable with a label, which is what a screen reader can reach. */
    labelled: () => r.root.findAll((n) => typeof n.type !== 'string' && typeof (n.props as { accessibilityLabel?: unknown }).accessibilityLabel === 'string')
      .map((n) => (n.props as { accessibilityLabel: string }).accessibilityLabel),
    roles: () => r.root.findAll((n) => typeof n.type !== 'string' && typeof (n.props as { accessibilityRole?: unknown }).accessibilityRole === 'string')
      .map((n) => (n.props as { accessibilityRole: string; accessibilityLabel?: string }).accessibilityRole),
    press: async (label: string) => {
      const n = r.root.findAll((x) => typeof x.type !== 'string' && (x.props as { accessibilityLabel?: string }).accessibilityLabel === label)[0];
      if (!n) throw new Error(`nothing labelled "${label}"`);
      await act(async () => { (n.props as { onPress?: () => void }).onPress?.(); });
    },
  };
};
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

/* ───── the gate ───── */

/** `toured` is the whole gate. The order of these cases matters: a fresh install has no `onboarded`
 *  key at all, which is the first thing that has to be right. */
describe('the tour shows itself on a first launch and stays away afterwards', () => {
  it('a phone that has never seen it is shown the tour', () => {
    expect(toured(undefined)).toBe(false);   // a fresh install, and every row written before the tour existed
    expect(toured(0)).toBe(false);           // "shown again" from Settings
    expect(toured(TOUR_VERSION - 1)).toBe(false);
  });

  it('a phone that finished this build of it is not', () => {
    expect(toured(TOUR_VERSION)).toBe(true);
    expect(toured(TOUR_VERSION + 1)).toBe(true); // a future build's stamp does not re-show an older tour
  });

  it('skipping counts as finishing, because the point is not to show it twice', async () => {
    const s = await mount();
    await s.press('Skip the tour');
    expect(s.done).toEqual(['skipped']);
  });

  it('a double tap on Skip finishes once, not twice', async () => {
    const s = await mount();
    await s.press('Skip the tour');
    await s.press('Skip the tour');
    expect(s.done).toEqual(['skipped']);
  });

  it('replay is a second write of 0, with no extra state anywhere', async () => {
    // There is no `onboardingVisible`, no route and no module flag to reset: the gate reads one number.
    expect(toured(0)).toBe(false);
    const s = await mount({ from: 0 });
    expect(s.text()).toContain('1 / ' + TOUR_LEN);
  });

  it('a tour reopened from Settings starts at the beginning, not where it was left', async () => {
    const a = await mount();
    await a.press('Next: ' + SCREENS[1]!.heading);
    expect(a.text()).toContain('2 / ' + TOUR_LEN);
    await act(async () => { live?.unmount(); });
    const b = await mount({ from: 0 });
    expect(b.text()).toContain('1 / ' + TOUR_LEN);
  });
});

/* ───── the wiring contract with the shared files ───── */

/** `Settings.onboarded` arrived through `qa/HANDOFF-A4.md` as an OPTIONAL field, and optional is the whole
 *  point: a settings row written before the tour existed has no such key, which is precisely the case
 *  `toured(undefined)` answers, so `DEFAULT_SETTINGS` needs no entry and a cold start needs no migration.
 *
 *  This block used to assert two things about the hand-off *document* — that `qa/HANDOFF-A4.md` spelled
 *  `onboarded?: number;`, and that it was spelled there at most once. Both were the same class of test as
 *  `scripts.test.ts`'s `expect(faces).toContain('PLATE_DARK_MATRIX')`: a test that checks a word appears in a
 *  file, passing exactly as long as the word does. One of them had already turned false — the patch landed
 *  and the shared field is on the type — and nothing had noticed, which is the whole argument against them.
 *  What is left asserts the three things that are still true of the shipped code. */
/** `onboarded?: number;` or `onboarded: number;`, with or without the docstring's indentation. */
const FIELD_ONE = /onboarded\??\s*:\s*number\s*;/;
describe('the one shared-type field the gate needs is optional, declared once, and needs no default', () => {
  const types = readFileSync(join(__dirname, '..', 'domain', 'types.ts'), 'utf8');

  it('is declared on Settings exactly once — a re-applied patch would break the build', () => {
    expect(types.match(new RegExp(FIELD_ONE.source, 'g'))?.length ?? 0).toBe(1);
    expect(types).toMatch(FIELD_ONE);
    // optional, not required: that is what makes an old settings row legal without a migration
    expect(types).toMatch(/onboarded\?: number;/);
  });

  it('and it is read off the type, with no cast left behind from the hand-off window', () => {
    const settings = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
    expect(settings).toContain('const onboarded = s.onboarded');
    // the intersection cast is what the hand-off needed while the field was optional-but-undeclared
    expect(settings).not.toContain('Settings & { onboarded?: number }');
  });

  it('and the gate needs no default, because absent already means "has not seen it"', () => {
    // This is the property that makes the whole thing survive a cold start: `withDefaults` never sees the
    // field, so a fresh install has none, and `undefined` is already the answer that shows the tour.
    const fresh = withDefaults({});
    expect(fresh.onboarded).toBeUndefined();
    expect(toured(fresh.onboarded)).toBe(false);
    // and it must stay absent from DEFAULT_SETTINGS, or a settings row written by an older build would
    // gain a field it never had. Asserted over the source, since the object type would allow either.
    expect(readFileSync(join(__dirname, '..', 'domain', 'defaults.ts'), 'utf8')).not.toMatch(/DEFAULT_SETTINGS[^}]*onboarded/s);
  });
});

/* ───── the five screens ───── */

describe('the tour is five screens that each teach one thing', () => {
  it('is five, not a carousel of everything the app does', () => {
    expect(TOUR_LEN).toBe(5);
    expect(SCREENS).toHaveLength(5);
  });

  it('gives every screen a unique id and a heading that reads as a sentence', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCREENS) {
      expect(s.heading.length).toBeGreaterThan(8);
      expect(s.body.join(' ').length).toBeGreaterThan(40);
    }
  });

  it('renders every screen, in order, with its own heading and progress', async () => {
    for (let i = 0; i < TOUR_LEN; i++) {
      const s = await mount({ from: i });
      expect(s.text()).toContain(SCREENS[i]!.heading);
      expect(s.text()).toContain(`${i + 1} / ${TOUR_LEN}`);
    }
  });

  it('teaches the five things a first-time user cannot guess, in the app\'s own words', async () => {
    const seen: string[] = [];
    for (let i = 0; i < TOUR_LEN; i++) seen.push((await mount({ from: i })).text());
    const all = seen.join(' ');
    expect(all).toMatch(/No account, no sign-in, no server/);  // it is local, and that is why it asks
    expect(all).toContain('five tabs along the bottom');        // the map
    expect(all).toMatch(/Right finishes\. Left crumples/);     // the accidental gesture
    expect(all).toMatch(/Task deleted/);                       // …and the safety net
    expect(all).toMatch(/Tap once, then hold/);                 // the precise gesture
    expect(all).toMatch(/one tap marks it Here/i);              // …taught with its actual outcome
    expect(all).toMatch(/Drag the ring/);                       // the hardest, and live
    expect(all).toMatch(/unlocks after 5 min of work/);
    expect(all).toMatch(/margin 1\.0 · local-first/i);         // the promise, paid
  });

  it('uses the app\'s own margin note rather than writing its own', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    expect(s.text()).toContain('focus doesn’t');
    expect(s.text()).toContain('happen by accident');
  });

  it('shows the real nav bar and the real + on the first screen', async () => {
    const s = await mount({ from: 0 });
    for (const l of ['Today', 'Week', 'To-do', 'Grades', 'Stats']) expect(s.text()).toContain(l);
    expect(s.labelled()).toContain('Adds anything');
  });

  it('shows the real Undo toast, not the word "undo"', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'undo') });
    expect(s.text()).toContain('Task deleted');
    expect(s.labelled().some((l) => /Undo/i.test(l))).toBe(true);
  });
});

/* ───── accessibility: the app's own rule is that every gesture has a button path ───── */

describe('every screen is operable without a gesture', () => {
  it('Next is a button on every screen and it names where it goes', async () => {
    for (let i = 0; i < TOUR_LEN - 1; i++) {
      const s = await mount({ from: i });
      expect(s.labelled()).toContain(`Next: ${SCREENS[i + 1]!.heading}`);
    }
    const last = await mount({ from: TOUR_LEN - 1 });
    expect(last.labelled()).toContain('Start using Margin');
  });

  it('Next really advances, and the last one really finishes', async () => {
    const s = await mount();
    for (let i = 1; i < TOUR_LEN; i++) await s.press(`Next: ${SCREENS[i]!.heading}`);
    expect(s.text()).toContain(`${TOUR_LEN} / ${TOUR_LEN}`);
    await s.press('Start using Margin');
    expect(s.done).toEqual(['done']);
  });

  it('Back is a button from the second screen onwards, and never on the first', async () => {
    const first = await mount({ from: 0 });
    expect(first.labelled()).not.toContain('Back');
    const s = await mount({ from: 2 });
    expect(s.labelled()).toContain('Back');
    await s.press('Back');
    expect(s.text()).toContain(`2 / ${TOUR_LEN}`);
  });

  it('Skip is on every screen', async () => {
    for (let i = 0; i < TOUR_LEN; i++) expect((await mount({ from: i })).labelled()).toContain('Skip the tour');
  });

  it('the dial — the one control with no visible ± — carries the app\'s own non-gesture path', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    expect(s.roles()).toContain('adjustable');
    const dial = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'adjustable')[0];
    const acts = ((dial?.props as { accessibilityActions?: { name: string }[] }).accessibilityActions ?? []).map((a) => a.name);
    expect(acts).toEqual(['increment', 'decrement']);
    expect((dial?.props as { accessibilityValue: { text: string } }).accessibilityValue.text).toBe('25 minutes');
  });

  it('increment and decrement move the dial by five minutes, the app\'s own step', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    const dial = () => s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'adjustable')[0]!;
    await act(async () => { (dial().props as { onAccessibilityAction: (e: unknown) => void }).onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }); });
    expect((dial().props as { accessibilityValue: { text: string } }).accessibilityValue.text).toBe('30 minutes');
    await act(async () => { (dial().props as { onAccessibilityAction: (e: unknown) => void }).onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }); });
    expect((dial().props as { accessibilityValue: { text: string } }).accessibilityValue.text).toBe('25 minutes');
  });

  it('the presets are buttons, not part of the drag', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    for (const m of ['25 minutes', '45 minutes', '50 minutes', '90 minutes']) expect(s.labelled()).toContain(m);
    await s.press('90 minutes');
    const dial = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'adjustable')[0];
    expect((dial?.props as { accessibilityValue: { text: string } }).accessibilityValue.text).toBe('90 minutes');
  });

  it('the heading is a header, and the progress is announced politely', async () => {
    const s = await mount({ from: 1 });
    expect(s.roles()).toContain('header');
    const live = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityLiveRegion?: string }).accessibilityLiveRegion === 'polite');
    expect(live.length).toBeGreaterThan(0);
    expect(leaves((live[0]!.props as { children?: unknown }).children).join('')).toContain('2 / 5');
  });

  it('the artwork is hidden from a screen reader, so a screen is read once and not drawn out', async () => {
    const s = await mount({ from: 0 });
    const hidden = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { importantForAccessibility?: string }).importantForAccessibility === 'no-hide-descendants');
    expect(hidden.length).toBeGreaterThan(0);
    // …and the sentence itself is real text, not inside a drawing
    expect(s.text()).toContain('No account, no sign-in, no server.');
  });

  it('fixed-size cells cap their growth, so Android font scale 1.4 cannot burst them', async () => {
    const s = await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    const dial = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'adjustable')[0];
    const capped = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { maxFontSizeMultiplier?: number }).maxFontSizeMultiplier !== undefined);
    expect(capped.length).toBeGreaterThan(0);
    expect((dial?.props as { accessibilityRole: string }).accessibilityRole).toBe('adjustable');
  });
});

/* ───── reduce-motion ───── */

describe('reduce-motion collapses the tour to its end state, not to a fade', () => {
  it('renders every screen with motion off', async () => {
    for (let i = 0; i < TOUR_LEN; i++) {
      const s = await mount({ reduce: true, from: i });
      expect(s.text()).toContain(SCREENS[i]!.heading);
    }
  });

  it('the crumple screen still says the whole sentence: gone, and it comes back', async () => {
    const s = await mount({ reduce: true, from: SCREENS.findIndex((x) => x.id === 'undo') });
    expect(s.text()).toContain('Task deleted');
    expect(s.labelled().some((l) => /Undo/i.test(l))).toBe(true);
    expect(s.text()).toContain('six seconds');
  });

  it('the attendance screen still shows both outcomes', async () => {
    const s = await mount({ reduce: true, from: SCREENS.findIndex((x) => x.id === 'attendance') });
    expect(s.text()).toContain('One tap marks it Here');
    expect(s.text()).toContain('so holding it opens this');
    for (const l of ['Here', 'Late', 'Absent', 'Sick']) expect(s.text()).toContain(l);
  });

  it('the dial is still fully usable, because dragging is input rather than animation', async () => {
    const s = await mount({ reduce: true, from: SCREENS.findIndex((x) => x.id === 'dial') });
    await s.press('50 minutes');
    const dial = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'adjustable')[0];
    expect((dial?.props as { accessibilityValue: { text: string } }).accessibilityValue.text).toBe('50 minutes');
  });

  it('Next and Skip still work with motion off', async () => {
    const s = await mount({ reduce: true });
    await s.press(`Next: ${SCREENS[1]!.heading}`);
    expect(s.text()).toContain(`2 / ${TOUR_LEN}`);
    await s.press('Skip the tour');
    expect(s.done).toEqual(['skipped']);
  });
});

/* ───── no off-screen work ───── */

describe('the tour stops when it is gone', () => {
  it('unmounts cleanly, so nothing it armed can fire into the app behind it', async () => {
    const s = await mount();
    expect(s.text()).toContain(SCREENS[0]!.heading);
    await act(async () => { live?.unmount(); });
    live = undefined;
    expect(s.done).toEqual([]);   // unmounting is not finishing
  });

  it('the face inside the dial is drawn static, so a hidden clock cannot tick', async () => {
    await mount({ from: SCREENS.findIndex((x) => x.id === 'dial') });
    const faces = (globalThis as { __faces?: { live: unknown }[] }).__faces ?? [];
    void faces;
    const src = readFileSync(join(__dirname, '..', 'ui', 'onboard', 'art.tsx'), 'utf8');
    expect(src).toMatch(/<ClockFace[^>]*live=\{false\}/);
    // `live={false}` and no `time` prop is the pair `ClockFace` reads to return its static composite
    // instead of arming a `useFrameCallback`.
    const m = src.match(/<ClockFace[^>]*\/>/);
    expect(m?.[0]).not.toMatch(/time=/);
  });
});

/* ───── reduce-motion is about animation, not about being able to read the page ───── */

/**
 * The bug this file now guards: the tour's `ScrollView` carried `scrollEnabled={!rm}`, so the moment a
 * user turned Android's "Remove animations" on, the tour became a fixed-height page that could not scroll.
 * At the 1.3× font scale the layout must survive, or on a 320 dp screen, or at a 2.0× system
 * font, the body text falls below the fold and there is no way to reach it. `useReduceMotion()` is a
 * contract about *motion*; a locked ScrollView is not motion, it is content loss — and it is invisible in a
 * render at default settings, which is exactly why it survived.
 */
describe('reduce-motion removes movement, never the ability to read', () => {
  it('no ScrollView anywhere in the tour is gated on the motion preference', () => {
    // source-level, because the render mock replaces ScrollView with a plain View and cannot see the prop
    for (const rel of ['screens/Onboarding.tsx', 'ui/onboard/art.tsx', 'ui/kit.tsx', 'ui/Sheet.tsx']) {
      const src = readFileSync(join(__dirname, '..', rel), 'utf8');
      expect({ rel, gate: /scrollEnabled=\{[^}]*\brm\b/.test(src) || /scrollEnabled=\{!/.test(src) }).toEqual({ rel, gate: false });
    }
  });

  it('and nothing in the rendered tree disables scrolling, at either motion setting', async () => {
    for (const reduce of [false, true]) {
      const s = await mount({ reduce });
      const off = s.r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { scrollEnabled?: unknown }).scrollEnabled === false);
      expect({ reduce, disabledScrollers: off.length }).toEqual({ reduce, disabledScrollers: 0 });
    }
  });

  it('every screen still renders its full body under reduce-motion, not just the heading', async () => {
    for (let i = 0; i < TOUR_LEN; i++) {
      const s = await mount({ from: i, reduce: true });
      for (const line of SCREENS[i]!.body) expect(s.text()).toContain(line.slice(0, 40));
    }
  });

  it('and reduce-motion is still honoured: every shared value starts at its end state and arms no tween', () => {
    const screen = readFileSync(join(__dirname, '..', 'screens', 'Onboarding.tsx'), 'utf8');
    const art = readFileSync(join(__dirname, '..', 'ui', 'onboard', 'art.tsx'), 'utf8');
    // `Placed`: starts settled, and the effect only assigns 1 when reduced
    expect(screen).toContain('const k = useSharedValue(reduce ? 1 : 0)');
    expect(screen).toContain('k.set(reduce ? 1 : withTiming(1');
    // the crumple, the tap, the ring and the sheet all collapse to their end state rather than fading
    for (const v of ['p', 'tap', 'ring', 'rise']) expect(art).toMatch(new RegExp(`useSharedValue\\(reduce \\? 1 : 0\\)` + (v === 'p' ? '' : '')));
    expect(art.match(/reduce \? 1 : 0/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(art).toContain('if (reduce) { p.set(1); return; }');
    expect(art).toContain('if (reduce) { tap.set(1); ring.set(1); rise.set(1); return; }');
  });
});

/* ───── the dial's readout hub: the defect two renders found and one assertion could not ───── */

/**
 * `DialArt`'s paper hub had **two** faults stacked, and the second was hiding the first.
 *
 *  1. The path is `handPath(104, 104, …)`, which by `ui/hand.ts`'s contract walks a box from `(0,0)`. The
 *     `Svg` around it declared `viewBox="-54 -54 108 108"` — a frame centred on the dial. So the hub occupied
 *     0…104 inside a frame showing −54…54: **only its top-left quadrant was on screen**, the ink arc appeared
 *     up and to the left of the centre, and the `25` sat on the bare guilloché, illegible. `Focus.tsx:154` gets
 *     this right (`viewBox="-2 -2 CAP_BOX CAP_BOX"` over a 0-based path) and this file did not copy it.
 *  2. Fixing the viewBox alone made it *worse*: the hub was a **104-unit disc**, and `Focus.tsx`'s own comment
 *     records that a disc was thrown out precisely because "a disc has to be as wide as the numeral and as tall
 *     again … and hid the entire centre of the selected clock face — which is where the guilloché and the two
 *     rosette lattices live, and the thing the dial is there to show."
 *
 * The tour had copied a geometry that had already been rejected, then buried it under fault 1.
 * `/tmp/render/a8/DIALBUG.png` shows all three states side by side at 411 px.
 *
 * **This is what a test cannot do.** Every number involved was plausible, `handPath` returned a valid non-empty
 * path, and a render was the only thing that showed a paper capsule in the wrong place. So the assertions below
 * pin the *arithmetic* — path extent against viewBox — which is what was actually wrong, and the visual
 * judgement is recorded in the render.
 */
describe('the dial readout sits on a capsule that is actually on screen', () => {
  const art = () => readFileSync(join(__dirname, '..', 'ui', 'onboard', 'art.tsx'), 'utf8');

  it('uses the capsule Focus.tsx uses, not a disc — 108x44 claims 22 units of radius, 104x104 claims 52', () => {
    const s = art();
    expect(s).toContain('const CAP_W = 108, CAP_H = 44, CAP_R = CAP_H / 2');
    expect(s).toMatch(/handPath\(CAP_W, CAP_H, HUB_R, 7717, 1\.6\)/);
    // and the container is centred on the dial using the CAPSULE's half-extent
    expect(s).toContain('left: DC * k - (CAP_W / 2) * k, top: DC * k - (CAP_H / 2) * k, width: CAP_W * k, height: CAP_H * k');
  });

  it('the hub path lies inside its own viewBox — the defect the render found', () => {
    // comments are stripped: the note recording the old value quotes it verbatim
    const code = art().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // `handPath` fills 0..CAP_W by 0..CAP_H, so the frame must start at (or below) 0 and reach at least CAP_W.
    // the Svg is the one whose width is derived from the capsule, not from DIAL
    const m = /width=\{\(CAP_W \+ 4\) \* k\}[^>]*viewBox="(-?\d+) (-?\d+) (\d+) (\d+)"/.exec(code);
    expect(m).not.toBeNull();
    const box = m!.slice(1).map(Number);
    const CAP_W = 108, CAP_H = 44;
    // the frame must reach CAP_W across and CAP_H down, and start at 0 or below to admit the path
    expect({ x: box[0], w: box[2], reachesCapW: box[0]! <= 0 && box[0]! + box[2]! >= CAP_W }).toEqual({ x: -2, w: 112, reachesCapW: true });
    expect({ y: box[1], h: box[3], reachesCapH: box[1]! <= 0 && box[1]! + box[3]! >= CAP_H }).toEqual({ y: -2, h: 112, reachesCapH: true });
  });

  it('and the readout is centred in the same capsule, so the paper is behind the number', () => {
    const s = art();
    expect(s).toContain("<Txt f=\"type\" s={27 * k} style={{ letterSpacing: -0.8 }}");
    // the Svg is inset by the same 2 dp shadow bleed Focus uses, so the outline is not clipped
    expect(s).toContain('left: -2 * k, top: -2 * k');
    expect(s).toContain('transform={`translate(${2.6} ${3})`}');
  });

  it('no Svg in the tour declares a viewBox its own path cannot reach', () => {
    // `DialArt`'s other three are `0 0 DIAL DIAL` over 0-based paths (bed, knurl, pointer), which is correct;
    // this is the general statement, so a future centred frame cannot slip back in.
    const s = art().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const frames = [...s.matchAll(/viewBox=[{"`]([^"`]+)["`}]/g)].map((m) => m[1]!);
    for (const f of frames) {
      const n = f.trim().split(/\s+/).map(Number);
      // a negative origin is only legal for a path that is itself centred on the origin, and `handPath` never is:
      // the only frame with one is the 2 dp shadow bleed that `Focus.tsx` also uses
      if ((n[0] ?? 0) < 0 || (n[1] ?? 0) < 0) expect(f).toMatch(/^-2 -2 /);
    }
  });
});
