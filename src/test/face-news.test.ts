/**
 * v0.7 U7 — which attendance marks and grades are news for the page's face (mascot INTEGRATE.md §2): present
 * bounces, absent droops, the mark that completes a fully attended week blushes, and a saved mark that lands a
 * course on or under its goal is smug or sad. Cancelled classes and courses with no goal say nothing.
 */
import { attNews, markNews } from '../screens/faceNews';
import { occKey } from '../domain/attendance';
import type { AttRecord, Course, Mark, Meeting } from '../domain/types';

// Monday 5 Oct 2026 and Wednesday 7 Oct: one class each, the same course
const mon: Meeting = { id: 'm1', courseId: 'c1', weekday: 0, start: '09:00', end: '10:00', demo: false };
const wed: Meeting = { id: 'm2', courseId: 'c1', weekday: 2, start: '11:00', end: '12:00', demo: false };
const kMon = occKey('2026-10-05', mon), kWed = occKey('2026-10-07', wed);
const rec = (key: string, status: AttRecord['status']): AttRecord => ({ key, status, at: 0, reason: '' });
const NOW = new Date(2026, 9, 9, 18).getTime(); // Friday evening: the week's classes are over
const st = (attendance: Record<string, AttRecord> = {}) => ({ meetings: [mon, wed], attendance, dayMarks: {}, now: NOW });

describe('attendance news', () => {
  it('present is good news, absent is bad news, cancelled is no news', () => {
    expect(attNews(kMon, 'p', st())).toBe('markedPresent');
    expect(attNews(kMon, 'a', st())).toBe('markedAbsent');
    expect(attNews(kMon, 'c', st())).toBeNull();
  });
  it('the mark that completes a week with every class present is a bigger one', () => {
    expect(attNews(kWed, 'p', st({ [kMon]: rec(kMon, 'p') }))).toBe('weekAttended');
  });
  it('a week with a class still unmarked, or one absence, is only a present', () => {
    expect(attNews(kWed, 'p', st())).toBe('markedPresent');
    expect(attNews(kWed, 'p', st({ [kMon]: rec(kMon, 'a') }))).toBe('markedPresent');
  });
  it('a cancelled class does not spoil the week, but a week of nothing but cancellations is no news', () => {
    expect(attNews(kWed, 'p', st({ [kMon]: rec(kMon, 'c') }))).toBe('weekAttended');
  });
});

describe('grade news', () => {
  const course = (goal: number | null): Course => ({ id: 'c1', name: 'Discrete', rooms: [], teacher: '', goal, sort: 0, demo: false });
  const mark = (id: string, score: number | null, weight = 1): Mark => ({ id, courseId: 'c1', name: id, score, weight, on: true, sort: 0, demo: false });
  const gs = (goal: number | null, marks: Mark[] = []) => ({ courses: [course(goal)], marks, adjusts: {} });
  it('a saved mark that puts the course on or over its goal is smug, under it is sad', () => {
    expect(markNews(mark('a', 90), gs(80))).toBe('gradeAtGoal');
    expect(markNews(mark('a', 80), gs(80))).toBe('gradeAtGoal');
    expect(markNews(mark('a', 60), gs(80))).toBe('gradeBelowGoal');
  });
  it('the new mark counts with the others, and an edit replaces the old version of itself', () => {
    expect(markNews(mark('b', 70), gs(80, [mark('a', 100)]))).toBe('gradeAtGoal'); // 85 average
    expect(markNews(mark('a', 50), gs(80, [mark('a', 100)]))).toBe('gradeBelowGoal');
  });
  it('a course with no goal, or a mark with no score yet, says nothing', () => {
    expect(markNews(mark('a', 90), gs(null))).toBeNull();
    expect(markNews(mark('a', null), gs(80))).toBeNull();
  });
});
