````text
<role>
You are a senior React Native / Expo engineer with hands-on access to an Android emulator or phone, a terminal, adb, and the ability to see the screen. You are finishing and verifying "Marginalia", an Android-first, offline-first school planner that another engineer built WITHOUT being able to run it. Your job: run it as a standalone release Android app (NOT Expo Go, NOT a dev client), verify every item in <verify>, fix what fails, and report with evidence. You are not redesigning anything.
</role>

<starting_state>
- Repo root = the folder containing this file (package name `marginalia`). Expo SDK 57, React 19.2, React Native 0.86, Reanimated 4.5 + worklets, Gesture Handler, react-native-svg, expo-sqlite, expo-notifications, expo-audio, expo-haptics, expo-keep-awake, expo-file-system (new File/Directory API), expo-sharing, React Navigation 7 (custom navigator), 6 Google font files.
- Machine-verified already: `npm run check` (tsc strict + eslint 0 warnings + 82 jest tests + dependency-cruiser) and `npm run bundle` (Metro/Hermes Android bundle compiles, 3.8 MB). NOTHING has been run on a device. Treat every UI/gesture/audio/haptic/notification behaviour as unverified.
- Read `STATE.md` first (decisions, deviation ledger, next action).
</starting_state>

<target_state>
All checks in <verify> pass or are fixed, or are recorded as failing with a reproduction and cause. `npm run check` and `npm run bundle` still pass. `STATE.md` updated. A final report in the format of <report>.
</target_state>

<environment>
Toolchain: Node 22 (tested with 22.22), npm 10, Android Studio emulator (Pixel-class, API 34+; Android 13+ so the notification permission prompt appears) or a physical Android phone. The project is verified on a STANDALONE release build only (`npx expo run:android --variant release`, or EAS with `developmentClient: false`). Expo Go and dev-client builds are not valid for verification or performance numbers.
Install and run:
```bash
npm install
npx expo run:android --variant release   # builds + installs the standalone app
npm run check && npm run bundle
adb logcat *:S ReactNativeJS:V  # JS logs
```
Reset all data: in-app Settings → Reset (tap twice) or `adb shell pm clear app.marginalia.planner`.
Time travel for notification tests: change emulator date/time in Android Settings (turn off automatic time). Remember the app replans on foreground.
Known standalone-build facts: (a) custom notification sounds work in a release build; record behaviour. (b) The app only uses LOCAL scheduled notifications; no push. (c) Android Doze/battery saver can delay or drop alarms; test with the phone unplugged AND plugged. (Supersedes the old Expo Go constraints — we no longer test in Expo Go.)
Known Expo Go facts (HISTORICAL, no longer the test target): (a) custom notification sounds are impossible in Expo Go; (b) Expo Go prints a red/yellow LogBox about remote push notifications — moot now; (c) recorded for the archive.
</environment>

<architecture>
Real paths and names (nothing aspirational). Dense files: lines are long; use grep, not line numbers.

Entry: `index.ts` (registerRootComponent) → `src/App.tsx` (fonts, `openRepository()` → `hydrate()`, `configureNotifications()`, `initAudio()/preloadAudio()`, `wireLifecycle()`, NavigationContainer, `<Overlay/>`).

`src/domain/` (pure TS; may not import react-native/expo/UI — enforced by `.dependency-cruiser.cjs`)
- `types.ts` all entities (Task, Course, Meeting, AttRecord, DayMark, Mark, Notice, FocusSession, Settings, NotifSettings, Snapshot).
- `time.ts` helpers (`atTime`, `hm`, `fromMin`, `startOfDay`, `mondayOf`, `fmtClock`, `uid`…). Weekday: Monday = 0.
- `attendance.ts` `effective()` (explicit record > whole-day mark > inferred "here" once class ended > null), `occKey(date,meeting)` = `YYYY-MM-DD|HH:MM|courseId`, `nextStatus`, `occurrencesBetween`, `attendanceRate`.
- `grades.ts` `total`, `needed` (average required on remaining weight to hit a goal), `letter`.
- `reminders.ts` `planReminders(input)` → `{items, deferred, dropped}`; `blockedReason`, `shift`, `freeMinutes`, `latestStart`, `workload`. Item ids are `${kind}-${entityId}-${minute}` so unchanged items are never rescheduled. Class reminders ignore the during-class rule; task reminders obey it. Quiet/inactive time moves a deadline reminder EARLIER (`notAfter`), other reminders later.
- `timer.ts` `initTimer, setMinutes, advance, view, toggle, startBreak, endBreak, finish, canBreak`; constants `NUDGE_MS = 5 min`, `MIN_BREAK_AFTER_MS = 5 min`; `breakFor(plan)`. All state derives from timestamps (`checkpoint`), so backgrounding cannot desync it.
- `analytics.ts` focus/done by day and hour, on-time stats, streaks, attendance heat/rates, grade bars.
- `defaults.ts` `DEFAULT_SETTINGS`, `DEFAULT_NOTIF`, `SOUND_GROUPS`, `withDefaults`.

