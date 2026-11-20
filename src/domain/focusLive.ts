/**
 * The focus timer on the lock screen (owner's ask, 2026-11-20): while a round or a break runs, one ongoing
 * notification counts down to its end with a system chronometer, so the time left shows the moment the screen
 * wakes, without unlocking or opening Margin. Paused, flowing past the end, or stopped: no countdown. Pure.
 */
import { view, type TimerState } from './timer';
import { fmtTime } from './time';

export interface FocusLive { id: string; title: string; text: string; endAt: number }

export function focusLive(t: TimerState, now: number, subject: string | null, hour12: boolean): FocusLive | null {
  if (t.phase === 'set' || !t.running || t.startedAt === null) return null;
  const v = view(t, now);
  const left = v.phase === 'break' ? v.breakLeftMs : v.leftMs;
  if (!v.running || left <= 0) return null;
  const endAt = now + left, what = t.title || subject || 'Focus';
  return v.phase === 'break'
    ? { id: `focus-${t.startedAt}-b${t.breaksUsed}`, title: 'Break', text: `Back to ${what} at ${fmtTime(endAt, hour12)}`, endAt }
    : { id: `focus-${t.startedAt}-r${t.rounds}`, title: `Focus · ${what}`, text: `Ends at ${fmtTime(endAt, hour12)}`, endAt };
}
