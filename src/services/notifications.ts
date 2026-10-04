import { Platform } from 'react-native';
import * as N from './notifApi';
import type { Plan, Planned } from '../domain/reminders';

export type Route = 'Today' | 'Tasks';
export interface NotifStatus { permission: 'granted' | 'denied' | 'undetermined' | 'unavailable'; scheduled: number; next: number | null; canAskAgain: boolean; platform: string }
const CH = { classes: 'classes', tasks: 'tasks', focus: 'focus' } as const;

let configured = false;
export async function configureNotifications() {
  if (configured) return; configured = true;
  try {
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CH.classes, { name: 'Classes', description: 'Class starting soon and class ended', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 180, 90, 180], enableVibrate: true });
      await N.setNotificationChannelAsync(CH.tasks, { name: 'Tasks & exams', description: 'Task, exam and start-by reminders', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 250, 120, 250], enableVibrate: true });
      await N.setNotificationChannelAsync(CH.focus, { name: 'Focus timer', description: 'Round and break finished', importance: N.AndroidImportance.DEFAULT, vibrationPattern: [0, 120, 80, 120, 80, 120] });
    }
  } catch { /* Expo Go can lack parts of the module; local scheduling is probed separately */ }
}
export async function ensurePermission(ask = true): Promise<NotifStatus['permission']> {
  try {
    let p = await N.getPermissionsAsync();
    if (p.status !== 'granted' && ask && p.canAskAgain) p = await N.requestPermissionsAsync();
    return p.status === 'granted' ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
  } catch { return 'unavailable'; }
}
export async function status(): Promise<NotifStatus> {
  const permission = await ensurePermission(false);
  let scheduled = 0, next: number | null = null, canAskAgain = true;
  try { const all = await N.getAllScheduledNotificationsAsync(); scheduled = all.length; const ts = all.map((x) => (x.trigger && 'value' in x.trigger && typeof x.trigger.value === 'number' ? x.trigger.value : (x.trigger as { date?: number } | null)?.date ?? 0)).filter(Boolean); next = ts.length ? Math.min(...ts) : null; canAskAgain = (await N.getPermissionsAsync()).canAskAgain; } catch { /* unavailable */ }
  return { permission, scheduled, next, canAskAgain, platform: Platform.OS };
}
const content = (p: Planned, accent: string) => ({ title: p.title, body: p.body, data: { route: p.route, entityId: p.entityId, kind: p.kind, planned: p.id }, color: accent });
/** Make the OS queue equal the plan. Ids encode entity+minute, so unchanged items are left alone (no flicker, no duplicates). */
export async function sync(plan: Plan, accent: string): Promise<{ added: number; removed: number }> {
  let added = 0, removed = 0;
  try {
    const have = (await N.getAllScheduledNotificationsAsync()).filter((x) => x.identifier !== 'focus-end' && x.identifier !== 'test'), want = new Map(plan.items.map((p) => [p.id, p]));
    for (const h of have) if (!want.has(h.identifier)) { await N.cancelScheduledNotificationAsync(h.identifier); removed++; }
    const haveIds = new Set(have.map((h) => h.identifier));
    for (const p of plan.items) if (!haveIds.has(p.id)) { await N.scheduleNotificationAsync({ identifier: p.id, content: content(p, accent), trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: CH[p.channel] } }); added++; }
  } catch { /* permission missing or module unavailable: surfaced by status() */ }
  return { added, removed };
}
export async function cancelAll() { try { await N.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ } }
export async function scheduleFocusEnd(at: number, title: string, body: string) {
  try { await N.cancelScheduledNotificationAsync('focus-end'); if (at > Date.now() + 1500) await N.scheduleNotificationAsync({ identifier: 'focus-end', content: { title, body, data: { route: 'Today', kind: 'focus' } }, trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CH.focus } }); } catch { /* ignore */ }
}
export async function cancelFocusEnd() { try { await N.cancelScheduledNotificationAsync('focus-end'); } catch { /* ignore */ } }
export async function sendTest(seconds = 10) {
  try { await N.cancelScheduledNotificationAsync('test'); await N.scheduleNotificationAsync({ identifier: 'test', content: { title: 'Marginalia test', body: 'If you can read this, reminders reach you.' }, trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CH.tasks } }); return true; } catch { return false; }
}
export function onReceived(cb: (kind: string, id: string) => void) {
  try { const s = N.addNotificationReceivedListener((n) => cb(String(n.request.content.data?.kind ?? ''), String(n.request.content.data?.planned ?? n.request.identifier))); return () => s.remove(); } catch { return () => undefined; }
}
export function onOpened(cb: (route: Route, kind: string, id: string) => void) {
  const fire = (r: N.NotificationResponse | null) => { if (!r) return; const d = r.notification.request.content.data ?? {}; cb(d.route === 'Tasks' ? 'Tasks' : 'Today', String(d.kind ?? ''), String(d.planned ?? r.notification.request.identifier)); };
  try { fire(N.getLastNotificationResponse()); const s = N.addNotificationResponseReceivedListener(fire); return () => s.remove(); } catch { return () => undefined; }
}
