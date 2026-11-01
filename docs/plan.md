# Margin v0.5: owner's brief

Read this whole file before anything else. It is the owner's direction for v0.5 of **Margin** (repo folder `School_planner_v2`, branch `v2-improvements`), an Expo SDK 57 / React Native 0.86 school planner: local-first SQLite, a hand-cut paper-and-ink look. **v0.5 is Android only; the iPhone version is on hold** (section 4, item M).

**v0.5 is planned from scratch.** An earlier "v0.9" plan exists (`docs/superpowers/specs/2026-10-28-v09-release-design.md` and `docs/superpowers/plans/2026-10-28-v09-release.md`), written and partly built by free models in opencode. **Do not follow its workstreams or treat any of its work as done.** Read it only to understand what the owner asked for and what feedback they gave. Every requirement below supersedes it.

The code those agents wrote after v0.3.1 is **raw material**: the import overhaul, the semesters table, Android backup rules and the self-update loop (commits `e3579be`, `fc5beda`, `1dfe839`, `0c38b88`, plus an uncommitted, half-done OTA fix). Audit it and keep, rewrite or replace each piece on its merits. Nothing may work worse than it does today.

---

## 1. How to run this release

**Phase 0: understand, then plan, then stop.**
1. **Read the code before designing anything.** Work out the intent behind each piece:
   - the paper texture, the grain and photo textures;
   - the dots / grid / ruled paper;
   - the hand-cut `HandBox` cards with their wobble, and the tape;
   - the four fonts and the ink pens;
   - the analog clock faces and the "instrument" progress bars;
   - the synthesized paper sounds, and swipe-to-crumple.

   For each one, ask yourself: *what is this trying to be, how could it feel more real, and how could it be better on a phone?*
   Look at the "before" photos in `docs/references/v0.3.1/` first. Then start with `src/tokens/theme.ts`, `src/ui/kit.tsx`, `src/ui/PaperBg.tsx`, `src/ui/Sheet.tsx`, `src/ui/clock/`, `src/ui/instruments/`, `src/services/fx.ts`, `src/store/store.ts` and `src/data/`.
2. Restate the owner's requirements (section 4) as a numbered table: requirement · why · current state in the code · approach.
3. Brainstorm only the genuinely open questions, and ask the owner **one question at a time**. Useful skills: `interview-me` or `idea-refine`, then `spec-driven-development` and `planning-and-task-breakdown`.
4. Write `docs/superpowers/specs/<today>-v05-release-design.md` and `docs/superpowers/plans/<today>-v05-release.md`. The plan must assign every task to a subagent, name that subagent's skills, and mark where the test checkpoints fall (section 7).
5. **STOP until the owner approves the spec and plan.**

**Phase 1: foundation first.** Rework the code, logic and structure before any feature or redesign work, because everything else is built on top of it (section 3).

**Phase 2: features and redesign**, in the order the plan sets (sections 4–5).

**Phase 3: pre-release review.** Two agents, not three (section 8). Then the owner triages, then fixes, then **the owner's one device test at the very end** (section 7).

You are the orchestrator. Stay token-efficient, and hand implementation to subagents (the Agent tool), giving each one only the context and skills it needs.

## 2. Hard rules
- **Never add Claude attribution**: no `Co-Authored-By` trailer, no "Generated with Claude Code" line, nothing on GitHub. Don't touch git config. Commits stay authored as `jossy-dude`, as they are today. This overrides any default attribution guidance you have.
- **The owner never builds on this machine. All compiling happens in GitHub Actions** (`.github/workflows/release-apk.yml`). Never run Gradle locally. Don't push, tag, publish an OTA update or trigger a release build unless the owner says so in this session.
- **The committed native folders ship, not `app.json`.** This is not a CNG project; `expo prebuild` doesn't run in CI. Every config change goes into `android/`, held together by `src/test/native-config.test.ts`. Leave `ios/` untouched.
- **Test at checkpoints, not after every change** (section 7). While working, run only the tests that touch what you changed. Every few changes, run the full check at a checkpoint, then commit.
  - The web build runs an in-memory repository: a reload resets data, and persistence only holds on native.
