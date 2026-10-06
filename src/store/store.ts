import { useSyncExternalStore } from 'react';
import { Appearance, AppState as RNAppState } from 'react-native';
import type { AttRecord, AttStatus, Course, DayMark, DayStatus, FocusSession, Mark, Meeting, Notice, Settings, Snapshot, Task, NotifSettings } from '../domain/types';
import type { NotifLogRow, Repository } from '../data/repository';
import { openRepository } from '../data/sqliteExpo';
import { seedSnapshot } from '../data/seed';
import { withDefaults } from '../domain/defaults';
import { ST } from '../domain/attendance';
import { dispatchOpened, isPlannedKind } from '../domain/notifActions';
import { planReminders, type Planned } from '../domain/reminders';
import { makeTheme } from '../tokens/theme';
import { advance, endBreak, finish, initTimer, setMinutes, startBreak, toggle as timerToggle, type TimerState } from '../domain/timer';
import { uid } from '../domain/time';
import { configureFx, fx } from '../services/fx';
import * as notifs from '../services/notifications';

export type RouteName = 'Today' | 'Week' | 'Tasks' | 'Grades' | 'Stats' | 'Focus';
export type SheetSpec =
  | { t: 'add' } | { t: 'task'; id?: string; kind?: Task['kind']; courseId?: string | null } | { t: 'status'; mode: 'class' | 'day'; key: string; title: string; date: string }
  | { t: 'settings' } | { t: 'course'; id?: string } | { t: 'meeting'; courseId?: string; id?: string; weekday?: number } | { t: 'mark'; courseId: string; id?: string } | { t: 'notice'; id?: string };
export interface Toast { id: number; text: string; undo?: () => void }
export interface Moved { title: string; at: number; was: number; why: string }
export interface PlanInfo { count: number; deferred: number; shifted: number; next: Planned | null; at: number; moved: Moved[]; dropped: { id: string; why: string }[] }
export interface State {
  ready: boolean; error: string | null; now: number;
  courses: Course[]; meetings: Meeting[]; attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>;
  tasks: Task[]; notices: Notice[]; marks: Mark[]; adjusts: Record<string, number>; focus: FocusSession[]; settings: Settings;
  timer: TimerState; sheet: SheetSpec | null; settingsPath: string[]; toast: Toast | null; route: RouteName; prevRoute: RouteName | null; focusTaskId: string | null;
  notifStatus: notifs.NotifStatus | null; plan: PlanInfo | null; notifLog: NotifLogRow[];
  fev: { k: string; at: number } | null;
}
let repo: Repository | null = null;
let state: State = {
  ready: false, error: null, now: Date.now(), courses: [], meetings: [], attendance: {}, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], settings: withDefaults({}),
  timer: initTimer(), sheet: null, settingsPath: [], toast: null, route: 'Today', prevRoute: null, focusTaskId: null, notifStatus: null, plan: null, notifLog: [], fev: null,
};
const subs = new Set<() => void>();
export const getState = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function set(patch: Partial<State> | ((s: State) => Partial<State>)) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; subs.forEach((f) => f()); }
export function useStore<T>(sel: (s: State) => T): T { return useSyncExternalStore(subscribe, () => sel(state), () => sel(state)); }

const persist = (p: Promise<unknown>) => p.catch((e) => set({ toast: { id: Date.now(), text: `Couldn't save: ${String((e as Error)?.message ?? e).slice(0, 60)}` } }));
/** Every write goes through here. Throws a readable error instead of the old null-cast TypeError, which the fatal-error screen's only button used to swallow. */
export const R = (): Repository => {
  if (!repo) throw new Error('Database is not open: call hydrate() first, or act.resetAll() to re-open it.');
  return repo;
};
/** Re-open the repository if boot never got that far (App.tsx only hydrates after openRepository resolves). */
export async function ensureRepo(): Promise<Repository> { if (!repo) repo = await openRepository(); return R(); }
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(text: string, undo?: () => void) {
  if (toastTimer) clearTimeout(toastTimer);
  const id = Date.now(); set({ toast: { id, text, ...(undo ? { undo } : {}) } });
  toastTimer = setTimeout(() => { if (state.toast?.id === id) set({ toast: null }); }, undo ? 6000 : 2600);
}
export const dismissToast = () => set({ toast: null });

