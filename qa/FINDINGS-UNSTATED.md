# FINDINGS-UNSTATED — what `prompt.md` + `PROMPT.md` say is broken that the owner's spoken list does not mention

> **Agent A7 SCAN.** Read-only in `src/`. This file is my only output.
> Baseline commit `6b5fd94` on `qa/prelaunch`. `npm run check` green at time of writing:
> **374 tests / 29 suites** on my first run; **405 tests / 31 suites** on my last, twenty minutes
> later, because A1 landed two new test files while I was writing. tsc clean, eslint 0 warnings,
> depcruise clean throughout. See **F-16** — the moving target is itself the finding.
>
> `git status` confirms I wrote nothing in `src/`. The `M src/navigation/Book.tsx`,
> `M src/navigation/window.ts`, `?? src/test/perf-offscreen.test.ts` and
> `?? src/test/perf-placement.test.ts` entries are **A1 PERF's**, not mine.
>
> **The owner's spoken list, for reference (8 items):** page-shuffle lag · 22-instrument progress bar ·
> onboarding screens · focus-timer/clock redesign · "current active class" card on Home · app-wide
> animation polish · final audit pass. (7 named + the audit = the eight.)
>
> **Read this first:** the highest-value result of this pass is not "things are broken". It is that
> **three of `prompt.md`'s named risks are already fixed in code and the docs are stale**, and that
> **one of them (`R5`) was built in full, unannounced, and is now the largest unverified surface in
> the app.** Two further items are *blocked on decisions nobody has asked the owner for*.
>
> Line numbers are a snapshot. Six agents are editing this tree; `src/navigation/Book.tsx` visibly
> changed under me mid-pass. Files I do not own are marked.

---

## 1. Requirement inventory — every checkable requirement in the two docs → actual state → in the spoken list?

Legend for **Spoken?**: **YES** = covered by the owner's message · **NO** = the headline gap ·
**PART** = the phrase is covered but a specific sub-requirement inside it is not.

### 1a. `prompt.md` V1–V20 acceptance items

| V | Requirement (abridged) | Actual state in code | Spoken? |
|---|---|---|---|
| V1 | Cold boot → Today ≤8 s, demo week, 10+ tasks, 5 subjects, non-empty heatmaps | `App.tsx:118-128` Gate/Splash; seed in `data/seed.ts`. Structurally DONE, **never run** (no device, ever) | NO |
| V2 | 6 fonts, hand-drawn outlines, no h-scroll at 360/390/430 dp, font scale 1.3 | `App.tsx:132` FONT_MAP; `kit.tsx:25` HandBox; `common.tsx:25` `minWidth:0` for V2; `ui/fit.ts` `FS=1.4` cap. DONE in code, **never measured** | NO |
| V3 | Page drops from above-right, tilts, settles ~0.5 s; rapid 5-tab ×10 never leaves a page invisible | `navigation/Book.tsx:24` `withTiming(1,{duration:520,Easing.bezier(0.2,0.9,0.25,1)})` — **still 520 ms**, unchanged. Reduce-motion → `k.value=1`. 10× sweep never run | **YES** (perf) |
| V4 | 5 faces, visibly different at 96 dp; selection live-previews; red-brown smooth second hand; Rosette counter-rotates; Skeleton wheels mesh | 5 faces, `FACES` at `faces.ts:11-17`; `sl` has `nosec:true` + a 6 dps sub-dial; `rb` ±12 dps counter-rotation; Skeleton `SKELETON`/`meshPhase` real involutes with tests. **The second hand is `pal.accent` = `#E0A47A` pale peach in the default dark theme — see F-03.** | **PART** |
| V5a–i | Permission dialog, Delivery status counts, Test in 10 s, class lead ±1 min, during-class deferral, quiet hours move **earlier**, queue drops on complete, per-subject lead, survives app kill | `domain/reminders.ts` `planReminders/shift/blockedReason/freeMinutes/latestStart` all present and unit-tested; `services/notifications.ts` channels/sync/focus-end/test present; Delivery status page at `Settings.tsx:168-216` is unusually honest. **Every timing clause UNVERIFIED — no device has ever run this app.** | NO |
| V6 | 27 sounds audible/unclipped; 4-voice cap; per-group + master volume; dial "crunchy"; crumple+thud at ~0.6 s | 27 live WAVs + `nudge` from **`sounds-candidates`** (`audio.ts:14`). `fx.crumple` thud at **620 ms** ✓. `ui.test.ts` proves 0 clipped, peak ≤0.85, DC ≤0.0023 from the bytes. **Audibility needs human ears.** | NO |
| V7 | Distinct haptic per event; Settings → Haptics off silences all | `services/haptics.ts:17-23` maps 15 feels to real `AndroidHaptics.*` constants; `enabled` gate at `:26`. **Emulators vibrate nothing — genuinely unverifiable here.** | NO |
| V8 | 28 dp cells, 3 dp gap, one-tap=Here, re-tap=denied, long-press=status sheet, Lock, one-handed, TalkBack announces date/time/status/hint, misplaced taps | `common.tsx:89-101` AttCell 28×28 `hitSlop 1` `delayLongPress 380`; `attendance.ts:21` `nextStatus('p')==='p'` (one-tap marks Here ✓); `Grades.tsx:27` Lock, `:33` label `${DW} ${date}, ${start}, ${spokenStatus}` ✓. **Structurally complete; the audit never touched the cells.** | NO |
| V9 | 8 Add tiles; Tight/Comfortable box with needed vs free + latest start; subtasks "1/2 steps"; swipe right done / left crumple + Undo; completed time → Stats | `forms.tsx:27-31` **exactly 8 tiles**; `forms.tsx:83` the workload box; `common.tsx:79` "sd/len steps"; `ui/Swipe.tsx:21` thresholds 0.28/0.3 ✓; `store.ts:166` undo. **The entire task-domain lifecycle is still untested (two lost sessions).** | NO |
| V10a–h | Scrapbook layout, knurled dial 5–240 with detents, presets, Start/thunk/hatch fill/mm:ss/tick+4% pulse, ROUND DONE stamp, break sticker, swap/end session, dark dims the scrapbook, back→Today with the timer running | `Focus.tsx:158-159` the 440×1001 scaled canvas; dial `:46-54` 6°/min, clamp 5–240, detent on `round(raw/5)*5` ✓; `:76` `sector(95,112,progDeg)` hatch fill; `:94-121` BreakSticker with tape-pivot swing/fall. **a–d, f, g, h verified on device (EXPO_GO_AUDIT A5); the dial maths VERIFIED GOOD from 7 drags.** | **YES** |
| V10e | Break gate unlocks after 5 min; sticker falls comically; breaks limited per round | `Focus.tsx:127,155,198` read `g = view(t,now).state` — **the S1 gate bug is FIXED**. `timer.ts:15` `nudgeStep` makes the mid-break nudge fire — **S3 FIXED**. `Focus.tsx:166` gear added — **S6 FIXED**. **But `Settings.tsx:236` copy now contradicts the code — see F-13.** | **PART** |
| V11 | Settings hierarchy exactly as listed; **every option live-previews including inside the sheet** | Hierarchy matches `Settings.tsx:108,136-143` exactly, plus an extra `Diagnostics` page. `Sheet.tsx:62` renders `<PaperBg card/>`, so the texture **does** change inside the sheet ✓. DONE | NO |
| V12 | XLSX/CSV/JSON, folder picker + share, `marginalia-<date>.*`, 12 sheets, bold frozen header | `services/export.ts` 12 tables + `Summary` unshifted; `exportFile.ts` folder/share. **Verified on device: 12 sheets, exact names, bold header, frozen pane, 78,420 B (EXPO_GO_AUDIT B6). CSV-zip and JSON contents never independently opened.** | NO |
| V13 | Stats at 360 dp; charts animate once on first view; 28-day attendance heatmap per subject; empty-state hint | `charts.tsx` all five chart types animate via `withDelay`+`withTiming` with a `reduce` short-circuit; `Stats.tsx:40` `attendanceHeat(...,28,now)`; `heatRow(iw,28)` width-derived (BUG-023 fix). DONE | NO |
| V14 | Every gesture has a non-gesture path; sheets trap focus; live regions; dynamic type 1.3×; Remove-animations collapses everything | Stepper `kit.tsx:109` ✓ · status sheet ✓ · Done checkbox `common.tsx:71` ✓ · **dial `accessibilityActions increment/decrement` `Focus.tsx:73`** ✓ · `SwipeCard` `complete/delete/activate` `Swipe.tsx:35` ✓ · Android focus trap `App.tsx:52` + `Overlay.tsx:25` ✓. **The one gap: `HStrip` horizontal scroll has no button equivalent, and `Sheet`'s drag-down has ✕ + backdrop + back ✓.** Structurally complete | NO |
| V15 | Refined vs Original both readable; **all body/caption ≥4.5:1; fix the colour in theme.ts** | `ui.test.ts:9-19` asserts 16 pairs for **refined only** — passes 16/16 both modes. **Original FAILS 2 of the same 16: `mut`/`desk`=4.03 (light), `mut`/`hl`=4.02 (dark). I computed this. See F-10 and C1 — the fix is forbidden by COORDINATION §4.** | NO |
| V16 | Everything persists across kill; Undo survives; attendance rate = (here+late)/held; goal 85 required average; curve ± clamps 0–100 | `attendance.ts:53-62` rate counts `l`/`n` into `here` ✓; `grades.ts` `needed` ✓; `Grades.tsx:66` `Stepper min −20 max 20` ✓; `store.ts:166,170,172,176,181,184,187` seven undo toasts ✓. **Never exercised end-to-end.** | NO |
| V17 | No mem growth; Today 60 s when hidden; Focus 250 ms only when focused; no hidden screen ticks fast | `Today.tsx:19` `useNow(route==='Today' ? 30_000 : 60_000)` ✓. `Focus.tsx:127` `useNow(route==='Focus' \|\| timer.running ? 1000 : 30_000)` — **a still-mounted hidden Focus ticks at 1 Hz whenever a round runs** (needed for `timerPump`, but it is a 1 Hz render of a 213-line screen). `navigation/window.ts` now limits to 2 mounted screens. **No numbers exist.** | **PART** |
| V18 | 10× Start/Pause, 10× toggle, 10× settings open/close, drag dial while sticker falls, double swipe-delete | `ui/latch.ts` double-submit guard exists; `Swipe.tsx:16` `crumpling.current` guard. **Stress never run.** | NO |
| V19 | Edge-to-edge status bar legible; nav above gesture bar; keyboard lifts sheets; back order sheet→sub-page→Focus→Today→exit | `App.tsx:137-139` Themed owns the status bar ✓; `Sheet.tsx:29-39` the lift/clamp ✓; back order `Sheet.tsx:50` + `Focus.tsx:135` + `navigation/sync.ts` ✓ (BUG-021 fixed this). **Expo Go cannot judge system bars — permanently unverifiable in the current loop.** | NO |
| V20 | Portrait only; 320 dp Focus scales, no clipping | `AndroidManifest.xml:20` `android:screenOrientation="portrait"` — **in the native manifest, not `app.json` (see F-17)**. `Focus.tsx:158-159` `scale(width/440)` ✓ | NO |

