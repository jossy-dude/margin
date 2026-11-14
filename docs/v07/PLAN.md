# Margin v0.7 plan

Branch `v2-improvements`, from v0.6.0 (versionCode 5, `a8a83b3`). Research and design are in this folder:

| File | What |
|---|---|
| `SYNC_ANDROID.md` | live sync on the phone, hotspot, battery budget and how to measure it (item 1) |
| `DESIGN.md` | the v2 redesign: tokens, components, every screen, motion, mascot faces, widgets, settings (items 2, 6, 10, 12, 13) |
| `BUGS.md` | items 3, 7, 11: root causes and exact fixes |
| `DATA_MODEL.md` | course components with editable weights (item 5) and the reinstall move (item 8) |
| `SOUND.md` | removal list, new Openverse picks with licences, alarm tones (items 9, 10) |
| `screens/` | `v06-*` captures of today's app (phone and web build, Plain, light/dark, in class) |

Hard rules (docs/plan.md, CLAUDE.md): no AI attribution in commits; Gradle only in GitHub Actions; the committed
`android/` folder ships; `npm run check` before every commit; new native code means a new runtime version before any
OTA.

Sizes: **S** ≤ half a day of agent work · **M** 1–2 days · **L** 3+ days.

---

## Phases in build order (risky and unknown first)

| Phase | Goal | Ships as | Depends on |
|---|---|---|---|
| **0 · Prove** | answer the device unknowns before building on them | a throwaway `dev` APK (CI) | – |
| **1 · Hotfix 0.6.1** | stop the database error, fix Plain, fix the filter, make sure the export is ready | OTA to the installed 0.6 (JS only) | – |
| **2 · Native foundation** | everything v0.7 needs in Kotlin + migration 7, release signing | part of the 0.7.0 APK | 0 |
| **3 · Sync, Android side** | Margin as the phone's sync hub (with the Obsidian planner's hub) | 0.7.0 APK | 0, 2, desktop hub ready |
| **4 · Design system v2** | tokens, fonts, sky, glass, bubble, nav island, face | 0.7.0 | 2 (fonts/sky assets) |
| **5 · Screens** | every screen rebuilt on the system; components UI; reminders; alarms picker | 0.7.0 | 4, migration 7 |
| **6 · Sound** | new set, SoundPool, alarm tones, notification channels | 0.7.0 | 2 |
| **7 · Widgets** | Now, Day, Due | 0.7.0 | 2, 4 tokens |
| **8 · Release** | review, device test, the move to the release key, battery days | 0.7.0 APK | all |

Phases 3, 4 and 6 can run in parallel after 2. Phase 5 waits for 4.

---

## Phase 0 · Prove (device spikes)

One `dev`-variant APK (`app.marginalia.planner.dev`, installs beside the real app, no data at risk) with a hidden
"Spikes" page. Built by `release-apk.yml variant=dev`; the owner installs it. Results go into `SYNC_ANDROID.md`.

| # | Question | How | Decides | Size |
|---|---|---|---|---|
| P0.1 | Does a `connectedDevice` foreground service start at boot and survive a day on One UI 5.1 with Battery Saver on? | dormant service + `BOOT_COMPLETED`; check `dumpsys activity services` after 24 h; Margin in "Never sleeping" vs not | service lifecycle | S |
| P0.2 | S1: can a hidden app reach `127.0.0.1` under Battery Saver? | spike server in the dev app; phone Obsidian sends after `hidden` (with the Obsidian planner) | whether O flushes edits on hide | S |
| P0.3 | S4/S5: hotspot: interface name, address, AP broadcast, inbound connection from the desktop, NSD on the AP | turn hotspot on, desktop joins, spike page lists `NetworkInterface`s and accepts a socket on the AP address | hotspot design | S |
| P0.4 | SAF speed | write/read 200 × 4 KB files in `<vault>/.margin/bench/` via path-built document URIs vs `File` with All-files access | default vault writer | S |
| P0.5 | S2: does open phone Obsidian notice a file changed on disk by another app? | Margin writes a scratch note while Obsidian shows it | may Margin write while O is connected | S |
| P0.6 | RemoteViews on the A51: responsive size map, `RemoteCollectionItems`, checkbox response, counting-down `Chronometer` | a test widget | widget plan | S |
| P0.7 | SoundPool latency and AudioTrack count vs today's 16 ExoPlayers | play all UI sounds rapidly; `dumpsys audio` | sound engine | S |
| P0.8 | Battery baseline day | `dumpsys batterystats --reset`, a normal day, read u0a240 | the budget's "before" | S |

