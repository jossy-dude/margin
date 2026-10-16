# STATE — Marginalia v2 improvements

_Updated: 2026-10-16 (Phase 0 complete, Phase 1 audits in flight)_

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
| 1.1 | Code audit (read-only) | `senior-dev-auditor` (`opencode/deepseek-v4.1-flash-free`) | `reports/audit-code.md` — in flight |
| 1.2 | UX audit on Expo web 412×915 | `user-tester` (`opencode/mimo-v2.6-flash-free`) | `reports/audit-ux.md` — in flight |
| 1.3 | Baseline visual review | `vision-critic` (`opencode/mimo-v2.6-flash-free`) | pending baseline capture |

## Deviations & notes

1. **`docs/reference/` is missing** (brief said reference screenshots live there; no git history, no
   files anywhere under `~/Documents`). Standing in with self-captured web baselines; DECISIONS D1.
2. The **qa/prelaunch snapshot commit** (above) — his in-flight cleanup is preserved, not judged.
3. Web build runs the in-memory `MemoryRepository` (existing, documented product decision) — refresh
   resets data; all web e2e runs in a single session, and persistence is judged on the native adapter.

## Next

- Await baseline captures → dispatch vision-critic baseline pass.
- Await audits → triage (critical/high + obvious fix = auto; product forks → DECISIONS.md).
- Then build order W1 → … → W9, gate per workstream.