### 1b. `prompt.md` risks R1–R12, code notes N1–N10, plates, acceptance checklist

| ID | Requirement | Actual state | Spoken? |
|---|---|---|---|
| **R1** | 6 untested high-risk items (dial maths, SVG `Pattern`+`patternTransform`, `mixBlendMode`, `transformOrigin`, navigator timing, `pickDirectoryAsync`) | Dial maths **WORKS** (7 drags). `pickDirectoryAsync` **WORKS** (contradicts R1). `transformOrigin` on the sticker **WORKS**. The three that remain untested: `PaperBg.tsx:26` `mixBlendMode`, `DayBar.tsx:37,63` `patternTransform`, navigator 520 ms timing | NO |
| **R3** | iOS caps at 60 / reports deferred; >14-day reminders need an app open; no background task | `reminders.ts` `deferred`/`dropped` ✓; `Settings.tsx:180` says "Nothing to send in the next 14 days" ✓. **No background task — still true, and V5i is therefore unverifiable without a force-kill test.** | NO |
| **R4** | Timer not persisted across force-kill; **no running-timer indicator outside Focus** | **First half STILL TRUE** (`store.ts:130` re-seeds `initTimer` from settings; only `putSettings` persists). **Second half PARTIAL: `src/ui/RunningTimer.tsx` exists (97 lines, fully built) but is mounted on `Tasks.tsx:28` ONLY.** V10h names the **Today** header — the page Back-from-Focus lands on — and Today still has none. | **NO** |
| **R5** | Notification action buttons NOT implemented; tap opens Today; `slip` variant unused | **R5 IS IMPLEMENTED.** `domain/notifActions.ts` (149 lines: `NOTIF_CATEGORIES`, `planCategory`, `resolveAction`, `applyAction`, `dispatchOpened`, `onceGuard`, `testTarget`, `statusHint`, `logState`), registered at `notifications.ts:21`, attached at `:46`/`:74`, resolved at `:88`, dispatched at `store.ts:257`. A "Test the buttons" control exists at `Settings.tsx:200`. **This doc is stale. The `slip` half of R5 is still true.** | **NO** |
| **R6** | `MS_TZ` read once at module load → DST shows an hour wrong until restart | **STILL EXACTLY TRUE.** `ClockFace.tsx:9` `const MS_TZ = new Date().getTimezoneOffset()*60_000` at module scope, used at `:30`. Unfixed since the initial commit | **NO** |
| **R7 / §PLATES** | Six faces (11,8,13,10,9,15) NOT integrated; needs high-res PNGs; **"ask the user; stop and ask if absent"** | **NOT IMPLEMENTED and now half-retracted.** `assets/plates/` does not exist; `plates.generated.ts` does not exist; `FACES` has 5; the `plates:gen`/`plates:preview` npm scripts were **deleted** (BUG-012). Residue left behind: `PLATE_DARK_MATRIX`, `ONYX.light`, and two docstrings written for plates. **The "stop and ask" was never executed.** | **NO** |
| **R8** | Dial bed drawn as a ring outside the progress ring — verify visually | Audited on device: face fully visible, reads as a chapter ring. **Design-intent question, not a defect. Closed.** | NO |
| **R9** | Contrast computed for refined only; Original "NOT guaranteed" to pass; muted text on the scrapbook 3.9–4.2:1 | **Now quantified and now a PROVEN FAILURE.** See F-10. The scrapbook claim still needs a device | NO |
| **R10** | `useStore((s)=>s)` in several screens; Today re-renders every second | **STALE.** Zero occurrences of `useStore((s) => s)`; all 74 call sites return a raw field / `.find()` / a number. `Today.tsx:15-18` explicitly documents the narrowing. `Today` ticks at 30 s, not 1 s. Already in BUGS.md; **I confirm it and note `prompt.md` itself is still uncorrected** | NO |
| **R11** | `Scales and Lily` `clipPath id="sc"` may collide between thumbnail and live clock | **STILL UNFIXED**: `faces.ts:151` emits a bare `id="sc"`. Audited as not-reproducible in one case. **But the same pattern now exists in five more places — see F-14** | NO |
| **R12** | SQLite adapter tested via a 4-method shim, not expo-sqlite; `getAllAsync` assumed to return `[{user_version}]` | `data/sqlite.ts` unchanged; the migration branch still **never executes on a real device** (0 migrations needed). Still open | NO |
| **N1** | Adding a sound: generator → `npm run sounds` → literal `require` → `SECONDS` → `GROUP()`/`PRIO()` → `fx` → clipping test | The machinery is intact, and it has been used once — see F-12, where it was used **half-way** | NO |
| **N2** | Adding a setting: type → default → control → read | Path works; used for `breakMin`, `breaksPerRound`, `focusFlow` | NO |
| **N3** | Dial maths / `measureInWindow` after the transform | **Verified working on device from 4 origins, both directions** (EXPO_GO_AUDIT B1). Closed | NO |
| **N4** | Reminder planner changes go in `reminders.ts` + `domain.test.ts` first; `shift()` is the single place | Holds. `reminders.ts` `shift()` at `:58` is the only mutator; `:39` `blockedReason`; tests exist | NO |
| **N5** | New entity: type → Spec + appended migration → adapter tables → memory → store action → repo test | Holds; 10 migrations appended, none edited | NO |
| **N6** | Engine in `faces.ts`; `FACES` order is the Settings order; one `useFrameCallback` | Holds exactly. `ClockFace.tsx:29-33` is the single frame callback; `framesetActive(live && !fixed)` at `:34` gates it per-focus — **satisfies the V17/PROMPT Part 3 "must not run when not focused" rule** | NO |
| **N7** | Gears are real involutes; never hand-edit `SKELETON` phases | Holds. `faces.ts:94-116` `RAW` + `meshPhase`, tests assert centre distance / speed ratio / clearance / phase. **Untouched, as COORDINATION §3 requires** | NO |
| **N8** | Hand-drawn outlines: CSS elliptical radii incl. overflow scaling; stable seeds | Holds. `ui/hand.ts` + `ui.test.ts:20-31` | NO |
| **N9** | Selectors must return referentially stable values | Holds. `store.ts:41` `useSyncExternalStore`. Every screen narrows. This is why R10 is stale | NO |
| **N10** | Do not touch `journal-page.jpg`, `t1.jpg`/`t3.jpg`, the deviation ledger | Holds. `Focus.tsx:18` + `PaperBg.tsx:8`; `t3.jpg` still present but **unreferenced** (see §3) | NO |
| **§PLATES (1)–(6)** | PNGs → `PLATES` table → mask engraved hands → `PlateFace` with `ColorMatrix` dark mode → register in `FACES` with `native:'light'` + thumbnails → generate `plates.generated.ts` | **0 of 6 done.** Step 1 blocked on artwork; steps 2–6 never started. `dialPal`'s docstring at `faces.ts:24` already accepts a plate's `{native:'light'}` "without a cast" — i.e. the *interface* was pre-wired for a component that does not exist | **NO** |
| **AC-1** | `npm install && npm run check && npm run bundle` all exit 0 | check ✓ (374/29). bundle not re-run (forbidden). **README.md still says "82 tests", prompt.md:8 says 82, qa/STATE.md:19 says 104, PROMPT.md Part 0 says 313** | NO |
| **AC-2…12** | cold start, V1–V20, 360 dp, 28 dp cells, live settings preview, notification windows, 27 sounds, break sticker, export, both themes, STATE.md | Mostly unverifiable. **AC-11 "Both themes × both palettes readable" is the one that now has a computed counter-example (F-10)** | NO |

### 1c. `PROMPT.md` Parts 0–9