`src/data/`
- `repository.ts` the port `Repository` (load, upsert, remove=tombstone, restore, putSettings, seed, purgeDemo, reset, logNotif, notifLog, pendingOutbox, ackOutbox). `specs.ts` column mapping + `MIGRATIONS` (PRAGMA user_version). `sqlite.ts` `SqliteRepository(db: SqlDb)`; `sqliteExpo.ts` `openRepository()` (opens `marginalia.db`, WAL, seeds once when `settings.seededAt` is 0). `memory.ts` `MemoryRepository`. `seed.ts` `seedSnapshot(now)` = the v10 demo timetable, marks, tasks, notes (+ 6 finished tasks and 20 focus sessions flagged `demo` so Stats is not empty; removable in Settings).
- Rule: only files named `src/data/sqlite*` may import `expo-sqlite`; UI never imports adapters.

`src/store/store.ts` single external store. Exports: `useStore(selector)` (selectors MUST return stable references; derive arrays with useMemo), `getState`, `set`, `act` (every mutation: `saveTask, toggleTask, removeTask, setAtt, clearAtt, setDay, saveCourse, saveMeeting, removeMeeting, removeCourse, saveMark, removeMark, setAdjust, saveNotice, removeNotice, setSettings, setNotif, focusOpen, timerToggle/Break/BackNow/Finish/SetMin/SetFlow/Swap/Pump, purgeDemo, resetAll, go, open, close, settingsPush/Pop`), `toast(text, undo?)`, `resync()` (debounced: planReminders → notifications.sync), `hydrate`, `wireLifecycle`, `snapshotOf`. Deletes are tombstones with an Undo toast. `fev` = last timer event {k:'roundDone'|'breakDone'|'nudge'|'warn10'} consumed by the Focus screen.

`src/services/`
- `audio.ts` `play(name, gain)`, `configureAudio`, `initAudio`, `preloadAudio`; 2–3 players per sound, 4-voice cap with priority, volume = group volume × gain, master toggle. 27 files in `assets/sounds/*.wav` produced by `scripts/synth-sounds.mjs` (deterministic; `npm run sounds`; also writes `manifest.json` that a test checks for clipping/DC).
- `haptics.ts` `haptic(feel)`; Android uses `performAndroidHapticsAsync(AndroidHaptics.*)`, falls back to impact styles; silent on failure. `fx.ts` one call per meaningful change (`fx.page, swipe, crumple, stamp(status), done, undone, chime, toggle(on), detent(velocity), bump, start, clack, blip, roundDone, breakStart, nudge, peel, fall, tick(odd)`).
- `notifications.ts` channels `classes`, `tasks`, `focus`; `ensurePermission`, `status`, `sync(plan)` (cancel stale, schedule missing, DATE trigger + channelId), `scheduleFocusEnd/cancelFocusEnd` (id `focus-end`), `sendTest(seconds)` (id `test`), `onReceived`, `onOpened`.
- `export.ts` `buildTables`, `toJson`, `toCsv`, `toCsvZip`, `toXlsx`, `zip`, `crc32`, `exportName`; `exportFile.ts` `runExport(format, 'folder'|'share', snapshot)` (folder = `Directory.pickDirectoryAsync()` then `createFile().write()`; share = write to cache then `Sharing.shareAsync`). File name `marginalia-YYYY-MM-DD.xlsx|json`, `marginalia-YYYY-MM-DD-csv.zip`.

