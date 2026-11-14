/** v0.7 R5 (D-15): "Are you showing up?" per course, then per part, each against that part's own goal. */
import { attendanceByPart } from '../domain/analytics';
import { occKey } from '../domain/attendance';
import type { AttRecord, Course, Meeting, SubjectVariant } from '../domain/types';

const NOW = new Date(2026, 10, 13, 18).getTime(); // Friday evening
const db: Course = { id: 'db', name: 'Database', rooms: [], teacher: '', goal: null, sort: 0, demo: false };
const v = (id: string, over: Partial<SubjectVariant>): SubjectVariant => ({ id, subjectId: 'db', name: id, room: '', teacher: '', note: '', ord: 0, ...over });
const lec: Meeting = { id: 'm1', courseId: 'db', weekday: 0, start: '09:00', end: '10:00', demo: false };
const lab: Meeting = { id: 'm2', courseId: 'db', weekday: 2, start: '14:00', end: '16:00', demo: false, variantId: 'v-lab' };
const rec = (key: string, status: AttRecord['status']): AttRecord => ({ key, status, at: 0, reason: '' });

it('splits a course\'s classes by part, and "can miss" uses the part\'s goal (lab 90 %, lecture the usual 80 %)', () => {
  const parts = [v('db~base', { name: 'Lecture', isBase: true, ord: 0 }), v('v-lab', { name: 'Lab', ord: 1, attGoal: 90 })];
  const att: Record<string, AttRecord> = {};
  // four weeks: every lecture present; one lab absent
  for (const d of ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']) att[occKey(d, lec)] = rec(occKey(d, lec), 'p');
  for (const d of ['2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11']) att[occKey(d, lab)] = rec(occKey(d, lab), d === '2026-10-28' ? 'a' : 'p');
  const rows = attendanceByPart(db, [lec, lab], parts, att, {}, 28, NOW);
  expect(rows.map((r) => [r.name, r.here, r.held, r.goal])).toEqual([['Lecture', 4, 4, 80], ['Lab', 3, 4, 90]]);
  expect(rows[0]!.canMiss).toBe(1); // 4/5 = 80 %
  expect(rows[1]!.canMiss).toBe(0); // 3/5 = 60 % < 90 %
  expect(rows[1]!.rate).toBeCloseTo(0.75);
});

it('a course with one part or none gets no part rows', () => {
  expect(attendanceByPart(db, [lec], [v('db~base', { isBase: true })], {}, {}, 28, NOW)).toEqual([]);
  expect(attendanceByPart(db, [lec], [], {}, {}, 28, NOW)).toEqual([]);
});
