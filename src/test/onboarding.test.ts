/**
 * The tour: the gate it hangs off, the step machine, the cut-out, and the ten steps rendered for real.
 *
 * Rendering is the point of most of this file. The claims worth defending are claims about what a
 * reader or a screen-reader user actually gets — ten steps, each with a heading, a Next button that
 * names its destination, a Skip on every step, a Back that is a *button* rather than only a gesture,
 * and a scrim that is exactly as blocking as it looks. None of those can be checked by reading the
 * source, and a tour's whole job is to be read.
 *
 * What this file does NOT do is check that the tour looks right on a phone: `docs/DEVICE_CHECKLIST.md`
 * W6 holds the things only a device can settle, and they are deliberately left unticked here.
 *
 * `jest.mock` is hoisted above the imports, so each factory re-requires what it needs.
 */
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BackHandler } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { getState, hydrate, set, stopResync, act as storeAct } from '../store/store';
import { DEFAULT_SETTINGS, TOUR_VERSION, toured, withDefaults } from '../domain/defaults';
import { STEPS, TOUR_LEN } from '../ui/onboard/screens';
import { Coach, type OnboardFinish } from '../ui/onboard/Coach';
import { cardTop, cutRects, hasRealRows, holeBox } from '../ui/onboard/coach';
import { ThemeProvider } from '../ui/theme-context';

jest.mock('expo-haptics', () => ({ NotificationFeedbackType: { Success: 'Success' }, Haptics: { notificationAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve() } }), { virtual: true });
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
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
       exactly what a smoke render wants. */
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
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    /* Layout-animation builders are called as `FadeOut.duration(n)` in production. */
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 8).getTime(); // a Monday, so the sample week's first block exists
let live: TestRenderer.ReactTestRenderer | undefined;

/** Android's hardware back, captured from the handler the tour registers. In jest the platform
 *  resolves to iOS, where `BackHandler` is a no-op object — so the spy is what makes the "back walks
 *  the tour" contract testable at all rather than a claim about code nobody ran. */
const backs: ((e: unknown) => boolean | void)[] = [];
beforeAll(() => {
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(((_e: string, h: (e: unknown) => boolean | void) => {
    backs.push(h);
    return { remove: () => { const i = backs.indexOf(h); if (i >= 0) backs.splice(i, 1); } };
  }) as never);
});
afterAll(() => { jest.restoreAllMocks(); });

type Screen = { root: TestRenderer.ReactTestRenderer['root']; done: OnboardFinish[]; text: () => string; labelled: () => string[]; press: (a11y: string) => Promise<void>; unmount: () => Promise<void> };

const mount = async (opts: { from?: number; firstRun?: boolean; seed?: boolean; reduce?: boolean } = {}): Promise<Screen> => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  backs.length = 0;
  const repo = new MemoryRepository(() => NOW);
  if (opts.seed !== false) await repo.seed(seedSnapshot(NOW)); // the sample semester a first launch starts with
  await hydrate(repo);
  set({ route: 'Today', sheet: null, toast: null, settingsPath: [], settings: { ...getState().settings, reduceMotion: opts.reduce ? 'on' : 'off' } });
  const done: OnboardFinish[] = [];
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(React.createElement(ThemeProvider, null,
      React.createElement(Coach, { onFinish: (how: OnboardFinish) => done.push(how), firstRun: opts.firstRun ?? true, from: opts.from ?? 0 })));
  });
  live = r;
  const root = r.root;
  const labelled = () => root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel as string);
  /* Host `Text` nodes, not the composite: in this renderer a composite's `children` is the element it
     rendered, and the strings a reader sees live one layer further in. */
  const text = () => root.findAll((n) => String(n.type) === 'Text').map((n) => String(n.children[0] ?? '')).join(' ');
  return {
    root, done, labelled,
    text,
    press: async (a11y: string) => {
      const n = root.findAll((x) => x.props.accessibilityLabel === a11y)[0];
      if (!n) throw new Error(`no control labelled ${a11y}`);
      /* A real tap: press-in is the frame most of this app's controls act on (`Btn` documents why),
         and release is the frame `danger` acts on and TalkBack uses. Both, in one act. */
      await act(async () => { n.props.onPressIn?.(); n.props.onPress?.(); await new Promise((res) => setTimeout(res, 0)); });
    },
    unmount: async () => { await act(async () => { r.unmount(); }); live = undefined; },
  };
};
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