| Part | Requirement | Actual state | Spoken? |
|---|---|---|---|
| **Part 0** | Read 8 files; gates green at 313 tests; don't re-derive | Done by me. **313 is stale — 374** | NO |
| **Part 1** | Scope lock: take 3 things, keep the app's own gear/layout/type/texture/swipe/sheet | **Respected.** `src/ui/hand.ts` and the icon set are byte-unchanged since the baseline; nothing in `6b5fd94` touches gear geometry. Compatible with Parts 2/3 (the instruments and the Focus dial are not the gear) | NO |
| **Part 2** | **22 instruments in 6 groups**, selectable in Settings, grouped as the reference groups them | **4 kinds** (`DayBar.tsx:11`). 18 missing | **YES** |
| **Part 2** | **The design MUST count down**: `p` = remaining fraction of the **active class period**, from real clock time | **NOT IMPLEMENTED, and the current `p` is a different quantity AND the wrong polarity.** `DayBar.tsx:23` `day = clamp01((now - t0)/span)` = **elapsed school-day fraction**. | **NO** |
| **Part 2** | Verify each instrument reads true at p=1 (not started) and p=0 (period over) | No such test exists. `Settings.tsx:132` previews every kind against a fixed `DEMO_NOW` (2026-10-05 10:20) so a p-derivation bug would be invisible in the picker | **NO** |
| **Part 2** | **Per-subject assignment — "Decide with the owner… propose the default and flag it as a decision"** | **Nobody has asked.** `Settings.bar` is a single global string (`types.ts:44`); there is no per-subject mapping anywhere | **NO** |
| **Part 2** | Two inks only; must not distort at any width (the flattened-viewBox failure) | 4 kinds draw in `ink` on `bg` only ✓. No distortion guard exists | **PART** |
| **Part 2** | Recommend the default and justify it | **The default is `bar:'spines'` = "Bookshelf" = "one spine per class, the current one fills" (`defaults.ts:24`, `DayBar.tsx:11`) — literally the "just a bar chart" the owner complained about.** No recommendation has been written | **NO** |
| **Part 3** | Frame callback runs only when focused | **DONE.** `ClockFace.tsx:34`; call sites pass `live={route==='Today'}` / `live={route==='Focus'}` | NO |
| **Part 3** | Each centre artifact gets its own angular velocity | **DONE.** `spinLayers` gives `-6` (Guilloché), `±12` (Rosette), per-gear `w` (Skeleton), `6` (Scales sub-dial), and `osc` for the balance | NO |
| **Part 3** | **Second hand sweeps smoothly and is RED-BROWN, not `pal.accent`** | **NOT DONE.** `faces.ts:177` `stroke="${pal.accent}"`; `theme.ts:10` `REFINED.dark.acc = '#E0A47A'`. The **length** half of this item is now stale (L=86 does reach the tick ring at r≈90.5) — only the colour is live | **PART** |
| **Part 3** | Carry the face's centre artwork + rotating artifact into the Focus dial | **DONE.** `Focus.tsx:75` `<ClockFace id={face} size={182} hands={false} live={route==='Focus'}/>` inside a 185 px circular clip | NO |
| **Part 4** | 520 ms is partly by design; establish duration-vs-frame-budget with evidence | `Book.tsx:24` still 520 ms. **No `qa/RESEARCH-PERF.md` and no `qa/FIX-PLAN.md` exist** — PROMPT.md Part 9 lists both as deliverables and neither file is in `qa/` | **YES** |
| **Part 5** | **Pure black ADDED as a 4th palette and made the DEFAULT dark** | **NOT IMPLEMENTED.** `theme.ts:19` `palettes = { refined, original }`; `types.ts:43` `palette: 'refined' \| 'original'`; `Settings.tsx:112` renders 2 chips; `defaults.ts:23` `palette:'refined'` | **NO** |
| **Part 5** | Update `values-night/colors.xml` (currently `#2B2620`) | **Not updated — correctly**, because black does not exist yet. It is a *latent* trap for whoever adds it | **NO** |
| **Part 5** | Shadows become invisible on a genuinely black page; re-check card shadows, grain, elevation | **Not started** — depends on the palette not existing | **NO** |
| **Part 5** | **Extend `src/test/ui.test.ts` with contrast assertions for the new palette** | **Not started.** `ui.test.ts:10` loops only `['light','dark']` of `palettes.refined`; `:16` actively asserts `refined.dark.paper` is **not** pitch black | **NO** |
| **Part 6** | BUG-001 present both options, recommend one, do not delete `android/`/`ios/` | **Still open, now with a measured answer.** Both folders tracked: `android/` 59 files, `ios/` 15 files. See F-17 for the real impact | **NO** |
| **Part 6** | BUG-002/003/007: three dropped `app.json` keys, local `eas-cli`, TS 5.9.3 vs ~6.0.3 — report impact, upgrade nothing | **Still open, unchanged.** `app.json` still carries `newArchEnabled`, top-level `splash`, `android.splash`. `package.json:53` `"eas-cli": "^24.10.0"`, `:58` `"typescript": "~5.9"`. No impact report has been written | **NO** |
| **Part 7** | Exhaustive measured use of every screen and sheet, ms figures, `qa/WALKTHROUGH.md`, cross-page effect matrix | **Not done and not startable** — no device. `qa/WALKTHROUGH.md` does not exist. `qa/UX-REPORT.md`, `qa/DESIGN-PARITY.md` also do not exist | **PART** |
| **Part 8** | "this app keeps every visited page mounted, so `dump` lists controls from pages you cannot see" | **NOW FALSE.** `navigation/window.ts` unmounts anything older than the two newest visits. See F-15 | **NO** |
| **Part 9** | Outputs: RESEARCH-PERF, DESIGN-PARITY, WALKTHROUGH, UX-REPORT, BUGS append, COVERAGE tick, FIX-PLAN | **0 of 5 exist.** Only `BUGS.md` and `COVERAGE.md` exist, from the earlier pass | **NO** |
| **STOP RULE** | Research/audit/plan, then STOP; do not edit `src/` | Honoured. `git status` shows only `qa/COORDINATION.md` untracked | — |

---

## 2. Ranked: what is actually missing or broken that the owner did not mention

Ordered by (real impact × not-mentioned). Confidence is explicit.

### F-01 · The fourth pure-black palette does not exist — and three of the four files it needs are owned by nobody
**NOT IMPLEMENTED · confidence: certain · blocks on COORDINATION §2**

`PROMPT.md` Part 5 is a hard requirement with no agent assigned and no owner in the spoken list.
Evidence, read today:
- `src/tokens/theme.ts:19` — `export const palettes = { refined: REFINED, original: ORIGINAL };` Two palettes. `REFINED` (`:8`) and `ORIGINAL` (`:12`) are the only `Colors` records.
- `src/domain/types.ts:43` — `palette: 'refined' | 'original'`. Adding a third is a **type change**.
- `src/sheets/Settings.tsx:112` — the picker renders exactly two chips: `[['refined','Refined (lighter cream)'],['original','Original']]`.
- `src/domain/defaults.ts:23` — `palette: 'refined'`, so "made the default dark" is also untouched.
- `src/test/ui.test.ts:9-18` — the contrast suite covers `palettes.refined` only.

**Coordination blocker.** Of the files this needs:
| File | Owner per COORDINATION §2 |
|---|---|
| `src/tokens/theme.ts` | **shared and unowned** |
| `src/domain/types.ts` | **shared and unowned** |
| `src/test/ui.test.ts` | **nobody** |
| `android/app/src/main/res/values-night/colors.xml` | **nobody** (and it is outside `src/`) |
| `src/domain/defaults.ts` | A4 (and A4's brief is onboarding) |
| `src/sheets/Settings.tsx` | A6 |

So four of six are unowned or shared. Per §2 I must not touch them and must hand the exact patch to
the orchestrator. **The orchestrator needs to assign this before it can start.** I have not written
the patch because `theme.ts`/`types.ts` are shared and COORDINATION §2 forbids me making the change —
but the change itself is small and I have specified it exactly in `qa/HANDOFF-A7.md`.

### F-02 · §PLATES / R7 — abandoned mid-way, with dead code left behind, and the "stop and ask" was never executed
**NOT IMPLEMENTED + residue · confidence: certain**

`prompt.md` §PLATES says *"Needed input: the individual high-resolution PNGs (ask the user; stop and ask
if absent)"*. That instruction was **never carried out** — no one has asked the owner for plates
11/8/13/10/9/15. Meanwhile the feature was partially retracted (BUG-012 deleted the `plates:gen` and
`plates:preview` npm scripts and added `src/test/scripts.test.ts:33-40` to *prove they stay deleted*),
and three pieces of dead code remain, each carrying a comment that points at the missing work:

| Dead thing | Where | Why it is dead |
|---|---|---|
| `PLATE_DARK_MATRIX` | `src/ui/clock/faces.ts:35` | A 20-number `FeColorMatrix` for luminance-inverting a plate in dark mode. Its own docstring says *"Not referenced by anything yet"*. **Imported by nothing** — the only other mention in the repo is `scripts.test.ts:52`, which asserts the *string* `'PLATE_DARK_MATRIX'` appears in faces.ts. That is a self-referential test: it "covers" the constant by checking its own name is in its own file. |
| `ONYX.light = '#26201A'` | `src/tokens/theme.ts:27` | Docstring: *"`ONYX.light` is the same material a shade down and **stays for the plate work**"*. Never read anywhere; only `ONYX.dark` is used (`faces.ts:26`). |
| `dialPal`'s contract | `src/ui/clock/faces.ts:24` | *"Takes only `native`, so a bitmap plate (always light artwork) can pass `{ native: 'light' }` without a cast."* — the interface was pre-wired for a `PlateFace` component that does not exist. |

