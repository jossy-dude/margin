# v0.3.1-A — It keeps its data: semester range, bulk import, pre-migration safety copies

**let's make v1 first.** This is one shippable slice. The exclusions list is part of the contract.
Owner source: Obsidian `Daily_Notes/Oct 21 + Oct 22, 2026` (bulk input, semester start/end, data survives
an update). Repo context: `settings.semesterStart` already exists; the export path has **no import
counterpart** (`STATE.md` §10); `MIGRATIONS` already runs versioned DDL.

Baseline gate at dispatch: **58 suites / 888 tests green**, boundaries clean (208 modules).

## Already built — verify, do not duplicate

- `Settings.semesterStart` (`domain/types.ts:66`, default `2026-09-07` in `domain/defaults.ts:26`).
  Read by `services/export.ts:18`, `screens/Grades.tsx:19,47,74`, edited in `sheets/Settings.tsx:313,158`.
  **No end date anywhere.** The Settings editor has month/day steppers only — **no year stepper**, so the
  year is unchangeable. That is a defect to fix here.
- Export: `services/export.ts` (`buildTables`, `toJson`), `services/exportFile.ts` (`runExport`), one ZIP/XLSX
  writer, reachable from Settings → Data. `toJson` emits `{app:'margin', version:1, tables…, raw: Snapshot}`.
- Persistence: `data/sqliteExpo.ts` opens `'marginalia.db'` via `openDatabaseAsync` (app database dir).
- Repository port: `data/repository.ts` (`upsert`, `seed`, `putSettings`, …), adapters `data/sqlite.ts`
  (`SqliteRepository`, writes through `ser()` + one transaction for `seed`) and `data/memory.ts`.
- Store: `store/store.ts` (`act`, `persist`, `resync`, reload path after `wipe()`).

## Deliverables

### 1. Semester range (start + end, year included)

- Add `semesterEnd: string` to `Settings` — `''` means open-ended. Default `''` in `DEFAULT_SETTINGS`.
  Do **not** add a migration: settings are the KV table.
- New pure module `src/domain/semester.ts`:
  - `semesterOf(s): { start: Date; end: Date | null }`
  - `inSemester(date: Date, s): boolean` — half-open `[start, end]` by local calendar day; `end` empty = always true
  - `semesterLabel(s): string` — `"7 Sep – 20 Dec 2026"`, `"from 7 Sep 2026"` when open-ended, `"not set"` when empty
  - `clampToSemester(now: number, s): number`
  - `validRange(start, end): boolean` — end must be ≥ start when both present
- Use it in: `screens/Grades.tsx` (the "Attendance counts from …" line → the label), `services/export.ts`
  (the `first` date and the Summary section), and anywhere else `semesterStart` is read — grep every call site.
  `domain/` stays pure: no store import.
- Settings → Attendance & semester: two date fields, each **year / month / day**, plus a "No end date"
  toggle that clears `semesterEnd`. Reuse the existing `Stepper` look; do not invent a calendar picker.
  Reject `end < start` in the UI (hint text, no silent clamp).
- Tour: ask the range at the **beginning**, per the owner. Add the two date fields to the final tour step
  (the hand-over) rather than a new step, so `TOUR_LEN` and the tour's screenshot tests do not shift. The
  chosen values write through `act.setSettings` when the tour finishes. The sample semester stays
  memory-only — this writes settings only, never demo rows.

### 2. Bulk import (the export path's missing half)

Pure parser `src/domain/importPlan.ts` — no React, no store, no I/O. Accepts **two** shapes:

- **A. Our own export**: `{ app:'margin', … , raw: Snapshot }` → use `raw` directly.
- **B. Compact AI shape** (this is the one the owner will hand to an AI):
  ```json
  {
    "semester": { "start": "2026-09-07", "end": "2026-12-20" },
    "courses": [{ "name": "DB Systems", "room": "B12", "teacher": "Ms. X",
                  "meetings": [{ "weekday": 1, "start": "08:30", "end": "10:00" }] }],
    "days":    [{ "date": "2026-09-14", "status": "cancelled", "reason": "holiday" }],
    "tasks":   [{ "title": "Read chapter 1", "course": "DB Systems", "due": "2026-09-20T23:59" }],
    "marks":   [{ "course": "DB Systems", "name": "Quiz 1", "score": 18, "weight": 10 }]
  }
  ```
  `weekday` is `0=Mon … 6=Sun` (match `domain/time.ts`, not JS `getDay()`). Times are 24-hour `HH:MM`.
  Dates are `YYYY-MM-DD`; task `due`/`start` accept ISO or `YYYY-MM-DDTHH:mm`. `days.status` must be one of
  the existing `DayMark` statuses (`cancelled`, `holiday`, …) — read `domain/types.ts`, do not invent.
  Courses are referenced by **name** in tasks/marks/meetings-with-parent and resolved case-insensitively;
  an unresolvable name is a problem, not a crash.

