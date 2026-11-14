import type { AttRecord, AttStatus, AttWhy, Course, DayMark, FocusSession, Mark, Meeting, SubjectVariant, Task } from './types';
import { addDays, fmtDur, pad, parseYmd, plural, startOfDay, ymd } from './time';
import { attendanceRate, effective, occurrencesBetween, occurrencesOn, type Occurrence } from './attendance';
import type { ClassMove } from './moves';
import { total } from './grades';

/** oldest → newest, ending today */
export const lastDays = (n: number, now = Date.now()) => Array.from({ length: n }, (_, i) => ymd(new Date(addDays(startOfDay(now), -(n - 1 - i)))));
export const dayKey = (ms: number) => ymd(new Date(ms));

export function focusMinutesByDay(sessions: FocusSession[], days: string[]): number[] {
  const m = new Map<string, number>(); for (const s of sessions) { const k = dayKey(s.startedAt); m.set(k, (m.get(k) ?? 0) + s.focusSec / 60); }
  return days.map((d) => Math.round(m.get(d) ?? 0));
}
export function doneByDay(tasks: Task[], days: string[]): number[] {
  const m = new Map<string, number>(); for (const t of tasks) if (t.status === 2 && t.completedAt) { const k = dayKey(t.completedAt); m.set(k, (m.get(k) ?? 0) + 1); }
  return days.map((d) => m.get(d) ?? 0);
}
/** 24 bins: hour of day tasks were ticked off */
export function doneByHour(tasks: Task[]): number[] {
  const h = new Array<number>(24).fill(0); for (const t of tasks) if (t.status === 2 && t.completedAt) { const i = new Date(t.completedAt).getHours(); h[i] = (h[i] ?? 0) + 1; } return h;
}
export function focusByHour(sessions: FocusSession[]): number[] {
  const h = new Array<number>(24).fill(0); for (const s of sessions) { const i = new Date(s.startedAt).getHours(); h[i] = (h[i] ?? 0) + Math.round(s.focusSec / 60); } return h;
}
export function onTimeStats(tasks: Task[]) {
  let onTime = 0, late = 0, lead = 0;
  for (const t of tasks) if (t.status === 2 && t.completedAt && t.dueAt) { if (t.completedAt <= t.dueAt) { onTime++; lead += t.dueAt - t.completedAt; } else late++; }
  const n = onTime + late; return { onTime, late, total: n, pct: n ? onTime / n : null, avgLeadHours: onTime ? lead / onTime / 3_600_000 : null };
}
/** Minutes per subject, most first. `since` (ms) keeps only sessions started at or after it, so a chart
 *  that says "the last 15 weeks" can split exactly the minutes its heatmap draws. */
export function focusBySubject(sessions: FocusSession[], courses: Course[], since = -Infinity): { id: string; name: string; min: number }[] {
  const m = new Map<string, number>(); for (const s of sessions) { if (s.startedAt < since) continue; const k = s.courseId ?? '_'; m.set(k, (m.get(k) ?? 0) + s.focusSec / 60); }
  return [...m.entries()].map(([id, min]) => ({ id, name: id === '_' ? 'Personal' : (courses.find((c) => c.id === id)?.name ?? id), min: Math.round(min) })).sort((a, b) => b.min - a.min);
}
/**
 * What you have studied, for the Focus page: today, this week (Monday first, like the timetable) per subject
 * with the most-studied first, the subject a session would add to, and the day streak. Minutes are summed
 * from seconds before rounding, so twelve 4.6-minute sessions read as 55, not 60.
 */