/* The overlay's own layers, reached through the renderer's nesting: a `<View>` is a composite that
   renders a host, so `children[0]` is the host and *its* children are the elements the JSX passed
   down. Both of the tests below are about what those elements do to a touch, which is the one thing
   about this overlay a reader cannot tell by looking at it. */
const coachOf = (s: Screen) => s.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'coach')[0]!;
const scrimOf = (s: Screen) => coachOf(s).children[0] as TestRenderer.ReactTestInstance;
const cardOf = (s: Screen) => coachOf(s).children[1] as TestRenderer.ReactTestInstance;
const rectsOf = (s: Screen) => (scrimOf(s).children[0] as TestRenderer.ReactTestInstance).children as TestRenderer.ReactTestInstance[];

/* ───── the gate ───── */

describe('the gate: one number, and therefore not two', () => {
  it('toured() is false for undefined, 0 and any earlier build', () => {
    for (const v of [undefined, 0, TOUR_VERSION - 1]) expect(toured(v)).toBe(false);
    for (const v of [TOUR_VERSION, TOUR_VERSION + 1]) expect(toured(v)).toBe(true);
  });

  it('Skip finishes, and a double press still finishes once', async () => {
    const s = await mount();
    expect(s.text()).toContain('Everything lives on this phone.');
    await s.press('Skip the tour');
    await s.press('Skip the tour');
    expect(s.done).toEqual(['skipped']);
  });

  it('App.tsx persists it with the same expression it always has, and covers the app with the tour', () => {
    const app = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('act.setSettings({ onboarded: TOUR_VERSION })');
    expect(app).toContain('toured(onboarded)');
    // The tour is mounted OVER the shell, not instead of it: the control it points at is the real one.
    expect(app).toContain('<Shell />');
    expect(app).toContain('<Coach ');
    expect(app).not.toContain('./screens/Onboarding');
    // and a device that has already taken one is never offered the destructive close again
    expect(app).toContain('hasRealRows()');
    expect(app).toContain('launched.current = true');
  });

  it('DEFAULT_SETTINGS still has no `onboarded` key', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('onboarded');
    expect(withDefaults({}).onboarded).toBeUndefined();
  });

  it('a field that shadows a real key is the kind of miss the tour must not make', () => {
    const types = readFileSync(join(__dirname, '..', 'domain', 'types.ts'), 'utf8');
    const settings = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
    const defaults = readFileSync(join(__dirname, '..', 'domain', 'defaults.ts'), 'utf8');
    expect(types).toMatch(/^\s{2}onboarded\??: number;/m); // optional, so it can be absent at runtime
    expect(settings).toContain('act.setSettings({ onboarded: v })');
    expect(defaults).toContain('(seen ?? 0) >= TOUR_VERSION');
  });
});

/* ───── the step list ───── */

