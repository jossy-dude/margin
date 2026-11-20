/**
 * The Subjects page's numbers (v0.8 §3.3), pure: one card per subject with its grade against its goal, its
 * attendance this term, and its next class; a subject's Obsidian tag, kept unique. No store, no React.
 */
import type { AttRecord, Course, DayMark, Mark, Meeting, Notice, SubjectVariant, Task } from './types';
import type { ClassMove } from './moves';
import { courseGrade } from './grades';
import { attendanceRate, isCancelled, effective, occurrencesBetween } from './attendance';
import { DW, addDays, atTime, fmtTime, startOfDay, weekdayOf } from './time';
import { subjectTag } from './vaultTasks';

export interface SubjectInput {
  now: number; termStart: number; hour12: boolean;
  courses: readonly Course[]; meetings: readonly Meeting[]; variants: readonly SubjectVariant[]; marks: readonly Mark[]; adjusts: Record<string, number>;
  attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>; tasks: readonly Task[]; notices: readonly Notice[]; moves?: readonly ClassMove[];
}
export interface SubjectCard {
  id: string; name: string; tag: string; color: string | null; archived: boolean;
  grade: number | null; goal: number | null;
  /** 0–1, or null before any class was held */
  att: number | null; attGoal: number | null;
  next: string | null; openTasks: number; notices: number;
}

export function subjectCards(i: SubjectInput): SubjectCard[] {
  return [...i.courses].filter((c) => !c.demo).sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.sort - b.sort).map((c) => subjectCard(c, i));
}
export function subjectCard(c: Course, i: SubjectInput): SubjectCard {
  const parts = i.variants.filter((v) => v.subjectId === c.id);
  const grade = courseGrade(i.marks.filter((m) => m.courseId === c.id && m.on) as Mark[], parts, i.adjusts[c.id] ?? 0);
  const mine = i.meetings.filter((m) => m.courseId === c.id) as Meeting[];
  const occ = occurrencesBetween(i.termStart, i.now, mine, i.moves ?? []);
  const att = attendanceRate(occ, i.attendance, i.dayMarks, i.now).rate;
  const base = parts.find((p) => p.isBase);
  return {
    id: c.id, name: c.name, tag: subjectTag(c), color: c.color ?? null, archived: !!c.archived,
    grade, goal: c.goal, att, attGoal: base?.attGoal ?? null,
    next: nextClass(c, i), openTasks: i.tasks.filter((t) => t.courseId === c.id && t.status !== 2).length,
    notices: i.notices.filter((n) => n.courseId === c.id && !n.archived).length,
  };
}
/** "Tomorrow 08:30 · L-4", "Today 14:00", or null with no class in the next two weeks. */
export function nextClass(c: Course, i: Pick<SubjectInput, 'now' | 'meetings' | 'attendance' | 'dayMarks' | 'hour12' | 'moves'>): string | null {
  const mine = i.meetings.filter((m) => m.courseId === c.id) as Meeting[];
  for (const o of occurrencesBetween(startOfDay(i.now), addDays(startOfDay(i.now), 14), mine, i.moves ?? [])) {
    const at = atTime(o.date.getTime(), o.meeting.start);
    if (at < i.now || isCancelled(effective(o.date, o.meeting, i.attendance, i.dayMarks, i.now))) continue;
    const d = Math.round((startOfDay(at) - startOfDay(i.now)) / 86_400_000);
    const day = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : DW[weekdayOf(o.date)];
    const room = o.meeting.room || c.rooms[0] || '';
    return `${day} ${fmtTime(at, i.hour12)}${room ? ` · ${room}` : ''}`;
  }
  return null;
}
/** A tag as written in notes (`#Database-Systems`), and whether another subject already has it. */
export const normTag = (t: string) => `#${t.trim().replace(/^#+/, '').replace(/\s+/g, '-')}`;
export function tagTaken(tag: string, courseId: string, courses: readonly Course[]): boolean {
  const k = normTag(tag).toLocaleLowerCase();
  return courses.some((c) => c.id !== courseId && !c.demo && subjectTag(c).toLocaleLowerCase() === k);
}
/** What deleting a subject takes with it, in words, for the second "are you sure". */
export function deleteSays(c: Course, i: Pick<SubjectInput, 'meetings' | 'marks' | 'tasks' | 'notices'>): string {
  const n = { classes: i.meetings.filter((m) => m.courseId === c.id).length, marks: i.marks.filter((m) => m.courseId === c.id).length, tasks: i.tasks.filter((t) => t.courseId === c.id).length };
  const bits = [n.classes ? `${n.classes} weekly class${n.classes === 1 ? '' : 'es'}` : '', n.marks ? `${n.marks} mark${n.marks === 1 ? '' : 's'}` : '', n.tasks ? `${n.tasks} task${n.tasks === 1 ? '' : 's'} lose their subject` : ''].filter(Boolean);
  return bits.length ? `Deletes ${c.name} with ${bits.join(', ')}.` : `Deletes ${c.name}.`;
}