export interface FocusSummary {
  todayMin: number; weekMin: number; lastWeekMin: number;
  week: { id: string; name: string; min: number; sessions: number }[];
  top: { id: string; name: string; min: number } | null;
  streak: number;
  recent: FocusSession[];
}
export function focusSummary(sessions: FocusSession[], courses: Course[], now = Date.now()): FocusSummary {
  const day0 = startOfDay(now), wd = (new Date(now).getDay() + 6) % 7, week0 = addDays(day0, -wd), last0 = addDays(week0, -7);
  const name = (id: string) => (id === '_' ? 'Something else' : courses.find((c) => c.id === id)?.name ?? 'A removed subject');
  let today = 0, week = 0, last = 0;
  const per = new Map<string, { sec: number; n: number }>();
  for (const s of sessions) {
    if (s.startedAt >= day0) today += s.focusSec;
    if (s.startedAt >= week0) {
      week += s.focusSec;
      const k = s.courseId ?? '_', e = per.get(k) ?? { sec: 0, n: 0 };
      per.set(k, { sec: e.sec + s.focusSec, n: e.n + 1 });
    } else if (s.startedAt >= last0) last += s.focusSec;
  }
  const rows = [...per.entries()].map(([id, e]) => ({ id, name: name(id), min: Math.round(e.sec / 60), sessions: e.n })).filter((r) => r.min > 0).sort((a, b) => b.min - a.min || a.name.localeCompare(b.name));
  const days = focusMinutesByDay(sessions, lastDays(60, now));
  return {
    todayMin: Math.round(today / 60), weekMin: Math.round(week / 60), lastWeekMin: Math.round(last / 60),
    week: rows, top: rows.find((r) => r.id !== '_') ?? null, streak: streak(days).current,
    recent: [...sessions].sort((a, b) => b.startedAt - a.startedAt).slice(0, 4),
  };
}
/** 0..4 intensity for heatmap cells (0 = nothing); relative to the max so sparse data still shows shape */
export const level = (v: number, max: number) => (v <= 0 || max <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil((v / max) * 4))));
export function streak(values: number[]): { current: number; best: number } {
  let best = 0, run = 0; for (const v of values) { run = v > 0 ? run + 1 : 0; best = Math.max(best, run); }
  let cur = 0; for (let i = values.length - 1; i >= 0; i--) { if ((values[i] ?? 0) > 0) cur++; else if (i === values.length - 1) continue; else break; }
  return { current: cur, best };
}
/**
 * Which empty state Stats should show, or `null` when there is data to look at.
 *
 * The two halves are independent, and the guard used to `&&` them, so it needed *both* to be empty at
 * once. The app reaches the half-empty state easily: "Remove all sample data" takes the sample history
 * with it, leaving whatever mix of your own finished tasks and focus sessions you actually have — which
 * can be one half and not the other, and used to leave two focus charts permanently blank with no
 * explanation. Each half is measured over the 105-day window the heatmaps actually draw, not over the
 * whole table — a session from last year is not data the chart can show.
 */
export const statsEmptyHint = (x: { focusMinutes: number; finished: number }): string | null => {
  if (x.focusMinutes > 0 && x.finished > 0) return null;
  if (x.focusMinutes === 0 && x.finished === 0) return 'Finish a task or a focus session and the charts fill in.';
  return x.focusMinutes === 0 ? 'Start a focus session and the focus charts fill in.' : 'Finish a task and the tasks charts fill in.';
};

/** One day of one subject's attendance strip. `cls` says whether the subject meets that day at all, which
 *  `status: null` alone cannot: a class later today and a day with no class both have no status yet. */
export interface AttCell { date: string; status: AttStatus | null; why: AttWhy; inferred: boolean; cls: boolean }
export function attendanceHeat(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now(), moves: readonly ClassMove[] = []) {
  const keys = lastDays(nDays, now);
  return courses.filter((c) => meetings.some((m) => m.courseId === c.id)).map((c) => ({
    course: c,
    cells: keys.map<AttCell>((k) => {
      const d = parseYmd(k), m = occurrencesOn(d, meetings.filter((x) => x.courseId === c.id), moves)[0];
      if (!m) return { date: k, status: null, why: '', inferred: false, cls: false };
      const e = effective(d, m.meeting, att, days, now); return { date: k, status: e.status, why: e.why ?? '', inferred: e.inferred, cls: true };
    }),
  }));
}
export function attendanceByCourse(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now(), moves: readonly ClassMove[] = []) {
  const from = addDays(startOfDay(now), -(nDays - 1));
  return courses.filter((c) => meetings.some((m) => m.courseId === c.id)).map((c) => {
    const occ: Occurrence[] = occurrencesBetween(from, now, meetings.filter((m) => m.courseId === c.id), moves);
    return { course: c, ...attendanceRate(occ, att, days, now) };
  });
}
export type AttRow = ReturnType<typeof attendanceByCourse>[number];
/** v0.7 R5 (D-15): a course's attendance per part (lecture, lab…), each against its own goal (`attGoal` %, else the
 *  app-wide 80 %). A part owns the classes filed under it; the base part also owns the ones filed under none.
 *  Empty for a course with fewer than two parts, whose course row already says it all. */