`src/tokens/theme.ts` `palettes.refined|original` × light|dark (`Colors`), `makeTheme`, `FONT`, `RG/RS` radii, `hexA`. `src/ui/theme-context.tsx` `ThemeProvider/useTheme/useReduceMotion/useNow`.
`src/ui/` `kit.tsx` (Txt, HandBox, Icon, Btn, Chip, Toggle, Stepper, Field, Row, Tape, Hair), `hand.ts` (`scaleRadii`, `outline`, `handPath`), `PaperBg.tsx` (ruling via SVG Pattern + grain PNG tile or original photo texture with `mixBlendMode`), `Sheet.tsx` (one-hand bottom sheet, drag-down, BackHandler), `Overlay.tsx` (renders the open sheet, toast, FAB), `Swipe.tsx` (`SwipeCard`: right = done, left = crumple, TalkBack custom actions), `DayBar.tsx` (4 bars: spines, glass, trace, ticker), `charts.tsx` (Heatmap, HBars, Hist24, Line2, Ring), `clock/faces.ts` (engine; faces g, rb, c, sl, s; `gearSvg`, `balanceSvg`, `SKELETON`, `meshPhase`), `clock/ClockFace.tsx` (static SvgXml + Reanimated-rotated layers, ONE `useFrameCallback` on the UI thread), `FaceThumb`.
`src/navigation/Book.tsx` custom React Navigation navigator (TabRouter); every visited page stays mounted; the focused page "is placed on the table" (drop from above-right, tilt settles, shadow tightens, 520 ms; instant under reduce-motion). Bottom nav is drawn here and hidden on Focus. `act.go(route)` sets the store route; Book navigates.
`src/screens/` Today, Week, Tasks, Grades, Stats, Focus, `common.tsx` (Page, Section, TaskCard, AttCell, relDue). `src/sheets/` `forms.tsx` (Add, Task, Status, Course, Meeting, Mark, Notice), `WhenPicker.tsx`, `Settings.tsx` (path-based nested pages, live: `settingsPath` in store).
Tests: `src/test/*.test.ts` (domain, repo contract on memory + node:sqlite, export, faces, ui/contrast/sounds, rev).
</architecture>

<verify>
Run in order. For each: do the steps, record PASS/FAIL, and for FAIL record logcat excerpt + screenshot + fix commit. "Cold" = after `adb shell pm clear host.exp.exponent`. Assume nothing about the phone; use a phone with 360–412 dp width AND the emulator.

V1 Boot and seed (cold). The standalone app cold-starts; within 8 s a spinner, then Today. PASS: no red screen; Today shows the demo week; Tasks has 10+ rows (Late/Today/…/Done groups); Grades shows 5 subjects; Stats shows heatmaps with non-empty cells. FAIL if a red screen appears (copy the full stack).
V2 Fonts and layout. Handwritten Caveat headings, Permanent Marker titles, Special Elite numerals, Newsreader italics. PASS: no fallback sans-serif; cards have irregular leaf-like hand-drawn outlines with a small offset shadow; no horizontal page scroll at 360/390/430 dp (use `adb shell wm size 1080x2400` and `wm density` variants; `adb shell wm size reset` afterwards); at Android font scale 1.3 nothing is clipped or overlaps the nav.
V3 Page transition. Tap Week, Tasks, Grades, Stats, Today. PASS: each page visibly drops in from above-right, tilts, settles within ~0.5 s, with a soft "placing paper" sound and a soft haptic; the previous page is visible underneath; no flash of a blank page; rapid tapping across 5 tabs 10× never leaves a page invisible or half-rotated. With Android "Remove animations" ON the swap is instant.
V4 Clocks (Settings → Look & feel → Clock face). Five faces: Guilloché Ivory, Rosette Blanc, Celtic Knot, Scales and Lily, Skeleton Movement. PASS: each is visibly different at 96 dp; selecting one changes the clock on Today immediately (sheet is ~60 % height so Today is visible behind); hour/minute hands match the phone time to within 1 s of the minute hand sweep, the red-brown second hand is smooth (Scales and Lily has no second hand but a small turning sub-dial); Rosette's two lattices counter-rotate; Skeleton: the four wheels turn, neighbouring wheels turn in opposite directions with no tooth visibly crossing into another wheel, a balance wheel oscillates; switch light↔dark: every face stays legible. Leave Today open 3 minutes: no frame drops when scrolling (use `adb shell dumpsys gfxinfo host.exp.exponent framestats` or the perf monitor).
V5 Notifications (physical phone preferred; emulator OK).
  a. Cold start: the OS permission dialog appears once, ~2–3 s after Today (planner asks when permission is undetermined). Allow.
  b. Settings → Reminders → Delivery status: Permission "granted"; "N reminders queued"; Plan line shows count, moved, deferred.
  c. Tap "Test in 10 s", lock the screen. PASS: a notification titled "Marginalia test" arrives within 10–60 s (Doze can delay up to a few minutes on a real phone; note the delay).
  d. Add → Class: pick a subject, today, start = now+12 min, end = now+60 min, Save. With "Lead time" 10 min (default) a "<Subject> in 10 min" notification must arrive at start−10 min (±1 min). Also at the class end a "just ended" notification arrives ±1 min. Open the notification: app opens on Today.
  e. During-class deferral: during a scheduled class create a task due tomorrow with reminder "At due time" is NOT the test; instead Add → Assignment, due today 2 h from now, tap Pick…, add "+ at a time" reminder at a minute that falls inside a class. PASS: Delivery status shows "moved" ≥ 1 and the notification arrives 1 min after that class ends, not during it. Turn OFF Settings → Reminders → Hours & quiet time → "Hold reminders until class ends": the reminder now arrives at the original minute.
  f. Quiet hours: set quiet 22:00–07:00; add a task due 23:30 with "At due time". PASS: planned time shown in the notification text/Delivery status is before 22:00 (moved earlier), never after the deadline.
  g. Complete a task that has a pending reminder; PASS: its reminder no longer fires (queue count drops within ~1 s after the 700 ms debounce).
  h. Edit class lead time per subject (Per-subject lead time); the queue rebuilds; no duplicate notifications for the same class.
   i. Kill the app (swipe away from recents); a scheduled reminder still arrives (record the phone model and OEM battery restrictions).
