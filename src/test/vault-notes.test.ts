import { timetableNote, subjectsNote, noticesNote, noticeOrder } from '../domain/vaultNotes';
import type { Course, Notice } from '../domain/types';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const ev = (title: string, a: number, kind: 'class' | 'notice', extra = {}) => ({ id: title, origin: 'margin' as const, updatedAt: 1, data: { title, at: a, end: kind === 'class' ? a + 50 * 60_000 : null, kind, course: null, room: 'L-4', cancelled: false, ...extra } });
const c: Course = { id: 'db', name: 'Database Systems', rooms: ['L-4'], teacher: 'Nkemi', goal: 85, sort: 0, demo: false };

describe('generated notes', () => {
  it('the timetable lists classes by day; a notice is never a 00:00 class (S14)', () => {
    const t = timetableNote([ev('DB', at(23, 9), 'class'), ev('Chap 123 4 is unclear', at(23, 0), 'notice'), ev('Eco', at(24, 14), 'class', { cancelled: true })]);
    expect(t).toContain('## Monday 2026-11-23\n- 09:00–09:50 DB · L-4');
    expect(t).toContain('- ~~14:00–14:50 Eco · L-4~~ cancelled');
    expect(t).not.toContain('Chap 123');
    expect(t.startsWith('---\nmargin: timetable\n---')).toBe(true);
  });
  it('subjects show their tag, teacher, rooms and grade', () => {
    const t = subjectsNote({ courses: [c, { ...c, id: 'x', name: 'Old', archived: true }], marks: [{ id: 'k', courseId: 'db', name: 'Mid', score: 80, weight: 100, on: true, sort: 0, demo: false }], variants: [], adjusts: {} });
    expect(t).toContain('## Database Systems\n- Tag: #Database-Systems\n- Teacher: Nkemi\n- Rooms: L-4\n- Grade: 80 % (goal 85 %)');
    expect(t).not.toContain('Old');
  });
  it('the notice board: pinned first, then by date; archived left out', () => {
    const n = (id: string, over: Partial<Notice>): Notice => ({ id, courseId: null, text: id, dueAt: null, priority: 0, demo: false, ...over });
    const list = [n('later', { dueAt: at(25, 9) }), n('pin', { pinned: true }), n('soon', { dueAt: at(21, 9) }), n('gone', { archived: true }), n('undated', {})];
    expect(noticeOrder(list).map((x) => x.id)).toEqual(['pin', 'soon', 'later', 'undated']);
    expect(noticesNote(list, [c], at(20, 8))).toContain('- 📌 pin\n- soon · 2026-11-21');
  });
});
