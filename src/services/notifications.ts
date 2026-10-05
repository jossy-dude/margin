import { Platform } from 'react-native';
import * as N from './notifApi';
import type { Plan, Planned } from '../domain/reminders';
import { DEFAULT_ACTION, NOTIF_CATEGORIES, onceGuard, planCategory, responseKey, resolveAction, type Opened } from '../domain/notifActions';

export interface NotifStatus { permission: 'granted' | 'denied' | 'undetermined' | 'unavailable'; scheduled: number; next: number | null; canAskAgain: boolean; queueRead: boolean; platform: string }
const CH = { classes: 'classes', tasks: 'tasks', focus: 'focus' } as const;
const TEST = 'test';
/** Exported so Delivery status can say a row is the test it sent, rather than passing a real
 *  reminder's row off as something the planner scheduled. */
export const TEST_ACTION_ID = 'action-test';
const RESERVED = new Set(['focus-end', TEST, TEST_ACTION_ID]);

let configured = false;
export async function configureNotifications() {
  if (configured) return; configured = true;
  try {
    N.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
    // Action buttons only exist as notification categories, and the category carries the button titles —
    // there is no per-notification action list, which is why the *target* has to travel in `data`.
    for (const cat of NOTIF_CATEGORIES) await N.setNotificationCategoryAsync(cat.identifier, cat.actions);
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
  // `queueRead` is what separates "nothing is queued" from "this phone would not tell us": a zero read
  // off a failed query is a plausible-looking lie, and Delivery status must not print one.
  let scheduled = 0, next: number | null = null, canAskAgain = true, queueRead = false;
  try { const all = await N.getAllScheduledNotificationsAsync(); scheduled = all.length; const ts = all.map((x) => (x.trigger && 'value' in x.trigger && typeof x.trigger.value === 'number' ? x.trigger.value : (x.trigger as { date?: number } | null)?.date ?? 0)).filter(Boolean); next = ts.length ? Math.min(...ts) : null; canAskAgain = (await N.getPermissionsAsync()).canAskAgain; queueRead = true; } catch { /* unavailable */ }
  return { permission, scheduled, next, canAskAgain, queueRead, platform: Platform.OS };
}
/** `at` rides along so the delivery log knows when the reminder was *for* without the store having to
 *  re-derive it — and so it survives a reinstall, when the log is empty and the queue is not. */
const content = (p: Planned, accent: string) => ({ title: p.title, body: p.body, data: { route: p.route, entityId: p.entityId, kind: p.kind, planned: p.id, at: p.at }, color: accent, categoryIdentifier: planCategory(p.kind) ?? undefined });
/** Make the OS queue equal the plan. Ids encode entity+minute, so unchanged items are left alone (no flicker, no duplicates). */
export async function sync(plan: Plan, accent: string): Promise<{ added: number; removed: number; planned: { id: string; kind: string; at: number }[] }> {
  let added = 0, removed = 0;
  const planned: { id: string; kind: string; at: number }[] = [];
  try {
    const have = (await N.getAllScheduledNotificationsAsync()).filter((x) => !RESERVED.has(x.identifier)), want = new Map(plan.items.map((p) => [p.id, p]));
    for (const h of have) if (!want.has(h.identifier)) { await N.cancelScheduledNotificationAsync(h.identifier); removed++; }
    const haveIds = new Set(have.map((h) => h.identifier));
    for (const p of plan.items) if (!haveIds.has(p.id)) { await N.scheduleNotificationAsync({ identifier: p.id, content: content(p, accent), trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(p.at), channelId: CH[p.channel] } }); added++; planned.push({ id: p.id, kind: p.kind, at: p.at }); }
  } catch { /* permission missing or module unavailable: surfaced by status() */ }
  return { added, removed, planned };
}
export async function cancelAll() { try { await N.cancelAllScheduledNotificationsAsync(); } catch { /* ignore */ } }
export async function scheduleFocusEnd(at: number, title: string, body: string) {
  try { await N.cancelScheduledNotificationAsync('focus-end'); if (at > Date.now() + 1500) await N.scheduleNotificationAsync({ identifier: 'focus-end', content: { title, body, data: { route: 'Today', kind: 'focus' } }, trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(at), channelId: CH.focus } }); } catch { /* ignore */ }
}
export async function cancelFocusEnd() { try { await N.cancelScheduledNotificationAsync('focus-end'); } catch { /* ignore */ } }
export async function sendTest(seconds = 10) {
  try { await N.cancelScheduledNotificationAsync(TEST); await N.scheduleNotificationAsync({ identifier: TEST, content: { title: 'Marginalia test', body: 'If you can read this, reminders reach you. Tap it and the app opens.' }, trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CH.tasks } }); return true; } catch { return false; }
}
/** A copy of a real reminder, fired in `seconds`, carrying that reminder's real entity id — so the
 *  buttons do the real thing instead of a mock of it. It is logged under its own id: the row must say
 *  "the test rang", never borrow the row of the reminder it imitates. */
export async function sendActionTest(p: Planned, accent: string, seconds = 10) {
  try {
    await N.cancelScheduledNotificationAsync(TEST_ACTION_ID);
    const at = Date.now() + seconds * 1000;
    await N.scheduleNotificationAsync({ identifier: TEST_ACTION_ID, content: { title: p.title, body: p.body, data: { route: p.route, entityId: p.entityId, kind: p.kind, planned: TEST_ACTION_ID, at }, color: accent, categoryIdentifier: planCategory(p.kind) ?? undefined }, trigger: { type: N.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, channelId: CH[p.channel] } });
    return true;
  } catch { return false; }
}
export function onReceived(cb: (kind: string, id: string, at: number) => void) {
  try { const s = N.addNotificationReceivedListener((n) => { const d = n.request.content.data ?? {}; cb(String(d.kind ?? ''), String(d.planned ?? n.request.identifier), Number(d.at) || 0); }); return () => s.remove(); } catch { return () => undefined; }
}
/** One user action, one write. On a cold start from a tapped action the same response is delivered twice —
 *  once by `getLastNotificationResponse()` and once by the listener — so both paths go through a guard
 *  keyed on two strings the OS owns, never on a timestamp. */
export function onOpened(cb: (o: Opened) => void) {
  const claim = onceGuard();
  const fire = (r: N.NotificationResponse | null) => {
    if (!r) return;
    const req = r.notification.request, d = req.content.data ?? {}, actionId = String(r.actionIdentifier ?? ''), action = resolveAction(actionId, d);
    if (!claim(responseKey(actionId || DEFAULT_ACTION, req.identifier))) return;
    cb({ route: d.route === 'Tasks' ? 'Tasks' : 'Today', kind: String(d.kind ?? ''), id: String(d.planned ?? req.identifier), at: Number(d.at) || 0, action });
  };
  try { fire(N.getLastNotificationResponse()); const s = N.addNotificationResponseReceivedListener(fire); return () => s.remove(); } catch { return () => undefined; }
}
