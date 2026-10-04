# DATA LEDGER — Marginalia pre-launch gate

Every record created during QA, with the exact values, so a later agent can verify
propagation and so the data can be cleaned up afterwards.

**Naming rule:** every QA-created record must be findable. Task titles, subjects and
notices use the `QA_` prefix.

**Baseline:** the app seeds demo data on first run (`src/data/seed.ts`) — 5 subjects,
a v10 demo timetable, marks, tasks, notes, plus 6 finished tasks and 20 focus sessions
flagged `demo`. Demo data is **not** `QA_`-prefixed and must never be deleted by an
agent. It is removable in-app via Settings → Clear demo history.

**Wipe everything (agent runs):**
```bash
adb shell pm clear host.exp.exponent          # Expo Go sandbox, incl. its SQLite
adb shell pm clear app.marginalia.planner     # standalone release build
```

---

## Seeded baseline (not created by QA — reference only)

Counted from the live app at cold boot, 2026-10-04, `qa/shots/v1_boot_01.png`:

| Entity | Observed | Note |
|---|---|---|
| Subjects | Computer Programming, Discrete Mathematics, Emerging Technology, Intro to Economics, Personal | 5, matches prompt.md "Grades shows 5 subjects" |
| Timetable meetings | present (Week/Today render class rows) | exact count not yet tallied |
| Tasks | 9 open (`9 open · swipe right to finish, left to crumple`) | groups: `Late · 8`, `Due soon`, `Done` |
| Task: Reading response — Ch. 7 | Intro to Economics, `6 d late`, ~45m, tight | |
| Task: Flashcards: key dates | Emerging Technology, `6 d late`, ~30m, tight | |
| Task: Problem set 5 | Computer Programming, `6 d late`, ~1h30m, tight | |
| Task: Timeline worksheet | Emerging Technology, `5 d late` | |
| Task: Outline: persuasive essay | Intro to Economics, `3 d late`, ~1h, tight | |
| Task: Bring the sources binder on Thursday, essay workshop starts. | (in list) | |
| Task: Essay final draft | (in list) | |
| Notices | "Lab groups rotate this week — check the door list before you come in." (Intro to Economics · important) | |
| Done tasks | 6 (demo-flagged, per STATE.md) | |
| Focus sessions | 20 (demo-flagged, per STATE.md) | |

Expected on a cold, freshly-seeded DB: **9 open tasks**, 5 subjects, Stats non-empty.

---

## QA-created records

| ID | Entity | Exact values | Where created | Expected display | Expected counts / totals | Actual | Status |
|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — |

---

## Cleanup list (fill as data is created)

Nothing created yet. Agents append here so the final report can hand the user an exact
list of `QA_` records to delete.

## Template

```
| QA-001 | Task | title="QA_algebra_hw", subject=none, due=today+2h, effort=45 | Tasks → FAB → Assignment | card under "Due soon", "45 min" | open 9→10 | ... | verified |
```