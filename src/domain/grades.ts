import type { Mark } from './types';
import { clamp } from './time';

export function total(marks: Mark[], adj = 0): number | null {
  let a = 0, b = 0;
  for (const m of marks) if (m.on && m.score !== null && m.weight > 0) { a += m.score * m.weight; b += m.weight; }
  return b ? clamp(a / b + adj, 0, 100) : null;
}
/** What average the remaining (unscored, counted) marks must hit to reach `goal`. */
export function needed(marks: Mark[], goal: number, adj = 0): { need: number; feasible: boolean; reached: boolean; weightLeft: number } | null {
  let a = 0, b = 0, u = 0;
  for (const m of marks) { if (!m.on || m.weight <= 0) continue; if (m.score === null) u += m.weight; else { a += m.score * m.weight; b += m.weight; } }
  if (u <= 0) return null;
  const need = ((goal - adj) * (b + u) - a) / u;
  return { need, feasible: need <= 100, reached: need <= 0, weightLeft: u };
}
export const letter = (v: number | null) => (v === null ? '—' : v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'A−' : v >= 75 ? 'B+' : v >= 70 ? 'B' : v >= 65 ? 'B−' : v >= 60 ? 'C+' : v >= 50 ? 'C' : v >= 45 ? 'D' : 'F');
