# COORDINATION — parallel agent roster, file ownership, and the rules that bind everyone

> Written by the orchestrator before dispatch. Every agent MUST read this file first.
> It exists because seven agents are working in one working tree at the same time. The file
> ownership table is the whole point: if you edit a file you do not own, you will silently
> destroy another agent's work and the tree will not compile.

## 0. The single most important fact

**There is no device.** The Samsung SM-A516N is behind a secure pattern lock that no adb input
can dismiss (`qa/STATE.md`, BUG-031). Two whole agent sessions were lost to this. Do not:

- try to drive the phone, `adb shell input`, uiautomator, mobile-mcp, or wait for a device
- report anything as "verified on device"
- stall waiting for hardware

**How you verify instead:** render and LOOK.

```bash
./qa/scripts/render.sh faces             # all 5 clock faces x light/dark -> /tmp/render/CONTACTSHEET.png
./qa/scripts/render.sh face g light 400  # one face at 400px
./qa/scripts/render.sh svg in.svg out.png 400
./qa/scripts/render.sh html "/home/jossy/Downloads/marginalia-v10(1).html" out.png 411 1400
npx jest src/test/faces.test.ts           # writes /tmp/faces/*.svg for the render script
```

**An assertion in a test is not proof you can see it.** A number can be exactly right and still
look wrong. For anything visual: render it, read the PNG, judge it, iterate. Say in your report
"verified by render" not "verified".

Chrome lives at `/home/jossy/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`. It works
headless with `--screenshot`. No install needed. No network needed.

## 1. Gates

`npm run check` = `typecheck && lint && test && boundaries`. Baseline at dispatch:

```
374 tests / 29 suites, tsc clean, eslint --max-warnings=0, depcruise clean.
```

Run it before you finish. If you break it, you are not done. Do NOT run `npm run bundle`,
`expo-doctor`, or EAS — they are green and slow.

Because seven agents share the tree, `npm run check` may fail from **someone else's**
half-finished file. If that happens: re-run once after ~20s. If it still fails and the error is
in a file you do not own, do NOT fix it — record it in your report and move on. Only your own
regressions are yours.

## 2. File ownership — do not edit outside your row

| Agent | Owns exclusively | Must NOT touch |
|---|---|---|
| **A1 PERF** | `src/navigation/Book.tsx`, `src/navigation/window.ts`, `src/services/fx.ts`, `qa/RESEARCH-PERF.md`, `qa/FIX-PLAN.md` | everything else |
| **A2 BARS** | `src/ui/DayBar.tsx`, new `src/ui/instruments/**`, `src/test/bars.test.ts` | everything else |
| **A3 CLOCK** | `src/ui/clock/**`, `src/screens/Focus.tsx`, `src/test/faces.test.ts` | everything else |
| **A4 ONBOARD** | new `src/screens/Onboarding.tsx`, new `src/ui/onboard/**`, `src/test/onboarding.test.ts`, `src/domain/defaults.ts` | everything else |
| **A5 CARD** | `src/screens/Today.tsx`, `src/ui/RunningTimer.tsx`, `src/test/card.test.ts` | everything else |
| **A6 ANIM** | `src/ui/kit.tsx`, `src/ui/Swipe.tsx`, `src/ui/Sheet.tsx`, `src/ui/Overlay.tsx`, `src/ui/charts.tsx`, `src/sheets/**`, `src/screens/Grades.tsx`, `src/screens/Stats.tsx`, `src/screens/Tasks.tsx`, `src/screens/Week.tsx`, `src/ui/PaperBg.tsx`, `src/services/haptics.ts`, `src/test/animation.test.ts` | everything else |
| **A7 SCAN** | `qa/FINDINGS-UNSTATED.md` only — **reads all of `src/`, writes nothing there** | all of `src/` |

`src/store/store.ts`, `src/tokens/theme.ts`, `src/domain/types.ts`, `src/App.tsx` and
`src/ui/theme-context.tsx` are **shared and unowned**. If you need a change in one of those:

