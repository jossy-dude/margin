import { letter } from './grades';
import type { PastGrade } from './types';

/**
 * GPA on the 4.0 scale most Ethiopian universities print on the transcript (v0.7.6.4). The letter comes from the
 * app's own scale (`grades.letter`: A+ ≥ 90 … F < 45); each letter is worth these grade points, and a GPA is the
 * points weighted by credit hours. A subject with no credit hours set is left out (and said so), never guessed.
 */
export const POINTS: Readonly<Record<string, number>> = { 'A+': 4, A: 4, 'A−': 3.75, 'B+': 3.5, B: 3, 'B−': 2.75, 'C+': 2.5, C: 2, D: 1, F: 0 };
export const LETTERS = Object.keys(POINTS);
/** Grade points for a letter as typed (`A-` and `A−` both work); null for anything not on the scale. */
export function pointsOf(grade: string): number | null {
  const g = grade.trim().toUpperCase().replace('-', '−');
  return g in POINTS ? POINTS[g]! : null;
}
export interface GpaRow { credits: number; points: number }
export interface Gpa { gpa: number | null; credits: number }
export function gpaOf(rows: readonly GpaRow[]): Gpa {
  const credits = rows.reduce((a, r) => a + r.credits, 0);
  return { gpa: credits > 0 ? rows.reduce((a, r) => a + r.points * r.credits, 0) / credits : null, credits };
}
export interface TermCourse { id: string; name: string; pct: number | null }
/** This term: each subject's current % as a letter, weighted by its credit hours. `missing` names what is left out. */
export function termGpa(courses: readonly TermCourse[], credits: Readonly<Record<string, number>>) {
  const rows: (GpaRow & { id: string; name: string; letter: string })[] = [], missing: { id: string; name: string; why: 'credits' | 'marks' }[] = [];
  for (const c of courses) {
    const cr = credits[c.id];
    if (!cr || cr <= 0) { missing.push({ id: c.id, name: c.name, why: 'credits' }); continue; }
    if (c.pct === null) { missing.push({ id: c.id, name: c.name, why: 'marks' }); continue; }
    const l = letter(c.pct);
    rows.push({ id: c.id, name: c.name, credits: cr, points: POINTS[l] ?? 0, letter: l });
  }
  return { ...gpaOf(rows), rows, missing };
}
/** Earlier terms, one GPA each, in the order they were first typed. */
export function pastTerms(past: readonly PastGrade[]) {
  const by = new Map<string, PastGrade[]>();
  for (const g of past) { const k = g.term.trim() || 'Earlier'; by.set(k, [...(by.get(k) ?? []), g]); }
  return [...by.entries()].map(([term, list]) => ({ term, list, ...gpaOf(list.flatMap((g) => { const p = pointsOf(g.grade); return p === null || !(g.credits > 0) ? [] : [{ credits: g.credits, points: p }]; })) }));
}
/** Cumulative: every earlier course plus this term's projection. */
export function cumulative(past: readonly PastGrade[], term: readonly GpaRow[]): Gpa {
  return gpaOf([...past.flatMap((g) => { const p = pointsOf(g.grade); return p === null || !(g.credits > 0) ? [] : [{ credits: g.credits, points: p }]; }), ...term]);
}
