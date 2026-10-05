import type { AttRecord, Course, DayMark, Meeting, NotifSettings, Task } from './types';
import { addDays, atTime, fmtDur, fmtTime, hm, startOfDay, weekdayOf, ymd, DAY_MS } from './time';
import { effective, isCancelled, occurrencesBetween } from './attendance';

export type PlannedKind = 'class' | 'ended' | 'task' | 'start' | 'exam';
export interface Planned {
  id: string; kind: PlannedKind; at: number; title: string; body: string;
  channel: 'classes' | 'tasks'; route: 'Today' | 'Tasks'; entityId: string; shiftedFrom?: number; why?: string;
}
export interface PlanInput {
  now: number; courses: Course[]; meetings: Meeting[]; attendance: Record<string, AttRecord>;
  dayMarks: Record<string, DayMark>; tasks: Task[]; settings: NotifSettings; horizonDays?: number; cap?: number;
}
export interface Plan { items: Planned[]; deferred: number; dropped: { id: string; why: string }[] }

const MIN = 60_000;
const S15 = 15 * MIN;
export interface Ctx { s: NotifSettings; busy: [number, number][]; }

/** Class intervals (cancelled ones excluded) across the planning window — "you are in a lecture".
 * Merged & disjoint so consumers can subtract or binary-search without double counting. */
function busyIntervals(i: PlanInput, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (const o of occurrencesBetween(from, to, i.meetings)) {
    if (isCancelled(effective(o.date, o.meeting, i.attendance, i.dayMarks, i.now))) continue;
    out.push([atTime(o.date.getTime(), o.meeting.start), atTime(o.date.getTime(), o.meeting.end)]);
  }
  out.sort((a, b) => a[0] - b[0]);
  const m: [number, number][] = [];
  for (const iv of out) {
    const last = m[m.length - 1];
    if (last && iv[0] <= last[1]) { if (iv[1] > last[1]) last[1] = iv[1]; } else m.push([iv[0], iv[1]]);
  }
  return m;
}
const inWindow = (m: number, from: number, to: number) => (from === to ? false : from < to ? m >= from && m < to : m >= from || m < to);

/** Why a notification may not fire at `ms` (null = it may). `skipClass` is for class notifications themselves. */
export function blockedReason(ms: number, c: Ctx, skipClass = false): { why: string; until: number } | null {
  const d = new Date(ms), day = startOfDay(ms), wd = weekdayOf(d), m = d.getHours() * 60 + d.getMinutes(), s = c.s;
  const nextDay = () => atTime(addDays(day, 1), s.activeFrom);
  if (!s.activeDays[wd]) return { why: 'inactive day', until: nextDay() };
  if (wd >= 5 && s.weekend !== 'normal') return { why: 'weekend', until: nextDay() };
  const a0 = hm(s.activeFrom), a1 = hm(s.activeTo);
  if (m < a0) return { why: 'before active hours', until: atTime(day, s.activeFrom) };
  if (m >= a1) return { why: 'after active hours', until: nextDay() };
  if (s.quietEnabled && inWindow(m, hm(s.quietFrom), hm(s.quietTo))) {
    const wraps = hm(s.quietFrom) > hm(s.quietTo) && m >= hm(s.quietFrom);
    return { why: 'quiet hours', until: atTime(wraps ? addDays(day, 1) : day, s.quietTo) };
  }
  if (!skipClass && s.duringClass === 'defer') {
    const b = c.busy.find(([x, y]) => ms >= x && ms < y);
    if (b) return { why: 'during class', until: b[1] + MIN };
  }
  return null;
}
/** Shift forward to the next allowed minute; for deadlines, fall back to the last allowed minute before. */
export function shift(at: number, c: Ctx, o: { skipClass?: boolean; notAfter?: number; weekendDrops?: boolean } = {}): { at: number; why?: string } | null {
  const wd = weekdayOf(new Date(at));
  if (o.weekendDrops && c.s.weekend === 'off' && wd >= 5) return null;
  let t = at, why: string | undefined;
  for (let n = 0; n < 40; n++) { const b = blockedReason(t, c, o.skipClass); if (!b) break; why = why ?? b.why; t = b.until; }
  if (!blockedReason(t, c, o.skipClass) && (o.notAfter === undefined || t <= o.notAfter)) return t === at ? { at } : { at: t, why };
  if (o.notAfter !== undefined) for (let b = Math.min(at, o.notAfter); b > at - 2 * DAY_MS; b -= 10 * MIN) if (!blockedReason(b, c, o.skipClass)) return { at: b, why: why ?? 'moved earlier' };
  return null;
}

