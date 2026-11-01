/**
 * v0.5 N1 — the JS face of `modules/margin-native` is total: off Android, without the module, or when a
 * call throws, every function answers false/null instead of throwing into a render or a lifecycle hook.
 */
import { Platform } from 'react-native';
import * as N from '../services/native';

const mockMod: Record<string, jest.Mock> = {
  sdkInt: jest.fn(() => 36), canPromote: jest.fn(() => true), showLive: jest.fn(() => true), hideLive: jest.fn(() => true),
  wasDismissed: jest.fn(() => false), hasPolicyAccess: jest.fn(() => true), interruptionFilter: jest.fn(() => 1),
  silence: jest.fn(() => true), restore: jest.fn(() => true), openPolicySettings: jest.fn(() => { throw new Error('no settings app'); }),
};
let mockPresent = true;
jest.mock('expo', () => ({ requireOptionalNativeModule: () => (mockPresent ? mockMod : null) }));

const os = (v: string) => Object.defineProperty(Platform, 'OS', { value: v, configurable: true });
beforeEach(() => { N.resetNative(); mockPresent = true; os('android'); });
afterAll(() => os('ios'));

it('on Android with the module, it passes calls through', () => {
  expect(N.nativeAvailable()).toBe(true);
  expect(N.sdkInt()).toBe(36);
  expect(N.canPromote()).toBe(true);
  expect(N.showLive('c1', 'Database', 'LR-601', 123, 'marginalia://today')).toBe(true);
  expect(mockMod.showLive).toHaveBeenCalledWith('c1', 'Database', 'LR-601', 123, 'marginalia://today');
  expect(N.hideLive('c1')).toBe(true);
  expect(N.liveDismissed('c1')).toBe(false);
  expect(N.hasPolicyAccess()).toBe(true);
  expect(N.interruptionFilter()).toBe(1);
  expect(N.silence()).toBe(true);
  expect(N.restoreFilter(1)).toBe(true);
});
it('a call the platform refuses answers false, never throws', () => {
  expect(N.openPolicySettings()).toBe(false);
});
it('without the module (an older build) or off Android, everything is a quiet no', () => {
  mockPresent = false;
  expect(N.nativeAvailable()).toBe(false);
  expect(N.showLive('c1', 't', 'x', 1, 'l')).toBe(false);
  expect(N.interruptionFilter()).toBeNull();
  N.resetNative(); mockPresent = true; os('web');
  expect(N.nativeAvailable()).toBe(false);
  expect(N.silence()).toBe(false);
});
