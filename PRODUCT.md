# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

One surface: an Expo/React Native app on an Android phone. iPhone is on hold (the code
is Expo, so it stays reachable later). **The desktop surface is out of scope.** Earlier
versions of this file planned a laptop-browser layout of the same data; v0.5 drops it
(see "Out of scope" under Capabilities and Constraints).

## Users

A student, on the phone. Mid-day: marking attendance the moment a class ends, jotting
an assignment down between lessons, checking how long is left in the current period.
In the evening: planning the week, triaging tasks and reading the analytics.

## Product Purpose

A school planner that holds a student's timetable, attendance, assignments, grades,
notes and focus time in one local database, and makes the day legible at a glance.

Success means: the student knows what class is on, how long is left in it, what is
due, and whether they are on track — without thinking about where to look.

## Positioning

The timetable is rendered as a **mechanical instrument**, not a coloured block. The
progress bar that shows how much of the current class remains is a chosen instrument —
a sight glass, a graduated gauge, a spectrum analyzer under a peak-hold ceiling, a
call stack unwinding, a B-tree cursor sweeping its leaves. Sixteen exist, grouped by
the subject they were designed for, plus one day-wide sight glass.

A neighbouring planner could copy the reminder list. It could not copy "your period 3
is a piece of laboratory equipment that happens to know the time." That mechanism is
the product's own.

## Operating Context

- Real school timetables are repetitive weekly: the same meetings recur every week,
  Monday-first, typically between 08:00 and 16:00.
- Attendance is marked per class occurrence, with a two-stage rule: tap an empty cell
  once to mark it, long-press to change it. A lock exists so nothing changes by
  accident.
- Grades are weighted: each mark carries a weight and an on/off flag, subjects carry
  an optional goal percentage, and the app computes what average the remaining marks
  need to reach that goal.
- Focus uses a pomodoro dial with 25/45/50/90-minute presets, optional flow mode that
  lets a round overrun, and breaks unlocked after a set amount of focus time.
- Everything is local: SQLite on the device, local notifications, no account, no
  cloud. The only network use is checking Expo's update server (`u.expo.dev`) for app
  updates; no account, no personal data. Export exists as a deliberate escape hatch
  (xlsx, csv, json).

## Capabilities and Constraints

**Routes (all six exist on the phone):** Today, Week, To-do, Grades, Stats, Focus.
Focus is a route but deliberately not a tab — it is entered from a running-timer chip
or a FAB.

**Forms and sheets:** add-task, add-class, add-subject, add-mark, add-note,
mark-attendance (per class and per whole day), and a settings system with 18 sub-pages.

**Reusable component language that every redesign keeps:** hand-cut paper
cards with elliptical corners and wobble (`HandBox`); ink, paper and accent colour
tokens across two palettes and two themes; four fonts — Caveat for handwriting,
PermanentMarker for headings, Newsreader italic for secondary prose, Special Elite for
typewriter numerals; a paper background with ruling styles (dots/grid/ruled/plain) and
grain or photographic texture; six analog clock faces; the day bar instrument system;
SVG charts (rings, heatmaps, histograms, horizontal bars, hand-inked lines).

**Confirmed constraints:**
- The phone is the product. Every surface is designed for a phone held in one hand.
- Local-only stays a product truth: no account, no cloud, no telemetry. The update
  check is the one network call, and it carries no personal data.

**Out of scope (v0.5):**
- The desktop surface: a laptop-browser layout of the same data. Earlier versions of
  this file left its transport (how a laptop reaches the phone's data) and its write
  path open; with the surface dropped, neither question needs an answer. Expo web
  stays a development and test harness (the browser assertions under `tools/`), not a
  product surface.

## Brand Commitments

- The shipped name is **Margin**. Marginalia was the working name; it survives only in
  internal identifiers a student never reads (the `marginalia` scheme and slug, the
  `app.marginalia.planner` package, `marginalia.db`), and never in user-facing copy.
- The hand-cut paper world is binding. The user's instruction was to keep the
  components — the clocks, the fonts, the background, everything — and not to be
  limited by them. So the world is inherited and extended, never replaced.
- Voice: warm, plain, slightly wry in marginal notes and empty states; never
  corporate, never gamified.

## Evidence on Hand

- Full working application source at `src/` — six screens, seven sheets, an 18-page
  settings system, a seeded demo dataset (`src/data/seed.ts`), and an extensive test
  suite under `src/test/` that pins behaviour, motion timings, a11y roles, contrast
  ratios and suppression budgets.
- Real assets: paper grain bitmap, a journal-page photograph, hand-drawn SVG dials.
- Documented design decisions inline throughout the source — motion vocabulary, the
  reasons each hand-drawn edge exists, measured contrast ratios.
- No testimonials, no customer claims, no performance benchmarks, no pricing. None
  may be invented.

## Product Principles

1. **The phone is the whole product.** Capture and planning both happen on it, so
   capture stays thumb-shaped and the analytics are built to be read on a phone, not
   as a scaled-down desktop page.
2. **Show the mechanism, don't describe it.** The instrument bar, the escapement
   bezel, the real grade maths. The app demonstrates rather than claims.
3. **Local-only is a feature.** Everything works on a plane. Export is the escape
   hatch, never a subscription.
4. **Density is earned, not defaulted.** More on screen at once only where it
   actually helps — analytics and week planning. Capture stays thumb-shaped.
5. **Every hand-cut edge is a decision with a reason.** Extending the world means
   extending its rules, not adding decoration.

## Accessibility & Inclusion

The existing app already commits to: `accessibilityRole` and `accessibilityLabel` on
every interactive element, accessibility labels derived from the same string as
`testID`, live regions on the focus countdown and round announcements, a
`useReduceMotion` path that collapses every animation to an instant assignment, a
font-scale ceiling, and measured contrast ratios on all text tokens (documented at
6.7:1 and above in the theme file). Every redesign must hold every one of these.
