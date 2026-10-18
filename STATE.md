# STATE — Marginalia v2 improvements

_Updated: 2026-10-17 (W1–W4 + batch 2 committed — W4 = `97c1783`; **W5a "alarms honesty + D4 toggle"
closed** — gate green, assert 9/9 ALL PASS, vision round 1 findings both fixed & re-verified; W5b
full-screen pending D9 answer; **W6 (transport log) next**)_

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
| builder | `opencode/deepseek-v4.1-flash-free` | `.opencode/agents/builder.md` |
| senior-dev-auditor | `opencode/deepseek-v4.1-flash-free` | `.opencode/agents/senior-dev-auditor.md` |
| test-writer | `opencode/deepseek-v4.1-flash-free` | `.opencode/agents/test-writer.md` |
| vision-critic | `opencode/mimo-v2.6-flash-free` | `.opencode/agents/vision-critic.md` |
| user-tester | `opencode/mimo-v2.6-flash-free` | `.opencode/agents/user-tester.md` |
| fast-worker | `opencode/deepseek-v4.1-flash-free` (fallback — see below) | `.opencode/agents/fast-worker.md` |

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
- Evidence logs under `/tmp/opencode/logs/`; screenshots under `.shots/`; reports under `reports/`.

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
| 0.3 | Model roster + 6 project agents created (V2 `.opencode/agents/*.md`) | orchestrator | `.opencode/agents/` |
| 0.4 | Dirty-tree snapshot + `v2-improvements` branch | orchestrator | commit `7fb440e` |
| 0.5 | Baseline capture script + run (onboarding 1–5, six routes, focus, sheets) | orchestrator | `tools/cap-baseline.mjs`, `.shots/baseline/**` |
| 0.6 | Capture-harness fixes: multi-mounted-screen tap helper, Focus exit path, web "+" entry points; re-capture (focus-running added, settings fixed) | orchestrator | `/tmp/opencode/logs/cap-baseline2.log` |
| 1.1 | Code audit (read-only) | `senior-dev-auditor` (`opencode/deepseek-v4.1-flash-free`) | `reports/audit-code.md` — in flight |
| 1.2 | UX audit on Expo web 412×915 | `user-tester` (`opencode/mimo-v2.6-flash-free`) | `reports/audit-ux.md` — in flight |
| 1.3a | Baseline visual review — attempt 1 | `vision-critic` (`opencode/mimo-v2.6-flash-free`) | **errored**: provider timeout, no output |
| 1.3b | Baseline visual review on fixed `.shots/baseline/` | `vision-critic` (`opencode/mimo-v2.6-flash-free`) | delivered: `reports/vision-baseline.md` (attempt 1 provider timeout; 1.3a retried) |
| 1.4 | **Code-audit triage** (2 critical, 4 high, 8 medium, 4 low): C1/C2→W1 A/B; H1–H3+L1→W1 C; per-screen boundary→W1 D; M2/M4/M5/M6→W1 E; H4→W5 (DECISIONS D4); M1/M3/M8/L3/L4→fast-worker batch after W1; M7/L2→W9; H1-revert→D5(a) | orchestrator | `briefs/W1-foundation.md`, `DECISIONS.md` D4/D5 |
| 1.5 | Housekeeping commit (D3–D5, harness fixes, W1 brief, audit report; `.shots/` ignored) | orchestrator | commit `4f4b865` |
| 2.1 | W1 builder (data safety + error plumbing + perf hygiene) — delivered 5/5 items A–E | `builder` (`opencode/deepseek-v4.1-flash-free`) | brief `briefs/W1-foundation.md`, log `/tmp/opencode/logs/w1-check.log` (49 suites / 784 tests) |
| 2.2 | **W1 gate PASS**: orchestrator re-ran `npm run check` green (49/784, boundaries ✓), spot-checked A–E + boot order (`openRepository` → `init()` → `load()` before the repo is ever exposed; nothing can race the unqueued `init`) | orchestrator | `/tmp/opencode/logs/w1-recheck.log`, commit `46c056b` (27 files, +800/−83) |
| 2.3 | W2 builder dispatched (native grain tiling + status-bar band + `DEVICE_CHECKLIST`) — runs in parallel with 2.4 on disjoint files | `builder` (`opencode/deepseek-v4.1-flash-free`) | brief `briefs/W2-native-visuals.md` — in flight |
| 2.4 | Fast-worker batch dispatched (M1 type holes, M3 export cache leak, M8 nudge.wav promotion, L3 seed parity, L4 curl opt-in) | `fast-worker` (`opencode/cat-jam-free`) | delivered — see 2.5 |
| 2.5 | **Fast-worker batch landed**: M3 (export cache cleanup), M8 (`nudge.wav` promotion + `.gitignore` + count test), L3 (seed parity + round-trip test), L4 (curl opt-in). **M1 skipped per scope rule** (needs call-site edits for dynamic colours) → moved to W9. Gate: orchestrator re-check green (49 suites / 786 tests) | `fast-worker` (`opencode/cat-jam-free`) + orchestrator | log `/tmp/opencode/logs/batch1-recheck.log`, commit `fbdc51a` (9 files) |
| 2.6 | **W2 gate PASS**: investigation-grounded fix (RN `TilePostprocessor` bake for the grain block; RN's alpha-dropped status-bar default for the black band), diff reviewed (web branches byte-identical, RNW `StatusBar` is `return null`), orchestrator re-check green (49/786, then 50/793 with the guard test). **Vision loop waived with rationale** (native-only delta — web captures cannot judge it; `docs/DEVICE_CHECKLIST.md` W2.1–W2.5 are the compensating checks) | `builder` (`opencode/deepseek-v4.1-flash-free`) + `test-writer` (`opencode/deepseek-v4.1-flash-free`) + orchestrator | commit `bd26592`, logs `/tmp/opencode/logs/w2-{check,recheck,final}.log` |
| 2.7 | W3 brief written + builder dispatched (Focus dial: see-through face + taped label + Part-B session row) | orchestrator + `builder` (`opencode/deepseek-v4.1-flash-free`) | `briefs/W3-focus-dial.md` |
| 2.8 | W3 builder round 1 + **vision round 1** (4/4 PASS; three tightening flags — tape/rim graze = worst problem seen) → **builder tightening round** (slip 618/H 38, tape 40/−12, cluster 22; assertions 4–5 measure tape→rim 12.3 and tape→glyph 16.6 canvas units) | `builder` + `vision-critic` (`opencode/mimo-v2.6-flash-free`) | `reports/vision-w3.md` |
| 2.9 | **Vision round 2: all PASS, no new problems.** W3 gate PASS and **committed `31d08d3`** (15 files; check green 50 suites / 802 tests; w3-assert 5/5) | orchestrator | logs `/tmp/opencode/logs/w3-{check2,recheck2,assert}.log` |
| 2.10 | D6 added (dial default vs alternative, both screenshot sets) — awaiting Jossy's number | orchestrator | `DECISIONS.md` D6 |
| 2.11 | **UX audit delivered** (`reports/audit-ux.md` + 84 shots + 21 scripts) — web gate FAIL on UX-1; all findings re-verified at HEAD before routing (triage below) | `user-tester` (`opencode/mimo-v2.6-flash-free`) | `reports/audit-ux.md` |
| 2.12 | **Batch 2** — four verified fixes: FAB returns to web (UX-1; pickaxe: the "desktop surface" was never built), sub-minute toast (UX-2; D2 rule kept), web slider aria+arrows (UX-5), audio first-gesture gate (UX-7). Gate PASS, **committed `20f3d02`** (check green 50/804; uxfix-assert ALL PASS) | `builder` + orchestrator | logs `batch2-{check,recheck,assert}.log`, `tools/uxfix-assert.mjs` |
| 2.13 | D7 added (tour attendance gesture); W4 brief written (`briefs/W4-today-time.md`) — countdown legibility, ranges, 12/24h (D8), midnight tests, UX-4 verify | orchestrator | `DECISIONS.md` D7, `briefs/W4-today-time.md` |
| 2.14 | W4 builder round (one slice, 8 fixes): Today deck — fixed-advance countdown cells, non-today class WINDOW, header through `nextWhen` + h12; Week — axis labels + row clearance; WhenPicker — h12 presets/stepper; `fmtHM` in `time.ts`; Stats `hour12` + `bestFmt`; Settings hints through `fmtHM`; tests `time-format.test.ts` + `when-picker.test.ts` | `builder` (`opencode/deepseek-v4.1-flash-free` — fallback) | `briefs/W4-today-time.md`, `/tmp/opencode/logs/w4-check.log` (52 suites / 829 tests green) |
| 2.15 | **W4 vision round 1** (6 frames): 4 flags — deck-header subtitle clipped (`Period 1 o…`), 12h day-list truncation, Week due rows under the FAB, bare/stale Week axis. Confirmed deliberate, not defects: taped-clock corner overlap; an empty day rendering no deck card | `vision-critic` (session `ses_eb63da1dcffegvwKf9XsQ7eJ9d`) | `reports/vision-w4.md` |
| 2.16 | **Measured before believing the flag**: the pinned live probe (412 px, settle-time inventory) showed the header row had ZERO free space — the suggested `flex: 1` remedy alone was inert (nothing to absorb). The real fix is five pixel trims — clock bearing 14→8, pill-to-subtitle gap 8→6, subtitle 15→14 pt, R-badge padding 6→4 — verified live at 73 px text in a 72.8 px box (DSF 2, unclipped). The budget is written into the `Today.tsx` comments | orchestrator | `/tmp/opencode/logs/w4-probe-{f,h}.log`, `src/screens/Today.tsx` |
| 2.17 | **W4 vision round 2** (10 re-shot frames): all four round-1 flags PASS; one NEW surface failed — the 12h when-picker's lone flipping `AM` chip read as a label, not a control. Fixed in-pass into the sheet's own choice-chip pair (`AM` filled, `PM` outlined) + a source pin; the assert grew `[7h]` (walks into the Settings sub-page for the quiet-hours hint) and `[7j]` (widest header state, `Period 1 of 4`) | `vision-critic` + orchestrator | `reports/vision-w4.md`, `tools/w4-assert.mjs` |
| 2.18 | **W4 gate + vision PASS, committed**: `tools/w4-assert.mjs` ALL PASS (`[7j]`: `Period 1 of 4` 73 px needed / 72.8 px box, unclipped; `[7h]`: `7:00 AM–10:00 PM · quiet 10:00 PM–7:00 AM · weekends normal`); `npm run check` green (52 suites / 830 tests, boundaries clean); vision round 2b re-check of the fixed picker PASS. Committed as the single W4 feat commit this pass | orchestrator | `/tmp/opencode/logs/w4-{recheck6,assert3}.log` |
| 2.19 | **W5 D0 mechanism verdict (STOP, honest)**: timing is already exact-or-honest-window inside `expo-notifications@57.0.21` (`ExpoSchedulingDelegate.kt:105-121` — it takes `setExactAndAllowWhileIdle` when the permission is granted, and never claims a minute it cannot keep); boot re-arm already exists in the module's own `BOOT_COMPLETED` receiver (add nothing); full-screen presentation **absent** (0 matches) and larger than one slice → builder STOPped per brief. **D9 written**: a) honest JS slice (default) / b) small Kotlin hook (~40–60 lines) / c) full local `modules/` stack; `PLAN.md` W5 row re-scoped to W5a + pending-D9 W5b | `builder` (`opencode/deepseek-v4.1-flash-free`) + orchestrator | `reports/w5-d0-mechanism.md`, `DECISIONS.md` D9, `PLAN.md` |
| 2.20 | **W5a builder slice delivered** (D9-a): manifest `SCHEDULE_EXACT_ALARM` + `USE_FULL_SCREEN_INTENT` (declared now so W5b's grant is reachable; `app.json` mirror synced); timing honesty (`EXACT_ALARM_UNKNOWN`, `inexactWindow`, `nextRingLine` — `Next one rings` gone); D4 `lockText` toggle → `channelConfigs`/`applyLockscreenText`/`readLockscreen` channel read-back, store-wired; dev-build banner (`noModuleNote` — web / permission-unavailable only); h12 bodies via `PlanInput.hour12` + `setSettings` `resync(400)`. Builder gates: 52 suites / 851 tests, boundaries 201, w5-assert 8/8 | `builder` (`opencode/deepseek-v4.1-flash-free`) | `briefs/W5-alarms.md`, `reports/w5a-slice.md`, `/tmp/opencode/logs/w5a-{check,assert}-final.log` |
| 2.21 | **W5a orchestrator re-check green + vision round 1**: `npm run check` 52/851 green, diffs spot-read; vision judged 3 frames — items 1/4 PASS, **2 FAIL**: (2) D4 hint led with the state label `Off:` while the toggle renders ON (self-contradiction); (3) Delivery status opened mid-scroll, first verdict line bisected by the sheet edge (the sheet's `ScrollView` inherits the previous sub-page's scroll — the assert's own toggle tap scrolls ~91 px) | orchestrator + `vision-critic` (session `ses_eb63da1dcffegvwKf9XsQ7eJ9d`) | `.shots/w5/*.png`, `reports/w5a-slice.md` §6 |
| 2.22 | **Both vision FAILs fixed in-pass and re-verified**: (2) hint → state-neutral *"When off, it still rings but the text stays hidden until you unlock"* (pinned in `settings-render.test.ts:346` + assert `[2b]`); (3) `Sheet` gained an optional `scrollKey` that keys its `ScrollView` (default `'s'` — every other sheet caller unchanged) and `SettingsSheet` passes the current page, so each sub-page opens at the top. Assert grew `[4d]`: retained `scrollTop` after nav `[]` + verdict line 78 px clear of the header. Gates re-run: check 52/851 green, **w5-assert 9/9 ALL PASS**, **w4-assert ALL PASS** (shared Sheet regresses nothing), frames re-shoot + inspected | orchestrator | `tools/w5-assert.mjs`, `src/ui/Sheet.tsx`, `src/sheets/Settings.tsx`, `reports/w5a-slice.md` §6 |
| 2.23 | **Owner: "the clock in the home screen — the centre artifacts are not moving, none of them"** → root-caused and rebuilt. Every ornament read `clock.value`, a timestamp written by the dial's `useFrameCallback`; when that loop does not fire the whole centre freezes and nothing else complains (proved on web by `tools/probe-spin.mjs`: page visible, 59.8 fps counted over the same window, hands static at a fixed angle, ornaments static). Ornaments now **drive themselves** — `SpinView` runs one `withRepeat` per layer on the UI runtime, so the frame loop carries the hands only and can no longer kill the centre. Design pass on all five centres: `c` (Celtic Knot) shipped with **no centre motion at all** (pinned as "a static engraving") → the knot turns +9 dps over a −24 dps collet; `g` −6 → −12 dps **plus one accent jewel at a spoke tip**, because a 12-fold figure rotating by its own 30° repeat is geometrically identical every other second and cannot read as turning at *any* speed; `rb` ±12 → ±16. Masthead `CLOCK` 92 → 129 → **115** (owner's squint test, two rounds). Probe after: rb's two lattices MOVING. `npm run check` 52 suites / **854 tests** green, boundaries clean | orchestrator (Jossy reported) | `src/ui/clock/ClockFace.tsx`, `src/ui/clock/faces.ts`, `tools/probe-spin.mjs`, `tools/faces-sheet.mjs`, `tools/face-zoom.mjs`, `src/test/clock-engine.test.ts` §B |
| 1.6 | **Owner answered D1–D5** (D1 a + MiMo for vision; D2 a; D3 a; D4 = b+c: toggle "show reminder text on lock screen", default ON, asked in onboarding; D5 a) → DECISIONS resolved, W5/W8 plan amended | Jossy (owner) + orchestrator | `DECISIONS.md` (Resolved lines), `PLAN.md` W5/W8 |
| 1.7 | W2 brief drafted (native grain tiling investigation + status-bar band + DEVICE_CHECKLIST) | orchestrator | `briefs/W2-native-visuals.md` |

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
    lands (likely W6); the export path still has no import counterpart (pre-existing).
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
    On-device behaviour stays UNVERIFIED-ON-DEVICE per `reports/w5a-slice.md` §4.

## UX audit triage (2026-10-16 — report `reports/audit-ux.md`)

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

## Next

- Done: W1 `46c056b`, batch1 `fbdc51a`, W2 `bd26592`, W3 `31d08d3`, batch2 `20f3d02`, W4 `97c1783`,
  **W5a committed this pass** (single feat commit — the git log is the hash source; a commit cannot
  know its own). **W5b** (full-screen presentation, ~40–60 lines Kotlin) is **pending DECISIONS D9**
  — not started, checklist §W5b marked pending. **W6 (transport log — `src/services/export.ts` h12
  included)** next; then W7 (stats) → W8 (onboarding incl. the D4 ask + the D7 copy) → W9 (production
  readiness, absorbs M7/L2/M1).
- The UX audit is delivered and triaged above; its two environmental one-offs are closed as
  non-reproducing, and UX-4 is verified not real. W8 carries the tour copy (D7).
- Gate per workstream: builder → orchestrator re-check + diffstat → vision loop (UI workstreams,
  max 4) → commit. W2's vision loop is waived (native-only delta) — recorded in the task log.
- W4's vision rounds re-judged the baseline's #4 (countdown numerals — PASS: cells keep their widths
  across digit changes) and the clock/card overlap (deliberate, kept).
- Standing: remind Jossy about the profile-note disputed-claims test (`test-due` 2026-10-15 passed;
  no real outcome recorded yet).
