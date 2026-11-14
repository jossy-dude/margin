/**
 * v0.7 R1 — Today v2's view-model, one test per state the owner named (PLAN Phase 5, R1 acceptance): in class,
 * between, before, after, none, two-at-once, picked day. Plus the two found issues it closes: F6 ("Done for today"
 * when the day had classes) and C1 (the current class appears once). F7 ("Period 1 of 3" clipping) is a layout
 * fact, pinned by the short `position` words here and by the card's wrapping row (see SPEC.md).
 */
import { todayView, classesOn, attendanceSummary, completesWeek, dueOf, dueWhen, nextDayLine, notesOf, type TodayInput } from '../screens/today/model';
import type { Course, Meeting, SubjectVariant, Task } from '../domain/types';

const THU = new Date(2026, 10, 12); // Thursday 12 Nov 2026
const at = (h: number, m = 0, d = THU) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).getTime();
const courses: Course[] = [
  { id: 'B', name: 'Database Systems', rooms: ['L-4'], teacher: 'Nkemi', goal: null, sort: 0, demo: false },
  { id: 'C', name: 'Computer Programming', rooms: ['C-4'], teacher: 'Reyes', goal: null, sort: 1, demo: false },
  { id: 'E', name: 'Intro to Economics', rooms: ['B-12'], teacher: 'Hale', goal: null, sort: 2, demo: false },
];
const variants: SubjectVariant[] = [{ id: 'v-lec', subjectId: 'B', name: 'Lecture', room: 'L-4', teacher: 'Nkemi', note: '', ord: 0 }];
const mt = (id: string, courseId: string, weekday: number, start: string, end: string, variantId: string | null = null): Meeting => ({ id, courseId, weekday, start, end, demo: false, variantId });
/* Thursday = weekday 3: three classes, as in DESIGN.md's Today sketch. Friday has one so "tomorrow" has an answer. */
const meetings: Meeting[] = [
  mt('m1', 'B', 3, '09:00', '09:50', 'v-lec'), mt('m2', 'C', 3, '10:55', '11:45'), mt('m3', 'E', 3, '13:15', '14:05'),
  mt('m4', 'C', 4, '08:30', '09:20'),
];
const task = (id: string, title: string, dueAt: number | null, status: 0 | 1 | 2 = 0, courseId: string | null = 'B'): Task => ({
  id, title, courseId, kind: 'assignment', dueAt, startAt: null, estimateMin: null, priority: 0, notes: '', status, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false,
});
const base = (now: number, over: Partial<TodayInput> = {}): TodayInput => ({
  now, picked: null, meetings, courses, variants, attendance: {}, dayMarks: {}, tasks: [], notices: [], hour12: false, name: 'Jossy', ...over,
});

