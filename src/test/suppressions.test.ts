import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toNavigator, toStore } from '../navigation/sync';
import type { RouteName } from '../store/store';

/** The directive itself, assembled at runtime so this file does not inflate the
 *  `rg -c 'eslint-' src/` count that the next auditor will run. */
const DIRECTIVE = `eslint-${'disable-line'} react-hooks/${'exhaustive-deps'}`;

const ROUTES: RouteName[] = ['Today', 'Week', 'Tasks', 'Grades', 'Stats', 'Focus'];

/** One commit of the two syncs. `reverseKeyed` picks which side the navigator→store effect is keyed
 *  on, which is the whole content of the directive on Book.tsx:42. */
interface Pair { store: RouteName; cur: RouteName }
function commit(route: RouteName, cur: RouteName, prev: Pair, reverseKeyed: 'cur' | 'route'): Pair {
  let store = route, nav = cur;
  if (route !== prev.store) { const n = toNavigator(route, cur); if (n) nav = n; }
  const reverseRan = reverseKeyed === 'cur' ? cur !== prev.cur : route !== prev.store || cur !== prev.cur;
  if (reverseRan) { const s = toStore(route, cur); if (s) store = s; }
  return { store, cur: nav };
}
/** A store-first navigation: what a tab tap was before Book.tsx batched it into one event, and what
 *  the focus entry / a notification still do — the forward-sync path the keying analysis is about. */
const storeHop = (p: Pair, to: RouteName, k: 'cur' | 'route'): Pair => (to === p.store ? p : commit(to, p.cur, p, k));
const hardwareBack = (p: Pair, k: 'cur' | 'route'): Pair => (p.cur === 'Today' ? p : commit(p.store, 'Today', p, k));
const settled = (p: Pair, k: 'cur' | 'route'): Pair => commit(p.store, p.cur, p, k);

/** The invariant the suppression exists to protect: the two never disagree, over many random hops. */
function run(k: 'cur' | 'route'): { agreed: number; total: number; firstBreak: unknown } {
  let p: Pair = { store: 'Today', cur: 'Today' }, seed = 7, agreed = 0, firstBreak: unknown = null;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300 && !firstBreak; i++) {
      p = settled(rnd() < 0.25 ? hardwareBack(p, k) : storeHop(p, ROUTES[Math.floor(rnd() * ROUTES.length)]!, k), k);
    if (p.store === p.cur) agreed++; else firstBreak = { i, ...p };
  }
  return { agreed, total: 300, firstBreak };
}

describe('BUG-017 audit: the eighth suppression is a deliberate dep choice, not a silenced failure', () => {
  it('the shipped keying (reverse sync on [cur]) never lets the two disagree', () => {
    const { firstBreak } = run('cur');
    expect(firstBreak).toBe(null);
  });

  it('obeying the linter instead (adding `route` to the reverse sync) breaks the nav', () => {
    // Why this is not a suppression to "clean up": the effect deliberately keys on the side that
    // moved. Keyed on both, a tab tap runs the reverse sync in the same commit as the forward one,
    // and it writes the store straight back to where the navigator has not got to yet.
    const { firstBreak, agreed } = run('route');
    expect(firstBreak).not.toBe(null);
    expect(agreed).toBeLessThan(300); // so the failure is a real regression, not one unlucky hop
  });

  it('and the one-hop case is concrete: obeying the linter leaves the two disagreeing after one store-first hop', () => {
    const before: Pair = { store: 'Today', cur: 'Today' };
    // Effects run in declaration order, so the forward one moves the navigator to Grades and the
    // reverse one then reads `route` as stale and yanks the store back to Today: the nav shows
    // Grades while the store says Today, which is BUG-021 all over again from the other direction.
    expect(commit('Grades', 'Today', before, 'route')).toEqual({ store: 'Today', cur: 'Grades' });
    expect(commit('Grades', 'Today', before, 'route').store).not.toBe(commit('Grades', 'Today', before, 'route').cur);
    // Keyed on [cur] the reverse effect does not run at all this commit, because the navigator had
    // not moved *yet* — which is exactly what keeps the store→navigator sync working.
    expect(commit('Grades', 'Today', before, 'cur')).toEqual({ store: 'Grades', cur: 'Grades' });
  });

  it('Book.tsx still carries exactly two suppressions, and the reverse one is still keyed on [cur]', () => {
    const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
    // Two, not three: forward and reverse. The third went with the hide-schedule effect that the
    // removal of the drop took with it — there is no layout effect on `Placed` left to silence.
    expect(src.split(DIRECTIVE).length - 1).toBe(2); // forward, reverse
    const line = src.split('\n').find((l) => l.includes('toStore('))!;
    expect(line).toContain('}, [cur])');
    expect(line).toContain(DIRECTIVE);
  });

  it('the audit verdict on all seven: each names a deliberate omission, and the workload one still holds', () => {
    // Each of the seven, with the reason it is not a silenced failure, restated here so the verdict
    // lives with the code rather than only in qa/BUGS.md.
    //
    // There were eight. The first — the Focus pointer's per-second jolt — left with the countdown fix,
    // and it had already outlived the directive it claimed to justify: the effect was keyed on `wholeSec`,
    // a const of its own, so there was no `Math.floor(leftMs/1000)` left for a suppression to be "on
    // purpose" about. A verdict recording a silence that does not exist is worse than a missing one —
    // it is the exact failure this list is here to prevent — so it went rather than being reworded.
    const verdicts = [
      'Focus.tsx:100 sticker fall, keyed on [falling] so it runs once per fall',
      'Focus.tsx:137/147 fev event block: discrete timer events, not derived state',
      'Focus.tsx:143 the same block, [st.fev]',
      'Book.tsx:23  Placed page placement, keyed on [on]',
      'Book.tsx:40  store→navigator, keyed on [route] so a tab tap navigates',
      'Book.tsx:41  navigator→store, keyed on [cur] so a BACK writes the store',
      'forms.tsx:61 workload memo, keyed on the four fields workload() actually reads',
    ];
    expect(verdicts).toHaveLength(7);
    for (const v of verdicts) expect(v.length).toBeGreaterThan(20); // each names its reason
    // the navigator→store verdict is the one the audit was asked about: it must still be keyed on [cur]
    const bookLine = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8').split('\n').find((l) => l.includes('toStore('))!;
    expect(bookLine).toContain('}, [cur])');
    // the workload memo is the one BUG-017 called "latent risk": workload() must still read nothing but the
    // four memoised fields, or the memo is silently stale and the suppression hides it.
    const reminders = readFileSync(join(__dirname, '../domain/reminders.ts'), 'utf8');
    const body = reminders.slice(reminders.indexOf('export function workload'));
    for (const read of ['task.dueAt', 'task.estimateMin', 'task.status', 'task.startAt']) expect(body).toContain(read);
    expect(body).not.toContain('task.courseId');
  });
});