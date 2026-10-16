import type { RouteName } from '../store/store';

/** The store's route and the navigator's route can disagree in two directions, and each sync has to
 *  be keyed on the side that moved or they fight: `act.go` moves the store first (the focus entry, a
 *  notification opening a route), while
 *  Android BACK pops `TabRouter`'s own history and moves the navigator first. Both return null once
 *  the two agree, so the effect they sit in does nothing and neither side is touched. */

/** store → navigator. Runs when `s.route` changed. A nav-bar tap never reaches it — Book.tsx's
 *  `onPress` moves both sides in one event — it exists for store-only navigation: the focus entry
 *  (`act.go('Focus')`), a notification opening a route. */
export const toNavigator = (store: RouteName, cur: RouteName | undefined) => (cur !== undefined && cur !== store ? store : null);

/** navigator → store. Runs when the navigator's route changed, i.e. on a hardware BACK. */
export const toStore = (store: RouteName, cur: RouteName | undefined) => (cur !== undefined && cur !== store ? cur : null);