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
/* ── v0.7 course components (DATA_MODEL.md "The maths") ─────────────────────────────────────────────
 * Each mark gets an effective weight: e = share_c × (m.weight / W_c), W_c = Σ weight of the counted marks in
 * its component c. A component with a share but no marks yet counts as wholly unscored (still to come).
 * Shares that do not add to 100 are normalised. With no shares set (or one component) the pooled v0.6
 * maths applies unchanged, so every existing grade means what it meant. */
export interface GradePart { id: string; weight?: number | null; scale?: number | null; isBase?: boolean | null }
interface Eff { e: number; pct: number | null }
export const sharesSet = (parts: readonly GradePart[]) => parts.length > 1 && parts.some((p) => (p.weight ?? 0) > 0);
function effective(marks: readonly Mark[], parts: readonly GradePart[]): Eff[] {
  const base = parts.find((p) => p.isBase) ?? null;
  const sum = parts.reduce((a, p) => a + Math.max(0, p.weight ?? 0), 0);
  const out: Eff[] = [];
  for (const p of parts) {
    const share = Math.max(0, p.weight ?? 0) / sum;
    if (share <= 0) continue;
    const mine = marks.filter((m) => m.on && m.weight > 0 && ((m.variantId ?? null) === p.id || (!m.variantId && base?.id === p.id)));
    const W = mine.reduce((a, m) => a + m.weight, 0);
    if (W <= 0) { out.push({ e: share, pct: null }); continue; }
    const scale = p.scale && p.scale > 0 ? p.scale : 100;
    for (const m of mine) out.push({ e: share * (m.weight / W), pct: m.score === null ? null : (m.score / scale) * 100 });
  }
  return out;
}
/** The course grade from its components' shares; the pooled `total()` when no shares are set. */
export function courseGrade(marks: Mark[], parts: readonly GradePart[], adj = 0): number | null {
  if (!sharesSet(parts)) return total(marks, adj);
  let a = 0, b = 0;
  for (const x of effective(marks, parts)) if (x.pct !== null) { a += x.e * x.pct; b += x.e; }
  return b ? clamp(a / b + adj, 0, 100) : null;
}
/** What average the rest of the course must hit to reach `goal`; the pooled `needed()` when no shares are set. */
export function courseNeeded(marks: Mark[], parts: readonly GradePart[], goal: number, adj = 0): { need: number; feasible: boolean; reached: boolean; weightLeft: number } | null {
  if (!sharesSet(parts)) return needed(marks, goal, adj);
  let a = 0, all = 0, u = 0;
  for (const x of effective(marks, parts)) { all += x.e; if (x.pct === null) u += x.e; else a += x.e * x.pct; }
  if (u <= 1e-9) return null;
  const need = ((goal - adj) * all - a) / u;
  return { need, feasible: need <= 100, reached: need <= 0, weightLeft: u * 100 };
}
/** The split as the editor shows it: each share's percentage after normalising, and the raw sum. */
export function splitOf(parts: readonly GradePart[]): { sum: number; pct: Record<string, number> } {
  const sum = parts.reduce((a, p) => a + Math.max(0, p.weight ?? 0), 0);
  return { sum, pct: Object.fromEntries(parts.map((p) => [p.id, sum ? (Math.max(0, p.weight ?? 0) / sum) * 100 : 0])) };
}

export const letter = (v: number | null) => (v === null ? '—' : v >= 90 ? 'A+' : v >= 85 ? 'A' : v >= 80 ? 'A−' : v >= 75 ? 'B+' : v >= 70 ? 'B' : v >= 65 ? 'B−' : v >= 60 ? 'C+' : v >= 50 ? 'C' : v >= 45 ? 'D' : 'F');
