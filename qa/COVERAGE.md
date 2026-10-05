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
| Day bar (spines/glass/trace/ticker) | **fail** | Default kind rendered. Strip is hard-wired to *today* while "Mark day" below it acts on the *selected* day → **BUG-022** |
| Timeline / class rows | **pass** | 4 classes listed with times, rooms, teachers, dashed attendance cells; walked, not tapped |
| Attendance cell → status sheet | untested | |
| Notice / note row | **pass** | 2 notes render; 2nd is clipped at the screen edge → **BUG-026** |
| "No classes today" empty state | **pass** | Reached via Sat 10 (0 classes): "No classes. Add one from the + button." in a dashed box. Hint present, nothing blank → `a2_today_sat_empty.png` |
| Timer icon → Focus | untested | |
| Theme toggle (sun icon) | untested | |
| Settings gear | **pass** | Opens the Settings sheet |
| Bottom nav → each tab | **fail** | All 5 tabs reachable, but hardware BACK desyncs the highlight and kills a tab → **BUG-021** |
| "Mark day" button | **fail** | Opens the *selected* day while the strip above says the *current* day → **BUG-022** |
| FAB (+) → Add | **pass** | |
| Week strip day select | **fail** | Selecting Sat 10 leaves the title/greeting/Next-up/attendance on Monday → **BUG-022** |

## Screen: Week
| Element | Status | Notes |
|---|---|---|
| Week grid / day columns | **pass** | 7 columns, vertical rules at x=121/252/383/513/644/775/906 + card border 1035, headers centred on their columns. No overflow, no missing Sunday |
| Day header + "This week" | **pass** | "This week · 5 Oct – 11 Oct" |
| Hour scale labels | **fail** | "16" sliced in half by the card's bottom border → **BUG-027** |
| Class block → tap | untested | |
| Class block → long-press to edit | untested | |
| Day mark | untested | |
| Horizontal overflow check | **pass** | V2 — measured clean, do not re-audit. See BUG-027 note |
| "+ Class" button | untested | Rendered only |
| "Due this week" section | **pass** | Empty state "Nothing due this week." — correct, the 9 open tasks are all due in a *previous* week |

## Screen: Tasks (To-do)
| Element | Status | Notes |
|---|---|---|
| Search field | **pass** | Typed `zzqqxx` → empty state "Nothing matches that search." with icon → `a2_search_empty.png`. Keyboard opens without covering the field (V19 core requirement holds) |
| Running-focus card | untested | Rendered ("25 min ready"); not opened |
| Filter: All / Open / Done | **fail** | All and Done exercised (Done → `Done · 1` after purge). Open not tapped. **Open** |
| Sort: By date / By priority / Newest | untested | Chips rendered; "By date" active. Not toggled. **Open** |
| Subject chip row + scroll | **fail** | 4th chip squeezed to 92 px and cut at the screen edge → **BUG-026** |
| Group headers (Late · 8, Later · 1, Done · 1) | **pass** | Headers and counts correct: 8 + 1 = 9 open; Done 7 → 1 after purge |
| "+ New task" button | untested | Rendered at the list foot |
| Task card → open detail | untested | **device locked** |
| Checkbox → done | untested | **device locked** |
| Swipe right → done | untested | **device locked** |
| Swipe left → crumple + Undo | untested | **device locked** |
| Long-press → Focus | untested | **device locked** |
| FAB → Add | **pass** | |
| Nav + gear + theme | **fail** | Gear **pass**; theme toggle untested; nav → **BUG-021** |

## Screen: Grades
| Element | Status | Notes |
|---|---|---|
| Page header | **pass** | "Average 81.7% · A−" renders; walked only |
| Subject cards (5 seeded) | untested | Card list glimpsed, not exercised — out of my scope (V8) |
| Grade total / letter | untested | |
| Goal "needed" line | untested | |
| Curve ± stepper | untested | |
| **Attendance grid** (V8) | untested | |
| Cell: 1 tap on unmarked → Here | untested | |
| Cell: tap on marked → denied shake | untested | |
| Cell: long-press → status sheet | untested | |
| Cell: Late → "L" amber | untested | |
| Lock button → deny all / unlock | untested | Toggle rendered in Settings, off |
| Misplaced tap in 3dp gap | untested | |
| Subject chip filter | untested | |

## Screen: Stats
| Element | Status | Notes |
|---|---|---|
| At-a-glance rings | **pass** | Attendance 100 % 68/68, On time 14 % → 0 % after purge, Focus week 100 % → 0 %, Focus streak 14 % → 0 %. **4th ring's label is clipped to "Focus strea"** → **BUG-030** |
| Focus heatmap (28d) | **pass** | 15 h 40 m before purge → "0m in the last 15 weeks", all cells empty, no layout break |
| Tasks finished heatmap | **pass** | "7 in the last 15 weeks · **streak 1 days**" → **BUG-029** |
| Done-by-hour histogram | **pass** | "Most tasks are finished around 22:00"; green bar at 22; axis 0/6/12/18/23 |
| "When you work best" histogram | **pass** | Empty state degrades to **"Start a focus session to see this"** — good hint |
| Attendance heat/rates | **fail** | "Attendance by subject": 4 of 5 subject names truncated, all rates 100 % → **BUG-030**. "Attendance, last 4 weeks": **last column of every row clipped by the card edge** → **BUG-023** |
| Grade bars | **fail** | "Totals against goals": 3 of 3 labels truncated; only 3 of 6 courses shown → **BUG-030** |
| Mark history chart | **fail** | x-axis labels "Quiz / **Assig** / **Mid**" cut mid-word → **BUG-030**. (Also has no y-axis scale at all — not filed) |
| Charts animate once | untested | |
| Empty-state hint | **fail** | V13's hint never fires after the documented path → **BUG-024** |