V6 Sounds. Settings → Sound & haptics → each group's "Play" button, then in-context: place page (nav tap), swipe task card (rustle), delete task (crumple + thud ~0.6 s later), mark attendance (4 distinct stamp weights: here/late/absent/sick), complete task (tick + chime), toggle switches (click up/down), in-app notification chime, focus start (thunk), dial drag (crunchy detents with 4 velocity layers; slow drag = soft, fast = hard), preset tap, pause/resume (clack), 10-second warning (blip), round done (descending 4 beeps + thud), break start (bell), break end (tape peel then flutter then thud), clock tick/tock each second while focusing. PASS: each is audible, short, not clipped/crackling, not overlapping into mush when 5 fire quickly (4-voice cap), volume sliders change loudness, master toggle silences everything, sound plays with the phone's media volume (silent-mode behaviour: record it). The user asked the dial to feel "crunchy like a microwave timer": judge and tune `scripts/synth-sounds.mjs` (`crunch()` drive, `detent-*` layers) then `npm run sounds`.
V7 Haptics (physical Android phone only; emulators vibrate nothing). Verify distinct feel for: nav tap, chip select (segment tick), toggle on vs off, stamp (here=firm, absent=heavy), denied (locked cell), task done (confirm), crumple (4-pulse rattle then thud), dial detent per 5 min, dial limit bump, tick each second, break start/peel/fall. Settings → Haptics off silences all.
V8 Attendance grid (Grades). Cells are 28×28 dp with 3 dp gaps, scroll horizontally inside the card (page does not scroll sideways). PASS: (1) an unmarked/inferred (dashed, faded) cell: ONE tap marks it Here ("✓") with stamp sound + haptic; (2) tapping an already marked cell does nothing but a "denied" shake + haptic; (3) long-press (~0.4 s) opens the status sheet; choose Late → cell shows "L" in amber; (4) "Lock" button: when locked every tap and long-press is denied; unlock restores; (5) one-handed on a 6.7" phone the Lock button, cells and Mark button are reachable; (6) TalkBack: each cell announces date, time and status, and its hint; (7) misplaced taps: tapping between two cells never marks a third one (3 dp gap).
V9 Add flow and data logic. FAB → Add sheet (8 tiles, bottom of screen, reachable by thumb) → Assignment. Type a title; subject optional (leave "No subject"); Due: tap "When I get home" (default 16:30; if already past it means tomorrow 16:30); Remind me: tap "2 h before" and "When I get home" off/on; set effort 90 min. PASS: a "Tight/Comfortable" box states needed vs free time with a latest start; Save → toast; the task appears under the right group; opening it shows the same values. Edit: add 2 steps, tick one (progress "1/2 steps" on the card). Swipe right = done (check animation, "done" sound, strike-through, moves to Done). Swipe left past 30 % = crumple: paper squashes, rotates, balls up and falls off with crumple sound then thud; Undo toast restores it (restored card is NOT left invisible/scaled). Completed time is saved (Stats "When you tick things off" gains a bar at the current hour). TalkBack: card exposes custom actions Done / Delete / Open.
V10 Focus (Today → timer icon, or long-press a task). Layout must match the scrapbook mock: torn Venice picture at top, task card with tape, knurled dial inside the round cliff picture, presets row, big Start button, "end session", margin note "focus doesn't happen by accident".
  a. Drag the knurled ring: minutes change in 5-min steps, a crunchy detent per step (faster drag = louder layer), grip rotates under the finger, the hatch ring is empty, the hand points at the minute value; limits 5 and 240 give a bump. If the ring rotates the wrong way or jumps, the dial centre measurement is wrong: see <code_notes> N3.
  b. Presets 25/45/50/90 set the dial; Flow toggle.
  c. Start: thunk, hand starts to count down, hatch ring fills clockwise, centre scrap shows mm:ss, a tick/tock each second with a visible 4 % pulse of the scrap. Pause/Resume works; background the app 60 s while running, return: remaining time is correct to ±1 s. For a fast end-of-round test, temporarily lower nothing: simply start a 5-minute round (the dial minimum), lock the phone, and expect a "Round finished" notification at +5:00 (±1 min). For break tests temporarily set `MIN_BREAK_AFTER_MS = 10_000` and `NUDGE_MS = 15_000` in `src/domain/timer.ts` and REVERT before finishing.
  d. End of round: "ROUND DONE n" stamp presses onto the page (scale from big to 1, hold ~1.5 s, fade), descending beeps. Flow ON: centre shows +mm:ss overtime; Flow OFF: stops.
  e. Break (my addition; spec from the user: a smaller break clock taped on, main timer paused, a nudge every 5 minutes, falls off comically when the break ends). With tests-values: the "break · N min" button is dimmed with a toast reason until 5 min (or the lowered value) of focus; then tap: bell sound, main clock freezes, a small round paper sticker with tape appears at right of the dial showing break countdown + coffee icon. Every 5 min (or lowered value) it wiggles with tick + haptic. Tap the sticker = back to work: tape-peel sound, sticker swings on its tape then drops with flutter and a thud and disappears; main clock resumes with the exact remaining time. Let a break expire: same swing/fall, main clock resumes automatically with "focusing". Breaks limited by Settings → Focus & breaks → Breaks per round. Reduce-motion: sticker fades quickly instead.
  f. "swap task" cycles open tasks while the dial is unset; "end session" saves a session (toast "Saved N min of focus") and Stats focus heatmap/hour chart reflect it; sessions under 60 s are not saved.
  g. Dark mode: the scrapbook image is dimmed; all text readable; the stamp is red-brown.
  h. Android back from Focus returns to Today; a running timer continues in the background (the Today header shows nothing about it: record whether the user needs a running-timer indicator).
