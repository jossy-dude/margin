import type { Task } from '../../domain/types';
import { DW, MO, addDays, mondayOf, startOfDay, weekdayOf, ymd } from '../../domain/time';
import { classesOn, dueWhen, weekPills, type ClassItem, type DueRow, type TodayInput, type WeekPill } from '../today/model';

/**
 * Week v2 (DESIGN.md D-12, PLAN R2) as one pure function: `weekView(input) → WeekVM`. The page draws it; the drag
 * asks `dropSlot` where a card would land. One-off moves (`settings.moves`) are applied by `classesOn`, so a class
 * moved this week shows where it went, here as on Today.
 */
export interface WeekInput extends Pick<TodayInput, 'now' | 'meetings' | 'courses' | 'variants' | 'attendance' | 'dayMarks' | 'hour12' | 'moves'> {
  tasks: Task[];
  /** weeks from this one (−1 last week, 1 next) */
  off: number;
  /** the day picked in the strip, or null for today (this week) / Monday (another week) */
  sel: number | null;
}
export interface WeekDay { day: number; date: string; wd: number; dw: string; label: string; isToday: boolean; classes: ClassItem[] }
export interface WeekVM {
  mon: number; label: string; when: string;
  days: WeekDay[]; sel: WeekDay; pills: WeekPill[];
  /** the grid's span in minutes since midnight: whole hours, at least 08:00–16:00 */
  span: { start: number; end: number };
  due: { day: number; label: string; rows: DueRow[] }[]; dueCount: number;
}

const short = (ms: number) => `${new Date(ms).getDate()} ${MO[new Date(ms).getMonth()]?.slice(0, 3)}`;
/** Minutes since midnight as `HH:MM`, the timetable's own format. */
export const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function weekView(i: WeekInput): WeekVM {
  const today = startOfDay(i.now), mon = addDays(mondayOf(i.now), i.off * 7);
  const inWeek = (d: number) => d >= mon && d < addDays(mon, 7);
  const sel = i.sel !== null && inWeek(startOfDay(i.sel)) ? startOfDay(i.sel) : inWeek(today) ? today : mon;
  const days: WeekDay[] = Array.from({ length: 7 }, (_, k) => {
    const day = addDays(mon, k), d = new Date(day);
    return { day, date: ymd(d), wd: weekdayOf(d), dw: DW[k]!, label: `${DW[k]} ${short(day)}`, isToday: day === today, classes: classesOn(day, i) };
  });
  const all = days.flatMap((d) => d.classes);
  const mins = (x: ClassItem) => [Math.round((x.start - startOfDay(x.start)) / 60_000), Math.round((x.end - startOfDay(x.start)) / 60_000)] as const;
  const start = Math.min(8 * 60, ...all.map((x) => Math.floor(mins(x)[0] / 60) * 60));
  const end = Math.max(16 * 60, ...all.map((x) => Math.min(24 * 60, Math.ceil(mins(x)[1] / 60) * 60)));
  const open = i.tasks.filter((t) => t.status !== 2 && t.dueAt !== null && inWeek(startOfDay(t.dueAt))).sort((a, b) => (a.dueAt as number) - (b.dueAt as number));
  const due = days.map((d) => ({
    day: d.day, label: d.isToday ? `Today · ${d.label}` : d.label,
    rows: open.filter((t) => startOfDay(t.dueAt as number) === d.day).map((t): DueRow => ({
      id: t.id, title: t.title, when: dueWhen(t.dueAt as number, i.now, i.hour12), late: (t.dueAt as number) < i.now,
      course: i.courses.find((c) => c.id === t.courseId)?.name ?? '', courseId: t.courseId,
    })),
  })).filter((g) => g.rows.length);
  return {
    mon, label: `${short(mon)} – ${short(addDays(mon, 6))}`,
    when: i.off === 0 ? 'This week' : i.off === 1 ? 'Next week' : i.off === -1 ? 'Last week' : i.off > 0 ? `In ${i.off} weeks` : `${-i.off} weeks ago`,
    days, sel: days.find((d) => d.day === sel)!, pills: weekPills(sel, i), span: { start, end }, due, dueCount: open.length,
  };
}

/** A grid slot: the day column (0 = Monday) and the start, in minutes since midnight. */
export interface Slot { day: number; start: number }
/** The grid's snap (D-23): 5 minutes. */
export const SNAP = 5;
/** Where a card picked up on `day0` at `start0` (`dur` minutes long) lands when dropped `dx`, `dy` dp away: the
 *  column it is over and its start snapped to 5 min, kept inside the grid so the whole class still fits. A worklet,
 *  because the drag asks it on the UI thread on every frame. */
export function dropSlot(day0: number, start0: number, dur: number, dx: number, dy: number, colW: number, px: number, s0: number, s1: number): Slot {
  'worklet';
  const day = Math.min(6, Math.max(0, day0 + Math.round(dx / Math.max(1, colW))));
  const snapped = Math.round((start0 + dy / Math.max(0.01, px)) / SNAP) * SNAP;
  return { day, start: Math.min(Math.max(s0, snapped), Math.max(s0, s1 - dur)) };
}
/** A slot as one number, so the drag only tells the page when it changes. */
export function slotId(s: Slot): number {
  'worklet';
  return s.day * 10_000 + s.start;
}
export const slotOf = (id: number): Slot => ({ day: Math.floor(id / 10_000), start: id % 10_000 });