Also absent, as §PLATES step 6 requires: `assets/plates/` (the directory does not exist at all),
`src/ui/clock/plates.generated.ts`, the `PLATES` table, and any `PlateFace`.

**Two honest readings, and the owner has to pick:**
(a) The feature is *abandoned* → delete `PLATE_DARK_MATRIX`, `ONYX.light`, the `dialPal` sentence and
the `scripts.test.ts:52` assertion, and record the drop in the deviation ledger. ~15 lines, zero risk.
(b) The feature is *live* → the owner must supply the PNGs, and 5 of the 6 have engraved hands that
need hand-less variants or a masked dial centre (§PLATES step 3).

Today the repo is in the worst of both worlds: the code pretends the feature is coming and the docs
still list it as an open work item. **The owner explicitly cares about residue from removed features —
this is the largest single pile of it in the project.**

### F-03 · Second hand is still pale peach in the default dark theme
**NOT IMPLEMENTED (colour half) / STALE-DOC (length half) · confidence: high**

`PROMPT.md` Part 3: *"It is currently drawn in `pal.accent` …, which in the default dark palette is
`#E0A47A` — a pale peach that reads grey. Fix the COLOUR and the LENGTH."*

Verified today:
- `src/ui/clock/faces.ts:177` — `if (kind === 'second') return svg(`<path d="M0 18V-${L}" stroke="${pal.accent}" …`. **Still `pal.accent`. Unchanged.**
- `src/ui/clock/faces.ts:176` — `L = … : 86` for the second hand, and `:26` `accent: c.acc`.
- `src/tokens/theme.ts:10` — `REFINED.dark.acc = '#E0A47A'`. The claim is exactly right.
- So `prompt.md` V4's *"the red-brown second hand is smooth"* holds only in the **light** themes
  (`REFINED.light.acc = '#8A4B27'` is genuinely red-brown). In the **default dark** theme it is peach.

**The LENGTH half is stale and should be dropped from the brief.** With `L = 86`, the path runs from
`y=+18` to `y=-86`; the dial's outer case is r=99, the dial r=97.2 and the tick band is r=84…90.5
(`faces.ts:171,164`). The tip lands *inside* the tick ring — a normal, correct second-hand length. A
fixer told to "fix the length" would break a working hand. Say so in the brief.

Note the colour fix needs a decision, not a substitution: `pal.accent` is also the gear jewels
(`faces.ts:84,91`), the Focus dial pointer accents, and the `bal` hub. Changing `acc` would repaint
all of them. The correct fix is a dedicated red-brown second-hand token.

### F-04 · R5 (notification action buttons) is implemented — `prompt.md` and `STATE.md` are stale, and the feature is 100% unverified
**STALE-DOC + unverified feature · confidence: certain (code), medium (Android behaviour)**

Nobody told the owner this was built. It is a complete feature:

| Piece | Where |
|---|---|
| Two categories: `mgatt` (Here/Late/Absent), `mgtask` (Done) | `src/domain/notifActions.ts:16-21` |
| `planCategory` — which kind carries which buttons, and why `start` deliberately does not | `:36-40` |
| `resolveAction` — action id + notification `data` → a typed write | `:49-57` |
| `applyAction` — refuses a vanished row with a *user-readable* toast, and refuses to un-complete a done task | `:72-84` |
| `dispatchOpened` — mark **and** navigate | `:89-93` |
| `onceGuard` — collapses the cold-start double-fire from `getLastNotificationResponse` + the listener | `:103-111` |
| Category registration | `src/services/notifications.ts:21` |
| `categoryIdentifier` attached to every scheduled item and to the test | `notifications.ts:46`, `:74` |
| Response → action resolution | `notifications.ts:84-93` |
| Store wiring (live task/meeting lookup per response) | `src/store/store.ts:243-257` |
| A "Test the buttons" control that sends a real reminder with real buttons | `Settings.tsx:200` |

**Therefore stale:** `prompt.md` R5 ("NOT implemented; tapping opens the Today page"), `STATE.md`
deviation ledger #7, and `EXPO_GO_AUDIT` A2 ("NOT-REACHED"). Also a vocabulary divergence: the docs
say **Here/Late/Missed**, the code ships **Here/Late/Absent** (`notifActions.ts:19`) matching the
app's own `ST` table (`attendance.ts:4`). The code's choice is better; the docs should change.

**Two live risks nobody has recorded:**

1. **One `try/catch` guards categories *and* all three channels.** `notifications.ts:17-27` — if
   `setNotificationCategoryAsync` throws for any reason, lines 23-25 never run, so **no notification
   channel is ever created** and every reminder silently loses its importance and vibration pattern.
   Category registration is the newest, least-tested call in that block and it is placed first, so it
   is the most likely to throw. Cheap fix: split the try/catch, or move categories last.
2. **Android action buttons in the shade have a long history of being foreground-only** for
   locally-scheduled notifications (expo/expo#31710, fixed in part by PR #31795 in SDK 52; still
   reported in #36282). `expo-notifications` here is 57.0.21. And **three buttons is exactly Android's
   shade limit** — `CAT_ATT` has three. The state this feature exists for (app closed, user in the
   shade) is the one state it has **never been observed in**. Needs a release build.

### F-05 · `SheetSpec.slip` and `State.slip` are a fully-wired, unreachable dead spec
**Dead code · confidence: certain**

Declared at `src/store/store.ts:20` (`| { t: 'slip'; key; title; date }`) and `:29` (`slip: … | null`),
initialised `null` at `:35`, routed at `src/ui/Overlay.tsx:32`, and accepted by
`src/sheets/forms.tsx:102` (`Extract<SheetSpec, { t: 'status' | 'slip' }>`).

**Zero code constructs `{t:'slip'}` and zero code assigns `state.slip`.** So no reachable screen opens
it, and `state.slip` is a second, permanently-null copy of the status-sheet target that duplicates
`{t:'status', mode:'class', …}`. `EXPO_GO_AUDIT` open question #5 ("What was it supposed to look
like? Delete it, or give it a trigger?") was never answered and the owner never mentioned it.
Three lines to delete, or one call site to add.

### F-06 · R9 is no longer "not guaranteed" — the Original palette has a **proven** 4.5:1 failure, on a live screen
**PROVEN DEFECT · confidence: certain (computed)**

`prompt.md` R9 only says Original is "NOT guaranteed" to pass. I computed all 16 pairs from the very
list `src/test/ui.test.ts:12` asserts for refined:

```
refined.light:  16/16 pass
refined.dark:   16/16 pass
original.light: 15/16 pass   FAIL  mut on desk = 4.03
original.dark:  15/16 pass   FAIL  mut on hl  = 4.02
```

**`original.dark`'s `mut`/`hl` is reachable in the shipped app.** `src/sheets/forms.tsx:83`:
```tsx
<HandBox seed="wl" fill={w.tight ? c.hl : c.card} …>
  <Txt f="bold" s={19} c={w.tight ? 'warn' : 'ink'}>…</Txt>
  <Txt f="serif" s={15} c="mut">Latest start: {…} (classes, sleep and quiet hours already excluded)</Txt>
</HandBox>
```
`c.hl` in `ORIGINAL.dark` is `#3D434C` and `mut` is `#A8A49D` → **4.02:1**, below the 4.5 the project
sets for itself, on a line of body text, in a selectable palette. Same pattern at
`Settings.tsx:124` (`fill={c.hl}`, but `ink` text — passes) and `WhenPicker.tsx:23` (same).

`mut`/`desk` at 4.03 in `original.light` I could **not** prove reachable: `App.tsx:51` sets the root to
`c.desk` but `PaperBg` covers it. Marked unproven, not claimed.

**And this cannot be fixed as the docs are written — see C1.** It needs an owner ruling.

### F-07 · R6 — the DST clock bug is untouched
**NOT IMPLEMENTED · confidence: certain · ~3 lines**

`src/ui/clock/ClockFace.tsx:9`
```ts
const MS_TZ = new Date().getTimezoneOffset() * 60_000;
```
module scope, evaluated once at import; consumed at `:30` inside the frame callback. A DST change
while the app is alive leaves every clock face an hour wrong until restart. `EXPO_GO_AUDIT` B7
confirmed the current code is otherwise accurate (104°/149°/285° vs a 3:24 pm status bar) and marked
the bug `NOT-TESTABLE-HERE`. Nobody has fixed it and the owner never mentioned it. The fix is to read
the offset inside the worklet, or to drop the offset entirely and use the local-time components
`getHours()/getMinutes()/getSeconds()` — which also removes the modulo-86400000 dance.

### F-08 · R4 — the running-timer indicator exists but is on the wrong page
**PARTIAL · confidence: certain**

`src/ui/RunningTimer.tsx` is a complete, careful 97-line component: reads the store itself, derives
from `view(timer, now)` so it cannot drift, pumps the store so timer events fire even if Focus has
never mounted this launch, lays out at a **constant height in every phase** so it cannot shift the
list, keeps per-second digits out of the live region, and speaks the phase through a separate silent
node. Its docstring cites R4 by name.

**It is mounted on exactly one screen: `src/screens/Tasks.tsx:28`.** Not on Today, Week, Grades or Stats.

`prompt.md` **V10h** is specific: *"Android back from Focus returns to Today … **the Today header
shows nothing about it**: record whether the user needs a running-timer indicator."* Today is the page
you land on when you press Back from Focus, and it is the only one of the five without the strip.
`STATE.md` "Still open" still says the indicator is "Not built, deliberately" — also now false.

