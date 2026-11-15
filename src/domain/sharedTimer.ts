/**
 * The shared focus timer (vault-sync SYNC_PROTOCOL §8): the desktop hub holds ONE live timer for Margin, phone
 * Obsidian and desktop Obsidian. Margin's own timer has more to it (rounds, breaks, flow overtime), so this maps
 * between the two. The hub's state is the truth for "is it running and when does it end"; Margin keeps its
 * rounds and breaks locally.
 *
 * Rules (so two screens never disagree):
 *  · the hub's `endsAt` is on the hub's clock; `offset` = hub clock − phone clock (from the sync service);
 *  · a start while another device's timer is live does not make a second timer: the hub answers with the live
 *    one (`conflict: "running"`) and Margin joins it;
 *  · the session is recorded once, by the timer's OWNER (the device that started it), however it ends: a stop
 *    pressed on another device makes the owner save it; a joined timer finished here is not saved here;
 *  · Margin's break is a `break` op (phase "break" on the hub, a pause with the right time left to old clients);
 *    the hub resumes focus at the break's end by itself, and a break started elsewhere puts Margin on it too;
 *  · every op is stamped with `at` (hub clock) and `baseRev` (the state it was made on), and frames older than
 *    the one applied are dropped (`newerHub`): same rules as vault-sync core/src/timer.js (SYNC_PROTOCOL §8);
 *  · `done` early on another device (skipped there, or finished while Margin sat paused) ends it here too.
 */
import { initTimer, advance, nudgeStep, type TimerState } from './timer';

export interface HubTimer {
  timerId: string; status: 'running' | 'paused' | 'stopped' | 'done'; durationMs: number; startedAt: number; endsAt: number;
  remainingMs: number | null; label: string | null; task: { marginId?: string; path?: string; blockId?: string } | null;
  flow?: boolean; rev: number; by: string; conflict?: string;
  /** hub v0.7.2: focus | break (a break inside a round is status paused + breakEndsAt), the hub's state epoch,
   *  when it ended, and the op frame this answers */
  phase?: 'focus' | 'break'; breakEndsAt?: number | null; epoch?: string; endedAt?: number | null; ref?: string;
  /** the device that started it (hub v0.7.1); older hubs: `by` of the start */
  owner?: string;
}
export type TimerOp = { op: 'start'; timerId: string; durationMs: number; label: string; task: { marginId: string } | null; flow: boolean }
  | { op: 'pause' | 'resume' | 'stop'; timerId: string }
  | { op: 'break'; timerId: string; durationMs: number };
export type Stamped = TimerOp & { at: number; baseRev: number };

/** When it happened on the hub's clock, and which hub state it was made on: the hub orders two devices' ops
 *  (and replays offline ones) by these. */
export function stampOp(op: TimerOp, now: number, offset: number, last: { rev: number; epoch?: string } | null): Stamped {
  return { ...op, at: now + offset, baseRev: last?.rev ?? 0 };
}
/** Is `inc` newer than (or the same as) the hub state already applied? A late frame must never roll Margin back. */
export function newerHub(last: { rev: number; epoch?: string } | null, inc: HubTimer): boolean {
  if (!last) return true;
  if ((inc.epoch ?? null) !== (last.epoch ?? null)) return true;
  return (inc.rev ?? 0) >= (last.rev ?? 0);
}

/** Read a frame from the sync service. Raw ops relayed from phone Obsidian have no `status`: they are not state. */
export function parseHubTimer(json: string): HubTimer | null {
  try {
    const m = JSON.parse(json) as Partial<HubTimer>;
    if (!m || typeof m.timerId !== 'string' || !m.status || typeof m.durationMs !== 'number') return null;
    if (!['running', 'paused', 'stopped', 'done'].includes(m.status)) return null;
    return { remainingMs: null, label: null, task: null, rev: 0, by: '', startedAt: 0, endsAt: 0, ...m } as HubTimer;
  } catch { return null; }
}

