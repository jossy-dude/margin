import { focusLive } from '../domain/focusLive';
import { initTimer, toggle } from '../domain/timer';

const T0 = new Date(2026, 10, 20, 9, 0).getTime();
describe('the focus countdown on the lock screen', () => {
  it('a running round counts down to its end', () => {
    const t = toggle({ ...initTimer({ planMin: 25 }), title: 'Joins' }, T0).state;
    expect(focusLive(t, T0 + 60_000, null, false)).toMatchObject({ title: 'Focus · Joins', text: 'Ends at 09:25', endAt: T0 + 25 * 60_000 });
  });
  it('nothing while set or paused', () => {
    const t = initTimer({ planMin: 25 });
    expect(focusLive(t, T0, null, false)).toBeNull();
    const run = toggle(t, T0).state, paused = toggle(run, T0 + 60_000).state;
    expect(focusLive(paused, T0 + 120_000, null, false)).toBeNull();
  });
});
