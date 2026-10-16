# DECISIONS — numbered questions for Jossy

Answer with numbers only (e.g. "D1: a, D2: a"). Each has a recommended default that is **already in
effect** unless you pick another option; switching is cheap.

---

## D1 — Reference screenshots are missing

`docs/reference/` does not exist in the repo (no git history, nothing on disk). The brief said
timer-clock-overlap.png, timer-screen.png and onboarding-1..5.png live there.

- **a (default, in effect):** I capture baselines myself from Expo web (`.shots/baseline/`) and the
  vision-critic judges against those plus your written observations.
- **b:** You drop the five/seven reference files into `docs/reference/` and I re-run the baseline review
  against them.
- **c:** Both — proceed on (a) and re-check against (b) when the files appear.

**Recommendation: (a) now, (c) if convenient.** Web baselines cannot show the native-only grain/status-bar
problems, so W2 still relies on your Expo Go observations — but they pin layout, overlap and hierarchy.

**Resolved 2026-10-16 (owner): (a)** — self-captured baselines stand; image judgement runs through
MiMo V2.6 Flash (`vision-critic`, `user-tester`) since the orchestrator text models do not read images.
Done: `reports/vision-baseline.md`.

## D2 — "study_sessions" vs the existing focus_session table

The brief asks migration 2 to add `study_sessions(subject, optional_task, start, end, planned_min,
actual_min, mode, completed)`. The DB **already has** `focus_session` (id, task_id, course_id,
started_at, ended_at, focus_sec, break_sec, over_sec, rounds, plan_min, demo) written when a timer round
finishes, and Stats already reads it. Adding a second session table would fork the data path.

- **a (default, in effect):** extend `focus_session` with `mode` and `completed` (+ any missing
  columns), treat it as the study-sessions table in docs/UI. Existing rows survive untouched; one
  writer, one reader.
- **b:** new `study_session` table exactly as named; backfill old rows from `focus_session` once; timer
  writes the new table; Stats reads it.
- **c:** keep `focus_session` but expose a SQL `study_session` **view** projecting the brief's names.

**Recommendation: (a)** — smallest honest change, zero data fork, and the UI can still say "study session".

**Resolved 2026-10-16 (owner): (a)** — extend `focus_session` with `mode` + `completed`. In W1's migration 2.

## D3 — Where `stats_config` lives

The brief's migration list names a `stats_config` table. The app already persists every setting —
including the whole `NotifSettings` object — as rows in the `setting` KV table (`Settings` type,
`putSettings`). A one-row config table would be the only settings-like object with its own schema.

- **a (default, in effect):** stats config (tracked metrics, weekly goals per subject, week start day,
  default range) is one typed `stats` key in the existing `setting` table, like `notif`.
- **b:** create the `stats_config` table as named; one row per key.
- **c:** per-subject study goals go on the `course` table as a column; the rest in `setting`.

**Recommendation: (a)** — one persistence pattern, no orphan schema, export/import keeps working for free.

**Resolved 2026-10-16 (owner): the recommended one — (a)**, a typed `stats` key in the `setting` table.

## D4 — Lock-screen notification visibility

The code audit (H4) found reminder titles and bodies — course and task names — go to the lock screen
with the platform default visibility. Android offers per-channel `lockscreenVisibility`.

- **a:** classes and tasks channels set `AndroidNotificationVisibility.SECRET`: the notification still
  buzzes and can be opened, its text is hidden until unlock.
- **b:** leave the platform default; the user's system setting decides.
- **c:** a Settings toggle ("Show reminder text on the lock screen"), default off.

**Resolved 2026-10-16 (owner): b + c, on by default, asked during onboarding.** So: a real Settings
toggle **"Show reminder text on the lock screen", default ON** (text visible = platform default); the
onboarding flow asks it (W8), Settings holds it, and W5 wires the channels: OFF → `SECRET`.
The onboarding ask must be honest about what "off" does (reminder still rings, text hidden until unlock).

## D5 — What happens when a write fails or stored data is corrupt

The code audit (H1–H3) found three silent-loss shapes: a failed write left the optimistic UI in place
with only a 2.6 s toast; an unparseable JSON column loaded as `[]` and the next save committed that
loss; an unparseable setting key silently fell back to its default.

- **a (default, in effect in W1):** failed writes are recorded in the Problems log (Diagnostics) next
  to the toast; corrupt row-level values are skipped **from the UI** at load (never written back), the
  raw bytes stay untouched in the database, and each occurrence is listed in Diagnostics. The UI does
  not roll back optimistic state on its own.
- **b:** additionally revert the optimistic write by re-reading the affected row (audit H1's stronger
  option) — the visible state snaps back to what is actually on disk.
- **c:** refuse to boot when any row fails to parse (loudest, but one bad byte hides the whole app).

**Recommendation: (a)** — C1 (serialised writes) removes the failure that was reachable from normal
use; (b) can follow once a real write failure has been observed in the field. (c) trades one corrupt
row for a bricked app, which C2's fix exists precisely to avoid.

**Resolved 2026-10-16 (owner): (a)** — as being implemented in W1.

---

_More questions will be appended as workstreams surface real forks (each with screenshots where visual)._
