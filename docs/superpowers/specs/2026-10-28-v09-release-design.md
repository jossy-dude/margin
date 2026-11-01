> **Superseded by v0.5** — see docs/superpowers/specs/2026-11-01-v05-release-design.md and docs/superpowers/plans/2026-11-01-v05-release.md. Kept as history.

# v0.9 Release — Design Spec

**Date:** 2026-10-28 · **Status:** awaiting owner review · **Path:** architectural (brainstormed, sections 1–4 approved in chat)

**let's make v1 first.** v0.9 is one release built as one long pipeline of 15 gated workstreams, but the
*first shippable slice* is WS1–WS4 (the data core: import, semester, persistence/backup, self-update).
That slice excludes every UI change — no onboarding, cards, timer, notifications or widgets. It can be
committed, gated and even built on its own without regressing anything. Everything after it ships only
behind its own green gate. Exclusions for the whole release are listed in §7; the owner decides cuts.

## 1. Context

Marginalia v2 (`School_planner_v2`) is an Expo/React Native school planner. Current version `0.3.1`
(`src/domain/version.ts`, `app.json`); `package.json` still reads `1.0.0` (app.json is version
authority, pinned by a test). The shipped artefact is the committed `android/` project, **not**
`app.json` (STATE.md note 22). Web runs the in-memory `MemoryRepository`; persistence claims are
native-only (UNVERIFIED-ON-DEVICE until the owner's phone pass).

Already in the repo and *kept* by this release: `domain/importPlan.ts` (merge-only import, D11),
`Repository.importSnapshot`, `services/safety.ts` (pre-migration dumps), `expo-updates` +
`services/ota.ts`, `domain/semester.ts` (range only), 16 instrument bars + `glass`, coach-mark
onboarding (`ui/onboard/`), `CourseForm` (edit exists but is buried), `fx.ts` (sound+haptic pairs),
3 notification channels + quiet hours.

## 2. Owner decisions (from brainstorming)

| # | Decision |
|---|---|
| V1 | One spec, sliced workstreams; implementation as **one long pipeline**, gates per workstream, **review rounds only at the end** |
| V2 | Import: **file picker + paste**; new dependency = `expo-document-picker` only |
| V3 | **XLSX dropped** — JSON + CSV only |
| V4 | Uninstall data survival = **Android Auto Backup + Settings export nudge** (no dialog exists; spec never promises one) |
| V5 | Semester = **one active + snapshot archive/roll-over** |
| V6 | Subject variants = **variants own meetings/attendance/grades, roll up to parent in stats** |
| V7 | Mascot = **pre-built pen character asset** (not drawn from scratch), arm/rotation animation |
| V8 | Timer silent icon = **system DND with app-side fallback** |
| V9 | Widgets: **all three, AndroidX Glance** |
| V10 | Build order = data → structure → surfaces → native inside the pipeline (dependency order, no phase gates) |

## 3. Release-wide rules

- **R1 — No +/− quantity steppers.** Anywhere a number or time is set by repeated +/− presses dies in
  v0.9: goal grade, time ranges, semester dates, settings minutes. Replacements: tap-the-value →
  **numeric keypad input** (decimal keyboard on phone), plus a drag scrubber for ranges where direct
  manipulation is faster. Typed fallback always exists.
- **R2 — Merge-only import stays (D11).** Upsert by derived id, never deletes, preview counts +
  problems list before commit, never throws.
- **R3 — Gate per workstream.** Builder delivers → orchestrator re-runs `npm run check` (typecheck +
  lint + jest + boundaries), reads the diff, runs the workstream's browser assert (`tools/*.mjs`,
  412×915) → commit. UI workstreams include screenshot evidence.
- **R4 — Device honesty.** Anything only a phone can prove is labelled UNVERIFIED-ON-DEVICE and added
  to `docs/DEVICE_CHECKLIST.md`.
- **R5 — Source-pin tests may be updated deliberately**, with rationale comments, never to silence
  red without fixing behaviour (existing convention, 2026-10-14 batch).

## 4. Workstreams (pipeline order)

### WS1 — Import overhaul (JSON + CSV, picker + paste)
- Entry: **Import sheet** gets two doors — *pick file* (`expo-document-picker`, json/csv) and *paste*
  (existing path).
