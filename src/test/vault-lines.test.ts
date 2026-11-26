/**
 * v0.7.8.2 (SPEC §9 Tests, B1 B4 B5 B6 B7): about 40 real lines from the vault (`fixtures/vault-lines.md`): a range,
 * `🔁`, `✅` done, `❌` cancelled, `~` failed, `»` forwarded with `→`, `⏳` only, nested sub-tasks, trailing spaces,
 * variation selectors. Each line is parsed and has every field Marrow owns patched; the line stays byte for byte
 * the same outside the patched field. The same lines are ticked by Kotlin through `tick-lines.json`.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { isOpen, lineIndexOf, parseLine, patchLine, replaceLine, withTasksHead, type LinePatch } from '../domain/vaultTasks';
import { taskFromLine } from '../domain/vaultMap';

const LINES = readFileSync(join(__dirname, 'fixtures', 'vault-lines.md'), 'utf8').split('\n').filter((l) => l.trim());
const CLOSED = new Set(['x', 'X', '-', '~', '»']);
const FIELD: Record<'due' | 'scheduled' | 'time' | 'prio', RegExp> = {
  due: /\s*📅️?\s*\d{4}-\d{2}-\d{2}/u,
  scheduled: /\s*⏳️?\s*\d{4}-\d{2}-\d{2}/u,
  time: /\s*⏰️?\s*\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?/u,
  prio: /\s*[🔺⏫🔼🔽⏬]/u,
};
/** The line without one field (and without the trailing spaces patchLine always trims). */
const without = (s: string, k: keyof typeof FIELD) => s.replace(FIELD[k], '').replace(/\s+$/, '');

describe('fixtures/vault-lines.md', () => {
  it('has about 40 lines, every one a task', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(40);
    for (const l of LINES) expect({ l, parsed: !!parseLine(l) }).toEqual({ l, parsed: true });
  });
  it.each(LINES.map((l) => [l]))('%s', (raw) => {
    const t = parseLine(raw)!;
    expect(isOpen(t.status)).toBe(!CLOSED.has(t.status));
    const patches: [keyof typeof FIELD, LinePatch, (p: ReturnType<typeof parseLine>) => unknown, unknown][] = [
      t.due === null && t.scheduled !== null
        ? ['scheduled', { scheduled: '2026-12-05' }, (p) => p!.scheduled, '2026-12-05']
        : ['due', { due: '2026-12-05' }, (p) => p!.due, '2026-12-05'],
      ['time', { time: '10:00' }, (p) => p!.time, '10:00'],
      ['prio', { prio: t.prio === 4 ? 2 : 4 }, (p) => p!.prio, t.prio === 4 ? 2 : 4],
    ];
    for (const [k, patch, read, want] of patches) {
      const out = patchLine(raw, patch);
      expect(read(parseLine(out))).toBe(want);
      // byte for byte the same outside the patched field
      expect(without(out, k)).toBe(without(raw, k));
      // nothing else changed in what the parser sees
      const a = parseLine(out)!, b = t;
      for (const f of ['status', 'title', 'tags', 'blockId', 'start', 'created', 'doneOn', 'cancelledOn', 'estimateMin', 'recur'] as const) expect(a[f]).toEqual(b[f]);
      if (k !== 'due' && k !== 'scheduled') { expect(a.due).toBe(b.due); expect(a.scheduled).toBe(b.scheduled); }
      if (k !== 'time') { expect(a.time).toBe(b.time); expect(a.timeEnd).toBe(b.timeEnd); }
    }
    // patching to what the line already says leaves it alone
    expect(patchLine(raw, { due: t.due ?? undefined, time: t.time && !t.timeEnd && /⏰\uFE0F?\s*\d{2}:/u.test(raw) ? t.time : undefined, prio: t.prio })).toBe(raw.replace(/\s+$/, '').replace(/(📅|⏰)️/gu, '$1'));
  });
});

describe('B1: a ⏰ range is kept whole', () => {
  const raw = '- [ ] Plan and execute the week 📅 2026-11-25 ⏰ 15:15-16:45';
  it('parses the start and the end', () => { expect(parseLine(raw)).toMatchObject({ time: '15:15', timeEnd: '16:45' }); });
  it('a re-date leaves the range alone', () => { expect(patchLine(raw, { due: '2026-11-27' })).toBe('- [ ] Plan and execute the week 📅 2026-11-27 ⏰ 15:15-16:45'); });
  it('a new start keeps the length', () => { expect(patchLine(raw, { time: '16:00' })).toBe('- [ ] Plan and execute the week 📅 2026-11-25 ⏰ 16:00-17:30'); });
  it('a range that would pass midnight becomes a start time', () => { expect(patchLine('- [ ] Late 📅 2026-11-27 ⏰ 23:00-23:45', { time: '23:30' })).toBe('- [ ] Late 📅 2026-11-27 ⏰ 23:30'); });
  it('removing the time removes the whole range', () => { expect(patchLine(raw, { time: null })).toBe('- [ ] Plan and execute the week 📅 2026-11-25'); });
});

