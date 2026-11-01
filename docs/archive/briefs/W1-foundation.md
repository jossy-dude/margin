# W1 brief — Foundation: data safety, error plumbing, perf hygiene

**let's make v1 first.** This is the smallest complete slice that makes the fixes real. Anything not
listed under In scope is excluded on purpose.

- Branch: `v2-improvements` (commits: `7fb440e` snapshot → `72ad06c` setup). Do **not** commit — the
  orchestrator reviews the diffstat and commits this workstream as one commit.
- Builder: `opencode/deepseek-v4.1-flash-free` (project agent `builder`).
- Inputs: `reports/audit-code.md` (C1, C2, H1–H3, L1, M2, M4–M6), `DECISIONS.md` (D2, D3, D5),
  `PLAN.md` §W1. Re-read the cited lines before editing.
- Evidence rule: every item lands with a command output on disk. Full gate: `npm run check`
  (typecheck + lint + jest + boundaries) → tee to `/tmp/opencode/logs/w1-check.log`.
- Test pins are deliberate: several tests assert **source strings** (`useNow(…)` arguments, testIDs).
  Update a pin only together with the change it pins, and note why in the test beside it. Never delete
  a pin to make it pass.
- Do not touch: `docs/lag-diagnosis-2026-10-14.md`, `docs/BATCH-2026-10-14.md` findings, the 2026-10-14
  timer redesign, any UI outside this brief. No new dependencies.

---

## A — Serialise repository transactions (audit C1, critical)

Two overlapping writes nest `BEGIN`s on the shared connection; the second rejects with "cannot start a
transaction within a transaction" and the write is lost while the UI keeps the optimistic row.

- `src/data/sqlite.ts`: add a private promise queue (`ser(f)`) and route **every**
  `withTransactionAsync` entry point through it (`upsert`, `remove`, `restore`, `seed`, `reset`,
  `purgeDemo`, whatever else exists — grep the file), plus `load()` so a read cannot observe a
  half-applied compound write.
- Keep the public `Repository` interface unchanged.
- Evidence: extend `src/test/repo.test.ts` (node-sqlite shim already there) with the probe B shape —
  issue two `upsert`s concurrently; assert **both** land, no rejection. Same for three `remove`s.

## B — Migration hardening + migration 2 (audit C2, critical; PLAN W1)

- `src/data/sqlite.ts` init loop: run each migration and `PRAGMA user_version = n+1` **inside one**
  transaction, and make `MIGRATIONS[0]` idempotent (`CREATE TABLE IF NOT EXISTS …`). A DB whose
  schema committed but version did not must self-heal on the next launch instead of rejecting forever.
- New `MIGRATIONS[1]` (version goes 1 → 2), canonical shapes for W5/W6 (minimal and forward-safe; a
  later workstream may add migration 3 rather than guess fields now):
  - `trip(id TEXT PRIMARY KEY, startedAt INTEGER NOT NULL, endedAt INTEGER NULL, route TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '')`
  - `alarm(id TEXT PRIMARY KEY, at INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, kind TEXT NOT NULL DEFAULT 'leave', taskId TEXT NULL)`
  - `ALTER TABLE focus_session ADD COLUMN mode TEXT NOT NULL DEFAULT 'focus'` and
    `ADD COLUMN completed INTEGER NOT NULL DEFAULT 0` (D2: extend, do not fork).
- Wire the new entities end-to-end at the data layer only: `domain/types.ts` (`Trip`, `Alarm`),
  `data/specs.ts` (SPECS rows + EntityMap), `data/repository.ts` (Snapshot gains `trips`, `alarms`),
  `data/memory.ts` + `data/seed.ts` (empty arrays seed fine), `sqlite.ts` (`load()` returns them).
  Export/import: include both arrays on the **JSON** path; XLSX/CSV sheets only if it is a few lines —
  otherwise leave a short comment and list it under Open items, don't build new export UI.
- Existing user data must survive: `focus` rows load with the defaults above.
- Evidence (extend the shim-based tests):
  1. fresh DB → `user_version` = 2, both tables exist, focus_session has both columns;
  2. **old-DB fixture**: build a v1-schema DB with one task/course/focus row → `init()` → data intact,
     version 2; running `init()` again is a no-op;
  3. **kill-window fixture** (probe D): create the v0 schema manually, leave `user_version` 0, then
     `init()` → resolves, version 1→2, no throw.

## C — Problems log (audit H1–H3, L1; DECISIONS D5 default a)

The crash log becomes the **Problems log**: same file, same Diagnostics page, new kinds.

- `src/ui/crashlog.ts`: widen `phase` to `'boot' | 'runtime' | 'save' | 'data'` (keep every existing
  entry valid). `recordCrash` must still never throw, even on web where file APIs differ.