- **The owner tests on a phone once, at the very end** (section 7). Until then, record anything only a phone can prove in `docs/DEVICE_CHECKLIST.md` as UNVERIFIED-ON-DEVICE. Those items become the owner's final test list.
- **Tests that read source files and check for exact strings:** update them on purpose with a rationale comment, never just to turn red green. Prefer replacing them with behaviour tests while you're in the area.
- **Import stays merge-only:** upsert by id, never delete, preview counts and problems before writing, never throw.
- **Any new native dependency bumps the runtime version before any OTA publish.** Read the OTA trap in section 6.

## 3. Phase 1: foundation (do this first)
The earlier versions were written by free models. Improve the code itself: efficiency, reliability, fewer ways to fail, and graceful behaviour under extreme conditions. **Don't break anything:** pin current behaviour with tests before each refactor, and refactor in small, gated slices.

- **Start by getting the gate green.** Right now typecheck is red and 2 jest tests fail, all from the half-done OTA fix (section 6).
- **Structure.** `src/store/store.ts` (~640 lines) holds every action, side effect and lifecycle hook in one module; `src/domain/importPlan.ts` is ~1070 lines.
  - Split by responsibility where it makes the code clearer, without changing the public behaviour.
  - Keep the hard boundaries enforced by `.dependency-cruiser.cjs` (domain stays pure, the UI never touches the data layer).
  - Fix the existing layering leak: data and services import `ui/crashlog`.
- **Reliability.** Review:
  - the optimistic writes, which have no rollback (DECISIONS D5);
  - the write queue, and the notification-log writes that bypass it;
  - migrations, and the pre-migration safety copies;
  - corrupt-row handling;
  - every place a promise can be dropped or a timer can outlive its owner.
- **Efficiency.** Look at:
  - re-render costs, and the 1 Hz / 4 Hz tick cadences;
  - all six screens staying mounted in `src/navigation/Book.tsx`;
  - list rendering with hundreds of tasks;
  - startup time (fonts, hydrate, notification sync);
  - bundle size.
- **Extreme cases.** Each one must behave sensibly, with tests where possible:

  | Area | Cases |
  |---|---|
  | Data size and shape | empty data, 50+ subjects, thousands of tasks, very long names, emoji / RTL text |
  | Clock and time | two classes at the same time, midnight, DST changes, a timezone change, the clock moved back |
  | Interruptions and failures | the app killed mid-write or mid-migration, a full disk / failed write, a corrupt row |
  | Network and permissions | no network, every permission denied |
  | Display and accessibility | maximum font scale, reduce-motion, a 320 dp-wide phone, dark mode |

## 4. What the owner wants, and why

**A. The foundation** (section 3).
*Why:* free models built the earlier versions, and everything new will sit on top of this code.

**B. Data core**
1. **In-app updates** (OTA through `expo-updates`) instead of reinstalling an APK for every version.
   *Why:* installing a new APK every release is the main friction today.
2. **Data survives every update**, with no breakage and no loss.
   *Why:* updates used to break things.
3. **Survive uninstall.** Android can't ask "keep data?", so use Auto Backup plus a Settings export nudge.
   *Why:* the owner wants the semester to come back after a reinstall.
4. **Advanced import.** One simple JSON can carry any dataset: profile name, semester range, subjects with variants and rooms, the class schedule, attendance, marks, tasks, notes, settings. CSV as well. Bring files in by **file picker and paste**. **Excel dropped.**
   *Why:* typing a whole term in by hand is the biggest setup cost.
5. **Semesters:** one active term with a name and range, plus archive / roll-over to start the next term.
   *Why:* a term has a real start and end, and the history must be kept.

**C. Onboarding: go all out** (owner: "make it fun, enjoyable, like a real application").
- **Delete** the current coach-mark tour.
- Build a **3–5 page introduction** that actually helps:
  - welcome and hello;
  - what the app is for, and how it's laid out (a short, precise legend of the most important components, rendered live);
  - **ask the owner's name**;
  - where their data comes from: import JSON/CSV, paste, or manual entry (the semester range, then a pointer to where classes are created);
  - **ask for notification permission with an explanation first**. Denial stays re-grantable in Settings.
