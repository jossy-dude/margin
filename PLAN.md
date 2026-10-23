# PLAN — Marginalia v2 improvements

**let's make v1 first.** Every workstream ships its smallest complete, switchable slice; anything that
is a product or design fork goes to `DECISIONS.md` as a numbered question with a default already
implemented behind an easy switch.

- Branch: `v2-improvements` (base `7fb440e`, the working-tree snapshot committed onto `qa/prelaunch` first — see STATE.md §Git)
- Date: 2026-10-16 · Orchestrator: `opencode/deepseek-v4.1-flash-free`
- Evidence rule: nothing is "done" without a command output, test result, critic report or DOM-check result on disk.

## Model mapping (exact IDs from `opencode models`)

| Role | Model | Notes |
|---|---|---|
| orchestrator (me), builder, senior-dev-auditor, test-writer | `opencode/deepseek-v4.1-flash-free` | text;
| vision-critic, user-tester | `opencode/mimo-v2.6-flash-free` | image input; never edits source |
| fast-worker | `opencode/cat-jam-free` | mechanical tasks only; may vanish mid-run |

Fallbacks if missing/limited/erroring twice: text → `openrouter/deepseek/deepseek-v4.1-flash`;
vision → `openrouter/xiaomi/mimo-v2.6-flash`; fast-worker → a DeepSeek builder. All fallbacks logged
in STATE.md. Agents live in `.opencode/agents/*.md` (project-level, OpenCode V2 format).

## Phase 0 — Recon (done)

- `npm run check` @ `7fb440e`: typecheck ✓, lint ✓ (0 warnings), 46 suites / 762 tests ✓, boundaries ✓ → `/tmp/opencode/logs/check-baseline.log`
- Web server for Playwright on **8099** (session-owned). Stale Metro on 8081 left untouched. No ADB device attached → all device-only claims will be UNVERIFIED-ON-DEVICE.
- Baseline captures: `node tools/cap-baseline.mjs` → `.shots/baseline/` (onboarding 1–5, six routes, focus, add-sheet, settings).
- **`docs/reference/` does not exist** — no git history, nothing on disk anywhere under `~/Documents`. Self-captured web baselines stand in; D1 in DECISIONS.md.
- Skills inventory: `impeccable` ✓ installed; `emil-design-eng` ✗ not installed (STATE.md); Expo/RN skills ✓ (`expo-animation`, `expo-overview`, `expo-upgrade`, `react-native-best-practices`, `vercel-react-native-skills` under `.agents/skills/`). No dedicated strict-TS skill installed.

## Phase 1 — Audits (running in parallel, read-only on src)

- `senior-dev-auditor` → `reports/audit-code.md`: architecture, dead code, type safety, error handling,
  data-layer integrity/migrations, re-render & perf hotspots, bundle size, local-data privacy. Told to
  read `docs/lag-diagnosis-2026-10-14.md` first and not re-report it.
- `user-tester` → `reports/audit-ux.md`: Expo web 412×915 touch, walks onboarding, add class, add
  assignment, timer, attendance, grades, stats, settings; screenshots into `.shots/ux-audit/`; must say
  exactly where a flow stops.

## Phase 2 — Workstream order and gates

Order per brief: **W1 → W2 → W3 → W4 → W5 → W6 → W7 → W8 → W9**, with real dependencies:
W1's migration (alarm/trip/stats_config + session extension) gates W3/W5/W6/W7 data writes. W2 is
phone-only and can interleave. W8 independent. W9 last. One commit per workstream on `v2-improvements`.

Gate for every workstream: builder implements → I re-run `npm run check` + read diffstat → vision loop
(UI only) → user-tester regression on the affected flow → commit.

## Per-workstream notes / risks

