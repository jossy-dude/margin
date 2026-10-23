/**
 * `ota.ts` is the only place the app talks about updating itself, and it has to stay TOTAL: a browser
 * build, a build with updates switched off, an offline phone and a publish that fails all have to get
 * an answer instead of an exception thrown in the middle of a render.
 *
 * The module is stubbed rather than imported for real: `expo-updates` is native, and every branch
 * here is a decision the app makes about what the phone told it.
 */
import { Platform } from 'react-native';
import { applyUpdate, checkForUpdate, otaAvailable, versionLine } from '../services/ota';

const mockUpdates = {
  isEnabled: true as boolean | undefined,
  runtimeVersion: '0.3.1' as string | null,
  updateId: null as string | null,
  checkForUpdateAsync: jest.fn<Promise<{ isAvailable: boolean }>, []>(),
  fetchUpdateAsync: jest.fn<Promise<{ isNew: boolean }>, []>(),
  reloadAsync: jest.fn<Promise<void>, []>(),
};

jest.mock('expo-updates', () => mockUpdates);

const realOS = Platform.OS;
/** The browser build has no bundle to swap, and jest's platform is neither web nor a phone. */
const asWeb = (on: boolean) => Object.defineProperty(Platform, 'OS', { value: on ? 'web' : realOS, configurable: true });

beforeEach(() => {
  mockUpdates.isEnabled = true;
  mockUpdates.runtimeVersion = '0.3.1';
  mockUpdates.updateId = null;
  mockUpdates.checkForUpdateAsync.mockReset();
  mockUpdates.fetchUpdateAsync.mockReset();
  mockUpdates.reloadAsync.mockReset();
});

afterEach(() => asWeb(false));

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
});

describe('the About line names what is actually running', () => {
  it('says `built in` when no update was published after the build', () => {
    expect(versionLine()).toBe('Margin 0.3.1 · runtime 0.3.1 · built in');
  });

  it('shows the update id, shortened, when one is in use', () => {
    mockUpdates.updateId = '3f9a1c2e-0000-4000-8000-000000000000';
    expect(versionLine()).toBe('Margin 0.3.1 · runtime 0.3.1 · update 3f9a1c2e');
  });

  it('names the runtime it was built against', () => {
    mockUpdates.runtimeVersion = '0.3.2';
    expect(versionLine()).toBe('Margin 0.3.1 · runtime 0.3.2 · built in');
  });

  it('prints the plain version on web', () => {
    asWeb(true);
    expect(versionLine()).toBe('Margin 0.3.1');
  });
});
