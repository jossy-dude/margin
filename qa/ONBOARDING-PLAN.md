# ONBOARDING PLAN — A4

Agent A4. Owns: `src/screens/Onboarding.tsx`, `src/ui/onboard/**`, `src/test/onboarding.test.ts`,
`src/domain/defaults.ts`, this file, and `qa/HANDOFF-A4.md`.
Everything not in that list that this plan needs is a **handoff**, not an edit.

---

## PART 1 — What the app actually is

Everything below was read out of the source, not assumed. Where I say "the app draws X at Y",
X and Y are the real numbers in the real file.

### The surface

A spiral-free ruled notebook page. `ui/PaperBg.tsx` is three stacked layers: a base colour, a
ruling pattern (dots on an 18 px grid / grid on 20 / ruled on 32 with a red margin rule at x=46),
and a repeating grain tile (opacity `c.grain × 0.8` light, `× 0.55` dark). Two palettes
(`refined` = the warm cream, `original` = v10's cooler gray) × light/dark, plus an accent pen that
can be warm sienna, graphite, red or blue. Refined light: `paper #FAF4E6`, `card #FFFBF1`,
`ink #2A241C`, `mut #665B4B`, `acc #8A4B27`. Six fonts, and every string in the app picks one on
purpose: **Permanent Marker** for titles and numbers, **Caveat / Caveat Bold** for handwriting,
**Newsreader italic** for captions and prose, **Special Elite** for anything that counts.

Cards are `HandBox`: a real closed `handPath` (CSS elliptical radii through `scaleRadii`, plus a
low-frequency seeded wobble so neighbouring points move together and the edge reads as hand-cut
rather than as noise), filled with card colour, stroked in ink, with a hard offset shadow at
`translate(2.4 2.8)` at 16% — the same "small offset shadow" every card in the app has.

### The chrome, exactly

- **Bottom nav** — drawn by `navigation/Book.tsx`, not by a screen. One `HandBox` with
  `corners={RS}`, `sw={2}`, `amp={1.6}`, `minHeight: 64`, holding five tabs: **Today, Week, To-do,
  Grades, Stats** with icons `today / week / tasks / grades / stats` at 23 px. The selected tab gets a
  52×30 accent pill (`hexA(acc, 0.2)` fill, 1.5 accent border) behind the icon and an accent label.
  It floats 12 px from the sides, sits `navInset(inset)` above the bottom, and it **hides on Focus
  and while the keyboard is up**.
- **The `+` FAB** — `ui/Overlay.tsx`, bottom-right, 62 dp, `corners={h:[34,30,34,30], v:[30,34,30,34]}`,
  `amp={1.8}`, `sw={2.2}`, accent fill, 32 px plus. Hidden on Focus and while the keyboard is up.
  It opens the Add sheet: eight tiles — **Assignment, Exam, Reading, Project, Class, Mark, Note,
  Subject** — and a ninth button, "Start a focus session".
- **The gear** — `screens/common.tsx` `Page` puts a 46 dp gear at the top right of *every* page, and
  it opens the Settings sheet. The same gear is drawn on Focus at the top right of the scrapbook.
- **The undo toast** — an ink-filled `HandBox` with the message and, when the action is reversible,
  an accent `Undo` button. 6 s for an undoable toast, 2.6 s otherwise.

### The six screens, as they actually behave

1. **Today** — marker date, greeting that follows the hour (`Still up` / `Good morning` / …) plus
   your name; a 124 dp **clock face** you tap to pick a new one; a serif "In class" / "Next up" line
   with the live next class; a dark **command-deck slab** holding the `DayBar`, which comes in four
   shapes — *Bookshelf* (one spine per class, the current one filling), *Sight glass* (the day as a
   filling tube), *Trace* (a pen line drawn through your classes), *Ticker* (a countdown in
   typewriter digits); a "This week" row of seven day cells, each with a dot per class, and a
   **Mark day** ghost button; the picked day's class list, where **tap a class → the attendance
   status sheet, long-press → edit the class**; a taped strip of pinned **Notes**; and **Due soon**.
2. **Week** — the real timetable grid: seven columns, hour rules, class blocks, a red "now" line,
   due-date flags dropped into the grid at their hour, arrows to step a week either way.
3. **To-do** — a `RunningTimer` card when a round is armed, a search field, **All / Open / Done**
   and **By date / By priority / Newest** chips, a subject chip strip, and tasks grouped
   **Late, Today, Tomorrow, This week, Later, No date, Done**. The page's own subtitle is the
   instruction: *"swipe right to finish, left to crumple."*
4. **Grades** — one card per subject: name, room, teacher, the weighted total as a marker numeral and
   a letter; the goal line spelled out as *"For 85%: average 82% on the remaining 60%"*; the marks
   list with weights and a **curve** stepper (±20); and the **attendance grid** — a horizontally
   scrolling strip of 28 dp cells with 3 dp gutters. `AttCell` does exactly two things:
   **tap an empty or inferred cell → mark it Here (✓), tap a marked cell → denied shake**, and
   **long-press → the status sheet** (Here / Late / Absent / Sick / Cancelled). A **Lock** toggle
   freezes the whole grid so nothing can change by accident.
5. **Stats** — rings, a focus heatmap, a tasks-finished heatmap, two 24-hour histograms, bars by
   subject, attendance bars, a 28-day attendance heat row per subject, grade bars, a mark history
   line, and the reminder count. Its own empty-state copy is honest about this.
6. **Focus** — a full-bleed scrapbook photo (`journal-page.jpg`) on a 440×1001 canvas scaled by
   `width/440`. A taped task card with `swap task`. The **dial**: a knurled bed ring with 60 lines, a
   pointer hand, a round hand-cut paper hub reading `mm:ss` in Special Elite, drag to set minutes in
   **5-minute detents** between 5 and 240, `detent-1..4` by velocity, a bump at each limit, and
   TalkBack increment/decrement as its non-gesture path. Presets 25/45/50/90 and a Flow switch. A big
   **Start**. A `break · 5 min` chip that unlocks after 5 minutes of focus, and a taped round
   sticker that wiggles every 5 minutes and **swings off the page** when the break ends. A
   **ROUND DONE n** stamp that presses down with a real overshoot. The margin note, verbatim:
   *"focus doesn't happen by accident"*.

### The app's motion vocabulary — what I am allowed to reuse

This matters more than anything else here, so it is worth writing down exactly.

| Gesture / event | What actually happens | Where |
|---|---|---|
| page change | translateY −48, translateX +30, tilt 3.8° → 0, scale 1.028 → 1; **200 ms** `Easing.bezier(0.2, 0.9, 0.25, 1)`; a shadow veil fades 0.24 → 0 and is gone by 70% of the curve; **no opacity on the page itself** (perf) | `navigation/Book.tsx`, `navigation/window.ts` |
| sheet up / down | `withTiming(0, 280 ms, out(cubic))` / `withTiming(H, 210 ms, in(cubic))` | `ui/Sheet.tsx` |
| swipe right, commit | slide to 8% width over 120 ms, then `withSpring(0, {damping: 16})` | `ui/Swipe.tsx` |
| swipe left, crumple | scaleX/Y 1 → 0.3 and rotate → 16° across the first half, creases fade in, then 330 px of fall + fade over 1100 ms `linear`; **crumple sound, thud 620 ms later** | `ui/Swipe.tsx`, `services/fx.ts` |
| stamp press | `withTiming(1, 460 ms, Easing.bezier(0.2, 1.5, 0.3, 1))` — a real overshoot — hold 1500 ms, fade 400 ms | `screens/Focus.tsx` |
| attendance mark | scale 1 → 1.25 → 1 over 90 ms + 160 ms; denied is a 3 dp shake, 40/70/40 ms | `screens/common.tsx` |
| toast | `FadeInDown` 220 ms in, `FadeOutDown` 180 ms out | `ui/Overlay.tsx` |
| break sticker | swing 200/240/220/200/160 ms, hold 1000 ms, then fall 1050 ms `in(quad)` with a `sin(3.2π)` flutter and 160° of rotation | `screens/Focus.tsx` |
| bar fill / trace | 900 ms `out(cubic)`; the trace draws itself with `strokeDashoffset` | `ui/DayBar.tsx` |

`fx` gives me `page / swipe / crumple / stamp / denied / done / undone / chime / toggle / select /
tap / detent / bump / start / clack / blip / roundDone / breakStart / nudge / peel / fall`, each one
sound plus haptic, each respecting its own toggle.

### The voice

Plain, dry, quietly wry, no exclamation marks, and it states the cost of things.
*"Hold a class to mark it · hold a day for the whole day."* · *"Nothing due. Tap + to add an
assignment."* · *"focus doesn't happen by accident"* · *"Tight: needs ~1h 30m, you have ~40m free
before it is due."* · *"Tap an empty cell once to mark it. After that, long-press to change it."* ·
*"Locked: nothing can change by accident."* · *"You finish on-time tasks about 8 h before they are
due."* · *"The phone has stopped asking. Only its own settings screen can turn this back on."*

### The five things a new user genuinely cannot guess

Everything below is invisible from the outside, and each one costs real data or real time if missed.

1. **Everything is on this phone.** No account, no sign-in, no server, no network. Consequence the
   user must know: reminders further out than ~14 days only exist once the app has been opened.
2. **Attendance is tap-once-for-Here and long-press-for-everything-else**, and a second tap on a
   marked cell is *refused*, which looks broken if you don't know it is deliberate. There is a Lock.
3. **The two swipe directions mean opposite things**, and left is destructive — with an Undo toast
   that saves you if you didn't know either.
4. **The Focus dial is drag-only and steps in 5 minutes.** There is no visible ± on it anywhere in
   the app; the only non-gesture path is a TalkBack action. Nobody will ever find it by looking.
5. **The `+` is the only way to add anything**, and it is a *single* button for eight different
   kinds of thing — assignment, exam, reading, project, class, mark, note, subject.

Two more that are real but do not need a screen: the gear is on every page and Settings previews
live, and Stats is near-empty on day one by design.

---

## PART 2 — v1 of the plan

**Five screens.** Each is one hand-cut card on the notebook page, with real artwork drawn in the
app's own vocabulary, real copy in the app's own voice, one heading and at most three lines of body.

| # | Screen | Teaches | Artwork | Motion |
|---|---|---|---|---|
| 1 | **Your phone, not a website** | Local-first. No account, no server, no network. The app is a file on this phone. | Three hand-cut sheets fanned at −3° / 0° / +2.5°; the top one carries the wordmark, a taped day-cell strip, a taped clock thumbnail | The top sheet drops in (the app's own placement) then the tape presses (stamp curve at ⅓ duration) |
| 2 | **The bottom of the page** | The five tabs, the `+`, the gear — the frame every later screen sits in | The real nav bar drawn to `Book.tsx`'s exact metrics, the real 62 dp FAB, the real gear, three hand-drawn leader lines | Nav drops in, `+` presses (1 → 0.94 → 1 with the stamp curve), the accent pill hops Today → To-do → back |
| 3 | **Right finishes, left crumples** | The two swipe directions, and that Undo exists | A real TaskCard shape inside the two ghost affordances `Swipe.tsx` itself draws, plus a real toast | The app's own sequence: drag right 30%, spring back, tick; then drag left, crumple over 1100 ms, fall; then the toast rises |
| 4 | **Tap once, then hold** | The attendance grid's two-verb rule and the Lock | Nine real `AttCell`s at 28 dp with 3 dp gutters, the real header and hint, a hand-drawn ring on one cell, the status sheet peeking with the four real chips | Cell pulses (the app's 90/160 ms), ✓ fades in, dashed → solid; then a hold-ring draws and the sheet rises in 280 ms |
| 5 | **Drag the ring** | The dial: drag, 5-minute detents, presets, and that a break unlocks after 5 minutes | The real dial geometry (`D=282`, `C0=141`, `BED_RING`, 60 knurl lines, the exact pointer path, the hand-cut hub), the four real presets, Flow, and the app's own margin note | **Live**: the ring is a real `Gesture.Pan`, 5-min detents, `fx.detent(v)` per step. Not a video. |

Order: the promise first (nothing else lands if the user doesn't trust it), then the frame, then the
two *accidental* gestures, then the hardest deliberate one. Replay from Settings; Skip on every
screen. Under reduce-motion every entrance collapses to its end state and the 150 ms cross-fade
between pages is the only motion left.

---

## PART 3 — Attacking v1

The owner asked for this explicitly, so here it is honestly, not decoratively.

**1. Five screens is four too many, and two of them are the same screen.** Screens 3 and 4 are both
"a hand does something to a card". A user scrolling through a tour sees five cards and learns one
idea twice. Either merge them or cut one. *This was the strongest objection and it is right.*

**2. Screen 1 is a promise, and nobody needs a screen for a promise.** "Your data is on your phone"
is one sentence. Spending a whole screen — and a whole screen's worth of the user's patience — on
it, before showing them a single thing they can do, is how carousels become skippable. The promise
belongs on the *last* screen, where it is the reason the tour ends, or in the first line of screen 1
with the rest of screen 1 being something they can *use*.

**3. Screen 2 (the anatomy) risks being a diagram.** A drawn nav bar with three leader lines is
the single most common failure of app onboarding: it is informative and completely inert. The one
thing that would fix it — actually letting them tap the tabs while the tour is up — is out of scope
because the navigator is not mounted. So screen 2 is the most likely to be skimmed, and it is
currently first after the welcome. That is a bad trade: the frame is important but it is not
*urgent*.

**4. The tap-once/long-press detail is too subtle to survive a static frame.** On screen 4 the
distinction between "one tap" and "hold" is the entire lesson, and it is expressed by a *duration*
that nobody can see in a still. It needs to be demonstrated twice, slowly, with the two outcomes
drawn side by side, or it will be missed by 90% of users — and if it is missed the user marks a
whole semester's attendance to Here by tapping.

**5. "9 open · swipe right to finish, left to crumple" already exists in the app.** The To-do page's
own subtitle teaches the swipe. Duplicating it in the tour is the tour doing the app's job, and it
is the clearest padding in v1. What the subtitle *cannot* teach is the Undo toast and the fact that
the left swipe is destructive — that is the part worth a screen.

**6. Screen 5's live dial is right, and it introduces a rule I did not state.** If one screen is
interactive then the tour needs an affordance that says "you can touch this", or the user will try
to drag the other four and feel broken. And if the dial is live, the tour must not *require* it —
Next always works, or a user who cannot work the gesture is stranded on screen 5.

**7. The tour never says what Stats is for, and a day-one tour that omits it will look like the app
is hiding something.** One line is enough. Silence reads as an oversight.

**8. Everything is text-and-drawing. Nothing is unmissable.** At 411 dp the type is right but the
screens are flat: a title, a paragraph, a picture. The app's own delight is *paper* — things
pressed, taped, crumpled, stamped. A tour that never actually presses or tapes anything is
describing the app's personality rather than showing it.

**9. Nothing was tested at 320 dp or at font scale 1.3**, and the artwork on screens 4 and 5 is
built from fixed-size cells copied out of the app (28 dp cells, a 282 dp dial). On a 320 dp screen
a 282 dp dial plus four presets is an overflow, and I copied those numbers without asking whether
they fit.

**10. Reduce-motion currently means "nothing moves", which means "the lesson is not taught".** On
screen 3 the whole point is the crumple; under reduce-motion the user would just see a static card
and a toast. The fix is not "add a fade" — it is to draw the *end states* so the screen is still a
complete sentence without motion.

**11. Bounce.** The reel of ideas I rejected reads as thorough but it is not free: "5 tabs, one per
screen" is 4 extra screens of near-identical artwork that teaches nothing the tab labels do not.

---

## PART 4 — v2 of the plan, after the critique

Changes: **five screens → five screens, but reordered and rewritten**; the welcome and the anatomy
merge; the swipe screen is rebuilt around Undo rather than around the swipe; attendance is split
into two demonstrated states; the dial gets a visible affordance and a non-blocking hint; Stats gets
one line; and every fixed-size artwork is made width-derived.

### The five screens, final

**1 — "Everything here is on this phone."**
Heading: **Your phone, not a website.** One card, fanned sheets, the wordmark, a taped day strip, a
taped clock. Body: *"No account, no sign-in, no server. The whole planner is one file on this phone,
and the reminders are scheduled on it too — which is why it asks, once, to send them."*
And on the same card, the **bottom line of the page**, the thing that was screen 2: the real nav
bar drawn to `Book.tsx`'s metrics with the five real labels, the real 62 dp `+` sitting on it, and
the gear in the corner — with one line each: *"five tabs along the bottom"*, ***"+" adds anything,
and it's the only way in"***, *"the gear changes anything, and shows you the change before you
save it"*. Two ideas on one card because they are both *the map*, and because the map is the one
thing every later screen needs and the one thing a first-time user most wants. The leader lines go;
the labels stay. Three tabs are named, all five are drawn.
*Motion:* the top sheet drops in with the app's own placement; the `+` presses once. *That is all* —
the animation is not the point of this screen and I say so by not pretending otherwise.

**2 — "Nothing here can be lost."**
Heading: **Right finishes. Left crumples. Undo puts it back.**
The app already says the first half in To-do's own subtitle, so this screen spends its whole budget
on what is not said anywhere: the crumple is **real** — the paper squashes, balls up and falls off
the table — and **6 seconds later a toast offers the card back**.
Artwork: a real TaskCard between the two ghost affordances `Swipe.tsx` draws itself, one real ink
toast with a real `Undo` button, and a hand-drawn bracket around the toast labelled *6 seconds*.
*Motion:* the app's exact sequence — drag right 30%, `withSpring(0, {damping: 16})`, tick; then drag
left, `scaleX/Y → 0.3`, rotate 16°, creases in, 330 px of fall over 1100 ms `linear`, crumple sound
and a thud at 620 ms; then `FadeInDown` 220 ms as the toast rises. *Reduce-motion:* the toast is
drawn present and the card drawn at rest, because the sentence "it comes back" has to survive with
no motion at all — which is the critique's point 10, answered by drawing the end state rather than
by fading something.

**3 — "One tap, then hold."**
Heading: **Tap once, then hold.**
This is the one screen that must not be skimmed, because the mistake is silent and cumulative: tap
a marked cell again and nothing happens, and you think the app is broken.
Artwork: **two rows, side by side, both drawn, both labelled.**
- Row 1 — *before*: nine 28 dp dashed cells. The hand-drawn ring is on one. Under it: **"tap"** →
  the cell pulses and fills ✓ in ink.
- Row 2 — *after*: the same nine cells, the marked one solid with a ✓, and a second one ringed.
  Under it: **"hold"** → the status sheet rises with the four real chips — Here, **Late**, **Absent**,
  **Sick** — and an arrow from a cell to the **L** that would be left in amber.
Then the Lock row, one line: *"Locked, nothing changes by accident — and the tap that gets refused
is on purpose."*
*Motion:* pulse (the app's 90/160 ms), dashed → solid, then the sheet in 280 ms `out(cubic)`. Two
demonstrations, not one, because the whole lesson is a duration. *Reduce-motion:* both rows drawn at
their end states, which is already the layout — nothing to do.

**4 — "Drag the ring."**
Heading: **Drag the ring. It stops every 5 minutes.**
*Live, not a video.* This is the only screen a static frame cannot teach, because the app's dial has
no visible ±, no button, and no hint anywhere in the product — a screenshot of it teaches nothing.
*Motion:* a real `Gesture.Pan` on a real dial: 5-minute detents, `fx.detent(velocity)` per step, the
knurl counter-rotating under the finger, the hand sweeping, the Special Elite readout changing, and
the `break · 5 min` chip coming up to full opacity as the break unlocks. Plus the app's own presets
(25/45/50/90) and its own margin note, *"focus doesn't happen by accident"*, verbatim, because it is
already the best sentence in the app.
Answering the critique's point 6: a small dashed caption — **"try it — drag the ring"** — sits under
the dial so the affordance is real, and **Next is never blocked**, so a user who cannot work the
gesture is not stranded; the readout is pre-set to 25 so the screen is a complete sentence before
anyone touches it. TalkBack increment/decrement, mirroring `Focus.tsx` exactly, so the app's own
"every gesture has a non-gesture path" rule holds.
*Reduce-motion:* drag still works — it is input, not animation — only the knurl's counter-rotation
and the readout's settle collapse.

**5 — "That's the whole app."**
Heading: **That's the whole app.**
The last screen is not new material; it is the **promise from screen 1, paid**. A recap of the five
tabs as one line each, one line about Stats (*"Stats fills in over a week — finish something and it
notices"*), and the promise restated in the app's own register: *"Marginalia 1.0 · local-first, no
account, no network needed."* — which is the app's own About line, so it costs nothing and is
already true.
*Motion:* the sheet drops back onto the table with the app's own placement, and the primary button
says **Start**. *Reduce-motion:* instant.

### What I cut, and why

- **One screen per tab (5 screens).** The tab bar *is* the map and its labels are the map. Five
  near-identical screens is the padding the owner's standing rule is about.
- **A reminders / notification-permission screen.** Folded into screen 1's second sentence instead.
  Settings → Reminders is three levels deep but every row carries its own live hint, and the OS asks
  for permission on its own with its own explanation. A screen the user cannot *act on* during
  onboarding is a screen that gets skipped.
- **Notes and the taped notice cards.** They look like sticky notes. Nothing to teach.
- **The clock faces.** The clock is tappable and tapping it opens the right settings page. It is not
  a hidden interaction, it is a button that looks like a clock.
- **Data & export, Reset, Diagnostics.** Settings is path-based and self-navigating; a stranger finds
  them when they want them, and three of them are irreversible.
- **A "how to add a task" walkthrough of the form.** The form is a labelled sheet with `Chip`s and
  `Stepper`s; every control names itself. Covered by "the + adds anything".
- **A progress bar of dots with per-screen microcopy.** The dots stay (they are orientation, and the
  app already uses hand-cut `View`s), the microcopy does not.

### Behaviour, decided

- **Gating.** `Gate` renders `<Onboarding/>` *instead of* `Shell`, so the navigator is never mounted:
  nothing renders off-screen behind the tour (V17) and no gesture can reach the app under it.
- **Persistence.** `Settings.onboarded: number`, a **version stamp**, not a boolean. `TOUR_VERSION`
  lives in `domain/defaults.ts`. `toured(seen)` is `seen >= TOUR_VERSION`. A fresh install has
  `undefined`, so `toured(undefined)` is `false` and the tour shows — no default needed, which is
  exactly why the flag survives `withDefaults` and a cold start without a migration.
- **Cold start.** `hydrate()` writes `ready` and `settings` in one `set`, so there is no frame where
  the tour is judged against stale settings. Mid-tour progress is **not** persisted: a force-quit
  returns you to screen 1. Persisting step-by-step progress is a feature nobody asked for and it is
  how people get stranded on screen 3 of 5 forever.
- **Replay.** Settings → **"Show the tour again"** writes `onboarded: 0`. No extra state, no second
  modal, no `onboardingVisible` field anywhere — the gate is one predicate.
- **Skip.** On every screen, top left, ghost, like the Settings sheet's own back link. Skipping is
  recorded as done; the tour is always replayable.
- **Back.** A ghost chevron button. There is also a swipe-right-to-go-back, which is a platform
  idiom — and it is a *bonus*, because the visible button is the non-gesture path the app's own
  accessibility rule requires.
- **Every screen** has a marker heading with `accessibilityRole="header"`, real prose underneath, and
  decorative artwork marked `accessibilityElementsHidden` so a screen reader reads the sentence once
  and not the drawing. The Next button names its destination ("Next: Nothing here can be lost"), and
  the dots announce "Screen 2 of 5".
- **Dynamic type.** Prose and headings uncapped; every fixed-size cell (the attendance cells, the
  dial's numerals) capped at `FS = 1.4`, the project's own ceiling, for the reason `ui/fit.ts` gives.
  Every fixed-size artwork is width-derived from `useWindowDimensions`, with the dial scaled by
  `min(width, available height) / 440` — the same trick `Focus.tsx` already uses.

### How the artwork is produced

No new assets, no new dependencies, no emoji. Every mark is either an import from the app
(`Txt`, `HandBox`, `Btn`, `Icon`, `Tape`, `Hair`, `FaceThumb`, `handPath`, `RG`/`RS`) or an inline
`react-native-svg` built from the app's own geometry — the nav bar uses `Book.tsx`'s numbers, the
dial uses `Focus.tsx`'s, the crumple uses `Swipe.tsx`'s. Where a shape is only in the HTML
references and not in the app (a spiral binding) it is **not** drawn: the tour must look like the
app, not like the reference.

**The design loop is an HTML render at 411 dp.** `qa/scripts/render.sh html` runs headless Chrome at
exactly this device's real width. Each screen is authored as an HTML mock that reuses the real
palette, the real six TTFs, and a straight port of `hand.ts`'s `outline`/`handPath` algorithm, so
what I look at is the same shapes in the same type. That is my only way to see anything, and I will
not claim to have seen it on a device.

---

## PART 5 — What I will not claim

No device is available, so: **no motion is verified.** Every curve above is the app's own, copied
from the app's own numbers, which is the strongest claim available without a phone — and it is not
the same as having watched it move. Font rasterisation in Chrome is not font rasterisation in
Hermes. `useReducedMotion` is read through the app's own hook and mocked in the render test, so the
reduce-motion *path* is verified by render, not by preference.
