/** v0.71: a subject's lab (or tutorial) with its own teacher, room, group, grade share and attendance goal. */
import { planSchedule, type SlotDraft } from '../domain/schedule';
import { baseIdOf, blankPart, hasParts, kindsIn, partDraftsOf, planParts, roomsForParts, sharesNote } from '../domain/parts';
import { courseGrade } from '../domain/grades';
import { roomOf } from '../domain/rooms';
import type { Mark, SubjectVariant } from '../domain/types';

const row = (o: Partial<SlotDraft>): SlotDraft => ({ key: `m${Math.random()}`, id: null, weekday: 0, start: 540, end: 590, room: 'LR-601', kind: '', ...o });
const subject = { teacher: 'Dr. Abebe', rooms: ['LR-601', 'LR-303'] };

describe('parts', () => {
  const rows = [row({ weekday: 0 }), row({ weekday: 2, kind: 'Lab', key: 'lab1' })];
  const plan = planSchedule('db', rows, [], [], (k) => `db-${k.toLowerCase()}`);

  it('lists the kinds the rows use, the lecture first', () => {
    expect(kindsIn([row({ kind: 'Lab' }), row({}), row({ kind: 'lab' })])).toEqual(['', 'Lab']);
    expect(hasParts(rows)).toBe(true);
    expect(hasParts([row({})])).toBe(false);
  });

  it('a new lab gets a base Lecture part beside it, and the lab its own teacher, room, group, share and goal', () => {
    const drafts = { '': { ...blankPart(), share: 70 }, lab: { teacher: 'Ms. Hana', room: 'Lab 2', group: 'G3', share: 30, attGoal: 90 } };
    const out = planParts('db', kindsIn(rows), drafts, [], plan.variants, subject);
    const base = out.find((v) => v.isBase)!, lab = out.find((v) => v.name === 'Lab')!;
    expect(base).toMatchObject({ id: baseIdOf('db'), name: 'Lecture', teacher: 'Dr. Abebe', room: 'LR-601', weight: 70, isBase: true });
    expect(lab).toMatchObject({ id: 'db-lab', teacher: 'Ms. Hana', room: 'Lab 2', note: 'G3', weight: 30, attGoal: 90, kind: 'lab' });
    expect(out).toHaveLength(2);
  });

  it('the shares drive the grade: lecture 80 %, lab 50 % at 70/30 gives 71 %', () => {
    const drafts = { '': { ...blankPart(), share: 70 }, lab: { ...blankPart(), share: 30 } };
    const parts = planParts('db', ['', 'Lab'], drafts, [], plan.variants, subject);
    const mk = (id: string, score: number, variantId: string | null): Mark => ({ id, courseId: 'db', name: id, score, weight: 10, on: true, sort: 0, demo: false, variantId });
    expect(courseGrade([mk('mid', 80, null), mk('lab', 50, 'db-lab')], parts)).toBeCloseTo(71);
  });

  it('a stored lab opens with what it had, and an existing base is kept, not doubled', () => {
    const stored: SubjectVariant[] = [
      { id: baseIdOf('db'), subjectId: 'db', name: 'Lecture', room: 'LR-601', teacher: 'x', note: '', ord: -1, isBase: true, weight: 70 },
      { id: 'db-lab', subjectId: 'db', name: 'Lab', room: 'Lab 2', teacher: 'Ms. Hana', note: 'G3', ord: 0, weight: 30, attGoal: 90 },
    ];
    const d = partDraftsOf('db', stored);
    expect(d.lab).toEqual({ teacher: 'Ms. Hana', room: 'Lab 2', group: 'G3', share: 30, attGoal: 90 });
    expect(d['']!.share).toBe(70);
    const out = planParts('db', ['', 'Lab'], d, stored, [], subject);
    expect(out.filter((v) => v.isBase)).toHaveLength(1);
  });

  it('empty or zero shares are stored as none (pooled marks)', () => {
    const out = planParts('db', ['', 'Lab'], { lab: { ...blankPart(), share: 0 } }, [], plan.variants, subject);
    expect(out.every((v) => v.weight === null)).toBe(true);
  });

  it('a lab with its own room puts its classes there', () => {
    const drafts = { lab: { ...blankPart(), room: 'Lab 2' } };
    const r = roomsForParts(rows, drafts);
    expect(r[0]!.room).toBe('LR-601');
    expect(r[1]!.room).toBe('');
    const lab = planParts('db', ['', 'Lab'], drafts, [], plan.variants, subject).find((v) => v.name === 'Lab')!;
    expect(roomOf({ room: null, variantId: lab.id }, { rooms: subject.rooms }, [lab])).toBe('Lab 2');
  });

  it('a subject with only lectures writes no parts', () => {
    expect(planParts('db', [''], {}, [], [], subject)).toEqual([]);
  });

  it('says how the shares add up', () => {
    expect(sharesNote(['', 'Lab'], {})).toMatch(/every mark counts the same/);
    expect(sharesNote(['', 'Lab'], { '': { ...blankPart(), share: 70 }, lab: { ...blankPart(), share: 30 } })).toBe('Lecture 70 % · Lab 30 %');
    expect(sharesNote(['', 'Lab'], { lab: { ...blankPart(), share: 30 } })).toMatch(/adds up to 30 %/);
  });
});