## Screen: Focus
| Element | Status | Notes |
|---|---|---|
| Knurled dial drag (5-min steps) | untested | V10a, highest risk. Not opened by AGENT 2 |
| Dial limits 5 / 240 bump | untested | |
| Presets 25/45/50/90 | untested | |
| Flow toggle | untested | |
| Start / Pause / Resume | untested | |
| Round-done stamp | untested | |
| Break sticker (tap to end) | untested | |
| Swap task | untested | |
| End session | untested | |
| Back → Today | untested | Also blocked by BUG-021 — the nav will not follow the back |

## Sheet: Add (8 tiles)
| Element | Status | Notes |
|---|---|---|
| Assignment / Exam / Reading / Project | **pass** | All 4 present, icon + label, no clipping. `testID`s `add-assignment` … `add-project` |
| Class / Mark / Note / Subject | **pass** | All 4 present. `add-class` … `add-subject` |
| 8-tile layout reachable by thumb | **pass** | Sheet sits at the bottom, all tiles and the focus button inside the thumb arc |
| "Start a focus session" button | untested | Rendered |
| Drag down to dismiss | untested | |
| Back to dismiss | untested | Dismissed via the ✕ instead |

## Sheet: Task (create/edit)
| Element | Status | Notes |
|---|---|---|
| Title field | **fail** | Renders with placeholder "e.g. Problem set 6"; tap-to-focus **pass**, but the typed value could not be verified — the device locked on the next frame → see iteration log |
| Subject optional ("No subject") | **pass** | Defaults to "No subject" selected; chip row 3rd chip clipped → **BUG-026** |
| Due → WhenPicker | untested | **Open** — "No due date" button rendered, not opened |
| Reminder chips | **pass** | None / In 1 h / In 3 h / When I get home + a 5th chip clipped at the screen edge; correctly disabled with the hint **"Set a due date to choose reminders."** → **BUG-026** |
| Effort Stepper (min) | **pass** | Renders "− unknown +" with no due date. Limits untested |
| Tight/Comfortable + latest start | untested | Needs a due date + effort → **Open** |
| Priority chips | untested | None/Low/Medium/High rendered |
| Subtasks add + tick | untested | "Add a step" rendered |
| Save | untested | **Never pressed — this is where the run stopped** |
| Kind chips row | **fail** | 4th chip cut to "P…" → **BUG-026** |
| Empty / whitespace / long / emoji / RTL input | untested | **device locked** |
| Negative effort via stepper | untested | **device locked** |
| Double-submit guard | untested | **device locked** |
| Back out with unsaved input | untested | **device locked** |

## Sheet: WhenPicker / Status / Slip / Course / Meeting / Mark / Notice
| Element | Status | Notes |
|---|---|---|
| WhenPicker options + custom time | untested | |
| Status sheet (class) | untested | |
| Status sheet (day, incl. Lock) | **pass** | Reached from Today "Mark day". Here / Absent / Sick / Cancelled + "Reason (optional)" with placeholder "e.g. bus broke down". Title correctly read the *selected* day — which is what exposed **BUG-022**. **Not** applied |
| Slip sheet | untested | |
| Course create/edit/delete + Undo | untested | |
| Meeting create/edit/delete + Undo | untested | |
| Mark create/edit/delete + Undo | untested | |
| Notice create/edit/delete + Undo | untested | |

## Sheet: Settings (nested, live preview)
| Element | Status | Notes |
|---|---|---|
| Open / drag-down / back close | **pass** | Opens from any page's gear; dismissed via ✕. Drag-down and hardware back untested |
| Root list + summary sub-lines | **pass** | 8 rows, each with a correct live summary (theme/palette/clock face, reminder lead time + quiet hours, sound+haptics, semester + lock, break length × per round, export formats, crash count, reset) |
| Look & feel → Theme & palette | untested | |
| → Paper & texture | untested | |
| → Clock face (5) | untested | |
| → Progress bar | untested | |
| → Accent pen | untested | |
| Reminders → Classes | untested | |
| → Tasks & exams | untested | |
| → Hours & quiet time | untested | |
| → Per-subject lead time | untested | |
| → Delivery status | untested | |
| Sound & haptics | untested | |
| Attendance & semester | **pass** | "Lock attendance grid" toggle + explanatory copy; "Semester starts" month/day steppers (**Sep / 7** = 7 Sep, matching "Semester from 2026-09-07" — *not* a truncated year); "+ Add class" / "+ Add subject". Day stepper capped at 28 (Polish, not filed) |
| Focus & breaks | untested | |
| Data & export (XLSX/CSV/JSON, folder/share) | **pass** | All 3 formats × "Save to folder…" + "Share…" rendered with correct labels. Export not executed |
| **Clear demo history** | **fail** | Executed. Done 7 → 1, focus 20 → 0, **everything else untouched**; no screen reaches a true empty state → **BUG-025** |
| Diagnostics (crash log, test crash) | untested | Root row shows **"12 crashes recorded"** — not attributed. Open question |
| Reset (double-tap) | untested | "Reset to demo set" + its irreversibility warning rendered. Not triggered |
| Sub-page back = up one level | **pass** | Back from Attendance & semester → root; back from Data & export → root |
| Hardware back at Settings root | untested | |

