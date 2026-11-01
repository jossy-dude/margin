# Margin v0.5: release design

**Date:** 2026-11-01 · **Status:** approved by the owner on 2026-11-01 ("don't ask me anything"), with the O7 changes · **Source of truth:** `docs/plan.md` (the owner's brief)
**Plan:** `docs/superpowers/plans/2026-11-01-v05-release.md`
**Supersedes:** `docs/superpowers/specs/2026-10-28-v09-release-design.md`. That spec was read for intent and owner feedback only. None of its workstreams is followed or treated as done.

v0.5 is Android only. `ios/` is not touched.

---

## 1. How this was found

The Phase 0 reading covered the files the brief names: `tokens/theme.ts`, `ui/kit.tsx`, `ui/PaperBg.tsx`, `ui/hand.ts`, `services/fx.ts`, `services/haptics.ts`, the data types and migrations, and `domain/archive.ts`. It also covered the before photos in `docs/references/v0.3.1/` (Today, the "+" sheet and Focus in particular). Four read-only audits ran alongside:
1. foundation: store, data layer, reliability, efficiency, extreme cases;
2. the post-v0.3.1 commits (`e3579be`, `fc5beda`, `1dfe839`, `0c38b88`) and the uncommitted OTA fix;
3. the current state of every surface the brief names;
4. web research on the native dependencies (Rive, live notifications, Do Not Disturb, Glance).

The audits' findings are summarised in the tables below with `file:line` references, where they matter.

**Baseline gate (2026-11-01):** typecheck red, with 5 errors at `src/test/ota-loop.test.ts:169-177`. Jest has 2 failures out of 1,194 tests across 73 suites, both in `ota-loop.test.ts`. Both come from the half-done OTA fix, as the brief says.

### What each piece is trying to be (the intent this release keeps)

| Piece | What it is trying to be | How v0.5 makes it truer |
|---|---|---|
| Paper (`PaperBg`: base colour, ruling, grain or photo texture) | A sheet of real stationery under every pixel. It never flashes, and textures tile at their natural size. | Paper that reacts to light: warmer cream, ink that soaks in slightly. A dark theme that reads as **dark paper** (charcoal card stock), not a grey UI. The grain's strength is tuned per theme on the device. |
| Rulings (dots / grid / ruled / plain) | Notebook formats a student actually buys. | Ruled gets its red margin line in every palette. Line weights follow real printed rulings (a hairline at 1 px, never heavier). The pitch matches the type's line height, so handwriting sits on the lines. |
| `HandBox` cards and tape (`ui/hand.ts`) | Hand-cut paper: an elliptical wobble with low-frequency noise, so each edge reads as a scissor line, not as jitter. Tape is a translucent strip holding a slip down. | Cut edges keep their seeded wobble. Tape gets a torn end and a faint lift shadow. On a phone, wobble amplitude is capped at small sizes so 1-px lines don't fizz. |
| Four fonts and the pens | Caveat for handwriting, Newsreader for body text, Permanent Marker for headings, Special Elite as a typewriter for numbers. A pen is the one accent ink. | Each pen has its own ink in **both** themes: warm sepia, graphite, red and blue. Ink is slightly translucent on paper and fully opaque on the deck. Fonts stay. |
| Clock faces (5) and instruments (16 plus the glass) | Measured instruments, not decorations. They read the real clock and the real period length. | **One rule for every bar: elapsed time is dimmed ink** (the spiral, D12). No sliding dots. |
| Sounds and swipe-to-crumple | Paper being handled: a place, a shuffle, a stamp, a crumple and a thud. | Every action fires its sound and its haptic **together, from one call**. Sounds actually play (section 4, K). |

## 2. Owner decisions (Phase 0, asked one at a time)

| # | Question | Decision |
|---|---|---|
| O1 | How do we cover both the key switch and "data survives an install over the old version"? | **Two-step device test.** (1) Install a **debug-key** v0.5 over the installed app (v0.1.0 per O9), which proves the migration on real data. (2) Export, uninstall, install the **release-key** v0.5, and import. |
| O2 | What should `main` become? | **Replace it.** Tag the old main `archive/old-main`, then point `main` at `v2-improvements` with a force-push, **at release time only, on the owner's go-ahead**. |
| O3 | Where does the sample semester fit in the new onboarding? | **A fourth door** on the data page: Import · Paste · Set up by hand · Explore with a sample semester. The legend page renders live components from sample data, held in memory. Choosing the sample saves it with `demo` flags, and a quiet "Remove sample data" note appears on Today and in Settings. |
| O4 | What did "adding 2 classes broke the app" look like? | **Two classes in the same time slot.** |
| O5 | What sounds play on the phone today? | The owner said: *"Everything yourself, I will connect mobile and test here."* The agent decides diagnostic and implementation questions itself, and the owner tests on the phone. |
| O6 | Which mascot? | *Revised by O7.* The owner first chose "ship now, remix later" with a pencil placeholder, then asked for a more relevant mascot instead. |
| O7 | Owner direction (second round) | **Pick a better mascot that fits the app, not necessarily a pen. Improve the sound itself, not just its playback. Include every UI surface in the design work. Don't ask the owner anything more; install the mobile MCP and test the current app on the phone.** |
| O8 | Mascot (the agent's choice under O7) | **Teddy, "Animated Login Screen" by JcToon** (rive.app/community/2244-4437, **CC BY 4.0**, remix allowed). The `Teddy` artboard has the `Login Machine` state machine, with inputs `numLook` (0–100, gaze), `isChecking`, `isHandsUp`, `trigSuccess` and `trigFail`. It is Rive's best-documented interactive character, and its inputs match onboarding exactly: the eyes follow your finger and the name as you type it, it celebrates when you finish, and it reacts gently to a failed import or a denied permission. It is presented as a **taped, hand-cut paper sticker** (HandBox frame, tape, paper shadow), so it lives in the paper world as a desk study-buddy. The `.riv` file is an asset, so a restyled remix can arrive by OTA. |
| O9 | Device baseline (adb, 2026-11-01) | The owner's phone (Galaxy A51 5G, Android, 1080×2400 at 420 dpi) runs **v0.1.0 (versionCode 1)**, not 0.3.1. Its database therefore has **migrations 0–2 only**. O1's step 1 is a debug-key v0.5 installed **over 0.1.0**. **Sound never plays:** `dumpsys audio` shows 40 player events from Margin's uid, all `stopped` and **none `started`**, with media unmuted. The real data has "Database" with rooms "LR-601, LR-303" in one string, plus a separate subject "Database LAB", which is exactly the rooms and variants case. Diagnostics shows 2 entries; both are the built-in test crash. Week blocks are too small to read on the device. The theme is set to Light. |

**Rive runtime finding (brief C, raised before choosing):** `rive-react-native`, the package the brief names, is now **legacy, and broken under the New Architecture**:
- #437: under bridgeless mode, no events reach JS;
- #431: about 68 MB of GPU memory leaks per mount;
- #444: an ANR with Reanimated.

Rive's official replacement, **`@rive-app/react-native` 0.5.9**, is Nitro-based and MIT-licensed. It was released on 29 Oct 2026, supports RN 0.78+ and the New Architecture, and is actively maintained. v0.5 uses it, with `react-native-nitro-modules` pinned to 0.36.x (its peer range is `>=0.35.10 <0.37`).

## 3. Must-ship versus can-slip

| Rank | Items |
|---|---|
| **Must ship** (P0) | A foundation · B1 OTA (including the runtime bump) · B2 data survives updates · B3 Auto Backup and the export nudge · B4 import · B5 semesters · D the "+" sheet · E subjects · F inputs · G Today · H the Focus **screen** · I notification redesign, per-event controls and the permission ask in onboarding · J themes, ink and texture · K sound and haptics · N every existing feature · §10.1 signing · §10.2 the OTA workflow · §10.4 archiving the stale docs · §10.5 CI on the branch |
| **Must ship with a fallback** (P1) | C onboarding with the Rive mascot (Teddy, O8). If the Rive runtime fails in CI or on the device, onboarding ships with a still frame of Teddy exported from the `.riv` file (not hand-drawn), and the live mascot moves to v0.6. Onboarding itself never slips. |
| **Can slip to v0.6** (P2) | L the widgets · I the **pinned live countdown** · H **Do Not Disturb**. All three are native and can only be proven on a phone. No P0 item waits on them. |

**Native batch:** everything native ships in **one** v0.5 APK, built in GitHub Actions:
- Rive and Nitro;
- the in-repo `margin-native` Expo module (the live countdown, Do Not Disturb, and the widget data bridge);
- the Glance widgets;
- release signing;
- manifest cleanup and the backup rules;
- runtime version 0.5.0.

After that APK, changes arrive by OTA.

## 4. Requirements: why, current state, approach

### A. Foundation (Phase 1)

| # | Requirement | Current state | Approach |
|---|---|---|---|
| A1 | Gate green first | Typecheck red, 2 jest failures, all in the OTA fix | Finish the OTA fix inside B1's rewrite: type `live`, wire the hook, seed About. Replace the source-string pin (`ota-loop.test.ts:153`) with a render test. |
| A2 | Split `store.ts` (643 lines) | Every action, effect and lifecycle hook is in one module | A barrel `store/index.ts` with the same exports, over these modules: `core`, `session` (repo, boot, hydrate, adopt, reset), `persist`, `toast`, `ota`, `reminders`, `lifecycle`, `semesters`, `actions/{nav,settings,entities,timer,import}`. Cross-calls import functions directly instead of going through `act.*`. Exported names stay fixed: `act`, `getState`, `useStore`, `hydrate`, `stopResync`, `set`, `toast`, `dismissToast`, `resync`, `boot`, `wireLifecycle`, `useUpdateAnnouncement`, `snapshotOf`, `refreshNotifStatus`, `notificationAccent`, plus the types. |
| A3 | Split `importPlan.ts` (1,066 lines) | Three readers (raw, compact, CSV), each with its own merge rules | `domain/import/{types,coerce,normalise,json,csv,counts,index}.ts`. **One normaliser per entity**, shared by every reader (see B4). |
| A4 | Fix the layering leak | `data/sqlite.ts:5`, `services/safety.ts:4` and `store.ts:7` import `ui/crashlog`, which has no React in it | Move it to `services/problems.ts`. `SqliteRepository` takes an injected `report()` port. New depcruise rules: `data-not-up`, `services-not-ui`, and rule 3 widened to cover `src/sheets`. |
| A5 | Optimistic writes with no rollback (D5) | About 20 sites set state before the write and only toast when it fails | One `optimistic(apply, write, revert)` helper. It **reverts on a write failure**, toasts honestly, and records the failure in Problems. Awaited sequences such as `purgeDemo`, `setSemesterRange` and roll-over use `persistOrThrow`. |
| A6 | The write queue | `schedNotif`, `logNotif`, `notifLog` and the outbox bypass `ser()`. An unqueued statement that runs during another job's `BEGIN` is rolled back with it. | Put every statement through the queue. `schedNotifMany` runs as one transaction. |
| A7 | Destructive paths | `wipe` swallows failures and still toasts "Everything erased". `adoptDemo` sets `demoMode=false` before its awaits can fail. `removeCourse` uses N transactions. The handle after `closeAndDelete` stays reachable. | `real.wipe()` throws into a catch. `adoptDemo` swaps inside try/finally and is atomic. A `removeCascade` repository method uses one transaction (courses, meetings, marks, variants, attendance keys). `closed` is checked in `ser()`, and `stopResync()` runs before a wipe. |
| A8 | Migrations and safety copies | Each migration is atomic. Downgrades go undetected. The safety dump is written in place. | Refuse writes when `user_version > MIGRATIONS.length` and show a banner. Safety copies are written to `.tmp` and then renamed. A failed dump blocks the migration. |
| A9 | Corrupt rows | One `recordCrash` per bad row, twice per boot, which floods out the 50-entry log. A stored `null` overrides a default. | One aggregated entry per load. `withDefaults` type-checks each key. |
| A10 | Dropped promises and stray timers | Examples: `App.tsx:166`, `Coach.tsx:144`, `Semesters.tsx:44`, fx and haptics `setTimeout`s | Every promise is caught. Timers are owned and cancelled. A lint rule (`@typescript-eslint/no-floating-promises`) is added if it can run on the current config. |
| A11 | Tick cadences | ActiveCard and DayBar run two independent 1 Hz timers. Focus doesn't pump while hidden, so `roundDone` can arrive up to 30 s late. Today, Focus and RunningTimer never freeze when hidden. | One shared 1 Hz `useNow` source. **One store-owned timer pump** while a session runs. Hidden pages freeze. |
| A12 | All six screens mounted (`Book.tsx`) | `display:none` still re-renders. One stamp re-renders 4 pages. | Mount a page on its first visit, then wrap it in React 19.2 `<Activity mode>` (or memo plus frozen slices) while hidden. Effects that must keep running (the timer pump) move into the store. |
| A13 | Lists | Tasks are `.map`ped inside a ScrollView, with 6 subscriptions per card plus `workload()` on every render. Grades mounts every occurrence cell for the whole term. | `SectionList` virtualisation. `workload` is computed once in the parent. Cards take props. Grades shows recent weeks plus a "Show all". |
| A14 | Startup | `load()` runs 2–3 times. Notification config and the audio preload block `booted`. | `hydrate(snapshot)` loads once. Notification config, audio warm-up and the update check run after the first shell commit. |
| A15 | Extreme cases (table below) | See the audit | A test or a browser assertion for each case. |

**Extreme cases: the target behaviour**

| Case | Today | Target |
|---|---|---|
| Empty data | Handled | Every screen has a designed empty state (assert) |
| 50+ subjects | Grades has about 3,750 animated cells; Week columns overflow | Virtualised Grades; Week stacks overlapping blocks side by side |
| Thousands of tasks | Slow TTI, about 6 subscriptions per card | `SectionList`, props-only cards; a 5,000-task fixture under a render budget test |
| Long names, emoji, RTL | Initials split surrogate pairs (`Week.tsx:86`); the deck card clips names | Grapheme-safe initials (`Intl.Segmenter` with a fallback); fit-to-width headings; `writingDirection: 'auto'` on user text |
| Two classes at once | Deck shows the first only; Week stacks them exactly; attendance keys collide | See G1 |
| Midnight | `state.now` is stale across midnight | `now` refreshes on a day boundary and on resume |
| DST | `t0 + n*DAY_MS` at `Tasks.tsx:28`, `common.tsx:67`, `attendance.ts:18`, `semester.ts:155` | A calendar `addDays`; tests in a DST timezone (`TZ=Europe/Berlin`) |
| Timezone change | Reminders keep old instants until a resume | Resync on a timezone-change event (AppState plus a timezone check) |
| Clock moved back | The focus timer freezes (`timer.ts:47`) | Re-anchor the checkpoint when `now < checkpoint` |
| Killed mid-write or mid-migration | Each migration is atomic; queued optimistic writes are lost silently; the timer isn't persisted | The running timer is persisted to KV and restored on boot; adopt and cascade are atomic |
| Full disk or failed write | A toast, then the change vanishes on restart | Revert plus a persistent "Storage is full" banner on SQLITE_FULL |
| Corrupt row | Skipped and logged per row | Aggregated; an all-corrupt DB is **never** treated as a first run (no demo over real data) |
| No network | Update check fails quietly | Unchanged; About says "Couldn't reach the update server" |
| Every permission denied | Exact-alarm permission is never checked | Delivery status shows exact-alarm, notification, Do Not Disturb and promoted-notification state, each re-grantable |
| Maximum font scale | Tab labels uncapped | `maxFontSizeMultiplier` on chrome; layouts tested at 2.0× |
| 320 dp wide | Week columns about 37 dp | A 320 dp browser assertion for every page; Week shows 5 days plus a peek at 320 |
| Reduce motion | Respected by the kit | Also covers the mascot (still pose), the "+" sheet and the Focus transitions |
| Dark mode | Partial (Focus) | Every surface is designed in both themes |

### B. Data core

| # | Requirement | Why | Current state | Approach |
|---|---|---|---|---|
| B1 | In-app updates (OTA) | Reinstalling an APK every release is the main friction | `expo-updates` is wired; check-on-launch is `ALWAYS`; a JS boot check **duplicates** it; a hand-rolled `pending` flag; the announcement hook is never called; About starts at `idle` | **Rewrite on `Updates.useUpdates()`** (`isUpdateAvailable`, `isUpdatePending`, `downloadedUpdate`). Keep the KV port and the 5-minute resume throttle; drop the JS launch check. Show "You're now on Margin X" **after the shell draws**, and clear the marker only once it has been shown. Demo mode writes the marker to the real KV. Runtime version **0.5.0**. |
| B2 | Data survives every update | Updates used to break things | Migrations are atomic; safety copies are written before migrating; no fixture test from a real 0.3.1 database | **Fixture tests:** a **v0.1.0 database** (migrations 0–2, the owner's actual starting point, O9) and a v0.3.1 database (migrations 0–3), each with real-shaped rows, migrated to v0.5 with every row intact. A v0.3.1 **export file** imported into v0.5 losslessly (that is the key-switch path, O1). The downgrade guard (A8). |
| B3 | Survive uninstall | Android can't ask "keep data?" | Auto Backup is on, but `file path="."` also backs up expo-updates' `.expo-internal` and its logs; the comments wrongly say the DB lives in `databases/` (it is in `files/SQLite`); the export row's file is incomplete | Narrow the rules to `files/SQLite/`, `files/marginalia/` (the safety copies) and the shared preferences, at both API levels. Fix the comments. The export nudge becomes a **full backup** (see B4: variants, semesters, focus, everything). The device test covers backup and restore after a reinstall (same key). |
| B4 | Advanced import: JSON and CSV, file picker plus paste, no Excel | Typing a whole term in is the biggest setup cost | Two JSON shapes: raw, which ignores profile, settings and variants, and compact, which lacks notes, settings and variant links. **Focus sessions in a 0.3.1 export are dropped with a warning.** CSV covers 6 tables. The picker is a **static native import at startup** (an OTA crash risk). The whole file goes into a TextInput. | **One versioned schema, `margin/2`:** `{app, schema:2, exportedAt, profile{name}, semester{name,start,end}, archive[], subjects[{id,name,teacher,goal,rooms[],bar,variants[], meetings[{id,weekday,start,end,room,variant}]}], attendance[], dayMarks[], marks[], curves{}, tasks[], notes[], focus[], settings{}}`. **Export writes `margin/2`**, plus the human-readable tables as today. Readers for `margin/2`, the 0.3.1 raw export (**lossless, focus included**) and the compact shape all feed **one normaliser per entity**. CSV goes through the same normalisers and can also carry notes, subtasks as a `;`-list, and variants by name. The merge rule is the same for everything: upsert by id, fill fields that are present, never delete, never throw, preview add/update/skip counts plus problems first. The picker is lazy-required. Large files are parsed off the TextInput, which shows a summary. A ragged CSV row is a problem, not a blocker. Line numbers come from the parser. Excel stays export-only, and the brief drops Excel only for import. |
| B5 | Semesters: one active term plus archive/roll-over | A term has a real start and end, and its history must be kept | A `semesters` table exists (migration 4). The archive omits notes, day marks, curves and focus. Curves carry into the next term. Kept attendance falls outside the new term's dates. Archives are unreadable and not exported. The settings range is a mirror with reconcile logic. | **The archive is complete:** subjects, variants, meetings, attendance (with its meetings, so it stays countable), day marks, marks, curves, tasks, notes and focus. Curves reset for the new term. The new term's range is chosen in the roll-over sheet. "Keep attendance" is replaced by the archive itself: history is read in an **archived-term viewer** (read-only Grades and Stats), never by mixing it into the new term. Archives travel in export and import. **The active row is the only truth;** `settings.semesterStart/End` become derived, and the reconcile, `setActiveRange` and `carryImportedRange` machinery is deleted. `ARCHIVE_VERSION` stays 9, and the new datasets are optional fields. |

**One schema change for the release: migration 5.** Migration 4 never reached a device, but indices are kept, so this is appended, not edited.
- `course.rooms` (a JSON array, backfilled from `room`) and `course.bar` (nullable).
- `meeting.room` (nullable, meaning "the subject's first room").
- `mark.variant_id` (nullable).

Attendance keys stay `date|start|courseId` for meetings without a variant, so **no existing key is rewritten**. Variant meetings use `date|start|courseId|variantId`. An exact duplicate meeting (same subject, variant, day and start) is rejected at entry and reported on import.

### C. Onboarding

| Requirement | Why | Current state | Approach |
|---|---|---|---|
| Delete the coach tour; build a 3–5 page introduction with an interactive Rive pen | The current one is "horrible", and it is the first thing a new user sees | A 10-step coach-mark tour (`ui/onboard/*`, with `useCoachSlot` hooks in 7 files). `adoptDemo` is called **only** from the Coach's `onFinish`, and that is where the first-run semester picker lives. | **Five pages, designed with impeccable and taste.** Teddy (O8) is a taped paper sticker on each page:
1. **Hello:** Teddy waves. A tap gets a reaction, and `numLook` follows your finger.
2. **The layout:** a short, precise legend of 5–6 components rendered **live** from in-memory sample data (deck card, instrument, "+", attendance stamp, task card, Focus), one line each. Teddy looks at the one you touch.
3. **Your name:** `isChecking` is on, and `numLook` follows the caret as you type.
4. **Your data:** Import file · Paste · Set up by hand (the semester range, then a pointer to where subjects and classes are created) · Explore with a sample semester (O3). A failed import fires `trigFail`.
5. **Notifications:** the explanation first, then the system ask. `isHandsUp` illustrates "quiet during class". Denial fires a gentle `trigFail` and stays re-grantable in Settings.

Finishing fires `trigSuccess`.

- The gate is `settings.onboarded` (version 2), and replay is available from Settings.
- `adoptDemo` is rewired to the page-4 choice.
- The input names are wrapped in `src/onboarding/mascot.ts`, so a restyled remix only changes one map.
- `Mascot.web.tsx` shows a still frame exported from the `.riv` file for the web build and its screenshots.
- Credits go in `assets/rive/LICENSES.md` and About ("Teddy by JcToon, CC BY 4.0").
- Reduce-motion keeps Teddy still and replaces the reactions with a short caption. |

### D. The "+" sheet

| Requirement | Current state | Approach |
|---|---|---|
| Feels like picking things up off a desk; subject comes first; options that aren't available yet are greyed out with the reason, and a tap explains | A flat grid of 8 equal ghost tiles plus a focus slab (`forms.tsx:66-93`). With no subjects, **Mark is hidden** and **Class opens to a disabled Save that nothing explains**, a dead end. | A redesign by impeccable and taste, kept within paper and ink: objects on a desk (index cards, a sticky note, a gradebook slip, a timetable card), tilted slightly and lifting on press with sound and haptic. **Subject** is first and largest. Class, Mark and Exam are dimmed until a subject exists, each saying why ("Add a subject first"); a tap gives a gentle shake plus that line plus a "New subject" shortcut. The Focus session stays as its own object. Gating is derived from store state. |

### E. Subjects

| Requirement | Current state | Approach |
|---|---|---|
| Rooms: several per subject, as chips | One `course.room`, edited only through MeetingSheet. The owner's real data holds "LR-601, LR-303" in one string (O9). | A `course.rooms[]` chip field. **Migration 5 splits the legacy string on `,` `/` `;` `·`.** Each meeting picks a room chip (defaulting to the first). |
| Turn an existing subject into a variant | The owner has "Database" and "Database LAB" as two separate subjects (O9) | The subject detail sheet offers **"Make this a variant of…"**. It moves the subject's meetings, marks and attendance under the parent as a variant, in one transaction with undo. Nothing is lost, and stats roll up. |
| Grade goal from a number pad | A `Stepper` 0–100 | `NumberField` (decimal pad), 0–100, or empty for none |
| A progress bar per subject | Only the global `settings.bar` | `course.bar` (nullable, meaning "use the default"), picked from the 16 instruments plus the glass with a live preview |
| Variants that own meetings, attendance and grades, and roll up into the parent | A table only, with no UI. The meeting form drops `variantId`. `adoptDemo` and `removeCourse` ignore variants. | A variant control at the top of the subject sheet (`Database | Lab | +`). Meetings and marks carry `variantId`; attendance is keyed per variant. Stats and Grades roll up into the parent, with a per-variant breakdown. Variants are included in adopt, cascade delete, export, import and archive. |
| Edit, delete and customise a subject from wherever it appears | Only from a Grades card tap. Today and Week open the meeting, not the subject. | A **subject detail sheet** reachable from the Today deck card, Today rows, Week blocks, Grades, Stats rows and Tasks chips. It offers Edit, labelled Delete with undo, Variants, Rooms, and Customise bar. |

### F. Inputs: no +/− steppers anywhere

The audit found 16 `Stepper` uses:
- `forms.tsx`: effort, reminder lead, goal, class start and end, score, weight;
- `Grades.tsx:71`: curve;
- `Settings.tsx`: home, active and quiet times, the class lead, effort buffer, per-course lead, volume, break, and breaks per round;
- `WhenPicker.tsx`: hour and minute.

**Approach:** three kit primitives, designed with impeccable and taste and built on `kit.tsx`, and then `Stepper` is deleted:
- `NumberField`: number or decimal pad; it clamps on blur and accepts `,` as a decimal mark.
- `TimeField`: a fast interactive picker. Tap it to type `930`, which becomes `09:30`, or drag a horizontal **time ruler** that snaps to 5 minutes, with a haptic detent per step and the hour labelled. It respects 12/24h.
- `DurationField`: chip presets plus typed minutes, for effort, leads and breaks.

Volume becomes a **slider**. `WhenPicker` keeps its presets and day strip, and uses `TimeField`.

### G. Today

| Requirement | Current state | Approach |
|---|---|---|
| G1. Robust with a long name and with **two classes in the same slot** (O4) | `deckOf` and `dayBlock` show the first match only. "After" can name the concurrent class. Week stacks the blocks exactly. Attendance keys collide when the same subject appears twice. **"Period 3 of 2"** appears when an earlier class is cancelled (`at` counts cancelled classes, `total` doesn't). The name is clamped to 2 lines with no fit. The countdown says "min left" over an `mm:ss` reading. | **Reproduce first** with a browser script plus a jest fixture (overlap, back-to-back, the same subject twice, a cancelled earlier class, a 60-character name, an emoji name). The deck shows **"2 classes now"** as two compact rows that can be switched, each with its own countdown and bar. Week lays concurrent blocks out side by side. Period numbering counts only non-cancelled classes. The subject heading fits to width (scale down to a floor, then wrap to 2 lines, then ellipsis). The unit label matches the format. |
| G2. Every bar dims elapsed time | Of the 16: scope, surplus, compound, sieve, tape, commits, btree, log, spectrum and stack slide a dot, cursor or caret; graduated, heap and join partly do. The spiral is the reference. The glass fills elapsed time as solid. | **Contract:** elapsed time is drawn in the "rest" ink (dimmed), remaining time in full ink, and **there is no moving marker**. Each instrument is audited and rebuilt where needed. A jest render test samples every instrument at p = 1, 0.5 and 0. A browser frame is taken at start and mid-run. |
| G3. Assignments on Today | "Due soon" shows the 5 earliest open tasks with a due date | A **"Due" section:** overdue (marked in red ink), due today, then the next 3, with a done stamp inline and a designed empty state ("Nothing due — nice."). |

### H. Focus timer

| Requirement | Current state | Approach |
|---|---|---|
| A complete redesign that is calm, has a clear hierarchy and has first-class light and dark themes; the engine is kept | A background photo (`assets/images/page.jpg`), ornaments, the dial, a taped slip and a stamp. Dark mode is a scrim over the photo. | The screen is redesigned by **impeccable and taste**, referencing clean timer apps. **Remaining time dominates** (large typewriter digits). Then the context: task or subject, round, flow, breaks left. **Controls sit within thumb reach.** The photo and the clutter are removed. Paper stays, as a calm sheet with one ink accent. Whether a dial survives is the designer's call. |
| Keep the engine | `domain/timer.ts` | Kept. **Bugs fixed:** a multi-round session saved only the last round's focus time (`timer.ts:92`), and the clock moving back froze the timer. The API and behaviour are otherwise unchanged; tests pin them first. |
| Silent icon (Do Not Disturb) — **P2** | None | A header icon. With policy access it turns Do Not Disturb on through `setInterruptionFilter`; **on Android 15+ this drives an app-owned DND mode**, with a policy that allows alarms so the end-of-focus alert still rings. The previous state is restored on finish, but only if it hasn't changed meanwhile. Without access it mutes Margin's own channels for the session. **The UI says which of the two it did.** |

### I. Notifications

| Requirement | Current state | Approach |
|---|---|---|
| A pinned live countdown for a class or focus session — **P2** | `expo-notifications` only | An in-repo Expo module, `modules/margin-native` (Kotlin, about 100 lines for this part). An ongoing `NotificationCompat` with `setUsesChronometer` plus `setChronometerCountDown`, `setWhen(end)` and `setTimeoutAfter`. On Android 16 it adds `setRequestPromotedOngoing` plus `POST_PROMOTED_NOTIFICATIONS` (Live Updates). No foreground service. If the user swipes it away, it is not reposted (detected with a delete intent). |
| Minimal, clean, interactive layouts | Channels: classes, tasks, focus. Action categories: Here/Late/Absent and Done. No `opensAppToForeground`. | Rewritten copy: one line of title and one of body, with the time first. Actions keep working (stamp attendance, mark done, snooze 10 min) and are tested through `notifActions`. |
| Per-event controls inside **Settings → Reminders** | A master switch, Classes, Tasks & exams, Hours & quiet, per-subject lead | Nested rows, **with no new section:** Class starting soon (lead), Class finished, Here/Late/Absent prompt, Assignment due (leads), Exam (leads), Live countdown (P2). |
| Ask for permission on first open | Asked automatically on the first real resync | Asked in onboarding page 5, after the explanation. The automatic ask is removed. Delivery status keeps "Allow". |

### J. Themes, ink and texture

| Requirement | Approach |
|---|---|
| Improve them significantly and delete nothing | Every option stays: pens, palettes, themes, rulings and textures. The work is **designed by impeccable and taste and measured**. Each pen gets an ink pair per theme with measured contrast on paper, card and deck. The dark theme is re-tuned as dark card stock. The ruling pitch matches the line height. The grain is tuned per theme. The unused `t3.jpg` is either wired in as a third texture option ("linen") or moved to `docs/archive/` (designer's call; nothing is deleted). Contrast tests stay (`ui.test.ts`, at 4.5:1). |

### K. Sound and haptics

| Requirement | Current state (causes found) | Approach |
|---|---|---|
| **Better sounds, not only working ones** (O7) | 28 synthesised WAVs from `scripts/synth-sounds.mjs` | **A real sound design for paper and ink.** Each sound is layered: a transient, a body and a short room tail. Each action gets **2–3 round-robin variants, with ±3% pitch and ±1.5 dB gain jitter per play**, so repeating an action never sounds machine-identical. One family across all sounds: the same paper and desk "room", soft attacks, nothing shrill. Loudness is normalised (about −20 LUFS short-term, peaks ≤ −3 dBFS). Mono 44.1 kHz OGG/WAV, under 300 ms except crumple and round-done. Volume groups stay. The generator script stays the source, so every sound is reproducible. |
| Sounds actually play on the phone (confirmed broken on the device, O9) | `initAudio()` isn't awaited. Only the preload set is warmed, so 14 sounds create players cold and the first play is late or silent. `play()` returns false silently. Every error is swallowed. The kit Toggle plays *before* it applies, so turning Sound on is silent. Sound uses the media stream. | Find the v0.1.0 root cause in `audio.ts` history (players are created but never start) and prove the current code isn't affected. Await the init, after the first paint. **Warm every player.** Log failures to Problems once per session. The Toggle applies, then plays. Diagnostics gets a "Sound test" row. **Device proof:** after each action, `adb shell dumpsys audio` shows `state:started` for Margin's uid. |
| Every action fires its sound and haptic together | `select` and `tap` are haptic-only. `Btn` plus `act.open` fire a double haptic. The Focus sound toggle has no feedback. | An `fx` audit table: each user action → one `fx.*` call → sound plus haptic. A jest test asserts the pairs. The double tap is removed. |

### L. Widgets (P2): Android Glance 1.2.0, in `modules/margin-native`

| Widget | Content | Opens | Time display |
|---|---|---|---|
| Active class | Current or next class, the room, a mini bar with elapsed time dimmed, the end time | Today (`marginalia://today`) | A `RemoteViews` `Chronometer` countdown inside `AndroidRemoteViews`, plus the end time printed. A one-shot refresh at each class boundary. |
| Week | One day at a time, with ‹ › day buttons (Glance has no pager; per-widget state through `actionRunCallback`) and the day's classes in a `LazyColumn` | Week | Static times |
| Assignments | Open assignments with due labels, overdue marked | To-do | Due labels are recomputed at each refresh |

All three:
- use the paper-and-ink look, follow light and dark, and read data only;
- show an empty state that says "Open Margin";
- refresh on every data change (JS writes a JSON snapshot through the module, then `updateAll`), plus a 30-minute `updatePeriodMillis` fallback.

Each has at least one useful size and resizes where it helps.

### M. iPhone: on hold
`ios/` is not touched. Domain logic and shared UI stay platform-neutral. Native work sits behind `services/native.ts`, which degrades to no-ops off Android.

### N. Every existing feature stays, and every UI gets a design pass (O7)
The list is in brief section N. Each feature gets the foundation review. Under O7, **every UI surface** also gets a real impeccable-and-taste design pass, not only the items named in section 4:
- Week, To-do, Grades, Stats, Settings and all its pages, Diagnostics, Delivery status, Import, Semesters, About, toasts and empty states.

Each pass starts from the before photos and the device captures, and **stays true to the paper-and-ink intent:** better hierarchy, legibility and paper feel, never a different app. On the device, Week blocks are too small to read (O9), so Week gets a readable block layout: the subject's short name, then the room on a second line when there is height.

Specific fixes already found:
- the "Period 3 of 2" count;
- the countdown unit label;
- the Week overlap;
- the `occKey` collision for variants;
- emoji initials;
- the roll-over data loss (B5);
- the export gaps (B4);
- variants missing from adopt and cascade (E).

## 5. Release engineering (brief section 10)

| Item | Approach |
|---|---|
| Release signing key | The owner generates it (commands in plan task R1). GitHub secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. `build.gradle` gets `signingConfigs.release`, which reads environment variables. The workflow decodes the key into the runner's temp directory. **A workflow input `signing: release|debug`** produces the debug-key build for step 1 of O1. The key is never committed, and `.gitignore` covers `*.keystore` except `debug.keystore`. |
| OTA from Actions | A new `ota-publish.yml`, run by hand: inputs for the message and the mode (`publish` · `republish <group>` · `rollback-to-embedded`), channel `preview`, using `EXPO_TOKEN`. **A guard step** fails unless the runtime version in `app.json` matches `strings.xml` and the APK version. The rollback steps are documented in `docs/RELEASING.md`. |
| CI on the branch | `ci.yml` also triggers on `v2-improvements`. |
| Archiving stale docs | Moved (`git mv`, nothing deleted) into `docs/archive/`: `briefs/`, `reports/`, `qa/`, the superseded plans, `.impeccable/review/`, `.opencode/` and `design/*.html`. **`assets/sounds-candidates/` is untracked** after `ui.test.ts:171` and `scripts/synth-sounds.mjs` are repointed to `assets/sounds/`. |
| Version 0.5.0 everywhere | `APP_VERSION`, `app.json`, `build.gradle` (`versionName 0.5.0`, `versionCode 4`), `strings.xml` (runtime), `native-config.test.ts`, all together. |
| Rename v0.9 / v09 | Comments, test and tool file names, and `DEVICE_CHECKLIST` §V09-* become v0.5 / v05. The old spec and plan get a "superseded by v0.5" line. Data-format numbers stay. |
| Privacy claim | README and About: *"The only network use is checking Expo's update server (`u.expo.dev`) for app updates; no account, no personal data."* Manifest: remove `SYSTEM_ALERT_WINDOW` and the legacy storage permissions. `SCHEDULE_EXACT_ALARM` and `USE_FULL_SCREEN_INTENT` stay (reminders and D9). |
| Docs | README (features, test counts, privacy), STATE.md, root `PLAN.md` pointing here, PRODUCT.md ("Margin"; desktop out of scope), DECISIONS (D11 paste-only superseded; D6 and D7 moot). |
| `main` | O2, at release only. |

## 6. Testing and evidence

- **Checkpoints:** as in brief section 7 and the plan. While working, run targeted jest plus typecheck. At a checkpoint, run `npm run check`, the browser assertions (`tools/v05-*-assert.mjs`, Playwright at 412×915 and 320×690 on `http://localhost:8098`), read the diff, then commit.
- **Native compile checkpoints:** native code can only compile in Actions, so at each native checkpoint the branch is pushed and a **build-only** run of the APK workflow is started. No tags and no OTA.
- **Agent device checks during development:** the APK workflow gains a `variant` input:
  - `dev`: debug key, `applicationIdSuffix ".dev"`, named "Margin dev". It installs **side by side** with the owner's real app and never touches its data.
  - `over`: debug key, same application id. This is O1 step 1, used only in the final test.
  - `release`: the release key.

  After each native checkpoint, the agent installs the `dev` APK on the attached phone (adb or the mobile MCP) and runs the device checks it can prove itself: sound `state:started`, the notification and live countdown, Do Not Disturb, widgets, the Rive mascot, and the screens at the real density. The owner's final test then covers what needs a person.
- **Source-string tests** that are touched are replaced with behaviour tests, or updated with a rationale comment.
- **`docs/DEVICE_CHECKLIST.md`** collects every UNVERIFIED-ON-DEVICE item, and those become the owner's one final test. The phone is attached to this machine over adb (currently *unauthorized*: accept the prompt on the phone). In the final test, the agent can read logcat and take screenshots alongside the owner.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Native code (Kotlin, Glance, Rive) is never compiled locally | Native compile checkpoints in Actions. The native work is grouped into one module. P2 items can slip. |
| The Rive placeholder has few inputs | The input contract is fixed now. The rig spec goes to the owner. The asset swaps by OTA. |
| Android 15+ Do Not Disturb drives an app mode, not the global setting | Honest UI copy. The alarm bypass is in the policy. Device test. |
| Large refactors break behaviour | Pin behaviour with tests before each slice. Small gated slices. The store's public API stays fixed. |
| The 0.3.1 → 0.5 key switch loses data | The O1 two-step. A lossless import of the 0.3.1 export is tested against a fixture before any device step. |
| APK size (Rive adds about 3–6 MB) | Measured in CI and reported. |

## 8. What approving this spec authorises

Approving it authorises:
- Implementing Phases 1–3 as planned, with local commits at checkpoints (no Claude attribution, authored as `jossy-dude`).
- **Pushing `v2-improvements`** and starting **build-only** runs of the APK workflow at native compile checkpoints.
- Installing **`dev`-variant** APKs (a separate application id) on the attached phone for device checks. The owner's real app is never touched until the final test.

It does **not** authorise tags, OTA publishes, release creation, or anything on `main`. Each of those is asked for separately.
