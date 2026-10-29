import { useSyncExternalStore } from 'react';
import { Appearance, AppState as RNAppState } from 'react-native';
import type { AttRecord, AttStatus, Course, DayMark, DayStatus, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, Snapshot, SubjectVariant, Task, NotifSettings, Trip, Alarm } from '../domain/types';
import type { NotifLogRow, Repository } from '../data/repository';
import { openRepository } from '../data/sqliteExpo';
import { MemoryRepository } from '../data/memory';
import { recordCrash } from '../ui/crashlog';
import { seedSnapshot } from '../data/seed';
import { toured, withDefaults } from '../domain/defaults';
import { hasRealRows } from '../domain/rows';
import { ST } from '../domain/attendance';
import { dispatchOpened, isPlannedKind } from '../domain/notifActions';
import { planReminders, type Planned } from '../domain/reminders';
import { makeTheme } from '../tokens/theme';
import { advance, endBreak, finish, initTimer, setMinutes, startBreak, toggle as timerToggle, type TimerState } from '../domain/timer';
import { uid } from '../domain/time';
import type { ImportPlan } from '../domain/importPlan';
import { buildSnapshot, newSemester, semesterName } from '../domain/archive';
import { isYmd, suggestEnd, validRange } from '../domain/semester';
import { configureFx, fx } from '../services/fx';
import * as notifs from '../services/notifications';
import { announceAppliedUpdate, bindOtaKv, checkOnForeground } from '../services/ota';

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
  tasks: Task[]; notices: Notice[]; marks: Mark[]; adjusts: Record<string, number>; focus: FocusSession[]; trips: Trip[]; alarms: Alarm[]; variants: SubjectVariant[]; settings: Settings;
  semesters: SemesterRow[];
  timer: TimerState; sheet: SheetSpec | null; settingsPath: string[]; toast: Toast | null; route: RouteName; prevRoute: RouteName | null; focusTaskId: string | null;
  notifStatus: notifs.NotifStatus | null; plan: PlanInfo | null; notifLog: NotifLogRow[];
  fev: { k: string; at: number } | null;
}
/** LIVE demo flag (v0.1 of the data model): the sample semester is a session playground in memory —
 *  a `MemoryRepository` seeded from `seedSnapshot()`, pointed at by `repo` until the tour is left.
 *  While this is on, resync schedules NO OS notifications (a demo course must not ring a real bell)
 *  and nothing the tour does touches the real database. `adoptDemo` writes the rows the user created
 *  into the real repository and turns it off. */
let demoMode = false;
/** The real database behind the demo session. Set at boot, kept even while `repo` points at the demo
 *  memory repository, so adoption never re-opens or re-migrates. */
let real: Repository | null = null;
let repo: Repository | null = null;
let state: State = {
  ready: false, error: null, now: Date.now(), courses: [], meetings: [], attendance: {}, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], variants: [], settings: withDefaults({}), semesters: [],
  timer: initTimer(), sheet: null, settingsPath: [], toast: null, route: 'Today', prevRoute: null, focusTaskId: null, notifStatus: null, plan: null, notifLog: [], fev: null,
};
const subs = new Set<() => void>();
export const getState = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function set(patch: Partial<State> | ((s: State) => Partial<State>)) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; subs.forEach((f) => f()); }
export function useStore<T>(sel: (s: State) => T): T { return useSyncExternalStore(subscribe, () => sel(state), () => sel(state)); }

/** Every failed write lands here. The toast is 2.6 s of the user's attention; the Problems log is what
 *  is still there tomorrow, so `persist` writes both (audit H1): a rejected `upsert` used to leave the
 *  optimistic row on screen with no trace anywhere once the toast had gone, and Diagnostics showed
 *  nothing at all. DECISIONS D5(a): the optimistic state is NOT rolled back — C1's serialised writes
 *  remove the failure reachable from ordinary use, and reverting can wait until a real failure is seen. */