- Plan carefully what goes on which page, and how each page flows into the next.
- **Mascot: an interactive pen, built with Rive** (`rive-react-native`). **No hand-authored or AI-generated SVG art.**
  - It should react to touch and to what is happening on the page: for example, follow your finger, write your name as you type it, celebrate when you finish.
  - Use a state machine. Find 2–3 pre-built pen characters (from the Rive community or similar) with licences that allow use in the app, present them to the owner, and record the chosen licence in the repo.
  - Check that `rive-react-native` supports RN 0.86 with the New Architecture. If it doesn't, say so before choosing anything else.
  - The owner tests the mascot on a real phone in the final device test.
- *Why:* the current onboarding is "horrible". It is the first thing a new user sees.

**D. The "+" sheet: redesign it significantly.**
Today it's a flat grid of 8 equal ghost tiles plus a focus button (`AddSheet`, `src/sheets/forms.tsx`). Make it feel like paper: things you pick up off a desk, not a menu.
- **Subject comes first.** Options that need a subject or class first are greyed out with the reason, and tapping one explains instead of dead-ending.
- *Why:* it's the most-used control in the app, and it's the least paper-like.

**E. Subjects**
- **Rooms:** several per subject, as chips. *Why:* a class isn't always in the same room.
- **Grade goal:** a number-pad input. *Why:* the +5 button needs 15+ taps.
- **A choice of progress bar per subject.**
- **Variants:** for example Database and Lab Database. Each variant owns its meetings, attendance and grades, and rolls up into the parent subject in stats. *Why:* one subject, two different periods.
- **Edit, delete and customise a subject from wherever it appears.** *Why:* today there's no way back into a subject after creating it.

**F. Inputs: no +/− steppers anywhere.**
- Times get a fast, interactive picker.
- Every number gets a real numeric input.
- *Why:* "using + above 10 is a crime." The `Stepper` lives in `src/ui/kit.tsx`, and it's used in `src/sheets/forms.tsx`, `src/sheets/WhenPicker.tsx` and `src/sheets/Settings.tsx`.

**G. Today**
- **The Today card breaks** with a long name, and adding 2 classes broke the app. Reproduce it first, then make the card robust.
- **Every progress bar must dim elapsed time** instead of sliding a dot. Known offenders: spiral, surplus, analyser, and others. The spiral (DECISIONS D12) is the reference.
- **Show assignments on Today:** due today and overdue, plus an empty state.

**H. Focus timer: a complete redesign.**
- It should feel like a real timer app: clean, calm and not distracting, but showing enough information to be useful. **Reference clean, simple timer apps.**
- **Hierarchy:** the remaining time dominates. The session context comes second: the task or subject, the round, flow mode, breaks left. The controls sit within thumb reach.
- Proper light and dark themes, both first-class.
- Remove the background photo, along with the clutter around the dial.
- It still belongs to the paper-and-ink world (taste), just calmer.
- **Keep the engine; the screen is free.**
  - Keep the timer logic in `src/domain/timer.ts`: presets 25 / 45 / 50 / 90, flow mode that lets a round overrun, breaks that unlock after five minutes of work, rounds.
  - Keep keep-awake, and the session record written on finish (`act.timerFinish`).
  - Everything visual may change, including whether a clock face or dial appears at all. The designer decides, with impeccable.
- A **silent icon** in the header turns on system Do Not Disturb for the session and restores the previous state afterwards. If access is denied, it mutes the app's own notification channels instead, and the UI says honestly which of the two it did.
- Before photos: `docs/references/v0.3.1/` shots 27–28 and 44–45. Optional inspiration: the three Focus mockups in `design/*.html`, moving to `docs/archive/`.
- *Why:* today it's busy (the photo, the ornaments), dark mode isn't properly designed, and it doesn't feel like a timer app.

**I. Notifications: a redesign plus new features.**
- **The timer is always on top:** while a class or a focus session runs, a pinned (ongoing) notification shows the live countdown, so you can leave the app and still see it. Use Android 16 "Live Updates" where available.
  - `expo-notifications` can't do a chronometer, so research a small native module or a well-maintained library, and check its maintenance status.
- Make the layouts minimal, clean and interactive, with working action buttons.
- **Per-event controls**: class finished, starting soon, here / late / absent, assignment due, exam.
  - Nest them inside the **existing Settings → Reminders section**, with no new section.
