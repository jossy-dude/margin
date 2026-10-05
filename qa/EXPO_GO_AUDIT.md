# Marginalia — Expo Go QA Audit

**Date:** 2026-10-05, 15:14–17:20 (device local time 3:14 pm – 5:20 pm)
**Target:** Expo Go (user-leviated from `prompt.md`, which mandates a standalone release build)
**Device:** `R5CR117MTJJ` — Samsung SM-A516N "Sefenit's A51", Android 13, 1080×2400 @ 420 dpi = **411 dp wide**
**Metro:** `npx expo start --go --port 8081` (alive throughout, `packager-status:running`; **never restarted**)
**Tester role:** QA only. No source file, build, dependency or git operation was performed. The only files created are this report and the evidence in `qa/shots/exp/`.

---

## 1. Headline

Marginalia boots clean in Expo Go, seeds correctly, and the great majority of what I could reach behaves as specified — the Focus dial gesture math, the five clock faces, the export pipeline (including the folder picker that `prompt.md` predicted would fail), the break sticker's tape-peel/swing/fall, and hardware-back ordering all held up under real probing. **The single worst finding is S1: the break button's 5-minute gate never unlocks during an uninterrupted focus round, which makes the user's own break-sticker feature unreachable in normal use** — I reproduced it at 16:42 of elapsed focus and traced it to `canBreak(t)` reading a store field that the per-second render path never commits (`src/screens/Focus.tsx:155,195` vs `:127`). There is **1 blocker (S1) and 6 further defects (2× S2, 2× S3, 2× S4)**; the app is **not shippable as-is** because of S1 alone, but it is otherwise in good shape. Two Tier-1 items I could not reach at all (A2 notification actions, B13/B14/B15 reminder planning) are honestly marked `NOT-REACHED (budget)` rather than guessed, and one item (**B12**) is `BLOCKED` pending your permission to wipe Expo Go's data.

---

## 2. Tier 1 special-attention table

