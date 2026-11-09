import { AppState as RNAppState, Linking } from 'react-native';
import type { AttStatus, AttWhy } from '../domain/types';
import { dispatchOpened, isPlannedKind } from '../domain/notifActions';
import { linkTarget } from '../domain/links';
import { fx } from '../services/fx';
import * as notifs from '../services/notifications';
import { checkOnForeground } from '../services/ota';
import { getState, set } from './core';
import { logNotif, refreshNotifStatus, resync } from './reminders';
import { toast } from './toast';
import { setAtt, toggleTask } from './actions/entities';

/* ───── lifecycle ───── */
let wired = false;
/** The real effect object `dispatchOpened` writes through. Built per response, not once: it reads live
 *  task and meeting state, so a notification left in the shade cannot resurrect a deleted row. */
const notifEffects = () => {
  const s = getState();
  return {
    tasks: s.tasks, meetings: s.meetings,
    setAtt: (key: string, status: AttStatus, why: AttWhy) => setAtt(key, status, '', why),
    toggleTask: (id: string) => toggleTask(id),
    toast: (text: string) => toast(text),
    go: (route: 'Today' | 'Tasks') => set({ route }),
    log: (id: string, kind: string, at: number) => { if (isPlannedKind(kind)) logNotif(id, kind, at, 'opened', Date.now()); },
  };
};
export function wireLifecycle() {
  if (wired) return; wired = true;
  RNAppState.addEventListener('change', (st) => { if (st === 'active') { set({ now: Date.now() }); resync(400); void refreshNotifStatus(); void checkOnForeground(); } });
  notifs.onOpened((o) => dispatchOpened(o, notifEffects()));
  /* v0.7: a widget, the pinned class or an alarm opened the app with a link. Only once the planner is on
     screen — a link that arrives during the introduction is dropped rather than opening a sheet over it. */
  const follow = (url: string | null) => {
    const to = linkTarget(url), st = getState();
    if (!to || !st.ready) return;
    if (to.t === 'route') set({ route: to.route, prevRoute: st.route, sheet: null });
    else if (to.t === 'add-task') set({ route: 'Tasks', prevRoute: st.route, sheet: { t: 'task' } });
    else set({ sheet: { t: 'settings' }, settingsPath: ['alarms'] });
  };
  try { Linking.addEventListener('url', (e) => follow(e.url)); void Linking.getInitialURL().then(follow).catch(() => undefined); } catch { /* no Linking on this surface */ }
  notifs.onReceived((kind, id, at) => { fx.chime(); if (isPlannedKind(kind)) logNotif(id, kind, at, 'shown', Date.now()); });
}