export function attendanceByPart(course: Course, meetings: Meeting[], variants: readonly SubjectVariant[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now(), moves: readonly ClassMove[] = []) {
  const parts = variants.filter((v) => v.subjectId === course.id).sort((a, b) => a.ord - b.ord);
  if (parts.length < 2) return [];
  const from = addDays(startOfDay(now), -(nDays - 1)), base = parts.find((p) => p.isBase) ?? null;
  return parts.map((p) => {
    const mine = meetings.filter((m) => m.courseId === course.id && ((m.variantId ?? null) === p.id || (!m.variantId && base?.id === p.id)));
    const r = attendanceRate(occurrencesBetween(from, now, mine, moves), att, days, now), goal = p.attGoal && p.attGoal > 0 ? p.attGoal : 80;
    return { id: p.id, name: p.name, goal, ...r, canMiss: canMiss(r.here, r.held, goal / 100) };
  }).filter((r) => r.held > 0 || r.rate !== null);
}
/**
 * The whole timetable's attendance, summed from the per-subject rows Stats already has. It replaces
 * `overallAttendance`, which re-ran `attendanceByCourse` to get the same rows a second time — a second
 * full pass over every occurrence, once a minute while Stats is on screen. `worst` is the subject with
 * the most classes missed (absent or sick), the lower rate first on a tie, so the page can name it.
 */
export function attendanceTotals(rows: AttRow[]) {
  let held = 0, here = 0, late = 0;
  let worst: { id: string; name: string; missed: number; rate: number } | null = null;
  for (const r of rows) {
    held += r.held; here += r.here; late += r.late;
    const missed = r.held - r.here, rate = r.rate ?? 1;
    if (missed > 0 && (!worst || missed > worst.missed || (missed === worst.missed && rate < worst.rate))) worst = { id: r.course.id, name: r.course.name, missed, rate };
  }
  return { held, here, late, missed: held - here, rate: held ? here / held : null, worst };
}
export type AttTotals = ReturnType<typeof attendanceTotals>;
/** The old one-call total, kept for callers that only want the rate; it now sums `attendanceTotals` once. */
export function overallAttendance(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now()) {
  const t = attendanceTotals(attendanceByCourse(courses, meetings, att, days, nDays, now));
  return { held: t.held, here: t.here, rate: t.rate };
}
export const gradeBars = (courses: Course[], marks: Mark[], adjusts: Record<string, number>) => courses.map((c) => ({ id: c.id, name: c.name, total: total(marks.filter((m) => m.courseId === c.id), adjusts[c.id] ?? 0), goal: c.goal }));
export function markSeries(courseId: string, marks: Mark[]) { return marks.filter((m) => m.courseId === courseId && m.on && m.score !== null).sort((a, b) => a.sort - b.sort).map((m) => ({ name: m.name, score: m.score as number })); }

/* ── Stats, in words ──────────────────────────────────────────────────────────────────────────────────
 * Every sentence the Stats page prints is built here, from numbers, so the copy is tested against the
 * numbers it claims rather than eyeballed. Each returns `null` when there is nothing honest to say, and
 * the page then shows what fills that section instead of an empty chart. */

/** The last 7 entries of a day series, the 7 before them, and the change between the two as a fraction
 *  (`null` when the week before had nothing to compare with — "up ∞ %" is not a sentence). */
export function weekOverWeek(daily: number[]): { week: number; prev: number; change: number | null } {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0), week = sum(daily.slice(-7)), prev = sum(daily.slice(-14, -7));
  return { week, prev, change: prev > 0 ? (week - prev) / prev : null };
}
/** The busiest hour (0–23), or `null` for a series with nothing in it — an all-zero day has no peak, and
 *  `indexOf(0)` would have claimed midnight. The earliest hour wins a tie. */
