import { AppState as RNAppState } from 'react-native';
import type { AttStatus } from '../domain/types';
import { dispatchOpened, isPlannedKind } from '../domain/notifActions';
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
    setAtt: (key: string, status: AttStatus) => setAtt(key, status),
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
  notifs.onReceived((kind, id, at) => { fx.chime(); if (isPlannedKind(kind)) logNotif(id, kind, at, 'shown', Date.now()); });
}
