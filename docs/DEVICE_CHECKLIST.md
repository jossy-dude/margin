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
