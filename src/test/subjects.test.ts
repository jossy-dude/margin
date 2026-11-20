import { subjectCards, tagTaken, normTag, deleteSays, nextClass } from '../domain/subjects';
import type { Course, Meeting } from '../domain/types';

const NOW = new Date(2026, 10, 19, 10).getTime(); // Thursday
const c = (id: string, name: string, over: Partial<Course> = {}): Course => ({ id, name, rooms: ['L-4'], teacher: '', goal: 80, sort: 0, demo: false, ...over });
const m = (id: string, courseId: string, weekday: number, start: string): Meeting => ({ id, courseId, weekday, start, end: '23:00', demo: false });
const base = { now: NOW, termStart: new Date(2026, 10, 2).getTime(), hour12: false, variants: [], adjusts: {}, attendance: {}, dayMarks: {}, tasks: [], notices: [] };

describe('subjects', () => {
  it('a card per subject: grade vs goal, next class; archived last', () => {
    const cards = subjectCards({ ...base, courses: [c('old', 'Old', { archived: true, sort: 0 }), c('db', 'Database Systems', { sort: 1 })], meetings: [m('m1', 'db', 4, '08:30')],
      marks: [{ id: 'k', courseId: 'db', name: 'Mid', score: 72, weight: 100, on: true, sort: 0, demo: false }] });
    expect(cards.map((x) => x.id)).toEqual(['db', 'old']);
    expect(cards[0]).toMatchObject({ grade: 72, goal: 80, tag: '#Database-Systems', next: 'Tomorrow 08:30 · L-4' });
  });
  it('the next class today when it has not started', () => {
    expect(nextClass(c('db', 'DB'), { now: NOW, meetings: [m('m1', 'db', 3, '14:00')], attendance: {}, dayMarks: {}, hour12: false })).toBe('Today 14:00 · L-4');
  });
  it('a tag is unique among subjects', () => {
    const cs = [c('a', 'Database Systems'), c('b', 'Economics', { tag: '#eco' })];
    expect(normTag('Data Base')).toBe('#Data-Base');
    expect(tagTaken('#database-systems', 'b', cs)).toBe(true);
    expect(tagTaken('#Database-Systems', 'a', cs)).toBe(false);
    expect(tagTaken('ECO', 'a', cs)).toBe(true);
  });
  it('delete says what goes with it', () => {
    expect(deleteSays(c('db', 'DB'), { meetings: [m('1', 'db', 0, '08:00'), m('2', 'db', 1, '08:00')], marks: [], tasks: [], notices: [] })).toBe('Deletes DB with 2 weekly classes.');
  });
});