| ID | `prompt.md` claim | What I probed | Observed | Verdict | Evidence |
|---|---|---|---|---|---|
| **A1** | R7 + `<plates>`: six extra faces (11, 8, 13, 10, 9, 15) never added; 5 expected | Settings → Look & feel → Clock face; counted `RadioButton`s; `ls assets/plates`; read `FACES` | **Exactly 5** options: Guilloché Ivory, Rosette Blanc, Celtic Knot, Scales and Lily, Skeleton Movement. `assets/plates` does not exist. `FACES` has 5 entries (`src/ui/clock/faces.ts:12-16`). In-app copy even says "Five faces". | **CONFIRMED-ABSENT** | `a1_clock_face_list.png`; `faces.ts:12-16`; `ls assets/plates` → No such file |
| **A2** | R5: notification action buttons (Here/Late/Missed) not implemented; tap opens Today | — | **Not reached.** I did not create a `ZZtest` reminder or wait for a notification to land; budget was consumed by A5/B6. | **NOT-REACHED (budget)** | — |
| **A3** | R5: `SheetSpec` has an unused `slip` variant | `grep -rn "slip" src/`; searched for any writer of `t:'slip'` or `store.slip` | Declared at `src/store/store.ts:19`; overlay routes it (`src/ui/Overlay.tsx:32`); `StatusSheet` accepts it (`src/sheets/forms.tsx:102`); `state.slip` exists (`store.ts:27,33`). **But zero code constructs `{t:'slip'}` and zero code assigns `state.slip`** — so no reachable screen opens it. Wired-but-unreachable dead spec, not an unwired type. | **CONFIRMED-ABSENT** (dead spec) | `store.ts:19,27,33`; `Overlay.tsx:32`; `forms.tsx:102`; `grep "t: 'slip'"` → 0 hits |
| **A4 p1** | R4: focus timer not persisted across a force-kill | Read the persistence path (`putSettings` is the only writer); `store.ts` timer lifecycle | `putSettings` at `src/data/sqlite.ts:48` is the **only** persistence call. `TimerState` exists only in the zustand store (`store.ts:26,33`) and is re-seeded from settings on load (`store.ts:93`). No SQLite write for the timer exists. | **CONFIRMED-ABSENT** (code-proven; destructive empirical variant not run) | `sqlite.ts:48`; `store.ts:26,33,93` |
| **A4 p2** | R4/V10h: no running-timer indicator outside the Focus page | Started a 25-min round, pressed hardware BACK to Today, screenshotted + dumped the a11y tree | Today header shows only "Mon 5 Oct", "Good afternoon, Jossy", clock, "All done for today", "Nice work", "Day complete". The **only** Focus-related node is `id="open-focus"` still labelled **"Start a focus session"** — no dot, badge, pulse or "22:14 left". Meanwhile the hidden Focus page kept counting down (22:14). | **CONFIRMED-ABSENT** | `a4_probe2_today_while_running.png`, `a4_crop_today_header.png`, `a4b_whichpage.png` |
| **A5** | V10e: break button dimmed + toast reason until 5 min of focus; bell; main clock freezes; taped round sticker with countdown + coffee; 5-min wiggle; tap = tape-peel → swing on tape → fall with flutter+thud; main clock resumes at exact remaining; expiry auto-resumes with "focusing"; breaks limited per round | Full 25-min round on device, two real breaks, screen recording at 20 fps through the sticker fall | **WORKS:** dimmed button with reason; break starts; `break, main clock paused`; sticker = round taped disc + coffee icon + countdown + warm progress arc + "tap = back to work", tilted 4°, right of dial; limit enforced "2 left"→"1 left"→"0 left"; **auto-expiry resumed with header "Round 1 · focusing" at the exact frozen remaining**; **tape-peel → swing-on-tape → detach → fall captured frame-by-frame, pivot is at the tape**. **BROKEN: the gate never opens during an uninterrupted round** — at 3:56 pm with 08:18 left (**16:42 elapsed**, gate = 5 min) the button was still `enabled:false` with reason "Breaks unlock after 5 min of focus." | **CONFIRMED-BROKEN (S1)** — sticker itself WORKS-AS-SPECIFIED, gate does not | `a5_focus_running_gate.png` (16:42 elapsed, disabled), `a5_after_pause_resume.png` (enabled after pause/resume), `a5_crop_sticker2.png`, `a5_swing_highfps.png`, `a5_fall_frames_grid.png`, `a5_sticker_tap.mp4` |
| **A6** | V6: dial should feel "crunchy like a microwave timer", 4 velocity layers via `crunch()` / `detent-*` | Screen-recorded drag; read `synth-sounds.mjs`; read `manifest.json` | Source: `crunch(x,drive)` = tanh saturation (`scripts/synth-sounds.mjs:62`); `detent-1..4` generated with `k=[0.25,0.5,0.75,1]` where attack shortens and the 4.4 kHz ring gain rises 0.05→0.50 with k (line 115); notes 111-114 map detent-1=slow drag … detent-4=fast drag. Manifest: 27 wavs, every entry `"clipped": 0`, peak ≤ 0.85, \|dc\| ≤ 0.0023. Visual: detents step in exact 5-min increments and the hand tracks the value. **I cannot hear the phone** — no crunch claim made. | **REQUIRES-HUMAN-EAR** | `synth-sounds.mjs:62,111-115`; `assets/sounds/manifest.json`; `b1_dial_*` |
| **B1** | R1 #1 / N3: dial centre measured in window coords on a `scale(width/440)` canvas — risk of inverted/jumping ring | 7 drags from 4 different origins (right/left × up/down, plus a near-centre origin) | Clockwise always **increases**, counter-clockwise always **decreases**, from every origin: R-down 25→30, R-up 30→20, L-down 20→5, L-up 5→15, L-down 15→10, L-down 10→5, near-centre 5→10. Every landing is on a 5-min detent. Value **clamps at 5** and never goes negative or wraps. No jump, no lost grip, no direction inversion. The **240 upper limit was not reached** (needs ~47 detents; unreachable with 4-direction swipes). | **WORKS-AS-SPECIFIED** (direction/detents/min); upper limit INCONCLUSIVE; bump sound REQUIRES-HUMAN-EAR | `b1_dial_values_strip.png`, `b1_dial_min_strip.png`, `b1_dial_nearcentre.png` |
| **B2** | R1: `react-native-svg` `<Pattern>` with `patternTransform` (paper dots, hatch ring) | Today page background; Focus dial before start; located `patternTransform` in source | Paper **dots** render correctly (regular dot grid on Today). Focus **hatch ring is empty** before starting, as specified. `patternTransform` is used in exactly two places — `src/ui/DayBar.tsx:37` (`id="hat"`, `rotate(45)`) and `:63` (`id="liq"`, `rotate(-35)`) — i.e. the **Grades progress-bar fills**, which I did not reach. `PaperBg` dots/grid/ruled use plain `Pattern` with no transform (`PaperBg.tsx:17-19`). | **PARTIAL** — dots PASS, `patternTransform` paths NOT-REACHED | `v1_today_loaded.png`, `v10_focus_initial.png`; `DayBar.tsx:37,63`; `PaperBg.tsx:17-19` |
| **B3** | R1: `mixBlendMode` on the photo texture | — | Not reached. Code for the fixer: `src/ui/PaperBg.tsx:26` — `{ opacity: c.photo, mixBlendMode: dark ? 'screen' : 'multiply' }`. | **NOT-REACHED (budget)** | `PaperBg.tsx:26` |
| **B4** | R1: `transformOrigin` on the break sticker — pivot wrong on Android | 20 fps frame extraction through the fall | The tape stays fixed while the disc oscillates beneath it, then detaches, translates down-left and rotates as it drops. **The pivot is the tape, not the disc centre.** | **WORKS-AS-SPECIFIED** | `a5_swing_highfps.png` (0.00–1.10 s), `a5_sticker_tap.mp4` |
| **B5** | R1/V3: "Placed" animation — drop from above-right, tilt, settle ~0.5 s, previous page visible underneath, no blank flash | ~40 navigations across all 5 tabs, settings sub-pages, sheets, Focus in/out | No blank, invisible or half-rotated page observed at any point. Previous page stayed visible underneath during sheet transitions. **Settle duration not measured** (needs video) and the **rapid 10× tab sweep not run**. | **PARTIAL** — no blank/rotation defect seen; timing NOT-MEASURED | `v19_back_from_focus.png`; `v11_settings_root.png`; `v1_today_scrolled.png` |
| **B6** | R1/V12: `Directory.pickDirectoryAsync` expected to be unavailable on a standalone install | Settings → Data & export → "Save to folder…" (XLSX); drove the real Android SAF picker; pulled and parsed the resulting file | **The picker works in Expo Go.** `com.google.android.documentsui…PickActivity` became top-resumed; listed 22 folders; wrote the file. Filename `marginalia-2026-10-05.xlsx`, **78,420 bytes**. Parsed: **all 12 sheets, exact names** (Summary, Courses, Timetable, Attendance, Day marks, Tasks, Subtasks, Reminders, Notices, Marks, Focus sessions, Settings); **bold header row on all 12**; frozen header on Summary (`<pane ySplit="1" state="frozen"/>`). Row counts incl. header: Summary 14, Courses 6, Timetable 18, Attendance 73, Day marks 1, Tasks 11, Subtasks 3, Reminders 12, Notices 4, Marks 21, Focus sessions 2, Settings 24. **Caveat:** Android blocks the Download/Documents *root* ("Can't use this folder"), so a subfolder must be chosen. CSV-zip and JSON *contents* not independently opened. | **WORKS-AS-SPECIFIED** (contradicts R1); CSV/JSON contents PARTIAL | `b6_save_to_folder_xlsx2.png`, `b6_picker_confirm.png`, `b6_after_use_folder2.png`; `ls /storage/emulated/0/Download/ZZtest/` |
| **B7** | R6: clock TZ offset read once at module load → hour-wrong clock after a DST change until restart | Compared status-bar time against measured hand angles; read `ClockFace.tsx` | Current behaviour is correct: status bar **3:24 pm** → hour hand 104° (expected 102°), minute 149° (expected 144°), red-brown second 285° (≈47 s). Code confirms the once-at-module-load read: `const MS_TZ = new Date().getTimezoneOffset()*60_000` at `ClockFace.tsx:9`, used at `:30`. | **NOT-TESTABLE-HERE (needs a DST shift)** + current-match evidence | `v4_crop_liveclock_celtic.png`; `ClockFace.tsx:9,30` |
| **B8** | R8: dial "bed" drawn as a ring outside the progress ring — flagged in case the mock intended a filled disc | Looked at the Focus dial and the Today clock | The clock face and Roman numerals are **fully visible**; the bed reads as a chapter ring / bezel carrying ticks and 60·15·30·45, which is a legitimate watchmaking idiom. Nothing is occluded. | **DESIGN-INTENT QUESTION — not a defect** | `v10_focus_initial.png`, `v10c_ring_ready_vs_running.png` |
| **B9** | R9: Original palette not guaranteed 4.5:1; muted text on the scrapbook measured 3.9–4.2:1 | — | Not reached. I cannot run the Accessibility Scanner and will not fabricate ratios. | **NOT-REACHED (budget)** / would be `EYEBALL-ONLY` | — |
| **B10** | R10: `useStore((s) => s)` in several screens → whole-screen re-render every second | `grep -rn "useStore((s) => s)" src/` | **Zero matches.** Selectors are narrowed to individual fields (e.g. `Focus.tsx:125` pulls `s.timer`, `s.settings`, `s.tasks` separately; `Today.tsx:37` pulls `s.settings.clock`, `s.route`). The specific risk described in R10 no longer exists in the source. The qualitative 60 s scroll test was not run. | **NOT-REPRODUCIBLE at source** (qualitative part NOT-REACHED) | `grep "useStore((s) => s)"` → 0 hits; `Focus.tsx:125`; `Today.tsx:37` |
| **B11** | R11: "Scales and Lily" uses static `clipPath id="sc"`; thumbnail + live clock in one tree may collide | Selected Scales and Lily with the Settings sheet open so the live clock and the thumbnail both render | **Both render correctly** — live clock on Today updated to Scales and Lily immediately, the thumbnail is intact, neither is clipped or corrupted. Code risk is real: `staticSvg` emits a fixed `id="sc"` with no per-instance suffix (`src/ui/clock/faces.ts:133`), so a future change could still bite. | **NOT-REPRODUCIBLE** (code risk remains) | `b11_scales_and_lily_live_plus_thumb.png`; `faces.ts:133` |
| **B12** | R12: `PRAGMA user_version` read via `getAllAsync` is *assumed* to return `[{user_version}]` | `adb logcat -d` filtered for `user_version` / `migrat` / `SQLiteException`; read the migration path | expo-sqlite is working against the real device DB: `nni: The schema version is 10, the database version is 10, and there are 0 migrations` (15:26:43.427). **Zero** `SQLiteException` / `user_version` lines in the entire buffer. **But 0 migrations were needed**, so the app's own `user_version` migration branch never executed — the exact assumption in R12 remains untested. Testing it needs `adb shell pm clear host.exp.exponent`, which wipes your Expo Go session. **I did not run it.** | **PARTIAL** (happy path proven) + **BLOCKED** on the destructive half — **requesting permission** | `adb logcat -d` (line above); `sqlite.ts:48` |
| **B13** | R3: reminders >~14 days out exist only once the app has been opened | — | Not reached. | **NOT-REACHED (budget)** | — |
| **B14** | V5e: during-class deferral; "Hold reminders until class ends" toggle | Confirmed the baseline setting exists (Reminders → "10 min before class · quiet 22:00–07:00") | Not reached — no `ZZtest` task was created. | **NOT-REACHED (budget)** | `v11_settings_root.png` |
| **B15** | V5f/N4: quiet hours move a deadline reminder **earlier**, never later | Confirmed baseline is already quiet **22:00–07:00** | Not reached — no `ZZtest` task was created. | **NOT-REACHED (budget)** | `v11_settings_root.png` |