describe('B4: failed and forwarded are closed', () => {
  const map = (raw: string) => taskFromLine(parseLine(raw, 'Daily/x.md')!, undefined, [], ['#school'], 0);
  it.each([['- [~] Morning run 📅 2026-11-24 ⏰ 06:30-07:00'], ['- [»] Draft the essay 📅 2026-11-24 → 2026-11-26 14:00'], ['- [-] Gone ❌ 2026-11-14']])('%s', (raw) => {
    expect(map(raw)).toMatchObject({ status: 2, cancelled: true });
  });
  it('x is done, not cancelled', () => { expect(map('- [x] Done ✅ 2026-11-25')).toMatchObject({ status: 2, cancelled: false }); });
  it.each([[' '], ['/'], ['?'], ['!'], ['>'], ['*']])('[%s] is open', (ch) => { expect(map(`- [${ch}] Open thing`).status).not.toBe(2); });
});

describe('B5: ⏳ only is planned, not due', () => {
  const map = (raw: string) => taskFromLine(parseLine(raw, 'Daily/x.md')!, undefined, [], ['#school'], 0);
  it('planned for its day', () => { const t = map('- [ ] Sketch the poster ⏳ 2026-11-29'); expect(t.planned).toBe(true); expect(t.dueAt).not.toBeNull(); });
  it('a 📅 line is due as before', () => { expect(map('- [ ] A 📅 2026-11-29').planned).toBeUndefined(); });
  it('re-dated on its ⏳, with no 📅 added', () => { expect(patchLine('- [ ] Sketch the poster ⏳ 2026-11-29', { scheduled: '2026-12-01' })).toBe('- [ ] Sketch the poster ⏳ 2026-12-01'); });
  it('the To-do row says Planned and never Late', () => {
    const src = readFileSync(join(__dirname, '..', 'screens', 'common.tsx'), 'utf8');
    expect(src).toContain('late = !done && !t.planned');
    expect(src).toContain('`Planned · ${relDue(t.dueAt, now, h12)}`');
  });
  it('the push re-dates ⏳ and never adds 📅 to a ⏳-only line', () => {
    expect(readFileSync(join(__dirname, '..', 'store', 'obsidian.ts'), 'utf8')).toContain('if (cur.due === null && cur.scheduled !== null && w.due !== null) out.scheduled = w.due');
  });
});

describe('B6: the line is found by ID_RE', () => {
  it('trailing spaces after the id', () => {
    const note = ['# x', '- [ ] Trailing #school 📅 2026-11-27 ^ts1   ', ''];
    expect(lineIndexOf(note, 'ts1')).toBe(1);
    expect(replaceLine(note.join('\n'), 'ts1', '- [x] Trailing ^ts1')).toBe('# x\n- [x] Trailing ^ts1\n');
  });
  it('the push uses it, not endsWith', () => {
    const src = readFileSync(join(__dirname, '..', 'store', 'obsidian.ts'), 'utf8');
    expect(src).not.toContain('endsWith(`^${bid}`)');
    expect(src).toContain('findLine(txt, line.p, bid)');
  });
});

describe('B7: Margin/Tasks.md keeps margin: tasks', () => {
  it('adds it into existing front matter, keeping the rest', () => {
    expect(withTasksHead('---\ncreated: 2026-11-12\n---\n- [ ] A ^a\n')).toBe('---\nmargin: tasks\ncreated: 2026-11-12\n---\n- [ ] A ^a\n');
  });
  it('front matter that has it is left alone', () => { const t = '---\nmargin: tasks\n---\n# School tasks\n'; expect(withTasksHead(t)).toBe(t); });
  it('a note without front matter gets it at the top', () => { expect(withTasksHead('- [ ] A ^a\n')).toBe('---\nmargin: tasks\n---\n- [ ] A ^a\n'); });
  it('an empty note stays empty (the head is written with the first line)', () => { expect(withTasksHead('')).toBe(''); });
  it('every write to Margin/Tasks.md goes through it', () => {
    expect(readFileSync(join(__dirname, '..', 'store', 'obsidian.ts'), 'utf8')).toContain('if (p === TASKS_NOTE) next = withTasksHead(next); // B7');
  });
});
