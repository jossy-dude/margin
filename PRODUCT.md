# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

One product, two genuinely different design surfaces: an Expo/React Native app on an
Android phone, and a desktop layout in a laptop browser on the same WiFi. The design
language adapts to each — phone is capture-in-the-moment, desktop is analysis and
planning.

## Users

A student. On the phone, mid-day: marking attendance the moment a class ends,
jotting an assignment down between lessons, checking how long is left in the current
period. On the laptop, evening study sessions or a long desk session: planning the
week, triaging tasks, and reading the analytics properly — the analytics are the
reason the desktop view exists.

The phone is the primary device. The desktop view is a second surface the same person
uses when they do not want to touch their phone. It is not a replacement and must not
ask the student to give up the phone.

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
the product's own, and it is what the desktop surface extends rather than replaces.

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
  cloud, no network calls. Export exists as a deliberate escape hatch (xlsx, csv, json).
- The phone has been carrying `start:lan` and `tunnel` scripts since early in the
  project, and Expo web is available in this SDK, so a desktop surface is technically
  reachable without changing the data model.

## Capabilities and Constraints

**Routes (all six exist on the phone):** Today, Week, To-do, Grades, Stats, Focus.
Focus is a route but deliberately not a tab — it is entered from a running-timer chip
or a FAB.

**Forms and sheets:** add-task, add-class, add-subject, add-mark, add-note,
mark-attendance (per class and per whole day), and a settings system with 18 sub-pages.

**Reusable component language that must survive into the desktop view:** hand-cut paper
cards with elliptical corners and wobble (`HandBox`); ink, paper and accent colour
tokens across two palettes and two themes; four fonts — Caveat for handwriting,
PermanentMarker for headings, Newsreader italic for secondary prose, Special Elite for
typewriter numerals; a paper background with ruling styles (dots/grid/ruled/plain) and
grain or photographic texture; six analog clock faces; the day bar instrument system;
SVG charts (rings, heatmaps, histograms, horizontal bars, hand-inked lines).

**Confirmed constraints:**
- Mobile-first is preserved. The desktop view is additive.
- Hosting/transmission of the desktop view is deliberately **undecided** — the user
  asked for the design of the desktop surface first and chose to defer the mechanism.
- Local-only stays a product truth: no account, no cloud, no telemetry.

**Open decisions:**
- How a laptop browser reaches the phone's data is unresolved. The design must not
  assume one; it must be layout, not transport.
- Whether the desktop surface ships a writing path (adding tasks, marking attendance)
  or is read-and-plan only is unresolved.

## Brand Commitments

- The name is **Marginalia**.
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

1. **The phone is the capture device; the laptop is the thinking device.** Each
   surface is built for the job it is actually used at, not as a scaled copy of the
   other.
2. **Show the mechanism, don't describe it.** The instrument bar, the escapement
   bezel, the real grade maths. The app demonstrates rather than claims.
3. **Local-only is a feature.** Everything works on a plane. Export is the escape
   hatch, never a subscription.
4. **Density is earned, not defaulted.** A wide screen earns more on screen at once
   only where more at once actually helps — analytics and week planning. Capture
   stays thumb-shaped.
5. **Every hand-cut edge is a decision with a reason.** Extending the world to
   desktop means extending its rules, not adding decoration.

## Accessibility & Inclusion

The existing app already commits to: `accessibilityRole` and `accessibilityLabel` on
every interactive element, accessibility labels derived from the same string as
`testID`, live regions on the focus countdown and round announcements, a
`useReduceMotion` path that collapses every animation to an instant assignment, a
font-scale ceiling, and measured contrast ratios on all text tokens (documented at
6.7:1 and above in the theme file). The desktop view must hold every one of these,
and adds keyboard operability, which a touch-only phone surface never needed.