describe('Today v2: the Now card in every state', () => {
  it('in class: the class, its part and teacher, room, a countdown to its end, the mark bubble, what comes next', () => {
    const vm = todayView(base(at(9, 20, THU) + 16_000));
    expect(vm.card).toMatchObject({ state: 'inClass', title: 'Database Systems', meta: 'Lecture · Nkemi', room: 'L-4', position: 'class 1 of 3' });
    expect(vm.card.count).toEqual({ kind: 'left', target: at(9, 50) });
    expect(vm.card.mark).toMatchObject({ key: '2026-11-12|09:00|B~v-lec', bubble: 'empty' });
    expect(vm.card.next).toBe('Then 10:55 · Computer Programming · C-4');
    expect(vm.card.track?.stops.map((s) => s.bubble)).toEqual(['now', 'empty', 'empty']);
    expect(vm.dateLine).toBe('Thu 12 Nov');
    expect(vm.greeting).toBe('Good morning, Jossy');
  });

  it('C1: the current class appears once — not again in the rows under the card', () => {
    const vm = todayView(base(at(9, 20)));
    const everywhere = [...vm.later, ...vm.earlier].map((x) => x.name);
    expect(everywhere).not.toContain('Database Systems');
    expect(vm.later.map((x) => x.name)).toEqual(['Computer Programming', 'Intro to Economics']);
    expect(vm.earlier).toEqual([]);
  });

  it('between classes: counts down to the next start, the ended class moves to "earlier", present by default', () => {
    const vm = todayView(base(at(10, 30)));
    expect(vm.card).toMatchObject({ state: 'between', title: 'Computer Programming', position: 'class 2 of 3', mark: null });
    expect(vm.card.count).toEqual({ kind: 'until', target: at(10, 55) });
    expect(vm.card.next).toBe('Then 13:15 · Intro to Economics · B-12');
    expect(vm.earlier.map((x) => x.name)).toEqual(['Database Systems']);
    expect(vm.earlier[0]?.bubble).toBe('filled'); // inferred present once it ended (v0.6 rule)
    expect(vm.earlier[0]?.spoken).toContain('present, not marked yet');
    expect(vm.later.map((x) => x.name)).toEqual(['Intro to Economics']);
  });

  it('before the first class: "first of 3" and a countdown to it; nothing is "earlier"', () => {
    const vm = todayView(base(at(7, 40)));
    expect(vm.card).toMatchObject({ state: 'before', title: 'Database Systems', position: 'first of 3' });
    expect(vm.card.count).toEqual({ kind: 'until', target: at(9) });
    expect(vm.earlier).toEqual([]);
    expect(vm.later.map((x) => x.name)).toEqual(['Computer Programming', 'Intro to Economics']);
  });

  it('F6: after the last class it says "Done for today" with the day\'s attendance and tomorrow\'s first class', () => {
    const vm = todayView(base(at(18, 5), { attendance: { '2026-11-12|10:55|C': { key: '2026-11-12|10:55|C', status: 'a', at: 0, reason: '', why: 'sick' } } }));
    expect(vm.card).toMatchObject({ state: 'after', title: 'Done for today', meta: '3 classes · 2 present, 1 absent', count: null, mark: null });
    expect(vm.card.title).not.toMatch(/free|rest/i);
    expect(vm.card.next).toBe('Tomorrow 08:30 · Computer Programming · C-4');
    expect(vm.card.track?.stops.map((s) => s.bubble)).toEqual(['filled', 'absent', 'filled']);
    expect(vm.earlier).toHaveLength(3); // still markable from the rows
    expect(vm.face).toBe('content');
  });

  it('no classes: one line, and the next day that has one', () => {
    const vm = todayView(base(at(10, 0, new Date(2026, 10, 14)))); // Saturday
    expect(vm.card).toMatchObject({ state: 'none', title: 'No classes today', meta: '', track: null, count: null });
    expect(vm.card.next).toBe('Thu 09:00 · Database Systems · L-4'); // Sun–Wed are empty in this timetable
    expect(vm.later).toEqual([]);
  });

  it('a day whose classes were all cancelled is "No classes today", and says how many were cancelled', () => {
    const vm = todayView(base(at(9, 20), { dayMarks: { '2026-11-12': { date: '2026-11-12', status: 'c', at: 0, reason: '', why: 'holiday' } } }));
    expect(vm.card).toMatchObject({ state: 'none', title: 'No classes today', meta: '3 classes cancelled' });
    expect([...vm.earlier, ...vm.later].every((x) => x.bubble === 'struck')).toBe(true);
  });

  it('two classes at once: a tab each, the card follows the chosen one, and neither repeats below', () => {
    const two = [...meetings, mt('m5', 'E', 3, '09:00', '09:50')];
    const a = todayView(base(at(9, 10), { meetings: two }));
    expect(a.card.tabs).toEqual([{ label: 'Database Systems', on: true }, { label: 'Intro to Economics', on: false }]);
    const b = todayView(base(at(9, 10), { meetings: two, pick: 1 }));
    expect(b.card).toMatchObject({ title: 'Intro to Economics', room: 'B-12', mark: { key: '2026-11-12|09:00|E' } });
    expect(b.card.tabs?.[1]?.on).toBe(true);
    expect([...b.later, ...b.earlier].map((x) => x.key)).not.toContain('2026-11-12|09:00|B~v-lec');
    expect([...b.later, ...b.earlier].map((x) => x.key)).not.toContain('2026-11-12|09:00|E');
    expect(b.card.next).toBe('Then 10:55 · Computer Programming · C-4'); // "after" is never the other class of the slot
    expect(todayView(base(at(9, 10), { meetings: two, pick: 9 })).card.title).toBe('Intro to Economics'); // clamped
  });

  it('a picked day: the card becomes that day\'s timetable, nothing is listed twice, the strip marks it', () => {
    const vm = todayView(base(at(9, 20), { picked: at(12, 0, new Date(2026, 10, 13)) }));
    expect(vm.isToday).toBe(false);
    expect(vm.card).toMatchObject({ state: 'picked', title: 'Fri 13 Nov', meta: 'Tomorrow · 1 class · 08:30–09:20', count: null, mark: null });
    expect(vm.card.rows.map((x) => x.name)).toEqual(['Computer Programming']);
    expect(vm.later).toEqual([]);
    expect(vm.earlier).toEqual([]);
    expect(vm.week.find((p) => p.selected)?.dw).toBe('Fri');
    expect(vm.week.find((p) => p.isToday)?.dw).toBe('Thu');
    expect(vm.selDate).toBe('2026-11-13');
  });

  it('picking today again is today, not a picked day', () => {
    expect(todayView(base(at(9, 20), { picked: at(0, 0) })).card.state).toBe('inClass');
  });

  it('F7: every position line is short enough to sit beside the countdown without clipping', () => {
    const all = [at(7), at(9, 20), at(10, 30), at(18)].map((t) => todayView(base(t)).card.position);
    for (const p of all) expect(p.length).toBeLessThanOrEqual(14);
  });
});

