import type { Meeting } from './types';
import { hm } from './time';

/**
 * One-off class moves (PLAN R2, Question 9: "a cancelled or moved lab this week is common"). A move says the class
 * `meetingId` that would happen on `date` happens on `to`, `start`–`end`, that week only; the weekly timetable is
 * untouched. Dates are `YYYY-MM-DD`, times `HH:MM`, like everything else in the timetable.
 *
 * A moved class is a copy of its meeting at the new time, so its attendance key (`date|start|course`) is the new
 * slot's: the class happened there, and a mark made on it reads back there. The regular occurrence it replaces simply
 * does not happen. Every consumer of `occurrencesOn` that passes the moves sees the same day. Pure.
 */
export interface ClassMove { id: string; meetingId: string; date: string; to: string; start: string; end: string }

/** One day's meetings with the moves applied: the regular ones for weekday `wd` minus those moved away from `day`,
 *  plus copies of those moved onto `day` at their new time. */
export function dayMeetings(day: string, wd: number, meetings: readonly Meeting[], moves: readonly ClassMove[]): Meeting[] {
  const out = meetings.filter((m) => m.weekday === wd && !moves.some((v) => v.meetingId === m.id && v.date === day));
  for (const v of moves) {
    if (v.to !== day) continue;
    const m = meetings.find((x) => x.id === v.meetingId);
    if (m) out.push({ ...m, weekday: wd, start: v.start, end: v.end });
  }
  return out;
}

/** The move that put `meetingId` onto `day` at `start`, if the class shown there is a moved one. */
export const moveAt = (moves: readonly ClassMove[], meetingId: string, day: string, start: string) =>
  moves.find((v) => v.meetingId === meetingId && v.to === day && v.start === start) ?? null;

/** Where a class shown on `day` at `start` regularly belongs: the move's origin, or that day itself. */
export function originOf(moves: readonly ClassMove[], m: Meeting, day: string, start: string): { date: string; start: string } {
  const v = moveAt(moves, m.id, day, start);
  return v ? { date: v.date, start: m.start } : { date: day, start };
}

/**
 * The moves after moving the class shown on `fromDay` at `fromStart` to `to`, `start`–`end`, this week only.
 * A class already moved is moved again (one move per occurrence, never a chain); moving it back onto its own
 * regular slot removes the move.
 */
export function withMove(moves: readonly ClassMove[], m: Meeting, fromDay: string, fromStart: string, to: string, start: string, end: string, id: string): ClassMove[] {
  const prev = moveAt(moves, m.id, fromDay, fromStart);
  const date = prev ? prev.date : fromDay;
  const rest = moves.filter((v) => v !== prev);
  if (to === date && start === m.start && end === m.end) return rest;
  return [...rest, { id: prev?.id ?? id, meetingId: m.id, date, to, start, end }];
}

/** Would the class land on a slot where the same subject (and variant) already starts at that time that day? Two
 *  such classes would share one attendance key and could never be marked apart (`saveMeeting` refuses it too). */
export function moveClashes(day: string, wd: number, meetings: readonly Meeting[], moves: readonly ClassMove[], m: Meeting, start: string, except: { day: string; start: string }): boolean {
  return dayMeetings(day, wd, meetings, moves).some((x) => x.courseId === m.courseId && (x.variantId ?? null) === (m.variantId ?? null) && hm(x.start) === hm(start)
    && !(x.id === m.id && day === except.day && x.start === except.start));
}
