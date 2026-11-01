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
import { Linking } from 'react-native';
import { Path } from 'react-native-svg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryRepository } from '../data/memory';
import { hydrate, getState, set, stopResync } from '../store/store';
import { nudgeStep, nudgeWord } from '../domain/timer';
import { APP_VERSION } from '../domain/version';
import type { NotifStatus } from '../services/notifications';
import { SettingsSheet } from '../sheets/Settings';
import { AboutPage, SUPPORT_URL } from '../sheets/AboutPage';
import { clearCrashes, recordCrash, type CrashEntry } from '../services/problems';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  applyLockscreenText: async () => {},
  status: async () => mockNotif.status,
  onOpened: () => {}, onReceived: () => {},
}));

/** `jest.mock` is hoisted above the module body, so the phone's answers to Delivery status have to be
 *  reachable from that factory by a name the hoister allows (see the note on `fs` below). */
const mockNotif: { status: NotifStatus } = {
  status: { permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, lockText: null, platform: 'test' },
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
 *  sits on `services/problems`'s own dependency (`expo-file-system`), so it counts real reads, not calls to a
 *  seam we chose. `textSync` is the blocking read the finding is about.
 *
 *  The state lives inside the factory and is reached through `__state`: a `jest.mock` factory is
 *  hoisted above the module body, so it cannot close over anything declared here. (`services/problems` caches
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
/** v0.5 (WS3). The uninstall row must reach the *existing* export path, so the seam under test is the
 *  module the Data page already calls: if a second implementation were added, this mock would not see
 *  the tap and the assertion below would fail. */
jest.mock('../services/exportFile', () => ({
  runExport: jest.fn(async () => ({ ok: true, where: 'file:///cache/margin-2026-10-29.json', name: 'margin-2026-10-29.json' })),
}));

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
  /* The term is seeded rather than left to the repository's heal: `hydrate` now READS the active term
     (the row is authoritative over the settings mirror), and a repository with no terms heals to
     today — a date that moves with the clock. These tests are about the editor, so they pin the
     shipped default range the labels below are written against. */
  const repo = new MemoryRepository(() => NOW);
  await repo.putSettings({ semesterStart: '2026-09-07' });
  await hydrate(repo);
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

    for (const text of ['S', 'Sa', 'Sam']) await s.type(text);

    expect(mockReads()).toBe(afterMount); // typing re-rendered the sheet and read the file zero more times
    expect(s.json()).toContain('Sam'); // …and the field still took the text
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
  const status = (o: Partial<NotifStatus>): NotifStatus => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, lockText: null, platform: 'test', ...o });

  it('a queue it could not read is not shown as an empty one', async () => {
    mockNotif.status = status({ scheduled: 0, queueRead: false });
    const s = await page({});
    expect(s.text()).toContain('would not say what it has queued');
    expect(s.text()).not.toContain('0 reminders queued');
  });

  it('a real count is real, and the next one is a window, never the minute it was planned for', async () => {
    mockNotif.status = status({ scheduled: 18, next: Date.now() + 12 * 60_000 });
    const s = await page({});
    expect(s.text()).toContain('18 reminders queued on this phone');
    expect(s.text()).toMatch(/Next one is planned for around \d\d:\d\d — give or take 5 min — in \d+ min\./);
    // W5 D1: nothing in the installed dependencies exposes `canScheduleExactAlarms()`, so the page says
    // it cannot know rather than printing "rings at 17:47" and hoping.
    expect(s.text()).toContain('will not tell the app whether exact alarms are allowed');
    expect(s.text()).not.toContain('Next one rings');
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
    // W5 D6: the same build also says, once, that alarms need the development build.
    expect(s.text()).toContain('This build has no notification module');
    expect(s.text()).toContain('ringing reminders need the development build on a phone');
  });

  /* W5 D4. The setting is a wish; the channel is the truth. This renders the disagreement, because a
     phone that ignores the visibility change must not be told its text is hidden when it is not. */
  it('prints the channel the phone reports, not the setting it was given (D4)', async () => {
    mockNotif.status = status({ platform: 'android', lockText: 'private' });
    const s = await page({ settings: { ...getState().settings, notif: { ...getState().settings.notif, lockText: false } } });
    expect(s.text()).toContain('set to stay hidden until you unlock');
    expect(s.text()).toContain('hides the text on a secure lock screen');
    expect(s.text()).toContain('the channel wins');
  });

  it('and agrees with the phone when the channel did take the change', async () => {
    mockNotif.status = status({ platform: 'android', lockText: 'secret' });
    const s = await page({ settings: { ...getState().settings, notif: { ...getState().settings.notif, lockText: false } } });
    expect(s.text()).toContain("and this phone's channel hides even that a reminder arrived");
    expect(s.text()).not.toContain('the channel wins');
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

/* W5 D4/D6 on the page where the toggle actually lives. The toggle is a wish; Delivery status one push
 * deeper is where the phone's own channel is read back, which is why the two belong together. */
describe('Settings → Reminders (W5)', () => {
  const reminders = async () => {
    const s = await mount();
    await act(async () => { set({ settingsPath: ['notifications'] }); });
    return s;
  };

  it('offers the lock-screen text toggle above Delivery status, and says what Off does', async () => {
    const s = await reminders();
    const t = s.text();
    expect(t).toContain('Show reminder text on the lock screen');
    expect(t).toContain('When off, it still rings but the text stays hidden until you unlock');
    expect(t.indexOf('Show reminder text on the lock screen')).toBeLessThan(t.indexOf('Delivery status'));
  });

  it('the Reminders row carries the short version, next to the clock hint it already had (D6)', async () => {
    const s = await mount();
    await act(async () => { set({ notifStatus: { permission: 'unavailable', scheduled: 0, next: null, canAskAgain: false, queueRead: false, lockText: null, platform: 'test' } }); });
    const t = s.text();
    expect(t).toContain('min before class'); // W4's clock-bearing hint is still there…
    expect(t).toContain('alarms need the development build'); // …with the honest addendum beside it
  });

  it('the toggle round-trips through the store, which is what re-applies the channels', async () => {    const s = await reminders();
    expect(getState().settings.notif.lockText).toBe(true);
    const toggle = s.r.root.findAll((n) => (n.props as { testID?: string; onPressIn?: unknown }).testID === 'show-reminder-text-on-the-lock-screen' && typeof (n.props as { onPressIn?: unknown }).onPressIn === 'function')[0];
    expect(toggle).toBeDefined();
    await act(async () => { toggle!.props.onPressIn(); });
    expect(getState().settings.notif.lockText).toBe(false);
    await act(async () => { toggle!.props.onPressIn(); });
    expect(getState().settings.notif.lockText).toBe(true);
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

/* ───── the Problems log's own headers ───── */
/** W1/C. `boot` and `runtime` name the page a failure happened on. `save` and `data` happen with no
 *  page involved, so they must name what the app was doing instead — printing "On task" for a row that
 *  failed to parse would send the reader looking for a screen that does not exist. */
describe('a save or a data problem names what the app was doing, not an invented route', () => {
  it('renders one header per kind, and keeps named routes for the kinds that have one', async () => {
    const s = await mount(0);
    await act(async () => {
      recordCrash(new Error('task row skipped'), 'data', 'task');
      recordCrash(new Error('the database is full'), 'save', 'Today');
      recordCrash(new Error('boom'), 'runtime', 'Today');
      set({ settingsPath: ['diagnostics'] }); // entered after the log is written: the page reads on mount
    });
    expect(s.json()).toContain('Test the crash reporter'); // …on the page, not somewhere else in the sheet

    expect(s.text()).toContain('While reading data');
    expect(s.text()).toContain('While saving');
    expect(s.text()).toContain('On Today');
    expect(s.text()).not.toContain('On task');
  });
});

/* ───── v0.3.1: the semester range and the import/safety rows ───── */
/** The old editor had month/day steppers only, so the year was unchangeable and there was no end date
 *  at all. These render the page and drive the controls the way a thumb would. */
describe('Settings → Attendance & semester carries both dates and a year (v0.3.1)', () => {
  const tap = async (r: TestRenderer.ReactTestRenderer, testID: string) => {
    const n = r.root.findAll((x) => (x.props as { testID?: string }).testID === testID && typeof (x.props as { onPressIn?: unknown }).onPressIn === 'function')[0];
    if (!n) throw new Error(`no switch with testID "${testID}"`);
    await act(async () => { (n.props as { onPressIn: () => void }).onPressIn(); });
  };
  const type = async (r: TestRenderer.ReactTestRenderer, testID: string, text: string) => {
    const n = r.root.findAll((x) => (x.props as { testID?: string }).testID === testID && typeof (x.props as { onChangeText?: unknown }).onChangeText === 'function')[0];
    if (!n) throw new Error(`no field with testID "${testID}"`);
    await act(async () => { (n.props as { onChangeText: (v: string) => void }).onChangeText(text); });
  };
  const attendance = async () => {
    const s = await mount();
    await act(async () => { set({ settingsPath: ['attendance'] }); });
    return s;
  };

  it('shows a year, month and day for the start, and hides the end until it is switched on', async () => {
    const s = await attendance();
    const t = s.text();
    expect(t).toContain('Semester starts');
    expect(t).toContain('No end date');
    expect(t).toContain('from 7 Sep 2026'); // the label, generated from the stored range
    expect(t).not.toContain('Semester ends');
    // v0.5 / R1: three numeric keypad fields, not steppers — a date is typed, not stepped.
    for (const id of ['semester-start-year', 'semester-start-month', 'semester-start-day']) {
      const field = s.r.root.findAll((n) => (n.props as { testID?: string }).testID === id && typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function')[0];
      expect(field).toBeDefined();
      expect((field!.props as { keyboardType?: string }).keyboardType).toBe('numeric');
    }
    expect(s.r.root.findAll((n) => String((n.props as { accessibilityLabel?: string }).accessibilityLabel ?? '').startsWith('Increase start '))).toHaveLength(0);
  });

  it('the year field really moves the year — the defect the old month/day-only editor had', async () => {
    const s = await attendance();
    expect(getState().settings.semesterStart).toBe('2026-09-07');
    await type(s.r, 'semester-start-year', '2027');
    expect(getState().settings.semesterStart).toBe('2027-09-07');
    expect(getState().settings.semesterEnd).toBe(''); // still open-ended
    expect(s.text()).toContain('from 7 Sep 2027');
  });

  it('the day prints two digits, while the stored date stays YYYY-MM-DD', async () => {
    const s = await attendance();
    const day = s.r.root.findAll((n) => (n.props as { testID?: string }).testID === 'semester-start-day' && typeof (n.props as { onChangeText?: unknown }).onChangeText === 'function')[0];
    expect(day).toBeDefined();
    expect((day!.props as { value?: string }).value).toBe('07'); // a lone 7 reads as "?" in the numerals face
    expect(getState().settings.semesterStart).toBe('2026-09-07'); // display only, never the stored value
  });

  it('turning "No end date" off seeds a term, not a one-day semester', async () => {
    const s = await attendance();
    await tap(s.r, 'no-end-date');
    expect(getState().settings.semesterEnd).toBe('2026-12-21'); // start + 15 weeks
    const t = s.text();
    expect(t).toContain('Semester ends');
    expect(t).toContain('7 Sep – 21 Dec 2026');
    expect(t).not.toContain('7 Sep – 7 Sep 2026'); // the seed is later than the start, by more than a day
    expect(getState().settings.semesterEnd > getState().settings.semesterStart).toBe(true);
  });

  it('an end before the start is a hint and is not written, never silently clamped', async () => {
    const s = await attendance();
    await tap(s.r, 'no-end-date'); // end = 2026-12-21
    await type(s.r, 'semester-start-year', '2027'); // start would become 2027, past the end
    expect(getState().settings.semesterStart).toBe('2026-09-07'); // nothing saved
    expect(getState().settings.semesterEnd).toBe('2026-12-21');
    expect(s.text()).toContain('The end date is before the start, so nothing is saved yet.');
  });
});

describe('Settings → Data has the import door and the safety-copy row (v0.3.1)', () => {
  const data = async () => {
    const s = await mount();
    await act(async () => { set({ settingsPath: ['data'] }); });
    return s;
  };

  it('offers Import, and says what a safety copy is', async () => {
    const s = await data();
    const t = s.text();
    expect(t).toContain('Import');
    expect(t).toContain('Paste a JSON export, or a compact file an AI wrote');
    expect(t).toContain('Safety copies');
    // jest has no document directory (the mock has no Directory), so the honest fallback is shown
    expect(t).toContain('No safety copies yet');
    expect(t).toContain('keeps the newest three');
  });

  it('the Import page is a page with a paste box, not a dead row', async () => {
    const s = await data();
    await act(async () => { set({ settingsPath: ['data', 'import'] }); });
    const t = s.text();
    expect(t).toContain('JSON'); // the field's label
    expect(t).toContain('Import only adds rows');
    const field = s.r.root.findAll((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel === 'JSON to import')[0];
    expect(field).toBeDefined();
  });

  it('the Import preview counts a one-of-each file in the singular', async () => {
    const s = await data();
    await act(async () => { set({ settingsPath: ['data', 'import'] }); });
    await s.type(JSON.stringify({
      courses: [{ name: 'Maths', meetings: [{ weekday: 1, start: '08:30', end: '10:00' }] }],
      days: [{ date: '2026-09-14', status: 'c' }],
      tasks: [{ title: 'Read the chapter', course: 'Maths' }],
      marks: [{ course: 'Maths', name: 'Quiz 1', score: 8, weight: 1 }],
    }));
    const check = s.r.root.findAll((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel === 'Check' && typeof (n.props as { onPress?: unknown }).onPress === 'function')[0];
    expect(check).toBeDefined();
    await act(async () => { (check!.props as { onPress: () => void }).onPress(); });
    const t = s.text();
    expect(t).toContain('1 subject (1 new) · 1 class (1 new) · 1 day mark (1 new) · 1 task (1 new) · 1 mark (1 new)');
    expect(t).not.toContain('1 subjects');
  });

  it('About prints the one version string', async () => {
    const s = await mount();
    await act(async () => { set({ settingsPath: ['about'] }); });
    expect(s.text()).toContain(`Margin ${APP_VERSION}`);
  });
});

/**
 * The split. `about` used to be titled *Reset* and hold three unrelated things: the erase button, the
 * version line and the Updates block — so "what build am I on" was a scroll away from the one action
 * in the app that cannot be undone. Each page must carry its own half and none of the other's, and the
 * support row's blank-URL state must be *no section at all*, not a button that cannot do anything.
 */
describe('About and Reset are two pages, and the support row is absent until its link exists', () => {
  const page = async (path: string[]) => {
    const s = await mount();
    await act(async () => { set({ settingsPath: path }); });
    return s;
  };
  /** A button found by what TalkBack says, and only one that can actually be pressed — `findAll`
   *  matches the `Pressable` and the host view it renders, so the second copy has no `onPress`. */
  const pressable = (s: Awaited<ReturnType<typeof page>>, label: string) => {
    const found = s.r.root.findAll((n) => {
      const p = n.props as { accessibilityLabel?: unknown; onPress?: unknown };
      return p.accessibilityLabel === label && typeof p.onPress === 'function';
    })[0];
    if (!found) throw new Error(`no pressable labelled "${label}" on the page`);
    return found.props as { onPress: () => void };
  };

  it('About says what this is and what this build is, and carries no erase button', async () => {
    const t = (await page(['about'])).text();
    expect(t).toContain(`Margin ${APP_VERSION}`);
    expect(t).toContain('A school planner in paper and ink, on your phone.');
    expect(t).toContain('What it holds');
    expect(t).toContain('Why it looks like this');
    expect(t).toContain('Who made it');
    expect(t).toContain('Made by Jossy');
    expect(t).toContain('Updates');
    expect(t).not.toContain('Erase everything');
    expect(t).not.toContain('undefined');
  });

  it('Reset keeps the destructive action and none of the prose', async () => {
    const t = (await page(['reset'])).text();
    expect(t).toContain('Erase everything');
    expect(t).toContain('This erases the whole database file');
    expect(t).not.toContain('Why it looks like this');
    expect(t).not.toContain(`Margin ${APP_VERSION}`); // the version moved off the erase page
  });

  it('the two-tap guard on Reset survived the move: one tap erases nothing', async () => {
    const s = await page(['reset']);
    await act(async () => { pressable(s, 'Erase everything').onPress(); });
    expect(s.text()).toContain('Tap again to erase everything');
    expect(getState().settingsPath).toEqual(['reset']); // it armed instead of acting
  });

  it('SUPPORT_URL ships blank, so the section it controls does not exist', async () => {
    expect(SUPPORT_URL).toBe('');
    expect((await page(['about'])).text()).not.toContain('Buy me a coffee');
    expect((await page(['about'])).text()).not.toContain('Support');
  });

  it('a pasted support URL adds the row, and the row opens exactly that URL', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(React.createElement(AboutPage, { supportUrl: 'https://buymeacoffee.com/jossy' })); });
    const btn = r.root.findAll((n) => {
      const p = n.props as { accessibilityLabel?: unknown; onPress?: unknown };
      return p.accessibilityLabel === 'Buy me a coffee' && typeof p.onPress === 'function';
    })[0];
    expect(btn).toBeDefined();
    await act(async () => { (btn!.props as { onPress: () => void }).onPress(); });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://buymeacoffee.com/jossy');
    open.mockRestore();
  });

  it('a link this phone cannot open says so instead of rejecting on the tap', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler for that scheme'));
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(React.createElement(AboutPage, { supportUrl: 'nope://coffee' })); });
    const btn = r.root.findAll((n) => {
      const p = n.props as { accessibilityLabel?: unknown; onPress?: unknown };
      return p.accessibilityLabel === 'Buy me a coffee' && typeof p.onPress === 'function';
    })[0]!;
    await act(async () => { (btn.props as { onPress: () => void }).onPress(); });
    await act(async () => { await Promise.resolve(); });
    expect(getState().toast?.text).toContain('could not be opened');
    open.mockRestore();
  });
});
/**
 * The Look & feel page's Progress bar row read its name out of `BAR_KINDS` alone, so once the owner
 * picked a catalogue instrument (`spiral`, `cassette`, …) the row had no name to print. The app was
 * drawing a bar while Settings could not say which one — the same class of lie the `bar` resolution
 * above (:139) already fixed for the picker.
 */
describe('the Look & feel row names the Progress bar the app is actually drawing', () => {
  const appearance = async (bar: string) => {
    const s = await mount();
    await act(async () => { set({ settings: { ...getState().settings, bar }, settingsPath: ['appearance'] }); });
    return s;
  };
  /** The row's own accessible name is `${label}. ${hint}` (see `Nav`), so this reads what a screen
   *  reader announces for that one row instead of searching the whole page for a word. */
  const row = (s: Awaited<ReturnType<typeof appearance>>): string => {
    const found = s.r.root.findAll((x) => {
      const label = (x.props as { accessibilityLabel?: unknown }).accessibilityLabel;
      return typeof label === 'string' && label.startsWith('Progress bar.');
    })[0];
    if (!found) throw new Error('no Progress bar row on the Look & feel page');
    return (found.props as { accessibilityLabel: string }).accessibilityLabel;
  };

  it('names a catalogue instrument instead of the literal word "undefined"', async () => {
    const s = await appearance('spiral');
    expect(row(s)).toBe('Progress bar. Spiral');
    expect(s.text()).not.toContain('undefined');
  });

  it('still names the app’s own day bar, so the original path stays covered', async () => {
    const s = await appearance('glass');
    expect(row(s)).toBe('Progress bar. Sight glass');
    expect(s.text()).not.toContain('undefined');
  });
});

/**
 * The picker draws every preview at one fixed moment — `DEMO_NOW`, 10:20 on 5 Oct 2026, 30 of the
 * 50 minutes of `DEMO_PERIODS[1]` left, so p = 0.6. The unselected rows bake that into a static
 * `previewSvg` string. The SELECTED row is a live `DayBar`, and it used to take its phase from
 * `useNow()` — today's wall clock — which is long past every demo period: `activePeriod` then returns
 * the last period with `left = 0`, so every selected instrument drew p = 0, the "period over" state.
 * Spiral is the readable witness: at p = 0.6 it is two paths (the groove still ahead at full strength,
 * the played part at 0.5), while at p = 0 the "ahead" path has a single point and is not drawn at all.
 */
describe('the progress-bar picker previews the demo moment, not today’s clock', () => {
  const picker = async (bar: string) => {
    const s = await mount();
    await act(async () => { set({ settings: { ...getState().settings, bar }, settingsPath: ['bar'] }); });
    return s;
  };
  /** The live preview's own accessible name says the moment it was drawn at: `spiral, 60 percent of
   *  Discrete remaining`. Only the selected row is live, so this also proves the row is the one. */
  const preview = (s: Awaited<ReturnType<typeof picker>>): TestRenderer.ReactTestInstance => {
    const found = s.r.root.findAll((x) => typeof (x.props as { accessibilityLabel?: unknown }).accessibilityLabel === 'string'
      && /^spiral, /.test((x.props as { accessibilityLabel: string }).accessibilityLabel))[0];
    if (!found) throw new Error('no live spiral preview on the Progress bar page');
    return found;
  };
  const paths = (n: TestRenderer.ReactTestInstance) => n.findAllByType(Path);

  it('draws the selected spiral at the same 60% as the static previews beside it', async () => {
    const s = await picker('spiral');
    const live = preview(s);
    expect((live.props as { accessibilityLabel: string }).accessibilityLabel).toBe('spiral, 60 percent of Discrete remaining');

    const drawn = paths(live);
    expect(drawn).toHaveLength(2); // p = 0.6: a groove still to play, and the part already played
    const opacities = drawn.map((p) => (p.props as { opacity?: number }).opacity);
    expect(opacities.filter((o) => o === undefined)).toHaveLength(1); // the part still ahead, full strength
    expect(opacities.filter((o) => typeof o === 'number' && o > 0.2 && o < 0.9)).toHaveLength(1); // the played part
  });
});

/* ───── v0.5 (WS3): a copy you hold, before an uninstall you cannot undo ───── */
/**
 * Uninstalling deletes the database, and Android has no dialog an app can raise to keep its data — the
 * release spec says so explicitly (V4 in the v0.9 draft, B3 in v0.5), so the app must not imply otherwise.
 * What it can do is hand the person a copy first. That copy has to be the *same* export the Data & export
 * page produces: a second code path would drift from it, and a JSON file is the one format Import can read
 * back.
 */
describe('the uninstall row exports the planner instead of promising a keep-data dialog', () => {
  const runExport = (jest.requireMock('../services/exportFile') as { runExport: jest.Mock }).runExport;
  beforeEach(() => { runExport.mockClear(); });

  /** The row's accessible name is `${label}. ${hint}` (see `Nav`), and `findAll` also matches the host
   *  view the `Pressable` renders — only the `Pressable` copy has `onPress`. */
  const row = (s: Awaited<ReturnType<typeof mount>>) => {
    const found = s.r.root.findAll((n) => {
      const p = n.props as { accessibilityLabel?: unknown; onPress?: unknown };
      return typeof p.accessibilityLabel === 'string'
        && p.accessibilityLabel.startsWith('Export before uninstalling')
        && typeof p.onPress === 'function';
    })[0];
    if (!found) throw new Error('no "Export before uninstalling" row on the Settings root');
    return found.props as { accessibilityLabel: string; onPress: () => void };
  };

  it('sits on the Settings root, says what uninstalling costs, and offers the export', async () => {
    const s = await mount();
    const t = s.text();
    expect(t).toContain('Export before uninstalling');
    // the cost, in the app's own words: uninstalling erases the copy on this phone
    expect(t).toContain('Uninstalling erases');
    // …and the one thing that can bring it back, named as Auto Backup rather than as magic
    expect(t).toContain('Auto Backup');
    // the offer itself: a JSON copy, importable by the Import page that already exists
    expect(t).toContain('JSON');
  });

  it('never claims the phone will offer to keep the data — no such dialog exists', async () => {
    const t = (await mount()).text();
    expect(t).not.toMatch(/keep your data/i);
    expect(t).not.toMatch(/ask you (whether )?to keep/i);
    expect(t).not.toMatch(/will (still )?be (here|there) after you uninstall/i);
  });

  it('one tap runs the existing JSON export, and does not just navigate somewhere', async () => {
    const s = await mount();
    await act(async () => { row(s).onPress(); });
    expect(runExport).toHaveBeenCalledTimes(1);
    // format and target are the ones the Data page uses: JSON, through the system share sheet
    expect(runExport.mock.calls[0].slice(0, 2)).toEqual(['json', 'share']);
    expect(getState().settingsPath).toEqual([]); // it exported, it did not push a page
    // the existing flow's own feedback is what the person sees
    expect(getState().toast?.text).toBe('Exported margin-2026-10-29.json');
  });

  it('the row’s accessible name carries the warning, so a screen reader hears it too', async () => {
    const s = await mount();
    const label = row(s).accessibilityLabel;
    expect(label).toContain('Export before uninstalling');
    expect(label).toContain('Uninstalling erases');
  });
});