/* ───── notifications: plan → OS queue, debounced ───── */
/** The OS tints a notification with the app's accent, and `resync` runs from store actions rather than from a
 *  component, so the theme is resolved here the same way `ThemeProvider` resolves it, minus the hook.
 *  `Appearance.getColorScheme` is guarded because this debounce can fire after jest has torn the module
 *  down — it used to throw inside the timer, which surfaced as an uncaught TypeError on every test run
 *  and buried whatever real error came after it. */
const notifAccent = (s: Settings) => makeTheme(s, typeof Appearance?.getColorScheme === 'function' && Appearance.getColorScheme() === 'dark').c.acc;

/** `notif_log` is bookkeeping. It must never be the reason a scheduling pass or a notification action
 *  fails, and a repository that is not open yet must not turn an event handler into a crash, so both
 *  halves swallow: the `try` for the synchronous throw `R()` raises, the `catch` for the rejected write. */
function logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
  if (!id) return;
  try { void R().logNotif(id, kind, dueAt, event, at).catch(() => undefined); } catch { /* repository not open yet */ }
}
function schedNotif(id: string, kind: string, dueAt: number) {
  if (!id) return;
  try { void R().schedNotif(id, kind, dueAt).catch(() => undefined); } catch { /* repository not open yet */ }
}
/** Only the newest few rows: the page shows a handful, and `notif_log` itself keeps everything. */
const LOG_KEEP = 12;
export async function refreshNotifLog() {
  let all: NotifLogRow[];
  try { all = await R().notifLog(); } catch { return; }
  const rows = [...all].sort((a, b) => b.dueAt - a.dueAt).slice(0, LOG_KEEP), prev = state.notifLog;
  // The old array is kept when nothing changed: a fresh one on every resync would re-render the page.
  if (rows.length === prev.length && rows.every((r, i) => r.id === prev[i]!.id && r.shownAt === prev[i]!.shownAt && r.openedAt === prev[i]!.openedAt)) return;
  set({ notifLog: rows });
}
/** Everything the Delivery page compares to decide whether the plan actually moved. */
const planSig = (p: PlanInfo) => `${p.count}|${p.deferred}|${p.shifted}|${p.next?.id ?? ''}|${p.moved.map((m) => `${m.at}:${m.why}`).join()}||${p.dropped.map((d) => d.why).join()}`;
let syncTimer: ReturnType<typeof setTimeout> | null = null, askedPermission = false;
/** Drop a queued rebuild. A debounce that outlives the thing that asked for it is the whole defect:
 *  it fired after jest had torn its module registry down and took the worker with it, and in the app it
 *  can schedule against a repository that has since been re-opened. */
