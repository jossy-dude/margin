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

## Cross-cutting — preflight gates (STATIC AUDITOR, 2026-10-04)
Run from the repo root on Node 24.16.0 / npm 11.13.0. These are *gates*, not device tests: they are marked
pass/fail here so no agent re-runs them, and they were green again after the a11y commit `8aa428a`.

| Gate | Status | Notes |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`, strict) | **pass** | clean |
| `npm run lint` (`eslint src --max-warnings=0`) | **pass** | 0 warnings, 0 errors |
| `npm run test` (`jest`) | **pass** | **111 tests / 9 suites** (STATE.md says 104, `prompt.md` says 82 — both stale) |
| `npm run boundaries` (`depcruise`) | **pass** | no violations, 127 modules / 387 dependencies |
| `npm run check` (all four chained) | **pass** | exit 0 before and after `8aa428a` |
| `npx expo-doctor` | **fail** | 17/21 pass. 4 failures = BUG-001, BUG-002, BUG-003, **BUG-007** |
| `npx expo install --check` | **fail** | 1 package out of date: `typescript@5.9.3` vs expected `~6.0.3` → BUG-007. Read-only run; `--fix` deliberately NOT used |
| Unused runtime deps shipping native code | **fail** | `expo-dev-client`, `expo-asset`, `expo-linking`, `expo-system-ui` never imported from `src/` → BUG-010 |
| Secret / hardcoded-URL sweep | **pass** | none. Only XML namespace URIs in `export.ts` + `faces.ts` |
| `console.*` / `debugger` / `TODO` / `FIXME` / `HACK` | **pass** | zero occurrences in `src/` |
| Store selector stability (`prompt.md` N9 / R10) | **pass** | all 74 `useStore(...)` sites return a stable reference; **no `useStore((s) => s)`**. R10 is stale |
| `allowFontScaling={false}` / `maxFontSizeMultiplier={1}` | **pass** | zero. `FS = 1.4` is the single cap, imported at all 9 sites |
| `Dimensions.get` | **pass** | none; all sizing via `useWindowDimensions` |
| List virtualisation | **fail** | no `FlatList`/`SectionList` anywhere; every list is `ScrollView` + `.map()` → BUG-013 |
| `key` props on mapped lists | **fail** | present and correct except `DayBar.tsx:98` (index key over per-second content) → BUG-016 |
| Interactive elements missing `accessibilityLabel` | **fail → fixed** | 1 gap (`Week.tsx:58`) + **zero `testID` app-wide**; both fixed in `8aa428a` → BUG-006 |
| Timer / listener cleanup in `useEffect` | **pass** | `Keyboard`, `BackHandler`×2, `AccessibilityInfo`, `useNow`, both double-tap guards all clean up |
| Async calls without error handling | **pass** | every `expo-*` native call degrades silently by design; export surfaces a toast; boot has `alive` + `recordCrash` |

### Static-audit note (read before driving the device)

1. **`testID` now exists and is the reliable handle.** `8aa428a` derives ids from the accessibility label in
   `src/ui/kit.tsx`, so `Btn`/`Chip`/`Toggle`/`Stepper`/`Field` are covered without touching a call site. Known
   anchors: `tab-today` `tab-week` `tab-tasks` `tab-grades` `tab-stats` `tab-focus`, `fab-add`, `open-settings`,
   `open-focus`, `clock-face`, `sheet-close`, `sheet-back`, `sheet-dismiss`, `toast-dismiss`,
   `att-cell-<YYYY-MM-DD|HH:MM|courseId>`, `week-due-<taskId>`.
   **Known collision:** every Grades card renders its own `btn-mark` and `btn-delete subject`; `Btn` takes an
   explicit `testID` prop when the Fixer needs to disambiguate.
2. **Expect the status bar to look wrong in dark mode (BUG-004).** It is a static certainty, not a guess — do not
   spend a device cycle re-deriving it; capture one screenshot as evidence and move on.
3. **Expect the clock face / Focus dial to look refined-toned under the Original palette (BUG-005).** Same: the
   hex literals are proven. One screenshot in each palette settles the severity.
4. **Do not treat `prompt.md` R10 as open.** Whole-store subscriptions are gone.
5. **Two stale test counts in the docs** (`prompt.md:8` says 82, `qa/STATE.md:19` says 104; actual 111). Any agent
   reporting "tests dropped" is reading a stale number.

---

## Summary
Screens: 6 routes + 12 sheet types. Elements enumerated: **149**.
Pass: 2 · Fail: 0 · Untested: 147.
(Static gates are tracked separately above and are not counted in these 149 elements.)