V11 Settings sheet (gear on any page). PASS: it is a bottom sheet (~60 % height, thumb zone), drag-down or back button closes; hierarchy Look & feel → Theme & palette / Paper & texture / Clock face / Progress bar / Accent pen; Reminders → Classes / Tasks & exams / Hours & quiet time / Per-subject lead time / Delivery status; Sound & haptics; Attendance & semester; Focus & breaks; Data & export; Reset. EVERY option changes the page behind it immediately (theme, palette refined/original, paper dots/grid/ruled/plain, texture grain/original photo/none, clock face, bar kind, pen colour) AND the sheet's own background (the texture visibly changes inside the sheet too). Android back inside a sub-page goes up one level; at root closes.
V12 Export (Settings → Data & export). For each of XLSX, CSV(zip), JSON: "Save to folder…" (system folder picker; choose Downloads or a Drive folder) and "Share…". PASS: file named `marginalia-<today>.xlsx|json` / `marginalia-<today>-csv.zip`; XLSX opens in Google Sheets/Excel/LibreOffice with 12 sheets (Summary, Courses, Timetable, Attendance, Day marks, Tasks, Subtasks, Reminders, Notices, Marks, Focus sessions, Settings), bold frozen header row, row counts equal the app (Tasks = all tasks incl. done); CSV zip has one UTF-8 CSV per table that opens in Excel with correct accents; JSON parses and contains `raw`. If `pickDirectoryAsync` is unavailable, record the exact error; "Share…" must still work.
V13 Stats. All cards render without overlap at 360 dp; charts animate once on first view; complete a task and start/end a 2-min focus session, then confirm "At a glance" rings, heatmaps and histograms change; attendance heatmap shows rows per subject for the last 28 days; empty-state hint shows after Settings → Clear demo history on a fresh DB with no focus/tasks.
V14 Accessibility. TalkBack on: every button announces a label; sheets are announced and trap focus (background content not reachable while a sheet is open); live regions announce toast and dial value; swipe-card custom actions work; every gesture has a non-gesture path (Stepper buttons, status sheet, Done checkbox, dial accessibility increment/decrement). Dynamic type 1.3×. Android "Remove animations": page placement, crumple, sticker fall, charts become instant/fade.
V15 Palettes and contrast (eyeball + tool). Refined light ("a bit lighter, more cream, less gray") vs Original light; Refined dark (warm dark brown, NOT pitch black) vs Original dark; gray should no longer dominate. All body/caption text must read comfortably; if any text reads below 4.5:1 (use the Accessibility Scanner app) record which element and fix the colour in `src/tokens/theme.ts` (tests in `src/test/ui.test.ts` encode the pairs; extend them).
V16 Persistence and logic. Add/edit/delete a subject, class, mark, note, task; kill and reopen: everything persists; Undo for each delete works and survives a few actions. Attendance rate on Grades equals count(here+late)/count(held). Grade card: goal 85 on Economics shows required average on remaining weight. Curve ± changes total and clamps 0–100.
V17 Performance/jank. Today open for 2 min with clock running: no memory growth in `adb shell dumpsys meminfo host.exp.exponent` beyond ~+20 MB; scrolling Today/Tasks stays smooth; opening Settings while clocks spin does not drop below ~45 fps. Hidden screens must not tick fast (Today ticks 60 s when hidden; Focus 250 ms only when focused).
V18 Orphans and races. Rapidly: tap Start/Pause 10×; toggle task done 10×; open/close Settings 10×; drag dial while the break sticker falls; swipe-delete two tasks in a row. PASS: no crash, no stuck animation, no duplicate notifications (check Delivery status count), no frozen sticker, no negative time.
V19 Android specifics. Edge-to-edge: status bar text is legible on every page (light/dark); bottom nav sits above the gesture bar; keyboard opens over sheets without covering the field (sheets lift by keyboard height); hardware back order: sheet → settings sub-page → Focus → Today → exit.
V20 Rotation/small screens. App is portrait only; on a 320 dp-wide emulator the Focus page scales (it is a 440×1001 canvas scaled by width/440) with no clipped controls; top controls clear the status bar.
</verify>

