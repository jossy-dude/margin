/**
 * The store's public face. Every importer reads the store through this file and nothing else, so the
 * modules behind it can move without touching a screen:
 *
 *  - `core`        state, `set`, `useStore`, `applySnapshot`, `snapshotOf`
 *  - `persist`     which repository is open (`db`), `R()`, `ensureRepo`, the `persist` write wrapper
 *  - `toast`       the one-line toast and its clock
 *  - `reminders`   the debounced reminder rebuild and the notification log
 *  - `semesters`   the active term, its settings mirror, and the roll-over
 *  - `session`     boot, hydrate, the demo hand-over, import, purge and erase
 *  - `ota`         the update marker's KV binding and the "you're now on…" sentence
 *  - `lifecycle`   app-state and notification listeners
 *  - `actions/*`   navigation, entity writes and the focus timer
 *
 * `act` is assembled here from those modules; inside the store, modules call each other's functions
 * directly rather than going back through `act`.
 */
import { navActions } from './actions/nav';
import { entityActions } from './actions/entities';
import { timerActions } from './actions/timer';
import { sessionActions } from './session';
import { semesterActions } from './semesters';
import './ota'; // binds the OTA marker to the open repository on load

export type { RouteName, SheetSpec, Toast, Moved, PlanInfo, State } from './core';
export { getState, subscribe, set, useStore, snapshotOf } from './core';
export { R, ensureRepo } from './persist';
export { toast, dismissToast } from './toast';
export { useUpdateAnnouncement, resetUpdateAnnouncement } from './ota';
export { refreshNotifLog, stopResync, resync, refreshNotifStatus, notificationAccent } from './reminders';
export { hydrate, boot } from './session';
export { wireLifecycle } from './lifecycle';

/* ───── actions ───── */
export const act = {
  ...navActions,
  ...entityActions,
  ...timerActions,
  ...sessionActions,
  ...semesterActions,
};
