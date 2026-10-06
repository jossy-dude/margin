/**
 * A minimal render harness for the sheet layer: reanimated, safe-area and the audio, keep-awake and
 * notification services are native or platform modules that cannot load under jest, so they are
 * stubbed here. What is NOT stubbed is the code under test — the sheet, the store, the crash log.
 *
 * The point of rendering rather than reading the file is that this bug is about *how many times*
 * something runs. Only a real render can count that.
 *
 * `jest.mock` is hoisted above the imports, so each factory below re-requires what it needs; that is
 * the one place `require` is unavoidable here.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { hydrate, getState, set, stopResync } from '../store/store';
import { nudgeStep, nudgeWord } from '../domain/timer';
import type { NotifStatus } from '../services/notifications';
import { SettingsSheet } from '../sheets/Settings';
import { clearCrashes, recordCrash, type CrashEntry } from '../ui/crashlog';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  status: async () => mockNotif.status,
  onOpened: () => {}, onReceived: () => {},
}));

/** `jest.mock` is hoisted above the module body, so the phone's answers to Delivery status have to be
 *  reachable from that factory by a name the hoister allows (see the note on `fs` below). */
const mockNotif: { status: NotifStatus } = {
  status: { permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' },
};
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
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    /* Layout-animation builders are called as `FadeOut.duration(n)` in production. */
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

/** Counts every read of the crash log, so a test can assert how often the file is opened. The mock
 *  sits on `crashlog`'s own dependency (`expo-file-system`), so it counts real reads, not calls to a
 *  seam we chose. `textSync` is the blocking read the finding is about.
 *
 *  The state lives inside the factory and is reached through `__state`: a `jest.mock` factory is
 *  hoisted above the module body, so it cannot close over anything declared here. (`crashlog` caches
 *  its parse, so a test wanting a clean slate goes through the app's own `clearCrashes()`.) */
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
  return { File, Paths: { document: 'doc' }, __state: state };
});
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

const fs = (jest.requireMock('expo-file-system') as typeof import('expo-file-system') & { __state: { reads: number; exists: boolean; entries: string[] } }).__state;
const mockReads = () => fs.reads;
const mockReset = (count: number) => {
  clearCrashes(); // the app's own API: drops the cached parse and deletes the file
  fs.exists = true; // …then put the file back, as a clean install with a log would have
  fs.reads = 0;
  fs.entries = Array.from({ length: count }, (_, i) => JSON.stringify(entry(i)));
};

const NOW = new Date(2026, 9, 5, 8).getTime();
const entry = (i: number): CrashEntry => ({ id: `c${i}`, at: NOW - i * 1000, phase: 'runtime', route: 'Today', message: `boom ${i}`, stack: '', version: '1.0.0', sdk: '57.0.0' });

/** Every sheet this file mounts stays subscribed to the crash log, so the previous one has to be
 *  unmounted before the log is reset — otherwise its listener re-reads (and re-caches) an empty file
 *  during the reset, and the next mount sees the stale empty result. */
let live: TestRenderer.ReactTestRenderer | undefined;

const mount = async (crashes = 0) => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  mockReset(crashes);
  await hydrate(new MemoryRepository(() => NOW));
  set({ settingsPath: [] });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(SettingsSheet)); });
  live = r;
  return {
    r,
    json: () => JSON.stringify(r.toJSON()),
    /** The page as a reader gets it. `json` splits every interpolated value into its own node, so a
     *  sentence the user reads as one line arrives as `"6"," reminders planned · ","1"`; joining the
     *  leaves with nothing puts it back together. */
    text: () => leaves(r.toJSON()).join(''),
    /** Drive the greeting field the way typing does: change text, then let the sheet re-render. */
    async type(text: string) {
      const inputs = r.root.findAll((n) => typeof n.type !== 'string' && 'onChangeText' in (n.props as object));
      const field = inputs.find((n) => typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function');
      if (!field) throw new Error('no text field found in the sheet');
      await act(async () => { field.props.onChangeText(text); });
    },
  };
};

afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

/** Every string in the rendered tree, in order. */
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}

