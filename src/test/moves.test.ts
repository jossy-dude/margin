/**
 * v0.7 R2 — one-off class moves ("This week only"). A moved class leaves its day and appears on the new one at the
 * new time, with the new slot's attendance key; the weekly timetable and every other day are untouched; a class is
 * moved again rather than chained, and moving it home removes the move.
 */
import { occKey, occurrencesBetween, occurrencesOn } from '../domain/attendance';
import { dayMeetings, moveAt, moveClashes, originOf, withMove, type ClassMove } from '../domain/moves';
import type { Meeting } from '../domain/types';
import { ymd } from '../domain/time';

const mt = (id: string, courseId: string, weekday: number, start: string, end: string, variantId: string | null = null): Meeting => ({ id, courseId, weekday, start, end, demo: false, variantId });
/* Monday 9 Nov 2026 is weekday 0. The lab is Tuesdays 14:00–16:00. */
const LAB = mt('lab', 'DB', 1, '14:00', '16:00', 'v-lab'), LEC = mt('lec', 'DB', 0, '09:00', '09:50'), ECO = mt('eco', 'EC', 2, '14:00', '14:50');
const MEETINGS = [LAB, LEC, ECO];
const TUE = '2026-11-10', WED = '2026-11-11';
const day = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y!, m! - 1, d!); };
const MOVE: ClassMove = { id: 'mv1', meetingId: 'lab', date: TUE, to: WED, start: '10:00', end: '12:00' };

describe('a one-off move', () => {
  it('takes the class off its own day and puts it on the new one, at the new time', () => {
    expect(occurrencesOn(day(TUE), MEETINGS, [MOVE])).toEqual([]);
    const wed = occurrencesOn(day(WED), MEETINGS, [MOVE]).map((o) => [o.meeting.id, o.meeting.start, o.meeting.end]);
    expect(wed).toEqual([['lab', '10:00', '12:00'], ['eco', '14:00', '14:50']]);
  });
  it('the moved class is marked under the new slot; the weekly timetable is untouched', () => {
    const o = occurrencesOn(day(WED), MEETINGS, [MOVE])[0]!;
    expect(occKey(WED, o.meeting)).toBe('2026-11-11|10:00|DB~v-lab');
    expect(LAB).toEqual(mt('lab', 'DB', 1, '14:00', '16:00', 'v-lab'));
    // the next Tuesday has its lab as usual
    expect(occurrencesOn(day('2026-11-17'), MEETINGS, [MOVE]).map((x) => x.meeting.start)).toEqual(['14:00']);
  });
  it('without moves every day is exactly the weekly timetable, as before', () => {
    expect(occurrencesOn(day(TUE), MEETINGS)).toEqual(occurrencesOn(day(TUE), MEETINGS, []));
    expect(occurrencesOn(day(TUE), MEETINGS).map((x) => x.meeting.id)).toEqual(['lab']);
    expect(dayMeetings(TUE, 1, MEETINGS, [])).toEqual([LAB]);
  });
  it('a span of days sees the move once (reminders, analytics, the export walk this)', () => {
    const week = occurrencesBetween(day('2026-11-09').getTime(), day('2026-11-15').getTime(), MEETINGS, [MOVE]);
    expect(week.filter((o) => o.meeting.id === 'lab').map((o) => occKey(ymd(o.date), o.meeting))).toEqual(['2026-11-11|10:00|DB~v-lab']);
    expect(week).toHaveLength(3);
  });
  it('a move whose class was deleted is ignored', () => {
    expect(occurrencesOn(day(WED), [ECO], [MOVE]).map((x) => x.meeting.id)).toEqual(['eco']);
  });
});

describe('moving again', () => {
  it('a moved class moves again from its origin, never as a chain; moving it home removes the move', () => {
    let moves = withMove([], LAB, TUE, '14:00', WED, '10:00', '12:00', 'mv1');
    expect(moves).toEqual([MOVE]);
    moves = withMove(moves, LAB, WED, '10:00', '2026-11-12', '08:00', '10:00', 'mv2');
    expect(moves).toEqual([{ id: 'mv1', meetingId: 'lab', date: TUE, to: '2026-11-12', start: '08:00', end: '10:00' }]);
    expect(withMove(moves, LAB, '2026-11-12', '08:00', TUE, '14:00', '16:00', 'mv3')).toEqual([]);
  });
  it('knows where a shown class comes from', () => {
    expect(moveAt([MOVE], 'lab', WED, '10:00')).toBe(MOVE);
    expect(moveAt([MOVE], 'lab', TUE, '14:00')).toBeNull();
    expect(originOf([MOVE], LAB, WED, '10:00')).toEqual({ date: TUE, start: '14:00' });
    expect(originOf([MOVE], ECO, WED, '14:00')).toEqual({ date: WED, start: '14:00' });
  });
  it('refuses a slot where the same class already starts (one key, two classes)', () => {
    const twin = mt('lab2', 'DB', 2, '14:00', '15:00', 'v-lab');
    expect(moveClashes(WED, 2, [...MEETINGS, twin], [], LAB, '14:00', { day: TUE, start: '14:00' })).toBe(true);
    expect(moveClashes(WED, 2, MEETINGS, [], LAB, '14:00', { day: TUE, start: '14:00' })).toBe(false); // Economics is another subject
    expect(moveClashes(WED, 2, MEETINGS, [MOVE], LAB, '10:00', { day: WED, start: '10:00' })).toBe(false); // itself
  });
});
