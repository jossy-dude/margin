/**
 * WS4 review fix, part 1 (I1/I2): the two places where the loop was wired at the wrong moment.
 *
 * **I1 — the sentence.** It used to be toasted from `hydrate`, which runs before `Shell` is mounted:
 * on the launch that applied an update the splash is still up while the fonts load, and `toast()`'s
 * 2.6 s timer started then. The sentence could expire behind the splash, and the KV marker had already
 * been deleted, so nothing retried. The fix moves the toast into `useUpdateAnnouncement()`, which only
 * a mounted shell calls, and makes the marker deletion a separate step that runs after `toast()`.
 * This suite proves the wiring by behaviour: hydrate alone is silent and leaves the marker; mounting
 * the hook shows the sentence and only then consumes the marker.
 *
 * **I2 — the About row.** A resume check can download an update silently. About used to open on
 * `idle`, so the row never appeared; and tapping Check ran a fetch that answered `isNew: false`
 * (the bundle is already on disk), which the old code wrote into `pending`, printing "newest version"
 * and shutting the restart gate. Here the About page is rendered for real against a staged download.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { dismissToast, getState, hydrate, resetUpdateAnnouncement, stopResync, useUpdateAnnouncement } from '../store/store';
import { AboutPage } from '../sheets/AboutPage';
import { Shell } from '../App';
import { ThemeProvider } from '../ui/theme-context';
import { APPLIED_VERSION_KEY, checkForUpdate, resetOtaState, updateStaged } from '../services/ota';

const mockUpdates = {
  isEnabled: true as boolean | undefined,
  runtimeVersion: '0.3.1' as string | null,
  updateId: null as string | null,
  checkForUpdateAsync: jest.fn<Promise<{ isAvailable: boolean }>, []>(),
  fetchUpdateAsync: jest.fn<Promise<{ isNew: boolean; manifest?: { id?: string } }>, []>(),
  reloadAsync: jest.fn<Promise<void>, []>(),
};
jest.mock('expo-updates', () => mockUpdates);
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, lockText: null, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
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
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    /* `.easing()` too: the shell test below draws the real `Overlay`, whose toast enters with
       `FadeInDown.duration(220).easing(EASE)`. */
    FadeIn: { duration: () => ({ easing: () => ({}) }) }, FadeOut: { duration: () => ({ easing: () => ({}) }) },
    FadeInDown: { duration: () => ({ easing: () => ({}) }) }, FadeOutDown: { duration: () => ({ easing: () => ({}) }) },
  };
  return { ...api, default: api };
});
/* `Book` mounts all six pages on its first render (see `navigation/Book.tsx`), which would turn the
   shell test below into a test of every screen. The pages are not what it is about, so the navigator
   draws nothing; the shell around it — and the `Overlay` that shows toasts — is real. */
jest.mock('../navigation/Book', () => ({ createBookNavigator: () => ({ Navigator: () => null, Screen: () => null }) }));
jest.mock('expo-file-system', () => {
  class File {
    get exists() { return false; }
    create() {}
    delete() {}
    write() {}
    textSync() { return ''; }
  }
  return { File, Paths: { document: 'doc' } };
});
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
let live: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => {
  mockUpdates.isEnabled = true;
  mockUpdates.runtimeVersion = '0.3.1';
  mockUpdates.updateId = null;
  mockUpdates.checkForUpdateAsync.mockReset();
  mockUpdates.fetchUpdateAsync.mockReset();
  mockUpdates.reloadAsync.mockReset();
  resetOtaState();
  resetUpdateAnnouncement(); // the once-per-launch flag: each case is a fresh launch
  dismissToast();
});
afterEach(async () => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  stopResync(); // hydrate schedules a rebuild; it must not fire after the suite is torn down
});

/** Stands in for the mounted shell: the hook is the only thing under test here. */
const Announcer = () => { useUpdateAnnouncement(); return null; };

/** Mount under `act`, keep the instance for `afterEach` to unmount, and hand back a renderer that is
 *  known to exist — so the assertions below never have to carry `| undefined`. */
const mount = async (el: React.ReactElement): Promise<TestRenderer.ReactTestRenderer> => {
  await act(async () => { live = TestRenderer.create(el); });
  if (!live) throw new Error('nothing mounted');
  return live;
};

