import type { AttStatus, Meeting, Task } from './types';
import type { Planned } from './reminders';
import { fmtTime } from './time';

/** Everything about "what does tapping this notification do", kept pure so it can be tested without the
 *  OS, the store or a phone. `services/notifications.ts` asks it what to attach when scheduling and what
 *  to run when a response arrives; the store supplies the writes.
 *
 *  Two layers, deliberately: the *button* is a static string owned by a notification category (the only
 *  thing iOS and Android will render), and the *target* is carried in the notification's own `data`. A
 *  button index or a notification id cannot be the identity — `Planned.id` embeds the minute, so a
 *  reminder that shifts changes its id and its buttons would have to be rebuilt. `kind` + `entityId` do
 *  not change when a reminder moves, so the action survives any reschedule. */

/** Category ids must not contain `:` or `-` or the native side may not match them. */
export const CAT_ATT = 'mgatt', CAT_TASK = 'mgtask';
export interface ButtonDef { identifier: string; buttonTitle: string }
export const NOTIF_CATEGORIES: { identifier: string; actions: ButtonDef[] }[] = [
  { identifier: CAT_ATT, actions: [{ identifier: 'att.here', buttonTitle: 'Here' }, { identifier: 'att.late', buttonTitle: 'Late' }, { identifier: 'att.absent', buttonTitle: 'Absent' }] },
  { identifier: CAT_TASK, actions: [{ identifier: 'task.done', buttonTitle: 'Done' }] },
];
/** What the OS reports when the notification body was tapped rather than one of its buttons. */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

const ATT_STATUS: Record<string, AttStatus | undefined> = { 'att.here': 'p', 'att.late': 'l', 'att.absent': 'a' };
const PLANNED_KINDS = ['class', 'ended', 'task', 'start', 'exam'];
/** `focus` and the test notification are not planner reminders and have no row in `notif_log`. */
export const isPlannedKind = (kind: string) => PLANNED_KINDS.includes(kind);

/** The category to attach when scheduling, or null for a reminder that gets no buttons.
 *
 *  `start` (a subtask start and a start-by nudge) is deliberately excluded. Its entity id is the task id
 *  with an `s` or a `b` bolted on, and `uid()` is base36 — its alphabet contains both letters, so a real
 *  task id can end in either one and the suffix cannot be stripped without guessing. A guess here would
 *  mark the wrong task or none, from a button the user pressed on purpose, so there is no button. */
export function planCategory(kind: string): string | null {
  if (kind === 'class' || kind === 'ended') return CAT_ATT;
  if (kind === 'task' || kind === 'exam') return CAT_TASK;
  return null;
}

export type NotifAction = { kind: 'att'; status: AttStatus; key: string } | { kind: 'task'; taskId: string };
export interface NotifData { route?: unknown; kind?: unknown; entityId?: unknown; planned?: unknown; at?: unknown }
export interface Opened { route: 'Today' | 'Tasks'; kind: string; id: string; at: number; action: NotifAction | null }

/** The write a pressed button asks for, or null for "just navigate". Null is the honest answer for a
 *  plain tap, for an action id from a build of the app that no longer has it, and for a category
 *  button arriving on a reminder whose kind does not carry that category. */
export function resolveAction(actionId: string, data: NotifData): NotifAction | null {
  if (!actionId || actionId === DEFAULT_ACTION) return null;
  const kind = String(data.kind ?? ''), entityId = String(data.entityId ?? '');
  if (!entityId) return null;
  const status = ATT_STATUS[actionId];
  if (status !== undefined) return kind === 'class' || kind === 'ended' ? { kind: 'att', status, key: entityId } : null;
  if (actionId === 'task.done') return kind === 'task' || kind === 'exam' ? { kind: 'task', taskId: entityId } : null;
  return null;
}

export interface NotifEffects {
  tasks: readonly Pick<Task, 'id' | 'status' | 'title'>[];
  meetings: readonly Pick<Meeting, 'start' | 'courseId'>[];
  setAtt: (key: string, status: AttStatus) => void;
  toggleTask: (id: string) => void;
  toast: (text: string) => void;
  go: (route: 'Today' | 'Tasks') => void;
  /** Bookkeeping only: the store's own implementation must never throw or reject into the caller. */
  log: (id: string, kind: string, at: number) => void;
}

/** Perform the write. Returns false — with a line the user reads, never a silent drop — when the thing
 *  the button was aimed at is gone, because a notification outlives the row it was built from. */
