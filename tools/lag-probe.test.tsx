/**
 * Lag probe (diagnosis only — no production code touched).
 *
 * Answers three questions the web measurement could not, by rendering the REAL app tree
 * (Book navigator + all six screens + Overlay + the Settings sheet) under react-test-renderer
 * and counting WHICH components re-run their render function for each of the owner's three
 * complaints:
 *
 *   E0  how many react-native-svg native views (RNSVG*) exist per screen / per clock face
 *   E1  what re-renders on a tab tap        (act.go + navigation.navigate, one handler)
 *   E2  what re-renders on act.setSettings({clock}) — the clock-face SELECT
 *   E3  what re-renders on each 1 s timer tick, focus page visible AND hidden
 *
 * Run:  npx jest --testMatch "<rootDir>/tools/lag-probe.test.tsx" --verbose
 * (package.json's testMatch only matches src, so `npm run check` never sees this file.)
 */
import React, { Profiler } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { NavigationContainer } from '@react-navigation/native';
import { MemoryRepository } from '../src/data/memory';
import { seedSnapshot } from '../src/data/seed';
import { hydrate, set, stopResync, act as storeAct, getState, subscribe as storeSub } from '../src/store/store';
import { ThemeProvider } from '../src/ui/theme-context';
import { createBookNavigator } from '../src/navigation/Book';
import { TodayScreen } from '../src/screens/Today';
import { WeekScreen } from '../src/screens/Week';
import { TasksScreen } from '../src/screens/Tasks';
import { GradesScreen } from '../src/screens/Grades';
import { StatsScreen } from '../src/screens/Stats';
import { FocusScreen } from '../src/screens/Focus';
import { Overlay } from '../src/ui/Overlay';

/* ── counters ─────────────────────────────────────────────────────────────
   Kept on globalThis because jest.mock factories are hoisted above the module
   body and cannot close over local bindings. */
/* eslint-disable @typescript-eslint/no-explicit-any */
const C = (): Record<string, { n: number; ms: number }> =>
  ((globalThis as any).__lag ??= {});
const timed = <T,>(k: string, f: () => T): T => {
  const e = (C()[k] ??= { n: 0, ms: 0 });
  const t0 = performance.now();
  try {
    e.n += 1;
    return f();
  } finally {
    e.ms += performance.now() - t0;
  }
};
const snap = () => {
  const out: Record<string, { n: number; ms: number }> = {};
  for (const [k, v] of Object.entries(C())) if (v.n) out[k] = { ...v };
  return out;
};
const reset = () => { (globalThis as any).__lag = {}; (globalThis as any).__prof = []; };
/** React Profiler: real render-phase duration of each commit for the WHOLE tree, so the
 *  gap between "counted component renders" and "wall time of act()" is visible. */
type Commit = { id: string; ms: number };
const profLog = (label: string) => {
  const cs = ((globalThis as any).__prof ?? []) as Commit[];
  const total = cs.reduce((a, c) => a + c.ms, 0);
  console.log(`${label} → profiler: ${cs.length} commit(s), render total ${total.toFixed(1)}ms` +
    (cs.length > 1 ? `  [${cs.map((c) => `${c.id}:${c.ms.toFixed(1)}`).join(' ')}]` : ''));
};
const show = (label: string, s: Record<string, { n: number; ms: number }>) => {
  const parts = Object.entries(s).map(([k, v]) => `${k}×${v.n}(${v.ms.toFixed(1)}ms)`);
  console.log(`${label}: ${parts.length ? parts.join('  ') : '(nothing re-rendered)'}`);
  profLog(label);
};

/* jest.mock factories may only reference mock-prefixed names; a function
   declaration is hoisted, so it is initialised before the imports below run.

   Two wrapper shapes, because a wrapper that renders `orig` as a CHILD element
   misses the renders that matter: a store or context update re-renders the
   consumer FIBER directly and its parent wrapper never runs.

   · plain component  → the wrapper CALLS orig in its own body, so orig's hooks
     attach to the wrapper's fiber and every render of the component counts.
   · React.memo export → the wrapper is memoised with the same props and renders
     orig as an element; it bails under exactly the conditions orig would, so the
     bump counts "would orig have rendered?" without destroying the memo. */