/** Grid points `anchor + k·15min` (integer k, k ≥ 0 when anchor ≤ x) inside [x, y). */
function countGrid(anchor: number, x: number, y: number): number {
  if (y <= x) return 0;
  const kMin = Math.ceil((x - anchor) / S15);
  const kMax = Math.floor((y - 1 - anchor) / S15);
  return kMax - kMin + 1;
}
const slotFree = (t: number, c: Ctx, a0: number, a1: number): boolean => {
  const d = new Date(t), wd = weekdayOf(d), m = d.getHours() * 60 + d.getMinutes();
  if (!c.s.activeDays[wd] || m < a0 || m >= a1) return false;
  return !c.busy.some(([x, y]) => t >= x && t < y);
};
/** Local instant of `minutes` past local midnight of `day` (already a midnight) — one Date, no string parse. */
const dayBound = (day: number, minutes: number) => { const d = new Date(day); d.setHours((minutes / 60) | 0, minutes % 60, 0, 0); return d.getTime(); };
/** Free 15-min grid points of `anchor` inside [xs, xe), minus those inside busy (busy must be merged/disjoint). */
function gridFree(anchor: number, xs: number, xe: number, c: Ctx, bi: number): { cnt: number; end: number } {
  let cnt = countGrid(anchor, xs, xe);
  let i = bi;
  if (cnt > 0) {
    while (i < c.busy.length && c.busy[i]![1] <= xs) i++;
    for (let j = i; j < c.busy.length && c.busy[j]![0] < xe; j++) {
      cnt -= countGrid(anchor, Math.max(xs, c.busy[j]![0]), Math.min(xe, c.busy[j]![1]));
    }
  }
  return { cnt, end: i };
}
/** Awake, free minutes in [from,to): active hours, active days, not in class.
 * Closed form over 15-min grid points — O(days + busy) instead of stepping every slot. */
export function freeMinutes(from: number, to: number, c: Ctx): number {
  if (to <= from) return 0;
  const s = c.s, a0 = hm(s.activeFrom), a1 = hm(s.activeTo);
  const kLast = Math.floor((to - 1 - from) / S15);
  const lastT = from + kLast * S15;
  const hasLast = lastT >= from, end = hasLast ? lastT : to;
  let n = 0, bi = 0;
  for (let day = startOfDay(from); day < end; day = addDays(day, 1)) {
    if (!s.activeDays[weekdayOf(new Date(day))]) continue;
    const xs = Math.max(from, dayBound(day, a0));
    const xe = Math.min(end, dayBound(day, a1));
    if (xe <= xs) continue;
    const g = gridFree(from, xs, xe, c, bi);
    bi = g.end; n += g.cnt * 15;
  }
  if (hasLast && slotFree(lastT, c, a0, a1)) n += (to - lastT) / MIN;
  return n;
}
/** Latest moment you can start and still fit `needMin` of free time before `due`.
 * Equivalent to walking 15-min slots back from `due` (≤ 2016 steps) but via per-day counts. */
