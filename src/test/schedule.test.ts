/** The subject sheet's schedule rows → what gets written (collage pass: "add the schedule right there"). */
import { draftsOf, nextDraft, planSchedule, type SlotDraft } from '../domain/schedule';
import type { Meeting, SubjectVariant } from '../domain/types';

let n = 0;
const uid = (k: string) => `v-${k.toLowerCase()}-${++n}`;
const row = (o: Partial<SlotDraft>): SlotDraft => ({ key: `m${++n}`, id: null, weekday: 0, start: 540, end: 590, room: 'B-12', kind: '', ...o });
beforeEach(() => { n = 0; });

describe('planSchedule', () => {
  it('writes each row as a weekly class of the subject', () => {
    const p = planSchedule('c1', [row({ weekday: 0, key: 'm1' }), row({ weekday: 2, start: 600, end: 650, room: '', key: 'm2' })], [], [], uid);
    expect(p.meetings).toEqual([
      { id: 'm1', courseId: 'c1', weekday: 0, start: '09:00', end: '09:50', room: 'B-12', variantId: null, demo: false },
      { id: 'm2', courseId: 'c1', weekday: 2, start: '10:00', end: '10:50', room: null, variantId: null, demo: false },
    ]);
    expect(p.removed).toEqual([]);
    expect(p.problems).toEqual([]);
  });
  it('a Lab row becomes a variant once, however many Lab rows there are, and reuses one that exists', () => {
    const p = planSchedule('c1', [row({ kind: 'Lab', weekday: 1 }), row({ kind: 'lab', weekday: 3 })], [], [], uid);
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]).toMatchObject({ subjectId: 'c1', name: 'Lab' });
    expect(new Set(p.meetings.map((m) => m.variantId))).toEqual(new Set([p.variants[0]!.id]));
    const have: SubjectVariant[] = [{ id: 'vX', subjectId: 'c1', name: 'Tutorial', room: '', teacher: '', note: '', ord: 0 }];
    const q = planSchedule('c1', [row({ kind: 'Tutorial' })], [], have, uid);
    expect(q.variants).toEqual([]);
    expect(q.meetings[0]!.variantId).toBe('vX');
  });
  it('keeps ids of rows that existed and removes classes whose rows were deleted', () => {
    const existing: Meeting[] = [
      { id: 'a', courseId: 'c1', weekday: 0, start: '09:00', end: '09:50', demo: false },
      { id: 'b', courseId: 'c1', weekday: 1, start: '09:00', end: '09:50', demo: false },
      { id: 'z', courseId: 'other', weekday: 1, start: '09:00', end: '09:50', demo: false },
    ];
    const p = planSchedule('c1', draftsOf('c1', existing, []).filter((d) => d.id !== 'b'), existing, [], uid);
    expect(p.meetings.map((m) => m.id)).toEqual(['a']);
    expect(p.removed).toEqual(['b']); // never another subject's class
  });
  it('reports, and leaves out, a backwards row and a duplicate — never throws', () => {
    const p = planSchedule('c1', [row({ start: 600, end: 540 }), row({}), row({})], [], [], uid);
    expect(p.meetings).toHaveLength(1);
    expect(p.problems).toHaveLength(2);
  });
});

describe('nextDraft', () => {
  it('picks the next free weekday and copies the last time and kind', () => {
    const r = nextDraft([row({ weekday: 0, start: 600, end: 680, kind: 'Lab' }), row({ weekday: 1 })], 'A-7', 'k2');
    expect(r).toMatchObject({ weekday: 2, start: 540, end: 590, room: 'A-7', kind: '' });
    expect(nextDraft([], '', 'k')).toMatchObject({ weekday: 0, start: 540, end: 590 });
  });
});
