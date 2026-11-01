/**
 * `ota.ts` is the only place the app talks about updating itself, and it has to stay TOTAL: a browser
 * build, a build with updates switched off, an offline phone and a publish that fails all have to get
 * an answer instead of an exception thrown in the middle of a render.
 *
 * The module is stubbed rather than imported for real: `expo-updates` is native, and every branch
 * here is a decision the app makes about what the phone told it.
 */
import { Platform } from 'react-native';
import {
  APPLIED_VERSION_KEY, announceAppliedUpdate, applyUpdate, bindOtaKv, checkForUpdate, checkOnForeground,
  consumeAppliedUpdate, otaAvailable, resetOtaState, updateStaged, versionLine, type OtaKv,
} from '../services/ota';

const mockUpdates = {
  isEnabled: true as boolean | undefined,
  runtimeVersion: '0.3.1' as string | null,
  updateId: null as string | null,
  checkForUpdateAsync: jest.fn<Promise<{ isAvailable: boolean }>, []>(),
  fetchUpdateAsync: jest.fn<Promise<{ isNew: boolean; manifest?: { id?: string } }>, []>(),
  reloadAsync: jest.fn<Promise<void>, []>(),
};

jest.mock('expo-updates', () => mockUpdates);

const realOS = Platform.OS;
/** The browser build has no bundle to swap, and jest's platform is neither web nor a phone. */
const asWeb = (on: boolean) => Object.defineProperty(Platform, 'OS', { value: on ? 'web' : realOS, configurable: true });

/* The app's key-value store, in a Map: the loop's marker lives in the `setting` table on a phone, and
   every assertion here is about WHEN it is written and WHEN it is consumed, not about SQL. */
const kvStore = new Map<string, string>();
const fakeKv: OtaKv = {
  get: async (k) => kvStore.get(k) ?? null,
  set: async (k, v) => { if (v === null) kvStore.delete(k); else kvStore.set(k, v); },
};

beforeEach(() => {
  mockUpdates.isEnabled = true;
  mockUpdates.runtimeVersion = '0.3.1';
  mockUpdates.updateId = null;
  mockUpdates.checkForUpdateAsync.mockReset();
  mockUpdates.fetchUpdateAsync.mockReset();
  mockUpdates.reloadAsync.mockReset();
  kvStore.clear();
  bindOtaKv(fakeKv);
  resetOtaState();
});

afterEach(() => { asWeb(false); bindOtaKv(null); });

describe('whether this build can update itself at all', () => {
  it('is yes when the native module is present and enabled', () => {
    expect(otaAvailable()).toBe(true);
  });

  it('is no when the build has updates switched off', () => {
    mockUpdates.isEnabled = false;
    expect(otaAvailable()).toBe(false);
  });

  it('is no on web, where there is no bundle to replace', () => {
    asWeb(true);
    expect(otaAvailable()).toBe(false);
  });
});

describe('one check, four honest answers', () => {
  it('says `current` when the channel has nothing newer', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    expect(await checkForUpdate()).toBe('current');
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
  });

  it('says `ready` only once the download landed', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    expect(await checkForUpdate()).toBe('ready');
  });

  it('says `current` when the publish turned out to be the bundle already running', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: false });
    expect(await checkForUpdate()).toBe('current');
  });

  it('says `error` rather than throwing when the network or the service fails', async () => {
    mockUpdates.checkForUpdateAsync.mockRejectedValue(new Error('offline'));
    await expect(checkForUpdate()).resolves.toBe('error');
  });

  it('says `unavailable` without a round-trip when updating is off', async () => {
    mockUpdates.isEnabled = false;
    expect(await checkForUpdate()).toBe('unavailable');
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('says `unavailable` on web without a round-trip', async () => {
    asWeb(true);
    expect(await checkForUpdate()).toBe('unavailable');
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
  });
});

