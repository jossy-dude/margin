/** Pure focus-timer state machine. Everything is derived from timestamps, so backgrounding the app cannot desync it. */
export type Phase = 'set' | 'focus' | 'break';
export type TimerEvent = 'roundDone' | 'breakDone' | 'nudge' | 'warn10';
export interface TimerState {
  phase: Phase; running: boolean; planMin: number; flow: boolean; startedAt: number | null; checkpoint: number;
  focusLeftMs: number; overMs: number; focusElapsedMs: number; warned: boolean;
  breakLeftMs: number; breakTotalMs: number; breakElapsedMs: number; nextNudgeMs: number; breakDoneMs: number;
  breaksUsed: number; breaksAllowed: number; breakMs: number; rounds: number;
  taskId: string | null; courseId: string | null; title: string;
}
export const NUDGE_MS = 5 * 60_000, MIN_BREAK_AFTER_MS = 5 * 60_000;
/** A break must be able to wiggle at least once before it ends, so the nudge step is a third of its own
    length — never longer than NUDGE_MS, never shorter than a minute. A fixed 5-minute step silently never
    fires on a 5-minute break, which is the default, so the sticker sat perfectly still. */
export const nudgeStep = (breakMs: number) => Math.max(60_000, Math.min(NUDGE_MS, Math.floor(breakMs / 3 / 60_000) * 60_000));
/** How often the break sticker actually wiggles for a break of `breakMs`. The same arithmetic as
 *  `nudgeStep`, as words.
 *
 *  This exists because Settings → Focus & breaks said "nudges you every 5 minutes" for every break length,
 *  which was true of none of them: `floor(breakMs/3/60_000)` is 1 for anything from 3 to 8 minutes, so the
 *  default 5-minute break wiggles once a **minute**, four times. The stepper on that page offers 1–30
 *  minutes, so the honest thing is to say what the stepper is about to do rather than to name one number.
 *  Below 3 minutes there is no third to take and the floor of one minute wins. `src/test/settings-render.test.ts`
 *  asserts this sentence against `nudgeStep` over the whole 1–30 range, so the copy cannot drift from the code
 *  again. */
export function nudgeWord(breakMs: number): string {
  const min = Math.round(nudgeStep(breakMs) / 60_000);
  return min === 1 ? 'every minute' : `every ${min} minutes`;
}
/** Flow keeps crediting overtime past the round, but only this much: walking away must not bill focus that never happened. */
export const FLOW_OVER_CAP_MS = 15 * 60_000;
const overRoom = (overMs: number) => Math.max(0, FLOW_OVER_CAP_MS - overMs);
export const breakFor = (planMin: number) => (planMin >= 90 ? 15 : planMin >= 50 ? 10 : 5);
export const initTimer = (o: Partial<Pick<TimerState, 'planMin' | 'flow' | 'breakMs' | 'breaksAllowed' | 'taskId' | 'courseId' | 'title'>> = {}): TimerState => {
  const planMin = o.planMin ?? 25;
  return { phase: 'set', running: false, planMin, flow: o.flow ?? true, startedAt: null, checkpoint: 0, focusLeftMs: planMin * 60_000, overMs: 0, focusElapsedMs: 0, warned: false,
    breakLeftMs: 0, breakTotalMs: 0, breakElapsedMs: 0, nextNudgeMs: NUDGE_MS, breakDoneMs: 0, breaksUsed: 0, breaksAllowed: o.breaksAllowed ?? 2, breakMs: o.breakMs ?? breakFor(planMin) * 60_000,
    rounds: 0, taskId: o.taskId ?? null, courseId: o.courseId ?? null, title: o.title ?? '' };
};
export const setMinutes = (s: TimerState, min: number): TimerState => (s.phase !== 'set' ? s : { ...s, planMin: min, focusLeftMs: min * 60_000 });

export interface Advanced { state: TimerState; events: TimerEvent[] }
/** Apply the wall-clock time that passed since the last checkpoint. */
export function advance(s0: TimerState, now: number): Advanced {
  let s = { ...s0 }; const events: TimerEvent[] = [];
  for (let guard = 0; guard < 8 && s.running; guard++) {
    const dt = Math.max(0, now - s.checkpoint);
    if (dt === 0) break;
    if (s.phase === 'focus') {
      if (s.focusLeftMs > 0) {
        if (dt >= s.focusLeftMs) {
          const rest = dt - s.focusLeftMs; s.focusElapsedMs += s.focusLeftMs; s.focusLeftMs = 0; s.rounds++; events.push('roundDone');
          if (s.flow) { const o = Math.min(rest, overRoom(s.overMs)); s.overMs += o; s.focusElapsedMs += o; s.checkpoint = now; } else { s.running = false; s.checkpoint = now; }
        } else {
          const before = s.focusLeftMs; s.focusLeftMs -= dt; s.focusElapsedMs += dt; s.checkpoint = now;
          if (!s.warned && before > 10_000 && s.focusLeftMs <= 10_000) { s.warned = true; events.push('warn10'); }
        }
      } else { const o = Math.min(dt, overRoom(s.overMs)); s.overMs += o; s.focusElapsedMs += o; s.checkpoint = now; }
      break;
    }
    if (s.phase === 'break') {
      if (dt >= s.breakLeftMs) {
        const rest = dt - s.breakLeftMs; s.breakElapsedMs += s.breakLeftMs; s.breakDoneMs += s.breakLeftMs; s.breakLeftMs = 0;
        while (s.breakElapsedMs >= s.nextNudgeMs && s.nextNudgeMs < s.breakTotalMs) { events.push('nudge'); s.nextNudgeMs += nudgeStep(s.breakTotalMs); }
        events.push('breakDone'); s.phase = 'focus'; s.checkpoint = now - rest; continue; // the excess belongs to focus again
      }
      s.breakLeftMs -= dt; s.breakElapsedMs += dt; s.breakDoneMs += dt; s.checkpoint = now;
      while (s.breakElapsedMs >= s.nextNudgeMs) { events.push('nudge'); s.nextNudgeMs += nudgeStep(s.breakTotalMs); }
      break;
    }
    break;
  }
  return { state: s, events };
}
export interface TimerView { state: TimerState; phase: Phase; running: boolean; leftMs: number; overMs: number; flowing: boolean; roundDone: boolean; breakLeftMs: number; progress: number; breakProgress: number }
/** `state` is the advanced (timestamp-derived) timer. The store deliberately only commits on events, so
    anything that needs elapsed focus, the remaining minutes or the break gate must read it from here and
    not from the store — reading the store freezes it for the whole round. */
