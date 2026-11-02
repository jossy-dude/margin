import type { Course, Meeting, SubjectVariant } from '../types';

/**
 * DRB2503 — B.Sc. in Computer Science (Regular), HiLCoE, Autumn 2026: sections A, B and C, transcribed from the
 * registrar's final timetable. "LAB Time" is the Database Lab (CS1241 LAB), kept as a Lab variant of Database
 * Systems with its own attendance; the sheet gives it no room. Every id is section-prefixed, so picking one
 * section twice changes nothing and two sections never collide.
 */
const P = [['08:00', '09:30'], ['09:45', '11:15'], ['11:30', '13:00'], ['14:00', '15:30'], ['15:30', '17:00']] as const;
const SUBJECTS = [
  { code: 'cs1241', name: 'Database Systems' }, { code: 'cs1220', name: 'Computer Programming' }, { code: 'cc2131', name: 'Discrete Mathematics' },
  { code: 'cc0193', name: 'Introduction to Economics' }, { code: 'cs1200', name: 'Intro to Emerging Technologies' },
] as const;
type Code = (typeof SUBJECTS)[number]['code'] | 'lab';
/** [weekday 0=Mon, period 1–5, subject, room] */
type Slot = [number, number, Code, string];
const SECTIONS: Record<'A' | 'B' | 'C', Slot[]> = {
  A: [
    [0, 3, 'cs1241', 'LR402'], [0, 4, 'cc0193', 'LR401'], [0, 5, 'cs1200', 'LR303'],
    [1, 1, 'lab', ''], [1, 2, 'cs1220', 'LR302'], [1, 3, 'cc2131', 'LR201'],
    [3, 3, 'lab', ''], [3, 5, 'cc2131', 'LR302'],
    [4, 1, 'cs1241', 'LR201'], [4, 4, 'cs1200', 'LR303'], [4, 5, 'cc0193', 'LR402'],
    [5, 1, 'cs1220', 'LR302'],
  ],
  B: [
    [0, 2, 'cs1241', 'LR601'], [0, 4, 'cs1200', 'LR303'], [0, 5, 'cc0193', 'LR401'],
    [1, 1, 'cs1241', 'LR303'], [1, 2, 'lab', ''], [1, 3, 'cs1220', 'LR302'], [1, 4, 'cc2131', 'LR302'],
    [3, 1, 'lab', ''], [3, 3, 'cc2131', 'LR302'],
    [4, 2, 'cs1220', 'LR202'], [4, 4, 'cc0193', 'LR402'], [4, 5, 'cs1200', 'LR303'],
  ],
  C: [
    [0, 1, 'lab', ''], [0, 3, 'lab', ''],
    [1, 1, 'cc0193', 'LR203'], [1, 2, 'cs1241', 'LR401'], [1, 4, 'cs1220', 'LR301'], [1, 5, 'cc2131', 'LR302'],
    [3, 1, 'cs1200', 'LR203'], [3, 2, 'cc2131', 'LR302'], [3, 5, 'cc0193', 'LR402'],
    [4, 1, 'cs1220', 'LR202'], [4, 2, 'cs1241', 'LR201'], [4, 5, 'cs1200', 'LR203'],
  ],
};

/** The section as a `margin/2` timetable file, the same shape Share timetable writes. */
export function drb2503(section: 'A' | 'B' | 'C'): unknown {
  const pre = `drb2503${section.toLowerCase()}`, slots = SECTIONS[section];
  const courses: Course[] = SUBJECTS.map((s, i) => ({
    id: `${pre}-${s.code}`, name: s.name, teacher: '', goal: null, sort: i, demo: false, bar: null,
    rooms: [...new Set(slots.filter((x) => x[2] === s.code && x[3]).map((x) => x[3]))],
  }));
  const variants: SubjectVariant[] = [{ id: `${pre}-cs1241-lab`, subjectId: `${pre}-cs1241`, name: 'Lab', room: '', teacher: '', note: 'Database Lab (CS1241 LAB)', ord: 0 }];
  const meetings: Meeting[] = slots.map(([wd, per, code, room]) => ({
    id: `${pre}-m${wd}${per}`, courseId: `${pre}-${code === 'lab' ? 'cs1241' : code}`, weekday: wd,
    start: P[per - 1]![0], end: P[per - 1]![1], room: room || null, variantId: code === 'lab' ? `${pre}-cs1241-lab` : null, demo: false,
  }));
  return { app: 'margin', format: 'margin/2', version: 2, pack: { program: 'DRB2503', section, title: `DRB2503 · Section ${section}` }, raw: { courses, meetings, variants } };
}