export function stopResync() { if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; } }
export function resync(delay = 700) {
  stopResync();
  syncTimer = setTimeout(async () => {
    syncTimer = null;
    const s = state; if (!s.ready) return;
    const now = Date.now(), plan = planReminders({ now, courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, settings: s.settings.notif });
    let perm = await notifs.ensurePermission(false);
    if (perm === 'undetermined' && !askedPermission && s.settings.notif.enabled) { askedPermission = true; perm = await notifs.ensurePermission(true); }
    if (perm === 'granted') { const r = await notifs.sync(plan, notifAccent(s.settings)); for (const p of r.planned) schedNotif(p.id, p.kind, p.at); } else if (!s.settings.notif.enabled) await notifs.cancelAll();
    // Only notify subscribers when something visible actually changed — every mutation calls resync(),
    // and most recompute to the same plan (e.g. edits that don't move any reminder).
    const moved: Moved[] = [];
    for (const p of plan.items) if (p.shiftedFrom && moved.length < 4) moved.push({ title: p.title, at: p.at, was: p.shiftedFrom, why: p.why ?? 'moved' });
    const info: PlanInfo = { count: plan.items.length, deferred: plan.deferred, shifted: plan.items.filter((p) => p.shiftedFrom).length, next: plan.items[0] ?? null, at: now, moved, dropped: plan.dropped.slice(0, 4) };
    const ns = await notifs.status();
    const p = state.plan, pn = state.notifStatus;
    const planSame = p !== null && planSig(p) === planSig(info);
    const nsSame = pn !== null && pn.permission === ns.permission && pn.scheduled === ns.scheduled && pn.next === ns.next && pn.canAskAgain === ns.canAskAgain && pn.queueRead === ns.queueRead && pn.platform === ns.platform;
    if (!planSame || !nsSame) set({ plan: planSame && p ? p : info, notifStatus: nsSame && pn ? pn : ns });
    await refreshNotifLog();
  }, delay);
}
export async function refreshNotifStatus() { set({ notifStatus: await notifs.status() }); await refreshNotifLog(); }

/* ───── hydrate ───── */
export async function hydrate(r: Repository) {
  repo = r;
  try {
    const snap = await r.load();
    applySnapshot(snap); configureFx(state.settings);
    set({ ready: true, now: Date.now() }); resync(1500);
  } catch (e) { set({ error: String((e as Error)?.message ?? e), ready: true }); }
}
function applySnapshot(s: Snapshot) {
  set({ courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, notices: s.notices, marks: s.marks, adjusts: s.adjusts, focus: s.focus, settings: withDefaults(s.settings),
    timer: initTimer({ planMin: withDefaults(s.settings).focusPresetMin, flow: withDefaults(s.settings).focusFlow, breakMs: withDefaults(s.settings).breakMin * 60_000, breaksAllowed: withDefaults(s.settings).breaksPerRound }) });
}
export const snapshotOf = (s: State = state): Snapshot => ({ courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, notices: s.notices, marks: s.marks, adjusts: s.adjusts, focus: s.focus, settings: s.settings });

