# QA STATE — Marginalia pre-launch gate

Orchestrator-owned. Read this first, then `BUGS.md`, then `COVERAGE.md`.
Agents: append findings, do not rewrite history. One agent at a time.

## Project facts (established 2026-10-04, Phase 0)

| Fact | Value | Source |
|---|---|---|
| App | Marginalia — hand-drawn school planner, Android-first, offline-first | `README.md` |
| Package | `marginalia` v1.0.0, app id `app.marginalia.planner` | `app.json` |
| Stack | Expo SDK 57, RN 0.86.3, React 19.2, New Arch + React Compiler, TS strict | `package.json` |
| Native deps | expo-sqlite, expo-notifications, expo-audio, expo-haptics, expo-sharing, expo-file-system, expo-keep-awake, reanimated 4.5, gesture-handler, svg, worklets | `package.json` |
| Backend | **None.** Fully local SQLite (`marginalia.db`). No network, no env vars, no `.env` | `src/data/sqliteExpo.ts` |
| Package manager | npm (lockfile v3) | `package-lock.json` |
| Device | Samsung SM-A516N, Android 13 (SDK 33), 1080x2400 @ 420dpi = **411dp wide** | `adb` |
| Connection | USB (`R5CR117MTJJ`) — `adb reverse` used, Wi-Fi never touched | `adb devices -l` |
| Test accounts | None needed — no auth in this app | — |
| Machine gates | `npm run check` (tsc + eslint + 104 jest + depcruise), `npm run bundle` | `package.json` |

**Safety: no backend risk.** There is no server, no API URL and no user data at risk.
All test data is local SQLite and is wiped with `adb shell pm clear <pkg>`.

## Test-target decision (user decision, 2026-10-04)

Two targets, split by what each can actually prove:

- **Expo Go `host.exp.exponent` v57.0.9 — the iteration loop.** Confirmed installed and
  SDK-matched. Changes appear on save with no Gradle build.
- **Standalone release `app.marginalia.planner` v1.0.0 — the sign-off target.**
  Already installed (built 2026-10-04 20:31).

`prompt.md` and `BUILDING.md` both say Expo Go cannot be used for verification or
performance. That is true for a strict subset only, so: **fix and re-verify in Expo Go,
then sign off the items below on a release rebuild.** Anything not covered by a release
build gets reported as unverified rather than passed.

Cannot be signed off in Expo Go (needs standalone release build):
- V5 notification delivery timing, quiet hours, during-class deferral
- V6 custom notification sounds (impossible in Expo Go)
- V7 haptics quality (different native path)
- V17 performance numbers (dev bundle is unminified, not Hermes bytecode)

## Device baseline — MUST be restored after any agent that changes these

Captured before first test run. `qa/scripts/adb.sh state` re-reads them.

```
font_scale=1.0
night=yes
size=Physical size: 1080x2400
density=Physical density: 420
rotation=0
accelerometer_rotation=0
a11y_services=com.viscouspot.gitsync/...GitSyncAccessibilityService   (TalkBack OFF)
```

Restore commands:
```bash
adb shell settings put system font_scale 1.0
adb shell cmd uimode night yes
adb shell wm size reset
adb shell wm density reset
adb shell settings put system user_rotation 0
adb shell settings put system accelerometer_rotation 0
```

## Iteration log

### Pass 1 — in progress
- **Scope:** V1 boot, V2 fonts/layout, V3 page transition, V8 attendance grid,
  V9 add flow + data logic. Highest-risk, highest-value slice (per `prompt.md` R1).
- Phase 0 (infra) complete: git baseline `47339a5` on branch `qa/prelaunch`,
  device verified, `qa/scripts/adb.sh` + `uiparse.py` written and working.

## QA-support device settings (restore at gate end)

```
svc power stayon true        # screen must not sleep mid-test; device is USB-plugged
```

Without this the keyguard engages during long agent runs and blocks all input.
Restore with `adb shell svc power stayon false`.

## Harness traps found 2026-10-04 (fixed in qa/scripts/adb.sh — do not reintroduce)

1. **RN ignores swipes under ~800ms.** The default 300ms swipe was a silent no-op and
   nearly produced a false "the list does not scroll" bug. Default is now 800ms
   (`SWIPE_MS` to override).
2. **`uiautomator dump` exits 0 even when it prints "could not get idle state",** leaving the
   PREVIOUS xml in place. It once handed an agent the Expo Go home-screen tree while the app
   was foreground, i.e. a stale screen silently reported as the app. `adb.sh` now detects the
   condition, retries 3x, and fails loudly rather than returning a phantom UI.
3. **`adb shell input keyevent 26` is a toggle, not a wake** — it will put the phone to sleep
   and then behind the keyguard. Use `./qa/scripts/adb.sh awake` / `locked` / `unlock`.
4. **Always cold-restart before judging.** Fast refresh emits a spurious
   `ReferenceError: Property 'dark' doesn't exist` plus ~90 bogus
   `"undefined" is not a valid color` warnings that do not occur in a real cold boot.
5. **Never report status-bar / edge-to-edge findings from Expo Go** — Expo Go owns that
   window. See BUG-004.

## Next action

1. Confirm `npm run check` and `npm run bundle` exit 0 on **Node 24** (project was
   last green on Node 22.22 — deviation to watch).
2. Start Metro, launch Expo Go, confirm V1: no red screen, seeded Today renders.
3. Dispatch STATIC AUDITOR, then FRESH-USER, then DATA (tasks), then
   INTERACTION SWEEPER and UI/VISUAL for the pass-1 screens.