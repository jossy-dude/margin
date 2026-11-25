import { splitLabChange } from '../domain/parts';
import { occKey } from '../domain/attendance';
import type { AttRecord } from '../domain/types';
import { REAL_COURSES, REAL_MEETINGS, REAL_VARIANTS } from './fixtures/real-timetable';

/* v0.7.7.2 (SPEC §3, D11): "Split the lab classes" moves Computer Programming's LAB301 classes into a Lab part and
   re-keys their attendance, so every mark already taken is still there; the undo restores every key byte for byte. */
const rec = (key: string, status: AttRecord['status'] = 'a'): AttRecord => ({ key, status, at: 1, reason: 'bus', why: 'sick' });
// Thursdays (weekday 3) are LAB301; Tuesday and Friday are lectures. 2026-11-19 and 2026-11-26 are Thursdays.
const att: Record<string, AttRecord> = Object.fromEntries([
  rec('2026-11-19|08:00|cp'), rec('2026-11-26|08:00|cp', 'p'),       // lab classes
  rec('2026-11-24|11:30|cp'), rec('2026-11-20|09:45|cp', 'p'),       // lectures
  rec('2026-11-24|08:00|db'),                                         // another subject
].map((r) => [r.key, r]));
const state = { courses: REAL_COURSES, meetings: REAL_MEETINGS, variants: REAL_VARIANTS, attendance: att };

describe('splitLabChange', () => {
  const c = splitLabChange(state, 'cp', 'cp-lab')!;
  it('makes a Lecture base and a Lab part (kind lab), and moves only the lab classes', () => {
    expect(c.after.variants.map((v) => [v.name, v.kind, !!v.isBase, v.room])).toEqual([['Lecture', 'lecture', true, 'LR302'], ['Lab', 'lab', false, 'LAB301']]);
    expect(c.before.meetings.map((m) => m.id)).toEqual(['cp-thu']);
    expect(c.after.meetings).toEqual([{ ...REAL_MEETINGS.find((m) => m.id === 'cp-thu'), variantId: 'cp-lab' }]);
  });
  it('re-keys the lab classes\' attendance and leaves the lectures\' and other subjects\' alone', () => {
    expect(c.before.attendance.map((r) => r.key).sort()).toEqual(['2026-11-19|08:00|cp', '2026-11-26|08:00|cp']);
    expect(c.after.attendance.map((r) => r.key).sort()).toEqual(['2026-11-19|08:00|cp~cp-lab', '2026-11-26|08:00|cp~cp-lab']);
    expect(c.after.attendance.map((r) => r.key)).toEqual(c.before.attendance.map((r) => occKey(r.key.slice(0, 10), { start: '08:00', courseId: 'cp', variantId: 'cp-lab' })));
    // status, reason and why travel with the key
    const old = c.before.attendance[0]!, moved = c.after.attendance[0]!;
    expect({ ...moved, key: old.key }).toEqual(old);
  });
  it('the undo (the change read backwards) restores every record byte for byte', () => {
    const apply = (from: AttRecord[], to: AttRecord[], m: Record<string, AttRecord>) => { const n = { ...m }; for (const r of from) delete n[r.key]; for (const r of to) n[r.key] = r; return n; };
    const split = apply(c.before.attendance, c.after.attendance, att), undone = apply(c.after.attendance, c.before.attendance, split);
    expect(JSON.stringify(undone, Object.keys(undone).sort())).toBe(JSON.stringify(att, Object.keys(att).sort()));
    expect(Object.keys(split)).toHaveLength(Object.keys(att).length);
  });
  it('offers nothing twice: a subject that has parts is not split again', () => {
    const after = { ...state, variants: [...REAL_VARIANTS, ...c.after.variants], meetings: REAL_MEETINGS.map((m) => c.after.meetings.find((x) => x.id === m.id) ?? m) };
    expect(splitLabChange(after, 'cp', 'cp-lab2')).toBeNull();
    expect(splitLabChange(state, 'db', 'x')).toBeNull();
  });
});