export function view(s0: TimerState, now: number): TimerView {
  const s = advance(s0, now).state, total = s.planMin * 60_000;
  return { state: s, phase: s.phase, running: s.running, leftMs: s.focusLeftMs, overMs: s.overMs, flowing: s.phase !== 'set' && s.focusLeftMs === 0 && s.running, roundDone: s.focusLeftMs === 0 && s.phase !== 'set',
    breakLeftMs: s.breakLeftMs, progress: s.phase === 'set' ? 0 : total ? Math.min(1, 1 - s.focusLeftMs / total) : 0, breakProgress: s.breakTotalMs ? 1 - s.breakLeftMs / s.breakTotalMs : 0 };
}
export const canBreak = (s: TimerState) => s.phase === 'focus' && s.running && s.focusLeftMs > 0 && s.breaksUsed < s.breaksAllowed && s.focusElapsedMs >= MIN_BREAK_AFTER_MS;

/** The primary button: start / pause / resume / begin the next round. */
export function toggle(s0: TimerState, now: number): Advanced {
  const { state: s, events } = advance(s0, now);
  if (s.phase === 'set') return { state: { ...s, phase: 'focus', running: true, startedAt: now, checkpoint: now, focusLeftMs: s.planMin * 60_000, focusElapsedMs: 0, overMs: 0, warned: false, breaksUsed: 0 }, events };
  if (s.phase === 'break') return { state: s, events };
  if (s.running) return { state: { ...s, running: false }, events };
  if (s.focusLeftMs === 0) return { state: { ...s, running: true, checkpoint: now, focusLeftMs: s.planMin * 60_000, focusElapsedMs: 0, overMs: 0, warned: false, breaksUsed: 0 }, events };
  return { state: { ...s, running: true, checkpoint: now }, events };
}
export function startBreak(s0: TimerState, now: number): TimerState {
  const { state: s } = advance(s0, now);
  if (!canBreak(s)) return s;
  return { ...s, phase: 'break', running: true, checkpoint: now, breakLeftMs: s.breakMs, breakTotalMs: s.breakMs, breakElapsedMs: 0, nextNudgeMs: nudgeStep(s.breakMs), breaksUsed: s.breaksUsed + 1 };
}
export function endBreak(s0: TimerState, now: number): TimerState {
  const { state: s } = advance(s0, now);
  return s.phase !== 'break' ? s : { ...s, phase: 'focus', running: true, checkpoint: now, breakLeftMs: 0 };
}
export interface Summary { startedAt: number; endedAt: number; focusSec: number; breakSec: number; overSec: number; rounds: number; planMin: number; mode: string; completed: boolean; taskId: string | null; courseId: string | null }
/** The row a finished session writes, or null when there is nothing honest to save.
 *
 *  `null` covers both "no round was ever started" and "less than a minute of focus happened": a session
 *  abandoned inside the first minute is not a study session, and saving it would put a row in the export and
 *  the heatmap that nothing actually did. Because that guard requires real focus time, every row that IS
 *  saved happened while the focus clock was running — so `mode` is always `'focus'` and a break's minutes ride
 *  in `breakSec` on the same row rather than as a session of their own.
 *
 *  `completed` is the timer's own counter, not a guess: `rounds` is incremented only where the focus clock
 *  actually reached zero (see `advance`), so a round ended early lands `false` and a round that ran out —
 *  flow overtime included — lands `true`. A session that ran one full round and then ended early in the next
 *  is `true`: a completed round is in it. */
export function finish(s0: TimerState, now: number): Summary | null {
  const s = advance(s0, now).state;
  if (s.startedAt === null || s.focusElapsedMs < 60_000) return null;
  return { startedAt: s.startedAt, endedAt: now, focusSec: Math.round(s.focusElapsedMs / 1000), breakSec: Math.round(s.breakDoneMs / 1000), overSec: Math.round(s.overMs / 1000), rounds: s.rounds, planMin: s.planMin, mode: 'focus', completed: s.rounds > 0, taskId: s.taskId, courseId: s.courseId };
}