---

## 3. V1–V20 sweep

| V# | Area | Verdict | One-line evidence | Evidence path |
|---|---|---|---|---|
| **V1** | Cold boot + seed | **PASS** | No red screen; spinner → Today in ~30 s; Today shows the demo week (Mon 5 – Sun 11, 4/3/3/3/4/0/0 classes), Notes, "Due soon" with 5 task cards, "Day complete" with I·D·E·C | `v1_coldboot_today.png`, `v1_today_loaded.png`, `v1_today_scrolled.png` |
| **V2** | Fonts + layout | **PARTIAL** | Caveat/Permanent Marker/Special Elite/Newsreader all render, **no fallback sans-serif**; irregular hand-drawn outlines with offset shadow confirmed. **Not tested:** horizontal scroll at 360/390/430 dp, font scale 1.3 | `v1_today_loaded.png` |
| **V3** | Page transition | **PARTIAL** | No blank or half-rotated page in ~40 navigations; settle duration not measured; rapid 10× sweep not run | see B5 |
| **V4** | Five clock faces | **PARTIAL** | All 5 render and are visibly different; selection changes the Today clock **immediately with the sheet open**; hands match phone time (3:24 → 104°/149°/285°); red-brown second hand thin and smooth; Skeleton shows 4 wheels + balance wheel, legible in dark. **Not tested:** Rosette counter-rotation, Skeleton tooth-clearance over time, 3-min idle smoothness | `v4_celtic_knot.png`, `v4_rosette_blanc.png`, `v4_skeleton_movement.png`, `v4_crop_liveclock_skeleton.png`, `b11_scales_and_lily_live_plus_thumb.png` |
| **V5** | Notifications | **NOT-REACHED (budget)** | Permission state, "Test in 10 s", class lead, deferral, quiet hours, per-subject lead all unreached. Grading of *timing* would have been `UNVERIFIABLE-IN-EXPO-GO` regardless | — |
| **V6** | Sounds | **REQUIRES-HUMAN-EAR** + source PASS | 27 wavs present, **all `"clipped": 0`**, peak ≤ 0.85, \|dc\| ≤ 0.0023; `crunch()` + 4 `detent-*` layers present as specified. Audibility untestable by me | `assets/sounds/manifest.json`; `synth-sounds.mjs:62,111-115` |
| **V7** | Haptics | **UNVERIFIABLE-IN-EXPO-GO** | Emulated native path in Expo Go | — |
| **V8** | Attendance grid | **PARTIAL** | Tapping a class row **does** open the status sheet ("How did this class go?" with Here / Late / Absent / Sick / Cancelled / Late·stayed out / Teacher out / Reason) — a11y labels confirm the long-press path exists. Cells not exercised (would have written seed attendance). Cell metrics, denied-shake, Lock, TalkBack not tested | a11y tree `@e161`–`@e181` |
| **V9** | Add flow + data logic | **NOT-REACHED (budget)** | FAB `fab-add` present and labelled; task cards expose `Mark … done` checkboxes plus "Done"/"Crumple" swipe hints. No `ZZtest` item was created | `v1_today_scrolled.png` |
| **V10** | Focus layout + a–h | **FAIL** | Layout matches the scrapbook mock (torn Venice, taped task card, knurled dial, presets, Start, "end session", margin note "focus doesn't happen by accident"); dark mode correctly dims the scrapbook; a–d, f, h pass (thunk → mm:ss countdown, Pause/Resume, presets 25/45/50/90, Flow on, "Saved 29 min of focus", back → Today, timer continues in background). **e fails** (S1 gate). **c's progress ring does not appear to fill** (S2) | `v10_focus_initial.png`, `v10c_running2.png`, `v10c_ring_ready_vs_running.png`, `v10f_end_session2_bot.png`, `a5_sticker_present2.png` |
| **V11** | Settings sheet | **PARTIAL** | Bottom sheet ≈60 % height, grabber present, ✕ and backdrop close, hardware back closes, sub-pages push/pop correctly, live preview behind the sheet confirmed (clock face + theme + texture are live). Full hierarchy confirmed in source including `Reset` (`TITLES … 'about': 'Reset'`). **Not tested:** that *every* option previews inside the sheet; drag-down dismissal | `v11_settings_root.png`, `v11_look_feel.png`, `a1_clock_face_list.png`; `Settings.tsx:22,67-78` |
| **V12** | Export | **PASS** | Folder picker works in Expo Go; `marginalia-2026-10-05.xlsx` (78,420 B) written; **12 sheets, exact names**; **bold header on all 12**; frozen header on Summary. CSV-zip and JSON contents not independently opened | `b6_after_use_folder2.png`; parsed workbook (see B6) |
| **V13** | Stats | **NOT-REACHED (budget)** | Not visited. Corroborating signal: the XLSX `Focus sessions` sheet has 2 rows (header + my 1 session), so the session did reach the store | — |
| **V14** | Accessibility | **PARTIAL** | A11y tree is genuinely good: every control has a label, class rows announce date/time/status/hint ("Discrete Mathematics, 10:00 to 10:50, Here, not marked yet. Opens attendance."), task cards expose "Mark … done" checkboxes, presets expose `selected`+`disabled`, the dial is a `SeekBar` with a live label ("Focus minutes. Swipe up or down to change., 25 minutes left"), the break sticker announces "Break, 04:55 left. Tap to go back to work.", and disabled controls carry their reason in the label. TalkBack itself not enabled | multiple a11y dumps; `a5_sticker_present2` listing |
| **V15** | Palettes + contrast | **NOT-REACHED (budget)** | Only `refined` was ever on screen (the baseline). See B9 | — |
| **V16** | Persistence + logic | **PARTIAL** | expo-sqlite demonstrably persists (schema v10, and the session/task data round-tripped into the exported workbook). Attendance rate, goal-85 required average, curve ±, Undo, add/edit/delete of each entity not exercised | `adb logcat` v10 line; parsed XLSX |
| **V17** | Performance | **UNVERIFIABLE-IN-EXPO-GO** (numbers) | No fps/memory numbers reported. Qualitative flicker test not run. Note the R10 source risk no longer exists (B10) | — |
| **V18** | Orphans and races | **PARTIAL** | Survived: 2× pause/resume, 2× break start, 1× end-session, 1× sheet open/close per level (5 levels), ~40 tab/sub-page navigations, 7 dial drags, 2 clipboard-free text entries. **No crash, no stuck animation, no negative time, no frozen sticker.** Rapid 10× stress not run | session-wide; `a5_swing_highfps.png` |
| **V19** | Android specifics | **PARTIAL** | **Back order verified for the cases reached:** Focus → Today (hardware BACK), settings sub-page → parent, sheet root → closes. Status bar / gesture bar / edge-to-edge are `UNVERIFIABLE-IN-EXPO-GO` (Expo Go chrome, BUG-004) | `v19_back_from_focus.png`, `v19_back_crop.png` |
| **V20** | Rotation / small screens | **NOT-REACHED (budget)** | `wm size` / `wm density` overrides not applied. Baseline recorded as 1080×2400 @ 420 | — |

