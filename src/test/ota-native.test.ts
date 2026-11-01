/**
 * v0.5 D5 — the update row reads expo-updates' own state (`useUpdates()`), not only what a tap asked.
 * The cases that motivated it: the native launch check downloads an update before any JS runs, so About
 * must open on "ready" with its restart button, and the launch that applies it must be announced — which
 * needs the marker written for a download no JS fetch made.
 */
import { applyUpdate, otaView, resetOtaState } from '../services/ota';

const mockReload = jest.fn(async () => {});
jest.mock('expo-updates', () => ({ isEnabled: true, updateId: null, runtimeVersion: '0.5.0', checkForUpdateAsync: async () => ({ isAvailable: false }), fetchUpdateAsync: async () => ({ isNew: false }), reloadAsync: () => mockReload() }));

beforeEach(() => { resetOtaState(); mockReload.mockClear(); });

describe('otaView: one word from the native state and this page\'s own check', () => {
  it('a download the launch check staged reads as ready, whatever the page asked', () => {
    expect(otaView({ isUpdatePending: true, downloadedUpdate: { updateId: 'u2' } }, 'idle')).toBe('ready');
    expect(otaView({ isUpdatePending: true }, 'current')).toBe('ready');
  });
  it('checking and downloading come from either side', () => {
    expect(otaView({ isChecking: true }, 'idle')).toBe('checking');
    expect(otaView({}, 'checking')).toBe('checking');
    expect(otaView({ isDownloading: true }, 'idle')).toBe('downloading');
  });
  it('an error from either side is said as one, and a finished check with nothing new is current', () => {
    expect(otaView({ checkError: new Error('offline') }, 'idle')).toBe('error');
    expect(otaView({}, 'error')).toBe('error');
    expect(otaView({ lastCheckForUpdateTimeSinceRestart: new Date(), isUpdateAvailable: false }, 'idle')).toBe('current');
    expect(otaView({}, 'idle')).toBe('idle');
  });
  it('with no native state (web, updates off) the page\'s own answer stands', () => {
    expect(otaView(null, 'unavailable')).toBe('unavailable');
    expect(otaView(null, 'idle')).toBe('idle');
  });
});

describe('applyUpdate', () => {
  it('reloads into a natively staged update when the page says it is staged', async () => {
    await applyUpdate(true);
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
  it('never reloads when nothing is staged anywhere', async () => {
    await applyUpdate();
    expect(mockReload).not.toHaveBeenCalled();
  });
});
