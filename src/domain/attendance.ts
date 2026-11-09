import type { AttRecord, AttStatus, AttWhy, Course, DayMark, Meeting } from './types';
import { addDays, atTime, hm, selectedDay, startOfDay, weekdayOf, ymd } from './time';

export const ST: Record<AttStatus, string> = { p: 'Present', a: 'Absent', c: 'Cancelled' };
export const CYCLE: AttStatus[] = ['p', 'a', 'c'];
/** The reasons each state offers, in the order the sheet shows them (v0.6, owner's list). */
export const WHY: Record<AttStatus, AttWhy[]> = {
  p: ['late', 'early'],
  a: ['arrivedLate', 'kicked', 'sick', 'excused', 'skipped'],
  c: ['teacher', 'holiday', 'moved', 'other'],
};
export const WHY_LABEL: Record<Exclude<AttWhy, ''>, string> = {
  late: 'Late entry', early: 'Left early',
  arrivedLate: 'Late arrival', kicked: 'Kicked out', sick: 'Sick', excused: 'Excused', skipped: 'Skipped',
  teacher: "Teacher didn't come", holiday: 'Holiday', moved: 'Moved', other: 'Other',
};
const WHYS = new Set(Object.keys(WHY_LABEL));
/** A why only counts under the state that offers it; anything else reads as no reason. */
export const whyOf = (status: AttStatus | null, why: unknown): AttWhy => (status && typeof why === 'string' && WHYS.has(why) && WHY[status].includes(why as AttWhy) ? why as AttWhy : '');
/** What a mark says out loud: "Absent · Sick", "Present". */
export const statusLabel = (status: AttStatus, why?: AttWhy | '') => (why ? `${ST[status]} · ${WHY_LABEL[why]}` : ST[status]);
/** Any status an older build, an export or a typed file may hold, as a v0.6 state + why. Accepts the
 *  letters (`l n s t` included) and the printed words of both generations; null when it is none. */
const LEGACY: Record<string, [AttStatus, AttWhy]> = {
  p: ['p', ''], here: ['p', ''], present: ['p', ''], l: ['p', 'late'], late: ['p', 'late'],
  a: ['a', ''], absent: ['a', ''], n: ['a', 'arrivedLate'], 'late · stayed out': ['a', 'arrivedLate'], s: ['a', 'sick'], sick: ['a', 'sick'],
  c: ['c', ''], cancelled: ['c', ''], canceled: ['c', ''], t: ['c', 'teacher'], 'teacher out': ['c', 'teacher'],
};
export function legacyStatus(v: unknown): { status: AttStatus; why: AttWhy } | null {
  if (typeof v !== 'string') return null;
  const hit = LEGACY[v.trim().toLowerCase()];
  return hit ? { status: hit[0], why: hit[1] } : null;
}
/** A stored record in the v0.6 shape whatever generation wrote it (archived terms keep old letters). */
export function normAtt<T extends { status: string; why?: unknown }>(r: T): T & { status: AttStatus; why: AttWhy } {
  const l = legacyStatus(r.status) ?? { status: 'p' as AttStatus, why: '' as AttWhy };
  return { ...r, status: l.status, why: whyOf(l.status, r.why) || l.why };
}
/** One class occurrence's attendance key: `date|start|courseId`, plus `~variantId` for a meeting that
 *  belongs to one of the subject's variants. The suffix keeps the lecture and the lab apart when both
 *  sit in the same slot (two groups, one subject), and a meeting with no variant keeps the exact key
 *  every record since v0.1 was written under — no stored attendance is rekeyed by this. */
export const occKey = (date: string, m: Pick<Meeting, 'start' | 'courseId'> & { variantId?: string | null }) =>
  `${date}|${m.start}|${m.courseId}${m.variantId ? `~${m.variantId}` : ''}`;
