import type { Snapshot } from './types';

/** Is there a row here that the user made?
 *
 *  `demo: true` is stamped on every row the sample semester seeds (`data/seed.ts` — subjects,
 *  timetable, open and finished tasks, notes, grades and history) and is cleared by the first edit
 *  anyone makes to a row (`sheets/forms.tsx`), so "no row without it" means one of two things and
 *  both mean the same thing to a person: this planner holds nothing they did.
 *
 *  Read by three decision-makers, which is why it is pure and not a store function: the tour's
 *  first-run test (`App.tsx` via `ui/onboard/coach.ts`, see the same name there), and `boot()`,
 *  which must not hand an upgrading device — one with a term of real marks — a demo session over
 *  the top of its own data. */
export function hasRealRows(s: Snapshot): boolean {
  return s.courses.some((r) => !r.demo) || s.meetings.some((r) => !r.demo) || s.tasks.some((r) => !r.demo)
    || s.notices.some((r) => !r.demo) || s.marks.some((r) => !r.demo) || s.focus.some((r) => !r.demo);
}
