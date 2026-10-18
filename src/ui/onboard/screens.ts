import { act, getState, type RouteName } from '../../store/store';
import { SHEET_TARGET, type TourStep } from './coach';

/** The tour, in order: ten steps on the real app, seven of them operated by the user's own finger.
 *
 *  ## What replaced the five illustrated screens, and why
 *
 *  The old tour drew the app. This one runs it — the real `+`, the real tab bar, the real timetable
 *  block, the real dial — and every step waits for something the app actually says
 *  (`ui/onboard/coach.ts`). Four of the old five taught something this list still has to teach and
 *  cannot be a tap, because tapping that control would WRITE: attendance, the swipe that crumples a
 *  row, the two tabs that read the marks back, and the promise that the data is not the user's. Those
 *  became **look steps** — the ring is around the real control, the callout says what it does, Next
 *  moves on, and nothing is written.
 *
 *  | old screen | became |
 *  |---|---|
 *  | 1 `local` — the promise, the `+`, the gear | step 1 (`add`, the real `+`), step 2 (`close`, the real ✕), step 3 (`gear`) |
 *  | 2 `undo` — right finishes, left crumples | step 7 (`row`, a real task card) |
 *  | 3 `attendance` — tap once, then hold | step 5 (`class`, a real timetable block) |
 *  | 4 `dial` — drag the ring, live | step 9 (`dial`, the real dial, still live) |
 *  | 5 `recap` — five tabs, one +, a gear | steps 4/6/8 (the tab bar) and step 10 (`done`) |
 *
 *  ## The order, and why this order
 *
 *  1. **The way in.** Nothing else lands if the user does not know that the `+` is the only door, and
 *     it is the one control on a first screen that is not a label. It also carries the promise — no
 *     account, no server — because that is the sentence the notification prompt two seconds later
 *     needs to have already been said.
 *  2. **The way out.** A sheet opens on this very step, so the way out has to be taught while the
 *     user is sitting in one.
 *  3. **The gear**, which is the whole of Settings and the door back to this tour.
 *  4. **The map.** Five tabs, and the first real tap of the tour.
 *  5. **Attendance**, on a real block, on the page the previous step just opened: tap once, then hold.
 *  6. **To-do**, the second real tap.
 *  7. **The gesture that happens by accident.** Swiping is what a thumb does, left is destructive, and
 *     the Undo toast that follows is the tour's proof that nothing here can be lost.
 *  8. **Grades and Stats**, the two pages that read the marks back.
 *  9. **The hardest thing, and it is live.** The dial has no visible ±, no button and no hint anywhere
 *     in the product. Nothing short of a real drag teaches it, so this step is a real drag — with the
 *     dial's own ±5 written into the callout for anyone who cannot drag one.
 *  10. **The hand-over**, and the only destructive thing the tour ever offers: the sample semester,
 *      which is offered exactly once, on a planner the user has not put anything into yet.
 */
const HOME: RouteName = 'Today', WEEK: RouteName = 'Week', LIST: RouteName = 'Tasks', FOCUS: RouteName = 'Focus';

export const STEPS: TourStep[] = [
  {
    id: 'add', brand: true, route: HOME, target: 'fab',
    heading: 'Everything lives on this phone.',
    body: [
      'No account, no sign-in, no server. Margin is one file on this phone — and so are your reminders, which is why it asks once, to send them.',
      'Tap the + to add anything: a class, an assignment, a grade, a note. It is the only way in.',
    ],
    await: (s) => s.sheet !== null,
  },
  {
    id: 'close', route: HOME, target: SHEET_TARGET,
    heading: 'Every sheet closes with the ✕.',
    body: ['A form opens as a sheet. The ✕, the dim paper around it, or Android’s back button all put it away — back always steps out, and never traps you.'],
    /* A user who pressed Next instead of the + arrives here with nothing open, so the step opens the
       sheet the + opens. It is the app's own action on the app's own store, not a picture of one. */
    enter: (s) => { if (!s.sheet) act.open({ t: 'add' }); },
    await: (s) => s.sheet === null,
  },
  {
    id: 'gear', route: HOME, target: 'gear',
    heading: 'The gear changes anything.',
    body: ['Look & feel, reminders, attendance rules, data and export — on every page, and it shows you the change before it saves it.', '“Show the tour again” lives in there, so this can be run back whenever.'],
  },
  {
    id: 'week', route: HOME, target: 'tab-week',
    heading: 'Five pages, one bar.',
    body: ['Today, Week, To-do, Grades, Stats. Everything the planner holds happens on one of them.', 'Tap Week.'],
    await: (s) => s.route === 'Week',
  },
  {
    id: 'class', route: WEEK, target: 'week-class',
    heading: 'Tap once, then hold.',
    body: ['Tapping a block marks you here. Hold it to change the mark — late, absent, sick, excused.', 'Attendance is the one thing Margin cannot undo for you, so the second gesture is there on purpose.'],
  },
  {
    id: 'todo', target: 'tab-tasks',
    heading: 'Now To-do.',
    body: ['Everything due, in one list. Tap the tab.'],
    await: (s) => s.route === LIST,
  },
  {
    id: 'row', route: LIST, target: 'task-row',
    heading: 'Right finishes. Left crumples.',
    body: ['Swipe a row right to finish it, left to tear it off the page. The paper ball is real — and so is the Undo toast that brings it back.'],
  },
  {
    id: 'marks', target: 'tab-grades',
    heading: 'Grades and Stats read it back.',
    body: ['Marks go in on Grades and come back out as an average; Stats shows where the time actually went. Open them when you have something to add.'],
  },
  {
    id: 'dial', target: 'focus-dial', nudge: true,
    heading: 'The dial is a real dial.',
    body: ['Drag the ring to set a round. It stops every five minutes, a break unlocks after five minutes of work, and the break is worth taking.'],
    enter: () => { if (getState().route !== FOCUS) act.go(FOCUS); },
    await: (s, start) => s.timer.planMin !== start,
  },
  {
    id: 'done', empty: true, route: HOME,
    heading: 'That’s Margin.',
    body: [
      'Everything you have been looking at is a sample semester — fake subjects, fake marks, fake history, so that no page opens empty on day one.',
      'Nothing of yours is in it. Start empty and build the real thing, or keep it and poke around.',
    ],
    replayBody: [
      'Five pages, one + and a gear, and everything on them stays on this phone.',
      'Settings → Show the tour again brings this back whenever you want it.',
    ],
  },
];

export const TOUR_LEN = STEPS.length;
