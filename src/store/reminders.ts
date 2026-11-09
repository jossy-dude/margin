import { Appearance } from 'react-native';
import type { Settings } from '../domain/types';
import type { NotifLogRow } from '../data/repository';
import { planReminders } from '../domain/reminders';
import { makeTheme } from '../tokens/theme';
import { recordCrash } from '../services/problems';
import * as notifs from '../services/notifications';
import { getState, set, type Moved, type PlanInfo } from './core';
import { db, R } from './persist';
import { pushAgenda } from './surfaces';

/* ───── notifications: plan → OS queue, debounced ───── */
/** The OS tints a notification with the app's accent, and `resync` runs from store actions rather than from a
 *  component, so the theme is resolved here the same way `ThemeProvider` resolves it, minus the hook.
 *  `Appearance.getColorScheme` is guarded because this debounce can fire after jest has torn the module
 *  down — it used to throw inside the timer, which surfaced as an uncaught TypeError on every test run
 *  and buried whatever real error came after it. */
const notifAccent = (s: Settings) => makeTheme(s, typeof Appearance?.getColorScheme === 'function' && Appearance.getColorScheme() === 'dark').c.acc;
/** The same accent `sync` tints real reminders with, so a test notification looks like the real thing. */
export const notificationAccent = () => notifAccent(getState().settings);

/** `notif_log` is bookkeeping. It must never be the reason a scheduling pass or a notification action
 *  fails, and a repository that is not open yet must not turn an event handler into a crash, so both
 *  halves swallow: the `try` for the synchronous throw `R()` raises, the `catch` for the rejected write.
 *  The rejected write leaves a breadcrumb in the Problems log (audit L1) — swallowing it entirely meant
 *  a reminder could exist in the OS queue with no row here and no way to tell why. */
export function logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
  if (!id) return;
  // The log page is the only place this write is read, and it can already be on screen (a tapped
  // notification brings the app up), so it is re-read once the write has landed rather than at the
  // next resync — otherwise Delivery status keeps calling an opened reminder "queued".
  try { void R().logNotif(id, kind, dueAt, event, at).catch((e) => recordCrash(e, 'save', getState().route)).then(() => refreshNotifLog()); } catch { /* repository not open yet */ }
}
/** One pass's queued reminders, as one bookkeeping write. */
function schedNotifs(rows: { id: string; kind: string; at: number }[]) {
  const keep = rows.filter((r) => r.id);
  if (!keep.length) return;
  try { void R().schedNotifMany(keep).catch((e) => recordCrash(e, 'save', getState().route)); } catch { /* repository not open yet */ }
}
/** Only the newest few rows: the page shows a handful, and `notif_log` itself keeps everything. */
const LOG_KEEP = 12;
export async function refreshNotifLog() {
  let all: NotifLogRow[];
  try { all = await R().notifLog(); } catch { return; }
  const rows = [...all].sort((a, b) => b.dueAt - a.dueAt).slice(0, LOG_KEEP), prev = getState().notifLog;
  // The old array is kept when nothing changed: a fresh one on every resync would re-render the page.
  if (rows.length === prev.length && rows.every((r, i) => r.id === prev[i]!.id && r.shownAt === prev[i]!.shownAt && r.openedAt === prev[i]!.openedAt)) return;
  set({ notifLog: rows });
}
/** Everything the Delivery page compares to decide whether the plan actually moved. */
const planSig = (p: PlanInfo) => `${p.count}|${p.deferred}|${p.shifted}|${p.next?.id ?? ''}|${p.moved.map((m) => `${m.at}:${m.why}`).join()}||${p.dropped.map((d) => d.why).join()}`;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
/** Drop a queued rebuild. A debounce that outlives the thing that asked for it is the whole defect:
 *  it fired after jest had torn its module registry down and took the worker with it, and in the app it
 *  can schedule against a repository that has since been re-opened. */
export function stopResync() { if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; } }
export function resync(delay = 700) {
  stopResync();
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    const s = getState(); if (!s.ready) return;
    /* v0.7: the same pass hands the phone its agenda — widgets, the pinned class, the alarms. Before the demo
       check on purpose: entering the sample semester has to CLEAR what the home screen shows. */
    try { pushAgenda(); } catch (e) { recordCrash(e, 'runtime', s.route); }
    /* The demo session plans nothing: a sample class must never arrive as a real bell. Leaving the
       tour calls resync(0) alongside adoption, so the real session starts planning at once. */
    if (db.demo) return;
    const now = Date.now(), plan = planReminders({ now, courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, settings: s.settings.notif, hour12: s.settings.hour12 });
    let perm = await notifs.ensurePermission(false);
    /* No automatic ask (v0.5 C): the system prompt only ever follows its explanation — the onboarding's
       reminders page, or Settings → Reminders → Allow. A planner that was never asked simply plans nothing. */
    if (perm === 'granted') { const r = await notifs.sync(plan, notifAccent(s.settings)); schedNotifs(r.planned); } else if (!s.settings.notif.enabled) await notifs.cancelAll();
    // Only notify subscribers when something visible actually changed — every mutation calls resync(),
    // and most recompute to the same plan (e.g. edits that don't move any reminder).
    const moved: Moved[] = [];
    for (const p of plan.items) if (p.shiftedFrom && moved.length < 4) moved.push({ title: p.title, at: p.at, was: p.shiftedFrom, why: p.why ?? 'moved' });
    const info: PlanInfo = { count: plan.items.length, deferred: plan.deferred, shifted: plan.items.filter((p) => p.shiftedFrom).length, next: plan.items[0] ?? null, at: now, moved, dropped: plan.dropped.slice(0, 4) };
    const ns = await notifs.status();
    const p = getState().plan, pn = getState().notifStatus;
    const planSame = p !== null && planSig(p) === planSig(info);
    const nsSame = pn !== null && pn.permission === ns.permission && pn.scheduled === ns.scheduled && pn.next === ns.next && pn.canAskAgain === ns.canAskAgain && pn.queueRead === ns.queueRead && pn.lockText === ns.lockText && pn.platform === ns.platform;
    if (!planSame || !nsSame) set({ plan: planSame && p ? p : info, notifStatus: nsSame && pn ? pn : ns });
    await refreshNotifLog();
  }, delay);
}
export async function refreshNotifStatus() { set({ notifStatus: await notifs.status() }); await refreshNotifLog(); }