function mockWrap(path: string, names: string[]) {
  const actual = jest.requireActual<any>(path);
  const R = jest.requireActual<typeof import('react')>('react');
  const out = { __esModule: true, ...actual };
  for (const name of names) {
    const orig = actual[name];
    if (!orig) continue;
    if (typeof orig === 'function') {
      // Screens also get a Profiler boundary: the counted body runs in the wrapper's fiber (above),
      // the Profiler captures the reconcile of the whole subtree it returns (below).
      const sub = ['TodayScreen', 'WeekScreen', 'TasksScreen', 'GradesScreen', 'StatsScreen', 'FocusScreen', 'SettingsSheet'].includes(name);
      const W = (props: object) => {
        const el = timed(name, () => orig(props));
        return sub ? R.createElement(Profiler, { id: name, onRender: (_i: string, _p: string, ms: number) => (((globalThis as any).__prof ??= []).push({ id: name, ms })) }, el) : el;
      };
      W.displayName = name;
      out[name] = W;
    } else {
      const inner = (props: object) => {
        timed(name, () => R.createElement(orig, props));
        return R.createElement(orig, props);
      };
      const W = R.memo(inner);
      (W as { displayName?: string }).displayName = name;
      out[name] = W;
    }
  }
  return out;
}

jest.mock('../src/screens/Today', () => mockWrap('../src/screens/Today', ['TodayScreen', 'ActiveCard']));
jest.mock('../src/screens/Week', () => mockWrap('../src/screens/Week', ['WeekScreen']));
jest.mock('../src/screens/Tasks', () => mockWrap('../src/screens/Tasks', ['TasksScreen']));
jest.mock('../src/screens/Grades', () => mockWrap('../src/screens/Grades', ['GradesScreen']));
jest.mock('../src/screens/Stats', () => mockWrap('../src/screens/Stats', ['StatsScreen']));
jest.mock('../src/screens/Focus', () => mockWrap('../src/screens/Focus', ['FocusScreen']));
jest.mock('../src/sheets/Settings', () => mockWrap('../src/sheets/Settings', ['SettingsSheet']));
jest.mock('../src/ui/RunningTimer', () => mockWrap('../src/ui/RunningTimer', ['RunningTimer']));
jest.mock('../src/ui/DayBar', () => mockWrap('../src/ui/DayBar', ['DayBar']));
jest.mock('../src/ui/clock/ClockFace', () => mockWrap('../src/ui/clock/ClockFace', ['ClockFace', 'FaceThumb']));
jest.mock('../src/ui/kit', () => mockWrap('../src/ui/kit', ['Txt', 'HandBox', 'Icon', 'Btn', 'Chip', 'Page', 'Section', 'Toggle']));
jest.mock('../src/screens/common', () => mockWrap('../src/screens/common', ['AttCell', 'TaskCard', 'Page', 'Section', 'Empty']));
jest.mock('../src/ui/charts', () => mockWrap('../src/ui/charts', ['Heatmap', 'HBars', 'Hist24', 'Line2', 'Ring']));
jest.mock('react-native-svg', () => {
  const actual = jest.requireActual<any>('react-native-svg');
  const R = jest.requireActual<typeof import('react')>('react');
  const W = (props: object) => timed('SvgXml', () => actual.SvgXml(props));
  (W as { displayName?: string }).displayName = 'SvgXml';
  return { __esModule: true, ...actual, SvgXml: W }; // __esModule is non-enumerable: a bare spread breaks default imports
});

/* ── the same native stubs src/test/settings-render.test.ts uses ─────── */
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }),
  setAudioModeAsync: async () => {},
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: async () => {},
  deactivateKeepAwake: async () => {},
}));
jest.mock('../src/services/fx', () => ({
  configureFx: () => {},
  fx: new Proxy({}, { get: () => () => {} }),
}));
jest.mock('../src/services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {},
  cancelFocusEnd: async () => {},
  scheduleFocusEnd: async () => {},
  sendTest: async () => true,
  sendActionTest: async () => true,
  TEST_ACTION_ID: 'action-test',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {},
  onReceived: () => {},
}));
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) =>
    R.createElement(R.Fragment, null, children as React.ReactNode);
  Provider.displayName = 'SafeAreaProvider';
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: Provider,
  };
});
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => {
    const Cmp = (p: object) => R.createElement(RNView, p);
    Cmp.displayName = 'AnimatedProxy';
    return Cmp;
  };
  const api = {
    __esModule: true,
    View: mk(), Text: mk(), ScrollView: mk(), Image: mk(),
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (v: number) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => fn(),
    useAnimatedReaction: () => {},
    useAnimatedScrollHandler: () => () => {},
    useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }),
    useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: false, useWeb: false }),
    setGestureState: () => {},
    isSharedValue: () => false,
    makeShareable: (v: unknown) => v,
    startMapper: () => {},
    stopMapper: () => {},
    makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: (f: unknown) => f, cubic: (f: unknown) => f, bezier: () => (f: unknown) => f },
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: () => '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {},
    runOnJS: (f: unknown) => f,
    runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0,
    withSpring: (to: number) => to,
    withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) },
    FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});