So R4's second half is *partly* done, on the page the spec did not name, and the page it did name is
unfixed. The fix is one line in `Today.tsx` — **but `Today.tsx` is A5's**, and A5's brief is the
active-class card. This belongs in A5's scope.

### F-09 · The sound set is half-promoted, and the decision that unblocks it has never been asked for
**ABANDONED-ISH + open owner decision · confidence: certain**

`src/services/audio.ts` requires 27 sounds from `assets/sounds/` and then, on the last line:
```
14:  nudge: require('../../assets/sounds-candidates/nudge.wav'),
```
One file swapped, twenty-seven not. `assets/sounds-candidates/` holds **28 WAVs**; the other 27 are
referenced by nothing in the app. `src/test/ui.test.ts:116` even titles that directory *"candidate
palette (audition set, not yet wired into the app)"*.

`STATE.md` "Still open" and "NEXT ACTION #2" both say this needs **the user's audition verdict** —
`node scripts/synth-sounds.mjs --live`, repoint the requires, regenerate `SECONDS`. That verdict has
never been requested, and the owner's spoken list does not mention sounds at all.

Meanwhile `prompt.md` V6 and acceptance-checklist line 8 say "**All 27 sounds** audible and unclipped"
— a claim that is false as shipped, because the app plays 28 and one of them from a directory its own
test suite describes as not-wired. V6 also asks the agent to *"judge and tune `scripts/synth-sounds.mjs`
(`crunch()` drive, `detent-*` layers) then `npm run sounds`"* — tuning the generator is only safe
**after** the promotion decision, or the audition changes under the fixer.

### F-10 · Settings copy now contradicts the timer code after the S3 fix
**LIVE INCONSISTENCY · confidence: certain**

`src/sheets/Settings.tsx:236`, user-visible on Settings → Focus & breaks:
> "A break pauses the main clock. It unlocks after 5 minutes of focus, **nudges you every 5 minutes**, and the little taped clock falls off the page when it is over."

`src/domain/timer.ts:15`:
```ts
export const nudgeStep = (breakMs: number) => Math.max(60_000, Math.min(NUDGE_MS, Math.floor(breakMs / 3 / 60_000) * 60_000));
```
For the default 5-minute break (`breakMs = 300_000`): `floor(300000/3/60000) = floor(1.667) = 1` → step
= **60 s**. So the sticker now wiggles **four times, once a minute**, not "every 5 minutes".

Both the spec (V10e: "a nudge every 5 minutes") and the copy are now wrong, and the code says
something neither of them says. The `nudgeStep` fix was correct — it resolved the geometric
impossibility `EXPO_GO_AUDIT` S3 identified — but it silently changed a documented behaviour and left
the copy behind. **Either the copy changes or the constant does; the owner has to say which.**

### F-11 · PROMPT.md Part 2's `p` semantics are wrong in the opposite direction, and this is not in the spoken list
**NOT IMPLEMENTED / CONTRADICTED-BY-CODE · confidence: certain**

The spoken item is "a 22-instrument progress bar". Part 2 has four further hard requirements that a
fixer reading only the spoken list will not know about:

1. **The polarity and the quantity both change.** Part 2: *"`p` is percent **remaining** … In the app
   `p` must be the **remaining fraction of the active class period** derived from REAL clock time —
   not a decorative loop."* Today `src/ui/DayBar.tsx:23` is
   `day = clamp01((now - t0) / span)` where `t0`/`span` span **first class to last class** — i.e.
   *elapsed school-day fraction*, passed to all four kinds. That is a different quantity (day, not
   class) **and** the wrong polarity (elapsed, not remaining). Every one of the four existing kinds was
   drawn around the old `p`, so "keep the existing 4 if they are good" (Part 2) is really a rewrite of
   all four, not an addition of eighteen.
2. **`Settings.tsx:132` previews every kind against a fixed clock.** `DEMO_NOW = new Date(2026, 9, 5,
   10, 20)` — one timestamp, one set of periods. A `p`-derivation bug would be invisible in the picker.
   Part 2's "verify each one still reads true at p=1 (not started) and p=0 (period over)" has no test
   anywhere; `src/test/` has no `bars.test.ts` yet.
3. **Two of the four existing names collide with the reference catalogue.** `DayBar.tsx:11` names the
   kinds **"Sight glass"** and **"Ticker"** — and `PROMPT.md` Part 2's 22-instrument list contains
   `sightglass` "Sight glass" and `ticker` "Ticker". Keeping the existing four (Part 2 says to) puts
   **two pairs of identically-named entries** in one Settings list. Needs a naming decision before
   anyone writes the picker.
4. **The SVG-id collision risk scales with the deliverable.** `Settings.tsx:127-134` renders a **live
   `<DayBar>` inside every bar-kind card**. Pattern ids in this codebase are hardcoded literals:
   `hat` (`DayBar.tsx:37`), `liq` (`:63`), `pp` (`PaperBg.tsx:17-19`), `hx` (`Week.tsx:30`), `hatch`
   (`Focus.tsx:66`), `sc` (`faces.ts:151`). Twenty-two instruments rendered simultaneously in one
   sheet is twenty-two chances to collide on the same id — the exact failure `prompt.md` R11 warns
   about. **A2 must suffix ids per kind from day one.** `ui/kit.tsx:144` shows the correct pattern
   (`useId()` for the `HStrip` gradient).

### F-12 · Per-subject bar assignment and the default instrument are unmade owner decisions
**OPEN DECISION · confidence: certain that nobody asked**

`PROMPT.md` Part 2 says in terms: *"**Decide with the owner** whether the app assigns per subject or
lets the user pick; **propose the default and flag it as a decision**"* and *"**Recommend the default
and justify it**."* Two `flag it as a decision` instructions in one section, neither answered.

- There is **no per-subject mapping anywhere**: `Settings.bar` is a single `string` (`types.ts:44`)
  read as one global (`Today.tsx:47`).
- The current default is `spines` = **"Bookshelf — one spine per class, the current one fills"**
  (`defaults.ts:24`, `DayBar.tsx:11`) — which is precisely the "just a bar chart" the owner complained
  about. **Part 2's own complaint about the default is unaddressed and nobody has proposed a
  replacement.**

### F-13 · The "every visited page stays mounted" premise is now false in two documents and in one harness rule
**STALE-DOC + undocumented product change · confidence: certain**

`src/navigation/window.ts` (new) unmounts any screen older than the two newest visits:
```ts
export const inMountWindow = (stamps, latest, name) => (stamps[name] ?? -1) >= latest - 1;
```
with `src/test/nav-window.test.ts` (5 tests) and `Book.tsx:56` gating each route.

Against that:
- `prompt.md:60` — *"every visited page stays mounted"* (architecture map).
- `PROMPT.md` Part 8, listed under **HARD RULES — "each of these has already cost this project a run"** —
  *"uiautomator dumps include HIDDEN pages: **this app keeps every visited page mounted**, so `dump`
  lists controls from pages you cannot see. … Prefer resource-id … and check a screenshot before
  concluding anything."*

So a documented operating rule for device agents is now wrong, and two docs describe a behaviour the
app no longer has. Separately: **losing a screen's scroll position on a 3+-tab hop is a product
change**, taken under a perf brief (`COORDINATION` A1 = page-shuffle lag), and it is recorded in
neither doc. Both docs need a line, and the owner should be told the memory win costs scroll position.

### F-14 · Hardcoded SVG ids in six places — R11's exact failure mode, now systemic
**LIVE LATENT RISK · confidence: medium**

`prompt.md` R11 names one instance: *"`SvgXml` ids: face 'Scales and Lily' uses `clipPath id="sc"` …
give ids a per-instance suffix in `staticSvg`."* `src/ui/clock/faces.ts:151` still emits a bare
`id="sc"`. **Unfixed.**

The same pattern now exists in five more places, and `inMountWindow` keeps **two** screens mounted at
once, so duplicate ids now coexist by design rather than by accident:

| id | File:line | Coexists with |
|---|---|---|
| `sc` | `faces.ts:151` | live clock + `FaceThumb` in Settings → Clock face |
| `pp` | `PaperBg.tsx:17,18,19` | one per mounted `Page` **plus one per open `Sheet`** (`Sheet.tsx:62`) |
| `hx` | `Week.tsx:30` | the other mounted screen's `Page` |
| `hat` / `liq` | `DayBar.tsx:37` / `:63` | Today + Settings → Progress bar preview |
| `hatch` | `Focus.tsx:66` | — |
| `id` (correct) | `kit.tsx:144` `useId()` | the pattern to copy |

`EXPO_GO_AUDIT` B11 observed the `sc` case surviving (live clock + thumbnail both rendered), which is
evidence react-native-svg usually tolerates it — so this is a **latent risk, not a proven break**, and
I am not claiming the app is broken. I am claiming R11 is unfixed, the pattern has multiplied five-fold,
and 22 instruments in one sheet (F-11.4) will multiply it again.

### F-15 · `colorPrimary` is still the stock React Native template blue, in the *authoritative* native theme
**RESIDUE · confidence: certain · low severity**

`android/app/src/main/res/values/colors.xml:4`
```xml
<color name="colorPrimary">#023c69</color>
```
referenced by `android/app/src/main/res/values/styles.xml:4` inside `AppTheme`
(`parent="Theme.AppCompat.DayNight.NoActionBar"`). Because `android/` is tracked, EAS treats this
file as the source of truth (BUG-001), so **`#023c69` is what ships.** The app's own accent
(`REFINED.dark.acc = #E0A47A`, `REFINED.light.acc = #8A4B27`) appears nowhere in the native theme.
Notification tint is app-controlled (`notifications.ts:46` `color: accent`), so this does not visibly
break reminders — but it is template residue in the one place a reviewer would assume the app is
authoritative, and nobody owns `android/`.