describe('ten steps, seven of them under the user\'s own finger', () => {
  it('is ten — the seven the app can be tapped through, plus the three look steps', () => {
    expect(TOUR_LEN).toBe(10);
    expect(STEPS).toHaveLength(10);
  });

  it('gives every step a unique id and a heading that reads as a sentence', () => {
    const ids = STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of STEPS) {
      expect(s.heading.length).toBeGreaterThan(8);
      expect(s.body.join(' ').length).toBeGreaterThan(40);
    }
  });

  it('points every step at a control the app actually registers, on a page that exists', () => {
    const routes = ['Today', 'Week', 'Tasks', 'Grades', 'Stats', 'Focus'];
    const seen = new Set<string>();
    for (const f of walk('src')) if (f.endsWith('.tsx') || f.endsWith('.ts')) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/useCoachSlot\('([a-z-]+)'[,)]|tour="([a-z-]+)"/g)) seen.add(m[1] ?? m[2]!);
    }
    expect([...seen].sort()).toEqual(['fab', 'focus-dial', 'gear', 'sheet-close', 'tab-grades', 'tab-tasks', 'tab-week', 'task-row', 'week-class']);
    for (const s of STEPS) {
      if (s.route) expect(routes).toContain(s.route);
      if (s.target) expect([...seen]).toContain(s.target);
    }
    // and the ones that wait for something wait for a real event, not a timer
    expect(STEPS.filter((s) => s.await).map((s) => s.id)).toEqual(['add', 'close', 'week', 'todo', 'dial']);
  });

  it('renders every step, in order, with its own heading and progress', async () => {
    for (let i = 0; i < TOUR_LEN; i++) {
      const s = await mount({ from: i });
      expect(s.text()).toContain(STEPS[i]!.heading);
      expect(s.text()).toContain(`${i + 1} / ${TOUR_LEN}`);
      await s.unmount();
    }
  });

  it('teaches, in the app\'s own words, the things the five illustrated screens used to draw', async () => {
    const all: string[] = [];
    for (let i = 0; i < TOUR_LEN; i++) { const s = await mount({ from: i }); all.push(s.text()); await s.unmount(); }
    const seen = all.join('\n');
    expect(seen).toContain('No account, no sign-in, no server'); // screen 1, `local`
    expect(seen).toContain('It is the only way in');             // screen 1, the +
    expect(seen).toContain('Show the tour again');               // screen 1, the gear
    expect(seen).toMatch(/Right finishes\. Left crumples\./);    // screen 2, `undo`
    expect(seen).toMatch(/Tap once, then hold\./);               // screen 3, `attendance`
    expect(seen).toMatch(/Drag the ring/);                       // screen 4, `dial`
    expect(seen).toContain('Today, Week, To-do, Grades, Stats'); // screen 5, `recap`
    expect(seen).toContain('a sample semester');                 // new: the hand-over
  });

  it('the last step offers the sample semester only on a genuine first run', async () => {
    const first = await mount({ from: TOUR_LEN - 1, firstRun: true });
    expect(first.labelled()).toContain('Start empty and remove the sample semester');
    expect(first.text()).toContain('Nothing of yours is in it');
    const replay = await mount({ from: TOUR_LEN - 1, firstRun: false });
    expect(replay.labelled()).not.toContain('Start empty and remove the sample semester');
    expect(replay.text()).toContain('Settings → Show the tour again');
  });
});

/* ───── the step machine ───── */

