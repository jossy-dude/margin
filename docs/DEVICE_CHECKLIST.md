# Device checklist

Things that can only be judged on a phone. Nothing in this file is verified by any command in this
repo — each step ends with a pass/fail line a human writes the verdict on.

## How to get the build

Pick one, in this order of preference:

1. **Local dev build (this is the expected command):** `npx expo run:android` — the same script as
   `npm run android`. Compiles the committed `android/` project with Gradle and installs it on the
   connected device. Needs `adb devices` to list the phone and a local Android SDK + JDK.
   With the native directory committed, `expo run:android` uses it as-is; it does **not** re-run
   prebuild (that only happens when `android/` is missing, or if you ask for `npx expo prebuild
   --clean`, which regenerates `android/app/src/main/res/` and would drop the hand-kept comments in
   `values-night/colors.xml`).
2. **No phone attached to this machine:** `npx eas-cli build --profile preview --platform android`
   (`eas.json` `preview` = `distribution: internal`, `buildType: apk`) and sideload the APK.
   `production` is an app-bundle for the store, not what we want for a visual pass.
3. `npx expo start --dev-client` + a reload is enough for JS-only changes once a dev build from step 1
   is installed.

Record first, in every section below:

- `adb shell getprop ro.build.version.release` (Android version) and
  `adb shell getprop ro.build.version.sdk` (API level). `W2` behaves differently by version; see its
  notes.

---

## W1 — data safety: writes that land, a migration that heals, a page that fails alone

Changed: data layer + error plumbing + per-page boundary (commit `46c056b`). Each check below fails on
the pre-W1 build in the way its note says.

### W1.1 — two quick writes both survive a restart

Where: Week — the attendance stamps on a class (the audit's own reachable case), or any quick pair of
writes anywhere.

**Do:** stamp attendance on one class, then immediately (within the same second) stamp a second one.
Then kill the app (`adb shell am force-stop app.marginalia.planner`) and reopen it.

- **W1.1a** Both stamps are still there after the relaunch. (Before W1 the second, overlapping write was
  rejected and existed only on screen — gone after a restart.)
  **PASS / FAIL: ______**
- **W1.1b** If a write genuinely fails, a "Couldn't save: …" toast appears and the same failure is listed
  in Settings → Diagnostics under **While saving** (the toast used to be the only trace).
  **PASS / FAIL: ______**

### W1.2 — a first boot killed mid-migration heals on relaunch

**Do:** clear the app's data (Android settings → Apps → Marginalia → Storage → Clear data, or
`adb shell pm clear app.marginalia.planner`). Launch the app and force-stop it within the first second,
while the paper is still coming up: `adb shell am force-stop app.marginalia.planner`. Relaunch normally.

- **W1.2a** The app reaches Today. (Before W1, a kill between the table creation and the version bump
  bricked every later launch — the Fatal screen, whose only button could not recover it.)
  **PASS / FAIL: ______**
- **W1.2b** Repeat the force-stop-on-boot once more; it still reaches Today.
  **PASS / FAIL: ______**

### W1.3 — a page that fails alone (conditional)

Only if you ever see the card **"This page hit a problem"**: it should be a paper + tape card with a
**Try again** button; the tab bar and the other five pages keep working; **Try again** redraws the page;
the failure appears in Settings → Diagnostics under **While running**. (This card has never been seen
rendered anywhere — this is also its first visual proof.)
  **PASS / FAIL: ______**

---

## W2 — native paper: grain tiling + the status-bar band

Changed: `src/ui/PaperBg.tsx` (native texture layers), `src/App.tsx` (`Themed`). No native file moved,
so any build of the current `android/` project contains this work.

### W2.1 — grain tiles, no block

**Look at:** light theme, Today, the whole paper behind the content — all four corners and the very
top edge. Then Settings → texture → **photo**, and scroll a page while the photograph is showing.

- **W2.1a** Texture fills the entire screen at an even density, corner to corner — including the top
  strip behind the status bar area and the bottom strip above the navigation bar; no region is bare
  cream and there is no single dense rectangle anywhere (the old bug was one ~360×405 block in the
  top-left).
  **PASS / FAIL: ______**
- **W2.1b** No visible seam: look along the horizontal and vertical lines where tiles meet (on the
  photo texture, which is busier and shows mistakes first). No faint line, no repeated edge, no
  half-pixel hairline.
  **PASS / FAIL: ______**
- **W2.1c** Density does not change while scrolling — the paper is fixed to the screen, it does not
  slide or jump with the content.
  **PASS / FAIL: ______**
- **W2.1d** Repeat in dark theme (Settings → Look & feel) and at the largest font size you use: same
  three checks.
  **PASS / FAIL: ______**

### W2.2 — texture switch does not flash