describe('reloading is the user’s tap, never the app’s', () => {
  /** The state `applyUpdate` reads is "this session downloaded something"; every test establishes it
   *  through `checkForUpdate`, which is the only thing that can set it. */
  const nothing = async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkForUpdate();
  };
  const ready = async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    await checkForUpdate();
  };

  it('does not reload when the last check found nothing', async () => {
    await nothing();
    await applyUpdate();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
  });

  it('reloads only once a check has actually downloaded an update', async () => {
    await ready();
    mockUpdates.reloadAsync.mockResolvedValue();
    await applyUpdate();
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does not reload into the same bundle when the publish was not new', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: false });
    await checkForUpdate();
    await applyUpdate();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
  });

  it('leaves the app running when the platform refuses the reload', async () => {
    await ready();
    mockUpdates.reloadAsync.mockRejectedValue(new Error('nope'));
    await expect(applyUpdate()).resolves.toBeUndefined();
  });

  it('does not even ask on web', async () => {
    await ready();
    asWeb(true);
    await applyUpdate();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
  });

  /* The restart is downstream of a completed download, so a publish the phone could not fetch must
     leave the app exactly where it was — no reload into a bundle nobody has. */
  it('does not restart when the download failed', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockRejectedValue(new Error('offline'));
    expect(await checkForUpdate()).toBe('error');
    await applyUpdate();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
  });

  /* I2. A resume check can download an update silently. A later Check from About still sees the old
     bundle running, so the channel says "available" and the fetch answers `isNew: false` — nothing
     new to download, because the new bundle is already on disk. The old `pending = fetched.isNew`
     erased that download there: the page printed "newest version" and the restart gate shut, with the
     update sitting unapplied. A staged download has to stay staged. */
  it('keeps a staged download staged, and restartable, across a later check', async () => {
    await ready(); // exactly what a foreground check does: download, never reload
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: false });
    expect(await checkForUpdate()).toBe('ready');
    expect(updateStaged()).toBe(true);
    mockUpdates.reloadAsync.mockResolvedValue();
    await applyUpdate();
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  /* …and the same truth when the channel has nothing at all to say: the bundle is already downloaded,
     so "ready" is the honest answer and the About row must not claim to be current. */
  it('still reports `ready` when the channel has nothing new but a download is staged', async () => {
    await ready();
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    expect(await checkForUpdate()).toBe('ready');
    expect(updateStaged()).toBe(true);
  });
});

/**
 * v0.9 WS4: the check that runs by itself when the app comes back to the foreground.
 *
 * It has to be cheap (one round-trip per five minutes, not one per resume), total (every answer the
 * manual check gives is still an answer, plus the throttled no-op) and quiet (it never throws at the
 * call site, because the caller is a lifecycle listener, not a screen with a catch).
 */
describe('checking on the way back into the app', () => {
  const NOW = 1_000_000;
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(NOW); });
  afterEach(() => { jest.useRealTimers(); });

  it('does one real check per throttle window', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    expect(await checkOnForeground()).toBe('current');
    expect(await checkOnForeground()).toBe('throttled');
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('defaults to the five-minute window the design pins', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkOnForeground();
    jest.setSystemTime(NOW + 300_000 - 1);
    expect(await checkOnForeground()).toBe('throttled');
    jest.setSystemTime(NOW + 300_000);
    expect(await checkOnForeground()).toBe('current');
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });

  it('honours a caller-supplied window', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkOnForeground(60_000);
    jest.setSystemTime(NOW + 59_999);
    expect(await checkOnForeground(60_000)).toBe('throttled');
    jest.setSystemTime(NOW + 60_000);
    expect(await checkOnForeground(60_000)).toBe('current');
  });

  it('reports `current` when the channel has nothing newer', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    expect(await checkOnForeground(0)).toBe('current');
  });

  it('reports `ready` once the silent download landed', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
    expect(await checkOnForeground(0)).toBe('ready');
  });

  it('reports `error` rather than throwing when the network fails', async () => {
    mockUpdates.checkForUpdateAsync.mockRejectedValue(new Error('offline'));
    await expect(checkOnForeground(0)).resolves.toBe('error');
  });

  it('reports `unavailable` on web without a round-trip', async () => {
    asWeb(true);
    expect(await checkOnForeground(0)).toBe('unavailable');
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  it('reports `unavailable` when the build has updates switched off', async () => {
    mockUpdates.isEnabled = false;
    expect(await checkOnForeground(0)).toBe('unavailable');
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled();
  });

  /* A resume while the previous check is still in flight must not start a second one: the timestamp
     is written BEFORE the await for exactly this case. */
  it('does not start a second check while the first is still running', async () => {
    let land: (v: { isAvailable: boolean }) => void = () => undefined;
    mockUpdates.checkForUpdateAsync.mockReturnValue(new Promise((r) => { land = r; }));
    const first = checkOnForeground();
    expect(await checkOnForeground()).toBe('throttled');
    land({ isAvailable: false });
    expect(await first).toBe('current');
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1);
  });

  /* A phone whose clock is put back a day (timezone fix, manual change, NTP correction) made `now -
     lastCheckAt` negative, which is "inside the window" and throttled the app for a day. A negative
     step is not a window at all: check, and take the new time as the new floor. */
  it('does not let a backward clock step pin the throttle shut', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkOnForeground();
    jest.setSystemTime(NOW - 86_400_000);
    expect(await checkOnForeground()).toBe('current');
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(2);
  });
});