### F-16 · Four different test counts in four documents
**STALE-DOC · confidence: certain**

| Source | Claim | Actual |
|---|---|---|
| `README.md:9` | "typecheck + lint + **82 tests**" | 374 |
| `prompt.md:8` | "tsc strict + eslint 0 warnings + **82 jest tests**" | 374 |
| `qa/STATE.md:19` | "tsc + eslint + **104 jest** + depcruise" | 374 |
| `PROMPT.md` Part 0 | "**313 jest tests / 29 suites**" | 374 / 29 |
| `qa/COORDINATION.md:39` | "374 tests / 29 suites" | ✅ correct |

`qa/BUGS.md:1531-1533` already flags the 82 and 104 as stale; **PROMPT.md, the most recent document,
is now itself stale**, and `README.md` is badly stale. Acceptance-checklist line 12 requires
"`STATE.md` updated" — `STATE.md` is dated 2026-10-03 and still says "No device has ever been attached
to this machine", which is true, but it also still lists "the 6 requested plate clock faces" as
NEXT ACTION #4.

**This is not a pedantry finding, and I can prove it.** During this very session the count went
**374 → 405** in twenty minutes because A1 landed `perf-offscreen.test.ts` and `perf-placement.test.ts`
while I was writing. A gate note that says "374 tests" is wrong by the time it is read. The fix is not
five edits — it is to stop putting a test count in prose and point at `npm run check` instead, or to
put it in one generated place. `COORDINATION.md:39` is currently the only correct source and it is
going stale the same way.

### F-17 · BUG-001's real-world impact, measured rather than restated
**OPEN DECISION · confidence: high**

`PROMPT.md` Part 6 asks for both options and forbids deleting the folders. Measured today:
`git ls-files android` → **59 files**; `git ls-files ios` → **15 files**. Both committed, neither
ignored (`.gitignore` only excludes build outputs).

Field-by-field, what is actually inert:
| `app.json` key | Inert? | Does anything depend on it? |
|---|---|---|
| `orientation: "portrait"` | **yes** | **Yes, and it is load-bearing.** `AndroidManifest.xml:20` carries `android:screenOrientation="portrait"` itself. **V20's portrait-only lock comes from the native folder, not from `app.json`.** Anyone who adopts CNG and deletes `android/` without re-checking the manifest loses it. |
| `scheme: "marginalia"` | yes | Nothing. `rg 'marginalia://'` finds no deep-link handling anywhere in `src/`. Harmless today. |
| `userInterfaceStyle: "automatic"` | yes | The native theme is `DayNight`, so it follows the system anyway. |
| `icon` / `splash` | yes | `res/mipmap-{m,h,xh,xxh,xxxh}dpi` and `drawable-*` are all present in the native folder. |
| `backgroundColor: "#FAF4E6"` | yes | **This is the dangerous one.** `values/colors.xml` also hardcodes `#FAF4E6` and `values-night/colors.xml` hardcodes `#2B2620`, with a comment already explaining that the Original palette "cannot be expressed in a native resource at all". The moment a palette becomes the default (F-01) the window colour and `app.json` disagree silently. |
| `newArchEnabled: true` | yes (BUG-002) | New Arch is genuinely on via `android/gradle.properties`. Intent preserved, key is a lie. |
| top-level `splash`, `android.splash` | yes (BUG-002) | Same. |

**My recommendation, which `PROMPT.md` asks for:** keep the native folders (they carry the 109 MB →
27.6 MB work in `BUILDING.md` — `reactNativeArchitectures=arm64-v8a`, `abiFilters`, `useLegacyPackaging`)
and **document `app.json` as advisory for identity only**, while **moving the four values that are
genuinely native-only (`colorPrimary`, `activityBackground`, `splashscreen_background`, the portrait
lock) into one documented place** and deleting the `app.json` keys that lie. That is a docs + one-XML
change, needs no CNG migration, and removes the trap. BUG-002/003/007 remain unreported; I confirmed
all three (`app.json` still carries the three dropped keys, `package.json:53` still has
`"eas-cli": "^24.10.0"`, `package.json:58` still has `"typescript": "~5.9"` against ~6.0.3).

### F-18 · One hidden Focus screen still ticks at 1 Hz for the whole round
**LIVE, unquantified · confidence: medium**

`src/screens/Focus.tsx:127`
```ts
const now = useNow(st.route === 'Focus' || st.timer.running ? 1000 : 30_000);
```
and `:133` `useEffect(() => { act.timerPump(now) }, [now])`.

`prompt.md` V17: *"**Hidden screens must not tick fast** (Today ticks 60 s when hidden; Focus 250 ms
only when focused)."* Today is compliant (`Today.tsx:19` → 60 s when hidden). Focus is **not**: whenever
a round is running, the still-mounted Focus screen re-renders 60×/s-equivalent (1 Hz) and rebuilds its
whole 213-line tree — dial, sticker, stamp, presets — **even while you are on To-do**. The 1 Hz is
*needed* (it is what fires `roundDone`/`warn10`/`nudge` when you have left the page), but the cost is a
full FocusScreen re-render per second while hidden. `RunningTimer` on `Tasks.tsx:28` calls
`timerPump` too, so with the strip mounted on To-do the pumping is duplicated.

Note the ordering: `inMountWindow` keeps 2 screens; while Focus is a `Book.Screen` route, it competes
for those slots. I could not settle whether Focus is inside the mount window without a device.
**Unquantified — no frame data exists.** The clean fix is to move `timerPump` to a single
always-mounted owner (or into `store.ts` on a timer) and let Focus render at 30 s when it is not the
route. Flagging for A3 + A1 jointly; **not** a device-free fix.

### F-19 · `qa/EXPO_GO_AUDIT.md`'s S1/S2/S3/S6 are fixed in code but still written as open
**STALE-DOC · confidence: certain**

`qa/BUGS.md` stops at BUG-032, so the six defects in `EXPO_GO_AUDIT.md` §4 are invisible to anyone who
reads only BUGS.md — and four of them are now **wrong**:

| S | `EXPO_GO_AUDIT` says | Code today |
|---|---|---|
| **S1** BLOCKER: break gate never unlocks | CONFIRMED-BROKEN, `Focus.tsx:155,195` vs `:127` | **FIXED.** `Focus.tsx:127` `g = v.state`; `:155` and `:198` use `canBreak(g)`. `timer.ts:62-64` documents the store/view split and warns against exactly this bug. |
| **S2** HIGH: hatch ring does not fill | CONFIRMED-BROKEN, "I did not read the exact binding line" | **FIXED.** `Focus.tsx:75-76` bind `sector(95,112,progDeg)` with `leftMs={g.focusLeftMs}` (`:179`), and `:175-178` says so in a comment. |
| **S3** MEDIUM: 5-min nudge can never fire | "Fix direction: make `NUDGE_MS` a fraction of `breakMs`" | **FIXED** exactly that way — `timer.ts:15` `nudgeStep`. (But see **F-10**: the Settings copy was not updated.) |
| **S4** MEDIUM: wrong reason text while paused | "reads `Take a break, 2 left. Start a round first.`" | **FIXED.** `Focus.tsx:155` now has a distinct `'Paused — resume the round to take a break.'` branch. |
| **S5** COSMETIC: gear reads as a sunburst | "may be intentional … I did not read the `gear` path" | **STILL TRUE.** `ui/kit.tsx:49` `gear:` is a plain circle plus 8 radial spokes to r≈10.1. **But `COORDINATION.md` §3 bans editing the icon set — so this finding must be formally DROPPED, not fixed.** Someone needs to write that down or it will be re-raised every pass. |
| **S6** COSMETIC: no settings gear on Focus | CONFIRMED, no `open-settings` node | **FIXED.** `Focus.tsx:166` now renders a 44×44 gear Pressable. |

### F-20 · Other residue worth deleting
**Dead code · confidence: high**

| Item | Where | Note |
|---|---|---|
| `releaseAudio()` | `src/services/audio.ts:104` | Exported, **never called** anywhere. Either the audio pool should be released on low memory, or it should go. |
| `SheetClose` type | `src/ui/Sheet.tsx:16` | Exported, imported by nothing. `useSheet()` at `:15` already gives the same shape inline. |
| `fx.tapeStick()` | `src/services/fx.ts:28` | Defined, **never called**. Probably a leftover from when the break sticker got its tape-stick sound; the sticker's arrival currently plays nothing. |
| `Feel` member `'error'` | `src/services/haptics.ts:4,9,19` | Mapped for both platforms, **never requested** by `fx`. A "reject" haptic exists and nothing uses it — `fx.denied()` uses `'warn'`. |
| `fmt` | `src/services/export.ts` | Test-only. Legitimate, but worth knowing so nobody "cleans it up". |
| `gearSvg`, `balanceSvg`, `meshPhase`, `BALANCE` | `src/ui/clock/faces.ts:81,88,102,117` | Exported but used only inside `faces.ts`. Narrow the exports; do not delete (N7 territory, and A3 owns the file). |
| `assets/textures/t3.jpg` | `assets/textures/` | **Unreferenced** — `PaperBg.tsx:8` only loads `t1.jpg`. `prompt.md` N10 lists it as "selectable", but it is not reachable from the `texture` setting (which offers `grain`/`photo`/`none`). |
| `assets/sounds-candidates/` × 27 | repo | See F-09. 27 unreferenced WAVs; the 28th is live. |