<acceptance_checklist>
A stranger can run this without asking questions. Mark every line yes/no with evidence.
1. `npm install && npm run check && npm run bundle` all exit 0.
2. App cold-starts as a standalone release build to Today with no red/yellow error.
3. V1–V20 each PASS, or FAIL with logcat + screenshot + proposed fix.
4. No horizontal page scroll at 360/390/430 dp.
5. Attendance cells measure 28 dp; one-tap-then-long-press and lock behave per V8.
6. Settings changes preview live, including inside the sheet.
7. Local notifications arrive on time within the windows in V5 and respect quiet hours, weekend, active days and during-class settings.
8. All 27 sounds audible and unclipped; master and per-group volumes work; haptics distinct and respect toggle.
9. Break sticker: swing, fall, thud, main timer resumes correctly (V10e).
10. XLSX/CSV/JSON export open correctly (V12).
11. Both themes × both palettes readable.
12. `STATE.md` updated, deviations explained.
</acceptance_checklist>

<known_risks_and_uncertainty>
State your own findings next to these; do not hide any.
R1 Nothing was run on Android. Likely failure points, in order: Focus dial gesture math (N3), react-native-svg `Pattern` with `patternTransform` (paper dots, hatch ring) rendering on Android, `mixBlendMode` on the photo texture, `transformOrigin` on the break sticker, the custom navigator's `Placed` animation timing, `Directory.pickDirectoryAsync` on a standalone install.
R2 In a standalone release build, custom notification sounds and exact-alarm behavior differ from Expo Go — verify real behavior. Reminders are local only: no server push exists (the Settings UI says so).
R3 iOS limits pending local notifications to 64; the planner caps at 60 and reports "deferred". Android has no such cap but the queue is rebuilt on every edit and on foreground; reminders more than ~14 days ahead appear only after the app is opened. No background task exists.
R4 Focus timer is not persisted across a force-kill of the app (the end-of-round notification still fires). A running-timer indicator outside the Focus page is not built.
R5 Notification action buttons (Here/Late/Missed) are NOT implemented; tapping opens the Today page. `SheetSpec` has an unused `slip` variant.
R6 Clock timezone offset is read once at module load (`MS_TZ` in `ClockFace.tsx`): a DST change while the app stays alive shows an hour error until restart.
R7 The six extra faces the user asked for from the "Clock & Watch Faces" sheet (numbers 11, 8, 13, 10, 9, 15) are NOT integrated: the supplied image is 650×960 (each face ~120 px, blurry at 124–200 dp) and 11, 13, 10, 9, 15 have hands engraved into the artwork, which would conflict with live hands. See <plates>.
R8 Dial "bed" is drawn as a ring outside the progress ring by intent; if the original mockup really intended a filled disc, the face would be hidden, so verify visually against `pomodoro.html` if present.
R9 Contrast was computed only for the refined palette (tests). The Original palette is a faithful conversion and is NOT guaranteed to pass 4.5:1. Muted text must never sit directly on the scrapbook image (measured 3.9–4.2:1); only the task card and buttons carry text there, plus the margin note which uses ink with a paper-coloured halo.
R10 Performance: `useStore((s) => s)` is used in several screens, so any store change re-renders them; Today re-renders every second while focused. Fine on mid-range devices in theory; verify (V17) and narrow selectors if needed.
R11 `SvgXml` ids: face "Scales and Lily" uses `clipPath id="sc"`; if two copies render in one tree (thumbnail + live) and the clip misbehaves, give ids a per-instance suffix in `staticSvg`.
R12 The SQLite adapter is tested against node:sqlite through a 4-method shim, not against expo-sqlite itself. `PRAGMA user_version` read via `getAllAsync` is assumed to return `[{user_version}]` on expo-sqlite.
</known_risks_and_uncertainty>