jest.mock('react-native-gesture-handler', () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  const GestureDetector = ({ children }: { children?: unknown }) => children as React.ReactNode;
  const Gesture = new Proxy({}, { get: () => () => chain });
  return { __esModule: true, Gesture, GestureDetector, default: { Gesture, GestureDetector } };
});
jest.mock('expo-file-system', () => {
  const state = { reads: 0, exists: true, entries: [] as string[] };
  class File {
    get exists() { return state.exists; }
    create() { state.exists = true; }
    delete() { state.exists = false; }
    write(text: string, opts?: { append?: boolean }) {
      state.exists = true;
      if (opts?.append) state.entries.push(...text.split('\n').filter(Boolean));
      else state.entries = text.split('\n').filter(Boolean);
    }
    textSync() { state.reads += 1; return state.entries.join('\n') + (state.entries.length ? '\n' : ''); }
  }
  return { File, Paths: { document: 'doc' } };
});
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

/* ── the tree ─────────────────────────────────────────────────────────── */
const Book = createBookNavigator();
let r: TestRenderer.ReactTestRenderer;
let nav: any;
const NOW = new Date(2026, 9, 5, 8).getTime();

/** Advance fake time in `step` slices, ONE act per slice: several timer fires inside a single
 *  act() get batched into one render pass, which would undercount per-tick re-renders. */
const tick = async (ms: number, step = 1000, per?: (slice: number) => void) => {
  let done = 0, i = 0;
  while (done < ms) {
    const d = Math.min(step, ms - done);
    await act(async () => { jest.advanceTimersByTime(d); await Promise.resolve(); });
    done += d; i += 1; per?.(i);
  }
};

beforeAll(async () => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  const repo = new MemoryRepository(() => NOW);
  await repo.seed(seedSnapshot());
  await act(async () => { await hydrate(repo); });
  set({ settingsPath: [], sheet: null, toast: null });
  // log WHICH top-level state slice changes on every broadcast (background writes during ticks)
  {
    let prev: Record<string, unknown> = { ...getState() } as Record<string, unknown>;
    storeSub(() => {
      const now = getState() as unknown as Record<string, unknown>;
      const changed = Object.keys(now).filter((k) => now[k] !== prev[k]);
      if (changed.length) console.log(`  [store write] ${changed.join(',')}`);
      prev = now;
    });
  }
  await act(async () => {
    r = TestRenderer.create(
      <ThemeProvider>
        <Profiler id="app" onRender={(id, _ph, ms) => (((globalThis as any).__prof ??= []).push({ id, ms }))}>
        <NavigationContainer>
          <Book.Navigator initialRouteName="Today" screenOptions={{}}>
            <Book.Screen name="Today" component={TodayScreen} />
            <Book.Screen name="Week" component={WeekScreen} />
            <Book.Screen name="Tasks" component={TasksScreen} />
            <Book.Screen name="Grades" component={GradesScreen} />
            <Book.Screen name="Stats" component={StatsScreen} />
            <Book.Screen name="Focus" component={FocusScreen} />
          </Book.Navigator>
        </NavigationContainer>
        <Overlay />
        </Profiler>
      </ThemeProvider>,
    );
  });
  const anyScreen = r.root.findAll(
    (n) => typeof n.type !== 'string' && 'navigation' in ((n.props ?? {}) as object),
  )[0];
  nav = anyScreen?.props.navigation;
  if (!nav) throw new Error('could not capture a navigation handle from a screen');
  reset();
});

afterAll(async () => {
  await act(async () => { r.unmount(); });
  stopResync();
  jest.useRealTimers();
});

/** Native SVG views inside one composite instance (react-native-svg = one native view per shape). */
const svgCount = (base: TestRenderer.ReactTestInstance) => {
  const byType: Record<string, number> = {};
  for (const n of base.findAll((x) => typeof x.type === 'string')) {
    const t = n.type as string;
    if (/svg|RNSVG/i.test(t)) byType[t] = (byType[t] ?? 0) + 1;
  }
  return byType;
};
const sumSvg = (d: Record<string, number>) => Object.values(d).reduce((a, b) => a + b, 0);
const instOf = (name: string) =>
  r.root.findAll((n) => {
    if (typeof n.type === 'string') return false;
    const t = n.type as { displayName?: string; name?: string };
    return t.displayName === name || t.name === name;
  });

