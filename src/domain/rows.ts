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

/** A row the sample semester left behind once its subjects are gone (BUG #12). */
export interface SampleLeftover { entity: 'task' | 'notice' | 'mark' | 'meeting' | 'focus' | 'attendance' | 'adjust' | 'alarm'; id: string }

/** The sample rows `s` still holds although the sample term they belong to has been removed.
 *
 *  `seed` is the sample set itself (`data/seed.ts`), whose ids are fixed. A row is a leftover when its
 *  id is a sample id and it would otherwise be re-homed: its subject is not in `s` any more, or (no
 *  subject at all) it is still flagged `demo` while no sample subject remains. Attendance and grade
 *  adjustments on a removed sample subject go with it, and so do alarms set on a leftover task.
 *  Anything the owner made has an id the seed never uses, so it is never a leftover; a sample row the
 *  owner edited whose subject is still there stays theirs ("you touched it, it's yours"). An install
 *  that still holds the sample subjects has no leftovers at all. */
export function sampleLeftovers(s: Snapshot, seed: Snapshot): SampleLeftover[] {
  const seedIds = new Set<string>([...seed.tasks, ...seed.notices, ...seed.marks, ...seed.meetings, ...seed.focus].map((r) => r.id));
  const seedCourses = new Set(seed.courses.map((c) => c.id));
  const have = new Set(s.courses.map((c) => c.id)), sampleSubjectsLeft = s.courses.some((c) => c.demo);
  const gone = (cid: string) => seedCourses.has(cid) && !have.has(cid);
  const left = (r: { id: string; courseId: string | null; demo: boolean }) =>
    seedIds.has(r.id) && (r.courseId ? !have.has(r.courseId) : r.demo && !sampleSubjectsLeft);
  const out: SampleLeftover[] = [];
  for (const [entity, rows] of [['task', s.tasks], ['notice', s.notices], ['mark', s.marks], ['meeting', s.meetings], ['focus', s.focus]] as const)
    for (const r of rows as readonly { id: string; courseId: string | null; demo: boolean }[]) if (left(r)) out.push({ entity, id: r.id });
  const tasksGone = new Set(out.filter((x) => x.entity === 'task').map((x) => x.id));
  /* Attendance counts only when it is a stamp on a sample CLASS (same weekday, start and subject as a
     seed meeting) whose subject is gone — never on a key that merely shares a one-letter subject id. */
  const seedClasses = new Set(seed.meetings.map((m) => `${m.weekday}|${m.start}|${m.courseId}`));
  for (const key of Object.keys(s.attendance)) {
    const [date, start, cid] = key.split('|'), [y, mo, d] = (date ?? '').split('-').map(Number);
    if (!cid || !gone(cid) || !y || !mo || !d) continue;
    const wd = (new Date(y, mo - 1, d).getDay() + 6) % 7;
    if (seedClasses.has(`${wd}|${start}|${cid}`)) out.push({ entity: 'attendance', id: key });
  }
  for (const cid of Object.keys(s.adjusts)) if (gone(cid)) out.push({ entity: 'adjust', id: cid });
  for (const a of s.alarms) if (a.taskId && tasksGone.has(a.taskId)) out.push({ entity: 'alarm', id: a.id });
  return out;
}

/** `s` without its sample leftovers (see `sampleLeftovers`). */
export function withoutSampleLeftovers<T extends Snapshot>(s: T, seed: Snapshot): T {
  const drop = new Set(sampleLeftovers(s, seed).map((x) => `${x.entity}:${x.id}`)), keep = (e: string) => (r: { id: string }) => !drop.has(`${e}:${r.id}`);
  return {
    ...s, tasks: s.tasks.filter(keep('task')), notices: s.notices.filter(keep('notice')), marks: s.marks.filter(keep('mark')),
    meetings: s.meetings.filter(keep('meeting')), focus: s.focus.filter(keep('focus')), alarms: s.alarms.filter(keep('alarm')),
    attendance: Object.fromEntries(Object.entries(s.attendance).filter(([k]) => !drop.has(`attendance:${k}`))),
    adjusts: Object.fromEntries(Object.entries(s.adjusts).filter(([k]) => !drop.has(`adjust:${k}`))),
  };
}