Settings → texture, cycle grain → photo → plain → grain, watching the paper itself rather than the
sheet.

- **W2.2a** Each switch cross-fades (~¼ s) — no white/cream flash, no frame with nothing drawn, no pop.
  **PASS / FAIL: ______**
- **W2.2b** With the OS "Remove animations" switch on (Android Settings → Accessibility → Remove
  animations), the same cycle still never flashes to bare paper.
  **PASS / FAIL: ______**

### W2.3 — sheets over a page

- **W2.3a** Open the Add sheet (`+`). The page behind keeps its paper, the sheet has its own paper, and
  the sheet's texture is clipped to the sheet — grain/photo must not spill over the paper margin
  around the sheet.
  **PASS / FAIL: ______**
- **W2.3b** Open the Settings sheet (it mounts two paper layers at once: the peek backdrop and the
  sheet). Both show the texture the setting names; neither loses it or shows a stale one.
  **PASS / FAIL: ______**
- **W2.3c** In the Add sheet, focus a text field so the keyboard opens. The paper behind and around it
  keeps its texture to the bottom edge — no bare strip appears where the window shrank.
  **PASS / FAIL: ______**

### W2.4 — status bar area shows paper, not black

Before the change this was an opaque black strip: `expo-status-bar` was mounted, it never forwards
`backgroundColor`, so React Native sent `setColor()` its own Android default — `window.statusBarColor`
(`@android:color/transparent`) printed without its alpha, i.e. `#000000`. `Themed` in `src/App.tsx` now
names the colour itself: `backgroundColor={c.paper}`.

**Expected, by Android version — record which one you see:**

- **Android 15 or newer** (device is edge-to-edge, `setColor` is ignored by the platform): the strip is
  the app's own paper, so it also has **grain under the icons**, exactly like the rest of the page.
- **Android 13/14** (device is not edge-to-edge, no app view is drawn under the bar): the strip is
  **flat paper, no grain** — `setColor` is what paints it. A slight tone difference between the flat
  strip and the grained paper below it is expected here and is the one thing to judge: is it visible,
  and does it read as a deliberate band? Split the verdict into its own line.