`src/test/dead-code.test.ts` catches only identical ternary arms and bare `export {}` re-exports — it
found none of the above. My scan (every `export const|let|function|class|interface|type` declaration
outside `src/test/`, checked against every import specifier in the tree) found all of them.

---

## 3. Abandoned / half-built code worth deleting — ranked by how safe it is to delete

| # | Item | Lines | Safe? | Notes |
|---|---|---|---|---|
| 1 | `State.slip` + `SheetSpec.slip` (store.ts:20,29,35) + the `slip` arm at Overlay.tsx32 + the `'status' \| 'slip'` in forms.tsx:102 | ~4 | **Yes** | Unreachable (F-05). Nothing constructs it. |
| 2 | `scripts.test.ts:52` — `expect(faces).toContain('PLATE_DARK_MATRIX')` | 1 | **Only if** you also delete #3 | A test that asserts a constant's own name appears in its own file. |
| 3 | `PLATE_DARK_MATRIX` + its docstring (faces.ts:28-35) | 8 | **Only if the plates feature is dropped** | F-02. Needs an owner ruling first. |
| 4 | `ONYX.light` + the "stays for the plate work" sentence (theme.ts:25-27) | ~3 | **Only if #3** | F-02. **theme.ts is shared/unowned — orchestrator applies.** |
| 5 | `fx.tapeStick()` (fx.ts:28) | 1 | **Yes**, or wire it up | Nothing calls it. |
| 6 | `releaseAudio()` (audio.ts:104) | ~4 | **Yes**, or wire it up | Never called. |
| 7 | `SheetClose` (Sheet.tsx:16) | 1 | **Yes** | Never imported. |
| 8 | `Feel: 'error'` + its two handlers (haptics.ts:4,9,19) | 3 | **Yes**, or use it for `fx.denied()` | Never requested. |
| 9 | `assets/sounds-candidates/` × 27 unreferenced WAVs | — | **After** F-09 is decided | Keep all 28 if the audition promotes them. |
| 10 | `assets/textures/t3.jpg` | — | **Ask first** | N10 says "selectable"; it is not. Deleting an `assets/` file is forbidden by `prompt.md` `<forbidden_actions>` without asking. |
| 11 | Narrow `export` on `gearSvg`/`balanceSvg`/`meshPhase`/`BALANCE` | 4 | **A3 only** | Gear scope lock — do not touch the geometry, only the `export` keyword. |

---

## 4. Contradictions between `prompt.md` and `PROMPT.md` (and with `COORDINATION.md`)

**C1 — "All text must clear 4.5:1" vs "never alter an existing palette". Unresolvable as written.**
`prompt.md` V15: *"if any text reads below 4.5:1 … **fix the colour in `src/tokens/theme.ts`**"* and
`PROMPT.md` Part 5: *"All body and caption text must clear **4.5:1**."*
`prompt.md` R9: *"the Original palette is a faithful conversion and is **NOT guaranteed** to pass
4.5:1."*
`COORDINATION.md` §4: *"**Never remove, rename, or alter an existing palette.** Every one that exists
today stays selectable with its current values."*
And I have now **measured** the failure (F-06): `ORIGINAL.light` `mut`/`desk` = 4.03 and
`ORIGINAL.dark` `mut`/`hl` = 4.02, the latter on a live line in the Task sheet.
→ **The orchestrator must rule before any palette work starts.** My recommendation: the palette rule
wins for `paper`/`card`/`ink` (the structural colours) and the contrast rule wins for `mut` only — a
one-token change to `mut` in each mode of `ORIGINAL` is a *value* alteration, so it needs explicit
permission. Alternatively amend R9 to "known and accepted", which is at least honest, and record it.

**C2 — V15's "NOT pitch black" vs Part 5's "add a pure-black palette".** Reconcilable, but only via a
*third* named palette: `src/test/ui.test.ts:16` already asserts
`lum(palettes.refined.dark.paper) > 0.018` ("dark paper is not pitch black"). So `REFINED.dark` must
keep `#2B2620` and the black palette has to be new. `PROMPT.md`'s revision note item 5 says exactly
this, so this one **is** resolved — I am recording it so nobody "helpfully" darkens refined to reach
4.5:1 and breaks the test.

**C3 — Part 2's `p` vs `prompt.md` V4's DayBar.** `prompt.md` V4 and the architecture map describe
`DayBar`'s four kinds without ever defining `p`; `PROMPT.md` Part 2 defines `p` as *percent remaining
of the active class period*. The code implements a third thing (elapsed school-day fraction).
**Three definitions, no agreement.** Whichever wins, all four existing kinds must be redrawn.

**C4 — Mount semantics.** `prompt.md:60` and `PROMPT.md` Part 8 both assert "every visited page stays
mounted"; the code unmounts beyond two. Part 8 uses the stale claim as a **hard operating rule for
device agents**. See F-13.

**C5 — The 22-instrument name collision.** Part 2 lists `sightglass "Sight glass"` and
`ticker "Ticker"`; `DayBar.tsx:11` already ships kinds named **"Sight glass"** and **"Ticker"**, and
Part 2 says "Keep the existing 4 if they are good". Following both instructions literally produces
duplicate labels in one Settings list. Unresolvable without a naming decision.

**C6 — Plate 08 is wanted and was dropped.** `prompt.md` R7/§PLATES want plate **8**;
`STATE.md` Decisions records *"faces 02, 07, **08**, 08·v2 dropped as near-duplicates"*. The owner is
asking for a face the project already deleted as a near-duplicate. Nobody has reconciled that.

**C7 — Notification button vocabulary.** `prompt.md` R5 and V5 say **Here/Late/Missed**;
`notifActions.ts:19` ships **Here/Late/Absent**, matching `attendance.ts:4`'s `ST`. Code is better;
docs should be corrected.

**C8 — Test-count truth has four homes and three are wrong.** F-16. `PROMPT.md` Part 0 (313) is the
newest doc and is already stale; `COORDINATION.md` (374) is the only correct one.

**C9 — Checked and *compatible*, recorded so nobody re-litigates it.** `PROMPT.md` Part 1's gear lock
vs Part 2's 22 instruments and Part 3's centre artifacts: the instruments live in `DayBar.tsx` /
`ui/instruments/**` and the center artifact lives in `Focus.tsx`'s dial — none of them is the gear.
`src/ui/hand.ts`, `gearGeometry`, `toothPath`, `meshPhase`, `SKELETON`, `RAW` and the icon set are all
**byte-identical to `47339a5`**. I verified this; no finding in this document requires changing them,
and the only finding that *would* (F-19/S5, the sunburst gear) is **dropped** under `COORDINATION.md`
§3, exactly as §3 instructs.

---

## 5. Open decisions that have never been put to the owner

Ranked. Each is a question only the owner can answer, and each blocks work that is otherwise ready.

| # | Decision | Source | Blocks | Spoken? |
|---|---|---|---|---|
| 1 | **Drop or finish the plate faces?** If drop: supply nothing, and I delete 4 residue sites. If finish: supply the 6 high-res PNGs, 5 of which need hand-less variants. | `prompt.md` §PLATES *"ask the user; stop and ask if absent"*; R7; `EXPO_GO_AUDIT` Q1 | F-02 | **NO** |
| 2 | **May an existing palette's `mut` be re-valued to pass 4.5:1?** (§4 says no; V15 says fix it.) | C1, F-06 | F-01, F-06 | **NO** |
| 3 | **Per-subject bar assignment, or a single global picker?** And **which of the 22 becomes the default?** | `PROMPT.md` Part 2, twice | F-11, F-12 | **NO** |
| 4 | **Promote the auditioned sound set, or reject it?** `node scripts/synth-sounds.mjs --live` + repoint the requires + regenerate `SECONDS`. Until then the app plays 27 live sounds plus 1 candidate, and V6's "27 sounds" is false. | `STATE.md` "NEXT ACTION 2"; `audio.ts:14` | F-09 | **NO** |
| 5 | **Confirm the notification action buttons were wanted.** They are built; nobody asked for them; changing a notification's appearance is a product decision the earlier agent explicitly refused to assume. | `EXPO_GO_AUDIT` Q4; R5 | F-04 | **NO** |
| 6 | **Delete `slip`, or give it a trigger?** | `EXPO_GO_AUDIT` Q5; R5 | F-05 | **NO** |
| 7 | **Nudge every 5 min (V10e + the current copy), or every breakMs/3 (the current code)?** | F-10 | F-10 | **NO** |
| 8 | **Accept the mount-window trade?** Memory win vs losing scroll position on a 3+-tab hop. | F-13 | — | **NO** |
| 9 | **BUG-001: keep the native folders and document `app.json` as advisory?** (My recommendation, F-17.) | `PROMPT.md` Part 6 | F-17 | **NO** |

---

## 6. What is safe to fix with **no device** — ranked, for hand-off to a fixing agent

Tier A is provable by a jest test and provable by the gate. Tier B is provable by a test but the
visual verdict still needs eyes. Tier C **cannot** be settled without a device and should not be sent
to an agent that has to prove it.

### Tier A — pure logic / dead code / docs. Provable by `npm run check`. No rendering judgement needed.