export function peakHour(h: number[]): number | null {
  let at = -1, best = 0;
  h.forEach((v, i) => { if (v > best) { best = v; at = i; } });
  return at < 0 ? null : at;
}
/** An hour as an axis tick, in the app's clock: `6 AM` / `6 PM`, or `06:00`. */
export const hourTick = (h: number, h12: boolean) => (h12 ? `${h % 12 || 12} ${h % 24 < 12 ? 'AM' : 'PM'}` : `${pad(h % 24)}:00`);
/** How far ahead of a due date something was finished, in words: `under an hour`, `7 h`, `2 days`. */
export function leadPhrase(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 23.5) return `${Math.round(hours)} h`;
  return plural(Math.round(hours / 24), 'day');
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** `27 Oct`: a day key as a short axis label. */
export const shortDate = (key: string) => { const d = parseYmd(key); return `${d.getDate()} ${MON[d.getMonth()]}`; };
/**
 * Month labels for a Monday-first calendar heatmap: the column (week) each month starts in, for `days`
 * (oldest → newest) padded at the front by `startWd` blank cells. The window's first month is labelled
 * on column 0 only when the next label is at least three columns away, so two labels never collide.
 */
export function monthTicks(days: string[], startWd: number): { col: number; label: string }[] {
  const out: { col: number; label: string }[] = [];
  days.forEach((k, i) => { const d = parseYmd(k); if (d.getDate() === 1 && i > 0) out.push({ col: Math.floor((i + startWd) / 7), label: MON[d.getMonth()] as string }); });
  const first = days[0];
  if (first !== undefined && (out.length === 0 || (out[0]?.col ?? 0) >= 3)) out.unshift({ col: 0, label: MON[parseYmd(first).getMonth()] as string });
  return out;
}
/**
 * A y-axis for one subject's marks: round bounds around the scores (and the goal, so its line is always
 * on the plot), at least 20 points tall, ticked every 10 — or every 25 once the range is wider than 50.
 * A flat 0–100 axis is what made a 72 → 90 history read as a straight line.
 */