export function applyAction(a: NotifAction, fx: NotifEffects): boolean {
  if (a.kind === 'att') {
    const [, start, courseId] = a.key.split('|');
    if (!start || !courseId || !fx.meetings.some((m) => m.start === start && m.courseId === courseId)) { fx.toast('That class is no longer in your timetable'); return false; }
    fx.setAtt(a.key, a.status); return true;
  }
  const t = fx.tasks.find((x) => x.id === a.taskId);
  if (!t) { fx.toast('That task has been deleted'); return false; }
  // `toggleTask` flips, so a reminder that is still in the shade after the task was ticked off in the app
  // would un-complete it. A button labelled "Done" must never do the opposite of what it says.
  if (t.status === 2) { fx.toast(`${t.title} is already done`); return false; }
  fx.toggleTask(a.taskId); return true;
}

/** Everything one tap of a notification does, in the order it has to happen. Navigation is unchanged:
 *  an action marks the thing *and* still opens the app on the page that shows it, which is the
 *  confirmation the user is looking for. */
export function dispatchOpened(o: Opened, fx: NotifEffects): void {
  fx.log(o.id, o.kind, o.at);
  if (o.action) applyAction(o.action, fx);
  if (o.kind === 'ended') fx.go('Today'); else fx.go(o.route);
}

/** Two stable OS strings, no timestamps: `getLastNotificationResponse()` and the response listener hand
 *  back the *same* action for one user action, and both must be collapsed to one write. */
export const responseKey = (actionId: string, notificationId: string) => `${actionId}|${notificationId}`;

/** Claim-once over a bounded set. On a cold start from a tapped action the same response arrives twice
 *  (once from `getLastNotificationResponse`, once from the listener) and a naive handler writes twice —
 *  two marks, two toasts, two undos. Different notifications and different buttons stay independent;
 *  only an exact repeat is refused. */
export function onceGuard(limit = 32): (key: string) => boolean {
  const seen = new Set<string>();
  return (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > limit) seen.delete(seen.values().next().value as string);
    return true;
  };
}

/* ───── what Delivery status is allowed to claim ───── */
export type LogRow = { id: string; kind: string; dueAt: number; shownAt: number | null; openedAt: number | null };
export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export interface QueueStatus { permission: PermissionState; scheduled: number; queueRead: boolean }
/** One line per permission state, and a tone for it. `denied` splits two ways in the UI, but not here:
 *  whether the phone will still ask is a property of the OS, not of the permission value. */
export const PERMISSION: Record<PermissionState, { line: string; tone: 'ok' | 'warn' | 'bad' }> = {
  granted: { line: 'Notifications are allowed.', tone: 'ok' },
  undetermined: { line: 'The phone has not been asked yet.', tone: 'warn' },
  denied: { line: 'Notifications are blocked.', tone: 'bad' },
  unavailable: { line: 'This phone would not give the app its notification module, so nothing can be scheduled at all.', tone: 'bad' },
};
/** The hint on the Reminders row that leads to Delivery status. It never counts a queue it could not
 *  read, because "0 queued" off a failed query is the most believable lie this page could tell. */
export function statusHint(ns: QueueStatus | null): string {
  if (!ns) return 'Check what is actually scheduled';
  if (ns.permission === 'unavailable') return 'notifications unavailable on this phone';
  if (ns.permission !== 'granted') return `${PERMISSION[ns.permission].line.toLowerCase()} nothing queued`;
  return ns.queueRead ? `${ns.scheduled} queued` : 'allowed · the queue could not be read';
}
export const KIND_WORD: Record<string, string> = { class: 'heads-up', ended: 'class ended', task: 'task', exam: 'exam', start: 'start' };
/* ───── exact vs inexact: what the app can and cannot know ───── */
/** Android reads whether this phone will grant exact alarms with `AlarmManager.canScheduleExactAlarms()`,
 *  and nothing in the installed dependencies exposes it to JS (see `reports/w5-d0-mechanism.md` §4). So
 *  this is the state the app is honestly in until W5b adds the native read: it says it does not know,
 *  and quotes every reminder as a window instead of the minute the planner picked. */
export const EXACT_ALARM_UNKNOWN = 'This phone will not tell the app whether exact alarms are allowed, so the times below are windows, not promises.';
/** How wide the window is, in the app's words. An inexact `setAndAllowWhileIdle` alarm is fired
 *  "approximately" and may be held into the next Doze maintenance window; the app names a small,
 *  honest window rather than repeating the planned minute as if it were a promise. */