const persist = (p: Promise<unknown>) => p.catch((e) => {
  recordCrash(e, 'save', state.route);
  set({ toast: { id: Date.now(), text: `Couldn't save: ${String((e as Error)?.message ?? e).slice(0, 60)}` } });
});
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

/* ───── self-update (v0.9 WS4) ───────────────────────────────────────────────────────────────────
 * `services/ota.ts` owns the loop but must not import the store or an adapter (the store imports it to
 * wire the resume listener — a cycle). It takes the two calls it needs as a port; this binds them to
 * the open repository's `setting` table. Both directions swallow: an update marker is bookkeeping, and
 * a boot that could not read it must still reach a screen. A failed write lands in the Problems log
 * like every other failed write. */
bindOtaKv({
  get: async (k) => { try { return await R().getKv(k); } catch { return null; } },
  set: async (k, v) => { try { await R().setKv(k, v); } catch (e) { recordCrash(e, 'save', state.route); } },
});

/* ───── notifications: plan → OS queue, debounced ───── */
/** The OS tints a notification with the app's accent, and `resync` runs from store actions rather than from a
 *  component, so the theme is resolved here the same way `ThemeProvider` resolves it, minus the hook.
 *  `Appearance.getColorScheme` is guarded because this debounce can fire after jest has torn the module
 *  down — it used to throw inside the timer, which surfaced as an uncaught TypeError on every test run
 *  and buried whatever real error came after it. */
const notifAccent = (s: Settings) => makeTheme(s, typeof Appearance?.getColorScheme === 'function' && Appearance.getColorScheme() === 'dark').c.acc;

/** `notif_log` is bookkeeping. It must never be the reason a scheduling pass or a notification action
 *  fails, and a repository that is not open yet must not turn an event handler into a crash, so both
 *  halves swallow: the `try` for the synchronous throw `R()` raises, the `catch` for the rejected write.
 *  The rejected write leaves a breadcrumb in the Problems log (audit L1) — swallowing it entirely meant
 *  a reminder could exist in the OS queue with no row here and no way to tell why. */
function logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number) {
  if (!id) return;
  // The log page is the only place this write is read, and it can already be on screen (a tapped
  // notification brings the app up), so it is re-read once the write has landed rather than at the
  // next resync — otherwise Delivery status keeps calling an opened reminder "queued".
  try { void R().logNotif(id, kind, dueAt, event, at).catch((e) => recordCrash(e, 'save', state.route)).then(() => refreshNotifLog()); } catch { /* repository not open yet */ }
}
function schedNotif(id: string, kind: string, dueAt: number) {
  if (!id) return;
  try { void R().schedNotif(id, kind, dueAt).catch((e) => recordCrash(e, 'save', state.route)); } catch { /* repository not open yet */ }
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
    /* The demo session plans nothing: a sample class must never arrive as a real bell. Leaving the
       tour calls resync(0) alongside adoption, so the real session starts planning at once. */
    if (demoMode) return;
    const now = Date.now(), plan = planReminders({ now, courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, settings: s.settings.notif, hour12: s.settings.hour12 });
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
    const nsSame = pn !== null && pn.permission === ns.permission && pn.scheduled === ns.scheduled && pn.next === ns.next && pn.canAskAgain === ns.canAskAgain && pn.queueRead === ns.queueRead && pn.lockText === ns.lockText && pn.platform === ns.platform;
    if (!planSame || !nsSame) set({ plan: planSame && p ? p : info, notifStatus: nsSame && pn ? pn : ns });
    await refreshNotifLog();
  }, delay);
}
export async function refreshNotifStatus() { set({ notifStatus: await notifs.status() }); await refreshNotifLog(); }

/* ───── the row, and its mirror ───── */

