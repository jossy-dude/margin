import type { Task } from '../../domain/types';
import { advance, endBreak, finish, initTimer, setMinutes, startBreak, toggle as timerToggleEngine } from '../../domain/timer';
import { fx } from '../../services/fx';
import * as notifs from '../../services/notifications';
import { getState, set } from '../core';
import { toast } from '../toast';
import { addSession } from './entities';
import { go } from './nav';
import type { TimerState } from '../../domain/timer';
import { fromHub, opFor, parseHubTimer } from '../../domain/sharedTimer';
import { syncStatus, syncTimer } from '../../services/native';

/* ── the shared timer (domain/sharedTimer.ts): one timer across Margin, phone and desktop Obsidian ── */
let sharedId: string | null = null, sharedOwner: string | null = null, applying = false;
/** A joined timer belongs to the device that started it: that device saves the session (exactly once). */
const joined = () => !!sharedId && !!sharedOwner && sharedOwner !== (syncStatus()?.deviceId ?? '');
/** Tell the hub what Margin's own change means (a no-op when not paired or offline: the hub decides). */
function announce(before: TimerState, after: TimerState) {
  if (applying) return;
  const r = opFor(before, after, sharedId, Date.now());
  if (r.op?.op === 'start') sharedOwner = syncStatus()?.deviceId ?? null;
  sharedId = r.sharedId; if (!sharedId) sharedOwner = null;
  if (r.op) syncTimer(r.op);
}

function applyEvents(ev: string[]) {
  if (ev.length) set({ fev: { k: ev[ev.length - 1] as string, at: Date.now() } });
  for (const e of ev) { if (e === 'roundDone') fx.roundDone(); else if (e === 'breakDone') { fx.peel(); setTimeout(() => fx.fall(), 350); } else if (e === 'nudge') fx.nudge(); else if (e === 'warn10') fx.blip(); }
}