describe('the Diagnostics hint does not re-read the crash log on every keystroke (BUG-008)', () => {
  it('reads the log once for the hint, not twice, and not at all per keystroke', async () => {
    const s = await mount(3);
    expect(s.json()).toContain('3 crashes recorded'); // the hint is right to begin with
    const afterMount = mockReads();
    expect(afterMount).toBeGreaterThan(0);

    for (const text of ['J', 'Jo', 'Jos', 'Joss', 'Jossy']) await s.type(text);

    expect(mockReads()).toBe(afterMount); // typing re-rendered the sheet and read the file zero more times
    expect(s.json()).toContain('Jossy'); // …and the field still took the text
  });

  it('still pluralises, and still reads at all', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');
    expect(mockReads()).toBeGreaterThan(0);
  });

  it('an empty log reads as zero rather than being skipped', async () => {
    const s = await mount(0);
    expect(s.json()).toContain('0 crashes recorded');
    expect(mockReads()).toBeGreaterThan(0);
  });

  it('the hint refreshes when you come back from Diagnostics, so a cleared log reads zero', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');

    await act(async () => { set({ settingsPath: ['diagnostics'] }); }); // you are on Diagnostics
    expect(s.json()).toContain('Test the crash reporter'); // that page, not the root
    expect(s.json()).not.toContain('Data & export');
    clearCrashes(); // …and you tap Clear

    await act(async () => { set({ settingsPath: [] }); }); // back to the root page
    expect(s.json()).toContain('0 crashes recorded'); // not the stale "1 crash recorded"
  });

  it('the read count does not depend on how many crashes are logged', async () => {
    const few = await mount(3);
    expect(few.json()).toContain('3 crashes recorded');
    const readsForThree = mockReads();

    const many = await mount(50); // the file's own cap
    expect(many.json()).toContain('50 crashes recorded');

    expect(mockReads()).toBe(readsForThree); // 50 records cost exactly what 3 do
    // a small constant: the parse happens once and is cached, and `crashCount` is then O(1). The
    // shipped code read the whole file twice per keystroke instead.
    expect(readsForThree).toBeGreaterThan(0);
    expect(readsForThree).toBeLessThan(4);
  });

  it('and a recorded crash updates the hint without anyone re-rendering the sheet by hand', async () => {
    const s = await mount(1);
    expect(s.json()).toContain('1 crash recorded');
    await act(async () => { recordCrash(new Error('boom'), 'runtime', 'Today'); });
    expect(s.json()).toContain('2 crashes recorded'); // the subscription, not a page visit
  });
});

/* ───── Delivery status ───── */
/** The page's whole job is not to look plausible when the phone is in a state it cannot do anything
 *  about. A plausible-looking zero is the failure this renders, so each state below asserts the sentence
 *  that admits it rather than the number. */
describe('Delivery status tells the truth about what this phone has actually done', () => {
  /** `resync` is debounced, so the store's own `notifStatus` never lands inside a test; the page is
   *  given the phone's answers and the planner's output directly, which is what it reads. */
  const page = async (patch: Partial<Parameters<typeof set>[0]> = {}) => {
    const s = await mount();
    await act(async () => { set({ settingsPath: ['nstatus'], notifStatus: mockNotif.status, ...patch }); });
    return s;
  };
  const status = (o: Partial<NotifStatus>): NotifStatus => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, platform: 'test', ...o });

  it('a queue it could not read is not shown as an empty one', async () => {
    mockNotif.status = status({ scheduled: 0, queueRead: false });
    const s = await page({});
    expect(s.text()).toContain('would not say what it has queued');
    expect(s.text()).not.toContain('0 reminders queued');
  });

  it('a real count is real, and the next one is absolute and relative', async () => {
    mockNotif.status = status({ scheduled: 18, next: Date.now() + 12 * 60_000 });
    const s = await page({});
    expect(s.text()).toContain('18 reminders queued on this phone');
    expect(s.text()).toMatch(/Next one rings .+ — in \d+ min\./);
  });

  it('an alarm whose time has passed says so instead of a negative wait', async () => {
    mockNotif.status = status({ scheduled: 3, next: Date.now() - 5 * 60_000 });
    const s = await page({});
    expect(s.text()).toContain('5 min overdue');
  });

  it('blocked, with the phone still willing to ask: it says so, and offers the ask', async () => {
    mockNotif.status = status({ permission: 'denied', canAskAgain: true, scheduled: 4 });
    const s = await page({});
    expect(s.text()).toContain('Notifications are blocked.');
    expect(s.text()).toContain('The phone will still ask once');
    expect(s.text()).toContain('Allow notifications');
    expect(s.text()).not.toContain('Open phone settings');
    expect(s.text()).toContain('4 still queued from before'); // leftovers are named, not hidden
  });

  it('blocked, with the phone refusing to ask again: it says the app cannot fix it and offers the settings screen', async () => {
    mockNotif.status = status({ permission: 'denied', canAskAgain: false });
    const s = await page({});
    expect(s.text()).toContain('The phone has stopped asking');
    expect(s.text()).toContain('Open phone settings');
    expect(s.text()).not.toContain('Allow notifications');
  });

  it('a phone with no notification module is not described as a blocked app with a fix', async () => {
    mockNotif.status = status({ permission: 'unavailable', queueRead: false });
    const s = await page({});
    expect(s.text()).toContain('would not give the app its notification module');
  });

  it('a reminder that rang while the app was closed is shown as opened and never seen', async () => {
    mockNotif.status = status({ scheduled: 0 });
    const s = await page({ notifLog: [{ id: 'ended-1-1', kind: 'ended', dueAt: Date.now() - 3_600_000, shownAt: null, openedAt: Date.now() - 600_000 }] });
    expect(s.text()).toContain('opened, never rang in the app');
    expect(s.text()).toContain('class ended');
    expect(s.text()).not.toContain('Nothing has been queued on this phone yet');
  });

  it('an empty log says so in words, rather than showing an empty list', async () => {
    mockNotif.status = status({ scheduled: 0 });
    const s = await page({ notifLog: [] });
    expect(s.text()).toContain('Nothing has been queued on this phone yet');
  });

  it('what moved and what was dropped is named, with the reason the planner gave', async () => {
    mockNotif.status = status({ scheduled: 6 });
    const s = await page({ plan: { count: 6, deferred: 2, shifted: 1, at: Date.now(), next: null, moved: [{ title: 'Economics', at: Date.now() + 3_600_000, was: Date.now(), why: 'quiet hours' }], dropped: [{ id: 'x', why: 'blocked by quiet/active settings' }] } });
    expect(s.text()).toContain('1 moved out of the way');
    expect(s.text()).toContain('2 waiting for room in the queue');
    expect(s.text()).toContain('“Economics” moved from');
    expect(s.text()).toContain('quiet hours.');
    expect(s.text()).toContain('Dropped: blocked by quiet/active settings.');
  });

  it('the action test is armed before it can write anything real', async () => {
    mockNotif.status = status({ scheduled: 6, next: Date.now() + 3_600_000 });
    const s = await page({ plan: { count: 6, deferred: 0, shifted: 0, at: Date.now(), next: { id: 'ended-1-1', kind: 'ended', at: Date.now() + 3_600_000, title: 'Economics just ended', body: 'b', channel: 'classes', route: 'Today', entityId: '2026-10-06|08:30|E' }, moved: [], dropped: [] } });
    expect(s.text()).toContain('Test the buttons');
    expect(s.text()).toContain('really marks it'); // the cost is stated before the button is pressed
    expect(s.text()).toContain('Test in 10 s'); // …and the old plain-tap test is still there
  });
});

