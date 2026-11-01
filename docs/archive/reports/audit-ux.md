# Marginalia — first-time-student UX audit (v2-improvements, Expo web)

Read-only walkthrough audit of `http://localhost:8099` (Metro dev build, `dev=true&hot=false`) on a
412×915 mobile viewport, `deviceScaleFactor: 2`, touch enabled, driven like a first-time student.
This file and `.shots/ux-audit/**` are the only things this audit created. **No `src/**` file was
touched.**

**Gate: FAIL (web).** One blocking finding — **UX-1**: the tour and the Today screen both teach
"the + adds anything… it is the only way in", but the web build suppresses the + FAB entirely, so a
first-time web student has to discover the un-mentioned "Week → + Class" / "To-do → New task"
buttons on their own. Everything else in the eight-item walkthrough completes. On native (where the
FAB renders) this audit would pass; the gate is FAIL for the build it was run against.

---

## Method

- Every "tap" is `mouse.move` → `mouse.down` → ~80 ms → `mouse.up` (React Native Web's Pressability
  answers on **pointerdown**; `click()` does nothing). Long-press = down → 700–900 ms → up. Scripts
  live in `tools/ux-audit/*.mjs` and share `tools/ux-audit/lib.mjs`.
- The web repo is in-memory: every walkthrough item ran in a **fresh browser context** so demo data
  resets between items (reset-on-refresh itself is excluded from findings per the audit brief).
- Screenshots: `.shots/ux-audit/01–106` in walk order (walkthrough = 01–96; DOM/behaviour probes =
  98–104; the swipe check = 105–106). `page.on('console')` and `page.on('pageerror')` were attached
  in every context; see the console section.
- React Native Web specifics the harness had to respect (these are **not** app bugs): `testID`
  surfaces as `data-testid`; the Book navigation keeps hidden screens mounted, so many selectors
  match a 0×0 duplicate node before the visible one (verified in probe 98: two
  `data-testid="discrete-mathematics"` buttons, the first with `w=0,h=0`); controls below the page
  fold must be scrolled into view before a pointerdown will land on them.

## Coverage

