/** The one curve every animation in this app decelerates on, and the policy the page swap follows.
 *
 *  ── the curve ──
 *  `PLACE_EASE` is the app's single settle. `EASE` in `ui/kit.tsx` is literally this curve, so a chip,
 *  a stepper, a week-page turn, a settings page and a sheet all decelerate with the same hand on the
 *  tween; if the two ever diverge the app has two settles and the reason for sharing the constant is
 *  gone. The values are not negotiable either — solved out (see `src/test/perf-placement.test.ts`,
 *  which solves the curve rather than asserting a number back at itself) this is a very front-loaded
 *  decelerate: 42% of the travel in the first tenth of the time and 96% by the half, and it never
 *  overshoots. That shape is what makes a 90 ms press and a 220 ms settle read as immediate rather
 *  than as easing in.
 *
 *  ── the page swap: a cut, not a placement ──
 *  There is no duration constant here, and that is the decision rather than a number. The navigator
 *  used to run a 160 ms paper drop — 70 dp of travel, a tilt, a scale and a shadow overlay — on every
 *  tab tap. The owner's report was that the page arrived "sooo long" after the press, and the
 *  forensics agreed with the report rather than with the design: for a page nobody asked to move, the
 *  drop paid a whole extra layout pass and two composited full-screen pages before its first moving
 *  frame, and then kept them composited for ten more. So the travel, the tilt, the lift, the shadow
 *  and the loop are all gone, and what is left is a cut: `display` flips from 'none' to 'flex' in the
 *  commit that carries the tab write, and the page is simply the one on top.
 *
 *  That is not a downgrade of the gesture, it is the frequency rule applying to it. `expo-animation`'s
 *  own gate puts tab switches in the 100+-times-a-day row — "No animation. Platform default or
 *  nothing. Stop here." — and a bottom tab bar is exactly that: a peer selector, not a hierarchy, so
 *  a slide would imply depth that is not there. The press already answers the finger on the
 *  finger-down frame (the ripple, the favicon highlight, the place haptic); a second motion after it
 *  narrates the same fact a second time, several frames later.
 *
 *  `PLACE_EASE` stays because everything that IS worth animating still decelerates on it. */

/** `Easing.bezier` control points, spread out here rather than in `Book.tsx` so the shape is testable
 *  as maths — `perf-placement.test.ts` solves the curve rather than asserting the constants back to
 *  themselves. */
export const PLACE_EASE = [0.2, 0.9, 0.25, 1] as const;