/* ───── actions ───── */
export const act = {
  go(route: RouteName) { if (route === state.route) return; set({ prevRoute: state.route, route }); fx.page(); },
  open(sheet: SheetSpec) { fx.tap(); set({ sheet }); },
  close() { set({ sheet: null }); },
  settingsPush(p: string) { fx.select(); set((s) => ({ settingsPath: [...s.settingsPath, p] })); },
  settingsPop() { set((s) => ({ settingsPath: s.settingsPath.slice(0, -1) })); },

  setSettings(patch: Partial<Settings>) {
    set((s) => ({ settings: { ...s.settings, ...patch } })); configureFx(state.settings); void persist(R().putSettings(patch));
  },
  setNotif(patch: Partial<NotifSettings>) {
    const notif = { ...state.settings.notif, ...patch }; set((s) => ({ settings: { ...s.settings, notif } })); void persist(R().putSettings({ notif })); resync(500);
  },

  saveTask(t: Task) {
    const exists = state.tasks.some((x) => x.id === t.id);
    set((s) => ({ tasks: exists ? s.tasks.map((x) => (x.id === t.id ? t : x)) : [...s.tasks, t] })); void persist(R().upsert('task', t)); resync();
  },
  newTask(p: Partial<Task> & { title: string }): Task {
    const now = Date.now(), t: Task = { id: uid('t'), courseId: null, kind: 'assignment', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: now, completedAt: null, reminders: [], subtasks: [], demo: false, ...p };
    act.saveTask(t); return t;
  },
  toggleTask(id: string) {
    const t = state.tasks.find((x) => x.id === id); if (!t) return;
    const done = t.status !== 2, n: Task = { ...t, status: done ? 2 : 0, completedAt: done ? Date.now() : null, subtasks: done ? t.subtasks.map((x) => ({ ...x, done: true })) : t.subtasks };
    act.saveTask(n); if (done) fx.done(); else fx.undone();
  },
  toggleSubtask(id: string, sid: string) { const t = state.tasks.find((x) => x.id === id); if (!t) return; act.saveTask({ ...t, subtasks: t.subtasks.map((x) => (x.id === sid ? { ...x, done: !x.done } : x)) }); fx.select(); },
  removeTask(id: string) {
    const t = state.tasks.find((x) => x.id === id); if (!t) return;
    set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) })); void persist(R().remove('task', id)); resync();
    toast('Task deleted', () => { set((s) => ({ tasks: [...s.tasks, t] })); void persist(R().restore('task', id)); resync(); });
  },

  setAtt(key: string, status: AttStatus, reason = '') { const prev = state.attendance[key] ?? null; const r: AttRecord = { key, status, at: Date.now(), reason }; set((s) => ({ attendance: { ...s.attendance, [key]: r } })); void persist(R().upsert('attendance', r)); fx.stamp(status); resync(); toast(`Marked ${ST[status]}`, () => { set((s) => { const a = { ...s.attendance }; if (prev) a[key] = prev; else delete a[key]; return { attendance: a }; }); void persist(prev ? R().upsert('attendance', prev) : R().remove('attendance', key)); resync(); }); },
  clearAtt(key: string) { const prev = state.attendance[key]; if (!prev) return; set((s) => { const a = { ...s.attendance }; delete a[key]; return { attendance: a }; }); void persist(R().remove('attendance', key)); resync(); toast('Back to automatic', () => { set((s) => ({ attendance: { ...s.attendance, [key]: prev } })); void persist(R().restore('attendance', key)); resync(); }); },
  setDay(date: string, status: DayStatus, reason = '') { const r: DayMark = { date, status, at: Date.now(), reason }; set((s) => ({ dayMarks: { ...s.dayMarks, [date]: r } })); void persist(R().upsert('dayMark', r)); fx.stamp(status); resync(); },
  clearDay(date: string) { const prev = state.dayMarks[date]; if (!prev) return; set((s) => { const a = { ...s.dayMarks }; delete a[date]; return { dayMarks: a }; }); void persist(R().remove('dayMark', date)); resync(); toast('Day mark cleared', () => { set((s) => ({ dayMarks: { ...s.dayMarks, [date]: prev } })); void persist(R().restore('dayMark', date)); resync(); }); },

  saveCourse(c: Course) { const ex = state.courses.some((x) => x.id === c.id); set((s) => ({ courses: ex ? s.courses.map((x) => (x.id === c.id ? c : x)) : [...s.courses, c] })); void persist(R().upsert('course', c)); resync(); },
  saveMeeting(m: Meeting) { const ex = state.meetings.some((x) => x.id === m.id); set((s) => ({ meetings: ex ? s.meetings.map((x) => (x.id === m.id ? m : x)) : [...s.meetings, m] })); void persist(R().upsert('meeting', m)); resync(); },
  removeMeeting(id: string) { const m = state.meetings.find((x) => x.id === id); if (!m) return; set((s) => ({ meetings: s.meetings.filter((x) => x.id !== id) })); void persist(R().remove('meeting', id)); resync(); toast('Class removed from the timetable', () => { set((s) => ({ meetings: [...s.meetings, m] })); void persist(R().restore('meeting', id)); resync(); }); },
  removeCourse(id: string) {
    const c = state.courses.find((x) => x.id === id); if (!c) return; const ms = state.meetings.filter((m) => m.courseId === id), mk = state.marks.filter((m) => m.courseId === id);
    set((s) => ({ courses: s.courses.filter((x) => x.id !== id), meetings: s.meetings.filter((m) => m.courseId !== id), marks: s.marks.filter((m) => m.courseId !== id) }));
    void persist((async () => { await R().remove('course', id); for (const m of ms) await R().remove('meeting', m.id); for (const m of mk) await R().remove('mark', m.id); })()); resync();
    toast(`${c.name} removed`, () => { set((s) => ({ courses: [...s.courses, c].sort((a, b) => a.sort - b.sort), meetings: [...s.meetings, ...ms], marks: [...s.marks, ...mk] })); void persist((async () => { await R().restore('course', id); for (const m of ms) await R().restore('meeting', m.id); for (const m of mk) await R().restore('mark', m.id); })()); resync(); });
  },
  saveMark(m: Mark) { const ex = state.marks.some((x) => x.id === m.id); set((s) => ({ marks: ex ? s.marks.map((x) => (x.id === m.id ? m : x)) : [...s.marks, m] })); void persist(R().upsert('mark', m)); },
  removeMark(id: string) { const m = state.marks.find((x) => x.id === id); if (!m) return; set((s) => ({ marks: s.marks.filter((x) => x.id !== id) })); void persist(R().remove('mark', id)); toast('Mark deleted', () => { set((s) => ({ marks: [...s.marks, m] })); void persist(R().restore('mark', id)); }); },
  setAdjust(courseId: string, adj: number) { set((s) => ({ adjusts: { ...s.adjusts, [courseId]: adj } })); void persist(R().upsert('adjust', { courseId, adj })); },
  saveNotice(n: Notice) { const ex = state.notices.some((x) => x.id === n.id); set((s) => ({ notices: ex ? s.notices.map((x) => (x.id === n.id ? n : x)) : [...s.notices, n] })); void persist(R().upsert('notice', n)); },
  removeNotice(id: string) { const n = state.notices.find((x) => x.id === id); if (!n) return; set((s) => ({ notices: s.notices.filter((x) => x.id !== id) })); void persist(R().remove('notice', id)); toast('Note torn off', () => { set((s) => ({ notices: [...s.notices, n] })); void persist(R().restore('notice', id)); }); },

  addSession(s0: Omit<FocusSession, 'id' | 'demo'>) { const f: FocusSession = { ...s0, id: uid('f'), demo: false }; set((s) => ({ focus: [...s.focus, f] })); void persist(R().upsert('focus', f)); },

  /* focus timer */
  focusOpen(taskId: string | null) {
    const t = taskId ? state.tasks.find((x) => x.id === taskId) : null, st = state.settings;
    if (state.timer.phase === 'set' || !state.timer.running) set({ timer: initTimer({ planMin: t?.estimateMin ? Math.min(240, Math.max(5, Math.round(t.estimateMin / 5) * 5)) : st.focusPresetMin, flow: st.focusFlow, breakMs: st.breakMin * 60_000, breaksAllowed: st.breaksPerRound, taskId, courseId: t?.courseId ?? null, title: t?.title ?? 'Free focus' }) });
    set({ focusTaskId: taskId }); act.go('Focus');
  },
  timerSetMin(min: number) { set((s) => ({ timer: setMinutes(s.timer, min) })); },
  timerSetFlow(flow: boolean) { set((s) => ({ timer: { ...s.timer, flow } })); },
  timerToggle() {
    const now = Date.now(), r = timerToggle(state.timer, now); set({ timer: r.state }); applyEvents(r.events);
    const t = r.state;
    if (t.running && t.phase === 'focus') void notifs.scheduleFocusEnd(now + t.focusLeftMs, 'Round finished', `${t.title || 'Focus'} · ${t.planMin} min done. Take a breath.`); else void notifs.cancelFocusEnd();
    return t;
  },
  timerBreak() { const now = Date.now(), t = startBreak(state.timer, now); if (t.phase !== 'break') { fx.denied(); return; } set({ timer: t }); fx.breakStart(); void notifs.scheduleFocusEnd(now + t.breakLeftMs, 'Break is over', 'Back to it when you are ready.'); },
  timerBackNow() { const now = Date.now(), t = endBreak(state.timer, now); set({ timer: t }); fx.peel(); setTimeout(() => fx.fall(), 350); if (t.running) void notifs.scheduleFocusEnd(now + t.focusLeftMs, 'Round finished', `${t.title || 'Focus'} · done.`); },
  timerFinish(save = true) {
    const now = Date.now(), sum = save ? finish(state.timer, now) : null; void notifs.cancelFocusEnd();
    if (sum) { act.addSession(sum); toast(`Saved ${Math.round(sum.focusSec / 60)} min of focus`); }
    const st = state.settings; set({ timer: initTimer({ planMin: st.focusPresetMin, flow: st.focusFlow, breakMs: st.breakMin * 60_000, breaksAllowed: st.breaksPerRound, taskId: state.timer.taskId, courseId: state.timer.courseId, title: state.timer.title }) });
    return sum;
  },
  /** called by the UI ticker; writes state only when something happened so a 4 Hz tick costs nothing */
  timerPump(now: number) {
    const t = state.timer; if (!t.running) return; const r = advance(t, now); if (r.events.length) { set({ timer: r.state }); applyEvents(r.events); }
  },
  async purgeDemo() { await persist(R().purgeDemo()); set((s) => ({ tasks: s.tasks.filter((t) => !t.demo), focus: s.focus.filter((f) => !f.demo) })); toast('Demo history cleared'); resync(); },
  async resetAll() {
    try {
      const r = await ensureRepo();
      await persist(r.reset()); await persist(r.seed(seedSnapshot())); const snap = await r.load(); applySnapshot(snap); configureFx(state.settings); set({ ready: true, error: null }); toast('Everything is back to the demo set'); resync(300);
    } catch (e) { set({ error: `Couldn't reset: ${String((e as Error)?.message ?? e).slice(0, 80)}` }); }
  },
  chime() { fx.chime(); },
  /** swap the task shown on the Focus page (only while the dial is still being set) */
  timerSwap() {
    const open = state.tasks.filter((t) => t.status !== 2).sort((a, b) => (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15)); if (!open.length || state.timer.phase !== 'set') return;
    const i = open.findIndex((t) => t.id === state.timer.taskId), t = open[(i + 1) % open.length] as Task; fx.swipe();
    set((s) => ({ timer: { ...s.timer, taskId: t.id, courseId: t.courseId, title: t.title }, focusTaskId: t.id }));
  },
};
function applyEvents(ev: string[]) {
  if (ev.length) set({ fev: { k: ev[ev.length - 1] as string, at: Date.now() } });
  for (const e of ev) { if (e === 'roundDone') fx.roundDone(); else if (e === 'breakDone') { fx.peel(); setTimeout(() => fx.fall(), 350); } else if (e === 'nudge') fx.nudge(); else if (e === 'warn10') fx.blip(); }
}