export function latestStart(due: number, needMin: number, c: Ctx): number {
  const s = c.s, a0 = hm(s.activeFrom), a1 = hm(s.activeTo);
  if (needMin <= 0) return due;
  const MAXK = 24 * 4 * 21, LB = due - MAXK * S15;
  const need = Math.ceil(needMin / 15);
  // Per-day free counts walking forward from LB (grid = due − k·15min, k ≥ 1, k ≤ MAXK), then
  // locate the `need`-th free slot counted from the due end.
  const days: { xs: number; xe: number; cnt: number }[] = [];
  let bi = 0;
  for (let day = startOfDay(LB); day < due; day = addDays(day, 1)) {
    let xs = -1, xe = -1, cnt = 0;
    if (s.activeDays[weekdayOf(new Date(day))]) {
      xs = Math.max(dayBound(day, a0), LB);
      xe = Math.min(dayBound(day, a1), due);
      if (xe > xs) { const g = gridFree(due, xs, xe, c, bi); bi = g.end; cnt = g.cnt; }
      else xs = xe = -1;
    }
    days.push({ xs, xe, cnt });
  }
  let remaining = need;
  for (let i = days.length - 1; i >= 0; i--) {
    const d = days[i]!;
    if (d.cnt <= 0) continue;
    if (remaining > d.cnt) { remaining -= d.cnt; continue; }
    const kMin = Math.ceil((d.xs - due) / S15), kMax = Math.floor((d.xe - 1 - due) / S15);
    for (let k = kMax; k >= kMin; k--) {
      const t = due + k * S15;
      if (c.busy.some(([x, y]) => t >= x && t < y)) continue;
      if (--remaining === 0) return t;
    }
    return d.xs; // unreachable: cnt guarantees `remaining` hits 0
  }
  return LB;
}
/** "Do I have enough time?" for one task. Pass a shared `cx` (busy spanning [now, task.dueAt]) to
 * reuse one interval build across many tasks — identical results, no per-task occurrence scan. */
export function workload(task: Task, i: Pick<PlanInput, 'now' | 'meetings' | 'attendance' | 'dayMarks' | 'settings'>, cx?: Ctx): { needMin: number; freeMin: number; tight: boolean; startBy: number } | null {
  if (task.dueAt === null || task.estimateMin === null || task.status === 2) return null;
  const c: Ctx = cx ?? { s: i.settings, busy: busyIntervals(i as PlanInput, i.now, task.dueAt) };
  const needMin = Math.round(task.estimateMin * (1 + i.settings.effortBuffer));
  const from = Math.max(i.now, task.startAt ?? 0), freeMin = Math.max(0, freeMinutes(from, task.dueAt, c));
  return { needMin, freeMin, tight: freeMin < needMin * 1.15, startBy: latestStart(task.dueAt, needMin, c) };
}