- **Ask for permission on first open** (in onboarding).
- *Why:* today the notifications look cluttered, and you can't see the class or timer once you leave the app.

**J. Themes, ink and texture: improve them significantly, delete nothing.**
- Today there are pens (warm / graphite / red / blue), palettes (refined / original), light / dark / auto, paper rulings (dots / grid / ruled / plain) and textures (grain / photo / none).
- You may change colours, themes and textures. Understand what each is trying to be, then make it truer: real paper, real ink, real on a phone screen.

**K. Sound and haptics**
- Sounds actually play on the phone.
- Every action fires its sound and haptic together.

**L. Widgets: three, designed from scratch** (owner: "a simplified yet as beautiful version of the card").
- Built with Android Glance, and designed with impeccable + taste like every other surface:
  - the paper-and-ink look;
  - they follow light and dark;
  - readable at a glance;
  - at least one useful size each, resizable where it helps;
  - tapping one opens the matching screen.
- **Active classes:** the current or next class, the room, the time left, and a mini progress bar that dims elapsed time (the same rule as item G). It opens Today.
- **Week:** swipe between days, each showing its classes. It opens Week.
- **Assignments:** open assignments with due labels, and overdue ones marked. It opens the To-do list.
- They read data only, and an empty state says "open the app".
- Refresh on every data change, plus a periodic fallback. Android widgets can't redraw every second, so design the time display for that (show the end time, or a system-driven countdown) rather than a number that goes stale.
- *Why:* to see the current class and what's due without opening the app.

**M. iPhone version: on hold.** Not part of v0.5, and don't touch `ios/` (a stale, never-built prebuild skeleton). The only ask: where it costs nothing, keep Android-only assumptions out of the domain logic and the shared UI, so a later iPhone port is easier.

**N. Every other existing feature stays, and improves.** Everything the app does today is kept. It all goes through the Phase 1 foundation review, and gets the gentle, faithful polish from section 5. None of it gets a redesign unless it's named above. Read the code to find each feature, and work out what it's for before touching it:
- **Today:** the command-deck card, the five clock faces, the 16 instrument bars plus the day-wide glass.
- **Week timetable:** the now-line, week paging, tap to mark attendance, long-press to edit.
- **To-do list:** subtasks, estimates, priorities, start-by nudges, per-task reminders, swipe to finish or crumple, with undo.
- **Attendance:** per class and per day, here / late / absent / sick / cancelled, the lock, and the "inferred here" rule for finished classes.
- **Grades:** weighted marks with an on/off flag, curves, goals, "the average you need on the rest", letter grades.
- **Stats:** the rings, the heatmaps, when you work best, per-subject breakdowns.
- **Export** (xlsx / csv / json), the **Settings** pages, **Diagnostics** and the Problems log, the reminders **Delivery status** page, and the first-run **sample semester** with its "remove sample data" path.
- **The semester feature** (item B5) is in this group too: the active term, its range, and roll-over all exist already. Audit them, fix the roll-over defect (section 6), and improve them.

## 5. Design direction (applies to everything)
- **Use `impeccable:impeccable` for every design task**, so the work is held to a real designer's standard. **Use `design-taste-frontend`** to keep it true to the original paper-and-ink world. Load both in every UI subagent.
- **The "before" reference photos are in `docs/references/v0.3.1/`.** 46 shots of the app as it was before v0.5, captured from the web build in phone mode (412×915), light and dark. Its `README.md` indexes every surface and says what the web build can't show.
  - Give them to every design subagent alongside the code, as the starting point to improve on, **never as the target**.
  - The version in every file name says which build they show.
  - If you take new captures for v0.5, put them in `docs/references/v0.5/`, with `v0.5_` in each name.
- **Understand the intent, then improve it. Don't replace it.**
  - The things named in section 4 (onboarding, the "+" sheet, subjects, inputs, the Today card and bars, Focus, notifications, themes / ink / texture, sounds, and the new widgets) get a real redesign.
  - **Everything else gets only a gentle polish that stays faithful to it**: no significant changes and nothing that looks different from the original, unless the change makes it truer to what it was trying to be.
  - If you're unsure, ask the owner.