describe('the tour runs the app, and the app runs the tour', () => {
  it('Next is a button on every step but the last, and it names where it goes', async () => {
    for (let i = 0; i < TOUR_LEN - 1; i++) {
      const s = await mount({ from: i });
      expect(s.labelled()).toContain(`Next: ${STEPS[i + 1]!.heading}`);
      await s.press(`Next: ${STEPS[i + 1]!.heading}`);
      expect(s.text()).toContain(STEPS[i + 1]!.heading);
      await s.unmount();
    }
  });

  it('leaving a sheet step by Next puts the sheet away, so the scrim cannot trap one nobody can close', async () => {
    /* Step 2 opens the ADD sheet so its ✕ can be pointed at. A user who presses Next instead of the ✕
       leaves it open — and the scrim, which is meant to block the *rest* of the app, then blocks that ✕
       too, leaving a sheet on screen that nothing can dismiss. Every later step would inherit it. */
    const s = await mount({ from: 1 });
    expect(getState().sheet).not.toBeNull();
    await s.press(`Next: ${STEPS[2]!.heading}`);
    expect(getState().sheet).toBeNull();
    expect(s.text()).toContain(STEPS[2]!.heading);
    await s.unmount();
  });

  it('the last step finishes once, even under a double press', async () => {
    const s = await mount({ from: TOUR_LEN - 1 });
    await s.press('Keep the sample data and finish the tour');
    await s.press('Keep the sample data and finish the tour');
    expect(s.done).toEqual(['done']);
  });

  it('Back is a button from the second step on, and never on the first', async () => {
    expect((await mount({ from: 0 })).labelled()).not.toContain('Back');
    for (let i = 1; i < TOUR_LEN; i++) {
      const s = await mount({ from: i });
      expect(s.labelled()).toContain('Back');
      await s.press('Back');
      expect(s.text()).toContain(i - 1 >= 0 ? STEPS[i - 1]!.heading : '');
      await s.unmount();
    }
  });

  it('Skip is on every step', async () => {
    for (let i = 0; i < TOUR_LEN; i++) {
      const s = await mount({ from: i });
      expect(s.labelled()).toContain('Skip the tour');
      await s.unmount();
    }
  });

  it('Android back steps the tour back, and off the first step ends it rather than the app', async () => {
    const s = await mount({ from: 3 });
    await act(async () => { backs[backs.length - 1]?.({}); });
    expect(s.done).toEqual([]);
    expect(s.text()).toContain(STEPS[2]!.heading);

    const first = await mount({ from: 0 });
    await act(async () => { backs[backs.length - 1]?.({}); });
    expect(first.done).toEqual(['skipped']);
  });

  it('unmounting is not finishing, and nothing it armed can fire into the app behind it', async () => {
    const s = await mount({ from: TOUR_LEN - 2 });
    await s.unmount();
    expect(s.done).toEqual([]);
  });

  it('the awaited events are the app\'s own writes', async () => {
    const s = await mount({ from: 0 });
    expect(s.text()).toContain('Everything lives on this phone.');
    await act(async () => { storeAct.open({ t: 'add' }); });          // the user taps the real +
    expect(s.text()).toContain('Every sheet closes with the ✕.');
    expect(getState().sheet).not.toBeNull();
    await act(async () => { storeAct.close(); });                     // the user taps the real ✕
    expect(s.text()).toContain('The gear changes anything.');
    await s.press(`Next: ${STEPS[3]!.heading}`);                      // the gear is a look step
    await act(async () => { storeAct.go('Week'); });                  // the user taps Week
    expect(s.text()).toContain('Tap once, then hold.');
    expect(getState().route).toBe('Week');
    await s.press(`Next: ${STEPS[5]!.heading}`);                      // attendance is a look step
    await act(async () => { storeAct.go('Tasks'); });                 // the user taps To-do
    expect(s.text()).toContain('Right finishes. Left crumples.');
  });

  it('the dial step is over when the round has moved from where the tour found it', async () => {
    const s = await mount({ from: 8 });
    expect(s.text()).toContain('The dial is a real dial.');
    expect(getState().route).toBe('Focus');                            // the step opens the page it is about
    await act(async () => { storeAct.timerSetMin(getState().timer.planMin + 10); });
    expect(s.text()).toContain('That’s Margin.');
  });

  it('a step that waits for nothing does not advance on an unrelated write', async () => {
    const s = await mount({ from: 2 });                                // the gear: a look step
    await act(async () => { storeAct.go('Week'); });
    expect(s.text()).toContain('The gear changes anything.');
  });

  it('a step that needs a page puts the app on it itself, so Next is as honest as the tap', async () => {
    await mount({ from: 4 });
    expect(getState().route).toBe('Week');                             // the timetable block lives here
    const s = await mount({ from: 1 });                                // the sheet step, entered with no sheet
    expect(getState().sheet).not.toBeNull();                           // it opens the sheet the + opens
    expect(s.text()).toContain('Every sheet closes with the ✕.');
  });

  it('the callout still reads when its control is not on screen', async () => {
    // Nothing is measured in jest, which is exactly the empty-timetable case: the control this step
    // points at is not on screen, so there is no hole to cut and the scrim stays one unbroken sheet.
    const s = await mount({ from: 4 });
    expect(s.text()).toContain('Tap once, then hold.');
    expect(rectsOf(s)).toHaveLength(1);
  });
});