- **W2.4a** Light theme: the strip behind the clock/battery icons is paper cream (#FAF4E6), icons dark
  and legible. **No black anywhere in that strip.**
  **PASS / FAIL: ______**
- **W2.4b** Dark theme: the strip is the dark paper (#3C352C), icons light and legible.
  **PASS / FAIL: ______**
- **W2.4c** On Android 13/14 only — does the flat strip look like a tone step against the grained paper
  below it? (Android version: ______) Describe it in words; do not judge the screenshot.
  **ACCEPTABLE / OBJECTIONABLE: ______**
- **W2.4d** Open a sheet while in light theme and check the strip again — it must not change colour or
  go black when a sheet mounts.
  **PASS / FAIL: ______**
- **W2.4e** Switch theme with the app open: the strip follows the paper immediately, with no frame of
  the other theme's colour.
  **PASS / FAIL: ______**

### W2.5 — cold start

- **W2.5a** Kill the app and start it in dark theme. The launch background and the first React frame
  both read as that theme's paper — no cream/white flash (`values-night/colors.xml` carries the dark
  window background).
  **PASS / FAIL: ______**

---

## W3 — the Focus dial: a see-through face, the time taped below it

Changed: `src/screens/Focus.tsx` and an optional `testID` on the `Tape` primitive in `src/ui/kit.tsx`
(the readout left the face's centre for a paper slip below the dial; the face artwork is now drawn at 0.86
opacity; `subText` and the controls moved down 22 canvas units to clear the slip, so the slip sits lower
and its tape's torn corner stands clear of the dial's feathered rim). No native file moved, so any build
of the current `android/` project contains this work.

**Look at:** Today → tap the focus card (`open-focus`) → the Focus page.

### W3.1 — the face is see-through

- **W3.1a** Light theme: the clock face at the dial's centre shows the page's own paper and grain through
  its guilloché and the two rosette lattices — the artwork is still legible, but it is clearly the page
  underneath it, not a pasted opaque photograph.
  **PASS / FAIL: ______**
- **W3.1b** Dark theme (Settings → Look & feel): the same, on the darkened page. Judge whether the face
  is *legible* in dark specifically — the page under it is much darker, so this is the reading that could
  fail even if light looks right. Name the failing part in words.
  **PASS / FAIL: ______**
- **W3.1c** The face's circular edge feathers into the page in both themes — no hard rim, no visible
  circular clip line, and the progress ring and pointer hand are still fully solid over it (they were
  deliberately NOT faded).
  **PASS / FAIL: ______**

### W3.2 — the label: position and legibility

- **W3.2a** The time sits on a hand-cut paper slip **below** the dial, taped at its top-left, and the
  slip is entirely clear of the face circle — no part of the paper or the tape crosses the face's edge.
  Look specifically at the tape's raised (upper-right) corner against the dial's feathered rim: it must sit
  **clear of the fade**, i.e. you must see bare paper between the corner and the rim, not the corner's edge
  landing inside the soft halo (this was the vision review's worst finding and the reason the slip moved
  down). The countdown's first glyph must also stand clear of the tape's right end.
  **PASS / FAIL: ______**
- **W3.2b** Nothing collides: the slip does not touch the subtitle line beneath it, and the subtitle,
  the preset row (25/45/50/90 + Flow), **Start**, **end session** and **break** all keep their spacing —
  no overlap, no crowding, nothing pushed off the page.
  **PASS / FAIL: ______**
- **W3.2c** At the **largest font size you use** (Settings → text size / the OS font scale), the time on
  the slip is still fully inside the slip's paper and the slip still clears the face circle — the number
  must not overflow the torn edge. (The slip's type does not scale; judge whether that reads as
  deliberate or as broken.)
  **PASS / FAIL: ______**
- **W3.2d** The subtitle line under the slip is still readable at its own size in both themes (it keeps
  its halo).
  **PASS / FAIL: ______**

### W3.3 — the three motion effects have moved, and still behave

- **W3.3a** Start a round with sounds on: each second, the **slip's paper flashes** with the tick — the
  flash is on the paper, not on the face centre.
  **PASS / FAIL: ______**
- **W3.3b** In the last ten seconds of a round, a **red pen border** is drawn round the slip, pulsing.
  It appears on the slip, disappears when the round ends, and never appears while paused.
  **PASS / FAIL: ______**
- **W3.3c** With Flow on, let a round run past its cap into overtime: the **accent colour floods the
  slip** once and drains.
  **PASS / FAIL: ______**
- **W3.3d** Turn on the OS "Remove animations" switch (Android Settings → Accessibility) and repeat
  W3.3a–c: the tick flash is gone, the warn border holds steady without pulsing, and the flood no longer
  animates. Same as the old capsule did — nothing new animates under reduce-motion.
  **PASS / FAIL: ______**

### W3.4 — the drag still sets the minutes

- **W3.4a** In the `set` phase, drag a circle on the dial: the minutes change with the finger, the
  detent tick sounds, and the slip's number follows. Nothing about the gesture's feel changed.
  **PASS / FAIL: ______**

### W3.5 — a finished round is saved, and names the right task

**Look at:** Tasks → long-press (or open) a task → **Focus on this**; confirm the task box on the Focus
page shows that task, then Start, let the round run out (or `end session` after at least a minute), and
open Stats → the session appears under that subject.

- **W3.5a** A round that ran out shows up in the export/Stats as a **completed** session under the task's
  subject. (Settings → Export → JSON: the `Focus sessions` rows now carry `mode` and `completed`.)
  **PASS / FAIL: ______**
- **W3.5b** A round you end early (after ≥1 min) shows up as **not completed** — and if you end it inside
  the first minute, nothing at all is written.
  **PASS / FAIL: ______**
- **W3.5c** The saved row names the task the box was showing (swap the task mid-round first — the row
  must follow the swap, not the task you started from).
  **PASS / FAIL: ______**

---

## W4 — Today's time truth: the countdown, the ranges, the 12/24-hour clock

Changed: `src/screens/Today.tsx`, `src/screens/common.tsx`, `src/screens/Week.tsx`,
`src/screens/Grades.tsx`, `src/sheets/Settings.tsx`, `src/sheets/WhenPicker.tsx`,
`src/sheets/forms.tsx`, `src/domain/time.ts`, `src/domain/types.ts`, `src/domain/defaults.ts` — JS only,
no native file moved, so any build of the current `android/` project contains this work. The non-today
card now prints the class **window** (`09:00–09:50`) instead of a countdown; the countdown is set one
fixed advance per glyph; the header's next-class line prints the time once; and Settings → Look & feel
gained a **24-hour clock** switch.

Already proven headless by `tools/w4-assert.mjs` (web, 412×915): the 26 px digit / 15 px colon advances
hold across real digit changes with the row width unchanged, the picked-day window fits the card with
166 px of air to spare, the 12-hour strings appear on Today and Week and revert, and Today's content
clears the tab bar at scroll-end. This section is only what the phone alone can say.

**Look at:** Today.

### W4.1 — the countdown, at 1×

- **W4.1a** With a class live (the card ticks), read the countdown from arm's length without zooming:
  every digit is unambiguous — the 2s and 3s cannot be confused — and the glyphs do not crowd each
  other (the old −1.7 tracking is gone). Judge at the font size you actually use.
  **PASS / FAIL: ______**
- **W4.1b** Watch a minute boundary (…:59 → …:58): the readout does not shuffle sideways — digits and
  colon keep their places, no per-second jitter. (Web ran at 26 px/15 px; on the phone judge the
  behaviour, not the number.)
  **PASS / FAIL: ______**
- **W4.1c** In the week strip, tap a day that is not today but has classes: the card prints a window
  (`09:00–09:50`), the pill reads **First class**, the unit **first bell**, and the header line above
  the strip still speaks about now. Tap back to today: the live countdown returns.
  **PASS / FAIL: ______**
- **W4.1d** A weekday evening, after the last class (after 14:05): the card shows the finished day —
  **Rest day**, **Free day**, `--:--`, **nothing on** — and the header reads **All done for today**;
  no stale countdown of the class that ended.
  **PASS / FAIL: ______**

### W4.2 — the 24-hour clock switch, on-device

**Look at:** Settings → Look & feel → **24-hour clock** (it ships **ON**; the hint reads *Off prints
8:30 AM instead of 08:30*).

- **W4.2a** Turn it **OFF**: every time the setting reaches prints 12-hour — the Today header and card,
  the day-list rows, the Week page's class blocks and due rows, and the task sheet's due picker and its
  reminder lines. Form: a space and no leading zero (`8:30 AM`, never `8:30AM`).
  **PASS / FAIL: ______**
- **W4.2b** Turn it back **ON**: the same surfaces return to `08:30`; nothing is left half-converted
  (re-check Week and the task sheet).
  **PASS / FAIL: ______**
- **W4.2c** With the clock OFF, force-stop and relaunch
  (`adb shell am force-stop app.marginalia.planner`): the setting is still OFF and times still print
  12-hour.
  **PASS / FAIL: ______**
- **W4.2d** Confirm one real reminder with the clock **OFF**: notification bodies were deliberately not
  wired in this slice (`reminders.ts`, `notifActions.ts` and export timestamps still print 24-hour under
  either setting — W5/W6 own those bodies), so the notification showing 24-hour is **expected**, not a
  bug. Record what you saw.
  **PASS / FAIL: ______**

### W4.3 — the day-list range column

**Look at:** Today's day list, then the same list with the 24-hour clock **OFF**.

- **W4.3a** The range column (`08:30–09:20`, bold, one line) holds its column: no clipping of the
  longest range, no crowding of the course name or the status box beside it, in both clock formats
  (the 12-hour strings are wider, e.g. `10:55 AM–11:45 AM`). The en dash joins the two ends as one
  range.
  **PASS / FAIL: ______**

### W4.4 — scroll-end clears the tab bar

- **W4.4a** Scroll Today to the very bottom: the last content sits fully **above** the tab bar — no row
  half-hidden under it, no tap target competing with the tabs. Repeat on Week.
  **PASS / FAIL: ______**

### W4.5 — midnight, watched live

**Do:** put the phone's clock at **23:57 on a Friday** (switch automatic time off), open Marginalia on
Today, and watch across 00:00.

- **W4.5a** Just before midnight the card shows Friday's finished day (Rest day / `--:--` /
  nothing on; see W4.1d). Just after 00:00 the card is **gone** — the clock stands alone, the header
  reads **No classes today**, and the strip and day section have moved to Saturday. No stale countdown,
  no half-updated heading.
  **PASS / FAIL: ______**
