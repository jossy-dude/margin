# STATE — Marginalia v2 improvements

_Updated: 2026-10-16 (Phase 2: W1 committed `46c056b`, gate green; W2 + fast-worker batch in flight)_

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
| fast-worker | `opencode/cat-jam-free` | `.opencode/agents/fast-worker.md` |

Fallback chain (logged here when used): text → `openrouter/deepseek/deepseek-v4.1-flash`; vision →
`openrouter/xiaomi/mimo-v2.6-flash`; fast-worker → DeepSeek builder.
Forbidden per brief: `big-pickle`, `space-bunny`, `nemotron-3.5-super-vl` (and their `-free` aliases).

**Fallbacks used so far: none.**

## Environment facts

- Web dev server: `expo start --web --port 8099` (session-owned, background, log `/tmp/opencode/logs/expo-web-8099.log`).
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
| 1.6 | **Owner answered D1–D5** (D1 a + MiMo for vision; D2 a; D3 a; D4 = b+c: toggle "show reminder text on lock screen", default ON, asked in onboarding; D5 a) → DECISIONS resolved, W5/W8 plan amended | Jossy (owner) + orchestrator | `DECISIONS.md` (Resolved lines), `PLAN.md` W5/W8 |
| 1.7 | W2 brief drafted (native grain tiling investigation + status-bar band + DEVICE_CHECKLIST) | orchestrator | `briefs/W2-native-visuals.md` |

## Deviations & notes

1. **`docs/reference/` is missing** (brief said reference screenshots live there; no git history, no
   files anywhere under `~/Documents`). Standing in with self-captured web baselines; DECISIONS D1.
2. The **qa/prelaunch snapshot commit** (above) — his in-flight cleanup is preserved, not judged.
3. Web build runs the in-memory `MemoryRepository` (existing, documented product decision) — refresh
   resets data; all web e2e runs in a single session, and persistence is judged on the native adapter.
4. **Web has no global "+" FAB** — `src/ui/Overlay.tsx` deliberately renders `Fab` only when
   `Platform.OS !== 'web'` (the comment references a desktop-margin "+" that exists only in the
   `UI_desgin` prototype, not this app). The `{ t: 'add' }` chooser sheet is therefore unreachable on
   web; captures and e2e use the per-page "+" entries instead (Tasks → "New task", Grades → "Add
   subject"/"Mark", Week → "Class", settings → "Add class/subject"). AddSheet itself → device checklist.
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

## Next

- W1 ✓ committed (`46c056b`). In flight: W2 (native visuals) + fast-worker batch (disjoint files);
  user-tester UX audit + baseline vision review.
- Gate per workstream: builder → orchestrator re-check + diffstat → vision loop (UI workstreams,
  max 4) → user-tester regression → commit.
- Then W3 (focus dial: see-through face + taped label below dial) → W4 (Today countdown/time ranges)
  → W5 (D4 lock-screen toggle + alarms) → W6 (transport log) → W7 (stats) → W8 (onboarding incl. the
  D4 ask) → W9 (production readiness, absorbs M7/L2 **and M1** — the type holes M1 needs call-site
  edits, so it rides with W9's strict-TS pass).
- Standing: remind Jossy about the profile-note disputed-claims test (`test-due` 2026-10-15 passed;
  no real outcome recorded yet).
