/** v0.8 §1.5 / §3.4: task lines in notes, read and patched field by field. */
import { parseLine, parseNote, patchLine, newLine, tracked, addBlockIds, replaceLine, appendLine, readsPath, kindTagsOf, subjectTag } from '../domain/vaultTasks';

describe('reading a task line', () => {
  it('the title stops at the first field (S13)', () => {
    const t = parseLine('- [ ] Finish all CP exercises, as promised in class 📅 2026-11-22 #school ^abc1')!;
    expect(t.title).toBe('Finish all CP exercises, as promised in class');
    expect(t.due).toBe('2026-11-22');
    expect(t.blockId).toBe('abc1');
    expect(t.tags).toEqual(['school']);
  });
  it('reads every Tasks field and Bone\'s time and estimate', () => {
    const t = parseLine('- [!] Lab report #school #Database-Systems #lab ⏫ 🛫 2026-11-20 ⏳ 2026-11-21 📅 2026-11-22 ⏰ 9:05 ⏱ 1h30m ➕ 2026-11-19 🔁 every week ^m1')!;
    expect(t).toMatchObject({ status: '!', title: 'Lab report', prio: 4, start: '2026-11-20', scheduled: '2026-11-21', due: '2026-11-22', time: '09:05', estimateMin: 90, created: '2026-11-19', recur: 'every week', blockId: 'm1' });
    expect(kindTagsOf(t.tags)).toEqual(['lab']);
  });
  it('skips quotes, callouts, code and frontmatter; skips Conflicts/ and Margin\'s generated notes', () => {
    const text = '---\ntags: [x]\n- [ ] not a task\n---\n- [ ] a #school\n> - [ ] quoted\n> [!conflict] x\n> > - [x] nested\n```\n- [ ] code\n```\n  - [x] b';
    expect(parseNote(text, 'N.md').map((t) => t.title)).toEqual(['a', 'b']);
    expect(parseNote(text, 'Conflicts/2026-11-19.md')).toEqual([]);
    expect(readsPath('Margin/Timetable.md')).toBe(false);
    expect(readsPath('Margin/Tasks.md')).toBe(true);
  });
  it('tracked by any tracked tag, case-insensitive', () => {
    expect(tracked(parseLine('- [ ] a #School')!, ['#school'])).toBe(true);
    expect(tracked(parseLine('- [ ] a #lab')!, ['#school', '#lab'])).toBe(true);
    expect(tracked(parseLine('- [ ] a')!, ['#school'])).toBe(false);
    expect(subjectTag({ name: 'Database Systems' })).toBe('#Database-Systems');
  });
});

describe('patching a line', () => {
  const line = '- [ ] Read ch. 3 #school ⏫ 📅 2026-11-22 some note ^t1';
  it('a tick sets x and the done date; nothing else moves', () => {
    expect(patchLine(line, { status: 'x', today: '2026-11-20' })).toBe('- [x] Read ch. 3 #school ⏫ 📅 2026-11-22 some note ✅ 2026-11-20 ^t1');
  });
  it('reopening drops the done date', () => {
    expect(patchLine('- [x] a ✅ 2026-11-20 ^t1', { status: ' ' })).toBe('- [ ] a ^t1');
  });
  it('an unknown status character stays when Margin does not change the status (S18)', () => {
    expect(patchLine('- [!] a 📅 2026-11-22 ^t1', { due: '2026-11-23' })).toBe('- [!] a 📅 2026-11-23 ^t1');
  });
  it('due, time and priority are added, changed or removed', () => {
    expect(patchLine('- [ ] a ^t1', { due: '2026-11-23', time: '09:00' })).toBe('- [ ] a 📅 2026-11-23 ⏰ 09:00 ^t1');
    expect(patchLine(line, { due: null, prio: 2 })).toBe('- [ ] Read ch. 3 #school 🔽 some note ^t1');
  });
  it('a new title keeps the tags and fields', () => {
    expect(patchLine(line, { title: 'Read ch. 4' })).toBe('- [ ] Read ch. 4 #school ⏫ 📅 2026-11-22 some note ^t1');
  });
  it('cancelled', () => {
    expect(patchLine('- [ ] a ^t1', { status: '-', today: '2026-11-20' })).toBe('- [-] a ❌ 2026-11-20 ^t1');
  });
});

describe('writing', () => {
  it('a Margin task becomes a line that reads back as itself', () => {
    const l = newLine({ title: 'Lab report', tags: ['#school', '#Database-Systems', 'lab'], due: '2026-11-22', time: '09:00', prio: 4, estimateMin: 45, created: '2026-11-19', blockId: 'abc 1' });
    expect(l).toBe('- [ ] Lab report #school #Database-Systems #lab ⏫ 📅 2026-11-22 ⏰ 09:00 ⏱ 45m ➕ 2026-11-19 ^abc-1');
    expect(parseLine(l)).toMatchObject({ title: 'Lab report', due: '2026-11-22', time: '09:00', prio: 4, estimateMin: 45, blockId: 'abc-1' });
  });
  it('block ids go only on tracked lines without one', () => {
    let n = 0;
    const r = addBlockIds('- [ ] a #school\n- [ ] b\n- [ ] c #school ^old', 'N.md', ['#school'], () => `id${++n}`);
    expect(r.text).toBe('- [ ] a #school ^id1\n- [ ] b\n- [ ] c #school ^old');
  });
  it('replace, remove and append by block id', () => {
    expect(replaceLine('x\n- [ ] a ^t1\ny', 't1', '- [x] a ^t1')).toBe('x\n- [x] a ^t1\ny');
    expect(replaceLine('x\n- [ ] a ^t1\ny', 't1', null)).toBe('x\ny');
    expect(appendLine('# T\n\n', '- [ ] a')).toBe('# T\n- [ ] a\n');
  });
});