- **Make it feel more like paper, everywhere.** Ask how real paper, ink, tape, stamps and pencil would behave, and borrow that.
- **Small interactions and feel:** add the touches that make the app stand out and fun, so it feels fluid and natural. Don't overdo it; just enough.
- Keep the existing accessibility commitments: labels on every control, reduce-motion, measured contrast and the font-scale ceiling.

## 6. Known defects in the current code (fix them, or don't reintroduce them)
- **OTA runtime trap:**
  - `runtimeVersion` is still `0.3.1` (`app.json`, `android/app/src/main/res/values/strings.xml`, `versionCode 3`).
  - The new native module `expo-document-picker` loads at startup (App → Overlay → Settings → Import → `services/pickFile.ts`).
  - Publishing an update from this tree to 0.3.1 phones would crash them. Rive and any notification module are new native code too.
  - **Bump the runtime to 0.5.0 before any publish.**
- **Semester roll-over loses data:**
  - `clearActiveSchedule` clears notes and day marks, but `buildSnapshot` (`src/domain/archive.ts`) archives neither, so nothing in the app can read them back.
  - Grade curves and focus sessions aren't archived either; curves carry into the next term.
  - Attendance you choose to keep falls outside the new term's dates.
- **Export isn't a full backup:** `snapshotOf` (`store.ts`) leaves out variants, and neither export nor import carries archived semesters.
- **Variants get left behind:** `act.adoptDemo` doesn't copy them, and `act.removeCourse` doesn't delete them.
- **The half-done OTA fix:**
  - `useUpdateAnnouncement()` exists, but `App.tsx` never calls it, so the "You're now on Margin X" toast never fires.
  - `AboutPage.tsx` still starts at `'idle'` instead of reading `updateStaged()`.
  - `src/test/ota-loop.test.ts:169-177` fails typecheck.
- **Out-of-date privacy claim:** `expo-updates` contacts `u.expo.dev` on every launch, but README says nothing uses the network. The Android manifest still carries template permissions: `SYSTEM_ALERT_WINDOW` and legacy storage.
- **Small:** `SqliteRepository.closed` is never read. `assets/sounds-candidates/` is gitignored but still tracked.
- **Git:**
  - 11 commits are not pushed to `origin/v2-improvements`.
  - `origin/main` shares no history with this branch; **ask the owner before doing anything about main**.
  - CI (`.github/workflows/ci.yml`) only runs for main.

## 7. Testing: checkpoints for the agent, one final test for the owner