export const INEXACT_WINDOW_MIN = 5;
export const inexactWindow = (min = INEXACT_WINDOW_MIN) => `give or take ${min} min`;
/** Delivery status's one line about the next reminder. `fmt` is the caller's h12-aware time formatter
 *  (`fmtTime`) and `rel` its relative form (`relFire`), so this stays pure and store-free. */
export function nextRingLine(at: number, fmt: (ms: number) => string, rel: (ms: number) => string, min = INEXACT_WINDOW_MIN): string {
  return `Next one is planned for around ${fmt(at)} — ${inexactWindow(min)} — ${rel(at)}.`;
}
/* ───── D4: what a channel is actually doing with text on the lock screen ───── */
/** The three answers `getNotificationChannelAsync` can give for `lockscreenVisibility`, in the app's
 *  words. `unknown` is the phone's own UNKNOWN value; `null` (kept by the caller) means the phone would
 *  not answer at all. */
export type ChannelVisibility = 'public' | 'private' | 'secret' | 'unknown';
const whatChannelDoes: Record<ChannelVisibility, string> = {
  public: 'shows its full text',
  private: 'hides the text on a secure lock screen',
  secret: 'hides even that a reminder arrived',
  unknown: 'will not say what it does',
};
/** What Delivery status is allowed to claim about the D4 toggle. The setting is the wish; the channel is
 *  the truth, so the line always names BOTH the setting and what the phone's own channel reports — and
 *  when they disagree it says so rather than repeating the wish. */
export function lockTextLine(setting: boolean, actual: ChannelVisibility | null): string {
  const wish = setting ? 'Reminder text is set to show on the lock screen' : 'Reminder text is set to stay hidden until you unlock';
  if (actual === null) return `${wish}. This phone would not say what its channels actually do.`;
  const does = whatChannelDoes[actual];
  const agrees = setting ? actual === 'public' || actual === 'private' : actual === 'secret';
  return agrees ? `${wish}, and this phone's channel ${does}.` : `${wish}, but this phone's channel ${does} — the channel wins until Android recreates it.`;
}
/* ───── a build that cannot schedule anything at all ───── */
/** Web, or a native build the phone would not give the notification module to: both mean no alarm can
 *  ever be scheduled from here, and the Reminders pages say so in one sentence instead of showing
 *  controls that pretend. W8's onboarding ask is the only other place that must know this. */
export const NO_MODULE_LINE = 'This build has no notification module, so nothing can be scheduled here — ringing reminders need the development build on a phone.';
/** The same fact for a row hint, where one line is all there is room for. */
export const NO_MODULE_HINT = 'alarms need the development build';
/** `platform` is `Platform.OS`; `permission` is what `ensurePermission` last reported (`unavailable` is
 *  the module itself missing). `null` permission = not read yet, which only defers to the platform. */
export function noModuleNote(platform: string, permission: PermissionState | null): string | null {
  if (platform === 'web') return NO_MODULE_LINE;
  if (permission === 'unavailable') return NO_MODULE_LINE;
  return null;
}
/** What one logged reminder can honestly be said to have done. `opened` with no `shown` is the ordinary
 *  case of a reminder that rang while the app was closed: nothing was running to notice it, and the app
 *  will not invent a time it cannot know. */
export function logState(r: LogRow, now: number): string {
  if (r.openedAt) return r.shownAt ? `opened ${ago(r.openedAt, now)}` : 'opened, never rang in the app';
  if (r.shownAt) return `rang ${ago(r.shownAt, now)}, not opened`;
  return now - r.dueAt < 60_000 ? 'queued' : 'queued, but its time passed with no sign of it';
}
const ago = (at: number, now: number) => { const d = now - at; return d < 3_600_000 ? `${Math.max(0, Math.round(d / 60_000))} min ago` : d < 86_400_000 ? `${Math.round(d / 3_600_000)} h ago` : `${Math.round(d / 86_400_000)} d ago`; };
/** The reminder the action test imitates: a real one, with its real entity id, so its buttons do the real
 *  thing. A `start` nudge carries a suffixed id and has no buttons, so it cannot be the subject. */
export function testTarget(now: number, next: Planned | null, tasks: readonly Task[], testId: string, h12 = false): Planned | null {
  if (next && planCategory(next.kind)) return next;
  const t = tasks.find((x) => x.status !== 2 && x.dueAt !== null);
  return t ? { id: testId, kind: 'task', at: now + 10_000, title: t.title, body: `${KIND_WORD.task} · due ${fmtTime(t.dueAt as number, h12)}`, channel: 'tasks', route: 'Tasks', entityId: t.id } : null;
}