/**
 * The Focus & breaks page used to promise "nudges you every 5 minutes" for every break length, and the
 * stepper on that same page offers 1–30. It was false for all of them: `nudgeStep` is a third of the break
 * (so the default 5-minute break wiggles once a **minute**), capped at `NUDGE_MS`. This is the fix that
 * cannot rot — the sentence is generated from `nudgeStep` itself — and these are the assertions that hold it.
 */
describe('the Focus & breaks page describes the cadence the timer will actually run', () => {
  // `mount()` clears `settingsPath`, so the page is entered after it, not before
  const focus = async (breakMin: number) => {
    const s = await mount();
    await act(async () => { set({ settings: { ...getState().settings, breakMin }, settingsPath: ['focus'] }); });
    return s.text();
  };

  it('says every minute for the 5-minute default, which is what the code does', async () => {
    expect(await focus(5)).toContain('nudges you every minute,');
  });

  it('says every five minutes once the third of the break reaches the cap', async () => {
    expect(await focus(15)).toContain('nudges you every 5 minutes,');
    expect(await focus(30)).toContain('nudges you every 5 minutes,');
  });

  it('never claims a cadence nudgeStep would not produce, anywhere in the stepper range', async () => {
    for (let m = 1; m <= 30; m++) {
      const said = nudgeWord(m * 60_000);
      const mins = Math.round(nudgeStep(m * 60_000) / 60_000);
      // the sentence is derived, so the real assertion is that it agrees with the timer at every length
      const want = mins === 1 ? 'every minute' : `every ${mins} minutes`;
      expect({ m, said, mins, agrees: said === want }).toEqual({ m, said, mins, agrees: true });
    }
  });

  it('the copy is generated, not typed: the page interpolates nudgeWord rather than naming a number', () => {
    const src = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
    expect(src).toContain('nudges you {nudgeWord(s.breakMin * 60_000)},');
    // the negative runs over CODE with comments stripped — the paragraph above legitimately quotes the old copy
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('nudges you {nudgeWord(');
    expect(code).not.toContain('nudges you every');
  });

  it('and nudgeWord is nudgeStep in words, boundary by boundary', () => {
    expect(nudgeWord(1 * 60_000)).toBe('every minute');   // no third to take; the one-minute floor wins
    expect(nudgeWord(3 * 60_000)).toBe('every minute');
    expect(nudgeWord(9 * 60_000)).toBe('every 3 minutes'); // floor(9/3) = 3
    expect(nudgeWord(15 * 60_000)).toBe('every 5 minutes');// capped at NUDGE_MS
    expect(nudgeWord(120 * 60_000)).toBe('every 5 minutes');
  });
});
