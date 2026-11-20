import { readFileSync } from 'fs';
import { join } from 'path';

/* Every task kind a task can have is a chip you can pick.
 *
 * `TaskKind` has seven members and the Task sheet offered six: 'deadline' had no chip, and the seed
 * ships one (`data/seed.ts`). Editing that task therefore showed no selected chip and titled the sheet
 * "Task" — the kind survived the save, because the state initialises from `existing.kind`, so the bug
 * was invisible in the data and only showed in the form.
 *
 * This compares the TYPE against the PICKER by reading both, so adding a kind without adding its chip
 * fails here. It cannot be done with a compile-time exhaustiveness check because `KINDS` is not
 * exported, and exporting it purely for a test would widen a module's surface for the test's benefit. */
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

/** The union's members, in declaration order. */
const taskKinds = () => {
  const m = /export type TaskKind = ([^;]+);/.exec(read('domain/types.ts'));
  if (!m?.[1]) throw new Error('TaskKind is no longer a bare union — this test needs updating, not weakening');
  return [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]!);
};

/** The picker's `k:` values, in the order they render. */
const chips = () => [...read('sheets/forms.tsx').matchAll(/\{ k: '([a-z]+)', l: /g)].map((x) => x[1]);

/* v0.8 §3.1 (D6): kinds became TAGS on a task. Every kind a task can be given in the form is a tag chip; 'exam' is a
   dated notice now (migration 8 moves old ones), and 'other' is what a task with no kind tag is. */
describe('the Task sheet can tag every kind a task can have', () => {
  it('the tag chips are the union, less exam (a notice now) and other (no tag)', () => {
    expect([...chips()].sort()).toEqual(taskKinds().filter((k) => k !== 'exam' && k !== 'other').sort());
  });
  it("and 'deadline' is one of them, since the seed ships one", () => {
    expect(chips()).toContain('deadline');
    expect(read('data/seed.ts')).toMatch(/'deadline'/);
  });
});