/** Read the terms, and repair `settings.semesterStart/End` from the active row when the two disagree.
 *
 *  v0.9 split one fact in two: the active `semesters` row is the truth and the settings pair is its
 *  mirror. The split is only safe if a mirror that drifts is repaired, because the pair is written by
 *  code that never touches the row — `act.setSettings` (the tour's last step, `adoptDemo`'s hand-over)
 *  and the import door's settings patch among them — while the whole app (Grades, export, the Settings
 *  summary, the attendance grid) keeps reading the pair. The row is authoritative; this is the one place
 *  that makes that true on read, so a KV-only writer is harmless instead of a permanent disagreement.
 *
 *  Called by `hydrate()` (a restart, and the boot right after a demo session was adopted) and by
 *  `loadSemesters()` (the in-session read; the tour wrote the KV before adoption in the same session).
 *  Both use the SAME helper so the two doors cannot disagree about which one wins.
 *
 *  Failure is not fatal and is not silent: a repository that cannot answer leaves the cached rows alone
 *  (returning `null`, so callers keep what they had) and lands in the Problems log. `setActiveSemester`
 *  throws on an unknown id — wrapped here, because a read must never throw at the call site. */
async function reconcileSemesters(): Promise<SemesterRow[] | null> {
  try {
    const rows = await R().listSemesters();
    const active = rows.find((x) => x.active);
    if (active && (state.settings.semesterStart !== active.start || state.settings.semesterEnd !== active.end)) {
      await R().setActiveSemester(active.id); // one transaction: the row is re-mirrored into the KV
      set({ settings: withDefaults((await R().load()).settings) }); // and the app reads what landed on disk
    }
    return rows;
  } catch (e) { recordCrash(e, 'data', 'Semesters'); return null; }
}

/* ───── hydrate ───── */
export async function hydrate(r: Repository) {
  repo = r;
  try {
    const snap = await r.load();
    applySnapshot(snap); configureFx(state.settings);
    const rows = await reconcileSemesters();
    set({ ready: true, now: Date.now(), semesters: rows ?? [] }); resync(1500);
    /* v0.9 WS4, both fire-and-forget: the launch that applied an update says so once, and this launch
       asks the channel once. Neither is awaited — a check must never sit between the user and the
       first frame — and both are total, so neither needs a catch at this call site. */
    void announceAppliedUpdate().then((text) => { if (text) toast(text); });
    void checkOnForeground();
  } catch (e) { set({ error: String((e as Error)?.message ?? e), ready: true }); }
}
/** What App.tsx runs to bring the app up — the open-and-decide step v0.1 grew.
 *
 *  It opens the REAL database first (and keeps it in `real`), then on a **genuine first run** —
 *  never onboarded, and no row the user made (`domain/rows.ts`) — hands this session the sample
 *  semester as a seeded `MemoryRepository` instead of re-pointing the store at the database. The
 *  tour then runs over data that was never written to the file: what the user taps into existence
 *  during the tour is written ONLY to that memory copy, `act.adoptDemo()` gives the non-demo rows
 *  back to the real repository when the tour is left, and until then `resync` schedules nothing,
 *  because no reminder may ring for a sample class. A device with real rows but no tour yet — an
 *  upgrade — hydrates from its own database as always and gets the tour without the samples. */
export async function boot() {
  const r = await openRepository();
  real = r;
  const snap = await r.load();
  if (!toured(snap.settings.onboarded) && !hasRealRows(snap)) {
    const d = new MemoryRepository();
    await d.seed(seedSnapshot());
    demoMode = true;
    await hydrate(d);
  } else {
    await hydrate(r);
  }
}
/** Put a snapshot into the store. `keepTimer` is the import path: it must not reset a running focus
 *  round, so the timer write is skipped entirely rather than being recomputed to the same value — a
 *  recomputed `initTimer` would lose the seconds already spent in this round. The snapshot's own
 *  settings win either way; the current ones are the base only so a partial patch cannot blank a
 *  setting the file did not carry. */
