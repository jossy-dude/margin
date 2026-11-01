# v0.5 review: triage (partial)

A senior-developer pass over `git diff 417533b..HEAD` as of `15f83e9`. The user-tester pass with
Playwright screenshots (412×915 and 320×690, light and dark) has **not** been run yet; it belongs to the
next session, after the surface work (S1–S7, P1) it would judge.

| # | Area | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | Data, open | A safety copy that cannot be written now **stops the migration** (`services/safety.ts`). A phone with full storage cannot open v0.5 until space is freed. The Fatal screen leads with *Try again*, and nothing has been touched. | intended; verify on device | done; on the owner's device test |
| 2 | Data, open | A database written by a newer Margin is refused untouched (downgrade guard). Before, it was read with unknown columns dropped and written back. | was data-loss | fixed (`0be36d9`) |
| 3 | Data, writes | A refused write used to leave the row on screen until the next launch removed it. Writes now revert the row they moved and toast (`store/persist.ts → optimistic`). | was silent loss | fixed (`0be36d9`) |
| 4 | Data, cascade | Deleting a subject was 1 + N + M separate writes; a failure part-way left half a cascade on disk. Now one `removeMany` transaction. | was data-loss | fixed (`0be36d9`) |
| 5 | Data, tour | The tour hand-over is one `importSnapshot` transaction. If it fails, nothing is written, the session still moves to the real database, and a toast says the tour's rows were not saved; those rows stay on screen for the session only. A retry path is not built. | should-fix | open |
| 6 | Data, reset | "Erase everything" inside the tour now wipes the real database (it used to wipe only the memory copy and re-open the untouched file). A failed wipe stops with its reason. | was wrong target | fixed (`0be36d9`) |
| 7 | Data, archive | Roll-over cleared notes and day marks without archiving them. Archive v10 carries notes, day marks, curves and focus; v9 archives still read. | was data-loss | fixed (`c3f5386`) |
| 8 | Time | A 25-hour or 23-hour day shifted Tasks grouping, "tomorrow", overnight classes and the last day of term by an hour. Calendar `addDays` now; the suite runs under `TZ=Europe/Berlin`. | correctness | fixed (`586ec7d`) |
| 9 | Focus | Multi-round sessions saved only the last round; the clock moving back froze the timer. | was data-loss | fixed (`586ec7d`) |
| 10 | Backup | Auto Backup copied all of `files/`. Narrowed to `files/SQLite/` (confirmed as expo-sqlite's folder in its Android source) and `files/marginalia/`, plus shared prefs. | verify on device | done; owner's test step 12 |
| 11 | Workflow, secrets | The release key is decoded into `$RUNNER_TEMP` only for `variant=release` and removed with `if: always()`. The `variant` input is a choice, so its interpolation into `run:` cannot carry arbitrary text. Gradle refuses a release build without the key instead of falling back to the debug key. | ok | done (`9557519`) |
| 12 | Manifest | `SYSTEM_ALERT_WINDOW` and legacy storage are removed with `tools:node="remove"`, so a library cannot merge them back. | ok | done (`9557519`) |
| 13 | Perf | Pages mount on first visit; To-do draws 60 cards with *Show more*. The coach tour still navigates to its target pages before pointing at them, so first-visit mounting does not hide a target, but confirm on device. | verify | done (`c4c4815`) |
| 14 | Tests | One suite logs "Cannot log after tests are done" from jest-expo's lazy `fetch` global. It does not fail the run. | nit | open |
| 15 | Scope | Done 2026-11-01 (session 2, solo, no subagents): D1 migration 5 + variants, D2 margin/2 lossless import/export, D3 import page, D4 rest (roll-over dates, read-only past terms), D5 useUpdates + `ota-publish.yml`, N1 Rive/Nitro + `modules/margin-native`, U1 typed inputs (Stepper deleted), U2 inks/dark card stock/ruling/tape, S1 repro, S2 Today slot/After/Week lanes/Due. **Not started:** S3 instruments elapsed-dim, S4 subjects redesign (detail sheet, rooms chips, bar picker, "make variant" UI), S5 "+" sheet, S6 Focus, S7 sound, O1 onboarding (Teddy), N2 live countdown/DND JS + Settings rows, N3 widgets, P1 polish, V1/V2 review. | release-blocking for the full v0.5 brief | open |

**Must-fix before tagging:** #15 (scope), and the owner's device test (`docs/DEVICE_CHECKLIST.md`, last
section), which is the only proof for #1, #10 and #13.

## Session 2 notes (2026-11-01)

- **NCP1 build:** the first build-only `dev` APK run (41314249832) failed at 15 min with `OutOfMemoryError: Metaspace`
  in `lintVitalAnalyzeRelease`, then hung to the 45-min limit. Fixed in `e47e2d8` (Gradle 4 GB / 1.5 GB Metaspace, release
  lint-vital off, Kotlin in-process, step timeout 60, job 75). Re-run pending at the end of the session.
- **Web harness:** Metro's file watcher does not pick up edits in this environment; restart the server (`--clear`) before
  every browser assert, or it serves stale code.
- **Browser asserts added:** `tools/v05-inputs-assert.mjs`, `v05-today-assert.mjs` (clock pinned Mon 10:15),
  `v05-theme-shots.mjs`; `v05-import/semester-assert.mjs` updated. Frames in `docs/references/v0.5/`.
- **Deviation from the plan:** D2's split of `importPlan.ts` into `domain/import/*` was not done; the raw reader was made
  lossless in place (round-trip test proves it). Revisit only if import grows again.
- **UNVERIFIED-ON-DEVICE (add to the owner's list):** time-ruler detent click/haptic and flick settle; Teddy renders in
  Diagnostics; live countdown notification + swipe-dismiss memory; DND policy access; migration 5 on the owner's v0.1.0 data
  ("LR-601, LR-303" splits into two rooms); dark grain fibres and tape at real density.