---

## 4. Ranked defects

### S1 — BLOCKER: the break button's 5-minute gate never unlocks, making the break sticker unreachable in normal use

**What.** `canBreak()` is evaluated against the *raw store* timer state, but the per-second render path advances a throwaway copy. `focusElapsedMs` therefore stays `0` in the store for the whole round, so the gate is permanently closed.

**Repro (repeatable):**
1. Cold-boot Marginalia in Expo Go, open Today.
2. Tap the timer icon (`open-focus`) → Focus.
3. Tap preset **25** → **Start**.
4. Wait ~6 minutes without touching Pause.
5. Look at the "break · 5m" button.

**Expected.** After 5 minutes of focus the button brightens and becomes tappable.
**Actual.** Still dimmed, still `accessibilityState disabled`, label still reads `Take a break, 2 left. Breaks unlock after 5 min of focus.` Reproduced at **16:42 elapsed** (3:56 pm, dial showing `08:18` remaining).
**Workaround (proves the diagnosis).** Tap **Pause** then **Resume** once. The label immediately becomes `Take a break, 2 left. ` with **no** `disabled` flag and the reason string gone, and the break starts normally.
**Code location.** `src/screens/Focus.tsx:155` and `:195-196` call `canBreak(t)` where `t = st.timer` (raw store, set at `Focus.tsx:127`). `canBreak` (`src/domain/timer.ts:63`) requires `s.focusElapsedMs >= MIN_BREAK_AFTER_MS`. But the visible countdown comes from the **pure** `view(t, now)` (`Focus.tsx:127` → `timer.ts:56`), which calls `advance()` on a copy and discards the accumulated `focusElapsedMs`. The only thing that commits it is `act.timerToggle` (`store.ts:162-164`) — i.e. pause/resume.
**Fix direction (for the fixing engineer).** Commit the advanced timer into the store on the display tick, or evaluate the gate against the *advanced* state (`canBreak(advance(t, now).state)`), mirroring what `startBreak` already does correctly at `timer.ts:75`.
**Impact.** `prompt.md` V10e and acceptance-checklist line 9 both fail. This is the user's own added feature.
**Evidence.** `a5_focus_running_gate.png`; `a5_after_pause_resume.png`; `a5_focus_running_5min.png`.