/* focus timer */
export const timerActions = {
  /** `courseId` files a free session under a subject (the "+" sheet's subject, Focus's own picker). */
  focusOpen(taskId: string | null, courseId: string | null = null) {
    const st0 = getState();
    const t = taskId ? st0.tasks.find((x) => x.id === taskId) : null, st = st0.settings;
    if (st0.timer.phase === 'set' || !st0.timer.running) set({ timer: initTimer({ planMin: t?.estimateMin ? Math.min(240, Math.max(5, Math.round(t.estimateMin / 5) * 5)) : st.focusPresetMin, flow: st.focusFlow, breakMs: st.breakMin * 60_000, breaksAllowed: st.breaksPerRound, taskId, courseId: t?.courseId ?? courseId, title: t?.title ?? 'Free focus' }) });
    set({ focusTaskId: taskId }); go('Focus');
  },
  /** What the session is for, chosen before it starts. A session's subject is what Stats and the Focus log
   *  count it under, so it is fixed once the round is running (the record would otherwise split one sitting
   *  between two subjects). A task chosen earlier stays only if it belongs to the new subject. */
  timerSetSubject(courseId: string | null) {
    const st = getState(); if (st.timer.phase !== 'set') return;
    const c = courseId ? st.courses.find((x) => x.id === courseId) : null, task = st.tasks.find((x) => x.id === st.timer.taskId);
    const keep = task && task.courseId === courseId ? task : null;
    set((s) => ({ timer: { ...s.timer, courseId: c ? c.id : null, taskId: keep?.id ?? null, title: keep?.title ?? c?.name ?? 'Free focus' }, focusTaskId: keep?.id ?? null }));
  },
  timerSetMin(min: number) { set((s) => ({ timer: setMinutes(s.timer, min) })); },
  timerSetFlow(flow: boolean) { set((s) => ({ timer: { ...s.timer, flow } })); },
  timerToggle() {
    const now = Date.now(), before = getState().timer, r = timerToggleEngine(before, now); set({ timer: r.state }); applyEvents(r.events); announce(before, r.state);
    const t = r.state;
    if (t.running && t.phase === 'focus') void notifs.scheduleFocusEnd(now + t.focusLeftMs, 'Round finished', `${t.title || 'Focus'} · ${t.planMin} min done. Take a breath.`); else void notifs.cancelFocusEnd();
    return t;
  },
  timerBreak() { const now = Date.now(), before = getState().timer, t = startBreak(before, now); if (t.phase !== 'break') { fx.denied(); return; } set({ timer: t }); announce(before, t); fx.breakStart(); void notifs.scheduleFocusEnd(now + t.breakLeftMs, 'Break is over', 'Back to it when you are ready.'); },
  timerBackNow() { const now = Date.now(), before = getState().timer, t = endBreak(before, now); set({ timer: t }); announce(before, t); fx.peel(); setTimeout(() => fx.fall(), 350); if (t.running) void notifs.scheduleFocusEnd(now + t.focusLeftMs, 'Round finished', `${t.title || 'Focus'} · done.`); },
  /** `quiet`: the caller shows its own receipt (Focus's saved card), so the toast would say it twice. */
  timerFinish(save = true, quiet = false) {
    // a timer joined from another device is saved there (its owner), never twice
    if (save && !applying && joined()) { save = false; if (!quiet) toast('Saved on the device that started it'); quiet = true; }
    const now = Date.now(), sum = save ? finish(getState().timer, now) : null; void notifs.cancelFocusEnd();
    /* `finish` refuses a session with less than a minute of focus, and the refusal is the whole point: the
       row would say a study session happened when nothing did, and it would land in the export and the
       heatmap (D2). What the refusal also did was say nothing at all — the audit pressed "end session"
       a few seconds in and got no toast, no ring movement and no Stats change, so the one-minute rule was
       invisible (audit UX-2). It now states itself. `save === false` is the discard path, where silence is
       the intent, so it stays silent. */
    if (sum) { addSession(sum); if (!quiet) toast(`Saved ${Math.round(sum.focusSec / 60)} min of focus`); }
    else if (save) toast('Under a minute, so nothing was saved');
    const st = getState().settings, tm = getState().timer;
    const next = initTimer({ planMin: st.focusPresetMin, flow: st.focusFlow, breakMs: st.breakMin * 60_000, breaksAllowed: st.breaksPerRound, taskId: tm.taskId, courseId: tm.courseId, title: tm.title });
    set({ timer: next }); announce(tm, next);
    return sum;
  },
  /** called by the UI ticker; writes state only when something happened so a 4 Hz tick costs nothing */
  timerPump(now: number) {
    const t = getState().timer; if (!t.running) return; const r = advance(t, now);
    // A clock that moved back re-anchors inside `advance`; that has to be committed too, or every later
    // view would re-derive from the old (future) checkpoint and the timer would sit still.
    if (r.events.length || now < t.checkpoint) { set({ timer: r.state }); applyEvents(r.events); if (r.events.includes('breakDone')) announce(t, r.state); }
  },
  /** The hub's timer state arrived (a frame from the sync service, or one queued while JS slept). */
  timerFromHub(json: string) {
    const h = parseHubTimer(json); if (!h) return;
    const st = getState(), s = st.settings, now = Date.now(), status = syncStatus();
    const r = fromHub(st.timer, h, { sharedId, me: status?.deviceId ?? '', now, offset: status?.offset ?? 0, flow: s.focusFlow, breakMs: s.breakMin * 60_000, breaksAllowed: s.breaksPerRound,
      knownTask: (id) => { const t = st.tasks.find((x) => x.id === id); return t ? { courseId: t.courseId } : null; } });
    sharedId = r.sharedId; if (r.owner !== undefined) sharedOwner = r.owner;
    if (r.action === 'none') return;
    applying = true;
    try {
      if (r.action === 'end') { const sum = timerActions.timerFinish(!!r.save, true); toast(sum ? `Focus ended on your other device · saved ${Math.round(sum.focusSec / 60)} min` : 'Focus ended on your other device'); return; }
      if (r.saveFirst) timerActions.timerFinish(true, true);
      const t = r.state!; set({ timer: t });
      if (t.running && t.phase === 'focus') void notifs.scheduleFocusEnd(now + t.focusLeftMs, 'Round finished', `${t.title || 'Focus'} · done.`); else void notifs.cancelFocusEnd();
      if (h.conflict === 'running') toast('Joined the timer already running on your other device');
    } finally { applying = false; }
  },
  /** The link to the desktop came back: say again what Margin is running, so the hub knows or answers with its own. */
  timerRejoin() {
    const t = getState().timer;
    if (!t.running || t.phase !== 'focus' || !sharedId || applying) return;
    syncTimer({ op: 'start', timerId: sharedId, durationMs: Math.max(1000, t.focusLeftMs), label: t.title || 'Focus', task: t.taskId ? { marginId: t.taskId } : null, flow: t.flow });
  },
  /** swap the task shown on the Focus page (only while the dial is still being set) */
  timerSwap() {
    const st = getState();
    const open = st.tasks.filter((t) => t.status !== 2).sort((a, b) => (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15)); if (!open.length || st.timer.phase !== 'set') return;
    const i = open.findIndex((t) => t.id === st.timer.taskId), t = open[(i + 1) % open.length] as Task; fx.swipe();
    set((s) => ({ timer: { ...s.timer, taskId: t.id, courseId: t.courseId, title: t.title }, focusTaskId: t.id }));
  },
};
