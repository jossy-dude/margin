# COVERAGE — Marginalia pre-launch gate

Every screen × every interactive element. No element may stay `untested` at exit.
Legend: `untested` · `pass` · `fail` (link a BUGS.md id) · `n/a (release-build only)`

Routes: `Today` `Week` `Tasks` (labelled **To-do**) `Grades` `Stats` `Focus`
Bottom nav = 5 tabs, hidden on Focus. Sheets: `add` `task` `status` `settings`
`course` `meeting` `mark` `notice` `slip` + nested Settings sub-pages.

**Pass-1 scope** (per `prompt.md` R1 risk ranking): V1 V2 V3 V8 V9.

---

## Screen: Today
| Element | Status | Notes |
|---|---|---|
| Greeting + date header | untested | "Good evening, Jossy" |
| Clock face (5 variants) | untested | V4, deferred |
| Day bar (spines/glass/trace/ticker) | untested | |
| Timeline / class rows | untested | |
| Attendance cell → status sheet | untested | |
| Notice / note row | untested | |
| "No classes today" empty state | untested | seen in boot dump |
| Timer icon → Focus | untested | |
| Theme toggle (sun icon) | untested | |
| Settings gear | untested | |
| Bottom nav → each tab | untested | |
| FAB (+) → Add | untested | |

## Screen: Week
| Element | Status | Notes |
|---|---|---|
| Week grid / day columns | untested | |
| Day header + "This week" | untested | |
| Class block → tap | untested | |
| Day mark | untested | |
| Horizontal overflow check | untested | V2 |

## Screen: Tasks (To-do)
| Element | Status | Notes |
|---|---|---|
| Search field | untested | "Search tasks" |
| Running-focus card | untested | "25 min ready" |
| Filter: All / Open / Done | untested | |
| Sort: By date / By priority / Newest | untested | |
| Subject chip row + scroll | untested | **possible clip at right edge** |
| Group headers (Late · 8, Due soon, Done) | untested | |
| Task card → open detail | untested | |
| Checkbox → done | untested | |
| Swipe right → done | untested | |
| Swipe left → crumple + Undo | untested | |
| Long-press → Focus | untested | |
| FAB → Add | untested | |
| Nav + gear + theme | untested | |

## Screen: Grades
| Element | Status | Notes |
|---|---|---|
| Subject cards (5 seeded) | untested | |
| Grade total / letter | untested | |
| Goal "needed" line | untested | |
| Curve ± stepper | untested | |
| **Attendance grid** (V8) | untested | 28dp cells, 3dp gaps, h-scroll inside card |
| Cell: 1 tap on unmarked → Here | untested | V8.1 |
| Cell: tap on marked → denied shake | untested | V8.2 |
| Cell: long-press → status sheet | untested | V8.3 |
| Cell: Late → "L" amber | untested | V8.4 |
| Lock button → deny all / unlock | untested | V8.5 |
| Misplaced tap in 3dp gap | untested | V8.7 |
| Subject chip filter | untested | |

## Screen: Stats
| Element | Status | Notes |
|---|---|---|
| At-a-glance rings | untested | |
| Focus heatmap (28d) | untested | |
| Done-by-hour histogram | untested | |
| Attendance heat/rates | untested | |
| Grade bars | untested | |
| Charts animate once | untested | |
| Empty-state hint | untested | |

## Screen: Focus
| Element | Status | Notes |
|---|---|---|
| Knurled dial drag (5-min steps) | untested | V10a, highest risk |
| Dial limits 5 / 240 bump | untested | |
| Presets 25/45/50/90 | untested | |
| Flow toggle | untested | |
| Start / Pause / Resume | untested | |
| Round-done stamp | untested | |
| Break sticker (tap to end) | untested | |
| Swap task | untested | |
| End session | untested | |
| Back → Today | untested | |

## Sheet: Add (8 tiles)
| Element | Status | Notes |
|---|---|---|
| Assignment / Exam / Reading / Project | untested | |
| Class / Mark / Note / Subject | untested | |
| Drag down to dismiss | untested | |
| Back to dismiss | untested | |

## Sheet: Task (create/edit)
| Element | Status | Notes |
|---|---|---|
| Title field | untested | |
| Subject optional ("No subject") | untested | |
| Due → WhenPicker | untested | |
| Reminder chips (At due time / 2h before / …) | untested | |
| Effort Stepper (min) | untested | |
| Tight/Comfortable + latest start | untested | |
| Subtasks add + tick | untested | |
| Save | untested | |
| Empty / whitespace / long / emoji / RTL input | untested | |
| Double-submit guard | untested | |

## Sheet: WhenPicker / Status / Slip / Course / Meeting / Mark / Notice
| Element | Status | Notes |
|---|---|---|
| WhenPicker options + custom time | untested | |
| Status sheet (class/day) incl. Lock | untested | |
| Slip sheet | untested | |
| Course create/edit/delete + Undo | untested | |
| Meeting create/edit/delete + Undo | untested | |
| Mark create/edit/delete + Undo | untested | |
| Notice create/edit/delete + Undo | untested | |

## Sheet: Settings (nested, live preview)
| Element | Status | Notes |
|---|---|---|
| Open / drag-down / back close | untested | |
| Look & feel → Theme & palette | untested | |
| → Paper & texture | untested | |
| → Clock face (5) | untested | V4 |
| → Progress bar | untested | |
| → Accent pen | untested | |
| Reminders → Classes | untested | |
| → Tasks & exams | untested | |
| → Hours & quiet time | untested | |
| → Per-subject lead time | untested | |
| → Delivery status | untested | |
| Sound & haptics (groups, Play, volumes, master) | untested | |
| Attendance & semester | untested | |
| Focus & breaks | untested | |
| Data & export (XLSX/CSV/JSON, folder/share) | untested | |
| Diagnostics (crash log, test crash) | untested | |
| Reset (double-tap) | untested | |
| Sub-page back = up one level | untested | |

## Cross-cutting
| Concern | Status | Notes |
|---|---|---|
| Cold boot → Today, no red screen | **pass** | V1 pass 2026-10-04, `qa/shots/v1_boot_01.png` |
| Initial route is `Today` (`store.ts:32`) | pass | code + boot dump; my Expo Go "Continue" tap hit the To-do tab |
| Page transition drop/tilt/settle | untested | V3 |
| Back order sheet → sub-page → Focus → Today → exit | untested | V19 |
| Edge-to-edge status bar legibility | untested | V19 |
| Dark mode | untested | device is currently dark (`night=yes`) |
| Light mode | untested | |
| Font scale 1.3 | untested | |
| 360dp width | untested | |
| 430dp width | untested | |
| Landscape / rotation | untested | portrait-locked |
| Persistence across force-stop | untested | |
| TalkBack labels + focus trap | untested | |
| Offline (no network in app) | n/a | app is fully local SQLite |
| Notification delivery timing | untested | **release build only** |
| Custom notification sound | untested | **release build only** |
| Haptics quality | untested | **release build only** |
| Performance / jank numbers | untested | **release build only** |

---

## Summary
Screens: 6 routes + 12 sheet types. Elements enumerated: **149**.
Pass: 2 · Fail: 0 · Untested: 147.