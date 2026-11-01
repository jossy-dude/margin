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

## W5 — reminders that actually ring (Android): exact timing, lock-screen text

Changed: `android/app/src/main/AndroidManifest.xml` + `app.json` (two new permissions), then JS only —
`src/domain/notifActions.ts`, `src/domain/reminders.ts`, `src/domain/types.ts`, `src/domain/defaults.ts`,
`src/services/notifApi.ts`, `src/services/notifications.ts`, `src/store/store.ts`,
`src/sheets/Settings.tsx`, `src/App.tsx`. No Gradle or Java change.

**The APK must be rebuilt and reinstalled** — the two permissions are compiled into the manifest, so a
Metro reload of an already-installed build does not carry them. Use `npx expo run:android` as in "How to
get the build" above; `adb install -r` over the old APK is enough (no uninstall needed).

Already proven headless by `tools/w5-assert.mjs` (web, 412×915): a build with no notification module
says so once on the Reminders row, on the Reminders page and on Delivery status; and the
**Show reminder text on the lock screen** switch round-trips through the store (turned Off, then leaving
the page and returning shows Off — so it is the app's setting, not a slider's private state). This
section is only what the phone alone can say.

**Look at:** Settings → Reminders, then Settings → Reminders → Delivery status, then the lock screen.

### W5.1 — a reminder lands in a window, and says so

- **W5.1a** With notifications allowed and reminders queued, read the Delivery status line under the
  count: it reads `Next one is planned for around HH:MM — give or take 5 min — in N min.`, and the line
  under it says the phone will not tell the app whether exact alarms are allowed. There is no
  `Next one rings at …` anywhere on the page. (The web assert pins the wording; this is the same page
  with a real queue behind it.)
  **PASS / FAIL: ______**