<plates>
Goal from the user: add faces 11, 8, 13, 10, 9, 15 from the engraved "Clock & Watch Faces" sheet (The Graphics Fairy, 22 PNGs, members.thegraphicsfairy.com). Do not redraw them. Needed input: the individual high-resolution PNGs (ask the user; stop and ask if absent). Plan: (1) put them in `assets/plates/plate-11.png` … ; (2) for each, measure centre and radius in pixels and write them into a `PLATES` table; (3) because 11, 13, 10, 9, 15 contain engraved hands, either get hand-less versions from the user or hide the engraved hands by masking the dial centre disc (and say so); plate 8 has no hands; (4) add a `PlateFace` component: circular mask, live vector hands from `handSvg`, dark mode via a luminance-invert `ColorMatrix`; (5) register them in `FACES` with `native:'light'`, thumbnails in Settings, test at 96/124/200 dp; (6) Metro needs literal `require()` paths: generate `src/ui/clock/plates.generated.ts` with a small script that scans `assets/plates`. This is a new dependency-free feature; adding any package requires asking the user.
</plates>

<code_notes>
N1 Adding a sound: add a generator in `scripts/synth-sounds.mjs` (`S['name'] = …`), run `npm run sounds`, add the literal `require` to `SRC`, a duration to `SECONDS`, group rule in `GROUP()`, priority in `PRIO()`, and an `fx` method. The jest test in `src/test/ui.test.ts` fails if a sound clips.
N2 Adding a setting: add to `Settings` (`src/domain/types.ts`), default in `src/domain/defaults.ts`, a control on the right page in `src/sheets/Settings.tsx`, and read it with `useStore((s) => s.settings.x)`. Persistence is automatic (`act.setSettings` → `putSettings`, values are JSON). Notification settings go through `act.setNotif`, which also triggers `resync`.
N3 Dial maths (`Dial` in `src/screens/Focus.tsx`): angle is computed in a worklet from `absoluteX/absoluteY` minus the dial centre in WINDOW coordinates, measured by `measureInWindow` on a probe View at layout and at `onTouchStart`. Because the whole page is a 440×1001 canvas scaled by `transform: scale(width/440)` with `transformOrigin: '0% 0%'`, centre measurement must happen after the transform; if the ring jumps, log `cx.value, cy.value` in `onBegin`. One full turn = 60 minutes (6° per minute); `raw` is clamped 5–240; detent fires whenever `round(raw/5)*5` changes.
N4 Reminder planner: change behaviour in `src/domain/reminders.ts` and extend `src/test/domain.test.ts` first (pure functions, deterministic `now`). `shift()` is the single place that applies quiet/active/weekend/class rules. `planReminders` never schedules anything in the past or within 5 s.
N5 New entity: add type (`types.ts`), a `Spec` in `src/data/specs.ts` (+ a migration appended to `MIGRATIONS`, never edit an old one), table list in `SqliteRepository.load/seed/reset`, `MemoryRepository`, a store action, and extend `src/test/repo.test.ts`.
N6 Clock faces: engine in `src/ui/clock/faces.ts`. `FACES` order is the Settings order. Moving parts are `SpinLayer`s (`dps` = deg/s, or `osc` for the balance wheel); hands rotate in `ClockFace.tsx` from one `useFrameCallback`. Offline render check: `npx jest src/test/faces.test.ts` writes SVGs to `/tmp/faces`; render with `@resvg/resvg-js` and the Newsreader TTF to look at them.
N7 Gears are real involutes (module 2, 20° pressure angle). `meshPhase()` solves each wheel's phase so a tooth meets a space on the line of centres; tests assert centre distance = rp+rp, speed ratio = −ωA·NA/NB, positive root clearance, and the tooth/space phase at several rotation angles. Never hand-edit `SKELETON` phases; change `RAW` and let `meshPhase` compute them.
N8 Hand-drawn outlines: `HandBox` draws a `handPath(w,h,corners,seed)`; corners use CSS elliptical-radius semantics including overflow scaling (`scaleRadii`). Keep seeds stable (string seed → `hashSeed`) so outlines do not shimmer on re-render.
N9 Selectors passed to `useStore` must return referentially stable values (a raw state field, a number, a `find` result). Returning a fresh array/object from the selector causes an infinite render loop; derive with `useMemo` instead.
N10 Do not touch: `assets/images/journal-page.jpg` (the Focus backdrop, used only on the Focus page), `assets/textures/t1.jpg|t3.jpg` (the original paper textures, selectable), the deviation ledger entries unless the user decides.
</code_notes>

