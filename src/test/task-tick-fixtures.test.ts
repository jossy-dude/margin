/**
 * v0.7.7.9 (SPEC §5, §9.9): a tick on the Tasks widget patches the note line natively (TaskTick.kt), with no JS. Both
 * sides must write byte-identical lines, so JS `patchLine` is the source of truth: this test holds the cases and their
 * expected lines in `tick-lines.json`, which the Kotlin test (`TaskTickTest`) runs too.
 *
 * `WRITE_TICK_FIXTURES=1 npx jest task-tick-fixtures` rewrites the file from the cases below.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { patchLine, replaceLine } from '../domain/vaultTasks';

const FILE = join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'test', 'resources', 'tick-lines.json');
const TODAY = '2026-11-26';
const NBSP = ' ';

/* each: a line as the vault may hold it; what it is about */
const CASES: [string, string][] = [
  ['- [ ] Read chapter 7 📅 2026-11-27 ^r7', 'plain open line with a block id'],
  ['- [ ] Read chapter 7', 'no block id: ✅ goes at the end'],
  ['- [ ] Problem set 5 #school #Database-Systems ⏫ 📅 2026-11-28 ⏰ 23:59 ➕ 2026-11-20 ^ps5   ', 'fields and trailing spaces'],
  ['- [-] Quiz 3 📅 2026-11-25 ❌ 2026-11-24 ^q3', 'cancelled: ❌ leaves, ✅ comes'],
  ['- [ ] Lab report 📅 2026-11-26 ✅ 2026-11-25 ^lr', 'stale ✅ already there: not doubled'],
  ['- [x] Done already ✅ 2026-11-20 ^d1', 'already done: unchanged'],
  ['- [X] Done with capital X ^d2', 'capital X counts as done'],
  ['- [/] Started essay 📅 2026-11-30 ^es', 'started: becomes done'],
  ['- [!] Important thing ^im', 'important: becomes done'],
  ['  - [ ] Nested sub-task ^sub', 'indented'],
  ['\t- [ ] Tab-indented ^tab', 'tab indent'],
  ['* [ ] Star bullet ^st', 'star bullet'],
  ['1. [ ] Numbered ^n1', 'numbered list'],
  ['- [ ]No space after the box ^ns', 'no space after ]'],
  ['- [ ]  Two spaces after the box ^two', 'two spaces after ]'],
  ['- [ ] Water plants 🔁 every week 📅 2026-11-26 ^wp', 'recurring (the next occurrence is 0.7.8.5)'],
  ['- [ ] Emoji with selector ✅️ 2026-11-01 ^vs', 'variation selector on ✅'],
  ['- [ ] Cancel date with selector ❌️ 2026-11-01 ^vx', 'variation selector on ❌'],
  [`- [ ] No-break space before id${NBSP}^nb`, 'NBSP before the block id'],
  ['Not a task at all', 'not a task: unchanged'],
  ['- [ ] Ends in CR ^cr\r', 'CRLF note: JS leaves a line with \\r unchanged'],
  ['- [ ] 日本語のタスク 📅 2026-11-29 ^jp', 'non-Latin title'],
];
/* v0.7.8.2 (SPEC §9 Tests): the shared real-vault lines run here too, so Kotlin ticks each of them as JS does */
const VAULT_LINES = readFileSync(join(__dirname, 'fixtures', 'vault-lines.md'), 'utf8').split('\n').filter((l) => l.trim());
CASES.push(...VAULT_LINES.map((l, i): [string, string] => [l, `vault-lines.md:${i + 1}`]));

type Fx = { line: string; today: string; want: string; why: string };
const make = (): Fx[] => CASES.map(([line, why]) => ({ line, today: TODAY, want: patchLine(line, { status: 'x', today: TODAY }), why }));

describe('tick-lines.json (shared with TaskTick.kt)', () => {
  if (process.env.WRITE_TICK_FIXTURES) writeFileSync(FILE, `${JSON.stringify(make(), null, 1)}\n`);
  const fx = JSON.parse(readFileSync(FILE, 'utf8')) as Fx[];
  it('matches what patchLine writes today', () => { expect(fx).toEqual(make()); });
  it('covers every case', () => { expect(fx).toHaveLength(CASES.length); });
  it('a tick is idempotent: ticking the result again changes nothing', () => {
    for (const f of fx) expect(patchLine(f.want, { status: 'x', today: TODAY })).toBe(f.want);
  });
  it('finds the line by its block id in a note, as the native side does', () => {
    const note = ['# Week', '', '- [ ] A ^a', '- [ ] B 📅 2026-11-27 ^b', ''].join('\n');
    const next = replaceLine(note, 'b', patchLine('- [ ] B 📅 2026-11-27 ^b', { status: 'x', today: TODAY }));
    expect(next).toBe(['# Week', '', '- [ ] A ^a', '- [x] B 📅 2026-11-27 ✅ 2026-11-26 ^b', ''].join('\n'));
  });
});