| Rank | Fix | Files | Test to add | Owner? |
|---|---|---|---|---|
| A1 | **Delete the `slip` dead spec** — `SheetSpec.slip`, `State.slip`, the Overlay arm, the `StatusSheet` union | `src/store/store.ts`, `src/ui/Overlay.tsx`, `src/sheets/forms.tsx` | assert no `{t:'slip'}` exists / `StatusSheet` takes only `'status'` | ⚠️ `store.ts` is **shared** — orchestrator applies. `Overlay.tsx`+`forms.tsx` are **A6's**. |
| A2 | **Fix R6 (`MS_TZ`)** — read the offset per frame, or drop it and use `getHours()/getMinutes()/getSeconds()` | `src/ui/clock/ClockFace.tsx` | pure: a helper that maps `(Date, offsetMs)` → `{h,m,s,ms}` and asserts the hand angles at a known instant; **mutation-check** (reintroduce the module-level read and the test must fail) | **A3** |
| A3 | **Fix the second-hand colour (F-03)** — add a dedicated red-brown token; **do not** touch `acc`, which the gear jewels and Focus dial also use. Drop the "length" half of the brief. | `src/ui/clock/ClockFace.tsx`, `src/ui/clock/faces.ts`, `src/tokens/theme.ts` | assert the second-hand stroke is the red-brown token and not `pal.accent`, in both themes | `theme.ts` is **shared**; the rest is **A3's** |
| A4 | **Delete the remaining dead exports** — `releaseAudio`, `SheetClose`, `fx.tapeStick`, `Feel:'error'` | `src/services/audio.ts`, `src/ui/Sheet.tsx`, `src/services/fx.ts` | extend `src/test/dead-code.test.ts` to cover `export const/function` (it currently only catches identical ternaries and bare `export {}`) | **A6** owns `Sheet.tsx`/`fx.ts`; `audio.ts` unowned |
| A5 | **Fix the S3 copy (F-10)** — either correct `Settings.tsx:236` to say what the code does, or change `NUDGE_MS`. **Owner must pick** (decision #7). | `src/sheets/Settings.tsx` | a test that the Focus & breaks copy matches `nudgeStep(DEFAULT_SETTINGS.breakMin*60_000)` | **A6**, after the ruling |
| A6 | **Correct the four stale test counts (F-16)** | `README.md`, `prompt.md`, `PROMPT.md`, `STATE.md`, `qa/STATE.md` | none (docs) | orchestrator |
| A7 | **Correct the two stale doc claims** — "every visited page stays mounted" (`prompt.md:60`, `PROMPT.md` Part 8) and "`useStore((s)=>s)` in several screens" (`prompt.md` R10) | `prompt.md`, `PROMPT.md` | none (docs) | orchestrator |
| A8 | **Correct R5 in the docs** (F-04) — the buttons exist; and the vocabulary is Here/Late/**Absent** | `prompt.md` R5, `STATE.md` deviation #7, `qa/EXPO_GO_AUDIT.md` A2 | none (docs) | orchestrator |
| A9 | **Record S5 as formally dropped** under `COORDINATION.md` §3 (F-19) so it stops being re-raised | `qa/BUGS.md` or `qa/COORDINATION.md` | none (docs) | orchestrator |
| A10 | **Fix `colorPrimary` (F-15)** — set it to the app's accent, or delete the override so AppCompat's default applies. One line in `android/app/src/main/res/values/colors.xml`. Outside `src/`, so no agent's row covers it. | `android/…/values/colors.xml` | none | **orchestrator** — nobody owns `android/` |
| A11 | **Add the `p`-semantics + per-kind SVG-id rules to A2's brief (F-11)** before A2 writes any instrument: `p` = remaining fraction of the **active class period**; ids suffixed per kind (`useId()` like `kit.tsx:144`); name-collision ruling for "Sight glass"/"Ticker" | `COORDINATION.md` A2 row | — | orchestrator, **now** |
| A12 | **Reserve the black-palette slice (F-01)** and assign the four unowned/shared files: `theme.ts`, `types.ts`, `ui.test.ts`, `values-night/colors.xml`. Until then PROMPT.md Part 5 cannot start. | `COORDINATION.md` | — | orchestrator, **now** |

### Tier B — provable by test, but the visual verdict still needs eyes

| Rank | Fix | Why not Tier A |
|---|---|---|
| B1 | **Extend `src/test/ui.test.ts`** to assert all 16 contrast pairs for **both** existing palettes, not just refined — which will immediately fail on the two pairs in F-06 and force decision #2. Per `COORDINATION.md` §4, **extend, never weaken**. | The test is easy; the *fix* is forbidden without a ruling. |
| B2 | **Per-instance SVG ids (F-14/R11)** — suffix `sc`, `pp`, `hx`, `hat`, `liq`, `hatch` the way `kit.tsx:144` already does with `useId()`. | Structurally provable ("no two rendered SVGs share an id") but the *rendered* result needs a screenshot, and `Faces`/`Focus` thumbnails are A3/A6's. |
| B3 | **Add a `bars.test.ts`** for `p = 1` (not started) and `p = 0` (period over) per `PROMPT.md` Part 2 — the check that does not exist today, and the one `Settings.tsx`'s single fixed `DEMO_NOW` preview cannot catch. | Pure arithmetic, but it only exists once A2's instruments do. |
| B4 | **Add a 28-day × 6-group settings-list test** for the instrument picker once A2 lands — specifically that no two entries share a display name (C5). | Pure, but depends on A2. |

### Tier C — **cannot** be settled without a device. Do not hand these to a device-free agent as "done".

- **F-04.2** — whether a 3-button `mgatt` category renders in the Android shade with the app closed
  (expo#31710 / #36282 history; Android's 3-button limit). Needs a **release** build.
- **F-04.1** — whether `setNotificationCategoryAsync` actually throws in the wild. It is wrapped in
  the same `try/catch` as the channels; the *consequence* (no channels) is provable by reading the
  code, the *trigger* is not.
- **F-18** — the 1 Hz hidden-Focus re-render. Needs `dumpsys gfxinfo` on a release build.
- **F-03** — whether `#E0A47A` "reads grey" against `#17130F` on a real screen. The measured value is
  certain; the perceived one is not.
- **R1's three survivors** — `mixBlendMode` at `PaperBg.tsx:26`, `patternTransform` at
  `DayBar.tsx:37,63`, and the 520 ms navigator timing.
- **All of V5, V6 audibility, V7** — by construction.
- **`values-night/colors.xml` brown-flash-on-black** — only observable once F-01 lands, and only on a
  cold start of a real build.

---

## 7. What I could not verify, and why

- **No rendering.** I did not run `./qa/scripts/render.sh` or read a PNG. I was not judging a visual;
  every claim above is either read out of source, computed from source (`F-06`), or a git/asset fact.
  Nothing in this document should be read as a visual verdict.
- **No device.** Per `COORDINATION.md` §0 the SM-A516N is behind a secure pattern lock. I did not call
  `adb`, `mobile-mcp` or any device tool. Nothing here is "verified on device".
- **`npm run check` is green — 374 tests / 29 suites on my first run, 405 / 31 on my last** (A1 landed
  two test files mid-session), tsc clean, eslint 0 warnings, depcruise clean (156 modules, 495 deps).
  That is the tree as I found it, mid-flight, with six agents editing. It may not be green by the time
  you read this.
- **`npm run bundle` not run** (forbidden by `COORDINATION.md` §1).
- **Line numbers drift.** `src/navigation/Book.tsx` changed under me mid-pass (the two sync effects
  moved from lines 42/43 to 67/68). Every file in another agent's row should be re-located before you
  edit it.
- **F-06's `mut`/`desk` reachability is unproven.** I proved `mut`/`hl` (`forms.tsx:83`) and could not
  prove `mut`/`desk`; I marked it rather than claiming it.
- **F-18's mount-window interaction with Focus is unresolved.** Whether `FocusScreen` occupies one of
  the two window slots changes the size of the problem, not its existence. I did not guess.
- **I did not re-derive any of the 32 `qa/BUGS.md` findings**, except to *confirm* the status of R10
  and BUG-012 (both already recorded) so I could classify them STALE-DOC rather than re-report them.

---

## 8. Bottom line for the orchestrator

1. **The owner is right that the spoken list is the visible work, and wrong that it is everything.**
   Twenty concrete requirements in the two contracts are not in that list. The four that matter most:
   the black palette does not exist (**F-01**), the plate faces were abandoned mid-way with dead code
   left behind (**F-02**), the notification action buttons were built and nobody said so (**F-04**),
   and the DST clock bug is untouched (**F-07**).
2. **Three of `prompt.md`'s named risks are stale in the doc's favour.** R5 is done. R10 was already
   done. R4 is half-done on the wrong page. Fixing the docs is as much a deliverable as fixing the code.
3. **One contradiction will stall the palette work the moment it starts** (C1): V15 orders a colour
   fix that `COORDINATION.md` §4 forbids. Rule on it before dispatching anyone.
4. **Two of the six spoken items hide unmade decisions.** "The 22-instrument progress bar" is not one
   task; it is eighteen new instruments, an inverted `p` semantics, a per-subject assignment decision,
   a default-instrument recommendation, and a name-collision ruling. None of the last four has been put
   to the owner.
5. **Assign `theme.ts`, `types.ts`, `ui.test.ts` and `android/` or PROMPT.md Part 5 cannot begin.**
   They are shared, unowned, or outside every agent's row.
6. **The safe, device-free hand-off is Tier A above — twelve items, all of which `npm run check` can
   prove.** A1 (delete `slip`), A2 (R6), A3 (second-hand colour), A4 (dead exports), A6/A7/A8/A9 (docs),
   A10 (`colorPrimary`), and A11/A12 (two brief/roster amendments that cost nothing and unblock the
   two agents who are otherwise about to build the wrong thing).
