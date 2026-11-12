# STATE — Marginalia v2 improvements

_Updated: 2026-11-01 (**v0.5 in progress on `v2-improvements`**, pushed. Version 0.5.0 / versionCode 4.
Gate: 81 suites / 1,325 tests, typecheck, lint (0 warnings) and depcruise green; the suite runs under
`TZ=Europe/Berlin`. Committed: CP2 `526f3c0` store split + pins, CP3 `0be36d9` reliability, CP4 `586ec7d` +
`c4c4815` time and perf, D4 core `c3f5386`, R1 core `9557519`. The v0.5 status section below says what is left.)_

## Checkup log

### 2026-11-11 — end of session (after checkup 1; owner said "finish everything", no checkup 2)
Check green: typecheck, lint, 97 suites / 1,513 tests, depcruise.

- **Done since checkup 1:** Jot (paper marionette student juggling index cards, `src/ui/mascot/Jot.tsx`,
  drawn in code; `Scrap.tsx` removed, its bitmaps in `assets/paper/scrap-*` are now unused) · first run is
  the light notebook look (`theme: light`, `palette: refined`, `paper: ruled`, pen warm) · clock 138 on Today ·
  teacher's absence count per subject (`settings.teacherAbsent`, Grades → Attendance) · one widget
  (`BoardWidget`, `mg_widget_board`, parts `mg_part_*`, picker preview layout + drawable; **Kotlin not
  compiled locally**) · copy shortened in Settings/About/Alarms/forms/etc. (Haiku) · sounds: 26 of 28 are
  CC0 recordings via Openverse (`scripts/fetch-sounds.mjs`, `assets/sounds/CREDITS.md`), `done` and
  `break-start` are the old files, the synthesiser is deleted; **nobody has listened to the new clips** —
  audition page `output/sounds-audition/index.html` · Obsidian: plugin `obsidian-plugin/margin-bridge`
  (copied into the Bone vault, not enabled), app side `src/services/vaultFiles.ts` (SAF),
  `src/store/vault.ts`, Settings → Obsidian; **the phone half is untested** (needs the device).