- **W4.5b** The other direction, if you get a Sunday evening: at midnight the clock **gains** the
  **Next up** card counting down to Monday's first class, and the header prints the time exactly once —
  `at 08:30 · in 8 h 29m`, never `at 08:30 · tomorrow 08:30`.
  **PASS / FAIL: ______**

The flips' own math (a 23:50–00:10 overnight window, `fmtDay` at the boundary, `selectedDay` carry,
`nextWhen`'s one-time line) is pinned by `src/test/time-format.test.ts` and `src/test/card.test.ts`;
the steps above are only the phone watching it happen live.

---

## Appending for later workstreams

Add a new `## W<N> — <title>` section at the **bottom**, and number its steps inside that section only
(`W<N>.1`, `W<N>.2`, …). Never renumber an earlier section's steps — someone may already have written
a verdict next to them. Same shape every time: **Look at** (where to be, what to do), the check, then a
`**PASS / FAIL: ______**` line. State the exact build command only if the workstream needs a different
one from "How to get the build" above.

Keep the file to what a human can actually judge by looking: colours, motion, layout, legibility,
feel. Anything a command can prove belongs in the test suite instead.

## Result log

One line per run, newest first.

| date | device / Android | section | verdict | notes |
|---|---|---|---|---|
| | | | | |