## Cross-cutting
| Concern | Status | Notes |
|---|---|---|
| Cold boot → Today, no red screen | **pass** | V1 pass 2026-10-04; re-confirmed by AGENT 2 cold boots |
| Initial route is `Today` (`store.ts:32`) | pass | code + boot dump; my Expo Go "Continue" tap hit the To-do tab |
| Page transition drop/tilt/settle | untested | V3 |
| Back order sheet → sub-page → Focus → Today → exit | **fail** | sheet → sub-page → root all correct; **route → Today works but the nav highlight does not follow, and one tab dies** → **BUG-021**. Focus and exit untested |
| Edge-to-edge status bar legibility | untested | V19 — **out of scope in Expo Go per the brief** |
| Dark mode | **pass** | Every AGENT 2 screenshot is dark theme; no colour or contrast defect observed on the pages I walked |
| Light mode | untested | |
| Font scale 1.3 | untested | |
| 360dp width | untested | |
| 430dp width | untested | |
| Landscape / rotation | untested | portrait-locked |
| Persistence across force-stop | untested | **device locked before the first record was created** |
| TalkBack labels + focus trap | untested | a11y tree inspected incidentally: every button, chip and cell I touched carries an `accessibilityLabel` and the `testID`s from BUG-006 resolve as `resource-id` |
| Offline (no network in app) | n/a | app is fully local SQLite |
| Notification delivery timing | untested | **release build only** |
| Custom notification sound | untested | **release build only** |
| Haptics quality | untested | **release build only** |
| Performance / jank numbers | untested | **release build only** |

### Cross-cutting — AGENT 2 device-harness findings (read before the next device agent)

1. **Use `SWIPE_MS=900` for every swipe.** At 300–400 ms RN's `ScrollView` ignores `adb input swipe`
   outright. I filed a false "the To-do list does not scroll" from a 400 ms swipe before catching it.
2. **`adb.sh dump` / `texts` / `tap` can silently print a stale screen.** `uiautomator dump` fails with
   `ERROR: could not get idle state` (the live clock repaints every second) but **exits 0 without
   writing the file**, so `adb.sh` re-reads the *previous* dump. I was handed a complete Expo Go
   home-screen element list while the app was in the foreground. Check the file mtime, and treat any
   dump that looks like a different screen as stale rather than as a navigation result.
3. **`mobile-mcp_mobile_list_elements_on_screen` is the better reader** while it lasts — it resolves
   `testID`s as `id=` and gives exact bounds. It died mid-run with
   `UiAutomationService ... already registered!`, a leaked test-automation registration in
   system_server that no `adb input` action clears. Fallback that worked: `adb exec-out screencap -p`
   plus a coordinate grid drawn over the PNG.
4. **Never send `input keyevent 26` (POWER) as a "wake" probe.** It toggles, and on this device it
   put the phone to sleep and then behind a secure keyguard that no `adb` input could dismiss —
   which is what ended the run. Use `keyevent 224` (WAKEUP) if you need a wake that cannot sleep.
5. **`purgeDemo` is not a database reset** — see BUG-025 and the baseline table in `DATA_LEDGER.md`.

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
Screens: 6 routes + 12 sheet types. Element rows in the tables above: **137**.
**Pass 33 · Fail 16 · Untested 87 · n/a 1.**
(Static gates are tracked separately above and are not counted in these rows.)

**AGENT 2 accounting.** The 33 pass / 16 fail come from one device session (SM-A516N, dark theme,
Expo Go). The 16 failures map to BUG-021…BUG-030 — 2 Major (nav desync after hardware Back; Today
showing three different days) and 8 Minor, several of which own many rows each (BUG-026 alone accounts
for six truncation rows, BUG-030 for four).
**The 87 untested are not evenly spread, and that is the important caveat:** they are concentrated
exactly where the run was cut off — the entire task-domain lifecycle (Parts 2, 3 and 4 of the AGENT 2
brief). Everything downstream of "press Save in the Task sheet" is untested, because the phone's
secure keyguard engaged at that moment and no `adb` input could dismiss it. Read the iteration log at
the foot of `qa/BUGS.md` and the harness notes above before planning the next agent — and note that
`qa/DATA_LEDGER.md` therefore contains **zero** `QA_` records and needs no cleanup.