1. Do not make it.
2. Write the exact patch you want, with the code, into your own report and into
   `qa/HANDOFF-<your-agent>.md`.
3. Say plainly in your report "**BLOCKED ON SHARED FILE: store.ts — needs this exact change**".

The orchestrator (and only the orchestrator, or the A8 auditor) applies shared-file changes
serially, after the owning agent has finished. This is how seven agents stay safe.

## 3. The gear scope lock — binding on everyone

The clock's **gear / cog artifact stays exactly as it is.** It is the app's own real-involute
engineering (`src/ui/hand.ts` helper, `gearGeometry`, `toothPath`, `meshPhase`, `SKELETON`,
`prompt.md` N7). The HTML reference's gear is redundant and must NOT be ported, restyled or
"improved".

Specifically banned: editing `src/ui/hand.ts`, the hand-drawn outline system, the gear path
geometry, `meshPhase` phases, or the icon set. **The number, module, tooth count, centre
distances and phasing of the Skeleton Movement train must be byte-identical when you finish.**
A1, A2 and A6 are especially at risk here because gear visual noise can look like a polish
target. It is not. If a finding needs the gear changed, drop the finding and say why.

Also never redesign: overall layout, navigation, typography, the paper texture, the swipe /
crumple card system, the bottom-sheet system, existing copy, information architecture.

## 4. Palette rules

- **Never remove, rename, or alter an existing palette.** Every one that exists today stays
  selectable with its current values.
- Pure black is ADDED as a fourth option and made the default dark.
- Body and caption text must clear **4.5:1**. `src/test/ui.test.ts` encodes refined-palette
  contrast pairs; extend it rather than weakening it.
- A new fourth dark palette changes the pre-first-frame window colour in
  `android/app/src/main/res/values-night/colors.xml` or cold start flashes brown on black. If
  your work touches palettes, note it as a handoff.

## 5. Motion rules

Every animation needs a reason expressed in these terms, not vibes: what state changed, how
long, which easing, why that curve. If you cannot say why, shorten it or delete it.

- **Reduce-motion is a correctness requirement, not a nicety.** `useReduceMotion()` exists.
  Every new animation must collapse to instant or a short fade under it.
- Nothing animates while off-screen. A hidden screen must not burn frames — this is a stated
  project rule (V17).
- No animation may block input. Rapid taps must never leave something half-animated.

## 6. Where the design of record lives

| Thing | Source of truth |
|---|---|
| The app's own visual language | `src/tokens/theme.ts`, `src/ui/kit.tsx`, `src/ui/hand.ts` |
| 22-instrument bar catalogue | `/home/jossy/Downloads/subject-progress-bars-v2(1).html` (read its `<script>`) |
| clock rotation + centre spinning artifacts | `/home/jossy/Downloads/marginalia-v10(1).html` (read its `<script>`) |
| current active-class card on Home | `/home/jossy/Downloads/marginalia-v10(1).html` — **already largely right, minor refinements only** |
| the app's own contract | `prompt.md` (V1–V20, architecture map, risks R1–R12) |
| findings already logged | `qa/BUGS.md` — 32 findings, do not re-derive them |

The HTML files are design references **for the specific parts named above only**. They are not
the design of record for the whole app and the app is not a port of them. If you are unsure
whether something is in scope, it is out of scope.

## 7. Reporting

Each agent ends with a report containing:

1. What changed, per file, with a one-line reason.
2. **What you rendered and looked at** — name the PNG paths.
3. What you could NOT verify and why (no device is a legitimate answer; vagueness is not).
4. Shared-file changes you need, as exact code, under `BLOCKED ON SHARED FILE`.
5. Anything you found that is not yours — write it in your report, do not fix it.

Be honest about confidence. "Uncertain, needs a device" is a useful sentence. A confident claim
you cannot back is worse than useless here.