describe('Today v2: the parts under the card', () => {
  it('the week strip has seven days, Monday first, with a bubble per class', () => {
    const vm = todayView(base(at(10, 30)));
    expect(vm.week.map((p) => p.dw)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(vm.week[3]?.bubbles).toEqual(['filled', 'empty', 'empty']);
    expect(vm.week[3]?.label).toBe('Thu 12 November, 3 classes, today');
  });

  it('due: overdue (five shown, the rest counted), today, the next three; done tasks never show', () => {
    const now = at(10, 30);
    const tasks = [
      ...Array.from({ length: 7 }, (_, k) => task(`o${k}`, `Late ${k}`, now - (k + 1) * 86_400_000)),
      task('t1', 'Flashcards', at(20)), task('d1', 'Done one', at(21), 2),
      task('n1', 'Problem set', at(8, 0, new Date(2026, 10, 13))), task('n2', 'Essay', at(12, 0, new Date(2026, 10, 16))), task('n3', 'Three', at(9, 0, new Date(2026, 10, 17))), task('n4', 'Four', at(9, 0, new Date(2026, 10, 18))),
      task('x', 'No date', null),
    ];
    const d = dueOf({ tasks, courses, now, hour12: false });
    expect(d.overdue).toHaveLength(5);
    expect(d.moreOverdue).toBe(2);
    expect(d.overdue[0]).toMatchObject({ title: 'Late 6', when: '7 d late', late: true, course: 'Database Systems' });
    expect(d.today.map((x) => x.when)).toEqual(['today 20:00']);
    expect(d.next.map((x) => x.when)).toEqual(['Tomorrow 08:00', 'Mon 16 Nov 12:00', 'Tue 17 Nov 09:00']);
    expect(d.summary).toBe('1 today, 7 overdue');
    expect(dueOf({ tasks: [], courses, now, hour12: false })).toMatchObject({ empty: true, summary: 'Nothing due' });
  });

  it('due times follow the 12-hour choice', () => {
    expect(dueWhen(at(20), at(10), true)).toBe('today 8:00 PM');
    expect(dueWhen(at(10) - 45 * 60_000, at(10))).toBe('45 min late');
  });

  it('notes: urgent first, then the soonest date still ahead; a past date is not shown', () => {
    const now = at(10);
    const n = notesOf({ now, courses, hour12: false, notices: [
      { id: 'a', courseId: 'B', text: 'old', dueAt: at(9, 0, new Date(2026, 10, 1)), priority: 0, demo: false },
      { id: 'b', courseId: null, text: 'urgent', dueAt: at(9, 0, new Date(2026, 10, 1)), priority: 3, demo: false },
      { id: 'c', courseId: 'E', text: 'soon', dueAt: at(9, 0, new Date(2026, 10, 13)), priority: 0, demo: false },
    ] });
    expect(n.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(n[0]?.meta).toBe('Urgent');
    expect(n[1]?.meta).toBe('Intro to Economics · Tomorrow 09:00');
    expect(n[2]?.meta).toBe('Database Systems');
  });

  it('a whole-day mark reads as words; the 12-hour clock reaches the rows', () => {
    const vm = todayView(base(at(10, 30), { hour12: true, dayMarks: { '2026-11-12': { date: '2026-11-12', status: 'a', at: 0, reason: '', why: 'sick' } } }));
    expect(vm.dayMark).toBe('Absent · Sick');
    expect(classesOn(at(0), base(at(10, 30), { hour12: true }))[0]?.range).toBe('9:00 AM–9:50 AM');
  });

  it('summaries, the next day line and the face read the way a person would say them', () => {
    const items = classesOn(at(0), base(at(18)));
    expect(attendanceSummary(items)).toBe('3 classes · all present');
    expect(attendanceSummary([])).toBe('No classes');
    expect(nextDayLine(base(at(9)), at(9, 0, new Date(2026, 10, 13)))).toBe('Thu 09:00 · Database Systems · L-4');
    expect(todayView(base(at(23, 30))).face).toBe('sleepy');
    expect(todayView(base(at(10))).face).toBe('smirk');
  });
});

describe('Today v2: the face and its moments (D-21, `pageFace`)', () => {
  const FRI = new Date(2026, 10, 13), SAT = new Date(2026, 10, 14), WED = new Date(2026, 10, 11);
  it('the top bar follows the day', () => {
    expect(todayView(base(at(9, 20))).face).toBe('smirk'); // in class
    expect(todayView(base(at(10, 51))).face).toBe('surprised'); // 4 min before Computer Programming
    expect(todayView(base(at(10, 30))).face).toBe('smirk'); // 25 min before: not yet
    expect(todayView(base(at(8, 56))).face).toBe('surprised'); // before the first class too
    expect(todayView(base(at(18))).face).toBe('content'); // the day's classes are over
    expect(todayView(base(at(1, 0, FRI))).face).toBe('sleepy'); // the middle of the night
    expect(todayView(base(at(11, 0, WED))).face).toBe('sleepy'); // a weekday with no classes
    expect(todayView(base(at(11, 0, SAT))).face).toBe('cat'); // a free weekend
  });
  it('the face stays about today while another day is picked', () => {
    expect(todayView(base(at(9, 20), { picked: at(12, 0, SAT) })).face).toBe('smirk');
  });
  it('marking a class present completes the week only at its last class, with every other one present', () => {
    const fri = base(at(8, 40, FRI)), key = todayView(fri).card.mark!.key;
    expect(key).toBe('2026-11-13|08:30|C');
    expect(completesWeek(fri, key)).toBe(true); // Thursday's three ended unmarked: present, the app's rule
    const absent = { '2026-11-12|10:55|C': { key: '2026-11-12|10:55|C', status: 'a' as const, at: 0, reason: '' } };
    expect(completesWeek(base(at(8, 40, FRI), { attendance: absent }), key)).toBe(false);
    const cancelled = { '2026-11-12|10:55|C': { ...absent['2026-11-12|10:55|C'], status: 'c' as const } };
    expect(completesWeek(base(at(8, 40, FRI), { attendance: cancelled }), key)).toBe(true); // a cancelled class doesn't count
    const thu = base(at(9, 20));
    expect(completesWeek(thu, todayView(thu).card.mark!.key)).toBe(false); // Friday is still to come
  });
});