<allowed_actions>
Read/edit files under `src/`, `scripts/`, `assets/sounds` (regenerate), `STATE.md`, `README.md`, `prompt.md`; run `npm run check`, `npm run bundle`, `npm run sounds`, `npx expo start`, adb commands, screenshots/screen recordings; temporarily lower `MIN_BREAK_AFTER_MS` and `NUDGE_MS` for testing and revert them; fix bugs with minimal diffs and add a jest test for every pure-logic fix. Only make changes directly requested or required to make a <verify> item pass.
</allowed_actions>

<forbidden_actions>
Do not add or upgrade a dependency, change the Expo SDK, prebuild/eject, or add a network call without asking the user first. Do not delete or rename any file in `assets/` or `src/`. Do not redesign, recolour, restyle or restructure the UI beyond what a failing check requires. Do not drop a feature or setting. Do not put `expo-sqlite` imports outside `src/data/sqlite*`. Do not edit an existing SQL migration. Do not claim anything works without a screenshot, logcat line, or tool output from this session.
</forbidden_actions>

<stop_conditions>
Stop and ask the user before: any dependency change; any schema change beyond appending a migration; replacing a clock face, bar or sound for taste rather than defect; anything that would CHANGE the test target away from the standalone release build. Stop after 3 failed attempts to fix the same defect and report what you tried. Stop if `npm run check` or `npm run bundle` starts failing and you cannot restore it in 2 attempts. Never loop on a flaky device test more than 3 times; record it as flaky with the pass/fail counts.
</stop_conditions>

<checkpoints>
After V1–V3, after V4–V7, after V8–V12, after V13–V20: commit (or save a patch), run `npm run check`, update `STATE.md` (what passed, what failed, exact next action), and post a short progress note citing real tool output.
</checkpoints>

<continue>
If you stop mid-way, write into `STATE.md`: last verification item completed, items failing with their cause, files you changed, and the exact next command. A fresh agent resumes by reading `STATE.md`, then this file, then running the first not-yet-PASS item in <verify>. Never re-derive decisions: they are in `STATE.md` and the user's words quoted in the deviation ledger.
</continue>

<report>
Reply with: (1) a table V1–V20 with PASS/FAIL/BLOCKED and one-line evidence; (2) every file changed with a one-line reason; (3) outputs of `npm run check` and `npm run bundle`; (4) remaining risks in your own words; (5) screenshots list. No claims without evidence.
</report>
````

🎯 Target: Claude Code (agentic coding agent with terminal, adb, Android emulator/phone and screen access, testing the app as a standalone release build)
💡 Front-loaded a start/target state, real file/export names, 20 checkable device tasks with timing windows, allowed/forbidden actions, mandatory stop conditions and checkpoints, and stated every known risk as uncertainty.

This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions, and stop conditions before pasting. Confirm file paths, directories, and permissions match the actual project.