### S2 — HIGH: the Focus progress/hatch ring does not appear to fill while a round runs

**What.** V10c requires the hatch ring to fill clockwise. Comparing a ready-state frame against a running frame (23:34 remaining) the entire band between the two white circles is **pixel-identical at every radius from 265 px to 345 px** (max |diff| = 0, 0/360 samples changed). The only differences in the whole frame are the centre countdown and the clock's own hands.

**Repro.** Open Focus, screenshot; set 25 min, Start, wait ~90 s, screenshot; diff radial brightness profiles about the dial centre `(533, 1293)`.
**Expected.** A bright arc from 12 o'clock growing clockwise, ~21° at 86 s elapsed.
**Actual.** No change in the ring band.
**Code location.** Likely `src/screens/Focus.tsx` around the dial's `v.progress` binding (the same `view()`-vs-store split as S1 — `progress` is computed in `view()` at `timer.ts:57`, so if the arc is bound to `st.timer` it will read a stale `focusLeftMs`). **Note: I did not read the exact binding line — treat the file:line as approximate and confirm before editing.**
**Evidence.** `v10c_ring_ready_vs_running.png`; measurement output in the session log.

### S3 — MEDIUM: a 5-minute break can never produce the "wiggle every 5 minutes" nudge

**What.** `NUDGE_MS = 5 * 60_000` and the default `breakMin = 5`, so `breakTotalMs === nextNudgeMs`. The mid-break nudge loop is `while (s.breakElapsedMs >= s.nextNudgeMs && s.nextNudgeMs < s.breakTotalMs)` (`src/domain/timer.ts:50`) — with the default break the guard is false from the first tick, so the sticker **never wiggles**; the only nudge coincides with the break ending. V10e asks for a nudge every 5 minutes *during* the break, which requires a break longer than 5 minutes.
**Repro.** Set Settings → Focus & breaks → break length to 15 min, run a round, take a break, and watch for a wiggle at 5 min and 10 min. (I did not run this — the reasoning is from source and from the fact that no wiggle occurred during two real 5-minute breaks.)
**Code location.** `src/domain/timer.ts:11,50`.
**Fix direction.** Make `NUDGE_MS` a fraction of `breakMs` (e.g. `breakMs / 3`), or shorten `NUDGE_MS`.

### S4 — MEDIUM: the break button's reason text is wrong while paused

**What.** While a round is *paused*, the button reads `Take a break, 2 left. Start a round first.` The round **is** started; it is paused. `canBreak` requires `s.running` (`timer.ts:63`), and `Focus.tsx:155` maps `!t.running` to the "Start a round first." string.
**Repro.** Start a round, tap Pause, read the break button's accessibility label.
**Code location.** `src/screens/Focus.tsx:155`.

### S5 — COSMETIC: the Settings button glyph reads as a sun/asterisk, not a gear