function applySnapshot(s: Partial<Snapshot>, keepTimer = false) {
  // Computed once: `withDefaults` rebuilds the whole settings object (and `initTimer` reads four of its
  // fields), so calling it per use rebuilt it four times per hydrate (audit M2).
  const settings = withDefaults(keepTimer ? { ...state.settings, ...(s.settings ?? {}) } : (s.settings ?? {}));
  const patch: Partial<State> = { settings };
  if (s.courses) patch.courses = s.courses;
  if (s.meetings) patch.meetings = s.meetings;
  if (s.attendance) patch.attendance = s.attendance;
  if (s.dayMarks) patch.dayMarks = s.dayMarks;
  if (s.tasks) patch.tasks = s.tasks;
  if (s.notices) patch.notices = s.notices;
  if (s.marks) patch.marks = s.marks;
  if (s.adjusts) patch.adjusts = s.adjusts;
  if (s.focus) patch.focus = s.focus;
  if (s.trips) patch.trips = s.trips;
  if (s.alarms) patch.alarms = s.alarms;
  if (s.variants) patch.variants = s.variants;
  if (!keepTimer) {
    patch.timer = initTimer({ planMin: settings.focusPresetMin, flow: settings.focusFlow, breakMs: settings.breakMin * 60_000, breaksAllowed: settings.breaksPerRound });
  }
  set(patch);
}
export const snapshotOf = (s: State = state): Snapshot => ({ courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, notices: s.notices, marks: s.marks, adjusts: s.adjusts, focus: s.focus, trips: s.trips, alarms: s.alarms, settings: s.settings });

/** The term an import asks for, written where v0.9 reads it: the active `semesters` row.
 *
 *  The import door wrote `settings.semesterStart/End` only, and the next `loadSemesters()` replaced
 *  that pair with the row's — so a file that says "the term starts 7 September" survived the toast and
 *  died on the next screen. The row is written here, after `importSnapshot` (a repository call inside
 *  its transaction would deadlock, the same reason it writes settings itself), and `setActiveSemester`
 *  mirrors the pair back into the KV, so the two cannot disagree afterwards.
 *
 *  Merge-only, as everywhere in this door: a file that carries no start changes nothing; a missing
 *  `semesterEnd` key keeps the row's end; an explicit empty one opens the term; and a start that would
 *  strand the old end (or a malformed end) takes the domain's own 15-week seed rather than storing an
 *  impossible pair. A repository with no active row gets one named from the start (`newSemester`'s
 *  naming rule). */
async function carryImportedRange(patch: Partial<Settings> | undefined) {
  const start = patch?.semesterStart;
  if (!isYmd(start)) return;
  const rows = await R().listSemesters();
  const active = rows.find((x) => x.active) ?? null;
  const carriesEnd = !!patch && 'semesterEnd' in patch;
  const said = carriesEnd ? String(patch?.semesterEnd ?? '') : active?.end ?? suggestEnd(start);
  const end = !said || (isYmd(said) && validRange(start, said)) ? said : suggestEnd(start);
  if (active && active.start === start && active.end === end) { set({ semesters: rows }); return; }
  const next: SemesterRow = active
    ? { ...active, start, end }
    : { ...newSemester(state.now), name: semesterName(start), start, end };
  await R().saveSemester(next);
  await R().setActiveSemester(next.id);
  set({ semesters: await R().listSemesters() });
}