- **Full-dataset JSON**: one object may carry profile name, semester range, subjects (with variants +
  rooms), class meetings, attendance, grades/marks, tasks/assignments, notes, settings. Every dataset
  is optional; unknown keys are problems, not failures.
- **CSV**: header row maps to columns; when ambiguous, a dataset selector says which table it is
  (`attendance`, `schedule`, `tasks`, …). Malformed rows → problem lines with row numbers.
- Detection by extension then content sniff; both doors feed `domain/importPlan.ts`, which grows
  dataset-specific parsers in the same style (plan + problems, pure functions, unit-tested per format).
- Preview: per-dataset `add/update/skip` counts; commit via `Repository.importSnapshot` (one
  transaction, both adapters, merge-only).
- No XLSX (V3). No file-writing dependency beyond the picker.
- Evidence: format-fixture unit tests + browser assert pasting and picking (picker itself:
  web-fakeable; real picker → device checklist).

### WS2 — Semester: one active + archive/roll-over
- Migration (only migration of the release): new `semesters` table — `id, name, start, end, active,
  snapshot_json, created_at, archived_at`; `user_version` bump; `services/safety.ts` dump runs before
  it (existing hook). Existing `settings.semesterStart/semesterEnd` migrate into the row, empty →
  today-suggested range (`suggestEnd`).
- **Archive = snapshot**: "Start new semester" writes the current schedule, subjects+variants,
  attendance, grades and tasks into `snapshot_json`, then clears day-to-day schedule tables (owner
  chooses keep-attendance vs wipe at that moment). Day tables stay lean; history reads from snapshots.
- Active semester id in settings KV; `domain/semester.ts` gains `activeSemester`, `archiveActive`,
  `readSnapshot` (pure, unit-tested).
- **Semesters page** (list: name, range, days-left for active, archived entries viewable) +
  roll-over flow + rename/range edit. Grades, export, Settings, tour print the active range (existing
  render sites updated).
- Evidence: old-DB fixture test (v0.3.1-era data migrates with ranges intact), unit tests for
  archive/roll-over, browser assert on the page.

### WS3 — Persistence & uninstall survival
- `android/app/src/main/AndroidManifest.xml`: `allowBackup=true` with explicit `dataExtractionRules`
  (API 31+) + `fullBackupContent` (API ≤30) XML including the SQLite database and prefs; cache-only
  exclusions. `native-config.test.ts` extended to pin it (it already pins manifest updater keys).
- Settings row **"Export before uninstalling"** — one tap → the existing export path (JSON), plus a
  truthful hint that uninstalling without Auto Backup deletes data.
- Evidence: config tests + browser assert of the Settings row.

### WS4 — Self-update loop
- `expo-updates` mechanism exists; v0.9 adds the loop UX: check on foreground resume (throttled),
  About row **"Update available → Update now (restart)"**, silent download ready for next launch,
  post-reload "You're now on vX" toast; failures always total (`services/ota.ts` totals already).
- Proof of the loop is a device pass (publish → cold start ×2 → data intact) — checklist item, not a
  local test. Web stays `unavailable` (D10).
- Evidence: ota unit tests extended; About browser assert; DEVICE_CHECKLIST §V09-OTA.

### WS5 — Onboarding: 3 pages
- **Delete** the coach tour (`ui/onboard/screens.ts`, `Coach.tsx` wiring — `coach.ts`/mark helpers
  removed or repurposed; demo-data adoption kept). Gate remains `settings.onboarded` (+ `hasRealRows`
  logic in `App.tsx`).
- Page 1 **Hello**: pre-built **pen mascot asset** (owner picks from 2–3 shortlisted free SVG/Lottie
  pen characters during the build; never generated from scratch), arm/rotation animation, one-line
  greeting, `expo-animation`/Reanimated, reduce-motion aware.
- Page 2 **Component legend**: short scrollable list of the most important components rendered
  live-but-inert (FAB, deck card, progress bar, nav bar, attendance row, assignment card, silent
  icon), each with exactly one line on what it does. Long-press/interaction disabled; scroll +
  progress dots.
- Page 3 **Setup**: profile name field → start path: **import a JSON/CSV file, paste, or manual
  entry**. Manual asks the semester range and states "create classes in the Classes section".
  **Notification permission asked here** — rationale row (class reminders, quiet hours) shown *before*
  `requestPermissionsAsync`; denial visible and re-grantable in Settings.
