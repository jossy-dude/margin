import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toNavigator, toStore } from '../navigation/sync';
import { act, getState, set } from '../store/store';
import type { RouteName } from '../store/store';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0 }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

const ROUTES: RouteName[] = ['Today', 'Week', 'Tasks', 'Grades', 'Stats', 'Focus'];

/** BookView as the two routes it holds: `store` is `s.route`, `cur` is `state.routes[state.index].name`.
 *  `commit` runs one render's effects in declaration order, each only when ITS OWN key changed — that
 *  keying is what stops the two syncs from fighting, so it is modelled rather than assumed. */
interface Pair { store: RouteName; cur: RouteName }
function commit(route: RouteName, cur: RouteName, prev: Pair): Pair {
  let store = route, nav = cur;
  if (route !== prev.store) { const n = toNavigator(route, cur); if (n) nav = n; }
  if (cur !== prev.cur) { const s = toStore(route, cur); if (s) store = s; }
  return { store, cur: nav };
}
/** `act.go(t)` writes the store; the store→navigator effect then moves the navigator on the next commit. */
const tapTab = (p: Pair, to: RouteName): Pair => (to === p.store ? p : commit(to, p.cur, p));
/** Android BACK: `TabRouter`'s default `backBehavior` is `'firstRoute'`, so it pops to Today. */
const hardwareBack = (p: Pair): Pair => (p.cur === 'Today' ? p : commit(p.store, 'Today', p));
/** Any later commit, e.g. the store write the reverse sync made landing. */
const settled = (p: Pair): Pair => commit(p.store, p.cur, p);

describe('book nav: the store and the navigator cannot disagree (BUG-021)', () => {
  it('reproduces the shipped defect, so the model below is not asserting a fiction', () => {
    // Book.tsx as shipped had the store→navigator effect only, keyed on the store.
    const shipped = (route: RouteName, cur: RouteName, prev: Pair): Pair => {
      let store = route, nav = cur;
      if (route !== prev.store) { const n = toNavigator(route, cur); if (n) nav = n; }
      return { store, cur: nav };
    };
    const tapped = shipped('Grades', 'Today', { store: 'Today', cur: 'Today' });
    expect(tapped).toEqual({ store: 'Grades', cur: 'Grades' }); // a tab tap worked
    const afterBack = shipped('Grades', 'Today', tapped); // Android BACK popped the navigator; the store never followed
    expect(afterBack).toEqual({ store: 'Grades', cur: 'Today' }); // the nav highlights a route the app is not on
    expect(shipped('Grades', 'Today', afterBack)).toEqual(afterBack); // and tapping it moves nothing: act.go early-returns
  });

  it('why the dead tab needs the reverse sync: act.go is a no-op on the route it already holds', () => {
    set({ route: 'Grades' }); // the store still says Grades, as after a tab tap
    act.go('Grades'); // tapping the tab the nav is wrongly highlighting
    expect(getState().route).toBe('Grades'); // unchanged, so the store→navigator effect's dep never changes
  });

  it('hardware BACK from a tab settles on Today in both routes, not one', () => {
    for (const from of ['Grades', 'Tasks', 'Stats', 'Week'] as RouteName[]) {
      const tapped = settled(tapTab(settled({ store: 'Today', cur: 'Today' }), from));
      const after = settled(hardwareBack(tapped));
      expect({ from, ...after }).toEqual({ from, store: 'Today', cur: 'Today' });
    }
  });

  it('a hardware BACK is recoverable: the tab that was wrongly highlighted selects again', () => {
    const after = settled(hardwareBack(settled(tapTab({ store: 'Today', cur: 'Today' }, 'Grades'))));
    expect(after).toEqual({ store: 'Today', cur: 'Today' }); // the nav is honest again
    expect(settled(tapTab(after, 'Grades'))).toEqual({ store: 'Grades', cur: 'Grades' }); // and it is not dead
  });

  it('no hop sequence leaves the two disagreeing, and no tab is ever unselectable', () => {
    let p: Pair = { store: 'Today', cur: 'Today' }, seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 300; i++) {
      p = settled(rnd() < 0.25 ? hardwareBack(p) : tapTab(p, ROUTES[Math.floor(rnd() * ROUTES.length)]!));
      expect(p.store).toBe(p.cur); // the highlighted tab is always the one on top
      for (const t of ROUTES) if (t !== p.cur) expect(settled(tapTab(p, t)).cur).toBe(t); // every other tab still selects
    }
  });

  it('the Focus route hides the nav and BACK brings it back, in both routes', () => {
    const onFocus = settled(tapTab({ store: 'Today', cur: 'Today' }, 'Focus'));
    expect(onFocus).toEqual({ store: 'Focus', cur: 'Focus' });
    const back = settled(hardwareBack(onFocus));
    expect(back).toEqual({ store: 'Today', cur: 'Today' });
    expect(settled(tapTab(back, 'Focus'))).toEqual({ store: 'Focus', cur: 'Focus' });
  });
});

describe('Book.tsx wiring — the model above cannot see the file', () => {
  const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
  const lineWith = (needle: string) => src.split('\n').find((l) => l.includes(needle)) ?? '';
  it('the nav highlight reads the navigator, not the store', () => {
    expect(src).toContain('cur === t.name');
    expect(src).not.toContain('route === t.name');
    expect(lineWith('hideNav')).toContain('cur ===');
  });
  it('both syncs are effects keyed on their own side', () => {
    expect(lineWith('toNavigator(')).toContain('useEffect(');
    expect(lineWith('toStore(')).toContain('useEffect(');
    expect(lineWith('toStore(')).toContain('}, [cur])');
  });
  it('every visited page is still kept mounted by the mount window', () => {
    expect(src).toContain('inMountWindow(visited, counter.current, r.name)');
  });
});