/* ───── the cut-out ───── */

describe('the scrim is exactly as blocking as it looks', () => {
  const covers = (rects: { x: number; y: number; w: number; h: number }[], px: number, py: number) =>
    rects.filter((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h).length;

  it('covers the window exactly once everywhere except the hole', () => {
    const W = 393, H = 852, pad = 6, box = { x: 300, y: 760, w: 62, h: 62 };
    const rects = cutRects(box, W, H, pad), hole = holeBox(box, pad)!;
    for (let x = 0; x < W; x += 7) for (let y = 0; y < H; y += 7) {
      const inHole = x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.h;
      expect(covers(rects, x, y)).toBe(inHole ? 0 : 1);
    }
  });

  it('with no control to point at, the scrim is one unbroken sheet', () => {
    const rects = cutRects(null, 393, 852, 6);
    expect(rects).toEqual([{ x: 0, y: 0, w: 393, h: 852 }]);
    expect(holeBox(null, 6)).toBeNull();
  });

  it('the callout sits under the hole when there is room and over it when there is not', () => {
    expect(cardTop({ x: 10, y: 100, w: 100, h: 60 }, 852, 214, 12, 12)).toBe(172);   // under
    expect(cardTop({ x: 0, y: 700, w: 393, h: 62 }, 852, 214, 12, 12)).toBe(474);    // over — the FAB case
    expect(cardTop(null, 852, 214, 12, 12)).toBe((852 - 214) / 2);                    // centred
    // and it never overlaps the hole it is talking about
    const hole = holeBox({ x: 0, y: 700, w: 393, h: 62 }, 6)!;
    expect(cardTop(hole, 852, 214, 12, 12) + 214).toBeLessThanOrEqual(hole.y);
  });

  it('when neither side fits, the callout takes the side with more room', () => {
    // a tall control on a short screen: 200 + 100 leaves 328 below and 188 above, so it goes under…
    expect(cardTop({ x: 0, y: 200, w: 393, h: 100 }, 640, 400, 12, 12)).toBe(312);
    // …and the same control further down leaves 128 below and 388 above, so it goes over.
    expect(cardTop({ x: 0, y: 400, w: 393, h: 100 }, 640, 400, 12, 12)).toBe(12);
  });

  it('renders the layers that make the blocking claim true', async () => {
    const s = await mount();
    expect(coachOf(s).children).toHaveLength(2);                                   // the scrim, then the callout
    const scrim = scrimOf(s);
    expect(scrim.props.importantForAccessibility).toBe('no-hide-descendants');     // TalkBack still reaches the app
    expect(scrim.props.pointerEvents).toBe('box-none');                            // …and only through the hole
    expect(cardOf(s).props.pointerEvents).toBe('box-none');                        // only the card takes touches
    // the scrim rectangles are plain Views: no handler, no `pointerEvents`, so each one is a target
    // that swallows the touch rather than passing it to the page behind
    expect(rectsOf(s).length).toBeGreaterThan(0);
    expect(rectsOf(s).every((r) => r.props.onPress === undefined && r.props.pointerEvents === undefined)).toBe(true);
  });
});

/* ───── first run and the hand-over ───── */

describe('the one destructive thing the tour ever offers', () => {
  it('knows a sample semester from a planner somebody has used', async () => {
    const repo = new MemoryRepository(() => NOW);
    await repo.seed(seedSnapshot(NOW));
    await hydrate(repo);
    expect(hasRealRows()).toBe(false);                                   // all of it is `demo: true`
    set({ courses: [...getState().courses, { id: 'c-real', name: 'Mine', room: '', teacher: '', goal: null, sort: 99, demo: false }] });
    expect(hasRealRows()).toBe(true);                                    // an upgrading device is never offered it
    await act(async () => { await storeAct.purgeDemo(); });
    expect(hasRealRows()).toBe(true);                                    // the row the user made survived
  });

  it('Start empty removes the sample semester and leaves a working planner', async () => {
    const s = await mount({ from: TOUR_LEN - 1, firstRun: true });
    expect(getState().courses.length).toBeGreaterThan(0);
    await s.press('Start empty and remove the sample semester');
    expect(getState().courses.filter((c) => c.demo)).toEqual([]);
    expect(getState().tasks.filter((t) => t.demo)).toEqual([]);
    expect(getState().marks.filter((m) => m.demo)).toEqual([]);
    expect(getState().toast?.text).toBe('Sample data removed');
    expect(s.done).toEqual(['done']);
    expect(getState().settings.onboarded).toBeUndefined();               // App.tsx writes it, not the tour
  });

  it('Keep exploring removes nothing', async () => {
    const s = await mount({ from: TOUR_LEN - 1, firstRun: true });
    const before = getState().courses.length;
    await s.press('Keep the sample data and finish the tour');
    expect(getState().courses.length).toBe(before);
    expect(s.done).toEqual(['done']);
  });
});

/* ───── accessibility, and the motion the tour does not have ───── */

describe('every control the tour adds is a button, and every word is announced', () => {
  it('the heading is a header, the progress is announced politely, and both stop at the FS cap', async () => {
    const s = await mount();
    const headers = s.root.findAll((n) => n.props.accessibilityRole === 'header');
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.some((n) => String(n.children[0]) === STEPS[0]!.heading)).toBe(true);
    expect(s.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite').length).toBeGreaterThan(0);
    expect(s.root.findAll((n) => typeof n.props.maxFontSizeMultiplier === 'number').length).toBeGreaterThan(0);
  });

  it('reaches the end under reduce-motion, with no fade anywhere to remove', async () => {
    const s = await mount({ reduce: true });
    for (let i = 0; i < TOUR_LEN - 1; i++) { await s.press(`Next: ${STEPS[i + 1]!.heading}`); expect(s.text()).toContain(STEPS[i + 1]!.heading); }
    expect(s.text()).toContain('That’s Margin.');
    await s.press('Keep the sample data and finish the tour');
    expect(s.done).toEqual(['done']);
  });

  it('arms no tween of its own, so the reduce-motion contract is a fact about the code', () => {
    const coach = readFileSync(join(__dirname, '..', 'ui', 'onboard', 'Coach.tsx'), 'utf8');
    for (const banned of ['useSharedValue', 'useAnimatedStyle', 'withTiming', 'withSequence', 'entering=', 'exiting=']) expect(coach).not.toContain(banned);
  });

  it('no ScrollView in the tour is gated on the motion preference', () => {
    const src = readFileSync(join(__dirname, '..', 'ui', 'onboard', 'Coach.tsx'), 'utf8');
    for (const f of ['ui/kit.tsx', 'ui/Sheet.tsx']) {
      const other = readFileSync(join(__dirname, '..', f), 'utf8');
      const blocks = other.match(/<ScrollView[^>]*>/g) ?? [];
      for (const b of blocks) expect(b).not.toContain('rm ?');
    }
    const scrolls = src.match(/<ScrollView[^>]*>/g) ?? [];
    expect(scrolls.length).toBeGreaterThan(0);
    for (const b of scrolls) expect(b).not.toContain('rm ?');
  });
});

/** Every `.ts`/`.tsx` under a directory, as absolute paths — the same walk `dead-code.test.ts` uses,
 *  so a rule about "the app registers this id" can be checked against the app rather than a list. */
function walk(dir: string): string[] {
  const out: string[] = [], root = resolve(__dirname, '..', '..', dir);
  (function step(d: string): void {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'test') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) step(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  })(root);
  return out;
}