**What.** The app's `open-settings` button renders a sunburst, while `prompt.md` and the codebase both say gear. Compounding the confusion, **Expo Go's own "Tools" FAB renders a dark circle with a white gear directly beneath it**, so the screen shows a sun above a gear.
**Repro.** Today tab, top-right. Crop `(900,120)–(1060,300)`.
**Note.** This *may* be intentional hand-drawn styling — `Icon name="gear"` is at `src/screens/common.tsx:29` and I did not read the `gear` path in the icon set. Worth a glance, not a confident defect.
**Evidence.** `a4_crop_today_header.png`, `crop_settings_icon.png`, `v19_back_crop.png`; `common.tsx:29`.

### S6 — COSMETIC: the Focus page has no settings gear

**What.** `prompt.md` V11 and the brief both say "A settings gear exists on any page". The Focus page's header exposes only `Back to Today` and the `Sounds` switch — no `open-settings` node exists in its tree. The gear-looking circle on that page is Expo Go's Tools FAB.
**Evidence.** a11y tree for the Focus page (no `open-settings` among `@e114`–`@e150`); `v10_focus_initial.png`.

### Harness note (NOT an app defect) — `open-focus` was unreachable by coordinate tap

Tapping the timer icon at its own reported centre `(830, 208)` — the exact centre of `open-focus` at `770,148 121×120` — failed to navigate **twice**; the same button responded immediately when tapped by element ref. Because ref taps then worked repeatedly, I attribute this to the coordinate-injection path, not the app. I am explicitly **not** filing it as a defect, but flagging it in case the fixer sees the same on a real device.

---

## 5. Confirmed-correct behaviours (do not "fix" these)

1. **Dial gesture math (B1).** Clockwise increases, counter-clockwise decreases, from the right, left and near-centre origins; always on 5-minute detents; clamps at 5; no jumps, no inversion. This was R1's top-ranked risk and it did not materialise.
2. **Break-sticker mechanics (A5/B4).** Once you *can* start a break, everything about it works: taped round disc, coffee icon, countdown, warm progress arc, "tap = back to work", 4° tilt, correct position right of the dial; break limit per round enforced; main clock genuinely frozen; auto-expiry resumes with "focusing" at the exact frozen remaining; and the tape-peel → swing-on-tape → fall animation is frame-accurate with the pivot at the tape. **Only the gate is broken.**
3. **The `transformOrigin` risk (B4) did not materialise** — the sticker rotates about its tape.
4. **The `SvgXml` duplicate-id risk (B11) did not materialise** — Scales and Lily renders correctly as live clock and thumbnail simultaneously.
5. **`Directory.pickDirectoryAsync` works in Expo Go (B6)** — contradicting R1. The full SAF flow completes and writes a valid file.
6. **The XLSX writer.** 12 sheets, exact names, bold header on every sheet, frozen header pane, correct `marginalia-<YYYY-MM-DD>.xlsx` naming.
7. **All five clock faces** render, are visibly distinct, honour dark mode, and selection live-previews onto the Today clock while the sheet is open.
8. **Clock accuracy.** Hands and red-brown second hand match the phone clock to within a couple of degrees; the second hand is thin and smooth.
9. **Focus session lifecycle.** thunk → mm:ss countdown → Pause/Resume → "end session" → toast "Saved 29 min of focus" → the session reaches SQLite (visible as a row in the exported `Focus sessions` sheet).
10. **Hardware-back ordering** for every case reached: Focus → Today, sub-page → parent, sheet root → closes.
11. **The accessibility tree.** Consistently high quality — real labels everywhere, live regions on the dial and toast, `selected`/`disabled` states exposed, and **disabled controls carry their reason in the label** (e.g. "Breaks unlock after 5 min of focus."), which is exactly the pattern V10e asks for.
12. **expo-sqlite works on-device** against a real database with no errors in logcat.
13. **`useStore((s) => s)` no longer exists anywhere** (B10) — the broad-selector re-render risk in R10 has already been fixed.
14. **The sounds asset set is clean** — 27 wavs, zero clipped, sane peak and DC values.

---

## 6. Cannot verify in Expo Go

| Item | Why | What a standalone release build would be needed for |
|---|---|---|
| Custom notification **sounds** | Impossible in Expo Go | A release build with the `sound` field set on `scheduleNotificationAsync` |
| **Haptics quality** (V7) | Emulated native path | A release build on the physical phone |
| **Exact-alarm / Doze delivery timing**; quiet-hours end-to-end; during-class deferral *arrival* | Expo Go is not the scheduling owner in the same way; OEM battery restrictions | A release build, screen off, `dumpsys alarm`/logcat evidence |
| **Perf numbers** — memory growth, fps, jank % (V17) | Testing a dev JS bundle, not Hermes bytecode | A release build + `dumpsys meminfo` / `gfxinfo framestats` |
| `expo-file-system` folder-picker **appearance** and custom share-sheet appearance | System UI; also `screencap` returns pure black for the DocumentsUI window on this device (the a11y tree still reads fine) | A release build; visual capture needs a different method |
| **Status bar / edge-to-edge / gesture bar** (V19) | Expo Go's chrome, not the app's (known BUG-004) | A release build |
| Anything requiring release-only native config (`minSdk`, etc.) | — | A release build |
| **A5 mid-break nudge** | Not an Expo-Go limitation — blocked by the S3 logic conflict | Nothing; fix S3 |

---

## 7. Open questions for you