/** The inverse of `occKey`, for the notification actions and the importers. `null` when the key is not one. */
export function parseOccKey(key: string): { date: string; start: string; courseId: string; variantId: string | null } | null {
  const [date, start, rest, extra] = key.split('|');
  if (!date || !start || !rest || extra !== undefined) return null;
  const at = rest.indexOf('~');
  return at < 0 ? { date, start, courseId: rest, variantId: null } : { date, start, courseId: rest.slice(0, at), variantId: rest.slice(at + 1) || null };
}

/** The moment a class occurrence actually ends, as absolute ms.
 *
 *  A class stored 23:30–00:30 has BOTH ends stamped on the day it occurs, by `atTime`, so `end <= start`
 *  means it crosses midnight and finishes the NEXT day. Every consumer that compares the end against
 *  `now`, or builds a busy interval from it, has to ask this helper rather than re-deriving the
 *  stamp: `periodsOn` used to normalise it locally while `effective()` and the reminder planner still
 *  treated the same class as already over at 00:30 — i.e. before it had even started, so the class was
 *  marked "Here" a day early and the "just ended" notification fired 23½ hours before the lecture. */
export const occEnd = (dayMs: number, m: Pick<Meeting, 'start' | 'end'>) => {
  const start = atTime(dayMs, m.start), end = atTime(dayMs, m.end);
  return end > start ? end : atTime(addDays(dayMs, 1), m.end); // calendar day, not 24 h: DST nights are 23 or 25
};

export interface Eff { status: AttStatus | null; inferred: boolean; explicit: boolean; why?: AttWhy }
/** One status model for every class occurrence: explicit record > whole-day mark > inferred "here" once the class ended > nothing (future). */
export function effective(date: Date, m: Meeting, att: Record<string, AttRecord>, days: Record<string, DayMark>, now = Date.now()): Eff {
  const d = ymd(date), r = att[occKey(d, m)];
  if (r) return { status: r.status, inferred: false, explicit: true, why: r.why ?? '' };
  const dm = days[d];
  if (dm) return { status: dm.status, inferred: false, explicit: true, why: dm.why ?? '' };
  return occEnd(date.getTime(), m) <= now ? { status: 'p', inferred: true, explicit: false } : { status: null, inferred: false, explicit: false };
}
export const isCancelled = (e: Eff) => e.status === 'c';

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
    const start = atTime(date.getTime(), meeting.start);
    return {
      start,
      /* The overnight rule (23:30 → 00:30 ends the next day) lives in `occEnd`, once, at the only
         place a Period is built — every consumer assumes `start < end`. */
      end: occEnd(date.getTime(), meeting),
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
    if (e.status === 'p') { here++; if (e.why === 'late') late++; } else if (e.status === 'a') { absent++; if (e.why === 'sick') sick++; }
  }
  return { held, here, late, absent, sick, cancelled, rate: held ? here / held : null };
}

/**
 * Side-by-side lanes for classes that overlap in time (S2: Week drew two classes in one slot exactly on
 * top of each other, so one was invisible). Classes that overlap, directly or through a chain, form a
 * cluster; each gets the first lane free at its start, and every class in a cluster is told how many
 * lanes the cluster needs, so they all share its width evenly. Input in minutes; order is preserved.
 */
export function lanes(items: readonly { start: number; end: number }[]): { lane: number; of: number }[] {
  const idx = items.map((x, i) => ({ ...x, i })).sort((a, b) => a.start - b.start || a.end - b.end);
  const out: { lane: number; of: number }[] = items.map(() => ({ lane: 0, of: 1 }));
  let cluster: typeof idx = [], ends: number[] = [], clusterEnd = -Infinity;
  const close = () => { const n = Math.max(1, ends.length); for (const c of cluster) out[c.i]!.of = n; cluster = []; ends = []; };
  for (const it of idx) {
    if (it.start >= clusterEnd) { close(); clusterEnd = -Infinity; }
    let lane = ends.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = ends.length; ends.push(it.end); } else ends[lane] = it.end;
    out[it.i]!.lane = lane;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  close();
  return out;
}