export function planReminders(i: PlanInput): Plan {
  const s = i.settings, horizon = i.now + (i.horizonDays ?? 14) * DAY_MS, cap = i.cap ?? 60;
  const dropped: Plan['dropped'] = [], raw: Planned[] = [];
  if (!s.enabled) return { items: [], deferred: 0, dropped };
  const c: Ctx = { s, busy: busyIntervals(i, startOfDay(i.now), horizon + DAY_MS) };
  // Shared busy for every workload() call below: one occurrence scan instead of one per task.
  let cx: Ctx | undefined;
  if (s.startBy) {
    let maxDue = 0;
    for (const t of i.tasks) if (t.status === 0 && t.dueAt !== null && t.estimateMin !== null && t.dueAt > maxDue) maxDue = t.dueAt;
    if (maxDue > i.now) cx = { s, busy: busyIntervals(i, i.now, maxDue) };
  }
  const cn = (id: string | null) => i.courses.find((x) => x.id === id);
  const push = (p: Omit<Planned, 'id'>, o: Parameters<typeof shift>[2]) => {
    const id = `${p.kind}-${p.entityId}-${Math.round(p.at / MIN)}`, r = shift(p.at, c, o);
    if (!r) { dropped.push({ id, why: 'blocked by quiet/active settings' }); return; }
    raw.push({ ...p, id: `${p.kind}-${p.entityId}-${Math.round(r.at / MIN)}`, at: r.at, ...(r.at !== p.at ? { shiftedFrom: p.at, why: r.why } : {}) });
  };
  // classes
  for (const o of occurrencesBetween(startOfDay(i.now), horizon, i.meetings)) {
    const e = effective(o.date, o.meeting, i.attendance, i.dayMarks, i.now);
    if (isCancelled(e)) continue;
    const course = cn(o.meeting.courseId), name = course?.name ?? 'Class', start = atTime(o.date.getTime(), o.meeting.start), end = atTime(o.date.getTime(), o.meeting.end);
    const lead = s.courseLead[o.meeting.courseId] ?? s.classLeadMin, key = `${ymd(o.date)}${o.meeting.start}${o.meeting.courseId}`;
    if (s.classSoon && lead > 0) push({ kind: 'class', at: start - lead * MIN, title: `${name} in ${lead} min`, body: `${course?.room ?? ''}${course?.teacher ? ' · ' + course.teacher : ''} · ${fmtTime(start)}`.replace(/^ · /, ''), channel: 'classes', route: 'Today', entityId: key }, { skipClass: true, weekendDrops: true });
    if (s.classEnded && !i.attendance[`${ymd(o.date)}|${o.meeting.start}|${o.meeting.courseId}`]) push({ kind: 'ended', at: end, title: `${name} just ended`, body: 'Mark it with the Here, Late or Absent button.', channel: 'classes', route: 'Today', entityId: key }, { skipClass: true, weekendDrops: true });
  }
  // tasks
  for (const t of i.tasks) {
    if (t.status === 2 || t.dueAt === null) { if (t.status !== 2 && t.startAt) pushStart(t); continue; }
    const isExam = t.kind === 'exam', allowed = isExam ? s.examReminders : s.taskReminders, cname = cn(t.courseId)?.name ?? 'Personal';
    if (allowed) for (const r of t.reminders) {
      const at = r.mode === 'abs' ? r.at : t.dueAt - r.minutes * MIN;
      if (at < i.now || at > horizon) continue;
      const left = t.dueAt - at;
      push({ kind: isExam ? 'exam' : 'task', at, title: t.title, body: `${cname} · due ${fmtTime(t.dueAt)}${left > 0 ? ` (in ${fmtDur(Math.round(left / MIN))})` : ''}`, channel: 'tasks', route: 'Tasks', entityId: t.id }, { notAfter: t.dueAt });
    }
    pushStart(t);
    function pushStart(x: Task) {
      if (x.startAt && x.startAt > i.now && x.startAt < horizon && s.taskReminders) push({ kind: 'start', at: x.startAt, title: `Start: ${x.title}`, body: `${cn(x.courseId)?.name ?? 'Personal'}${x.estimateMin ? ' · about ' + fmtDur(x.estimateMin) : ''}`, channel: 'tasks', route: 'Tasks', entityId: x.id + 's' }, { notAfter: x.dueAt ?? undefined });
      if (s.startBy && x.status === 0 && x.dueAt !== null && x.estimateMin !== null) {
        const w = workload(x, i, cx);
        if (w && w.startBy > i.now && w.startBy < horizon) push({ kind: 'start', at: w.startBy, title: `Start now: ${x.title}`, body: `Needs about ${fmtDur(w.needMin)} and that is all the free time you have before it is due.`, channel: 'tasks', route: 'Tasks', entityId: x.id + 'b' }, { notAfter: x.dueAt });
      }
    }
  }
  const seen = new Set<string>(), items = raw.filter((p) => p.at > i.now + 5000 && !seen.has(p.id) && !!seen.add(p.id)).sort((a, b) => a.at - b.at);
  return { items: items.slice(0, cap), deferred: Math.max(0, items.length - cap), dropped };
}
