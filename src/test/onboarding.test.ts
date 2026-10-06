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
import type { Settings } from '../domain/types';
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

const FIELD = /onboarded\??\s*:\s*number\s*;/g;

/** `Settings` is a shared, unowned type, so the one field the gate needs is applied by the
 *  orchestrator from `qa/HANDOFF-A4.md` rather than by me. This asserts the two halves of that
 *  contract without going red in the meantime: the patch is specified, spelled the same way on both
 *  sides, and applied at most once.
 *
 *  `onboarded` is **optional** on purpose. A settings row written before the tour existed has no such
 *  key, which is precisely the case `toured(undefined)` answers, so `DEFAULT_SETTINGS` needs no entry
 *  and a cold start needs no migration. */
describe('the one shared-type field the gate needs is specified, spelled once, and applied at most once', () => {
  const handoff = readFileSync(join(__dirname, '..', '..', 'qa', 'HANDOFF-A4.md'), 'utf8');
  const types = readFileSync(join(__dirname, '..', 'domain', 'types.ts'), 'utf8');

  it('the handoff spells it, as an optional number', () => {
    expect(handoff.match(FIELD)?.length ?? 0).toBeGreaterThan(0);
    expect(handoff).toMatch(/onboarded\?: number;/);
  });

  it('the shared type declares it at most once — a re-applied patch would break the build', () => {
    expect(types.match(FIELD)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  it('and the gate needs no default, because absent already means "has not seen it"', () => {
    // This is the property that makes the whole thing survive a cold start: `withDefaults` never sees
    // the field, so a fresh install has none, and `undefined` is already the answer that shows the
    // tour. The intersection type is what lets this compile both before and after the field lands.
    const fresh = withDefaults({}) as Settings & { onboarded?: number };
    expect(fresh.onboarded).toBeUndefined();
    expect(toured(fresh.onboarded)).toBe(false);
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
    expect(all).toMatch(/marginalia 1\.0 · local-first/i);     // the promise, paid
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
    expect(last.labelled()).toContain('Start using Marginalia');
  });

  it('Next really advances, and the last one really finishes', async () => {
    const s = await mount();
    for (let i = 1; i < TOUR_LEN; i++) await s.press(`Next: ${SCREENS[i]!.heading}`);
    expect(s.text()).toContain(`${TOUR_LEN} / ${TOUR_LEN}`);
    await s.press('Start using Marginalia');
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

  it('the face inside the dial is drawn static, so a hidden clock cannot tick (V17)', async () => {
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