Acceptance: every row has a measured answer written down; anything that failed has a fallback chosen before Phase 2.

---

## Phase 1 · Hotfix 0.6.1 (OTA, JS only)

| Item | What | Where | Approach | Acceptance | Size |
|---|---|---|---|---|---|
| 11 | "native database reject" | `src/data/sqlite.ts`, `sqliteExpo.ts`, `store/persist.ts`, `services/problems.ts`, `sheets/Diagnostics.tsx` | reconnect-and-retry once on a lost connection; grouped Problems; readable toast (BUGS.md #11) | unit tests in BUGS.md; reboot test on the phone: no toast | M |
| 3 | Plain doubling + gap | `src/screens/Today.tsx`, `src/ui/kit.tsx` (`Txt`) | compact live row; Plain line height from the drawn size; no clock overlap in Plain (BUGS.md #3) | Plain shots light/dark at 412 and 320 dp | S |
| 7 | "All" filter | `src/screens/Tasks.tsx`, `domain/types.ts`, `defaults.ts`, `ui/kit.tsx` | `Open | Done` segmented, subject drop chip, sort button (BUGS.md #7) | one control row; first task ≤ 230 dp | S |
| 8 | export ready for the move | `services/export.ts` | confirm `margin/2` round-trips on a copy of the owner's data shape: courses, variants, meetings, attendance (with whys), marks, tasks, notes, focus, alarms in settings, archived terms | `import-roundtrip.test.ts` with a v0.6 fixture; counts equal | S |

Runtime stays 0.6.0 (JS only), published with `ota-publish.yml` after `npm run check`.

---

## Phase 2 · Native foundation (0.7.0 APK)

| ID | What | Where | Approach | Acceptance | Size |
|---|---|---|---|---|---|
| N1 | Version and runtime 0.7.0, versionCode 6 | `app.json`, `version.ts`, `build.gradle`, `strings.xml`, `native-config.test.ts` | together (RELEASING.md §4) | test green | S |
| N2 | Release signing for real + certificate pin | `release-apk.yml`, `docs/RELEASING.md` | owner sets the four secrets; CI runs `apksigner verify --print-certs` and fails on a different SHA-256 | a `release` run passes; a wrong key fails | S |
| N3 | Migration 7 | `src/data/specs.ts`, `sqlite.ts`, `memory.ts` | components (`kind`, `weight`, `is_base`, `scale`, `att_goal` + base rows), `task.ord`, `meeting_override` table (one-off moves from Week drag: `id, meeting_id, date, new_date, new_start, new_end, room, cancelled`) (DATA_MODEL.md) | `migration-v07.test.ts` on a v6 fixture: keys and marks untouched | M |
| N4 | Kotlin module layout | `modules/margin-native/android/...` | new files `SyncService.kt`, `SyncServer.kt` (Java-WebSocket), `SyncClient.kt` (OkHttp), `SyncStore.kt` (`sync.db`), `Net.kt` (Wi-Fi fingerprint, hotspot), `VaultWriter.kt` (SAF), `Sfx.kt` (SoundPool), `ExtReminders.kt`; `build.gradle` adds `org.java-websocket:Java-WebSocket:1.6.0`; diff-match-patch is vendored as one Java source file (Apache-2.0) | `native.yml` compiles | M |
| N5 | Manifest | module `AndroidManifest.xml` | `FOREGROUND_SERVICE_CONNECTED_DEVICE`, `CHANGE_NETWORK_STATE`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, service `foregroundServiceType="connectedDevice"`, JobService | `native-config.test.ts` pins them | S |
| N6 | Alarm sound engine | `Alarms.kt`, `res/raw/` | chosen tone from settings (system or bundled), 15 → 100 % ramp over 45 s, vibration after 20 s; new `previewTone(id)` / `stopPreview()` for the in-app picker; `ringNow` always starts `AlarmActivity` too (it can always be dismissed) | test ring stops by Stop / double-tap / volume key / leaving; full-screen page on an unlocked phone | M |
| N7 | `setAgenda` → widgets and `updatePeriodMillis` | `res/xml/mg_widget_*.xml`, `Surfaces.kt` | `updatePeriodMillis="0"` (today's 30 min wakes the phone 48× a day); updates come from `TICK` and data changes | `dumpsys alarm` shows no widget wakeups | S |

---

## Phase 3 · Sync, Android side (item 1, with the Obsidian planner)

Everything in `SYNC_ANDROID.md`; protocol in `vault-sync/docs/v07/SYNC_PROTOCOL.md`.

| ID | What | Approach | Acceptance | Size |
|---|---|---|---|---|
| S1 | `SyncService` dormant/ready/live state machine | §4 of SYNC_ANDROID.md; started at boot, app launch, `TICK`/alarm receivers | 24 h: alive, zero wakeups while dormant | M |
| S2 | Network detection | `NetworkCallback` + `LinkProperties` fingerprint; NSD fallback; hotspot via AP broadcast + interface | home, away, hotspot all detected within 2 s of the change | M |
| S3 | Pairing | Settings → Sync → "Pair with desktop": scan the hub's QR (or type the 8-word phrase); keys in Android Keystore; then a 6-digit code for phone Obsidian | paired once, survives reboot | M |
| S4 | Client to hub (OkHttp) | hello/cursor/deltas/acks/outbox; backoff; ping on screen-on only | edit on desktop → visible in phone Obsidian ≤ 2 s after unlock | L |
| S5 | Loopback server for phone Obsidian (Java-WebSocket, 127.0.0.1:7429) | O ⇄ M relay; Margin keeps the cursor | edit on phone → desktop ≤ 2 s on home Wi-Fi | M |
| S6 | Hotspot server | bound to the AP address while the hotspot is on; the desktop dials | hotspot session syncs both ways live | M |
| S7 | Vault writer (O closed) | path-built SAF URIs, tmp + rename; or All-files mode per P0.4 | 50 incoming edits applied while Obsidian is closed; Obsidian shows them on open | M |
| S8 | Merge port | diff-match-patch Java + json3 Kotlin port; shared fixtures with `sync-core` | every fixture passes in both | M |
| S9 | Bridge rows and timer | JS `Sync.pushBridge` (750 ms debounce) replaces `src/store/vault.ts`'s 30 s interval; `inbox` applied on foreground; focus timer is H's single timer, the phone rings at `endsAt` with an exact alarm | starting a timer on the desktop shows on the phone; ring once | M |
| S10 | Item 4: Obsidian reminders | below | | M |
| S11 | Diagnostics → Sync | live/dormant, peers, last sync, bytes, catch-ups, errors per day | visible | S |
| S12 | Battery acceptance | SYNC_ANDROID.md §8 | ≤ 5 mAh/day added | S |
| S13 | Retire GitSync and the 30 s file bridge | after a week green (SYNC_PROTOCOL.md §14) | GitSync uninstalled by the owner | S |

### Item 4: due notifications for non-school Obsidian tasks, without cluttering Margin

| Part | Design |
|---|---|
| What is sent | the margin-bridge plugin sends **every open task with a ⏰ time** (Bone Tasks grammar), not only `#school` ones, with `scope: 'school' | 'other'` (school = has the tag or lives in `Margin/Tasks.md`) (Obsidian planner's side) |
| Where it goes | `scope: 'school'` → Margin's task table as today (`fromBridgeTask`). `scope: 'other'` → the Kotlin `ext_reminder` table in `sync.db`, **never** the task list, Today's Due, Stats or widgets |
| Who schedules | the native side, so it works even when the JS app never runs (a task can arrive over sync while the phone sleeps): `setExactAndAllowWhileIdle` at the ⏰ time (Margin holds `USE_EXACT_ALARM`), nearest 20 kept armed, re-armed on boot and on every sync. Separate from the JS planner's 60-reminder cap |
| Channel | "Obsidian tasks" (`obsidian_v2`, sound `n_task.ogg`), respects quiet hours from Settings |
| Notification | title = task text, body = note name; actions **Done** (marks it done in `ext_reminder`, sends a `bridge` row so Obsidian ticks the line), **1 h later**, tap = `obsidian://open?vault=<name>&file=<path>` |
| Where the owner sees them | Settings → Reminders → Obsidian tasks: on/off, the next ten, "also date-only tasks at [08:00]" (off by default) |
| No double ring | Bone Tasks skips its own phone notifications while the bridge is fresh (< 1 day), as BRIDGE.md already says |
| Acceptance | a non-school task with ⏰ 10 min ahead, made on the desktop while the phone is locked on home Wi-Fi: rings on time after the next catch-up; it is not in Margin's To-do; "Done" ticks it in Obsidian |

---

## Phase 4 · Design system v2 (DESIGN.md §3–4)

| ID | What | Where | Acceptance | Size |
|---|---|---|---|---|
| U1 | Tokens (type, colour, space, radius, motion) | `src/tokens/theme.ts` (rewritten), `src/tokens/motion.ts` | contrast test: every text token ≥ 4.5:1 on glass over the brightest and darkest sky | M |
| U2 | Fonts: Inter + Literata only | `App.tsx` font load, `package.json` (drop 9 font packages) | `[margin-boot] fonts` < 400 ms on the A51 | S |
| U3 | Sky ground | `src/ui/Sky.tsx`, `assets/sky/*.webp` (12 baked images) | cross-fade at period change; Still/Off settings | M |
| U4 | Glass card (collapsible), Sheet, Snackbar, Row, Buttons, Segmented, DropChip, Field, Switch | `src/ui/kit/*` (split `kit.tsx`) | storybook-style test page in the web build | L |
| U5 | Bubble, BubbleRow, BubbleTrack | `src/ui/Bubble.tsx` | a11y: each bubble has a label; row long-press | M |
| U6 | Nav island with "+" and collapse on scroll | `src/navigation/Book.tsx`, `src/ui/Island.tsx` | no content hidden under it at the end of any list | M |
| U7 | Face (mascot) | `src/ui/mascot/faces.ts`, `Face.tsx`; delete `Jot.tsx`, `scrap-rig.ts`, `assets/paper/scrap-*` | 12 faces render; morph between any two | M |

Mascot replacement, every place Jot appears today:

| File:line | Today | v0.7 |
|---|---|---|
| `src/onboarding/Onboarding.tsx:14-15, 175, 241` | Jot 160 px, gaze, cues, "Hi, I'm Jot." | `Face` per page (DESIGN.md D-22); copy "Hi, I'm Jot" can stay (the face keeps the name) |
| `src/screens/common.tsx:7-9, 58` (`Empty`) | Jot 62 px with a mood | `Face` 64 dp, face per message |
| `src/screens/Today.tsx:487, 511` | `mood="sleepy"`, `"happy"` | `sleepy` → `sleepy`, `happy` → `cat` |
| `src/screens/Tasks.tsx:49` | `curious` / `happy` | `surprised` / `cat` |
| `src/screens/Grades.tsx:82` | `curious` | `wink` |
| `src/screens/Stats.tsx:6, 65` | Jot 84 px | top-bar face; `smirk` |
| `src/screens/Focus.tsx:9, 284` | Jot proud, hop | `content` → `laugh` at round end |
| `src/sheets/AboutPage.tsx:5, 39, 62` | Jot hop on star | `wink`; "A star makes Jot smile" |
| `src/sheets/Diagnostics.tsx:5-6, 38` | mood/cue tester | face tester (all 12 + morph) |
| `src/sheets/Settings.tsx:225, 428` | "Five pages with Jot" | unchanged copy |
| new: top bar of every tab, snackbars, alarm page, widgets | – | DESIGN.md D-21 |

**U7 status (2026-11-14): integrated** (`e4c3fa5` faces, `82eeac4` one face per page, `8a1a334` reactions, `3e45272` Jot
removed, `7f14e36` alarm). Open: Today's top-bar face and Today's reactions (with R1), widget faces (with G1–G4), a tip
text for the top-bar tap. Handoff: `polish-pass/handoff/mascot/`.

---

## Phase 5 · Screens (DESIGN.md §5)

| ID | Item | Screen | Where | Acceptance | Size |
|---|---|---|---|---|---|
| R1 | 12 | Today | `src/screens/Today.tsx` (rewrite) | in class, between, before, after, none, two-at-once, picked day: shots light/dark; current class appears once | L |
| R2 | 12 | Week + drag | `src/screens/Week.tsx` + `ui/DragCard.tsx` | drag to a new slot → "This week only / Every week" → saved; reduce-motion still works (tap → "Move…" sheet) | L |
| R3 | 12, 7 | To-do + reorder | `src/screens/Tasks.tsx` | "My order" persists across restarts; swipe done/delete with Undo | M |
| R4 | 5, 12 | Grades with components + split editor | `src/screens/Grades.tsx`, `sheets/CourseSheet.tsx`, `domain/grades.ts` (`courseGrade`, `courseNeeded`) | DB 70/30 example gives the hand-computed numbers; one-component courses unchanged | L |
| R5 | 12 | Stats | `src/screens/Stats.tsx`, `domain/analytics.ts` per component | per-component attendance against its own goal | M |
| R6 | 12 | Focus | `src/screens/Focus.tsx` | same engine tests pass | M |
| R7 | 12 | Sheets (+, task, class, mark, attendance) | `src/sheets/forms.tsx`, `AddSheet.tsx` | component pickers; no steppers anywhere (grep test) | M |
| R8 | 13 | Settings v2 + search | `src/sheets/Settings.tsx` → `src/sheets/settings/*` + `settingsIndex.ts` | every v0.6 setting reachable; search finds "quiet" → Quiet hours | L |
| R9 | 10 | Reminders page (rules + templates) | `src/sheets/Reminders.tsx`, `domain/reminders.ts` (anchors), `settings.reminders` | "1 h before first class" moves with the timetable; quiet hours respected | M |
| R10 | 10 | Alarms + ringtone picker + stop | `src/sheets/Alarms.tsx`, native N6 | owner can stop every test sound three ways | S |
| R11 | 8 | Onboarding with "Bring my data back" | `src/onboarding/Onboarding.tsx`, `services/backup.ts` | restore of the owner's export on an empty install shows equal counts | M |
| R12 | 8 | Automatic weekly backup | `services/backup.ts`, Settings → Your data | four rolling files in the chosen folder | S |

---

## Phase 6 · Sound (SOUND.md)

| ID | What | Acceptance | Size |
|---|---|---|---|
| A1 | delete the 28 old files + credits; `scripts/sounds/build.mjs` (fetch / build / measure / audition) | `output/sounds-audition/index.html` regenerated; the owner keeps or swaps each | M |
| A2 | `Sfx.kt` SoundPool + `audio.ts` rewrite; 4 sound groups | no ExoPlayer at start (logcat); taps feel instant | M |
| A3 | alarm tones in `res/raw`, picker, ramp | owner picks a tone that wakes him | S |
| A4 | new notification channels with sounds (`classes_v2`, `tasks_v2`, `focus_v2`, `obsidian_v2`); old channels deleted | each channel shows its sound in Android settings | S |

## Phase 7 · Widgets (DESIGN.md D-24)

| ID | What | Acceptance | Size |
|---|---|---|---|
| G1 | **Now** 2×1 → 4×2 with counting-down `Chronometer` | never shows a stale time | M |
| G2 | **Day** 4×2 → 4×4 (keeps the `BoardWidget` provider so a placed widget survives) | all states from the table | M |
| G3 | **Due** 2×2 → 4×2 with checkbox bubbles | ticking a bubble marks the task done with the app closed | M |
| G4 | previews, dark mode, Settings → Widgets "Add to home screen" for each | picker shows three | S |

## Phase 8 · Release

| Step | Who |
|---|---|
| Review: user-tester + senior-dev agents (docs/plan.md §8); triage with the owner | agents, owner |
| `release-apk.yml` tag `v0.7.0` → release-key APK | owner says go |
| The move: export in 0.6 → uninstall → install 0.7 → "Bring my data back" → re-grant permissions → re-pick vault → re-add widgets (DATA_MODEL.md Part 2) | owner, with the checklist |
| Two battery days (sync off/on) and the sync acceptance (SYNC_ANDROID.md §8) | owner + agent reading adb |
| Device checklist §V07 in `docs/DEVICE_CHECKLIST.md` | owner |

---

## Found issues (not on the owner's list)

| # | Issue | Evidence | Fix | Phase |
|---|---|---|---|---|
| F1 | The Obsidian file bridge lists the **whole vault root** over SAF every 30 s and logs two `DocumentFile … Unsupported Uri` warnings per tick | `src/services/vaultFiles.ts:35-38`, `src/store/vault.ts:55`, logcat pid 6412 | path-built URIs now; replaced by S9 | 1/3 |
| F2 | 16 ExoPlayers + 16 MediaSessions created at start for UI sounds; 345 ms `AudioManager` lock; `Skipped 47 frames` | logcat 22:54:15-18 | SoundPool (A2) | 6 |
| F3 | Fonts take 1,736 ms of a 2,550 ms first frame (17 files) | `[margin-boot]` line in logcat, Diagnostics | Inter + Literata only (U2) | 4 |
| F4 | The widget's `updatePeriodMillis="1800000"` wakes the phone every 30 min (48×/day) although `TICK` already redraws at class boundaries | `res/xml/mg_widget_board.xml` | 0 (N7) | 2 |
| F5 | The save-error toast is cut at 60 characters, hiding the cause | `persist.ts:24` | BUGS.md #11 | 1 |
| F6 | Today's card says "Free day · Rest day · Day complete" in the evening of a day that had three classes | `screens/v06-web-plain-dark-today-evening.png`, `deckOf()` title | "Done for today" when the day had classes (R1; one line in 0.6.1) | 1 |
| F7 | "Period 1 of 3" clips to "Period 1 …" in Plain | `screens/v06-web-plain-today-inclass.png` | BUGS.md #3 | 1 |
| F8 | Notebook ruling and the red margin line draw behind Plain, through headers and lists | web shots | Plain draws no paper (U3 replaces it) | 1 |
| F9 | The FAB covers the right side of the last visible card on every tab | web shots | "+" moves into the nav island (U6) | 4 |
| F10 | "Teacher's count" is a `− / +` stepper (v0.5 brief banned steppers) | `screens/v06-web-plain-dark-grades.png` | numeric field (R4) | 5 |
| F11 | Grades legend still lists "late entry" and "sick" letters after v0.6's Present/Absent/Cancelled | same | bubble legend (R4) | 5 |
| F12 | Settings → Theme's "Palette" control switches the style away from Plain without saying so | `Settings.tsx:243` | removed (R8) | 1 |
| F13 | Reanimated `synchronouslyUpdateUIProps failed … Unable to find SurfaceMountingManager` ×8 at start: animations still writing to unmounted SVG views | logcat 22:54:24 | cancel animations on unmount in the Face/clock components (U7) | 4 |
| F14 | The phone's hotspot is **open (no password)** | SPIKE.md, desktop NetworkManager log | owner sets WPA2/WPA3 (Question 5) | – |
| F15 | GitSync's token is rejected (STATE.md) and the desktop token expires 2026-11-19 | memory, STATE.md | retire GitSync after sync is green (S13) | 3 |
| F16 | Margin is not in Samsung's "Never sleeping apps"; widgets and the pin may be delayed when it sleeps | Settings → Battery (owner to check) | onboarding step (R11) | 5 |
| F17 | `expo-dev-client` is a production dependency; verify it adds nothing to `release` APKs (size, startup) | `package.json` | move to a dev-only install path or confirm stripped | 2 |
| F18 | `FirebaseApp` init warning at every start (expo-notifications without google-services) | logcat | harmless; confirm it costs < 5 ms or remove the provider via manifest `tools:node="remove"` | 2 |
| F19 | Attendance key embeds the meeting's start time: editing a class time orphans past attendance of that slot (it is keyed `date|start|course`) | `domain/attendance.ts:43` | the one-off move table (N3) stores moves without rewriting keys; editing a recurring time asks "from now on" and keeps old keys | 5 |
| F20 | Auto Backup cannot restore across the key change (signature-matched); the UI text "Auto Backup may not restore it" understates it | Settings row | text: "A reinstall with a new key needs your export" until v0.7; then automatic backups (R12) | 1 |

---

## Decisions (made while building, from 2026-11-13)

All eleven questions below were answered with the recommendation (owner's standing approval). Judgement calls:

| # | Decision | Why |
|---|---|---|
| B1 | Phase 1 does **not** ship as an OTA to 0.6. The fixes go into 0.7.0 (the branch's runtime is now 0.7.0, N1) | the owner said to skip OTA publishing tonight; the reconnect fix (#11) was committed first and alone, so it can be cherry-picked onto a 0.6.1 OTA later |
| B2 | BUGS #3 (Plain doubling and gap) is **not** patched in the 0.6 Today screen | Question 2's answer (one look) removes Plain, and R1 rewrites Today with the current class shown once; patching a look that is about to be deleted is wasted work |
| B3 | Networks are keyed by a `LinkProperties` fingerprint (SYNC_ANDROID §3), and the manifest has no location permission; a test pins that | owner's rule: SYNC_ANDROID wins on Android |
| B4 | Phase 0 spikes are folded into the 0.7 dev build instead of a separate throwaway APK: `syncNetworks()` (P0.3), the fast/SAF vault writer (P0.4) and the sync counters are in the real code and are read from Diagnostics | one APK for the owner to install instead of two; nothing in them touches the real app's data (the `dev` variant installs beside it) |
| B5 | Margin does not merge text itself yet (S8 deferred): when a file changed on the phone while the hub also changed it, Margin sends its version with the old base and the **hub** merges (`sync-core` merge3, the same rules) | with GitSync retired nothing but phone Obsidian edits the phone vault, and O sends through the hub anyway; a Kotlin port of the merge only matters for offline edits made with Obsidian closed, which cannot happen |
| B6 | The sync notification is its own silent `IMPORTANCE_MIN` channel "Sync with your desktop" for now, not merged with the class pin | merging into `Surfaces.kt`'s pin is a UI change that wants the owner's eyes on the phone; the silent channel costs one collapsed line |
| B7 | Phone Obsidian's key is `HKDF(6-digit code, salt "bone-sync/1 local", info "bone-sync/1 obsidian")`; the code is valid 10 minutes; 5 wrong proofs ban loopback logins for 10 minutes | the loopback port is reachable only from apps on the phone; 20 bits behind a ban is enough there, and no key ever travels |
| B8 | margin-bridge 0.7 is built (`node build.mjs`) but **not yet copied into the vault**: the vault copy stays 0.6 until the dev APK has passed a phone check | the installed bridge is the owner's working setup; 0.7 drops the 30 s polling, so it should go in together with the Margin build that replaces it |
| B9 | `vault-sync` got its own local git repo (no remote) for sync-core and the daemon | history for the desktop side; nothing is published |

## Questions for Jossy

Numbered; each has my recommendation. Everything else I have decided (implementation, diagnostics, minor UX).

| # | Question | Recommendation |
|---|---|---|
| 1 | The v2 look: **Daylight sheet** (sky behind everything, soft glass, bubbles for every yes/no) or **Departures** (a station board for classes) | **Daylight sheet**. It is your vault's language (living sky, soft panels) applied to a planner, and calmer |
| 2 | Keep the Collage and Notebook looks as options, or ship one look? | **One look.** Dropping them removes 12 font files (≈ 1.3 s of start-up), the paper engine and two sets of tests to keep in sync. PRODUCT.md's "hand-cut paper world is binding" line gets replaced |
| 3 | Switch to your own release key with v0.7 (one export → uninstall → install → restore, 5 minutes), or sign v0.7 with the old public debug key and switch later? | **Switch now.** Anyone can sign an "update" with the public key today; v0.7 is the natural moment; the restore path is built into onboarding |
| 4 | Sync only on home Wi-Fi and your hotspot, never on mobile data? | **Yes**, home Wi-Fi + hotspot only |
| 5 | Put a password on the phone's hotspot (it is open now)? | **Yes**, WPA2/WPA3; frames are encrypted anyway, but strangers should not join |
| 6 | Which Obsidian tasks should ring from Margin: only tasks with a ⏰ time, or also date-only tasks at a set hour? | **⏰ only**, with "date-only at 08:00" as an option, off |
| 7 | If the SAF benchmark is slow, may Margin use "All files access" for the vault (one system switch)? | **Yes, if it measures > 30 ms per file**; otherwise stay on SAF |
| 8 | Widgets: three (Now, Day, Due) replacing today's single board? | **Yes**; your placed board widget becomes Day automatically |
| 9 | Week drag: also support "this week only" moves (needs a small new table), or only permanent moves? | **Both**: a cancelled or moved lab this week is common |
| 10 | Remove the analog clock from Today (the sky and countdown carry time; the clock stays in Focus and the widget)? | **Yes** |
| 11 | UI sounds: taps and page sounds off by default, marks/done/focus sounds on? | **Yes** (calm by default; you can turn taps on) |