- **Not done:** Stats/charts "Margin v2" polish · the Haiku adb test run (no phone on adb all session) ·
  GitSync on the phone: its last push was 2026-11-05 06:12, the token it holds is rejected by GitHub and
  only the owner can issue a new one · Obsidian Git on the desktop pulls every 10 min (owner wants 5; set it
  in the plugin's settings, Obsidian was running so the file was left alone).
- **Evaluated and rejected:** Real SFX (a video-editing skill, licence of its 78 sounds not stated) and
  earshot (Python + torch, ~1.1 GB of models, licence of generated audio unclear).

### 2026-11-11 — checkup 1 (v0.6 "new look", uncommitted on `v2-improvements`)
Owner's list this session (15 asks) is in the order below; **done** = in the working tree, check green
(typecheck, lint, 96 suites / 1,507 tests, depcruise).

- **Done:** paper photo + crumple removed everywhere, texture is a seeded SVG fleck pattern
  (`src/ui/paper-flecks.ts`, `PaperBg.tsx`; `texture` is now `'grain' | 'none'`, old values read as grain) ·
  first page has a drawn sun with glow, turning rays, clouds and a sky that follows the clock
  (`src/ui/collage/Sun.tsx`, `sky.ts`, tokens `SKY`/`SUN`) · onboarding copy cut short, "nice guy" line is
  now "Because I'm generous like that" · display fonts: Fraunces Black (Collage), Syne ExtraBold (Plain) ·
  clock redrawn: kraft bezel, graph-paper dial, pencil hands, today's classes as arcs on the rim
  (`src/ui/clock/faces.ts`, `ClockFace` takes `arcs`) · `/checkup` skill (`.claude/skills/checkup`).
- **Next slice (checkup 2):** new mascot — a paper marionette student on strings who juggles index cards
  (classes, tasks, exams), replacing Scrap, drawn and animated in code (no Rive) · teacher's absence count
  per subject in Attendance (a number the owner types, shown beside the app's own count) · the three
  widgets merged into one, visible in the widget picker · shorter copy in the rest of the app (Haiku agent).
- **After that:** sounds — test Openverse API, Real SFX (clipwing.pro/skills/real-sfx) and earshot
  (github.com/Leonxlnx/earshot) for licence and set-up, keep the best, delete `scripts/synth-sounds.mjs`
  and the current set · "Margin v2" polish pass on Stats/charts and data screens · Obsidian: the Margin
  plugin and task sync are NOT built yet (only `docs/BRIDGE.md` + `src/domain/bridge.ts`), build over the
  vault's git repo · GitSync on the phone reports GitHub no longer accepts its token — diagnose, then
  5-minute auto sync · last: push, GitHub Actions build, Haiku agent tests the APK over adb
  (prompt via the `prompt-master-marginalia` skill).

## Git

- Base commit: `cda830b` (branch `qa/prelaunch`).
- The qa/prelaunch working tree was dirty (302 changed paths: deletions of `qa/**`, root docs; untracked
  new source `src/data/sqliteExpo.web.ts`, `src/data/memoryBoot.ts`, `src/ui/live.ts`, several tests…).
  It was committed as a **snapshot** on `qa/prelaunch` (`7fb440e`, "wip(qa/prelaunch): snapshot of
  working tree before v2-improvements branch") so nothing was lost, and `v2-improvements` was created
  from it. Reverting the snapshot is a normal `git revert`/reset on qa/prelaunch — nothing was deleted.
- `v2-improvements` working tree starts clean. One commit per workstream from here on.

## Model roster (exact IDs from `opencode models`)

| Role | Model ID | Location |
|---|---|---|
| orchestrator | `opencode/deepseek-v4.1-flash-free` | this session |
| builder | `opencode/deepseek-v4.1-flash-free` | `docs/archive/opencode/agents/builder.md` |
| senior-dev-auditor | `opencode/deepseek-v4.1-flash-free` | `docs/archive/opencode/agents/senior-dev-auditor.md` |
| test-writer | `opencode/deepseek-v4.1-flash-free` | `docs/archive/opencode/agents/test-writer.md` |
| vision-critic | `opencode/mimo-v2.6-flash-free` | `docs/archive/opencode/agents/vision-critic.md` |
| user-tester | `opencode/mimo-v2.6-flash-free` | `docs/archive/opencode/agents/user-tester.md` |
| fast-worker | `opencode/deepseek-v4.1-flash-free` (fallback — see below) | `docs/archive/opencode/agents/fast-worker.md` |

Fallback chain (logged here when used): text → `openrouter/deepseek/deepseek-v4.1-flash`; vision →
`openrouter/xiaomi/mimo-v2.6-flash`; fast-worker → DeepSeek builder.
Forbidden per brief: `big-pickle`, `space-bunny`, `nemotron-3.5-super-vl` (and their `-free` aliases).

**Fallbacks used:** `opencode/cat-jam-free` no longer resolves in the model list and
`openrouter/deepseek/deepseek-v4.1-flash` answers `-1017`, so W4's fix slice ran on
`opencode/deepseek-v4.1-flash-free` — the builder model — instead. Vision stayed on MiMo as planned.

## Environment facts

- Web dev server: **`http://localhost:8098`** (session-owned, background). The original plan said 8099;
  the live server and every tool/assert default to 8098.
- A **stale Metro on 8081** from an earlier session exists — deliberately left running/untouched.
- No ADB device attached in this environment; Android/Expo Go behaves unverifiable here by design.
- Evidence logs under `/tmp/opencode/logs/`; screenshots under `.shots/`; reports under `docs/archive/reports/`.

## Skills inventory (per brief: missing skills are named here)

- Installed and available: `impeccable`, `expo-animation`, `expo-overview`, `expo-upgrade`,
  `react-native-best-practices`, `vercel-react-native-skills`, `expo-native-ui`, `expo-tailwind-setup`.
- **Not installed: `emil-design-eng`** (motion/touch interactions) — builders will cover motion with
  `expo-animation` + the project's own motion vocabulary instead.
- No dedicated strict-TypeScript skill installed.

## Task log (who did what)

| # | Task | By | Evidence |
|---|---|---|---|
| 0.1 | Recon reads (package.json, app.json, PRODUCT.md, App.tsx, PaperBg.tsx, data layer, store, Timer, Onboarding) | orchestrator | this session |
| 0.2 | Baseline `npm run check` — typecheck ✓ lint ✓ 46 suites/762 tests ✓ boundaries ✓ | orchestrator | `/tmp/opencode/logs/check-baseline.log` |
| 0.3 | Model roster + 6 project agents created (V2 `docs/archive/opencode/agents/*.md`) | orchestrator | `docs/archive/opencode/agents/` |
| 0.4 | Dirty-tree snapshot + `v2-improvements` branch | orchestrator | commit `7fb440e` |
| 0.5 | Baseline capture script + run (onboarding 1–5, six routes, focus, sheets) | orchestrator | `tools/cap-baseline.mjs`, `.shots/baseline/**` |
| 0.6 | Capture-harness fixes: multi-mounted-screen tap helper, Focus exit path, web "+" entry points; re-capture (focus-running added, settings fixed) | orchestrator | `/tmp/opencode/logs/cap-baseline2.log` |
| 1.1 | Code audit (read-only) | `senior-dev-auditor` (`opencode/deepseek-v4.1-flash-free`) | `docs/archive/reports/audit-code.md` — in flight |
| 1.2 | UX audit on Expo web 412×915 | `user-tester` (`opencode/mimo-v2.6-flash-free`) | `docs/archive/reports/audit-ux.md` — in flight |
| 1.3a | Baseline visual review — attempt 1 | `vision-critic` (`opencode/mimo-v2.6-flash-free`) | **errored**: provider timeout, no output |
| 1.3b | Baseline visual review on fixed `.shots/baseline/` | `vision-critic` (`opencode/mimo-v2.6-flash-free`) | delivered: `docs/archive/reports/vision-baseline.md` (attempt 1 provider timeout; 1.3a retried) |
| 1.4 | **Code-audit triage** (2 critical, 4 high, 8 medium, 4 low): C1/C2→W1 A/B; H1–H3+L1→W1 C; per-screen boundary→W1 D; M2/M4/M5/M6→W1 E; H4→W5 (DECISIONS D4); M1/M3/M8/L3/L4→fast-worker batch after W1; M7/L2→W9; H1-revert→D5(a) | orchestrator | `docs/archive/briefs/W1-foundation.md`, `DECISIONS.md` D4/D5 |
| 1.5 | Housekeeping commit (D3–D5, harness fixes, W1 brief, audit report; `.shots/` ignored) | orchestrator | commit `4f4b865` |
| 2.1 | W1 builder (data safety + error plumbing + perf hygiene) — delivered 5/5 items A–E | `builder` (`opencode/deepseek-v4.1-flash-free`) | brief `docs/archive/briefs/W1-foundation.md`, log `/tmp/opencode/logs/w1-check.log` (49 suites / 784 tests) |
| 2.2 | **W1 gate PASS**: orchestrator re-ran `npm run check` green (49/784, boundaries ✓), spot-checked A–E + boot order (`openRepository` → `init()` → `load()` before the repo is ever exposed; nothing can race the unqueued `init`) | orchestrator | `/tmp/opencode/logs/w1-recheck.log`, commit `46c056b` (27 files, +800/−83) |
| 2.3 | W2 builder dispatched (native grain tiling + status-bar band + `DEVICE_CHECKLIST`) — runs in parallel with 2.4 on disjoint files | `builder` (`opencode/deepseek-v4.1-flash-free`) | brief `docs/archive/briefs/W2-native-visuals.md` — in flight |
| 2.4 | Fast-worker batch dispatched (M1 type holes, M3 export cache leak, M8 nudge.wav promotion, L3 seed parity, L4 curl opt-in) | `fast-worker` (`opencode/cat-jam-free`) | delivered — see 2.5 |
| 2.5 | **Fast-worker batch landed**: M3 (export cache cleanup), M8 (`nudge.wav` promotion + `.gitignore` + count test), L3 (seed parity + round-trip test), L4 (curl opt-in). **M1 skipped per scope rule** (needs call-site edits for dynamic colours) → moved to W9. Gate: orchestrator re-check green (49 suites / 786 tests) | `fast-worker` (`opencode/cat-jam-free`) + orchestrator | log `/tmp/opencode/logs/batch1-recheck.log`, commit `fbdc51a` (9 files) |
| 2.6 | **W2 gate PASS**: investigation-grounded fix (RN `TilePostprocessor` bake for the grain block; RN's alpha-dropped status-bar default for the black band), diff reviewed (web branches byte-identical, RNW `StatusBar` is `return null`), orchestrator re-check green (49/786, then 50/793 with the guard test). **Vision loop waived with rationale** (native-only delta — web captures cannot judge it; `docs/DEVICE_CHECKLIST.md` W2.1–W2.5 are the compensating checks) | `builder` (`opencode/deepseek-v4.1-flash-free`) + `test-writer` (`opencode/deepseek-v4.1-flash-free`) + orchestrator | commit `bd26592`, logs `/tmp/opencode/logs/w2-{check,recheck,final}.log` |
| 2.7 | W3 brief written + builder dispatched (Focus dial: see-through face + taped label + Part-B session row) | orchestrator + `builder` (`opencode/deepseek-v4.1-flash-free`) | `docs/archive/briefs/W3-focus-dial.md` |
| 2.8 | W3 builder round 1 + **vision round 1** (4/4 PASS; three tightening flags — tape/rim graze = worst problem seen) → **builder tightening round** (slip 618/H 38, tape 40/−12, cluster 22; assertions 4–5 measure tape→rim 12.3 and tape→glyph 16.6 canvas units) | `builder` + `vision-critic` (`opencode/mimo-v2.6-flash-free`) | `docs/archive/reports/vision-w3.md` |
| 2.9 | **Vision round 2: all PASS, no new problems.** W3 gate PASS and **committed `31d08d3`** (15 files; check green 50 suites / 802 tests; w3-assert 5/5) | orchestrator | logs `/tmp/opencode/logs/w3-{check2,recheck2,assert}.log` |
| 2.10 | D6 added (dial default vs alternative, both screenshot sets) — awaiting Jossy's number | orchestrator | `DECISIONS.md` D6 |
| 2.11 | **UX audit delivered** (`docs/archive/reports/audit-ux.md` + 84 shots + 21 scripts) — web gate FAIL on UX-1; all findings re-verified at HEAD before routing (triage below) | `user-tester` (`opencode/mimo-v2.6-flash-free`) | `docs/archive/reports/audit-ux.md` |
| 2.12 | **Batch 2** — four verified fixes: FAB returns to web (UX-1; pickaxe: the "desktop surface" was never built), sub-minute toast (UX-2; D2 rule kept), web slider aria+arrows (UX-5), audio first-gesture gate (UX-7). Gate PASS, **committed `20f3d02`** (check green 50/804; uxfix-assert ALL PASS) | `builder` + orchestrator | logs `batch2-{check,recheck,assert}.log`, `tools/uxfix-assert.mjs` |
| 2.13 | D7 added (tour attendance gesture); W4 brief written (`docs/archive/briefs/W4-today-time.md`) — countdown legibility, ranges, 12/24h (D8), midnight tests, UX-4 verify | orchestrator | `DECISIONS.md` D7, `docs/archive/briefs/W4-today-time.md` |
| 2.14 | W4 builder round (one slice, 8 fixes): Today deck — fixed-advance countdown cells, non-today class WINDOW, header through `nextWhen` + h12; Week — axis labels + row clearance; WhenPicker — h12 presets/stepper; `fmtHM` in `time.ts`; Stats `hour12` + `bestFmt`; Settings hints through `fmtHM`; tests `time-format.test.ts` + `when-picker.test.ts` | `builder` (`opencode/deepseek-v4.1-flash-free` — fallback) | `docs/archive/briefs/W4-today-time.md`, `/tmp/opencode/logs/w4-check.log` (52 suites / 829 tests green) |
| 2.15 | **W4 vision round 1** (6 frames): 4 flags — deck-header subtitle clipped (`Period 1 o…`), 12h day-list truncation, Week due rows under the FAB, bare/stale Week axis. Confirmed deliberate, not defects: taped-clock corner overlap; an empty day rendering no deck card | `vision-critic` (session `ses_eb63da1dcffegvwKf9XsQ7eJ9d`) | `docs/archive/reports/vision-w4.md` |
| 2.16 | **Measured before believing the flag**: the pinned live probe (412 px, settle-time inventory) showed the header row had ZERO free space — the suggested `flex: 1` remedy alone was inert (nothing to absorb). The real fix is five pixel trims — clock bearing 14→8, pill-to-subtitle gap 8→6, subtitle 15→14 pt, R-badge padding 6→4 — verified live at 73 px text in a 72.8 px box (DSF 2, unclipped). The budget is written into the `Today.tsx` comments | orchestrator | `/tmp/opencode/logs/w4-probe-{f,h}.log`, `src/screens/Today.tsx` |
| 2.17 | **W4 vision round 2** (10 re-shot frames): all four round-1 flags PASS; one NEW surface failed — the 12h when-picker's lone flipping `AM` chip read as a label, not a control. Fixed in-pass into the sheet's own choice-chip pair (`AM` filled, `PM` outlined) + a source pin; the assert grew `[7h]` (walks into the Settings sub-page for the quiet-hours hint) and `[7j]` (widest header state, `Period 1 of 4`) | `vision-critic` + orchestrator | `docs/archive/reports/vision-w4.md`, `tools/w4-assert.mjs` |
| 2.18 | **W4 gate + vision PASS, committed**: `tools/w4-assert.mjs` ALL PASS (`[7j]`: `Period 1 of 4` 73 px needed / 72.8 px box, unclipped; `[7h]`: `7:00 AM–10:00 PM · quiet 10:00 PM–7:00 AM · weekends normal`); `npm run check` green (52 suites / 830 tests, boundaries clean); vision round 2b re-check of the fixed picker PASS. Committed as the single W4 feat commit this pass | orchestrator | `/tmp/opencode/logs/w4-{recheck6,assert3}.log` |
| 2.19 | **W5 D0 mechanism verdict (STOP, honest)**: timing is already exact-or-honest-window inside `expo-notifications@57.0.21` (`ExpoSchedulingDelegate.kt:105-121` — it takes `setExactAndAllowWhileIdle` when the permission is granted, and never claims a minute it cannot keep); boot re-arm already exists in the module's own `BOOT_COMPLETED` receiver (add nothing); full-screen presentation **absent** (0 matches) and larger than one slice → builder STOPped per brief. **D9 written**: a) honest JS slice (default) / b) small Kotlin hook (~40–60 lines) / c) full local `modules/` stack; `docs/archive/PLAN-v0.3.md` W5 row re-scoped to W5a + pending-D9 W5b | `builder` (`opencode/deepseek-v4.1-flash-free`) + orchestrator | `docs/archive/reports/w5-d0-mechanism.md`, `DECISIONS.md` D9, `docs/archive/PLAN-v0.3.md` |
| 2.20 | **W5a builder slice delivered** (D9-a): manifest `SCHEDULE_EXACT_ALARM` + `USE_FULL_SCREEN_INTENT` (declared now so W5b's grant is reachable; `app.json` mirror synced); timing honesty (`EXACT_ALARM_UNKNOWN`, `inexactWindow`, `nextRingLine` — `Next one rings` gone); D4 `lockText` toggle → `channelConfigs`/`applyLockscreenText`/`readLockscreen` channel read-back, store-wired; dev-build banner (`noModuleNote` — web / permission-unavailable only); h12 bodies via `PlanInput.hour12` + `setSettings` `resync(400)`. Builder gates: 52 suites / 851 tests, boundaries 201, w5-assert 8/8 | `builder` (`opencode/deepseek-v4.1-flash-free`) | `docs/archive/briefs/W5-alarms.md`, `docs/archive/reports/w5a-slice.md`, `/tmp/opencode/logs/w5a-{check,assert}-final.log` |
| 2.21 | **W5a orchestrator re-check green + vision round 1**: `npm run check` 52/851 green, diffs spot-read; vision judged 3 frames — items 1/4 PASS, **2 FAIL**: (2) D4 hint led with the state label `Off:` while the toggle renders ON (self-contradiction); (3) Delivery status opened mid-scroll, first verdict line bisected by the sheet edge (the sheet's `ScrollView` inherits the previous sub-page's scroll — the assert's own toggle tap scrolls ~91 px) | orchestrator + `vision-critic` (session `ses_eb63da1dcffegvwKf9XsQ7eJ9d`) | `.shots/w5/*.png`, `docs/archive/reports/w5a-slice.md` §6 |
| 2.22 | **Both vision FAILs fixed in-pass and re-verified**: (2) hint → state-neutral *"When off, it still rings but the text stays hidden until you unlock"* (pinned in `settings-render.test.ts:346` + assert `[2b]`); (3) `Sheet` gained an optional `scrollKey` that keys its `ScrollView` (default `'s'` — every other sheet caller unchanged) and `SettingsSheet` passes the current page, so each sub-page opens at the top. Assert grew `[4d]`: retained `scrollTop` after nav `[]` + verdict line 78 px clear of the header. Gates re-run: check 52/851 green, **w5-assert 9/9 ALL PASS**, **w4-assert ALL PASS** (shared Sheet regresses nothing), frames re-shoot + inspected | orchestrator | `tools/w5-assert.mjs`, `src/ui/Sheet.tsx`, `src/sheets/Settings.tsx`, `docs/archive/reports/w5a-slice.md` §6 |
| 2.23 | **Owner: "the clock in the home screen — the centre artifacts are not moving, none of them"** → root-caused and rebuilt. Every ornament read `clock.value`, a timestamp written by the dial's `useFrameCallback`; when that loop does not fire the whole centre freezes and nothing else complains (proved on web by `tools/probe-spin.mjs`: page visible, 59.8 fps counted over the same window, hands static at a fixed angle, ornaments static). Ornaments now **drive themselves** — `SpinView` runs one `withRepeat` per layer on the UI runtime, so the frame loop carries the hands only and can no longer kill the centre. Design pass on all five centres: `c` (Celtic Knot) shipped with **no centre motion at all** (pinned as "a static engraving") → the knot turns +9 dps over a −24 dps collet; `g` −6 → −12 dps **plus one accent jewel at a spoke tip**, because a 12-fold figure rotating by its own 30° repeat is geometrically identical every other second and cannot read as turning at *any* speed; `rb` ±12 → ±16. Masthead `CLOCK` 92 → 129 → **115** (owner's squint test, two rounds). Probe after: rb's two lattices MOVING. `npm run check` 52 suites / **854 tests** green, boundaries clean | orchestrator (Jossy reported) | `src/ui/clock/ClockFace.tsx`, `src/ui/clock/faces.ts`, `tools/probe-spin.mjs`, `tools/faces-sheet.mjs`, `tools/face-zoom.mjs`, `src/test/clock-engine.test.ts` §B |
| 2.24 | **v0.3.1 scoped and briefed** (owner: "delegate it, don't build"). Six items taken from the Oct 19–22 vault notes, and what was left out said out loud: semester start **+ end**, bulk JSON import, pre-migration safety copies, install `expo-updates`, fix the per-row sound Play, spiral elapsed ink instead of a rotating dot. Excluded with reasons: notification redesign and permission-at-start (needs a design round), focus rebuild (owner designs it in OpenDesign), widget (native Kotlin), card shuffle, Today header, desktop tease. Two briefs written in the repo's contract style (`docs/archive/briefs/v031-A-data.md`, `-B-surface.md`), each with an explicit exclusions list | orchestrator | `docs/archive/briefs/v031-*.md` |
| 2.25 | **v0.3.1-A delivered** (data): `semesterEnd` in the settings KV (no migration) + pure `domain/semester.ts`; date fields gained the year they never had and the day prints `07`; `domain/importPlan.ts` (both shapes — the app's own `raw` and a compact AI shape, idempotent by derived id, problems instead of throws); `Repository.importSnapshot` in both adapters, one transaction, never deletes; `services/safety.ts` dumps every table before a pending migration and keeps three; one `APP_VERSION`. Builder gate 62 suites / 980 tests | `builder` | `docs/archive/briefs/v031-A-data.md`, this file §2.26 |
| 2.26 | **A re-checked by the orchestrator, then tested in the browser — which found what jest could not**: `npm run check` re-run 62/980 green, no suppressions/deleted tests/new deps, read the boot path (`dumpBeforeMigration` runs before `init()`, swallows its own failure), the parser and both adapters. `tools/v031-assert.mjs` (412×915) then found **1)** the Import preview printed `1 subjects · 1 classes · 1 tasks`, **2)** the date steppers wrapped 2+1 with an orphaned day whose single glyph reads like `?`, and **3)** proved the sample JSON imports, the toast counts 5 rows, the subject lands on Week, the semester survives the write, About prints 0.3.1. Two failures were my own assertions (wrong selector names; matching a static help sentence) — re-run, not reported as app bugs | orchestrator | `tools/v031-assert.mjs`, `.shots/v031/*.png` |
| 2.27 | **A fixes + one defect the tour probe found**: singular/plural map; date fields rebuilt as an intentional two-row form (year alone — three steppers cannot share 360 dp at legible size, measured 156/157/318 px) with the day padded; and turning "No end date" off used to seed the **start day itself**, making a one-day semester that read as a term → `suggestEnd` seeds 15 weeks (`7 Sep → 21 Dec`). Gate 62/**987**, browser 23/23, tour probe 3/3. **Committed `5136499`** | `builder` + orchestrator | `.shots/v031/tour/handover-open.png`, `tools/v031-tour-probe.mjs` |
| 2.28 | **v0.3.1-B delivered** (surface): `expo-updates` with `runtimeVersion` = appVersion, the EAS updates URL, check-on-load, no blocking fallback wait, a channel per profile; `services/ota.ts` total on every path (web/disabled → `unavailable`, throw → `error`, reload only after this session fetched something); Settings → About row; spiral rebuilt as one line whose played part is the same ink at half strength, growing from the outer end inwards; per-row Play now says *why* it is silent instead of discarding the answer | `builder` | `docs/archive/briefs/v031-B-surface.md`, `docs/DEVICE_CHECKLIST.md` §V031 |
| 2.29 | **B re-checked and measured**: `npm run check` 64/1016 green; `tools/v031-spiral-shot.mjs` at shipping size (380×122 row, light+dark) reads 2 paths, ahead full strength, spent `opacity 0.5`, boundary moving with `p`. Two defects then found and fixed: the Look & feel row had **no hint at all** for a catalogue instrument (a `BarKind` lookup cannot name `spiral`), and **three of the eight previews were never warmed** (`done`, `notify`, `tape-peel`) — the likely native reason the Play buttons "do nothing" while they play on web; `PRELOAD` is now derived from `SAMPLE`. A third: the picker's **selected** preview ignored its demo moment and drew the real clock, so every instrument showed the "period over" state — a fully faded spiral the moment you tapped it (`frozen` prop; Today unchanged). Gate 64/**1021**, browser 25/25, spiral 14/14. **Committed `6f5bb63`** | `builder` + orchestrator | `tools/v031-{assert,spiral-shot,tour-probe}.mjs` |
| 1.6 | **Owner answered D1–D5** (D1 a + MiMo for vision; D2 a; D3 a; D4 = b+c: toggle "show reminder text on lock screen", default ON, asked in onboarding; D5 a) → DECISIONS resolved, W5/W8 plan amended | Jossy (owner) + orchestrator | `DECISIONS.md` (Resolved lines), `docs/archive/PLAN-v0.3.md` W5/W8 |
| 1.7 | W2 brief drafted (native grain tiling investigation + status-bar band + DEVICE_CHECKLIST) | orchestrator | `docs/archive/briefs/W2-native-visuals.md` |

## Deviations & notes

1. **`docs/reference/` is missing** (brief said reference screenshots live there; no git history, no
   files anywhere under `~/Documents`). Standing in with self-captured web baselines; DECISIONS D1.
2. The **qa/prelaunch snapshot commit** (above) — his in-flight cleanup is preserved, not judged.
3. Web build runs the in-memory `MemoryRepository` (existing, documented product decision) — refresh
   resets data; all web e2e runs in a single session, and persistence is judged on the native adapter.
4. ~~Web has no global "+" FAB~~ — **fixed in batch 2 `20f3d02`** (audit UX-1): the suppression's
   claimed reason ("a desktop-margin +") exists only in the `UI_desgin` prototype, never in this app
   (pickaxe: the gate was born in a press-timing commit, cdb26e0d). The FAB now renders on every
   surface; the `showFab` gates (sheet open / Focus route / keyboard) are untouched. AddSheet itself
   still → device checklist.
5. **Book navigator keeps all six screens mounted.** A `testID` can match up to 5–6 elements at once;
   hidden screens have no layout box, and page controls can sit below the fold (Tasks' "New task" is
   at y≈1771 on a 915 px viewport). Playwright taps MUST pick the first match with a real box that is
   inside the viewport (see `tools/cap-baseline.mjs` `tap()`), never `.first()` blindly. Any DOM
   assertion (W3 dial, W4 label, W7 stats) must scope to the visible screen too.
6. **Focus hides the nav bar** — leave via `[aria-label="Back to Today"]`; `tab-today` never resolves
   there.
7. Baseline capture round 2 (`.shots/baseline2/` → copied into `.shots/baseline/`): `focus-running.png`
   added; `settings.png` fixed; `task-sheet.png` replaces the never-valid `add-sheet.png` (stale
   duplicate of Focus, deleted). Log: `/tmp/opencode/logs/cap-baseline2.log`.
8. Vision-critic baseline session `ses_ebca00122ffeYDLZPpyjTzBAQk` **errored** ("Timed out waiting for
   response headers" — provider side, before any image read). Re-dispatched after the capture fix.
9. **W1 accepted deviations** (deliberate, documented in code): snake_case columns for `trip`/`alarm`
   (the adapter's spec table derives column names — camelCase DDL would silently mismatch every read/
   write); both new tables carry the housekeeping columns (`updated_at/deleted_at/rev`) because every
   mutation writes them; `mode`/`completed` are `ALTER TABLE` columns, not SPECS fields, until W5/W6
   read them; ScreenBoundary derives its message from thrown state (`componentDidCatch` commits after
   the fallback renders); `guarded()` sets `displayName` for DevTools.
10. **W1 open items for later workstreams**: `sqlite.ts` now imports `ui/crashlog` (a data→ui import;
    boundaries stay green — fold into a cleanup if a later workstream touches it); `pendingOutbox(200)`
    reads the oldest 200 rows while the M4 prune caps the table at 500 — agree the direction when sync
    lands (likely W6); ~~the export path still has no import counterpart~~ — **closed in v0.3.1-A**
   (`domain/importPlan.ts` + `Repository.importSnapshot`, merge-only by design — D11).
11. **W4 header budget — the real story** (replacing the first guess): the deck header row has *zero*
    free space at 412 px, so the `flex: 1` on the group (kept — it absorbs if a larger font or screen
    ever gives any) was inert on its own; the fix is the five measured trims in 2.16. `headPad`'s
    bearing comment in `Today.tsx` records the budget and `card.test.ts` pins the new bearing string, so
    it cannot drift silently. Final live measure: `Period 1 of 4`, fs 14, 73 px text in a 72.8 px box.
12. **12-hour reach, deliberately excluded from W4**: `src/services/export.ts` (the exported text keeps
    the 24-hour clock — W6 owns the export path); reminder/alarm copy in `src/services/reminders.ts` and
    `notifActions.ts`'s `testTarget` (W5's brief covers them — lock-screen text); the Settings minute-edit
    fields keep `HH:MM` as the *typing* format (v1 exclusion — `fmtHM` applies to read-outs, not inputs).
13. **No live frame for Today's `Next up` header line** (`nextWhen` — e.g. `at 9:30 AM · in 5 min`): all
    three capture contexts land in `In class`, picked-day-window, or `No classes` states. Reachable with
    a fourth Date shim between classes (Mon 09:25) if a later pass wants the frame; until then its 12h
    formatting rests on `time-format.test.ts` § 3 (model + source pin).
14. **Vision round 2 findings logged, not fixed (pre-existing, byte-identical in `HEAD`)**: the
    when-picker day-strip cards print the weekday twice on non-first cards (`Tue 20 Tue`) — the top
    slot's month anchor only fires on the first card / the 1st; the rectangular ring seen on the
    `✓ Done` chip is the browser's default focus outline (app-wide focus styling, kept — removing it
    would hurt keyboard use). Both are candidates for a later polish decision.
15. **W4 dispatch stalled on provider quotas** (2026-10-16, 402/429) and was resumed the next day; the
    roster fallbacks above were applied on resume.
16. **W5a's scroll fix touches shared chrome** (`src/ui/Sheet.tsx`): the Delivery-status clipping was a
    `Sheet`-level bug (the `ScrollView` outlives sub-page swaps), so the fix is an optional `scrollKey`
    prop on `Sheet` itself, keyed by the current settings page. Default `'s'` keeps every other sheet
    caller behaviour-identical; `tools/w4-assert.mjs` re-run ALL PASS and the new `[4d]` pin guard it.
17. **W5a's user-tester DOM round was skipped at the owner's request** (session speed — the DeepSeek
    builder rounds were already slow). Its scope (honesty sentence + y-order, D4 toggle round-trip,
    honesty copy, W4 12/24h smoke) is fully covered by `w5-assert` + `w4-assert`, both ALL PASS.
    On-device behaviour stays UNVERIFIED-ON-DEVICE per `docs/archive/reports/w5a-slice.md` §4.
18. **v0.3.1 is code-complete and unbuilt.** The owner builds, so the release artefacts are his to
    make; `docs/DEVICE_CHECKLIST.md` §V031 is the phone pass, and it is the only place any of the
    following is settled: the pre-migration safety copy against a real `user_version`, SQLite import
    atomicity, Android audibility of the preview sounds, and an OTA actually replacing the bundle.
    **An APK without the updater cannot be updated over the air** — v0.3.1 installs the updater, and
    the first build from it is the one that can receive updates. v0.3.2 is where the loop is proved.
19. **Two import rules worth not re-litigating** (D11): the import is **merge-only** — it upserts by
    id and never deletes, so a paste can add a term but cannot wipe one — and it is **paste-only**
    (no file picker, no new dependency), because the source is an AI's answer, which is text.
20. **The spiral's direction is a contract, not a preference.** `p` is the fraction *still to run*
    (`types.ts:41`), so a fresh period is a whole groove and a finished one is entirely spent; the
    spent ink grows from the **outer** end inwards, the way a record plays. A future edit that flips
    either is not a style choice — it inverts what the bar says. D12 records it with the frames.
21. **The sound bug did not reproduce as an audio failure on web** (measured: `done.wav` at volume
    0.9, analyst peak 0.72). The honest conclusion is that the web path was never the failing one;
    what shipped is the reason a failure is now *visible* (the row says "sound is off", "0%", or
    "could not play — tap again") plus the one native-specific cause the code could show: three
    preview sounds were never preloaded, so the first tap on Android could play before the asset was
    decoded. If V031.8 still shows silence on a row above zero, instrument `play()`'s return value on
    the device rather than guessing at layout.
22. **`app.json` is not what ships — the committed `android/` folder is.** Found while auditing the
    release config the owner is about to build (2026-10-23, after B was committed and reported). The
    manifest said `expo.modules.updates.ENABLED=false` with no URL, no runtime version and no channel,
    and `build.gradle` still said `versionName "0.2.0" / versionCode 2` — so the build would have
    installed as the old version, printed the right number in About, passed every test, and never
    updated. Fixed in the native files (+ `expo-channel-name: preview`, since `expo-updates` resolves
    the channel from a request header and EAS Build is not what makes this APK), and
    `src/test/native-config.test.ts` now holds all of it to `app.json`/`eas.json` in `npm run check`.
    The guard was proved by reintroducing the bug (2 red) and reverting (green). Also removed two dead
    SDK-57 keys (`android.splash`, top-level `newArchEnabled` — both inert duplicates, `newArchEnabled`
    lives in `gradle.properties`). `expo-doctor` is 16/21; the remaining five are documented in
    `docs/BUILD_V031.md` with why none blocks the build. Gate 65 suites / **1029** tests.

## UX audit triage (2026-10-16 — report `docs/archive/reports/audit-ux.md`)

Every finding re-verified against current HEAD before routing (the audit ran while W1→W3 landed).

| ID | Sev | Re-verified | Routed to |
|---|---|---|---|
| UX-1 | High | CONFIRMED — no add surface on any web viewport; the "desktop +" was never built | **batch 2 fixed** `20f3d02` |
| UX-2 | Med | CONFIRMED — `store.ts` silent null-sum finish | **batch 2 fixed** (D2 data rule kept; 2 tests) |
| UX-3 | Med | CONFIRMED — tour copy describes the Grades gesture; on Today long-press opens Edit class | W8 (copy) + **D7** |
| UX-4 | Low | **VERIFIED NOT REAL at scroll-end** — the last row sits 113 px above the nav bar (the at-rest "under the bar" position is simply where the scroll starts; `pageBottomPad` covers the end) | **W4 verified; no fix needed** (assert `[5]`) |
| UX-5 | Low | PARTIAL — RNW never maps the RN `accessibilityValue` object (empty attrs, dead arrows) | **batch 2 fixed** (web-only spreads) |
| UX-6 | Low | CONFIRMED but design — horizontal wheel scrolls; plain-wheel/drag doesn't (chip-strip convention) | REPORT note; no code |
| UX-7 | Low | CONFIRMED — expo-audio drops the promise below our call sites, so no call-site catch | **batch 2 fixed** (first-gesture gate) |
| UX-8 | Low | CONFIRMED dev-only upstream warning (RNW SVG) | REPORT note |
| env | — | "live is not defined" / "unknown colour token #FFFBF1" do NOT reproduce at HEAD (moving-tree artifacts; the token text came from audit-code's M1 proposal) | closed |

## v0.6 status (2026-11-11)

Version 0.6.0 / versionCode 5, on `v2-improvements`, pushed and tagged. Gate: typecheck, lint (0 warnings),
1,513 tests, depcruise — green. Plan: `docs/superpowers/plans/2026-11-09-v06-release.md`.

**Released:** tag `v0.6` → `3742689`, https://github.com/jossy-dude/margin/releases/tag/v0.6 with
`margin-v0.6.0-over-android.apk` (debug-signed `over`, like the v0.5 release — installs over v0.5 and keeps
data). Built by Actions run 43013188689, `variant=over` from `v2-improvements` (same commit as the tag).
The tag itself triggered a release-variant run that **failed on purpose**: `ANDROID_KEYSTORE_BASE64` is not
set on the repo, so no release-key build has ever run. Set the four secrets from `docs/RELEASING.md` §1 and
the next `v*` tag will produce a release-key APK unattended. Owner's phone pass `docs/DEVICE_CHECKLIST.md` §V06
is still blank.

Done and committed: attendance as Present / Absent / Cancelled + a why (migration 6, old letters migrate),
the Obsidian bridge foundation (`docs/BRIDGE.md`), start-up (first frame no longer waits for notification
channels or audio; boot timings in Diagnostics and `[margin-boot]` in logcat), three watch faces (Field,
Studio, Diver) replacing the nine, the Plain style (owner chose it from impeccable's directions; Hanken
Grotesk), the Stats sections "Are you showing up?" / "Are you on top of your work?", no Android image fade
(the leading cause of the "glitchy" mascot), Today's class times start-over-end.

Not done yet: watching the first run on the phone (the phone was not connected — another session was using
it) and measuring cold start there; the pager re-rendering all five onboarding pages at the start of a
"Next" scroll is the second suspect for mascot stutter, to be decided from that recording. Owner's phone
pass: `docs/DEVICE_CHECKLIST.md` §V06.

## v0.5 status (2026-11-01)

Done and committed: F2 layering (depcruise `data-not-up`, `services-not-ui`, `ui-not-data` over sheets),
F3 store pins (`src/test/store-*.test.ts`), F4 store split behind `store/store.ts`, F5/F6 essentials
(refused writes revert; `removeMany` cascade; atomic tour hand-over; reset wipes the real database;
notif/outbox writes queued; downgrade guard; safety copy written via `.tmp` + rename and blocking the
migration on failure; one Problems entry per damaged table; Fatal screen *Try again*), F7 (calendar
`addDays` across DST, timer survives the clock moving back, multi-round focus total, period numbering),
F8/F9 lean (pages mount on first visit; To-do draws 60 cards + Show more), D4 core (archive v10 with
notes, day marks, curves and focus; curves reset on roll-over), R1 core (variants `dev|over|release`,
release signing from secrets, manifest trimmed, `docs/RELEASING.md`).

**Builds.** Release APK, `variant=dev`: https://github.com/jossy-dude/margin/actions/runs/41291045240
(artifact `margin-android-apk-dev` → `margin-v0.5.0-dev-android.apk`).

**Not started (next session, in this order):** D1 migration 5 and the variant model, D2 import/export
`margin/2`, D3 import sheet, D4 remainder (archived-term viewer, roll-over range picker, deleting the
settings mirror), D5 OTA on `useUpdates()`, R1 remainder (`ota-publish.yml`, backup rules, About privacy
line), U1 inputs, U2 theme, S1–S7 surfaces and sound, N1 native scaffolding (Rive, margin-native), O1
onboarding with Teddy, N2 notifications/DND, N3 widgets, P1 design pass, Phase 3 review. The owner's
final device test is at the end of `docs/DEVICE_CHECKLIST.md`.

### The collage pass (2026-11-01/02, DECISIONS D13)

Owner direction after installing the v0.5 dev build: a new look, a paper mascot, a calmer Focus, a paper "+"
sheet, a five-page onboarding, more fluid. Done and committed: `09364d8` (palette, texture, type, torn
edges, paper-art generator, Scrap, onboarding, Rive removed), `61de7e7` (Focus rebuilt with ambient rest and
the study log; the "+" desk; torn sheet tops), `258da59` (kraft nav strip, torn denim +, subject papers on
Week, Scrap in empty states). Gate green at each: 88 suites / 1,430 tests, typecheck, lint, depcruise.
Device checks are `docs/DEVICE_CHECKLIST.md` §V05-LOOK. Web dev server for this work: `localhost:8097`
(the older one on 8098 had a stale watcher). Frames: `.shots/{look,ob,focus,add,nav}`.

Still open from this pass: the clock faces' "bit more extra" (waiting for the owner's reference image);
a P1-style polish of the remaining pages in the collage (Grades, Stats, Settings pages) beyond what the
shared kit already changed.

## Earlier next steps (v0.3.x)

- **v0.3.1 closed** (`5136499` + `6f5bb63`, both local — nothing pushed, nothing built). The owner
  builds it when the version he wants is ready, so the next step is his: build `0.3.1`, install it,
  and run `docs/DEVICE_CHECKLIST.md` §V031. That pass is what turns four UNVERIFIED-ON-DEVICE items
  into facts (safety copy, import atomicity, preview audibility, the OTA loop).
- **v0.3.2 "proves itself"** — the OTA loop end to end (publish a preview update, cold start twice,
  data intact), plus the picker's remaining polish and whatever §V031 turns up. **v0.3.3 "feels like an
  app"** (notifications, focus) and **v0.4 "native frontier"** (widget) stay unstarted until the owner
  makes the design calls they need.
- Done: W1 `46c056b`, batch1 `fbdc51a`, W2 `bd26592`, W3 `31d08d3`, batch2 `20f3d02`, W4 `97c1783`,
  W5a (single feat commit — the git log is the hash source). **W5b** (full-screen presentation, ~40–60
  lines Kotlin) is **pending DECISIONS D9** — not started, checklist §W5b marked pending. **W6
  (transport log — `src/services/export.ts` h12 included)** next; then W7 (stats) → W8 (onboarding
  incl. the D4 ask + the D7 copy) → W9 (production readiness, absorbs M7/L2/M1).
- The UX audit is delivered and triaged above; its two environmental one-offs are closed as
  non-reproducing, and UX-4 is verified not real. W8 carries the tour copy (D7).
- Gate per workstream: builder → orchestrator re-check + diffstat → vision loop (UI workstreams,
  max 4) → commit. W2's vision loop is waived (native-only delta) — recorded in the task log.
- W4's vision rounds re-judged the baseline's #4 (countdown numerals — PASS: cells keep their widths
  across digit changes) and the clock/card overlap (deliberate, kept).
- Standing: remind Jossy about the profile-note disputed-claims test (`test-due` 2026-10-15 passed;
  no real outcome recorded yet).
