import type { ComponentType } from 'react';
import type { Colors } from '../../tokens/theme';
import { AttendanceArt, DialArt, PromiseArt, RecapArt, UndoArt } from './art';

/** The tour's five screens, in order.
 *
 *  ## The order, and why this order
 *
 *  1. **The promise.** A planner that keeps everything in one file on the phone is not a small
 *     claim, and nothing else on the tour lands if the user does not believe it. It is also the one
 *     line that makes the notification permission prompt — which the OS raises two or three seconds
 *     after Today on a first launch — something the user already expects.
 *  2. **The map.** Five tabs, one `+`, one gear. Every later screen happens *somewhere* on the page,
 *     and this is the frame they are placed in. It comes second because it is a map, not an
 *     instruction, and a map should not cost a screen of patience before the first real one.
 *  3. **The gesture that happens by accident.** Swiping is what a thumb does on a phone, and left is
 *     destructive. It is taught before the precise gestures because it is the one a user performs
 *     without meaning to — and because the Undo toast that follows is the tour's first proof that
 *     nothing here can be lost.
 *  4. **The gesture you must know.** Attendance is the one thing in this app that cannot be
 *     un-recorded, and its two-verb rule (tap once for Here, hold for anything else) is impossible
 *     to guess from a still frame — so it gets two demonstrated states rather than one.
 *  5. **The hardest thing, and it is live.** The Focus dial has no visible `±`, no button and no hint
 *     anywhere in the product. Nothing static can teach it, so this one screen is a real drag.
 *
 *  ## What is deliberately not here
 *
 *  A screen per tab (five near-identical screens that teach what the tab labels already say); the
 *  reminder and notification-permission settings (folded into screen 1's second sentence — Settings →
 *  Reminders carries a live hint on every row, and the OS asks for permission on its own); the
 *  clock faces (the clock is tappable and tapping it opens the right settings page); the taped notes
 *  (they look like sticky notes); and Data & export / Reset / Diagnostics (a path-based settings sheet
 *  is self-navigating, and two of those three are irreversible).
 */
export interface TourNote { icon: string; label: string; text: string }
export interface TourScreen {
  /** Stable id: a test asserts one per screen and the progress label counts them. */
  id: string;
  /** Marker-sized heading. Also what the Next button announces as its destination. */
  heading: string;
  body: string[];
  notes?: TourNote[];
  /** The artwork, in the app's own vocabulary. Interactive on screen 5, so it takes what it needs. */
  art: ComponentType<{ c: Colors; reduce: boolean }>;
}

export const SCREENS: TourScreen[] = [
  {
    id: 'local', heading: 'Your phone, not a website.',
    body: ['No account, no sign-in, no server. The whole planner is one file on this phone — and so are your reminders, which is why it asks once, to send them.'],
    art: PromiseArt,
    notes: [
      { icon: 'plus', label: 'the +', text: 'adds anything — an assignment, a class, a mark, a note. It is the only way in.' },
      { icon: 'gear', label: 'the gear', text: 'is on every page. It changes anything, and shows you the change before you save it.' },
    ],
  },
  {
    id: 'undo', heading: 'Right finishes. Left crumples.',
    body: ['The To-do page already says that much. What it does not say is that crumpling is real — the paper balls up and drops off the table — and that it comes back.'],
    art: UndoArt,
  },
  {
    id: 'attendance', heading: 'Tap once, then hold.',
    body: ['Attendance is the one thing you cannot get back if you get this wrong, so it is worth ten seconds. Tapping a cell that is already marked is refused on purpose.'],
    art: AttendanceArt,
  },
  {
    id: 'dial', heading: 'Drag the ring.',
    body: ['It stops every five minutes, like the dial in Focus. A break unlocks after five minutes of work, and it is worth taking.'],
    art: DialArt,
  },
  {
    id: 'recap', heading: "That's the whole app.",
    body: ['Five tabs, one + and a gear. Nothing here needs an account, and nothing leaves the phone.'],
    art: RecapArt,
  },
];

export const TOUR_LEN = SCREENS.length;
