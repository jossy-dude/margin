import type { AttRecord, AttStatus, Course, DayMark, Meeting } from './types';
import { DAY_MS, atTime, hm, selectedDay, startOfDay, weekdayOf, ymd } from './time';

export const ST: Record<AttStatus, string> = { p: 'Here', l: 'Late', n: 'Late · stayed out', a: 'Absent', s: 'Sick', c: 'Cancelled', t: 'Teacher out' };
export const CYCLE: AttStatus[] = ['p', 'l', 'a', 's', 'c'];
export const occKey = (date: string, m: Pick<Meeting, 'start' | 'courseId'>) => `${date}|${m.start}|${m.courseId}`;

export interface Eff { status: AttStatus | null; inferred: boolean; explicit: boolean }
/** One status model for every class occurrence: explicit record > whole-day mark > inferred "here" once the class ended > nothing (future). */
export function effective(date: Date, m: Meeting, att: Record<string, AttRecord>, days: Record<string, DayMark>, now = Date.now()): Eff {
  const d = ymd(date), r = att[occKey(d, m)];
  if (r) return { status: r.status, inferred: false, explicit: true };
  const dm = days[d];
  if (dm) return { status: dm.status, inferred: false, explicit: true };
  const end = atTime(date.getTime(), m.end);
  return end <= now ? { status: 'p', inferred: true, explicit: false } : { status: null, inferred: false, explicit: false };
}
export const isCancelled = (e: Eff) => e.status === 'c' || e.status === 't';

/** Next status in the cycle; used for the one-tap first change and for long-press changes. 'p' is a fixed point: a class that already reads Here — set by hand or inferred once it ended — must stay Here on tap, never silently escalate to Late. */
export const nextStatus = (s: AttStatus | null): AttStatus => {
  if (s === 'p') return 'p';
  const i = s ? CYCLE.indexOf(s) : -1;
  return CYCLE[(i + 1) % CYCLE.length] ?? 'p';
};

export interface Occurrence { date: Date; meeting: Meeting }
export function occurrencesOn(date: Date, meetings: Meeting[]): Occurrence[] {
  const wd = weekdayOf(date);
  return meetings.filter((m) => m.weekday === wd).sort((a, b) => hm(a.start) - hm(b.start)).map((meeting) => ({ date, meeting }));
}

/** One day's classes as the day bar draws them: named, timed, and flagged cancelled. */
export interface Period { start: number; end: number; label: string; cancelled: boolean }
export function periodsOn(occ: Occurrence[], courses: Course[], att: Record<string, AttRecord>, days: Record<string, DayMark>, now = Date.now()): Period[] {
  return occ.map(({ date, meeting }) => {
    const start = atTime(date.getTime(), meeting.start), end = atTime(date.getTime(), meeting.end);
    return {
      start,
      /* A class stored 23:30–00:30 has BOTH ends stamped on the day it occurs, by `atTime`, so it comes out
       * with `end <= start` — and every consumer assumes `start < end`: `dayBlock`'s `cur`/`next` can never
       * match it, `activePeriod` filters it out of the card and of all twenty-six instruments, and Week
       * clamps it to a 20 dp stub. An overnight class ends on the NEXT day; say so here, once, at the only
       * place a Period is built, rather than patching it in every view that reads one. */
      end: end > start ? end : end + DAY_MS,
      label: courses.find((c) => c.id === meeting.courseId)?.name ?? '?',
      cancelled: isCancelled(effective(date, meeting, att, days, now)),
    };
  });
}

/** Everything a page's day-scoped half is built from, and it is all ONE day: the day itself, its
 *  occurrences, the periods the day bar draws, and where you are inside it. A strip, a "Mark day"
 *  target and a class list that each pick a date of their own can name different days; reading them
 *  all off one of these cannot. `picked` is the user's own choice, or null while they have made none. */
export interface DayBlock { day: number; date: string; occ: Occurrence[]; periods: Period[]; cur: Period | undefined; next: Period | undefined }
export function dayBlock(now: number, meetings: Meeting[], courses: Course[], att: Record<string, AttRecord>, days: Record<string, DayMark>, picked: number | null): DayBlock {
  const day = startOfDay(selectedDay(now, picked)), occ = occurrencesOn(new Date(day), meetings), periods = periodsOn(occ, courses, att, days, now);
  return { day, date: ymd(new Date(day)), occ, periods, cur: periods.find((p) => now >= p.start && now < p.end && !p.cancelled), next: periods.find((p) => p.start > now && !p.cancelled) };
}
export function occurrencesBetween(fromMs: number, toMs: number, meetings: Meeting[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (let t = startOfDay(fromMs); t <= toMs; ) { const d = new Date(t); out.push(...occurrencesOn(d, meetings)); const n = new Date(t); n.setDate(n.getDate() + 1); t = n.getTime(); }
  return out;
}
export function attendanceRate(occ: Occurrence[], att: Record<string, AttRecord>, days: Record<string, DayMark>, now = Date.now()) {
  let held = 0, here = 0, late = 0, absent = 0, sick = 0, cancelled = 0;
  for (const o of occ) {
    const e = effective(o.date, o.meeting, att, days, now);
    if (!e.status) continue;
    if (isCancelled(e)) { cancelled++; continue; }
    held++;
    if (e.status === 'p') here++; else if (e.status === 'l' || e.status === 'n') { late++; here++; } else if (e.status === 'a') absent++; else if (e.status === 's') sick++;
  }
  return { held, here, late, absent, sick, cancelled, rate: held ? here / held : null };
}