Rules:

- **Idempotent**: an `id` in the file wins; otherwise derive a stable id from the natural key
  (`imp-` + short hash of course+weekday+start, course+name, date, etc.). Importing the same file twice
  must produce the same row count, not duplicates.
- Return `{ snapshot: Partial<Snapshot>, counts: Record<string, number>, problems: Problem[], warnings: string[] }`
  where `Problem = { where: string; field: string; message: string }`.
- Unknown top-level keys → warning, ignored. Unknown nested keys → warning, ignored.
- Empty/whitespace input, invalid JSON, wrong `app` value, and a missing `raw` → a problem with a readable
  message, never a throw.
- No deletes. Import only adds or overwrites rows with the same id. Document that in the sheet copy.

Apply path:

- New `Repository` method `importSnapshot(s: Partial<Snapshot>): Promise<void>`, implemented in **both**
  adapters, one transaction, same write discipline as `seed()` (outbox + rev + `put`). Then
  `putSettings({ semesterStart, semesterEnd })` when the file carries a semester.
- Store action `act.importPlan(plan)` → `R().importSnapshot` → reload the snapshot into state → toast with
  counts → `resync()` so reminders rebuild.
- UI: Settings → Data → **Import** sheet, following `sheets/forms.tsx` + `Sheet` conventions:
  1. a multiline paste box (`TextInput`, monospace, placeholder shows the compact shape),
  2. **Check** → preview: per-entity counts, semester range, problems list, warnings list,
  3. **Import** button, disabled while any problem exists; label it with the total row count.
  No file picker in v1 (that needs `expo-document-picker`; out of scope). Paste is the AI path.

### 3. Pre-migration safety copies

- In `openRepository()`: read `PRAGMA user_version` **before** `repo.init()`. If it is lower than
  `MIGRATIONS.length`, dump every user table (`sqlite_master`, excluding `sqlite_*`) to
  `Paths.document/marginalia/backups/pre-migration-<from>-to-<to>-<ts>.json` as
  `{ app:'margin', kind:'pre-migration', from, to, at, tables: { name: rows[] } }`.
- Keep the **newest 3**; never delete the newest even if the cap is exceeded. A failed dump must log and
  continue the migration — it must never block boot.
- Isolate the I/O in `src/services/safety.ts`; keep `dumpName`, `shouldBackup`, `keepNewest` pure and
  unit-tested. The expo-file-system wiring may be marked UNVERIFIED-ON-DEVICE if jest cannot exercise it.
- Settings → Data: a "Safety copies" row — count + newest timestamp + **Share** (reuse `expo-sharing`
  the way `exportFile.ts` does). Web: the row reads "not on web" (memory repository), same tone as the
  existing web notes.

### 4. One version string

- `app.json` version `0.2.0` → `0.3.1`.
- `src/domain/version.ts`: `export const APP_VERSION = '0.3.1'`.
- Use it in the export Summary (today the file says `Margin 1.0`, which is false) and in Settings → About.
- Test: `require('../../app.json').expo.version === APP_VERSION`.

## Out of scope (v1 excludes)

- `expo-updates`, EAS channels, any build or release step (brief B owns the updater).
- File-picker/doc-picker import, clipboard import, CSV/XLSX import, import of trips/alarms/focus rows.
- Any delete/replace-all import mode; any undo of an import beyond the existing settings snapshot.
- Notification, focus-mode, widget, card, desktop work.
- New dependencies of any kind.

## Evidence contract

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run boundaries` — all green, counts reported.
- New tests: `src/test/semester.test.ts`, `src/test/import-plan.test.ts` (both shapes, idempotency,
  malformed input, unknown keys, unresolved course, duplicate ids), `src/test/version.test.ts`,
  and pure-part tests for `services/safety.ts`. Extend `settings-render.test.ts` for the new fields.
- Report changed files with line refs; anything not verified is marked `UNVERIFIED`.
- Do not bump the test count by weakening or deleting an existing test.