/**
 * v0.9 WS4: the sentence that proves the update actually landed.
 *
 * `expo-updates` cannot report the version of a bundle that is not running yet, so the marker records
 * the one identity a downloaded update already has — its update id — and the next launch compares it
 * with the id of the bundle that is now running. A relaunch into the same old bundle (a reload the
 * platform refused, an emergency launch) must NOT announce anything. Reading the marker does not
 * consume it: the caller deletes it only after the sentence has actually been shown, so a launch that
 * could not render the toast retries next time instead of losing the news.
 */
describe('the update that was applied says so, once', () => {
  /** Download an update the way the About row does, then leave its id in the KV. */
  const downloaded = async (id = 'update-2') => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockResolvedValue({ isNew: true, manifest: { id } });
    await checkForUpdate();
  };

  it('records the applied update only after the download landed', async () => {
    await downloaded();
    expect(kvStore.get(APPLIED_VERSION_KEY)).toBe('update-2');
  });

  it('records nothing when the channel had nothing newer', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    await checkForUpdate();
    expect(kvStore.has(APPLIED_VERSION_KEY)).toBe(false);
  });

  it('records nothing when the download failed', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
    mockUpdates.fetchUpdateAsync.mockRejectedValue(new Error('offline'));
    await checkForUpdate();
    expect(kvStore.has(APPLIED_VERSION_KEY)).toBe(false);
  });

  /* The sentence is read WITHOUT consuming the marker, so a toast that never renders (the shell not
     mounted yet, a crash before the overlay) can be retried on the next launch instead of being lost
     forever. Deletion is a separate act the caller performs only after `toast()` has been called. */
  it('reads the sentence without consuming the marker, and consumes it only on request', async () => {
    await downloaded();
    mockUpdates.updateId = 'update-2';
    expect(await announceAppliedUpdate()).toBe('You’re now on Margin 0.5.0');
    expect(kvStore.get(APPLIED_VERSION_KEY)).toBe('update-2'); // still there: readable again
    expect(await announceAppliedUpdate()).toBe('You’re now on Margin 0.5.0');
    await consumeAppliedUpdate();
    expect(kvStore.has(APPLIED_VERSION_KEY)).toBe(false);
    expect(await announceAppliedUpdate()).toBeNull();
  });

  it('says nothing while the bundle that applied it is not the one running', async () => {
    await downloaded();
    mockUpdates.updateId = null;
    expect(await announceAppliedUpdate()).toBeNull();
    expect(kvStore.get(APPLIED_VERSION_KEY)).toBe('update-2');
  });

  it('says nothing on a launch with no update waiting to be announced', async () => {
    mockUpdates.updateId = 'update-2';
    expect(await announceAppliedUpdate()).toBeNull();
  });

  it('says nothing on web', async () => {
    await downloaded();
    mockUpdates.updateId = 'update-2';
    asWeb(true);
    expect(await announceAppliedUpdate()).toBeNull();
  });

  it('keeps the marker rather than losing the announcement when the KV cannot be written', async () => {
    await downloaded();
    mockUpdates.updateId = 'update-2';
    const readOnly: OtaKv = { get: fakeKv.get, set: async () => { throw new Error('disk full'); } };
    bindOtaKv(readOnly);
    expect(await announceAppliedUpdate()).toBe('You’re now on Margin 0.5.0');
    await expect(consumeAppliedUpdate()).resolves.toBeUndefined(); // a failed delete repeats, never throws
    expect(kvStore.get(APPLIED_VERSION_KEY)).toBe('update-2'); // the REAL store still holds it
  });
});

describe('the About line names what is actually running', () => {
  it('says `built in` when no update was published after the build', () => {
    expect(versionLine()).toBe('Margin 0.5.0 · runtime 0.3.1 · built in');
  });

  it('shows the update id, shortened, when one is in use', () => {
    mockUpdates.updateId = '3f9a1c2e-0000-4000-8000-000000000000';
    expect(versionLine()).toBe('Margin 0.5.0 · runtime 0.3.1 · update 3f9a1c2e');
  });

  it('names the runtime it was built against', () => {
    mockUpdates.runtimeVersion = '0.3.2';
    expect(versionLine()).toBe('Margin 0.5.0 · runtime 0.3.2 · built in');
  });

  it('prints the plain version on web', () => {
    asWeb(true);
    expect(versionLine()).toBe('Margin 0.5.0');
  });
});
