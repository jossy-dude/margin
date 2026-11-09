import type { AlarmRule, AttRecord, Course, DayMark, Meeting, Settings, SubjectVariant, Task } from './types';
import { addDays, atTime, startOfDay, weekdayOf, ymd } from './time';
import { effective, isCancelled, occEnd, occKey, occurrencesOn } from './attendance';
import { inSemester } from './semester';
import { roomOf } from './rooms';

/**
 * The agenda (v0.7): what the planner knows, written down for the parts of Margin that run without the app —
 * the home-screen widgets, the pinned class notification and the alarms (`modules/margin-native`, `Agenda.kt`).
 *
 * It is one small JSON document, rebuilt whenever the planner changes: the next two weeks of classes as
 * concrete instants (cancelled ones and days outside the term already left out), the open tasks by due date,
 * and the alarm rules. The native side only reads it, so every rule about what a class IS stays here.
 * Pure: the same input always builds the same document.
 */
export interface AgendaClass { k: string; s: number; e: number; t: string; r: string; w: string }
export interface AgendaTask { id: string; t: string; d: number; s: string; k: string }
export interface AgendaAlarm { id: string; label: string; h: number; m: number; days: boolean[]; at: number[]; snooze: number; vib: boolean; on: boolean }
export interface AgendaDoc { v: 1; at: number; h12: boolean; pinClass: boolean; classes: AgendaClass[]; tasks: AgendaTask[]; alarms: AgendaAlarm[] }

export interface AgendaInput {
  now: number; courses: readonly Course[]; meetings: readonly Meeting[]; variants?: readonly SubjectVariant[];
  attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>; tasks: readonly Task[];
  settings: Pick<Settings, 'hour12' | 'semesterStart' | 'semesterEnd' | 'alarms' | 'notif'>;
}

/** How far ahead the classes are written out. The app refreshes it on every open, so two weeks is slack, not a limit. */
export const AGENDA_DAYS = 14;
/** An alarm that follows the timetable is resolved further out: it must still ring if the app is not opened for a while. */
export const ALARM_DAYS = 35;
const MAX_TASKS = 12;

/** The classes of one local day, in order, as the surfaces print them. Cancelled classes are left out. */
function classesOn(day: number, i: AgendaInput): AgendaClass[] {
  const date = new Date(day);
  if (!inSemester(date, i.settings)) return [];
  const out: AgendaClass[] = [];
  for (const { meeting } of occurrencesOn(date, i.meetings as Meeting[])) {
    if (isCancelled(effective(date, meeting, i.attendance, i.dayMarks, i.now))) continue;
    const course = i.courses.find((c) => c.id === meeting.courseId);
    if (!course) continue;
    const variant = meeting.variantId ? i.variants?.find((v) => v.id === meeting.variantId) : undefined;
    out.push({
      k: occKey(ymd(date), meeting), s: atTime(day, meeting.start), e: occEnd(day, meeting),
      t: variant?.name ? `${course.name} · ${variant.name}` : course.name,
      r: roomOf(meeting, course, (i.variants ?? []) as SubjectVariant[]), w: (variant?.teacher || course.teacher || '').trim(),
    });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** When a timetable alarm rings: `lead` minutes before the first class of each chosen day, for the days ahead. */
export function classAlarmTimes(rule: Pick<AlarmRule, 'days' | 'lead'>, i: AgendaInput, days = ALARM_DAYS): number[] {
  const out: number[] = [], today = startOfDay(i.now);
  for (let d = 0; d < days; d++) {
    const day = addDays(today, d);
    if (!rule.days[weekdayOf(new Date(day))]) continue;
    const first = classesOn(day, i)[0];
    if (!first) continue;
    const at = first.s - rule.lead * 60_000;
    if (at > i.now) out.push(at);
  }
  return out;
}

/** The next time a clock alarm's hour and minute come round: today if still ahead, otherwise tomorrow. */
export function nextClockTime(h: number, m: number, now: number): number {
  const d = new Date(now); d.setHours(h, m, 0, 0);
  return d.getTime() > now ? d.getTime() : addDays(d.getTime(), 1);
}

/**
 * When a rule rings next, or null when it will not (off, a one-off that has passed, a timetable alarm with no
 * class ahead). The same answer the phone computes natively — this one is for the app's own list.
 */
export function nextRing(rule: AlarmRule, i: AgendaInput): number | null {
  if (!rule.on) return null;
  if (rule.kind === 'class') return classAlarmTimes(rule, i)[0] ?? null;
  if (!rule.days.some(Boolean)) return rule.once && rule.once > i.now ? rule.once : null;
  for (let d = 0; d <= 7; d++) {
    const at = new Date(addDays(startOfDay(i.now), d)); at.setHours(rule.h, rule.m, 0, 0);
    if (rule.days[weekdayOf(at)] && at.getTime() > i.now) return at.getTime();
  }
  return null;
}

/** A one-off alarm whose moment has passed has rung; it is switched off rather than left looking armed. */
export function spentAlarms(rules: readonly AlarmRule[], now: number): AlarmRule[] | null {
  let changed = false;
  const next = rules.map((r) => { if (r.on && r.kind === 'clock' && !r.days.some(Boolean) && (!r.once || r.once <= now)) { changed = true; return { ...r, on: false }; } return r; });
  return changed ? next : null;
}

function alarmOf(rule: AlarmRule, i: AgendaInput): AgendaAlarm {
  const base = { id: rule.id, label: rule.label.trim(), h: rule.h, m: rule.m, snooze: rule.snooze, vib: rule.vib, on: rule.on };
  /* A timetable alarm and a one-off both go across as concrete instants; only a weekly clock alarm goes as a
     rule, because that one the phone can keep computing for ever without the app. */
  if (rule.kind === 'class') return { ...base, days: rule.days, at: rule.on ? classAlarmTimes(rule, i) : [] };
  if (!rule.days.some(Boolean)) return { ...base, days: rule.days, at: rule.on && rule.once && rule.once > i.now ? [rule.once] : [], on: rule.on && !!rule.once && rule.once > i.now };
  return { ...base, days: rule.days, at: [] };
}

export function buildAgenda(i: AgendaInput): AgendaDoc {
  const today = startOfDay(i.now), classes: AgendaClass[] = [];
  for (let d = 0; d < AGENDA_DAYS; d++) classes.push(...classesOn(addDays(today, d), i));
  const tasks = i.tasks.filter((t) => t.status !== 2 && t.dueAt !== null).sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).slice(0, MAX_TASKS)
    .map((t) => ({ id: t.id, t: t.title, d: t.dueAt as number, s: i.courses.find((c) => c.id === t.courseId)?.name ?? '', k: t.kind }));
  return { v: 1, at: i.now, h12: i.settings.hour12, pinClass: i.settings.notif.enabled && i.settings.notif.pinClass, classes, tasks, alarms: (i.settings.alarms ?? []).map((r) => alarmOf(r, i)) };
}

/** What makes two agendas the same for the phone: everything but the moment they were built. */
export const agendaSig = (a: AgendaDoc) => JSON.stringify({ ...a, at: 0 });

export const newAlarm = (id: string, now: number): AlarmRule => ({ id, label: '', kind: 'clock', h: 7, m: 0, days: [true, true, true, true, true, false, false], lead: 60, on: true, snooze: 10, vib: true, once: nextClockTime(7, 0, now) });