/* ───── actions ───── */
export const act = {
  go(route: RouteName) { if (route === state.route) return; set({ prevRoute: state.route, route }); fx.page(); },
  open(sheet: SheetSpec) { fx.tap(); set({ sheet }); },
  /** Open the Settings sheet and land on a page inside it in ONE write, with ONE haptic.
   *
   *  The Settings tree is a stack, so a deep entry has always been expressible as two calls —
   *  `open({ t: 'settings' })` then `settingsPush('clock')` — but each is its own `set()`, and a
   *  `set()` is a synchronous broadcast to every `useStore` subscriber in the app plus its own sound.
   *  Two chained calls therefore cost two full broadcasts and two haptics on one tap: the clock face
   *  on Today does exactly this to reach Clock face, which is the press users report as "very
   *  slow and low response" between the finger-down and the sheet appearing.
   *
   *  React batches the *renders* these two writes cause, so the visible symptom was never a wrong
   *  screen — it was the delay before any frame: the store work in the same tick the press has to
   *  answer. One write does the same job with half the work, and the page it lands on is already the
   *  one the user tapped for, so there is no second hop to watch. */
  openSettingsAt(page: string) { fx.tap(); set({ sheet: { t: 'settings' }, settingsPath: ['appearance', page] }); },
  close() { set({ sheet: null }); },
  settingsPush(p: string) { fx.select(); set((s) => ({ settingsPath: [...s.settingsPath, p] })); },
  settingsPop() { set((s) => ({ settingsPath: s.settingsPath.slice(0, -1) })); },

  setSettings(patch: Partial<Settings>) {
    set((s) => ({ settings: { ...s.settings, ...patch } })); configureFx(state.settings); void persist(R().putSettings(patch));
    // The 12/24-hour choice reaches the notification BODIES the planner writes (`PlanInput.hour12`), so
    // flipping it has to rebuild the queue; every other display setting leaves the plan identical.
    if (patch.hour12 !== undefined) resync(400);
  },
  setNotif(patch: Partial<NotifSettings>) {
    const notif = { ...state.settings.notif, ...patch }; set((s) => ({ settings: { ...s.settings, notif } })); void persist(R().putSettings({ notif }));
    // D4: the channels are the truth for lock-screen text, so the toggle re-applies them rather than
    // trusting the setting alone. Nothing is awaited here — a refusal is read back by `status()`.
    if (patch.lockText !== undefined) void notifs.applyLockscreenText(notif.lockText);
    resync(500);
  },

  saveTask(t: Task) {
    const exists = state.tasks.some((x) => x.id === t.id);
    set((s) => ({ tasks: exists ? s.tasks.map((x) => (x.id === t.id ? t : x)) : [...s.tasks, t] })); void persist(R().upsert('task', t)); resync();
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
  setDay(date: string, status: DayStatus, reason = '') { const prev = state.dayMarks[date] ?? null; const r: DayMark = { date, status, at: Date.now(), reason }; set((s) => ({ dayMarks: { ...s.dayMarks, [date]: r } })); void persist(R().upsert('dayMark', r)); fx.stamp(status); resync(); toast(`Marked ${ST[status]}`, () => { set((s) => { const a = { ...s.dayMarks }; if (prev) a[date] = prev; else delete a[date]; return { dayMarks: a }; }); void persist(prev ? R().upsert('dayMark', prev) : R().remove('dayMark', date)); resync(); }); },
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
    /* `finish` refuses a session with less than a minute of focus, and the refusal is the whole point: the
       row would say a study session happened when nothing did, and it would land in the export and the
       heatmap (D2). What the refusal also did was say nothing at all — the audit pressed "end session"
       a few seconds in and got no toast, no ring movement and no Stats change, so the one-minute rule was
       invisible (audit UX-2). It now states itself. `save === false` is the discard path, where silence is
       the intent, so it stays silent. */
    if (sum) { act.addSession(sum); toast(`Saved ${Math.round(sum.focusSec / 60)} min of focus`); }
    else if (save) toast('Under a minute, so nothing was saved');
    const st = state.settings; set({ timer: initTimer({ planMin: st.focusPresetMin, flow: st.focusFlow, breakMs: st.breakMin * 60_000, breaksAllowed: st.breaksPerRound, taskId: state.timer.taskId, courseId: state.timer.courseId, title: state.timer.title }) });
    return sum;
  },
  /** called by the UI ticker; writes state only when something happened so a 4 Hz tick costs nothing */
  timerPump(now: number) {
    const t = state.timer; if (!t.running) return; const r = advance(t, now); if (r.events.length) { set({ timer: r.state }); applyEvents(r.events); }
  },
  /** Optimistic half of the repository purge: the same six collections the SQL DELETEs cover, so the
   *  screen cannot keep showing sample rows the database no longer has. */
  async purgeDemo() { await persist(R().purgeDemo()); set((s) => ({ courses: s.courses.filter((c) => !c.demo), meetings: s.meetings.filter((m) => !m.demo), notices: s.notices.filter((n) => !n.demo), marks: s.marks.filter((m) => !m.demo), tasks: s.tasks.filter((t) => !t.demo), focus: s.focus.filter((f) => !f.demo) })); toast('Sample data removed'); resync(); },
  /** The import path's write half. The parser has already refused anything it could not read, so a plan
   *  with problems is never applied; a plan without them lands in ONE transaction, and the store is then
   *  reloaded from the repository rather than patched from the file, so what is on screen is exactly what
   *  is on disk. The timer is deliberately kept (`applySnapshot(..., true)`): importing a term's timetable
   *  in the middle of a focus round must not end that round. */
  async importPlan(plan: ImportPlan): Promise<boolean> {
    if (plan.problems.length) return false;
    try {
      await R().importSnapshot(plan.snapshot);
      await carryImportedRange(plan.snapshot.settings);
      applySnapshot(await R().load(), true);
      configureFx(state.settings);
      const rows = Object.values(plan.counts).reduce((a, b) => a + b, 0);
      toast(rows ? `Imported ${rows} row${rows === 1 ? '' : 's'}` : 'Semester saved');
      resync(0);
      return true;
    } catch (e) {
      recordCrash(e, 'save', 'Import');
      toast(`Import failed: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
      return false;
    }
  },
  /* ── semesters (v0.9) ─────────────────────────────────────────────────────────────────────────
   * `settings.semesterStart/End` stopped being the truth in v0.9: the active `semesters` row is, and
   * the pair is its mirror. Every write below goes through the repository's own mirror writer
   * (`setActiveSemester`) rather than writing the settings directly, so a range cannot end up on
   * screen that the row does not have. The store keeps the loaded rows so the Semesters page and the
   * Settings attendance control read and write the same term without a query per keystroke. */

  /** List the terms. The active row is authoritative, so a settings mirror that disagrees with it is
   *  rewritten from the row as part of this read — a KV-only writer is therefore harmless rather than
   *  something every caller has to know about. A repository with no active row heals with today's term
   *  (fresh install, a wipe, or a roll-over killed between archiving and activating) inside the same
   *  call, and its mirror write comes back through the same reconciliation. */
  async loadSemesters() {
    const rows = await reconcileSemesters(); // records the failure itself; `null` keeps the cached rows
    if (rows) set({ semesters: rows });
  },

  async renameSemester(id: string, name: string) {
    const clean = name.trim(), row = state.semesters.find((x) => x.id === id);
    if (!clean || !row || row.name === clean) return;
    const next: SemesterRow = { ...row, name: clean };
    set((s) => ({ semesters: s.semesters.map((x) => (x.id === id ? next : x)) }));
    await persist(R().saveSemester(next));
  },

  /** Save one term's range. The active term's pair is mirrored by `setActiveSemester`; an archived
   *  term keeps its own range and never touches what the app is reading today. */
  async setSemesterRange(id: string, semesterStart: string, semesterEnd: string) {
    const row = state.semesters.find((x) => x.id === id);
    if (!row) return;
    const next: SemesterRow = { ...row, start: semesterStart, end: semesterEnd };
    set((s) => ({
      semesters: s.semesters.map((x) => (x.id === id ? next : x)),
      ...(row.active ? { settings: { ...s.settings, semesterStart, semesterEnd } } : {}),
    }));
    await persist(R().saveSemester(next));
    if (row.active) await persist(R().setActiveSemester(id));
  },

  /** The Settings → Attendance control knows the range but not the id. The active row is the one it
   *  means, so the write goes through `setSemesterRange` — a settings-only write would leave the row
   *  printing last term's dates. */
  async setActiveRange(semesterStart: string, semesterEnd: string) {
    // The mirror moves first and synchronously: this control sits under the user's finger, and a day
    // typed into it must read back before the row write's promise resolves.
    set((s) => ({ settings: { ...s.settings, semesterStart, semesterEnd } }));
    let active = state.semesters.find((x) => x.active);
    if (!active) {
      try {
        const rows = await R().listSemesters();
        set({ semesters: rows });
        active = rows.find((x) => x.active);
      } catch (e) { recordCrash(e, 'data', 'Settings'); }
    }
    if (!active) {
      // No row at all (a preview, or a store built for a test): the mirror is all there is to write.
      await persist(R().putSettings({ semesterStart, semesterEnd }));
      return;
    }
    const next: SemesterRow = { ...active, start: semesterStart, end: semesterEnd };
    set((s) => ({ semesters: s.semesters.map((x) => (x.id === active!.id ? next : x)) }));
    await persist(R().saveSemester(next));
    await persist(R().setActiveSemester(active.id));
  },

  /** Roll the term over: freeze the live rows into the old row's snapshot, clear the day tables (the
   *  owner chooses whether attendance goes with them), create the next term and make it active. The
   *  order matters — the archive is written before anything is cleared, and the next row exists before
   *  it becomes the one the app reads, so a kill in between leaves history, never a lost term. */
  async rollOverSemester(keepAttendance: boolean) {
    const active = state.semesters.find((x) => x.active);
    if (!active) return;
    try {
      const snapshotJson = buildSnapshot(state.courses, state.meetings, state.attendance, state.marks, state.tasks, state.settings, state.variants);
      await R().saveSemester({ ...active, active: false, snapshotJson, archivedAt: new Date().toISOString() });
      await R().clearActiveSchedule(keepAttendance);
      const next = newSemester(state.now);
      await R().saveSemester(next);
      await R().setActiveSemester(next.id);
      applySnapshot(await R().load(), true);
      configureFx(state.settings);
      set({ semesters: await R().listSemesters() });
      toast(`${active.name} archived${keepAttendance ? ' — attendance kept' : ''}`);
      resync(0);
    } catch (e) {
      recordCrash(e, 'save', 'Semesters');
      toast(`Couldn't start a new semester: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
    }
  },

  /** The one true "erase everything": wipe every table (on device, the FILE itself — SQLite's close
   *  + delete, WAL/SHM with it), then re-open a fresh, EMPTY database. No sample semester comes
   *  back: since v0.1 the demo set is a first-session memory playground, not something the database
   *  holds, so a full reset leaves a clean planner. */
  async resetAll() {
    try {
      await ensureRepo().then((r) => persist(r.wipe()));
      repo = real = await openRepository();
      const snap = await R().load(); applySnapshot(snap); configureFx(state.settings); demoMode = false;
      /* The rows cached from the erased file are gone with it: a later `setActiveRange` (Settings →
         Attendance, before the Semesters page has ever been opened) would otherwise find the ghost
         active row and write it back into the fresh database. Cleared rather than reloaded — the heal
         is lazy, and `listSemesters()` creates the new term when something reads it. */
      set({ ready: true, error: null, semesters: [] }); toast('Everything erased'); resync(300);
    } catch (e) { set({ error: `Couldn't reset: ${String((e as Error)?.message ?? e).slice(0, 80)}` }); }
  },
  /** Called when the tour is left, however it is left (App.tsx maps the finishes: "Get started"
   *  passes `false`, "Keep exploring" and every skip pass `true`). The demo session's memory copy
   *  is reconciled into the real database: the rows the USER made — anything whose `demo` flag is
   *  still set is by definition not theirs — plus attendance, day marks, adjustments, trips, alarms
   *  and the settings they changed while exploring. The six sample collections never migrate, so
   *  the promise "the demo data is not inside the actual database" survives every path out of the
   *  tour. After adoption the store points back at the real database, and `resync(0)` lets the
   *  real session plan again.
   *
   *  `keepSamples` is only about what stays on screen for the rest of THIS session: "Keep
   *  exploring" means the sample semester continues to be visible; it was never persisted, so the
   *  next launch opens on the real planner alone. A failed reconciliation write lands in the
   *  Problems log with a toast (as every save does) and the switch still happens — there is
   *  nothing better kept for the user in a memory-only copy. */
  async adoptDemo(keepSamples: boolean) {
    if (!demoMode) return keepSamples ? undefined : act.purgeDemo();
    demoMode = false;
    const session = R();                    // the memory repository everything this session wrote
    const snap = await session.load();
    real = real ?? await openRepository();
    const r = real;
    await persist((async () => {
      for (const row of snap.courses) if (!row.demo) await r.upsert('course', row);
      for (const row of snap.meetings) if (!row.demo) await r.upsert('meeting', row);
      for (const row of snap.tasks) if (!row.demo) await r.upsert('task', row);
      for (const row of snap.notices) if (!row.demo) await r.upsert('notice', row);
      for (const row of snap.marks) if (!row.demo) await r.upsert('mark', row);
      for (const row of snap.focus) if (!row.demo) await r.upsert('focus', row);
      for (const a of Object.values(snap.attendance)) await r.upsert('attendance', a);
      for (const d of Object.values(snap.dayMarks)) await r.upsert('dayMark', d);
      for (const [courseId, adj] of Object.entries(snap.adjusts)) await r.upsert('adjust', { courseId, adj });
      for (const t of snap.trips) await r.upsert('trip', t);
      for (const a of snap.alarms) await r.upsert('alarm', a);
      const { seededAt: _drop, ...settings } = snap.settings; // a sample-made timestamp never migrates
      void _drop;
      await r.putSettings(settings);
    })());
    repo = r;
    /* The term cache belongs to the repository that is now open. Boot hydrated from the DEMO memory
       copy, so `state.semesters` still held the sample term; leaving it there let the next Settings →
       Attendance edit save that phantom id into the real file and deactivate the term the user actually
       had — the failure `resetAll` had, at the other repository swap, and the same cure in the same
       order: the cache is cleared synchronously with the swap (a write can never interleave and find
       the sample rows, and this cannot fail, so the phantom is gone for good even if the next step
       throws). The re-read right after is for the session's UX, not correctness: a real term exists by
       the time it answers — `listSemesters()` heals one, carrying the range the hand-over just stored —
       so the Semesters page is correct without waiting for a lazy load, and the same read re-mirrors
       the settings pair from the row. Should that read fail (recorded there, never thrown), the cache
       is already empty and `setActiveRange`'s own no-active-row path re-reads and heals. */
    set({ semesters: [] });
    await act.loadSemesters();
    set((s: State) => (keepSamples ? s : { courses: s.courses.filter((c) => !c.demo), meetings: s.meetings.filter((m) => !m.demo), notices: s.notices.filter((n) => !n.demo), marks: s.marks.filter((m) => !m.demo), tasks: s.tasks.filter((t) => !t.demo), focus: s.focus.filter((f) => !f.demo) }));
    toast(keepSamples ? 'Your work is saved — the samples stay until the next session' : 'Your planner is empty — add your first class');
    resync(0);
  },
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
  RNAppState.addEventListener('change', (st) => { if (st === 'active') { set({ now: Date.now() }); resync(400); void refreshNotifStatus(); void checkOnForeground(); } });
  notifs.onOpened((o) => dispatchOpened(o, notifEffects()));
  notifs.onReceived((kind, id, at) => { fx.chime(); if (isPlannedKind(kind)) logNotif(id, kind, at, 'shown', Date.now()); });
}
