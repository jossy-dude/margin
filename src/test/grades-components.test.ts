/** v0.7 R4 — course grades from components with editable shares (DATA_MODEL.md "The maths"). */
import { courseGrade, courseNeeded, needed, partGrades, splitOf, total, type GradePart } from '../domain/grades';
import type { Mark } from '../domain/types';

const mk = (id: string, score: number | null, weight: number, variantId: string | null = null): Mark => ({ id, courseId: 'db', name: id, score, weight, on: true, sort: 0, demo: false, variantId });
const marks = [mk('mid', 70, 30), mk('final', null, 70), mk('lab1', 9, 5, 'v-lab'), mk('lab2', null, 5, 'v-lab')];
const parts: GradePart[] = [{ id: 'db~base', isBase: true, weight: 70 }, { id: 'v-lab', weight: 30, scale: 20 }];

describe('course components (Database 70/30, the lab marked out of 20)', () => {
  it('gives the hand-computed course % and needed average', () => {
    // e: mid .21, final .49, lab1 .15, lab2 .15 → (0.21×70 + 0.15×45) / 0.36 = 59.583…
    expect(courseGrade(marks, parts)).toBeCloseTo(59.5833, 3);
    // (85 × 1 − 21.45) / 0.64 = 99.296…
    const n = courseNeeded(marks, parts, 85)!;
    expect(n.need).toBeCloseTo(99.2969, 3);
    expect(n.feasible).toBe(true);
  });
  it('a component with a share and no marks yet counts as still to come', () => {
    const ms = [mk('mid', 80, 30)];
    expect(courseGrade(ms, parts)).toBeCloseTo(80, 6);
    const n = courseNeeded(ms, parts, 85)!;
    // all = 1; scored: mid (e = .7 × 30/30 = .7) at 80; unscored: the lab's .3
    expect(n.need).toBeCloseTo((85 - 0.7 * 80) / 0.3, 6);
  });
  it('shares that do not add to 100 are normalised', () => {
    expect(splitOf([{ id: 'a', weight: 60 }, { id: 'b', weight: 30 }])).toEqual({ sum: 90, pct: { a: 66.66666666666666, b: 33.33333333333333 } });
    expect(courseGrade(marks, [{ id: 'db~base', isBase: true, weight: 35 }, { id: 'v-lab', weight: 15, scale: 20 }])).toBeCloseTo(59.5833, 3);
  });
  it('no shares, or one component: exactly the v0.6 pooled maths', () => {
    const pooled: GradePart[] = [{ id: 'db~base', isBase: true }, { id: 'v-lab' }];
    expect(courseGrade(marks, pooled, 2)).toBe(total(marks, 2));
    expect(courseNeeded(marks, pooled, 85)).toEqual(needed(marks, 85));
    expect(courseGrade(marks, [{ id: 'db~base', isBase: true, weight: 100 }])).toBe(total(marks));
    expect(courseGrade(marks, [])).toBe(total(marks));
  });
  it('the curve still applies to the course %', () => {
    expect(courseGrade(marks, parts, 5)).toBeCloseTo(64.5833, 3);
  });
});

describe('the component rows on the Grades card (R4, D-14)', () => {
  it('each part: its share of the course and its own % so far (lab out of 20 shown as %)', () => {
    const rows = partGrades(marks, parts);
    expect(rows.map((r) => r.id)).toEqual(['db~base', 'v-lab']);
    expect(rows[0]!.share).toBeCloseTo(70); expect(rows[0]!.grade).toBeCloseTo(70);
    expect(rows[1]!.share).toBeCloseTo(30); expect(rows[1]!.grade).toBeCloseTo(45);
  });
  it('no shares set: no rows, the card stays as it was', () => {
    expect(partGrades(marks, [{ id: 'db~base', isBase: true }])).toEqual([]);
  });
});
