/**
 * W1/M5 — the ticker's frozen mode.
 *
 * `useNow(0)` has to mean "no timer is armed", and it has to mean "and yet, the moment this page
 * becomes the one on screen, show true time" — otherwise a hidden page would come back showing the
 * clock from when it was hidden. Both halves are about timers, so both are asserted with fake ones;
 * no rendering test can see the difference between one minute and none.
 */
import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useNow } from '../ui/theme-context';

jest.mock('../ui/crashlog', () => ({ recordCrash: jest.fn(() => null) }));
jest.mock('../data/sqliteExpo', () => ({ openRepository: async () => { throw new Error('the database is not used in this test'); } }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));

/** On a minute boundary, so "the tick landed on the wall-clock minute" is exact rather than ±1 tick. */
const NOW = new Date(2026, 9, 5, 8, 0, 0, 0).getTime();
const Probe = ({ ms }: { ms: number }) => React.createElement(Text, null, String(useNow(ms)));

let live: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => { jest.useFakeTimers({ now: NOW }); });
afterEach(() => { act(() => { live?.unmount(); }); live = undefined; jest.useRealTimers(); });

const render = (ms: number) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => { r = TestRenderer.create(React.createElement(Probe, { ms })); });
  live = r;
  return r;
};
/** Every string in the tree, joined — the number the page is showing. */
function leaves(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(leaves).join('');
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? kids.map(leaves).join('') : '';
}
const shown = (r: TestRenderer.ReactTestRenderer) => leaves(r.toJSON());

describe('useNow(0) is frozen, and useNow(60_000) is not (audit M5)', () => {
  it('a frozen clock arms no timer at all, so a hidden page costs no wake-up', () => {
    const r = render(0);
    expect(shown(r)).toBe(String(NOW));
    expect(jest.getTimerCount()).toBe(0); // the whole claim: nothing is scheduled
    act(() => { jest.advanceTimersByTime(10 * 60_000); }); // ten minutes hidden
    expect(shown(r)).toBe(String(NOW)); // …and it did not re-render once
    expect(jest.getTimerCount()).toBe(0);
  });

  it('a 60 s cadence still ticks, and lands on the wall-clock minute', () => {
    const r = render(60_000);
    expect(jest.getTimerCount()).toBe(1); // the effect's immediate first fire
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(shown(r)).toBe(String(NOW + 60_000));
    expect(Number(shown(r))).toBe(Date.now());
  });

  it('a page that becomes live gets true time in the same effect, never the moment it was hidden', () => {
    const r = render(0);
    act(() => { jest.setSystemTime(NOW + 10 * 60_000); }); // ten minutes pass while it is hidden
    expect(shown(r)).toBe(String(NOW)); // frozen, as designed

    act(() => { r.update(React.createElement(Probe, { ms: 60_000 })); }); // focus flips: this is the ms change
    act(() => { jest.advanceTimersByTime(0); }); // flush the effect's `setTimeout(tick, 0)`
    expect(shown(r)).toBe(String(NOW + 10 * 60_000)); // true time, not the stale mount value
    expect(jest.getTimerCount()).toBe(1); // and now it is on the live cadence
  });
});
