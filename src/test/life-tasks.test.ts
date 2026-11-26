/** v0.7.8.3 (SPEC §9.1, 9.2, 9.12; D5, D9): every dated line reaches the phone; School or Life; no ^id spam. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { findLine, isLifeLine, keysOf, lifeKey, parseLine, withId } from '../domain/vaultTasks';
import { inScope, isSchool } from '../domain/taskScope';
import { buildAgenda } from '../domain/agenda';

const T = (raw: string, path = 'Daily/x.md') => parseLine(raw, path)!;

describe('which lines are Life (D5)', () => {
  it.each([
    ['- [ ] Plan the week 📅 2026-11-25 ⏰ 15:15-16:45', true],
    ['- [ ] Sketch ⏳ 2026-11-29', true],
    ['- [ ] Ring me ⏰ 07:30', true],
    ['- [ ] Ring 🔔 -10m', true],
    ['- [ ] Buy milk', false],
    ['- [x] Done 📅 2026-11-25 ✅ 2026-11-25', false],
    ['- [~] Failed 📅 2026-11-25', false],
    ['- [ ] Revise #school 📅 2026-11-25', false],
  ])('%s → %s', (raw, want) => { expect(isLifeLine(T(raw), ['#school'])).toBe(want); });
  it('Archive/ stays out', () => { expect(isLifeLine(T('- [ ] Old 📅 2026-11-25', 'Archive/a.md'), ['#school'])).toBe(false); });
});

describe('the Life key: read-only identity (§9.2)', () => {
  const a = T('- [ ] Plan the week 📅 2026-11-25 ⏰ 15:15');
  it('stays when the line is ticked, re-dated or re-timed', () => {
    expect(lifeKey('Daily/x.md', T('- [x] Plan the week 📅 2026-11-27 ⏰ 09:00 ✅ 2026-11-26'))).toBe(lifeKey('Daily/x.md', a));
  });
  it('differs by note and by title', () => {
    expect(lifeKey('Daily/y.md', a)).not.toBe(lifeKey('Daily/x.md', a));
    expect(lifeKey('Daily/x.md', T('- [ ] Plan the month 📅 2026-11-25'))).not.toBe(lifeKey('Daily/x.md', a));
  });
  it('is a valid block id', () => { expect(lifeKey('Daily/x.md', a)).toMatch(/^lf[0-9a-z]+$/); });
  it('identical lines in one note are told apart', () => {
    const k = [...keysOf('- [ ] Water 📅 2026-11-25\n- [ ] Water 📅 2026-11-26\n', 'Daily/x.md').keys()];
    expect(k).toHaveLength(2);
    expect(k[1]).toBe(`${k[0]}-1`);
  });
  it('a line with a ^id is known by it', () => { expect([...keysOf('- [ ] A 📅 2026-11-25 ^abc\n', 'x.md').keys()]).toEqual(['abc']); });
  it('findLine finds it by key, then by ^id once written', () => {
    const text = '# x\n- [ ] Plan the week 📅 2026-11-25 ⏰ 15:15\n', key = lifeKey('Daily/x.md', a);
    expect(findLine(text, 'Daily/x.md', key)).toBe(1);
    const written = `# x\n${withId('- [x] Plan the week 📅 2026-11-25 ⏰ 15:15', key)}\n`;
    expect(written).toBe(`# x\n- [x] Plan the week 📅 2026-11-25 ⏰ 15:15 ^${key}\n`);
    expect(findLine(written, 'Daily/x.md', key)).toBe(1);
  });
  it('withId leaves a line that has an id alone', () => { expect(withId('- [ ] A ^a1', 'lfz')).toBe('- [ ] A ^a1'); });
});

describe('School or Life (D9)', () => {
  it('a subject or a tracked tag is School', () => {
    expect(isSchool({ courseId: 'db', tags: [] })).toBe(true);
    expect(isSchool({ courseId: null, tags: ['school'] })).toBe(true);
    expect(isSchool({ courseId: null, tags: ['lab'] }, ['#school', '#uni'])).toBe(false);
    expect(isSchool({ courseId: null, tags: ['uni'] }, ['#school', '#uni'])).toBe(true);
    expect(isSchool({ courseId: null, tags: null })).toBe(false);
  });
  it('the filter: all, school, life, the old "personal" as life, a subject', () => {
    const s = { courseId: 'db', tags: [] }, l = { courseId: null, tags: [] };
    expect([inScope(s, ''), inScope(l, '')]).toEqual([true, true]);
    expect([inScope(s, 'school'), inScope(l, 'school')]).toEqual([true, false]);
    expect([inScope(s, 'life'), inScope(l, 'life'), inScope(l, 'personal')]).toEqual([false, true, true]);
    expect([inScope(s, 'db'), inScope(l, 'db')]).toEqual([true, false]);
  });
  it('To-do offers All / School / Life in the existing subject menu (no second row)', () => {
    const src = readFileSync(join(__dirname, '..', 'screens', 'Tasks.tsx'), 'utf8');
    expect(src).toContain("{ id: '', name: 'All' }, { id: 'school', name: 'School' }, { id: 'life', name: 'Life' }");
  });
  it('the agenda marks Life tasks so the Tasks widget lists School first', () => {
    const base = { startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false, kind: 'other' as const };
    const doc = buildAgenda({ now: 0, courses: [], meetings: [], variants: [], attendance: {}, dayMarks: {},
      tasks: [{ ...base, id: 'a', title: 'A', courseId: null, dueAt: 10, tags: ['school'] }, { ...base, id: 'b', title: 'B', courseId: null, dueAt: 5, tags: [] }],
      settings: { hour12: false, semesterStart: '', semesterEnd: '', alarms: [], notif: { enabled: false, pinClass: false } as never, moves: {} as never, trackedTags: ['#school'] } });
    expect(doc.tasks.map((t) => [t.id, t.l ?? 0])).toEqual([['b', 1], ['a', 0]]);
    const kt = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'Widgets.kt'), 'utf8');
    expect(kt).toContain('schoolFirst = true');
  });
});
