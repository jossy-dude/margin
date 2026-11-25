import { cumulative, gpaOf, pastTerms, pointsOf, termGpa } from '../domain/gpa';

describe('GPA (v0.7.6.4)', () => {
  it('reads letters as typed, on the 4.0 scale', () => {
    expect(pointsOf('A-')).toBe(3.75); expect(pointsOf('a+')).toBe(4); expect(pointsOf(' B+ ')).toBe(3.5); expect(pointsOf('E')).toBeNull();
  });
  it('weights by credit hours', () => {
    expect(gpaOf([{ credits: 3, points: 4 }, { credits: 1, points: 2 }]).gpa).toBe(3.5);
    expect(gpaOf([]).gpa).toBeNull();
  });
  it('this term: % → letter → points, and says what it left out instead of guessing', () => {
    const t = termGpa([{ id: 'a', name: 'DB', pct: 86 }, { id: 'b', name: 'CP', pct: 72 }, { id: 'c', name: 'Econ', pct: null }, { id: 'd', name: 'Math', pct: 90 }], { a: 3, b: 3, c: 2 });
    expect(t.rows.map((r) => r.letter)).toEqual(['A', 'B']);
    expect(t.gpa).toBe(3.5);
    expect(t.missing).toEqual([{ id: 'c', name: 'Econ', why: 'marks' }, { id: 'd', name: 'Math', why: 'credits' }]);
  });
  it('earlier terms group by term name, and the cumulative counts them with this term', () => {
    const past = [{ id: '1', term: 'Y1 S1', name: 'Physics', credits: 3, grade: 'B' }, { id: '2', term: 'Y1 S1', name: 'Logic', credits: 3, grade: 'A' }, { id: '3', term: 'Y1 S2', name: 'C++', credits: 4, grade: 'C+' }];
    expect(pastTerms(past).map((t) => [t.term, t.gpa])).toEqual([['Y1 S1', 3.5], ['Y1 S2', 2.5]]);
    expect(cumulative(past, [{ credits: 2, points: 4 }]).credits).toBe(12);
    expect(cumulative(past, [{ credits: 2, points: 4 }]).gpa).toBeCloseTo((9 + 12 + 10 + 8) / 12);
  });
});