**Test checkpoints (the agent's own testing).** Running the whole suite after every change wastes time and tokens. So:
- **While working:** each subagent runs only the tests that touch what it changed (the relevant jest files, plus typecheck when types moved).
- **At a checkpoint**, the orchestrator runs the full check:
  - `npm run check` green: typecheck, lint with zero warnings, jest, dependency-cruiser;
  - for UI work, the browser asserts: `tools/*-assert.mjs`, Playwright at 412×915 against the web build on `http://localhost:8098`;
  - read the combined diff;
  - then commit.
- **When to hold a checkpoint:**
  - after every few related changes (roughly 3–5 small tasks, or one finished feature);
  - before anything that touches shared code (store, data layer, theme, `Sheet`, `kit.tsx`);
  - at the end of every phase.
- If a checkpoint fails, fix it before starting new work. Never stack new changes on a red check.

**The owner's device test: once, at the very end.** After the review fixes:
1. Ask the owner to let you push the branch and run the "Release APK" workflow in GitHub Actions.
2. Hand over one list, built from the UNVERIFIED-ON-DEVICE items in `docs/DEVICE_CHECKLIST.md`. Give the steps and what to look for. Include at least:
   - existing data surviving an install over the old version;
   - the mascot and onboarding flow;
   - the notification-permission ask;
   - Do Not Disturb;
   - the pinned live countdown;
   - sound and haptics together;
   - the widgets;
   - the self-update loop (publish a preview update, cold start twice, data intact);
   - backup and restore after a reinstall.
3. Record the owner's results, and fix what failed.

## 8. Pre-release review: two agents
1. **The user tester.** Uses the app visually, like a real student, through the web build and screenshots, and tries to break it:
   - extreme scenarios: exam week, double bookings, empty data, midnight, very long names, two classes at once, thousands of tasks;
   - error paths: denied permissions, a failed import, bad input.
2. **The senior developer.** Tests the build as if releasing it tomorrow:
   - extreme cases, failure and recovery paths, data-loss risks, long-term maintenance issues.

Merge both reports into one triage table. **The owner decides what gets fixed.** Then comes the owner's final device test (section 7). Only after it passes, and only when the owner says so, tag and publish the release.

## 9. Docs, version and naming
- **README.md:** update the features, the test counts and the network / privacy claim.
- **STATE.md:** bring it up to date.
- **Root `PLAN.md`:** replace it with a pointer to the v0.5 plan.
- **PRODUCT.md:** the shipped name is "Margin", and the desktop surface is out of scope.
- **DECISIONS.md:** mark D11's "paste-only" as superseded; D6 and D7 become moot once Focus and onboarding are rebuilt.
- **Release target 0.5.0 everywhere it's pinned, together:** `src/domain/version.ts` `APP_VERSION`, `app.json`, `android/app/build.gradle` (`versionName`, plus a `versionCode` bump), the runtime version in `strings.xml`, and `native-config.test.ts`.
- **Rename "v0.9" / "v09"** to v0.5 in code comments, test and tool file names (for example `src/test/migration-v09.test.ts`, `tools/v09-*-assert.mjs`) and in `docs/DEVICE_CHECKLIST.md` §V09-*.
  - Leave the old v0.9 spec and plan where they are as history, each with a "superseded by v0.5" line at the top.
  - **Keep saved-data format numbers as they are** (`ARCHIVE_VERSION = 9`, migration indices).

## 10. Release engineering (owner-approved additions)
1. **A real release signing key.**
   - Today the release APK is signed with the debug keystore committed publicly in the repo (`android/app/debug.keystore`, used by `signingConfigs.debug` in `android/app/build.gradle`). Anyone can build an APK that installs over the owner's.
   - Android refuses an update signed with a different key, so switching keys means **one uninstall**. v0.5 is already a reinstall-sized release, so switch now.
   - Plan it:
     - give the owner the exact commands to generate the keystore and keep a safe copy (lose it, and no update can ever be installed again);
     - store it as GitHub secrets: the keystore base64-encoded, plus passwords and alias;
     - add a release signing config that reads them in the "Release APK" workflow;
     - **never commit the key**.
   - The owner exports their data before uninstalling, and restoring from the export or Auto Backup is part of the final device test.
2. **Publish OTA updates from GitHub Actions.** The owner never builds locally, so `eas update` must be a workflow too, run by hand from the Actions tab, publishing to the `preview` channel with an `EXPO_TOKEN` secret.
   - Write down how to roll back a bad update: republish the previous update, or roll back to the embedded bundle.
   - Re-check the runtime-version rule (section 6) before the first publish.
3. **Must-ship versus can-slip.** In the spec, rank every item in section 4.
   - Widgets, the pinned live notification and Do Not Disturb need native Android code and can only be proven on a phone. They are the "can slip to v0.6" candidates if they stall; the rest of v0.5 must not wait on them.
   - **Batch every native change** (Rive, the notification module, Glance, Do Not Disturb, signing) into the one v0.5 APK, so later changes can arrive as OTA updates.
4. **Archive the stale docs** so they stop misleading agents. Stale `STATE.md` and decision D11 already did.
   - Move into `docs/archive/`: the old briefs (`briefs/`), old reports (`reports/`), the superseded plans, `qa/`, `.impeccable/review/` and `.opencode/`. Keep the `design/*.html` Focus mockups there too, as optional inspiration.
   - Stop tracking `assets/sounds-candidates/`; it's gitignored and duplicates `assets/sounds/`.
   - **Move, don't delete**, unless the owner agrees. Keep anything still in use: `docs/screenshots/` (README), `docs/DEVICE_CHECKLIST.md`, `docs/references/`.
5. **Run CI on the working branch.** `.github/workflows/ci.yml` only runs for `main`, so nothing on this branch has ever been checked on GitHub. Add the working branch to its triggers.
   - `origin/main` shares no history with this branch. Ask the owner what `main` should become before the release.
