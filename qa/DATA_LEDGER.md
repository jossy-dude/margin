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

**AGENT 2 (FRESH-USER + TASK-DOMAIN, 2026-10-05) created ZERO records.** Every task creation was
blocked by the device's secure keyguard before the first `Save` was pressed, so there is nothing to
delete. See the iteration log at the foot of `qa/BUGS.md` for the exact resume point.

### One thing AGENT 2 *did* change, and it is not reversible from the UI

| Entity | What was done | Where | Reversible? |
|---|---|---|---|
| Demo history | **Settings → Data & export → "Clear demo history"** (`act.purgeDemo`) | Settings → Data & export | **Partly.** It ran `DELETE FROM task WHERE demo=1` and `DELETE FROM focus_session WHERE demo=1`, so 6 demo finished tasks and 20 demo focus sessions are gone. `Reset → "Reset to demo set"` restores the full demo set (but also resets settings). No undo exists for purge, by design. |

This was done deliberately, per the run brief, to reach empty states — and it is the evidence for
**BUG-025**: it does not empty the database. Subjects, timetable, attendance, day marks, notes, marks
and the **9 open tasks all survive**, so the next agent's baseline is *not* the seeded baseline in the
table above.

---

## Baseline as AGENT 2 left it (2026-10-05, ~02:15)

Measured off the live app, not off the docs. **This is the baseline the next agent starts from.**

| Entity | Seeded baseline (above) | **After AGENT 2** | Evidence |
|---|---|---|---|
| To-do open count | 9 open | **9 open** (unchanged) | `qa/shots/a2_after_purge_todo.png` |
| To-do groups | Late·8, Later·1, Done·7 | **Late·8, Later·1, Done·1** | `qa/shots/a2_tasks_bottom_end.png`, `qa/shots/a2_done_only2.png` |
| The surviving done task | — | `Lab report — set proofs` · Discrete Mathematics · "done 3 h late" · ~2h | `qa/shots/a2_done_only2.png` |
| Demo finished tasks | 6 (per STATE.md; **7** observed in Done) | **0** | idem |
| Focus sessions | 20 demo | **0** | `qa/shots/a2_stats_afterpurge.png` — "0m in the last 15 weeks" |
| Courses | 5 seeded (+ Database Systems in the timetable) | unchanged; **6** appear in Stats "Attendance by subject", **3** in "Totals against goals" | `qa/shots/a2_stats_when2.png` |
| Attendance marks | 68/68 classes, 100 % over 30 days | unchanged | `qa/shots/a2_baseline_stats.png` |
| Marks | ItE 76, DM 78, CP 91 | unchanged | `qa/shots/a2_stats_s2.png` |
| Today's classes (Mon 5 Oct) | ItE 08:30, DM 10:00, ET 11:45, CP 14:00 | unchanged | `qa/shots/a2_home.png`, `qa/shots/a2_today_sat_empty.png` |
| Settings | name "Jossy", theme auto/refined/Guilloché Ivory, quiet 22:00–07:00, semester from 2026-09-07, breaks 5 min × 2 | **unchanged — I changed no settings** | `qa/shots/a2_settings_open.png` |
| Reminders queued | — | 60 scheduled in the next 14 days, 16 waiting | `qa/shots/a2_stats_afterpurge2.png` |

### Counts to diff against when the next agent adds `QA_` records

| Probe | Expected before | Expected after +1 task |
|---|---|---|
| To-do sub-line | `9 open · swipe right to finish, left to crumple.` | `10 open · …` |
| `Late · 8` group header | 8 | unchanged (a future-dated task goes to a later group) |
| `Done · 1` group header | 1 | 1 until the new task is ticked |
| "Every subject" chip row | 5 chips visible, 4th clipped | +1 if the task has a new subject |
| Stats "Tasks finished" | `1 in the last 15 weeks · streak 1 days` | 2 once the task is ticked, **and the "1 days" plural bug becomes "2 days"** → BUG-029 |
| Stats "On time" ring | `0%` / `0/1 tasks` | `0/2 tasks` |
| Stats "When you tick things off" | `Most tasks are finished around 22:00` | moves to the hour the task is actually ticked |

---

## Cleanup list (fill as data is created)

**Nothing for the user to delete.** AGENT 2 created no `QA_`-prefixed records.

The only residue of this run is the demo-history purge in the table above. If the user wants the demo
data back: **Settings → Reset → "Reset to demo set"** (double-tap; it cannot be undone, and it also
resets every setting to its default).

**Standing instruction for the next agent:** every title you create must start with `QA_`, and append
a row above with the exact field values, the expected display string, the expected counts, and the
observed result — so this list stays a complete deletion list.

## Template

```
| QA-001 | Task | title="QA_algebra_hw", subject=none, due=today+2h, effort=45 | Tasks → FAB → Assignment | card under "Due soon", "45 min" | open 9→10 | ... | verified |
```