- Replay-from-Settings entry point retargeted to the new flow.
- Evidence: onboarding browser assert (3 pages, gate flips, permission ask fires after rationale),
  screenshot of each page.

### WS6 — "+" gating
- Add sheet opens with **Subject** enabled; Class / Mark / Note / etc. render greyed with the reason
  *"Create a class first"*. Greyed rows are tappable → explain (toast or one-line hint), never
  dead-end. When a class exists, everything un-greys (derived from store state, not a flag).
- Evidence: browser assert — before-class state shows greyed + reason; after creating a class they
  are live.

### WS7 — Subject sheet redesign
- **Rooms**: multi-value chip field (add/remove several rooms per subject); meetings keep their own
  room, defaulting to the subject's first.
- **Goal grade**: numeric `TextInput` (decimal/number-pad keyboard, R1) replacing the +5 stepper.
- **Progress display**: per-subject picker over all 16 instruments + `glass` with live preview in
  sheet (falls back to global default when unset).
- **Time range picking**: WhenPicker steppers replaced by a **drag scrubber** (press-drag rail with
  snap-to-minute, hour labels, haptic tick) + tap-value → keypad (R1). Presets and day strip stay.
- All other +/− quantity fields found during the sweep (semester dates, settings minutes) converted
  per R1 — the sweep is part of this workstream and listed in the assert.
- Evidence: when-picker unit tests updated for the new input model + browser assert (set a range by
  scrub, type a goal, add two rooms).

### WS8 — Subject variants
- Data: subject → optional `variants[]` (id, name, room?, teacher?, note?); variant **owns** its
  meetings, attendance, grades. Storage: one side table (`subject_variants` + a `variant_id` column
  on meetings), shipped inside **WS2's single migration window** — one `user_version` bump for the
  whole release, never two.
- UI: variant control at the top of the subject sheet (segmented: `Database | Lab Database | +`);
  each variant edits name/room/teacher and shows its own meetings.
- Aggregation: Stats/Grades roll child rows into the parent subject; parent rename cascades.
- Evidence: aggregation unit tests (parent total = sum of variants), browser assert creating two
  variants with separate meetings.

### WS9 — Subject edit surface
- **Subject detail sheet**: tap a subject (Today card header, Week row, Grades row) → detail with
  Edit, Delete (labelled button, v0.2 rule), variant management, and "Customise progress bar"
  shortcut into WS7's picker. `CourseForm` remains the editor, now reachable from everywhere.
- Discoverability line: first-time hint (once, dismissible) that subject rows open details.
- Evidence: browser assert open → edit → delete path from Today and Week.

### WS10 — Cards robustness + instrument audit
- **Reproduce first**: browser script builds the reported failure (long name + two classes) and
  captures the broken frame before any fix.
- Card layout made robust: measured truncation/shrink rules at 412 px, long names, 2+ classes,
  12/24h — budget comments in source + `card.test.ts` pins (existing convention).
- **Instrument audit**: all 16 instruments + `glass` checked for the *elapsed-ink contract* — spent
  time must **visually dim/fade the played portion** (spiral's outer→inner half-strength ink is the
  reference, D12). Any instrument that only slides a dot (known: surplus, analyst, …) is rebuilt to
  fade; each fix proven by before/after frames at two moments (start, mid-run).
- Evidence: audit table (16 rows: PASS/fix + frame), updated instrument assertions.

### WS11 — Today assignments
- Assignments become a first-class **Today section**: due today + overdue, with done state and due
  time, above/beside "Due soon" as appropriate; empty state says why it's empty.
- Evidence: browser assert with overdue + due-today fixtures, both modes.

### WS12 — Focus/timer rebuild
- **Shell only** — `domain/timer.ts` math, dial-face catalogue and keep-awake stay.
- Remove `page.jpg` background; new layout: remaining time dominant, session context secondary,
  controls thumb-zone; clean, non-distracting, information-dense but calm.
- First-class light **and** dark (existing `theme.ts` tokens; no hardcoded paper).
- **Silent icon (header)**: requests Do Not Disturb / notification-policy access once → toggles system
  DND while a session runs, auto-restores previous DND state on finish; if denied → fallback mutes
  this app's notification channels; state always visible (icon state + colour), explanation on
  first tap.
- Delegated to a subagent running **`impeccable` + `ui-ux-pro-max` + `design-taste-frontend`**
  (taste grounds the redesign in the existing paper/ink identity).
