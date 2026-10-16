import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toNavigator, toStore } from '../navigation/sync';
import { act, getState, set } from '../store/store';
import type { RouteName } from '../store/store';

jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

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
/** A tab tap writes the store and moves the navigator in the SAME event (Book.tsx `onPressIn`), so React
 *  batches both into one render: the model's tap needs no `commit` at all — no sync effect runs for it. */
const tapTab = (p: Pair, to: RouteName): Pair => (to === p.store ? p : { store: to, cur: to });
/** A store-only navigation — the focus entry, a notification opening a route — still crosses the
 *  forward sync, so it is modelled as before: `act.go` writes, the `[route]` effect moves the navigator. */
const storeOnlyHop = (p: Pair, to: RouteName): Pair => (to === p.store ? p : commit(to, p.cur, p));
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

  it('a store-only navigation (focus entry, notification) still crosses the forward sync', () => {
    const onFocus = settled(storeOnlyHop(settled({ store: 'Today', cur: 'Today' }), 'Focus'));
    expect(onFocus).toEqual({ store: 'Focus', cur: 'Focus' });
    expect(settled(hardwareBack(onFocus))).toEqual({ store: 'Today', cur: 'Today' });
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
  it('both syncs are keyed on their own side, and run before the paint', () => {
    // Keyed: forward on `[route]`, reverse on `[cur]` — that keying is what suppressions.test (BUG-017)
    // audits, and it is unchanged. LAYOUT effects, not passive ones: for the navigation a tap no longer
    // performs itself (store-only entries forward, Android BACK reverse) a passive effect waits for the
    // frame to be painted and for the JS thread to go idle, so the store and the navigator disagreed
    // across a whole painted frame. A layout effect flushes its own setState before paint.
    expect(lineWith('toNavigator(')).toContain('useLayoutEffect(');
    expect(lineWith('toStore(')).toContain('useLayoutEffect(');
    expect(lineWith('toStore(')).toContain('}, [cur])');
    expect(src).not.toContain('useEffect('); // nothing in the navigator waits for paint any more
  });
  it('a tab tap writes the store and moves the navigator in one event, so one render sees both', () => {
    // Both calls sit in the same `onPressIn` handler: React batches them, so the single render they
    // produce already has `route === cur` — no sync effect runs, no second round-trip before the pass
    // that moves the page and arms the placement. Two separate statements (effect-driven navigate) is
    // the two-pass flow this replaced. `onPressIn` rather than `onPress` is the same-file reason in
    // `Book.tsx`: `onPress` fires on LIFT, so the whole chain sat behind the user's own hold time.
    const line = lineWith('act.go(t.name)');
    expect(line).toContain('navigation.navigate(');
    expect(line).toContain('onPressIn=');
    expect(src).not.toContain('onPress={() => { act.go');
    expect(src).not.toMatch(/onPress=\{\(\) => act\.go/);
  });
  it('the page a tap lands on is already mounted, so that one render is also the whole cost', () => {
    // The window and its render-phase visit stamps are deleted: every route mounts on BookView's first
    // render, so the batched tap render never pays a cold mount — the mount cost moved to the splash.
    // This file used to assert the stamp's render-phase update here; the property it was protecting
    // (mount and placement armed in the navigator's own commit) is now unconditional rather than
    // bookkept, and `nav-window.test.ts` asserts the mount-all side.
    expect(src).not.toContain('setVisited');
    expect(src).not.toContain('inMountWindow');
    expect(src).toContain('state.routes.map((r, i) => (<Placed key={r.key}');
  });
});