const text = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
const button = (r: TestRenderer.ReactTestRenderer, label: string) => r.root.findAll((n) => {
  const p = n.props as { accessibilityLabel?: unknown; onPressIn?: unknown };
  return p.accessibilityLabel === label && typeof p.onPressIn === 'function';
})[0];
/** Pressables act on press-in (kit/`usePressIn`), so that is the gesture a thumb makes. */
const tap = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const b = button(r, label);
  if (!b) throw new Error(`no "${label}" button`);
  await act(async () => { (b.props as { onPressIn: () => void }).onPressIn(); });
  await act(async () => { await flush(); });
};

describe('the applied-update sentence waits for a screen, and is not consumed before it renders', () => {
  it('hydrate is silent, the mounted shell shows it once, and only then is the marker gone', async () => {
    const repo = new MemoryRepository();
    await repo.setKv(APPLIED_VERSION_KEY, 'update-2');
    mockUpdates.updateId = 'update-2'; // this launch is running the bundle that was applied
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await hydrate(repo);
    await flush();

    /* Boot alone must NOT toast: that is the bug this test pins. The sentence would have started its
       2.6 s timer behind the splash, and the marker would already have been deleted. */
    expect(getState().toast).toBeNull();
    expect(await repo.getKv(APPLIED_VERSION_KEY)).toBe('update-2');

    await act(async () => { live = TestRenderer.create(React.createElement(Announcer)); });
    await act(async () => { await flush(); });

    expect(getState().toast?.text).toBe('You’re now on Margin 0.5.0');
    expect(await repo.getKv(APPLIED_VERSION_KEY)).toBeNull(); // consumed AFTER the toast was shown

    /* A remount (a theme change, the tour closing) must not say it again. */
    await act(async () => { dismissToast(); }); // the hook reads the toast slot, so this re-renders it
    await act(async () => { live?.unmount(); live = TestRenderer.create(React.createElement(Announcer)); });
    await act(async () => { await flush(); });
    expect(getState().toast).toBeNull();
  });

  /* The behaviour above is only reachable if the shell actually calls the hook. This used to be a
     source pin (`App.tsx` must contain the text `useUpdateAnnouncement()`). A pin cannot tell WHERE the
     call is: placed in `App`, whose first effect runs while the splash is still up, it passes and the
     sentence expires unseen — the very bug above. So the real `Shell` is drawn instead, with the real
     `Overlay`, and the claim is checked by what a user would see: the sentence on screen, and the
     marker retired only once it was. */
  it('the drawn shell puts the sentence on screen, and retires the marker only after that', async () => {
    const sentence = 'You’re now on Margin 0.5.0';
    const repo = new MemoryRepository();
    await repo.setKv(APPLIED_VERSION_KEY, 'update-2');
    mockUpdates.updateId = 'update-2';
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await hydrate(repo);
    await flush();
    expect(getState().toast).toBeNull();

    /* What was on screen at the moment the marker was deleted — the ordering IS the claim. */
    const onScreenAtDelete: boolean[] = [];
    const setKv = repo.setKv.bind(repo);
    jest.spyOn(repo, 'setKv').mockImplementation(async (k, v) => {
      if (k === APPLIED_VERSION_KEY && v === null) onScreenAtDelete.push(!!live && text(live).includes(sentence));
      return setKv(k, v);
    });

    const shell = await mount(React.createElement(ThemeProvider, null, React.createElement(Shell)));
    await act(async () => { await flush(); });

    expect(text(shell)).toContain(sentence);
    expect(await repo.getKv(APPLIED_VERSION_KEY)).toBeNull();
    expect(onScreenAtDelete).toEqual([true]);
  });
});

describe('the About row surfaces an update a resume already downloaded', () => {
  it('opens on Update available, and a later no-op check does not take the restart away', async () => {
    /* What a foreground resume does: check says available, fetch downloads it, nothing reloads. */
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: { id: 'update-2' } });
    expect(await checkForUpdate()).toBe('ready');
    expect(updateStaged()).toBe(true);

    /* The row is seeded from that staged download — not from `idle`, which was the bug. */
    const page = await mount(React.createElement(AboutPage));
    expect(text(page)).toContain('Update available');
    expect(button(page, 'Update now (restart)')).toBeDefined();

    /* Tap Check with the OLD bundle still running: the channel says available, the fetch says the
       bundle is already on disk (`isNew: false`). That must stay `ready`, with the button still there. */
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: false });
    await tap(page, 'Check for updates');
    expect(text(page)).toContain('Update available');
    expect(button(page, 'Update now (restart)')).toBeDefined();
    expect(updateStaged()).toBe(true);
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled(); // and nothing restarted by itself
  });
});