- `src/store/store.ts`:
  - `persist()` catch: `recordCrash(e, 'save', state.route)` **in addition to** the toast (H1).
  - `logNotif` / `schedNotif` catch arms (L1): breadcrumb via `recordCrash(e, 'save', …)` — the
    `try`/`catch` for the un-opened repository stays.
- `src/data/sqlite.ts` `load()`:
  - H2: a `json` column that fails to parse must **not** become `[]` and must never be written back.
    Skip that row from the loaded array, record one `'data'` problem naming entity, column and the
    first ≤40 chars of the raw value. Add the comment explaining why skipping is the safe direction.
  - H3: a setting key that fails to parse is excluded and recorded the same way. (`putSettings` already
    persists only patched keys — verify, don't change.)
- `src/sheets/Diagnostics.tsx`: `'save'`/`'data'` entries need their own header line (e.g. "While
  saving" / "While reading data") instead of "On {route}"; the copy-out text keeps its existing shape.
  Keep all "Marginalia crash" strings as-is unless a test pin makes a rename trivial — the log is
  greppable evidence, churn there is not worth it.
- Evidence: tests — corrupt-JSON task row loads skipped + recorded + **disk bytes unchanged**; corrupt
  setting excluded + recorded; persist rejection → entry in log (mock adapter rejecting once).

## D — Per-screen boundary (PLAN W1)

Today one render error anywhere shows the full-shell CrashScreen. Add `src/ui/ScreenBoundary.tsx`
(class, small): records the crash once (`'runtime'`, with the route it is given) and renders an inline
paper-styled card — "This page hit a problem", the message, a **Try again** button — while the rest of
the shell (nav, other pages) keeps working. Wire one around each of the six screens in `App.tsx`'s
`navTree` (you may wrap `component` per screen); the boot/runtime `CrashBoundary` mounts stay.
- Motion: if you animate anything here, follow the app's own dips/eases (`kit.tsx`, `EASE` from
  `playback` constants) — no new motion vocabulary. (Skill `expo-animation` is available if needed;
  `emil-design-eng` is not installed — do not invent its patterns.)
- Evidence: jest render test — child throws → fallback shown, crash recorded with route, sibling
  content outside the boundary still rendered.

## E — Perf hygiene from the audit (M2, M4, M5, M6)

- **M2** `applySnapshot` (`store.ts:132`): compute `withDefaults(s.settings)` once.
- **M4** `sqlite.ts init()`: bound the bookkeeping tables — keep the newest 500 `outbox` rows and the
  newest 200 `notif_log` rows (`DELETE FROM … WHERE … < (SELECT MAX(…) - N)` shapes; both tables are
  internal logs, **not** user data — do not touch tasks/courses/marks). Evidence: insert 600/300 rows
  in a test DB, init, assert caps. Comment the numbers and why.
- **M5** ticker: `useNow` (`src/ui/theme-context.tsx`) accepts `0` = frozen (no timer armed; the
  effect still re-runs on an `ms` change, so a screen becoming live gets true time immediately). Then
  pass the existing `live` flag (`src/ui/live.ts`) into the `useNow` calls of **Stats, Grades, Tasks,
  Week** (`useNow(live ? 60_000 : 0)`); Today/DayBar/RunningTimer already read `live`; Focus keeps its
  cadence (the timer pumps from the live screen — do not gate it). Update pinned test strings
  deliberately, with a rationale comment beside each. Evidence: a fake-timers test that a `0` cadence
  schedules no work, plus `npm run check` proving the six screens still render.
- **M6** `Overlay.tsx`: stop subscribing to `s.route`; select the primitive
  (`useStore((s) => !s.sheet && s.route !== 'Focus')`) so tapping a tab does not re-render the overlay
  subtree for one boolean. Keep `sheet`/`toast` behavior identical.

## Not in this workstream (so nothing is silently dropped)

H4 lock-screen visibility → W5 (DECISIONS D4). M1 type holes + M3 export-file cleanup + M8 nudge.wav
move + L3 seed-comment + L4 curl-port → fast-worker batch after W1. M7 audio/PCM + L2 JPEG → W9.
H1's revert-on-failed-write → DECISIONS D5(b), not built.

## Deliverable (what you hand back)

1. The edits above, working tree left uncommitted.
2. `/tmp/opencode/logs/w1-check.log` — full `npm run check` output, green.
3. A short summary: per item, file:line of the fix; the new/updated tests; any pin you deliberately
   updated and why; **Open items** (anything you hit that the brief did not decide — do not stop,
   record it); and the exact commands you ran for evidence.

Stop and ask (do not proceed) only for: deleting user data (tasks/courses/marks/attendance/focus rows),
a schema change without a numbered migration, or anything outside the repo.