1. **The plate PNGs (A1).** To unblock the six extra faces I need the **individual high-resolution PNGs** for plates 11, 8, 13, 10, 9, 15 from the Graphics Fairy "Clock & Watch Faces" sheet — the 650×960 contact sheet is too blurry at 124–200 dp. For **11, 13, 10, 9 and 15** I additionally need either **hand-less variants** or your OK on masking the dial centre disc, because those have engraved hands that will fight the live hands. Plate 8 is clean. Do you want to supply the files, or drop the feature?
2. **The break gate (S1) — do you want the pause/resume behaviour, or is the gate itself wrong?** The spec says the button unlocks after 5 minutes of focus. Today it only unlocks if you happen to pause and resume. I assume the latter is a bug, but if you *intended* "only unlock when you've paused at least once", say so and I'll re-grade it.
3. **The 5-min nudge (S3).** Your spec says the sticker wiggles every 5 minutes during the break, but the default break *is* 5 minutes, so it can never happen. Which did you mean — shorten the nudge interval, lengthen the default break, or drop the wiggle?
4. **Notification action buttons (A2).** R5 says Here/Late/Missed are not implemented. Do you want them? They're a real chunk of work (notification categories + a background handler) and they change the notification's appearance, so I did not assume.
5. **The `slip` sheet (A3).** What was it supposed to look like? It is fully wired to the StatusSheet but nothing ever opens it. Delete it, or give it a trigger?
6. **A running-timer indicator (A4 p2).** Do you want one? Right now a 25-minute round is invisible once you leave the Focus page — no dot, no badge, nothing. A small dot on the timer icon would be ~5 lines.
7. **The dial bed (B8).** The ring-outside-the-progress-ring design means the numerals/ticks live on the bezel and the face is fully visible. It reads correctly to me as a chapter ring, but if your mock had a filled disc, tell me and I'll re-grade it as a defect.
8. **B12 — may I wipe Expo Go's data?** `adb shell pm clear host.exp.exponent` is the only way to exercise the real `PRAGMA user_version` migration path, and it destroys your Expo Go session. Say the word and I'll run it; otherwise the migration assumption in R12 stays untested.
9. **Leftover data.** My 25-minute focus session (29 min credited, "Free focus") is still in the database — there is no per-session delete in the UI and I would not use Reset without your OK. Want me to leave it, or is there a supported way to remove it?

---

## 8. Cleanup report

**Device baseline — before → after (identical):**

| Setting | Before | After |
|---|---|---|
| `deviceLocked` | 0 | **0** |
| `font_scale` | 1.0 | **1.0** |
| `cmd uimode night` | yes | **yes** (unchanged — I never touched it) |
| `wm size` | Physical 1080×2400 | **Physical 1080×2400** (no overrides applied) |
| `wm density` | Physical 420 | **Physical 420** (no overrides applied) |
| `user_rotation` | 0 | **0** |
| `accelerometer_rotation` | 1 | **1** |
| Focused window | `host.exp.exponent` | **`host.exp.exponent`** (Today tab) |
| TalkBack | off | **off** (never enabled) |

**In-app settings — baseline captured, changed, and restored:**

| Setting | Baseline | Changed to | Restored? |
|---|---|---|---|
| Name | `Jossy` | unchanged | n/a |
| Theme | `auto` | unchanged | n/a |
| Palette | `refined` | unchanged | n/a |
| Paper | `dots` | unchanged | n/a |
| Texture | `grain` | unchanged | n/a |
| Clock face | `Guilloché Ivory` | `Skeleton Movement` (V4 testing) | ✅ **Yes** — `cleanup_verify.png` shows the orange selection border back on Guilloché Ivory |
| Progress bar | `Bookshelf` | unchanged | n/a |
| Accent pen | `warm` | unchanged | n/a |
| Sound | **`on`** | `off` (accidentally, via a mis-landed tap) | ✅ **Yes** — root summary reads "Sound on · haptics on" |
| Haptics | `on` | unchanged | n/a |
| Old-clock tick | on | unchanged | n/a |
| Sound volumes | Paper 80 %, Stamp 90 % | **not recorded before I touched the page** — cannot confirm; left as found | ⚠️ unknown |
| Reminders | 10 min lead · quiet 22:00–07:00 | unchanged | n/a |
| Attendance | semester 2026-09-07 · unlocked | unchanged | n/a |
| Focus & breaks | 5 min break · 2 per round | unchanged | n/a |

**Files created on the device:**
- `/storage/emulated/0/Download/ZZtest/marginalia-2026-10-05.xlsx` inside a new `ZZtest` folder — **both deleted** (`rm -rf`, verified: "No such file or directory").
- A local copy at `/tmp/opencode/marginalia-2026-10-05.xlsx` — **deleted**.

**App data I created and could NOT remove:**
- **1 focus session** (~29 min credited, title "Free focus", 25-min round + 2 breaks + Flow overtime). No per-session delete exists in the UI. Visible as 1 data row in the exported `Focus sessions` sheet. I did not use Reset.
- No `ZZtest` tasks, notes, subjects, classes, marks or attendance edits were created — **zero** `ZZtest` records exist in the app.

**Not done (deliberately):** no `pm clear`, no in-app Reset, no "Clear demo history", no app install/uninstall, no git command, no build, no `npm install`, no edit to any existing file. Metro was never restarted.

**Known environment issue at end of run:** Expo Go displayed "Cannot connect to Expo CLI… URL: 192.168.1.7:8081" after the app spent ~3 minutes backgrounded behind the system folder picker. Metro was still answering `packager-status:running` the whole time, so this is a dropped dev-server websocket, **not** a dead server and **not** an app defect. The JS bundle kept running and all navigation after that point worked normally.

---

## 9. Evidence index

All paths relative to `qa/shots/exp/`.

**Boot / V1**
- `v1_coldboot_today.png` — Expo Go splash/spinner immediately after tapping the Marginalia dev-server entry
- `v1_today_loaded.png` — Today after cold boot, dark theme: date, greeting, clock, Day complete, This week strip, 4 class rows, bottom nav, FAB
- `v1_today_scrolled.png` — Today scrolled: Notes (taped cards) + Due soon task list with tight badges and "N d late"