/* ───── lifecycle ───── */
let wired = false;
/** The same accent `sync` tints real reminders with, so a test notification looks like the real thing. */
export const notificationAccent = () => notifAccent(state.settings);
/** The real effect object `dispatchOpened` writes through. Built per response, not once: it reads live
 *  task and meeting state, so a notification left in the shade cannot resurrect a deleted row. */
const notifEffects = () => {
  const s = state;
  return {
    tasks: s.tasks, meetings: s.meetings,
    setAtt: (key: string, status: AttStatus) => act.setAtt(key, status),
    toggleTask: (id: string) => act.toggleTask(id),
    toast: (text: string) => toast(text),
    go: (route: 'Today' | 'Tasks') => set({ route }),
    log: (id: string, kind: string, at: number) => { if (isPlannedKind(kind)) logNotif(id, kind, at, 'opened', Date.now()); },
  };
};
export function wireLifecycle() {
  if (wired) return; wired = true;
  RNAppState.addEventListener('change', (st) => { if (st === 'active') { set({ now: Date.now() }); resync(400); void refreshNotifStatus(); } });
  notifs.onOpened((o) => dispatchOpened(o, notifEffects()));
  notifs.onReceived((kind, id, at) => { fx.chime(); if (isPlannedKind(kind)) logNotif(id, kind, at, 'shown', Date.now()); });
}
