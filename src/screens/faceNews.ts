/**
 * Which attendance marks and saved grades are news for the page's face (DESIGN.md D-21, mascot INTEGRATE.md §2).
 * Pure: the callers pass the store's state as it was just before the write, and the new value is laid over it.
 */
import { effective, occurrencesBetween, parseOccKey } from '../domain/attendance';
import { addDays, mondayOf, parseYmd } from '../domain/time';
import { courseGrade } from '../domain/grades';
import type { AttRecord, AttStatus, Course, DayMark, Mark, Meeting, SubjectVariant } from '../domain/types';
import type { FaceEvent } from '../ui/mascot/moments';
import type { ClassMove } from '../domain/moves';

/** Marking `key` as `s`: present bounces, absent droops, cancelled is no news. The present mark that leaves every
 *  class of its week marked present (cancelled ones aside) is `weekAttended` instead. */
export function attNews(key: string, s: AttStatus, st: { meetings: Meeting[]; attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>; now: number; moves?: readonly ClassMove[] }): FaceEvent | null {
  if (s === 'a') return 'markedAbsent';
  if (s !== 'p') return null;
  const k = parseOccKey(key);
  if (!k) return 'markedPresent';
  const mon = mondayOf(parseYmd(k.date).getTime());
  const att = { ...st.attendance, [key]: { key, status: s, at: st.now, reason: '' } };
  const week = occurrencesBetween(mon, addDays(mon, 6), st.meetings, st.moves ?? []).map(({ date, meeting }) => effective(date, meeting, att, st.dayMarks, st.now));
  const all = week.length > 0 && week.every((e) => !e.inferred && (e.status === 'p' || e.status === 'c')) && week.some((e) => e.status === 'p');
  return all ? 'weekAttended' : 'markedPresent';
}

/** Saving `m`: when its course has a goal, the course's total with this mark in it is on/over the goal (smug) or
 *  under it (sad). No goal, or no total yet, is no news. */
export function markNews(m: Mark, st: { courses: Course[]; marks: Mark[]; adjusts: Record<string, number>; variants?: SubjectVariant[] }): FaceEvent | null {
  const goal = st.courses.find((c) => c.id === m.courseId)?.goal;
  if (!goal || m.score === null) return null;
  const t = courseGrade([...st.marks.filter((x) => x.courseId === m.courseId && x.id !== m.id), m], (st.variants ?? []).filter((v) => v.subjectId === m.courseId), st.adjusts[m.courseId] ?? 0);
  if (t === null) return null;
  return t >= goal ? 'gradeAtGoal' : 'gradeBelowGoal';
}
