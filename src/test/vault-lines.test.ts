/**
 * v0.7.8.2 (SPEC §9 Tests, B1 B4 B5 B6 B7): about 40 real lines from the vault (`fixtures/vault-lines.md`): a range,
 * `🔁`, `✅` done, `❌` cancelled, `~` failed, `»` forwarded with `→`, `⏳` only, nested sub-tasks, trailing spaces,
 * variation selectors. Each line is parsed and has every field Marrow owns patched; the line stays byte for byte
 * the same outside the patched field. The same lines are ticked by Kotlin through `tick-lines.json`.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { bellOf, isOpen, keysOf, lineIndexOf, nextOccurrence, nextRecurrence, parseLine, patchLine, replaceLine, withTasksHead, type LinePatch } from '../domain/vaultTasks';
import { bellFor, lineRingTimes, taskFromLine } from '../domain/vaultMap';

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

describe('🔔: one reminder grammar (v0.7.8.4, SPEC §9.3, B2, B8)', () => {
  const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`).getTime();
  const map = (raw: string) => taskFromLine(parseLine(raw, 'Daily/x.md')!, undefined, [], ['#school'], 0);
  it('parses the list; the title stops before it', () => {
    const t = parseLine('- [ ] Lab report #Database-Systems 📅 2026-11-27 ⏰ 15:15-16:45 🔔 -1h, -10m, 07:30, 2026-11-26 20:00 ^m1a2b')!;
    expect(t.title).toBe('Lab report');
    expect(t.rings).toEqual([{ kind: 'before', min: 60 }, { kind: 'before', min: 10 }, { kind: 'at', hm: '07:30' }, { kind: 'on', date: '2026-11-26', hm: '20:00' }]);
    expect(bellOf(t.rings)).toBe('-1h, -10m, 07:30, 2026-11-26 20:00');
  });
  it('the 08:50 test: ⏰ 09:00 🔔 -10m rings at 09:00 and 08:50', () => {
    const t = map('- [ ] Test 📅 2026-11-27 ⏰ 09:00 🔔 -10m');
    const due = t.dueAt!;
    expect(t.reminders.map((r) => (r.mode === 'abs' ? r.at : due - r.minutes * 60_000))).toEqual([at('2026-11-27', '09:00'), at('2026-11-27', '08:50')]);
  });
  it('with no ⏰, -1d is before 09:00 on the due day; a full date is that time', () => {
    const t = map('- [ ] Pay the fee 📅 2026-11-28 🔔 -1d, 2026-11-27 18:00');
    expect(t.reminders.map((r) => (r.mode === 'abs' ? r.at : -1))).toEqual([at('2026-11-27', '09:00'), at('2026-11-27', '18:00')]);
  });
  it('no 🔔 and no ⏰: nothing rings', () => { expect(map('- [ ] Quiet 📅 2026-11-28').reminders).toEqual([]); });
  it('B2: the line wins over what Marrow had (a ring removed in Obsidian stops)', () => {
    const prev = map('- [ ] Test 📅 2026-11-27 ⏰ 09:00 🔔 -10m');
    expect(taskFromLine(parseLine('- [ ] Test 📅 2026-11-27 ⏰ 09:00', 'Daily/x.md')!, prev, [], ['#school'], 0).reminders).toHaveLength(1);
  });
  it('writes, replaces and removes the list', () => {
    expect(patchLine('- [ ] A 📅 2026-11-27 ⏰ 09:00 ^a', { bell: '-10m' })).toBe('- [ ] A 📅 2026-11-27 ⏰ 09:00 🔔 -10m ^a');
    expect(patchLine('- [ ] A 📅 2026-11-27 ⏰ 09:00 🔔 -10m ^a', { bell: '-1h, 07:30' })).toBe('- [ ] A 📅 2026-11-27 ⏰ 09:00 🔔 -1h, 07:30 ^a');
    expect(patchLine('- [ ] A 📅 2026-11-27 ⏰ 09:00 🔔 -10m ^a', { bell: null })).toBe('- [ ] A 📅 2026-11-27 ⏰ 09:00 ^a');
  });
  it('Marrow\'s reminders as 🔔: the ⏰ ring is the ⏰ itself; -N only with a ⏰', () => {
    const due = at('2026-11-27', '09:00');
    expect(bellFor({ dueAt: due, reminders: [{ id: 'a', mode: 'before', minutes: 0, label: '' }, { id: 'b', mode: 'before', minutes: 10, label: '' }, { id: 'c', mode: 'abs', at: at('2026-11-27', '07:30'), label: '' }] }, '09:00')).toBe('-10m, 07:30');
    expect(bellFor({ dueAt: at('2026-11-28', '23:59'), reminders: [{ id: 'a', mode: 'before', minutes: 1440, label: '' }] }, null)).toBe('2026-11-27 23:59');
  });
  it('a line whose words already mean the task\'s rings is not rewritten', () => {
    const t = map('- [ ] Pay the fee 📅 2026-11-28 🔔 -1d');
    expect(lineRingTimes(parseLine('- [ ] Pay the fee 📅 2026-11-28 🔔 -1d')!)).toEqual(t.reminders.map((r) => (r.mode === 'abs' ? r.at : 0)));
  });
});

describe('🔁 both ways (v0.7.8.5, SPEC §9.5, B3, D12)', () => {
  it.each([
    ['every day', '2026-11-26', '2026-11-27'], ['daily', '2026-11-30', '2026-12-01'],
    ['every weekday', '2026-11-27', '2026-11-30'], ['every week', '2026-11-26', '2026-12-03'],
    ['every month', '2026-01-31', '2026-02-28'], ['every year', '2028-02-29', '2029-02-28'],
    ['every 2 weeks', '2026-11-26', '2026-12-10'], ['every 3 days', '2026-11-30', '2026-12-03'], ['every 2 months', '2026-12-15', '2027-02-15'],
  ])('%s from %s → %s', (rule, from, want) => { expect(nextRecurrence(rule, from)).toBe(want); });
  it('an unknown rule gives nothing', () => { expect(nextRecurrence('every full moon', '2026-11-26')).toBeNull(); });
  it('the next occurrence: open, 📅 moved, 🛫 moved with it, no ✅, no ^id', () => {
    expect(nextOccurrence('- [ ] Water 🔁 every week 🛫 2026-11-24 📅 2026-11-26 ^w1', '2026-11-26')).toBe('- [ ] Water 🔁 every week 🛫 2026-12-01 📅 2026-12-03');
  });
  it('a late one counts from today', () => {
    expect(nextOccurrence('- [ ] Pay rent 🔁 every month 📅 2026-10-01', '2026-11-26')).toBe('- [ ] Pay rent 🔁 every month 📅 2026-12-26');
  });
  it('the done line keeps the key; its keyless twin gets the next number, not the same key', () => {
    const k = [...keysOf('- [ ] Water 🔁 every week 📅 2026-12-03\n- [x] Water 🔁 every week 📅 2026-11-26 ✅ 2026-11-26 ^lfabc\n', 'x.md').keys()];
    expect(k[0]).toBe('lfabc');
    expect(k[1]).not.toBe('lfabc');
  });
  it('bone-tasks no longer copies the ^id to the next occurrence', () => {
    const p = join(homedir(), 'Documents', 'Obsidian_Vault', '𐂯Bone𐂯', '.obsidian', 'plugins', 'bone-tasks', 'main.js');
    if (existsSync(p)) expect(readFileSync(p, 'utf8')).toContain('n = n.replace(/\\s\\^[\\w-]+\\s*$/, "");');
  });
  it('the native tick leaves 🔁 lines to JS', () => {
    expect(readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'TaskTick.kt'), 'utf8')).toContain('if (lines[i].contains("🔁")) return null');
  });
});