describe('E0 — native SVG view inventory', () => {
  it('counts react-native-svg host views per screen and per clock face', async () => {
    const rows: string[] = [];
    for (const name of ['TodayScreen', 'WeekScreen', 'TasksScreen', 'GradesScreen', 'StatsScreen', 'FocusScreen']) {
      const inst = instOf(name);
      const all: Record<string, number> = {};
      for (const i of inst) for (const [k, v] of Object.entries(svgCount(i))) all[k] = (all[k] ?? 0) + v;
      rows.push(`${name.padEnd(13)} RNSVG views=${sumSvg(all)}  ${JSON.stringify(all)}`);
    }
    console.log('E0 screens:\n' + rows.join('\n'));

    // the Settings clock picker: 5 FaceThumbs at 96 dp
    await act(async () => { storeAct.openSettingsAt('clock'); });
    const thumbs = instOf('FaceThumb');
    let thumbSvg = 0;
    const perThumb: number[] = [];
    for (const t of thumbs) { const c = sumSvg(svgCount(t)); perThumb.push(c); thumbSvg += c; }
    console.log(`E0 picker: FaceThumb×${thumbs.length} per-thumb=${JSON.stringify(perThumb)} total RNSVG=${thumbSvg}`);
    console.log('E0 picker mount renders: ' + JSON.stringify(snap()));
    await act(async () => { storeAct.close(); set({ settingsPath: [] }); });
  });
});

describe('E1 — a tab tap', () => {
  it('today → week and back: which components re-render', async () => {
    await act(async () => { storeAct.go('Today'); nav.navigate('Today'); });
    reset();
    let t0 = performance.now();
    await act(async () => {
      storeAct.go('Week');
      nav.navigate('Week');
    });
    show(`E1 tap Today→Week (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());

    reset();
    t0 = performance.now();
    await act(async () => {
      storeAct.go('Today');
      nav.navigate('Today');
    });
    show(`E1 tap Week→Today (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());
  });

  it('today → tasks (the worst tab)', async () => {
    await act(async () => { storeAct.go('Today'); nav.navigate('Today'); });
    reset();
    const t0 = performance.now();
    await act(async () => { storeAct.go('Tasks'); nav.navigate('Tasks'); });
    show(`E1 tap Today→Tasks (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());
    reset();
    const t1 = performance.now();
    await act(async () => { storeAct.go('Today'); nav.navigate('Today'); });
    show(`E1 tap Tasks→Today (commit ${(performance.now() - t1).toFixed(1)}ms JS)`, snap());
  });

  it('today → grades → stats → today', async () => {
    reset();
    await act(async () => {
      storeAct.go('Grades');
      nav.navigate('Grades');
    });
    show('E1 tap Today→Grades', snap());
    reset();
    await act(async () => {
      storeAct.go('Stats');
      nav.navigate('Stats');
    });
    show('E1 tap Grades→Stats', snap());
    reset();
    await act(async () => {
      storeAct.go('Today');
      nav.navigate('Today');
    });
    show('E1 tap Stats→Today', snap());
  });
});

describe('E2 — clock-face SELECT', () => {
  it('setSettings({clock}) with the picker open: fan-out + clock rebuilds', async () => {
    await act(async () => { storeAct.openSettingsAt('clock'); });
    reset();
    let t0 = performance.now();
    await act(async () => { storeAct.setSettings({ clock: 'c' }); });
    show(`E2 select face 'c' (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());

    reset();
    t0 = performance.now();
    await act(async () => { storeAct.setSettings({ clock: 'sl' }); });
    show(`E2 select face 'sl' (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());

    // control: a settings write that does NOT touch clock (same fan-out shape?)
    reset();
    await act(async () => { storeAct.setSettings({ soundOn: false }); });
    show('E2 setSettings({soundOn}) control', snap());
    await act(async () => { storeAct.close(); set({ settingsPath: [] }); });
  });

  it('what re-renders when the picker SHEET itself opens', async () => {
    reset();
    const t0 = performance.now();
    await act(async () => { storeAct.openSettingsAt('clock'); });
    show(`E2 open picker sheet (commit ${(performance.now() - t0).toFixed(1)}ms JS)`, snap());
    await act(async () => { storeAct.close(); set({ settingsPath: [] }); });
  });
});

describe('E3 — the 1 s timer tick', () => {
  it('focus round running, FOCUS page visible', async () => {
    await act(async () => { storeAct.focusOpen(null); });
    await act(async () => { storeAct.timerToggle(); });
    console.log('  [E3] timer after toggle:', JSON.stringify(getState().timer), 'route:', getState().route);
    reset();
    await tick(3100, 1000, (i) => console.log(`  E3 visible slice ${i}: ` + JSON.stringify(snap())));
    show('E3 ticks over 3.1s, Focus visible', snap());
  });

  it('focus round running, user is back on TODAY (hidden Focus)', async () => {
    await act(async () => {
      storeAct.go('Today');
      nav.navigate('Today');
    });
    reset();
    await tick(3100, 1000, (i) => console.log(`  E3 hidden slice ${i}: ` + JSON.stringify(snap())));
    show('E3 ticks over 3.1s, Focus HIDDEN on Today', snap());
  });

  it('no round running (idle)', async () => {
    await act(async () => { storeAct.timerToggle(); }); // pause
    await act(async () => { storeAct.timerFinish(false); });
    reset();
    await tick(3100);
    show('E3 ticks over 3.1s, idle', snap());
  });
});
