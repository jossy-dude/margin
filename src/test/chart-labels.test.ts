import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedSnapshot } from '../data/seed';
import { markSeries, gradeBars } from '../domain/analytics';

const charts = readFileSync(join(__dirname, '..', 'ui', 'charts.tsx'), 'utf8');
const stats = readFileSync(join(__dirname, '..', 'screens', 'Stats.tsx'), 'utf8');
const SNAP = seedSnapshot(new Date(2026, 9, 5, 8).getTime());

/* The defect (BUG-030) was *character*-budgeted truncation standing in for a *pixel* budget:
   `label.slice(0, 15) + '…'` in HBars and `labels[i].slice(0, 5)` in Line2. A character count is
   blind to the width actually available, so which labels survived depended on how many letters a
   subject's name had rather than on how much room it had — "Database Systems" fitted while
   "Intro to Economics" did not, in the same column. These tests pin the property that makes the class
   impossible to reintroduce: a label is bounded by pixels (numberOfLines) and never sliced by
   `String.slice`, anywhere in the chart primitives. */

/** A *character-budget* truncation: a `slice(0, n)` on something that holds a name or a caption.
 *  Deliberately narrow — `slice(-7)` and `slice(0, 6)` on a data array are ordinary array work and
 *  must not be caught, so the rule names the label-bearing receivers instead of banning `slice`. */
const CHAR_BUDGET = /(?:label|labels|name|names|text|title)\s*(?:\[[^\]]*\])?\s*(?:\?\.)?!?\s*\.slice\(\s*0\s*,\s*\d+\s*\)/;

describe('chart labels are bounded by pixels, never by a character count (BUG-030)', () => {
  it('no chart primitive truncates a label with String.slice at all', () => {
    // HBars used `it.label.slice(0, 15) + '…'`; Line2 used `labels[i]!.slice(0, 5)`. A slice is a
    // character budget, so it cuts mid-word ("Assig") and ignores the gap it is drawn in.
    expect(charts).not.toMatch(CHAR_BUDGET);
  });

  it('every label the charts draw is a real <Txt> with numberOfLines', () => {
    const labels = [...charts.matchAll(/<Txt\b[^>]*>/g)].map((m) => m[0]);
    expect(labels.length).toBeGreaterThanOrEqual(3); // HBars label, HBars value, Ring sub-line, Line2 axis
    for (const l of labels) expect(l).toContain('numberOfLines={1}');
  });

  it('the demo set has names that the old 15- and 5-character budgets cut but the new gutter holds', () => {
    // Non-vacuity: these are the exact labels the device run photographed cut mid-word. If the seed
    // ever changed, the assertions below would pass vacuously and this is what stops that.
    const names = gradeBars(SNAP.courses, SNAP.marks, {}).map((g) => g.name);
    expect(names).toEqual(expect.arrayContaining(['Intro to Economics', 'Discrete Mathematics', 'Emerging Technology', 'Computer Programming']));
    for (const n of names) expect(n.length).toBeGreaterThan(15); // every one of them lost its tail before

    const marks = markSeries(SNAP.courses[0]!.id, SNAP.marks).map((m) => m.name);
    expect(marks.some((m) => m.length > 5)).toBe(true); // …and the x-axis cut "Assignment" to "Assig"
  });

  it('the Ring label box may grow to its label, so a two-word label cannot be clipped (BUG-030 "Focus strea")', () => {
    // The ring drew its label inside `width: size + 8` — the ring's diameter plus a hair. "Focus
    // streak" is wider than that, so Android clipped the final glyph. `minWidth` lets the box take
    // the width its own label needs; the row is a horizontal ScrollView, so nothing is pushed off.
    expect(charts).toMatch(/alignItems:\s*'center',\s*minWidth:\s*size \+ 8/);
    expect(charts).not.toMatch(/alignItems:\s*'center',\s*width:\s*size \+ 8/);
  });

  it('the Line2 x-axis label slot is derived from the gap between points, not a constant', () => {
    // `slot` is half the distance between neighbouring points: the widest a centred label can be
    // without colliding with the next. Hard-coding it would clip again at a different width.
    expect(charts).toMatch(/const slot = n > 1 \? \(w - 24\) \/ \(n - 1\) : w - 24;/);
    expect(charts).toMatch(/left: X\(i\) - slot \/ 2, width: slot/);
  });

  it('HBars derives its bar column from the width it was handed, so label + bar + value cannot overlap', () => {
    // labelW + gap + barW + gap + valW must not exceed `w`, which is what stops the bar running under
    // the label now that the label is laid out by the text engine rather than by a slice.
    expect(charts).toMatch(/barW = Math\.max\(24, w - labelW - valW - 16\)/);
  });

  it('Stats still renders one HBars per bar-card and no hand-sliced label of its own', () => {
    // The four affected cards are all HBars or Line2 callers; a new character-budget slice in Stats
    // would be the same defect reintroduced one layer up.
    expect(stats).not.toMatch(CHAR_BUDGET);
    expect([...stats.matchAll(/<HBars\b/g)]).toHaveLength(3);
    expect([...stats.matchAll(/<Line2\b/g)]).toHaveLength(1);
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