export function markScale(values: number[], goal: number | null): { lo: number; hi: number; ticks: number[] } {
  const all = goal !== null ? [...values, goal] : values;
  if (all.length === 0) return { lo: 0, hi: 100, ticks: [0, 25, 50, 75, 100] };
  const top = Math.max(...all), cap = top > 100 ? Math.ceil(top / 10) * 10 : 100;
  let lo = Math.max(0, Math.floor((Math.min(...all) - 5) / 10) * 10), hi = Math.min(cap, Math.ceil((top + 5) / 10) * 10);
  if (hi - lo < 20) { if (hi + 10 <= cap) hi += 10; if (hi - lo < 20) lo = Math.max(0, hi - 20); }
  let step = 10;
  if (hi - lo > 50) { step = 25; lo = Math.floor(lo / 25) * 25; hi = Math.ceil(hi / 25) * 25; }
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

/** Are you showing up? `days` is the window the totals were summed over. */
export function attendanceLine(t: AttTotals, days = 28): string | null {
  if (t.held === 0) return null;
  const span = days % 7 === 0 ? `the last ${plural(days / 7, 'week')}` : `the last ${days} days`;
  if (t.missed === 0) {
    const all = t.held === 1 ? 'You were at the one class held' : `You were at all ${t.held} classes`;
    const late = !t.late ? '' : t.late === t.held ? (t.held === 1 ? ', late' : ', all of them late') : `, ${t.late} of them late`;
    return `${all} in ${span}${late}.`;
  }
  const lead = `You were at ${t.here} of ${plural(t.held, 'class', 'classes')} in ${span}`;
  return t.worst ? `${lead}; ${t.worst.name} is where you missed most (${t.worst.missed}).` : `${lead}.`;
}
/** Are you on top of work? From `onTimeStats`, and how many tasks were finished in the heatmap window. */
export function tasksLine(ot: ReturnType<typeof onTimeStats>, finished: number): string | null {
  if (ot.total === 0) return finished ? `${plural(finished, 'task')} finished in the last 15 weeks; none of them had a due date to beat.` : null;
  const lead = ot.avgLeadHours !== null ? `, by about ${leadPhrase(ot.avgLeadHours)} on average` : '';
  if (ot.onTime === 0) return ot.total === 1 ? 'The one task with a due date was finished after it.' : `None of the ${ot.total} tasks with a due date were done by it.`;
  if (ot.late === 0) return ot.total === 1 ? `The one task with a due date beat it${lead}.` : `All ${ot.total} tasks with a due date beat it${lead}.`;
  return `${ot.onTime} of ${ot.total} tasks beat their due date${lead}.`;
}
/** Where does your study time go? `total` is the window's minutes; `bySub` is `focusBySubject` over it. */
export function focusLine(total: number, bySub: { id: string; name: string; min: number }[]): string | null {
  if (total <= 0) return null;
  const top = bySub[0], head = `${fmtDur(total)} of focus in the last 15 weeks`;
  if (!top || top.min <= 0) return `${head}.`;
  const where = top.id === '_' ? 'not filed under a subject' : `on ${top.name}`;
  return bySub.filter((s) => s.min > 0).length === 1 ? `${head}, all of it ${where}.` : `${head}, most of it ${where}.`;
}
/** When do you work best? Both peaks arrive already printed in the app's clock. The sentence starts with
 *  the phrase `tools/w4-assert.mjs` 7i looks for, so the 12-hour check keeps finding it. */
export function hoursLine(focusPeak: string | null, donePeak: string | null): string | null {
  if (focusPeak && donePeak) return `Focus peaks around ${focusPeak}, and most tasks are finished around ${donePeak}.`;
  if (focusPeak) return `Focus peaks around ${focusPeak}.`;
  if (donePeak) return `Most tasks are finished around ${donePeak}.`;
  return null;
}
/** How are your grades? The subject furthest under its goal is named first; otherwise the spread. */
export function gradesLine(rows: { id: string; name: string; total: number | null; goal: number | null }[]): string | null {
  const s = rows.filter((r) => r.total !== null).map((r) => ({ ...r, t: Math.round(r.total as number) }));
  const best = s.reduce<(typeof s)[number] | null>((a, r) => (!a || r.t > a.t ? r : a), null);
  if (!best) return null;
  const gap = (r: (typeof s)[number]) => `${(r.goal as number) - r.t} under its goal of ${r.goal}`;
  if (s.length === 1) {
    if (best.goal === null) return `${best.name} stands at ${best.t}.`;
    return best.t < best.goal ? `${best.name} stands at ${best.t}, ${gap(best)}.` : `${best.name} stands at ${best.t}, at or above its goal.`;
  }
  const u = s.filter((r) => r.goal !== null && r.t < r.goal).sort((a, b) => ((b.goal as number) - b.t) - ((a.goal as number) - a.t))[0];
  if (u) return u.id === best.id ? `${best.name} leads at ${best.t}, but is ${gap(best)}.` : `${u.name} is ${gap(u)}; ${best.name} leads at ${best.t}.`;
  if (s.some((r) => r.goal !== null)) return `Every subject with a goal is at or above it; ${best.name} leads at ${best.t}.`;
  const low = s.reduce((a, r) => (r.t < a.t ? r : a));
  return low.t === best.t ? `Every subject stands at ${best.t}.` : `${best.name} leads at ${best.t}; ${low.name} is lowest at ${low.t}.`;
}
export interface HeadlineIn {
  focus: { week: number; prev: number; change: number | null };
  done: { week: number };
  att: AttTotals;
  onTime: { onTime: number; late: number; total: number };
  streak: number;
}
/**
 * The one plain-English line under the headline numbers: the most useful thing to know this week, in a
 * fixed order of importance. Missing classes outranks everything (it is the one that costs marks); then
 * a real move in focus; then a streak worth keeping; then late work piling up; then the quiet facts.
 */
export function statsHeadline(x: HeadlineIn): string | null {
  const { focus: f, att } = x;
  if (att.held >= 4 && att.rate !== null && att.rate < 0.85) return `You've missed ${att.missed} of ${plural(att.held, 'class', 'classes')} in the last 4 weeks.`;
  if (f.change !== null && f.week > 0 && Math.abs(f.change) >= 0.1) return `Focus is ${f.change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(f.change) * 100)}% on last week.`;
  if (f.week === 0 && f.prev > 0) return `No focus logged in the last 7 days; the week before had ${fmtDur(f.prev)}.`;
  if (x.streak >= 3) return `You've focused ${x.streak} days in a row.`;
  if (x.onTime.total >= 3 && x.onTime.late > x.onTime.onTime) return `More tasks are coming in late than on time: ${x.onTime.late} of ${x.onTime.total}.`;
  if (f.change !== null && f.week > 0) return `Focus is steady on last week, at ${fmtDur(f.week)}.`;
  if (x.done.week > 0) return `${plural(x.done.week, 'task')} finished in the last 7 days.`;
  if (f.week > 0) return `${fmtDur(f.week)} of focus in the last 7 days.`;
  if (att.held > 0) return `You were at ${att.here} of ${plural(att.held, 'class', 'classes')} in the last 4 weeks.`;
  return null;
}

/* ── v0.6 Stats: "Are you showing up?" and "Are you on top of your work?" ─────────────────────────────── */
/** Every class held in the window, counted by state and reason (the v0.6 attendance model). An inferred
 *  "present" (a class that ended unmarked) counts as present with no reason; future classes are left out. */
export interface AttBreakdown { present: number; late: number; absent: number; cancelled: number; held: number; why: { a: Partial<Record<AttWhy, number>>; c: Partial<Record<AttWhy, number>>; p: Partial<Record<AttWhy, number>> } }
export function attendanceBreakdown(meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now(), moves: readonly ClassMove[] = []): AttBreakdown {
  const from = addDays(startOfDay(now), -(nDays - 1)), out: AttBreakdown = { present: 0, late: 0, absent: 0, cancelled: 0, held: 0, why: { a: {}, c: {}, p: {} } };
  for (const o of occurrencesBetween(from, now, meetings, moves)) {
    const e = effective(o.date, o.meeting, att, days, now);
    if (!e.status) continue;
    const w = e.why ?? '';
    if (w) out.why[e.status][w] = (out.why[e.status][w] ?? 0) + 1;
    if (e.status === 'c') { out.cancelled++; continue; }
    out.held++;
    if (e.status === 'p') { out.present++; if (w === 'late') out.late++; } else out.absent++;
  }
  return out;
}
/** One subject's classes in the window, oldest first: a dot per class held or cancelled (not per day). */
export function classDots(courseId: string, meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now(), moves: readonly ClassMove[] = []) {
  const from = addDays(startOfDay(now), -(nDays - 1));
  return occurrencesBetween(from, now, meetings.filter((m) => m.courseId === courseId), moves)
    .map((o) => ({ date: ymd(o.date), ...effective(o.date, o.meeting, att, days, now) }))
    .filter((e) => e.status !== null) as { date: string; status: AttStatus; why?: AttWhy; inferred: boolean; explicit: boolean }[];
}
/** How many more classes a subject at `here` of `held` can miss before it drops under `floor` (0.8 = 80%),
 *  assuming every class from now is attended — the number a student actually plans with. */
export function canMiss(here: number, held: number, floor = 0.8): number {
  if (held === 0) return 0;
  let n = 0; while ((here) / (held + n + 1) >= floor && n < 99) n++;
  return n;
}
/** "Right now" for tasks: what is overdue, what falls due in the next seven days, what was done this week. */
export function workNow(tasks: Task[], now = Date.now()) {
  const day = startOfDay(now), weekEnd = addDays(day, 7), weekStart = addDays(day, -((new Date(day).getDay() + 6) % 7));
  let overdue = 0, dueSoon = 0, doneWeek = 0;
  for (const t of tasks) {
    if (t.status === 2) { if (t.completedAt && t.completedAt >= weekStart) doneWeek++; continue; }
    if (t.dueAt === null) continue;
    if (t.dueAt < now) overdue++; else if (t.dueAt < weekEnd) dueSoon++;
  }
  return { overdue, dueSoon, doneWeek };
}
/** Daily values (oldest first, the last one today) summed into calendar weeks, newest last. `todayWd` is
 *  today's weekday, Monday = 0, so the newest bar is this week so far — Monday to today. */
export function weeklySums(values: number[], weeks: number, todayWd: number): number[] {
  const out: number[] = [];
  for (let end = values.length, size = todayWd + 1; end > 0 && out.length < weeks; end -= size, size = 7) out.unshift(values.slice(Math.max(0, end - size), end).reduce((a, b) => a + b, 0));
  return out;
}
