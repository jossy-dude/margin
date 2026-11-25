import type { Course, Meeting, SubjectVariant } from '../../domain/types';

/* The owner's real timetable (vault `Margin/Subjects.md`, `Margin/Timetable.md`, 2026-11-25), as Marrow stores it:
   Database Systems has a Lab part (LAB201) beside its lectures (LR601, LR303); Computer Programming has NO part,
   its lab is only the room LAB301 on Thursday. Weekdays are Monday-first (0 = Monday). */
export const REAL_COURSES: Course[] = [
  { id: 'db', name: 'Database Systems', rooms: ['LR601', 'LR303', 'LAB201'], teacher: '', goal: null, sort: 0, demo: false },
  { id: 'cp', name: 'Computer Programming', rooms: ['LR302', 'LR202', 'LB302', 'LAB302', 'LAB301'], teacher: '', goal: null, sort: 1, demo: false },
  { id: 'dm', name: 'Discrete Mathematics', rooms: ['LR302'], teacher: '', goal: null, sort: 2, demo: false },
  { id: 'ec', name: 'Introduction to Economics', rooms: ['LR401', 'LR402'], teacher: '', goal: null, sort: 3, demo: false },
  { id: 'et', name: 'Intro to Emerging Technologies', rooms: ['LR303'], teacher: '', goal: null, sort: 4, demo: false },
];
export const REAL_VARIANTS: SubjectVariant[] = [
  { id: 'db~base', subjectId: 'db', name: 'Lecture', room: 'LR601', teacher: '', note: '', ord: -1, kind: 'lecture', isBase: true, scale: 100, weight: null, attGoal: null },
  { id: 'db~lab', subjectId: 'db', name: 'Lab', room: 'LAB201', teacher: '', note: '', ord: 0, kind: 'lab', isBase: false, scale: 100, weight: null, attGoal: null },
];
const m = (id: string, courseId: string, weekday: number, start: string, end: string, room: string, variantId: string | null = null): Meeting => ({ id, courseId, weekday, start, end, room, variantId, demo: false });
export const REAL_MEETINGS: Meeting[] = [
  m('cp-thu', 'cp', 3, '08:00', '09:30', 'LAB301'), m('dm-thu', 'dm', 3, '11:30', '13:00', 'LR302'),
  m('cp-fri', 'cp', 4, '09:45', '11:15', 'LR202'), m('ec-fri', 'ec', 4, '14:00', '15:30', 'LR402'), m('et-fri', 'et', 4, '15:30', '17:00', 'LR303'),
  m('db-mon', 'db', 0, '09:45', '11:15', 'LR601'), m('et-mon', 'et', 0, '14:00', '15:30', 'LR303'), m('ec-mon', 'ec', 0, '15:30', '17:00', 'LR401'),
  m('db-tue', 'db', 1, '08:00', '09:30', 'LR303'), m('db-lab', 'db', 1, '09:45', '11:15', 'LAB201', 'db~lab'), m('cp-tue', 'cp', 1, '11:30', '13:00', 'LR302'), m('dm-tue', 'dm', 1, '14:00', '15:30', 'LR302'),
];
