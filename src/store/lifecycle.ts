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
import { maybeBackup } from './backup';
import { whenIdle } from '../services/idle';
import { widgetTicks } from '../services/native';

/* ───── lifecycle ───── */
const DAY_MS = 86_400_000;
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
  /* v0.8 §2.3: on resume only the clock moves at once, so the first tap after reopening registers. Reminder
     planning (and the widget agenda) and the notification status wait for an idle moment, debounced to 2 s; the
     backup runs when idle; the OTA check never runs on resume (once a day, below). Vault work arrives as native
     events (store/obsidian.ts), never as a read on this thread. */
  let cancelIdle: (() => void) | null = null;
  /* v0.8 §4.3: tasks ticked on the widget while the app was away are marked done here (once each) */
  const applyTicks = () => { for (const id of widgetTicks()) { const t = getState().tasks.find((x) => x.id === id); if (t && t.status !== 2) toggleTask(id); } };
  applyTicks();
  RNAppState.addEventListener('change', (st) => {
    if (st !== 'active') return;
    set({ now: Date.now() });
    applyTicks();
    cancelIdle?.();
    cancelIdle = whenIdle(() => { cancelIdle = null; resync(2000); void refreshNotifStatus(); void maybeBackup(); }, 2500);
  });
  /* v0.7 R12: the weekly backup also gets a chance a little after start, once the planner has loaded; the update
     check runs once a day, a little after start (the native launch check covers the cold start itself) */
  setTimeout(() => whenIdle(() => { void maybeBackup(); }), 8000);
  setTimeout(() => whenIdle(() => { void checkOnForeground(DAY_MS); }), 30_000);
  setInterval(() => whenIdle(() => { void checkOnForeground(DAY_MS); }), DAY_MS / 4);
  notifs.onOpened((o) => dispatchOpened(o, notifEffects()));
  /* v0.7: a widget, the pinned class or an alarm opened the app with a link. Only once the planner is on
     screen — a link that arrives during the introduction is dropped rather than opening a sheet over it. */
  const follow = (url: string | null | undefined) => {
    const to = linkTarget(url), st = getState();
    if (!to || !st.ready) return;
    if (to.t === 'route') set({ route: to.route, prevRoute: st.route, sheet: null });
    else if (to.t === 'add-task') set({ route: 'Tasks', prevRoute: st.route, sheet: { t: 'task' } });
    else set({ sheet: { t: 'settings' }, settingsPath: ['alarms'] });
  };
  try { Linking.addEventListener('url', (e) => follow(e.url)); void Linking.getInitialURL().then(follow).catch(() => undefined); } catch { /* no Linking on this surface */ }
  notifs.onReceived((kind, id, at) => { fx.chime(); if (isPlannedKind(kind)) logNotif(id, kind, at, 'shown', Date.now()); });
}
