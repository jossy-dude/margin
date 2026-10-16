import type { Course, FocusSession, Meeting, Mark, Notice, Snapshot, Task } from '../domain/types';
import { addDays, atTime, mondayOf, startOfDay } from '../domain/time';
import { DEFAULT_SETTINGS } from '../domain/defaults';

const COURSES: [string, string, string, string][] = [
  ['E', 'Intro to Economics', 'B-12', 'Hale'], ['D', 'Discrete Mathematics', 'L-2', 'Okafor'], ['T', 'Emerging Technology', 'A-7', 'Voss'],
  ['C', 'Computer Programming', 'C-4', 'Reyes'], ['B', 'Database Systems', 'L-4', 'Nkemi'],
];
const TT: [string, string, string][][] = [
  [['08:30', '09:20', 'E'], ['10:00', '10:50', 'D'], ['11:45', '12:35', 'T'], ['14:00', '14:50', 'C']],
  [['09:00', '09:50', 'C'], ['10:55', '11:45', 'E'], ['13:15', '14:05', 'B']],
  [['08:30', '09:20', 'D'], ['10:00', '10:50', 'T'], ['11:45', '12:35', 'E']],
  [['09:00', '09:50', 'B'], ['10:55', '11:45', 'C'], ['13:15', '14:05', 'E']],
  [['08:30', '10:00', 'D'], ['10:55', '11:45', 'T'], ['12:40', '13:30', 'C'], ['14:15', '15:05', 'B']],
  [], [],
];
/** The demo set from Marginalia v10, dated relative to `now` so it is never stale. */
export function seedSnapshot(now = Date.now()): Snapshot {
  const mon = mondayOf(now), day = startOfDay(now);
  const courses: Course[] = COURSES.map(([id, name, room, teacher], sort) => ({ id, name, room, teacher, goal: null, sort }));
  const meetings: Meeting[] = TT.flatMap((pl, weekday) => pl.map(([start, end, courseId]) => ({ id: `m-${weekday}-${start}-${courseId}`, courseId, weekday, start, end })));
  const rem = (id: string) => [{ id: `${id}-r`, mode: 'before' as const, minutes: 60, label: '1 h before' }];
  const mk = (n: number, title: string, c: string | null, d: number, du: string, status: 0 | 1 | 2, est: number | null, kind: Task['kind'] = 'assignment', notes = ''): Task => ({
    id: `seed-task-${n}`, title, courseId: c, kind, dueAt: atTime(addDays(mon, d), du), startAt: null, estimateMin: est, priority: 0, notes, status, createdAt: now - 3 * 86_400_000,
    completedAt: status === 2 ? now - 3_600_000 : null, reminders: rem(`seed-task-${n}`), subtasks: [], demo: false,
  });
  const tasks: Task[] = [
    mk(1, 'Lab report — set proofs', 'D', 0, '23:59', 2, 120), mk(2, 'Reading response — Ch. 7', 'E', 0, '16:00', 0, 45, 'reading'), mk(3, 'Flashcards: key dates', 'T', 0, '20:00', 0, 30),
    mk(4, 'Problem set 5', 'C', 1, '08:00', 0, 90), mk(5, 'Timeline worksheet', 'T', 2, '09:00', 0, null), mk(6, 'Outline: persuasive essay', 'E', 3, '21:00', 1, 60),
    mk(7, 'Essay final draft', 'E', 4, '12:00', 0, 240), mk(8, 'Review flashcards', null, 5, '17:00', 0, 30, 'other'),
    { ...mk(9, 'Library book due', null, 0, '17:00', 0, null, 'deadline', 'Returns desk'), dueAt: atTime(day, '17:00') },
    { ...mk(10, 'Midterms begin', null, 0, '09:00', 0, null, 'exam', 'Hall A'), dueAt: atTime(new Date(2026, 9, 26).getTime(), '09:00') },
  ];
  // a few finished tasks in the past so Stats has a shape on day one (flagged demo, removable in Settings)
  const hist: [string, string, number, number, number][] = [['Quiz 2 revision', 'E', 5, 21, 20], ['Pseudocode sheet', 'C', 9, 17, 18], ['ER diagram', 'B', 12, 22, 20], ['Proof practice', 'D', 16, 14, 11], ['Tech brief', 'T', 20, 19, 18], ['Lab warm-up', 'D', 26, 15, 14]];
  hist.forEach(([title, c, ago, doneH, dueH], i) => {
    const d = addDays(day, -ago);
    tasks.push({ id: `demo-task-${i}`, title, courseId: c, kind: 'assignment', dueAt: atTime(d, `${String(dueH).padStart(2, '0')}:00`), startAt: null, estimateMin: 60, priority: 0, notes: '', status: 2, createdAt: addDays(d, -3), completedAt: atTime(d, `${String(doneH).padStart(2, '0')}:10`), reminders: [], subtasks: [], demo: true });
  });
  const notices: Notice[] = [
    { id: 'seed-note-0', courseId: 'D', text: 'Lab groups rotate this week — check the door list before you come in.', dueAt: new Date(2026, 9, 2).getTime(), priority: 0 },
    { id: 'seed-note-1', courseId: 'E', text: 'Bring the sources binder on Thursday, essay workshop starts.', dueAt: new Date(2026, 9, 1).getTime(), priority: 2 },
    { id: 'seed-note-2', courseId: 'T', text: 'Midterm topic list is on the class page. Skim it before Monday.', dueAt: new Date(2026, 9, 4).getTime(), priority: 3 },
  ];
  const sc: Record<string, (number | null)[]> = { E: [80, 90, 72, null], D: [70, 85, null, null], C: [95, 88, 91, null], T: [null, null, null, null], B: [null, null, null, null] };
  const marks: Mark[] = courses.flatMap((c) => ['Quiz', 'Assign', 'Mid', 'Final'].map((name, i): Mark => ({ id: `seed-mark-${c.id}-${i}`, courseId: c.id, name, score: sc[c.id]?.[i] ?? null, weight: [10, 10, 40, 40][i] ?? 10, on: true, sort: i })));
  const focus: FocusSession[] = [];
  for (let i = 0; i < 20; i++) {
    const ago = (i * 7 + 3) % 33, d = addDays(day, -ago), h = [9, 10, 14, 16, 19, 20, 21][i % 7] ?? 10, c = COURSES[i % 5]?.[0] ?? 'E', min = [25, 45, 50, 25, 90][i % 5] ?? 25;
    focus.push({ id: `demo-focus-${i}`, taskId: null, courseId: c, startedAt: atTime(d, `${String(h).padStart(2, '0')}:05`), endedAt: atTime(d, `${String(h).padStart(2, '0')}:05`) + min * 60_000, focusSec: min * 60, breakSec: min >= 45 ? 300 : 0, overSec: 0, rounds: 1, planMin: min, demo: true });
  }
  return { courses, meetings, attendance: {}, dayMarks: {}, tasks, notices, marks, adjusts: {}, focus, settings: { ...DEFAULT_SETTINGS, seededAt: now } };
}