export const newTimerId = (now: number) => `M${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** What Margin's own change means for everyone else. `before` → `after` from one timer action. */
export function opFor(before: TimerState, after: TimerState, sharedId: string | null, now: number): { op: TimerOp | null; sharedId: string | null } {
  const startOp = (): { op: TimerOp; sharedId: string } => {
    const id = newTimerId(now);
    return { sharedId: id, op: { op: 'start', timerId: id, durationMs: Math.max(1000, after.focusLeftMs), label: after.title || 'Focus', task: after.taskId ? { marginId: after.taskId } : null, flow: after.flow } };
  };
  // finished / discarded: back to the dial
  if (after.phase === 'set' && before.phase !== 'set') return { op: sharedId ? { op: 'stop', timerId: sharedId } : null, sharedId: null };
  // a new session, or the next round after a finished one (a fresh countdown)
  if (after.running && after.phase === 'focus' && (before.phase === 'set' || (before.focusLeftMs === 0 && after.focusLeftMs > 0))) return startOp();
  const runningFocus = (t: TimerState) => t.running && t.phase === 'focus';
  if (runningFocus(before) && after.phase === 'break') return { op: sharedId ? { op: 'break', timerId: sharedId, durationMs: Math.max(1000, after.breakLeftMs) } : null, sharedId };
  if (runningFocus(before) && !runningFocus(after)) return { op: sharedId ? { op: 'pause', timerId: sharedId } : null, sharedId };
  if (!runningFocus(before) && runningFocus(after)) return sharedId ? { op: { op: 'resume', timerId: sharedId }, sharedId } : startOp();
  return { op: null, sharedId };
}

export interface FromHub {
  /** none: nothing to change · set: show `state` · end: clear Margin's timer (ended elsewhere); `save` when Margin owns it */
  action: 'none' | 'set' | 'end';
  save?: boolean;
  owner?: string | null;
  state?: TimerState;
  /** save Margin's own running session before switching to another device's timer */
  saveFirst?: boolean;
  sharedId: string | null;
}
export interface Ctx { sharedId: string | null; me: string; now: number; offset: number; flow: boolean; breakMs: number; breaksAllowed: number; knownTask: (id: string) => { courseId: string | null } | null }

/** Apply the hub's state to Margin's timer. Pure: the caller commits. */
export function fromHub(local0: TimerState, h: HubTimer, c: Ctx): FromHub {
  const local = local0.running ? advance(local0, c.now).state : local0;
  const same = c.sharedId === h.timerId;
  const left = h.status === 'running' ? Math.max(0, h.endsAt - (c.now + c.offset)) : Math.max(0, h.remainingMs ?? 0);

  if (h.status === 'stopped') {
    // ended on another device: cleared here, and saved here only when Margin started it
    return same && local.phase !== 'set' && h.by !== c.me ? { action: 'end', save: (h.owner ?? '') === c.me, sharedId: null, owner: null } : { action: 'none', sharedId: same ? null : c.sharedId };
  }
  if (h.status === 'done') {
    // the round's end: each device shows its own (flow keeps counting) — unless it ended EARLY elsewhere (skipped,
    // or resumed and finished there while Margin sat paused): then it ends here too, saved only by its owner
    const early = same && local.phase !== 'set' && local.focusLeftMs > 3000 && !(local.running && local.focusLeftMs === 0);
    return early ? { action: 'end', save: (h.owner ?? h.by) === c.me, sharedId: null, owner: null } : { action: 'none', sharedId: c.sharedId };
  }
  const hubBreak = h.status === 'paused' && h.phase === 'break' && !!h.breakEndsAt;
  const breakLeft = hubBreak ? Math.max(0, (h.breakEndsAt as number) - (c.now + c.offset)) : 0;

  // running or paused
  if (!same || local.phase === 'set') {
    const taskId = h.task?.marginId && c.knownTask(h.task.marginId) ? h.task.marginId : null;
    const base = initTimer({ planMin: Math.max(1, Math.round(h.durationMs / 60_000)), flow: h.flow ?? c.flow, breakMs: c.breakMs, breaksAllowed: c.breaksAllowed, taskId, courseId: taskId ? c.knownTask(taskId)?.courseId ?? null : null, title: h.label || 'Focus' });
    const state: TimerState = { ...base, phase: 'focus', running: h.status === 'running', startedAt: h.startedAt ? h.startedAt - c.offset : c.now, checkpoint: c.now, focusLeftMs: left, focusElapsedMs: Math.max(0, h.durationMs - left) };
    // our own session is running on its own: keep its minutes, then join (the hub chose the other one)
    const saveFirst = local.phase !== 'set' && local.focusElapsedMs >= 60_000 && h.conflict !== 'running';
    return { action: 'set', state, saveFirst, sharedId: h.timerId, owner: h.owner ?? h.by };
  }
  if (hubBreak) {
    // on a break started elsewhere (or our own echo): the same break, ending at the same moment
    if (local.phase === 'break' && Math.abs(local.breakLeftMs - breakLeft) <= 3000) return { action: 'none', sharedId: h.timerId };
    const total = Math.max(breakLeft, local.phase === 'break' ? local.breakTotalMs : breakLeft), done = Math.max(0, total - breakLeft), step = nudgeStep(total);
    return { action: 'set', state: { ...local, phase: 'break', running: true, checkpoint: c.now, focusLeftMs: left, breakLeftMs: breakLeft, breakTotalMs: total, breakElapsedMs: done, nextNudgeMs: (Math.floor(done / step) + 1) * step, breaksUsed: local.phase === 'break' ? local.breaksUsed : local.breaksUsed + 1 }, sharedId: h.timerId };
  }
  if (local.phase === 'break') {
    // resumed elsewhere: the break is over here too
    return h.status === 'running' ? { action: 'set', state: { ...local, phase: 'focus', running: true, checkpoint: c.now, breakLeftMs: 0, focusLeftMs: left }, sharedId: h.timerId } : { action: 'none', sharedId: h.timerId };
  }
  const flowing = local.running && local.focusLeftMs === 0;
  if (h.status === 'paused' && local.running) return { action: 'set', state: { ...local, running: false, focusLeftMs: flowing ? 0 : left }, sharedId: h.timerId };
  if (h.status === 'running' && !local.running) return { action: 'set', state: { ...local, running: true, checkpoint: c.now, focusLeftMs: left }, sharedId: h.timerId };
  // both running: correct a drift over 3 s (clock skew, a late frame); never pull a flowing round back
  if (h.status === 'running' && !flowing && Math.abs(local.focusLeftMs - left) > 3000) return { action: 'set', state: { ...local, checkpoint: c.now, focusLeftMs: left }, sharedId: h.timerId };
  return { action: 'none', sharedId: h.timerId };
}
