import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedSnapshot } from '../data/seed';
import { markSeries, gradeBars } from '../domain/analytics';

const stats = readFileSync(join(__dirname, '..', 'screens', 'Stats.tsx'), 'utf8');
const SNAP = seedSnapshot(new Date(2026, 9, 5, 8).getTime());

/* The defect (BUG-030) was *character*-budgeted truncation standing in for a *pixel* budget:
   `label.slice(0, 15) + '…'` in HBars and `labels[i].slice(0, 5)` in Line2. A character count is
   blind to the width actually available, so which labels survived depended on how many letters a
   subject's name had rather than on how much room it had — "Database Systems" fitted while
   "Intro to Economics" did not, in the same column. These tests pin the property that makes the class
   impossible to reintroduce: a label is bounded by pixels (numberOfLines) and never sliced by
   `String.slice`, anywhere Stats draws one. (The old chart primitives, ui/charts.tsx, are gone: Stats
   draws with ui/stats/parts.tsx since the report rebuild.) */

/** A *character-budget* truncation: a `slice(0, n)` on something that holds a name or a caption.
 *  Deliberately narrow — `slice(-7)` and `slice(0, 6)` on a data array are ordinary array work and
 *  must not be caught, so the rule names the label-bearing receivers instead of banning `slice`. */
const CHAR_BUDGET = /(?:label|labels|name|names|text|title)\s*(?:\[[^\]]*\])?\s*(?:\?\.)?!?\s*\.slice\(\s*0\s*,\s*\d+\s*\)/;

describe('chart labels are bounded by pixels, never by a character count (BUG-030)', () => {
  it('the demo set has names that the old 15- and 5-character budgets cut but the new gutter holds', () => {
    // Non-vacuity: these are the exact labels the device run photographed cut mid-word. If the seed
    // ever changed, the assertions below would pass vacuously and this is what stops that.
    const names = gradeBars(SNAP.courses, SNAP.marks, {}).map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['Intro to Economics', 'Discrete Mathematics', 'Emerging Technology', 'Computer Programming']));
    for (const n of names) expect(n.length).toBeGreaterThan(15); // every one of them lost its tail before

    const marks = markSeries(SNAP.courses[0]!.id, SNAP.marks).map((m) => m.name);
    expect(marks.some((m) => m.length > 5)).toBe(true); // …and the x-axis cut "Assignment" to "Assig"
  });

  /* Rationale (Stats rebuild, collage pass): the page now draws its bars and its mark history with the
     report parts in ui/stats/parts.tsx; the rule — labels bounded by pixels, never a character count — is
     held over both files. */
  it('Stats and its report parts slice no label to a character count', () => {
    const parts = readFileSync(join(__dirname, '..', 'ui', 'stats', 'parts.tsx'), 'utf8');
    expect(stats).not.toMatch(CHAR_BUDGET);
    expect(parts).not.toMatch(CHAR_BUDGET);
    expect(parts).toMatch(/left: X\(i\) - slot \/ 2, width: slot/);
    expect([...stats.matchAll(/<SubjectBars\b/g)]).toHaveLength(2);
    expect([...stats.matchAll(/<MarkLine\b/g)]).toHaveLength(1);
  });

  it('the rule is not vacuous: it catches the exact truncations this fix removed', () => {
    // A negative assertion on a regex proves nothing unless the regex fires on the old code.
    expect('it.label.slice(0, 15) + "…"').toMatch(CHAR_BUDGET);
    expect('labels[i]!.slice(0, 5)').toMatch(CHAR_BUDGET);
    expect('r.course.name.slice(0, 9)').toMatch(CHAR_BUDGET);
    expect('focusD.slice(-7)').not.toMatch(CHAR_BUDGET); // ordinary array work stays legal
    expect('bySub.slice(0, 6)').not.toMatch(CHAR_BUDGET);
  });
});