- **W1** — `useNow` already exists as the shared aligned ticker with per-screen, visibility-gated
  cadences, and tests pin its usage strings: W1 verifies + closes gaps, does not rebuild. CrashBoundary
  (boot/runtime) and the Diagnostics sheet already exist: W1 adds typed `AppError`, per-screen
  boundaries, Problems log + copy, removes silent catches. Migration rides `MIGRATIONS` +
  `PRAGMA user_version` (currently one migration); existing data must survive — prove with an old-DB
  fixture test. study_sessions vs existing `focus_session` → DECISIONS D2 (default: extend, don't fork).
- **W2** — `PaperBg.tsx` already ships a native `Image resizeMode="repeat"` path and web CSS tiling;
  the phone screenshots say native still breaks (~360×405 top-left block, black status-bar band). Fix
  by reasoning from RN's real native behaviour (W2 brief forbids blend modes for the new grain);
  UNVERIFIED-ON-DEVICE + `docs/DEVICE_CHECKLIST.md`. `mixBlendMode` on the *photo* texture stays unless
  evidence says otherwise (scope lock).
- **W3** — `src/screens/Focus.tsx` + `src/ui/clock/faces.ts`; the 2026-10-14 redesign is the current
  state. Default per brief: see-through dial face, taped time label below the dial. Deterministic
  assertion: time label bbox entirely outside the dial's central circle AND face opacity < 1. Ship
  default; screenshot both → DECISIONS. Link to work: prefill from task/subject, log session row on
  finish.
- **W4** — `src/screens/Today.tsx` + time math in `src/domain/time.ts`. Live countdown + ranges +
  relative labels + 12/24h device setting + midnight/day-boundary correctness; unit tests for the math.
  Recent commits already touched the countdown slot (43148dc) — check before duplicating work.
- **W5** — `expo-dev-client` already present; `expo-notifications` present but a true alarm needs
  Android-native: `AlarmManager.setAlarmClock`, full-screen ringing screen, boot reschedule, three
  permission flows. Check current Expo/Android docs + library maintenance status before choosing a
  library; if none fits, small local Expo module + config plugin. Math unit tests; grace fallback +
  "needs the development build" banner in Expo Go/web. DeepSeek builders only. **D4 (resolved):
  lock-screen text setting** — toggle "Show reminder text on the lock screen", default ON; OFF →
  channel `lockscreenVisibility: SECRET` on classes + tasks channels; onboarding asks it (W8).
  **(2026-10-17 re-scope after the D0 mechanism check — dossier `reports/w5-d0-mechanism.md`): the
  library already does exact timing + boot re-arm, so W5 ships as W5a (JS-honest: window wording + the
  "won't tell us" state, D4 toggle with channel read-back, dev-build banner, h12 bodies, manifest
  declarations, boot proven not re-added) + W5b (the small native hook for full-screen + permission
  reads), pending `DECISIONS.md` D9.**
- **W6** — trips: start/stop + manual entry, route label; average + last 7 in Stats; average hint in
  the alarm form. New `trip` table comes from W1's migration.
- **W7** — Stats marks chart (axes, value labels, %, points, weighted contribution, trend, goal line,
  "need X on the next test"); study card (per-subject totals, most-studied ranking, week/month toggle);
  Settings setup (metrics, goals/managed, week start, default range, reset, JSON/CSV export); empty
  states explain themselves. DOM assertions for rendered numbers + aggregation unit tests.
- **W8** — `ONBOARDING_PLAN.md` first. Rebuild the five screens minimal: one animated demo, one
  headline, ≤1 supporting line, reduce-motion, replay from Settings (exists). Animation tool: **Reanimated,
  one timeline per screen** — Remotion's player is DOM-based and does not run in React Native, so it is
  not used. (Decision recorded here as required.) **Plus the D4 ask**: the flow asks the lock-screen
  reminder-text question (default ON) and writes it to settings.
- **W9** — mechanical cleanup via fast-worker with pass/fail proof; strict TS, ESLint, `npx expo-doctor`
  clean, minimal Android permissions, `ARCHITECTURE.md`; perf measured where web allows (React Profiler,
  bundle size via `npm run bundle`, query timing), device perf UNVERIFIED-ON-DEVICE. **Absorbs M1**:
  constraining `TxtProps.c` to `keyof Colors` and spec `Field.p` to real entity properties (fast-worker
  skipped it — call sites pass dynamic colour values, so the strict-TS pass fixes them together).

## Out-of-band: v0.3.1 (2026-10-23) — shipped, not built

W1–W5a are the v2 workstream. v0.3.1 is a separate, smaller release cut from the owner's vault notes
(Oct 19–22) and the standing rule: **one shippable slice, exclusions named.** Two commits on
`v2-improvements`, both local — **nothing pushed, tagged, built or published.** The owner builds.

| # | Item | What shipped | Commit |
|---|---|---|---|
| 1 | Semester start **and end** | `semesterEnd` in the settings KV (no migration); pure `domain/semester.ts` (`semesterOf`, `inSemester`, `semesterLabel`, `clampToSemester`, `validRange`, `suggestEnd`); Grades, export, Settings and the tour print the range; date fields gained a year and the day prints `07` | A |
| 2 | Bulk import | `domain/importPlan.ts` accepts the app's own `raw` export or a compact shape an AI produces; idempotent by derived id; problems instead of throws. `Repository.importSnapshot` in both adapters, one transaction, **merge-only** (D11) | A |
| 3 | Persistence hardening | `services/safety.ts` dumps every user table to `Paths.document/marginalia/backups/` before a pending migration runs, keeps three, never blocks boot; Settings can share the newest | A |
| 4 | OTA updater installed | `expo-updates`, `runtimeVersion` = appVersion, updates URL, `ON_LOAD`, `fallbackToCacheTimeout: 0`, channels per profile; `services/ota.ts` total on every path; About row that tells the truth on web (D10) | B |
| 5 | Per-row Play button | Root cause was the button discarding `play()`'s answer; it now says *why* it is silent. Three of the eight previews (`done`, `notify`, `tape-peel`) were never preloaded — `PRELOAD` is now derived from `SAMPLE` | B |
| 6 | Spiral bar | Playhead dot removed: one groove, played part at half strength, growing outer → inner; picker previews the demo moment instead of the wall clock (`frozen`) (D12) | B |

**Explicitly not in v0.3.1** (each is a real v0.3.x item, none is a "forgot"): notification redesign and
the permission-at-start ask (needs a design round, D9 still open on full-screen), the focus-mode rebuild
(owner designs it first), the widget (native Kotlin), card shuffle, the Today header change, desktop
tease, commute tracker, free-time system.

**Gates:** 64 suites / 1021 tests, dependency boundaries clean, 25 browser assertions
(`tools/v031-assert.mjs`), 14 spiral frames at shipping size (`tools/v031-spiral-shot.mjs`), 3 tour
assertions (`tools/v031-tour-probe.mjs`).

**What only the phone can settle:** pre-migration safety copy against a real `user_version`, SQLite
import atomicity, Android audibility of the preview sounds, the OTA loop actually replacing a bundle,
and the spiral at arm's length. `docs/DEVICE_CHECKLIST.md` §V031 is that pass.

**Sequencing fact:** an APK built before the updater existed cannot be updated over the air. v0.3.1
installs the mechanism; **v0.3.2 proves it** — that is the next slice (publish a preview update, cold
start twice, data intact). Then v0.3.3 "feels like an app" (notifications, focus) and v0.4 "native
frontier" (widget), both waiting on owner design calls.

## Risk register

1. Native-only surfaces (grain, alarms, haptics, notifications) cannot run here → reason from docs, mark
   UNVERIFIED-ON-DEVICE, write phone steps. (High)
2. Tests pin source strings (`useNow(…)`, testIDs, "gone for good" identifiers) → refactors must update
   pins *deliberately* with rationale comments, as the 2026-10-14 batch did. (Medium)
3. Web = in-memory repo: refresh resets data; e2e must run in one session; persistence claims must be
   made on the native adapter only. (Medium)
4. `cat-jam-free` may disappear mid-run → mechanical tasks can reassign to DeepSeek. (Low)
5. Stale Metro on 8081 serves old sessions — never kill it; always capture 8099. (Low)
6. Reference screenshots missing → vision-critic runs against self-captured baselines + brief observations. (Medium)