**Settings / V11 / A1**
- `v11_settings_root.png` — Settings sheet at ~60 % height with the full root hierarchy and the baseline summary strings
- `v11_look_feel.png` — Look & feel sub-page: Theme & palette, Paper & texture, Clock face, Progress bar, Accent pen
- `a1_clock_face_list.png` — **A1 evidence: exactly 5 clock faces**, Guilloché Ivory selected
- `b11_scales_and_lily_live_plus_thumb.png` — **B11 evidence: Scales and Lily live on Today + thumbnail together, both clean**
- `cleanup_state.png`, `cleanup_state_sheet.png` — Clock face page during cleanup, Skeleton Movement selected
- `cleanup_verify.png` — **cleanup evidence: Guilloché Ivory re-selected (orange border)**
- `cleanup_clock_restored2.png`, `cleanup_clock_restored.png`, `cleanup_final_today.png` — cleanup trail
- `b2_paper_texture_page.png` — Today after a mis-landed tap (opened the Discrete Mathematics attendance sheet)

**Clocks / V4 / B7 / B8**
- `v4_rosette_blanc.png`, `v4_celtic_knot.png`, `v4_skeleton_movement.png` — three faces live on Today with the sheet open
- `v4_crop_liveclock_celtic.png` — **B7 evidence: zoomed Celtic Knot at 3:24 pm, hand angles measured against the status-bar clock**
- `v4_crop_liveclock_skeleton.png` — zoomed Skeleton Movement: 4 wheels + balance wheel, hands at 3:25
- `v4_crop_thumb_skeleton.png` — zoomed Skeleton thumbnail

**Focus dial / B1 / A6**
- `b1_dial_values_strip.png` — **B1 evidence: 25→30 (R-down), 30→20 (R-up), 20→5 (L-down), 5→15 (L-up)**
- `b1_dial_min_strip.png` — **B1 evidence: min clamps at 5 (15→10→5), near-centre origin → 10**
- `b1_dial_R_down.png`, `b1_dial_R_up.png`, `b1_dial_L_down.png`, `b1_dial_L_up.png`, `b1_dial_minA.png`, `b1_dial_minB.png`, `b1_dial_nearcentre.png` — the individual raw frames behind those strips
- `b1_preset25_set.png` — preset 25 set on the dial, hand pointing at ~25 min

**Focus page / V10**
- `v10_focus_initial.png` — **V10 layout: torn Venice, taped task card, knurled dial, presets, Start, "end session", margin note; break button dimmed**
- `v10c_started.png`, `v10c_running2.png` — round running: "Round 1 · focusing", mm:ss countdown, Pause, "end session", presets disabled
- `v10c_dial_running.png` — zoom of the running dial
- `v10c_ring_ready_vs_running.png` — **S2 evidence: ready vs running side by side; the ring band is unchanged**
- `v10f_end_session2_top.png` — header back to "Round 1 · ready" after ending the session
- `v10f_end_session2_bot.png` — **V10f evidence: toast "Saved 29 min of focus"**
- `v10f_end_session.png`, `v10f_end_session2.png`, `v10f_end_session_top.png`, `v10f_end_session_bot.png` — surrounding frames

**Break sticker / A5 / B4**
- `a5_focus_running_5min.png`, `a5_focus_running_gate.png` — **S1 evidence: 16:42 elapsed, break button still `enabled:false`**
- `a5_after_pause_resume.png` — **S1 proof: after one pause→resume the label loses `disabled` and the reason string**
- `a5_sticker_present.png`, `a5_sticker_present2.png` — break running: "Round 1 · on a break", "break, main clock paused", sticker present
- `a5_crop_sticker2.png` — **A5 evidence: zoomed sticker — taped round disc, coffee icon, countdown 02:47, warm progress arc, "tap = back to work", 4° tilt**
- `a5_post_tap_immediate.png`, `a5_post_tap_later.png` (+ `_crop` variants) — post-break state, clock resumed
- `a5_swing_highfps.png` — **A5/B4 evidence: 20 fps frames 0.00–1.55 s showing the sticker swinging on its tape, then detaching and falling**
- `a5_fall_frames_grid.png` — 4 fps overview of the same fall
- `a5_sticker_tap.mp4` — **raw screen recording of the tape-peel → swing → fall** (59 MB)
- `a5_sticker_fall.mp4` — screen recording of the first break (96 MB)
- `a5_whichpage_top.png`, `a5_breakbtn.png`, `a5_after_tap_sticker.png` — supporting frames

**Running-timer indicator / A4 p2 / V19**
- `a4_probe2_today_while_running.png` — Today while a round runs
- `a4_crop_today_header.png` — **A4 p2 evidence: zoomed header, no timer indicator of any kind**
- `a4b_refocus_attempt3.png`, `a4b_whichpage.png` — ref-tap navigation back to the running Focus page
- `v19_back_from_focus.png`, `v19_back_crop.png` — **V19 evidence: hardware BACK from Focus lands on Today**

**Export / V12 / B6**
- `b6_save_to_folder_xlsx.png`, `b6_save_to_folder_xlsx2.png` — black frames: `screencap` cannot capture the DocumentsUI window (the picker *was* open — see below)
- `b6_picker_confirm.png` — "Allow Expo Go to access folder? / Allow access for 'ZZtest'."
- `b6_after_use_folder.png`, `b6_after_use_folder2.png` — after granting
- `b6_export_toast.png` — Data & export page after the write

**Cosmetic**
- `crop_settings_icon.png` — **S5 evidence: zoom of the top-right buttons (app "Settings" glyph above Expo Go's "Tools" gear)**