| # | Walk item | Reached? | Where it stopped / evidence |
|---|-----------|----------|------------------------------|
| 1 | Onboarding — 5 screens, Next/Back, dots, Skip | ✅ full | Both paths completed: tour Next×4 → "Start" lands on Today (shots 01–06); Skip in a second fresh context lands on Today (07). Counter "n / 5" and dots render; DOM overflow scan found no clipping. |
| 2 | Add class via the + FAB | ✅ (via the real web path) | The FAB itself **does not exist on web** — first attempts died there (shots 08–13; probe 14/15: `fabExists:false`). Completed via the only web entry points: Week → "+ Class" → day chip → Save; new block confirmed in DOM (`"Intro to Economics, Sat 09:00 to 09:50"`) and on screen (shots 74–77). See UX-1. |
| 3 | Add assignment + due date → confirm on To-do | ✅ full | To-do → "+ New task" → title "Lab report 4" → due preset → Add → toast "Assignment added · due Today · 13:xx" → card visible under "Today · 2" (`aria-label:"Lab report 4, due Fri 13:50"`) — shots 70–73. |
| 4 | Attendance: tap once, long-press, day row | ✅ full | Today row tap opens the 7-choice sheet (21–22); day-level "Mark day" (24); Week block tap (25); long-press on Today opens **EDIT CLASS** instead of a change sheet (46); Grades grid: one tap marks (67), second tap refused (68), long-press opens the change sheet (69). See UX-3. |
| 5 | Focus timer: dial drag + a11y, start, tick, end, save, Stats | ✅ full | Dial drag 25→5 min (51); dial exposes `role=slider` but no value and ignores arrow keys (52, UX-5); start → live countdown, 0 reloads (53, 56, 59); end ≥60 s → "Saved 1 min of focus" (57, 60) and Stats "Focus heatmap" moves 15h 40m → 15h 41m (49/55/58/61). End <60 s gives no feedback at all (54, UX-2). |
| 6 | Grades: read, add a mark, attendance grid | ✅ full | "+ Mark" → Add mark sheet → "Quiz 3", score raised → Save → row appears ("Quiz 3 · 10% · 73", average 81.7 % → 81.5 %) — shots 62–65; grid behaviours 66–69 (see #4). |
| 7 | Stats: every card + one control | ✅ full | All cards dumped and screenshotted (78–83): rings, focus/tasks heatmaps, two 24 h histograms, focus-by-subject, attendance bars + 4-week heatmap, totals-vs-goals, mark history, reminders ("60 scheduled in the next 14 days · 15 waiting"). Subject chip switch verified (sub "Intro to Economics" → "Discrete Mathematics", shot 84). |
| 8 | Settings ≥5 pages, flip one setting, back | ✅ full | Look & feel → Clock face (deeper) → back → back; Reminders; Sound & haptics; Data & export; Diagnostics (shots 86–92). Theme flip: Look & feel → Theme & palette → "Dark" — **the app behind the sheet goes dark live** (shot 94), restored with "Cream" (shot 95 background). Every back used the sheet's own back chevron. |
| 9 | "Show the tour again" replay | ✅ full | Settings root → "Show the tour again" → tour page with "Run it now" and "You finished build 1 of it" (95) → tour re-opens at "1 / 5" with Skip/Next/dots (96). |
| + | To-do swipe gestures (teached in tour + list header) | ✅ tested extra | Mouse drag right completes ("…, done" + "Undo"-style Done toast), drag left removes the card and shows an "Undo" toast (shots 105–106). Works on web; not a finding. |

Not reached / deliberately not tested: native-only behaviours (real notifications, haptics, grain
fidelity — excluded by the brief); Data & export download buttons and the destructive Reset (armed
state only read in source, never triggered — out of walkthrough scope); the notification-permission
prompt (web build does not request it).

---

## Findings

### UX-1 — The tour and Today teach a "+" button that does not exist on web — **High (blocking)**
- **Screenshots:** `.shots/ux-audit/15-today-no-fab.png`, `14-probe-fab-context.png`, `96-tour-replayed.png`, failed first attempts `08–13`.
- **Repro:** fresh load → Skip the tour → look at Today. Then replay the tour (Settings → Show the tour again).
- **Observed:** Today's empty state says *"Nothing due. Tap + to add an assignment."* (`src/screens/Today.tsx:356`) and tour screen 1 teaches *"**the +** adds anything — an assignment, a class, a mark, a note. **It is the only way in.**"* while drawing a + FAB on the mocked phone (`96-tour-replayed.png`). On the web build there is no FAB anywhere: `src/ui/Overlay.tsx:56` renders `Platform.OS === 'web' ? null : <Fab …>`. DOM probe: no `data-testid="fab-add"` (`fabExists:false`). The only add entries are two un-taught buttons — Week's "+ Class" (`src/screens/Week.tsx:88`) and To-do's "+ New task" (`src/screens/Tasks.tsx:39`) — plus the Grades "+"/Mark buttons.
- **Expected:** the app a student is taught matches the app they get; every platform the tour plays on has a reachable "+", or the copy names the real entry points.
- **Fix:** render the FAB on web too (it is the taught primary entry), or drop the FAB from the tour art/copy on web and name the real buttons ("Week → + Class", "To-do → New task"). The same claim also lives in `src/sheets/Settings.tsx:318` (tour description).

### UX-2 — Ending a focus session under 60 s is silently discarded — **Medium**
- **Screenshot:** `.shots/ux-audit/54-focus-ended-toast.png` (End pressed, no toast, no change).
- **Repro:** Today → header glyph (`data-testid="open-focus"`) → Start → wait ~10–30 s → "End session and save".
- **Observed:** nothing happens — no toast, no ring movement, no Stats change. `finish()` in `src/store/store.ts:234-238` returns `null` when `focusElapsedMs < 60_000`, and no UI communicates the threshold.
- **Expected:** at minimum a toast explaining the cut-off ("Sessions under a minute aren't saved"), consistent with the app's otherwise thorough toast language.
- **Fix:** in `timerFinish`, toast the discard reason when `focusElapsedMs < 60_000` (and consider surfacing the 60 s rule on the Focus screen).

### UX-3 — "Attendance is one tap and then a hold" is only true on the Grades grid — **Medium**
- **Screenshots:** Today tap → `21`, `22`; Today long-press → `46`; Week tap → `25`; Grades tap/hold → `67`, `68`, `69`; tour copy → `96` and `src/sheets/Settings.tsx:318`.
- **Repro:** (a) Today → tap a class row; (b) Today → long-press the same row; (c) Grades → tap/hold an attendance cell.
- **Observed:** on Today/Week, one tap only *opens the chooser sheet* — the row stays "not marked yet" until a choice is picked (a11y label evidence). Long-press on Today opens the **"EDIT CLASS"** meeting editor (`src/screens/Today.tsx:329` `onLongPress` → `{ t: 'meeting' }`), not an attendance-change sheet. Only the Grades grid behaves as taught: one tap marks immediately (`AttCell` `onTap → act.setAtt`), long-press opens the change sheet (`src/screens/Grades.tsx:38-39`).
- **Expected:** the tour's one-line rule should hold on the surface a student meets first (Today), or the tour should say the rule differs by screen.
- **Fix:** either make Today's single tap cycle/commit a default mark (with the sheet as long-press), or adjust the tour sentence to name both behaviours ("on Today a tap opens the choices; on the Grades grid it stamps Here right away").

### UX-4 — On Today, the bottom class row sits under the tab bar at rest — **Low**
- **Screenshot:** `.shots/ux-audit/06-onb-after-start.png` (default scroll position).
- **Repro:** land on Today after onboarding; measure the last visible class row vs the tab bar.
- **Observed (DOM):** rows at y ≈ 819–883 while the tab bar occupies y = 841–897 — the last row's lower ~40 px is behind the bar and its tap target competes with the tab bar's (min 56 px tall).
- **Expected:** list content scrolls clear of the fixed tab bar (bottom inset ≥ tab-bar height).
- **Fix:** give the Today (and Week/To-do/Grades) `contentContainerStyle` a bottom padding equal to the tab bar height + safe-area inset.

### UX-5 — The Focus dial is a `role="slider"` that exposes no value and ignores the keyboard — **Low**
- **Screenshot:** `.shots/ux-audit/52-focus-a11y-action.png` + DOM dump in `tools/ux-audit/06-timer.mjs` output.
- **Repro:** open Focus; inspect the dial node: `role=slider`, `aria-label="Focus minutes. Swipe up or down to change."`, **no `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/`aria-valuetext`**; focus it and press ArrowUp/ArrowDown — the minutes do not change (only a pointer drag on the dial does).
- **Expected:** a slider announces its current value and supports the platform's standard value-change keys.
- **Fix:** map the dial's minute state to `aria-valuenow`/`aria-valuetext` (e.g. "25 minutes") and handle `onKeyDown` arrows (±5 min) — the drag math already exists.

### UX-6 — Horizontal chip strips clip their tail at 412 px, and a mouse drag on a chip selects it instead of scrolling — **Low**
- **Screenshots:** due-preset strip `.shots/ux-audit/101-probe-preset-strip.png`, `102-probe-preset-tapped.png`, `104-probe3-strip-positions.png`; Stats rings `.shots/ux-audit/78-stats-1-glance.png`.
- **Repro:** To-do → "+ New task" → look at the "Due" chip row.
- **Observed (DOM, probe 104):** the preset strip is 1145 px wide inside a 380 px window (`overflow-x:auto`); at rest a student sees only None / In 1 h / In 3 h / When I get home / part of "Tonight 21:00" — **Tomorrow 08:00, Tomorrow 17:00, Friday 17:00, Next Mon 09:00 and "Pick…" sit at x = 509…1131**, past the right edge. The strip does scroll (a horizontal wheel moved it 400 px; `scrollIntoView` also works, probe 102), but (a) there is no visual affordance beyond the cut chip, and (b) a mouse *drag* starting on a chip does **not** scroll the strip — RNW fires that chip's `onPress` on release even after a 300 px drag (probe: a horizontal drag starting on "Pick…" opened the day strip and set the due). The Stats "At a glance" rings show the same pattern (4th ring "Focus streak" clipped).
- **Expected:** the primary due presets a student needs ("Tomorrow…", "Friday…") should be reachable without knowing the strip scrolls, and a drag gesture on a chip should not commit an unrelated preset.
- **Fix:** wrap the most-used presets first and add a fade/edge hint, or let the strip wrap to two rows on narrow widths; consider `touch-action: pan-x` on the strip so drags scroll instead of pressing.

### UX-7 — Uncaught `NotAllowedError` from audio on first load — **Low**
- **Console:** `PAGEERROR: NotAllowedError: play() failed because the user didn't interact with the document first` — reproduced on **every fresh context's first load**, before any tap.
- **Expected:** no uncaught page errors on load, even benign ones (browsers block autoplay; the app should catch the rejection — `src/services/audio.ts` `play()`).
- **Fix:** `.catch()` the `play()` promise (or gate it behind a user-gesture flag) so the autoplay rejection never surfaces as an uncaught error. *Note: the brief excludes "no sounds on web" as a bug; this is reported only because it is an uncaught exception, not because sound is missing.*

### UX-8 — React dev warning `transform-origin` → `transformOrigin` on every run — **Low (dev-only noise)**
- **Console:** `Invalid DOM property 'transform-origin'. Did you mean 'transformOrigin'? React` — logged on every page load/run.
- **Expected:** clean console in dev so real warnings stand out (this audit had to discount it in every run).
- **Fix:** find the style object passing the DOM prop (likely a hand-written style with `'transform-origin'`) and use `transformOrigin`.

### Environmental one-offs (recorded, not counted as app findings)
- `Blocked call to navigator.vibrate…` — console warning on web in every run; haptics-on-web is excluded by the brief.
- `PAGEERROR: ReferenceError: live is not defined at AttendanceGrid (…Grades.bundle…)` — appeared once in the whole audit and did **not** reproduce across ≥6 later Grades runs (including two full mark-save runs); most plausibly a mid-audit HMR artifact — other sessions were committing into this working tree while the audit ran (`git log` 11:45–11:46). Flagged for the fix pass to confirm against a cold build.
- `Error: unknown colour token #FFFBF1` — appeared once, coinciding with a mid-run full page reload back to onboarding; same HMR/concurrent-commit caveat. `reports/audit-code.md` (M1) independently suggests a dev-only throw for unknown colour tokens.

## What a first-time student would misunderstand

1. **"The + adds anything… it is the only way in" — there is no + on web** (UX-1). The tour literally draws one; Today's empty state repeats it. A web student is stranded until they randomly open Week or To-do.
2. **"Attendance is one tap and then a hold"** (UX-3) — true on Grades, false on Today (tap = open a 7-option sheet; hold = edit the class's time/room). Same gesture, three different stories.
3. **A focus session shorter than a minute just… doesn't happen** (UX-2). No word is said; the timer ring, the toast and Stats all stay silent.
4. **Half of the due-date presets are invisible** (UX-6). "Tomorrow 08:00" and "Pick…" exist but live past the right edge of a strip that gives no hint it scrolls — and if you try to drag-scroll it with a mouse, you instead select whatever chip your press started on.
5. **The dial looks draggable but a keyboard/SR user is told nothing about its value** (UX-5): "Focus minutes" with no number, and arrows do nothing.
6. **The tour is written for a phone, not this build**: "Your phone, not a website", "everything is one file on this phone" — read on a desktop browser alongside the missing FAB, it undercuts trust that this is the same app.

## Console-error inventory (deduplicated, tied to steps)

| Error | When | Count | Verdict |
|---|---|---|---|
| `Blocked call to navigator.vibrate…` | every context, first interaction | all runs | Excluded by brief (haptics on web) |
| `PAGEERROR: NotAllowedError: play() failed…` | first load of every context | all runs | UX-7 |
| `Invalid DOM property 'transform-origin'…` | every load | all runs | UX-8 |
| `PAGEERROR: ReferenceError: live is not defined (AttendanceGrid)` | once, during a Grades run | 1 | Environmental (HMR/concurrent commit); re-check on cold build |
| `PAGEERROR: Error: unknown colour token #FFFBF1` | once, with a mid-run reload | 1 | Environmental; cf. audit-code.md M1 |

No other page errors or console errors appeared in any of the 12 walkthrough/probe scripts.

---

## Reproducing this audit

```bash
# dev server already running at :8099 — do not restart it
node tools/ux-audit/01-onboarding.mjs        # item 1   (SHOT_BASE=1 …)
node tools/ux-audit/04-attendance.mjs        # item 4
node tools/ux-audit/06-timer.mjs             # item 5 (part 1)
node tools/ux-audit/07-timer-confirm.mjs     # item 5 (part 2)
node tools/ux-audit/08-timer-end.mjs         # item 5 (part 3)
node tools/ux-audit/09-grades.mjs            # item 6   (SHOT_BASE=62)
node tools/ux-audit/10-add-flows.mjs         # items 2–3 (SHOT_BASE=70)
node tools/ux-audit/11-stats.mjs             # item 7   (SHOT_BASE=78)
node tools/ux-audit/12-settings.mjs          # items 8–9 (SHOT_BASE=86)
node tools/ux-audit/13-swipe.mjs             # extra    (SHOT_BASE=105)
# probes: probe-fab, probe-sheet, probe-sheet2, probe-preset(1–3), probe-chip (shots 98–104)
```

Scripts `02-add-todo.mjs` and `03-add-class-task.mjs` are the **failed first attempts** whose stop
points are recorded in the coverage table (item 2: no FAB on web; item 3: sheet controls below the
fold). They are kept as evidence, not as working flows; `10-add-flows.mjs` is the passing version.
