import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Task } from './types';
import { addDays, parseYmd, startOfDay, ymd } from './time';
import { attendanceRate, effective, occurrencesBetween, occurrencesOn, type Occurrence } from './attendance';
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
export function focusBySubject(sessions: FocusSession[], courses: Course[]): { id: string; name: string; min: number }[] {
  const m = new Map<string, number>(); for (const s of sessions) { const k = s.courseId ?? '_'; m.set(k, (m.get(k) ?? 0) + s.focusSec / 60); }
  return [...m.entries()].map(([id, min]) => ({ id, name: id === '_' ? 'Personal' : (courses.find((c) => c.id === id)?.name ?? id), min: Math.round(min) })).sort((a, b) => b.min - a.min);
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

export interface AttCell { date: string; status: string | null; inferred: boolean }
export function attendanceHeat(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now()) {
  const keys = lastDays(nDays, now);
  return courses.filter((c) => meetings.some((m) => m.courseId === c.id)).map((c) => ({
    course: c,
    cells: keys.map<AttCell>((k) => {
      const d = parseYmd(k), m = occurrencesOn(d, meetings.filter((x) => x.courseId === c.id))[0];
      if (!m) return { date: k, status: null, inferred: false };
      const e = effective(d, m.meeting, att, days, now); return { date: k, status: e.status, inferred: e.inferred };
    }),
  }));
}
export function attendanceByCourse(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now()) {
  const from = addDays(startOfDay(now), -(nDays - 1));
  return courses.filter((c) => meetings.some((m) => m.courseId === c.id)).map((c) => {
    const occ: Occurrence[] = occurrencesBetween(from, now, meetings.filter((m) => m.courseId === c.id));
    return { course: c, ...attendanceRate(occ, att, days, now) };
  });
}
export function overallAttendance(courses: Course[], meetings: Meeting[], att: Record<string, AttRecord>, days: Record<string, DayMark>, nDays: number, now = Date.now()) {
  const rows = attendanceByCourse(courses, meetings, att, days, nDays, now), held = rows.reduce((a, r) => a + r.held, 0), here = rows.reduce((a, r) => a + r.here, 0);
  return { held, here, rate: held ? here / held : null };
}
export const gradeBars = (courses: Course[], marks: Mark[], adjusts: Record<string, number>) => courses.map((c) => ({ id: c.id, name: c.name, total: total(marks.filter((m) => m.courseId === c.id), adjusts[c.id] ?? 0), goal: c.goal }));
export function markSeries(courseId: string, marks: Mark[]) { return marks.filter((m) => m.courseId === courseId && m.on && m.score !== null).sort((a, b) => a.sort - b.sort).map((m) => ({ name: m.name, score: m.score as number })); }
