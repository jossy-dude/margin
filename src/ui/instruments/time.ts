/**
 * WHAT `p` MEANS. Percent REMAINING of the active class period, from real clock time.
 *
 * The single correction that changes everything: the bar used to render the ELAPSED school-day
 * fraction, so it read full when a class was about to start and empty at the start of one. Every
 * instrument here is inverted so that `p = 1` means "not started" and `p = 0` means "period over".
 *
 * The four states, and why the gap state shows the class that just ended rather than the one that is
 * about to start:
 *
 *   before  — before the first class.        the first class, p = 1.  "you have all of it"
 *   running — inside a class.                 that class, counting down.
 *   gap     — between two classes.            the class that JUST ended, p = 0.  Not the next one:
 *                                              a bar that snaps back to full the instant a class ends
 *                                              is the exact lie this rewrite exists to remove. The
 *                                              app's original `ticker` kind answers "how long until
 *                                              the next one" and is kept for that question.
 *   over    — after the last class.           the last class, p = 0.
 */
export interface BarPeriod { start: number; end: number; label: string; cancelled?: boolean }

export type Phase = 'before' | 'running' | 'gap' | 'over';

export interface Active {
  period: BarPeriod;
  /** 1 = the whole period is still ahead, 0 = none of it is. */
  p: number;
  /** ms still to run. */
  left: number;
  /** the period's length, ms. */
  total: number;
  phase: Phase;
  /** true in the gap/over state: the bar is showing a class that has already finished. */
  ended: boolean;
}

/** The last five minutes. The one state change in a period worth spending a different tone on, and
 *  it is spent on the moving part only. */
export const LATE_MS = 5 * 60_000;

const live = (ps: readonly BarPeriod[]) => ps.filter((p) => !p.cancelled && p.end > p.start);

export function activePeriod(periods: readonly BarPeriod[], now: number): Active | null {
  const ps = live(periods);
  if (!ps.length) return null;
  const running = ps.find((p) => now >= p.start && now < p.end);
  if (running) {
    const total = running.end - running.start;
    const left = running.end - now;
    return { period: running, p: total <= 0 ? 0 : left / total, left, total, phase: 'running', ended: false };
  }
  const done = ps.filter((p) => now >= p.end);
  if (done.length) {
    const last = done[done.length - 1]!;
    return { period: last, p: 0, left: 0, total: last.end - last.start, phase: done.length === ps.length ? 'over' : 'gap', ended: true };
  }
  const first = ps[0]!;
  return { period: first, p: 1, left: first.end - first.start, total: first.end - first.start, phase: 'before', ended: false };
}