- Evidence: browser assert both modes (frames light/dark, running/paused), DND fallback logic unit
  test; real DND grant → DEVICE_CHECKLIST.

### WS13 — Notifications
- **Active-class notification shows live remaining time** (re-schedule each minute while a class
  runs; honest wording when timing is inexact — keep W5a's honesty machinery).
- **Redesign layout**: researched-then-minimal — single clean row, prominent time, working action
  buttons (stop/snooze/open), no multi-line dumps; verified dark + light (big-picture style) via
  screenshot previews.
- **Nested into the existing Settings → Reminders section** (no new section): per-event rows —
  *class finished, class starting soon, late, absent, assignment due, exam* — each with toggle + lead
  time + text preview, written through to `domain/reminders.ts`, grouped under the reminders section
  that already exists. Quiet hours and D4 lock-screen toggle stay where they are.
- Evidence: reminder unit tests per event, browser assert of the existing Reminders section, notification preview
  frames.

### WS14 — Sounds & haptics
- Diagnose native-first (web never reproduced; documented suspects: first-gesture gate + preload
  path): every listed sound audibly plays on device tap, `silentReason` rows say the truth.
- `fx.ts` pairs fire **simultaneously** (sound + haptic) for every action; verify each action has a
  pair.
- Evidence: audio unit tests + web analysis of `done.wav` path (existing method); Android audibility
  → DEVICE_CHECKLIST (already a known gate).

### WS15 — Widgets ×3 (AndroidX Glance)
- **Active-classes widget**: next/active class, room, time remaining, mini progress.
- **Week schedule widget**: swipeable days, per-day list.
- **Assignments widget**: active assignments with due labels.
- Native reads app data via a **ContentProvider** over the same SQLite (new small `modules/` bridge
  + provider; reads only, no writes from widgets). Widget refresh triggered on data change (existing
  mutation points call a small notify hook) + periodic fallback.
- Fresh-install/empty-data states render a "open the app" placeholder, never a crash.
- Evidence: native compile in CI-style assembleRelease; widget previews screenshot from the device
  pass (UNVERIFIED-ON-DEVICE; nothing here is provable on web).

## 5. End-of-pipeline protocol (owner chose: rounds once, at the end)

1. `npm run check` green + all `tools/*.mjs` browser asserts green (accumulated across the pipeline).
2. **user-tester** subagent → `reports/v09-user-test.md` (walkthroughs, 412×915, screenshots).
3. **senior-dev-auditor** subagent → `reports/v09-code-audit.md` (explicitly: long-term/maintenance
   findings, not just blockers).
4. **vision adversarial round** (MiMo as `vision-critic` role, repurposed as a *human user in odd
   school scenarios* — exam weeks, double bookings, empty data, midnight, long subject names, two
   classes at once — trying to **break** the app, using it as a person, not as intended) →
   `reports/v09-vision-adversarial.md`.
5. One combined triage table → **owner decides** keep/fix/drop per finding. Nothing is fixed before
   triage.

## 6. Risks

| Risk | Handling |
|---|---|
| WS2 is the release's only required migration | Old-DB fixture test + safety dump runs first (R4/R5) |
| WS15 native bridge is the least verifiable surface | Last in pipeline; data model frozen before it; device pass mandatory |
| 15 workstreams × shared chrome (Sheet, theme, Settings) | Gates + per-workstream asserts re-run after each land |
| Mascot asset licensing | Pick from free-for-commercial sources only; record license in the repo |
| Long pipeline = context drift | One brief per workstream (`briefs/v09-*.md`), scope lock + exclusions in each |
| Dirty working tree at start (About page work) | Committed or stashed as the owner decides before WS1 |

## 7. Explicit exclusions (v0.9 does NOT contain)

- XLSX/Excel import (dropped by owner, V3)
- Commute tracker, free-time system, desktop/tease UI
- Stats overhaul (old W7) and sync/transport log (old W6)
- Full-screen alarm presentation (DECISIONS D9 still open — separate decision)
- iOS surfaces (release is Android-first; nothing blocks iOS later)
- Any redesign of the 16 clock faces themselves

## 8. Definition of done (release level)

`npm run check` green · every workstream browser assert green · three end reports delivered · owner
triage recorded · release APK built from the committed `android/` at version `0.9.0` (versionCode
bumped, `native-config.test.ts` pins it) · DEVICE_CHECKLIST §V09 signed by the owner's phone pass.
