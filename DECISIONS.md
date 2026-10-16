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

---

_More questions will be appended as workstreams surface real forks (each with screenshots where visual)._