- **W5.1b** On Android 12+, open the phone's **Settings → Apps → Special app access → Alarms & reminders**
  and find Marginalia. A fresh install targeting Android 13+ starts **not** allowed. With it **allowed**,
  let a class heads-up fire (set one subject's lead time to 10 min and wait) and note how close it lands
  to the `HH:MM` the app planned. Then turn the access **off** and repeat: the reminder may now arrive a
  few minutes late — which is exactly why the app quotes a window and never the minute.
  **PASS / FAIL: ______**
- **W5.1c** Plan a reminder a few minutes out, then `adb reboot`. After the phone comes back (do **not**
  open Marginalia first) the reminder still fires at the planned time. This is `expo-notifications`' own
  boot re-arm (`RECEIVE_BOOT_COMPLETED` in the module's manifest); W5 added nothing to it and this check
  exists so a regression in the module or the manifest is caught rather than assumed.
  **PASS / FAIL: ______**
- **W5.1d** `adb shell dumpsys package app.marginalia.planner | grep -i "SCHEDULE_EXACT_ALARM"` — the
  installed package lists the permission. (If it does not, the APK was not rebuilt after the manifest
  change, and W5.1b above will be inexact no matter what the phone's setting says.)
  **PASS / FAIL: ______**

### W5.2 — the lock-screen text switch is real (D4)

Where: Settings → Reminders → **Show reminder text on the lock screen** (ships **ON**) and the Delivery
status page directly below it.

- **W5.2a** Turn the switch **OFF**. The Delivery status page prints one sentence naming both the setting
  and what the phone's own `classes` channel reports (`…and this phone's channel hides even that a
  reminder arrived.`) — or, if the phone would not take the change, `…but this phone's channel hides the
  text on a secure lock screen — the channel wins until Android recreates it.` Read which one it says and
  write it down; a lie here is the whole failure this line exists to catch.
  **PASS / FAIL: ______**
- **W5.2b** With the switch **OFF**, lock the phone and let a reminder fire. It still rings/alerts (the
  notification is not silenced), but **no text** appears on the lock screen. Unlock, pull the shade: the
  reminder is there, with its text.
  **PASS / FAIL: ______**
- **W5.2c** Turn the switch **ON**, lock, and repeat: the reminder's text is now on the lock screen. If it
  is not, the channel kept its old visibility — that is a phone behaviour, not a bug in the app, and
  W5.2a's sentence should already be saying so.
  **PASS / FAIL: ______**
- **W5.2d** `adb shell dumpsys notification_manager | grep -A6 -i "channel.*classes"` (or Android
  Settings → Apps → Marginalia → Notifications → **Classes**) and confirm the `classes` channel's own
  lock-screen setting agrees with what W5.2a printed. `tasks` follows the same switch; the `Focus timer`
  channel is deliberately untouched by it.
  **PASS / FAIL: ______**

### W5.3 — the reminder's own text is in the app's clock (h12)

- **W5.3a** Settings → Look & feel → **24-hour clock OFF**. Send **Test in 10 s** from Delivery status
  (it copies a real task's reminder) and read the notification's body: `due 10:00 AM`, not `due 10:00`.
  **PASS / FAIL: ______**
- **W5.3b** Switch it back **ON** and send the test again: the body reads `due 10:00`. Same for a class
  heads-up's `room · teacher · time` line.
  **PASS / FAIL: ______**

### W5.4 — no false sentence on a real build

- **W5.4a** On this development build, the sentence **"This build has no notification module…"** must
  appear **nowhere** — not on the Reminders row, not on the Reminders page, not on Delivery status. If it
  appears, the notification module is missing from the installed APK and every check above is
  meaningless; report that instead.
  **PASS / FAIL: ______**

### W5b — pending DECISIONS D9

**Nothing here can pass on this build.** `expo-notifications` never calls `setFullScreenIntent`
(`docs/archive/reports/w5-d0-mechanism.md` §2), so a reminder cannot take over the screen, and W5a only *declared*
`USE_FULL_SCREEN_INTENT` so the grant is possible once the native module exists. Run these after W5b.

- **W5b.1** Android 14+: the phone's **Settings → Apps → Special app access → Full screen notifications**
  lists Marginalia and can be turned on; with it off, a reminder while the screen is off does not open
  full-screen.
  **PASS / FAIL: ______**
- **W5b.2** With the screen off and locked, a reminder opens the app on top of the lock screen (the
  calling/alarm use case) and tapping it lands on the thing it is about.
  **PASS / FAIL: ______**
- **W5b.3** While the phone is **in use**, the same reminder appears as a heads-up instead of taking the
  screen (Android's own rule for a full-screen intent).
  **PASS / FAIL: ______**

---

## W6 — the coach-mark tour: the hole, the touch, and the ring

The tour is an overlay over the live app: a scrim with a rectangle cut out of it, a ring round that
rectangle, and a card that says what the control under it does. Everything it claims can be checked by
reading the code except the four things Android decides for itself, which are here.

- **W6.1** The scrim is really blocking. On any step with a ring (start with the `+`), tap the dim
  paper well away from the hole — on the tab bar, on the page behind, on the card's shadow side.
  Nothing happens at all: no page change, no sheet, no sound. `[uncertain]` — RNW and the Android
  renderer disagree about what a plain `View` does with a touch, and only the device settles it.
  **PASS / FAIL: ______**
- **W6.2** The hole is really live. On the same step, tap the `+` **through** the hole. The Add sheet
  comes up on the first tap, the tour advances to the sheet step, and the ring is now round the ✕.
  A tap that lands on the hole's edge and does nothing means the hole is drawn one layer too high.
  **PASS / FAIL: ______**
- **W6.3** A screen reader can still take the tour. With TalkBack on: the scrim and the ring are not
  spoken, the card is (step number first, politely), and double-tapping the focused `+` while the tour
  is up activates the real button — an accessibility activation reaches the focused node rather than
  being hit-tested through the overlay. If the last part fails, the tour is unusable without sight.
  `[uncertain]`
  **PASS / FAIL: ______**
- **W6.4** The ring lands on the control on the first frame of a step, not the one after. The step to
  watch is *Five pages, one bar* → *Tap once, then hold*: the tour moves the app to Week itself, and
  `measureInWindow` answers after layout. A ring that appears a frame late on a page that just swapped
  is a device-side measurement lag, not a layout bug.
  **PASS / FAIL: ______**
- **W6.5** Back walks the tour, and never the app. Hardware back steps to the previous step; on the
  first step it ends the tour (and the app is left on Today, not exited). `[uncertain]` — the handler
  is registered by the overlay while the navigator is mounted underneath it, and which of the two
  Android routes the event to is the question.
  **PASS / FAIL: ______**
- **W6.6** The dial can still be dragged with the tour on top of it. On *The dial is a real dial*, drag
  the ring through the hole: the round changes, the callout's own `5 min less` / `5 min more` do the
  same, and the coach ring stays on the dial while it moves. `[uncertain]` — the pan is a gesture-
  handler recognizer on a page that the overlay sits over, and only the device proves the two coexist.
  **PASS / FAIL: ______**
- **W6.7** At Android's 1.3× and 2.0× font scale the callout's body scrolls instead of clipping, the
  card never grows over the ring, and every button on it stays a 44 dp target.
  **PASS / FAIL: ______**

---

## V031 — it updates itself: OTA, the Play button, the spiral

Three surface changes that only a phone can settle: an over-the-air update replacing the JS bundle
without a reinstall, the per-sound **Play** button being audible (or saying why it is not), and the
spiral bar dimming its elapsed ink instead of dragging a dot round. Nothing here is judged by a
command; each step is a look or a listen.

The OTA steps prove the whole chain — `runtimeVersion` policy, channel, `ON_LOAD`, and SQLite surviving
a bundle swap. A publish only reaches this APK if it carries the **same runtime version (`0.3.1`)** and
the **same channel (`preview`)** as the build, so a failure in V031.5 is usually a publish mistake, not
an app bug. Wear the same pair of shoes every run.

- **V031.1** Install the v0.3.1 preview APK, built from the `preview` profile
  (`eas build -p android --profile preview`), over the previous build. It installs without uninstalling
  and opens on Today.
  **PASS / FAIL: ______**
- **V031.2** Open **Settings → About**. The last line is `Margin 0.3.1 · local-first, no account, no
  network needed.`; below it an **Updates** section reads `Margin 0.3.1 · runtime 0.3.1 · built in`,
  then `Checked automatically when the app opens.` and a **Check for updates** button. Tap it with the
  phone online: the line becomes `You are on the newest version.` (or `An update is downloaded. Restart
  to use it.` if a newer publish already exists). A browser build instead says only that updates are
  checked in the installed app.
  **PASS / FAIL: ______**
- **V031.3** Change one thing you can see from the outside — e.g. **Look & feel → Paper & texture** to
  `Rules`, or turn **Clock tick** off. Note it. Do not change anything else, so V031.6 is about *data*,
  not about this toggle.
  **PASS / FAIL: ______**
- **V031.4** Publish a test update to the phone's channel from the build machine:
  `eas update --branch preview --message "v031 checklist"`. The CLI must report runtime `0.3.1`. If it
  reports a different runtime, stop: the APK will ignore the update, and that is the policy working,
  not a bug.
  **PASS / FAIL: ______**
- **V031.5** With the phone online, **kill** the app from Android's recents (a background home-press is
  not enough — `ON_LOAD` checks on a cold start), then reopen it. The download happens on this launch;
  the running bundle is still the old one, so the change from V031.3 may not be visible yet. Kill it
  again and reopen once more: now the new bundle is in use. If the change was never published to the
  `preview` channel, the second launch looks identical — that is the expected no-op, not a failure.
  **PASS / FAIL: ______**
- **V031.6** After the update, the planner's **data is intact**: the timetable, a marked attendance
  row, a task with its notes, and the setting you changed in V031.3 all survive. Nothing is re-seeded,
  nothing is duplicated, and `Semester` dates are unchanged. This is the one step where a failure is
  serious: it means the bundle swap touched SQLite.
  **PASS / FAIL: ______**
- **V031.7** Back in **Settings → About → Updates**, the version line now ends in an update instead of
  `built in`, e.g. `Margin 0.3.1 · runtime 0.3.1 · update 3f9a1c2e`. The id is the short form of the
  publish from V031.4; `runtime 0.3.1` is unchanged. A wrong runtime here means the policy is not doing
  what the build says.
  **PASS / FAIL: ______**
- **V031.8** **Settings → Sound & haptics**, with the media volume up: tap **Play** on all eight rows.
  Each one is audible and is the sound of the thing named above it (Paper rustles, the stamp thumps, the
  dial clicks, the clock ticks). Then tap **Paper**’s − until it reads `0%` and tap its **Play**: the
  tap now says `Paper is at 0% — raise its volume to hear it.` instead of doing nothing. Turn the
  master sound switch off and tap any **Play**: `Sound is off — turn it on above to hear a preview.`
  A Play that stays silent while its row is above zero, or a toast that contradicts the slider, is the
  failure this slice exists to fix.
  **PASS / FAIL: ______**
- **V031.9** **Settings → Look & feel → Progress bar**, choose **Spiral** (group *Any subject*). There
  is **no dot** anywhere on the groove. The picker draws its preview at 30 of 50 minutes, so it already
  shows two tones: a brighter inner run where time is still ahead and a dimmer outer run already spent,
  with a clean boundary between them. A real period shows the same, the dim part growing inward as the
  period runs out, until at the very end the whole groove is the dim tone. Watch it in **light and
  dark** and at a small and a large system font size. The frames the vision pass must shoot are `p=0`,
  `p=0.5`, `p=1`, light and dark, at 412×915 — those three states are not reachable from the picker's
  single demo preview, so they are shot in the browser harness; the phone proves the same drawing in
  the real band.
  **PASS / FAIL: ______**

---

## V05-WS1 — import: a file picked from the phone

### V05-WS1.1 — the picker opens, and the file's text arrives
**Look at** Settings → Data & export → Import. Tap **Pick file**.
- Check: Android's document picker opens. Choosing a `.json` export from Downloads puts the file's name
  beside the button, fills the box and shows the preview ("N subjects · …") without a second tap;
  choosing a `.csv` shows the "Which table is this?" buttons, and picking one plans the rows.
- Backing out of the picker changes nothing and prints no error. A file from cloud storage (Drive)
  either fills the box the same way or shows one "Couldn't read that file: …" line — never a crash.
**PASS / FAIL: ______**

---

## V05-OTA — it updates itself on its own, and says so once

The loop WS4 adds is only provable on a phone: a check nobody tapped, a restart the user chose, and
one sentence on the launch after the bundle actually changed. The publish must carry the same runtime
as the build (`0.3.1`) and the `preview` channel, exactly as V031.4.

### V05-OTA.1 — the resume check runs without a tap
**Look at** Settings → About. Leave the sheet open, background the app (home press), wait ten seconds,
bring it back.
- Check: no new row or spinner appears — the check is silent — and the phone shows no error. On a
  flight-mode phone the app comes back exactly as it was. The check is once per five minutes: returning
  five times in a minute must not produce five round-trips (a proxy or the update server's rate limit
  is the way to see this, not the screen).
**PASS / FAIL: ______**

### V05-OTA.2 — Update now (restart) is the only way the app restarts
**Look at** Settings → About → Updates with a newer publish on the channel. Tap **Check for updates**.
- Check: the line reads `Update available — downloaded and ready to install.` and a second button
  **Update now (restart)** appears beside **Check for updates**. Tapping it restarts the app into the
  new bundle; tapping it with no download (check first says "newest version") leaves the app running.
  Nothing restarts on its own — the app must not reload while a class is being marked.
**PASS / FAIL: ______**

### V05-OTA.3 — the sentence appears once, on the launch that applied it
**Look at** the launch right after an update was downloaded (either after V05-OTA.2's restart, or a
cold start following the download).
- Check: a toast reads `You’re now on Margin <new version>` exactly once. Kill and reopen the app
  again: the toast does not reappear, and About's version line names the update rather than `built in`.
  The planner's data is intact after the swap (the V031.6 check is the same one).
**PASS / FAIL: ______**

---

## V05-REL — reliability and release plumbing (UNVERIFIED-ON-DEVICE)

- **V05-REL.1 Fatal screen offers Try again.** Only reachable with a damaged or newer-version database; if
  you ever see "The planner could not open your data", the first button is *Try again* and nothing has
  been erased. **PASS / FAIL: ______**
- **V05-REL.2 Margin dev installs beside Margin.** Two launcher icons, "Margin" and "Margin dev"; the real
  app's data is untouched by anything done in the dev app. **PASS / FAIL: ______**
- **V05-REL.3 A thousand tasks scroll.** On To-do, the list shows 60 cards and a "Show 60 more" row.
  **PASS / FAIL: ______**

---

## Owner's final device test (v0.5.0)

Do these in order, on the phone that has v0.1.0 with your real data. Write PASS/FAIL beside each.

1. **Export first.** In v0.1.0: Settings → Data → Export. Look for: a file you can see in Files/Drive.
   Keep it until step 12 passes.
2. **The `over` APK over v0.1.0.** Install `margin-v0.5.0-over-android.apk` (Actions → Release APK,
   `variant=over`) without uninstalling. Look for: it installs as an update; every class, task, mark,
   attendance stamp and focus session is still there; Settings → Data shows a safety copy was made.
3. **Release key plus import.** (After you create the key, `docs/RELEASING.md` §1.) Uninstall, install
   `margin-v0.5.0-release-android.apk`, import the export from step 1. Look for: every row comes back;
   the import toast counts them.
4. **Onboarding with Teddy.** On a fresh install (or Settings → replay the tour). Look for: the mascot
   animates, follows typing, covers its eyes on a password-style field, and celebrates at the end. If
   the tour still shows the coach marks instead, Teddy has not shipped in this build — note it.
5. **The notification ask.** First launch after onboarding. Look for: Android asks once for
   notifications; denying it leaves the app usable, and Settings → Reminders → Delivery status says
   reminders are off and why.
6. **Do Not Disturb.** If the build has the DND option: enable it, start a class or focus round. Look
   for: DND turns on and off with it. If there is no such option, note "not in this build".
7. **The live countdown.** Start a focus round, lock the phone. Look for: the round's notification with
   its time; it ends when the round ends. Pull the shade during a class to see the class countdown, if
   present.
8. **Sound plus haptics.** Stamp attendance, finish a task, start a break. Look for: each makes its
   sound (media volume up) and a buzz; turning sound off in Settings silences them.
9. **Widgets.** Long-press the home screen → Widgets → Margin. Look for: the widgets exist and open the
   right page. If there are none, note "not in this build".
10. **The OTA loop.** After an update is published (`docs/RELEASING.md` §3): open the app, background
    it, return after a minute, then reopen it. Look for: "You're now on Margin …" once, and About naming
    the update.
11. **Clock and DST.** Change the phone's time back an hour during a focus round. Look for: the round
    keeps counting instead of freezing.
12. **Backup and restore.** Settings (Android) → Google → Backup → Back up now; on a second phone or after
    a reinstall, restore. Look for: the planner comes back with its data.

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
