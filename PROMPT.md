# PROMPT.md — Marginalia: design-parity fix, measured UX audit, implementation plan

> **How to use this file.** Paste everything inside the fence into a fresh session with your target
> agent. It is self-contained. After they implement, paste it again to get the verification pass.
> Reference HTML design: `/home/jossy/Downloads/marginalia-v10(1).html`

```text
ROLE
You are a senior React Native / Expo engineer AND the product owner's design reviewer, running the
final pre-launch pass on "Marginalia" — a hand-drawn, offline-first Android school planner.
Expo SDK 57, React Native 0.86, React 19.2, New Architecture + React Compiler, TypeScript strict,
local SQLite, no backend, no network, Android-first.

Repo:        /home/jossy/Documents/Projects/School_planner_v2   (git branch `qa/prelaunch`)
Device:      Samsung SM-A516N "Sefenit's A51", Android 13, 1080x2400 @420dpi = 411 dp, USB
mobile-mcp:  device id R5CR117MTJJ (authenticated, online)
Reference:   /home/jossy/Downloads/marginalia-v10(1).html  ← the owner's design of record

In the FIRST pass you audit, measure and plan, then STOP. The owner implements. In the SECOND pass
(after they implement) you verify and re-audit. Both passes are described below.

════════════════════════════════════════════════════════════════════════
PART 0 — READ FIRST, AND WHAT IS ALREADY KNOWN
════════════════════════════════════════════════════════════════════════
Read in this order:
1. qa/STATE.md         project facts, device baseline, and the "Harness traps" section (critical)
2. qa/BUGS.md          ~33 findings already logged. Do not duplicate. Read the FIXED ones so you
                       do not re-report work already done.
3. qa/COVERAGE.md      screen × element matrix you will fill
4. qa/DATA_LEDGER.md   seeded baseline + the QA_ naming rule
5. qa/DESIGN-PARITY.md the measured gap between the HTML reference and the app
6. prompt.md           the project's own V1–V20 plan and architecture map
7. STATE.md at REPO ROOT — prior decisions and the deviation ledger. Read, never edit.

Already established — do NOT re-derive, and do NOT re-run:
- `npm run check` exits 0: tsc clean, eslint 0 warnings, **313 jest tests / 29 suites**, depcruise clean.
- `npm run bundle` exits 0: 3.8 MB Hermes bytecode. Test count history: 82→104→111→148→209→254→313.
- Node here is v24.16.0 (docs say 22.22; gates pass regardless).
- The app seeds demo data on first run. Settings → Clear demo history does NOT reach an empty DB
  (it removes demo *history* only; open tasks, subjects, timetable, notes remain). A true empty
  database is not reachable in-app — that is a known open question, not a bug to rediscover.
- ALL status-bar / system-bar / edge-to-edge judgements are INVALID in Expo Go — Expo Go owns that
  window and the app cannot control it. Verified: Expo Go shows a pure-black status band while the
  standalone release build shows its own theme colour. Do not report system-bar findings.
- No Android SDK on this machine (ANDROID_HOME unset). Local Gradle/APK builds CANNOT run here.
  Release-build validation happens via EAS cloud.

════════════════════════════════════════════════════════════════════════
PART 1 — THE SIX REPORTED PROBLEMS (owner-reported; confirm, don't assume)
════════════════════════════════════════════════════════════════════════
For each: return CONFIRMED / REFUTED / PARTIAL with a screenshot and the actual mechanism in code.
Do not take the owner's description as the diagnosis — several have a different root cause.

**P1 — The active-class progress card looks like "just a bar chart".**
  Measured: `src/ui/DayBar.tsx:11` defines FOUR kinds — `spines` ("Bookshelf", one spine per class,
  the current one fills), `glass`, `trace`, `ticker`. The default renders four vertical bars, which
  is exactly the "bar chart" impression. The HTML reference ships SEVEN kinds:
  `spines, spiral, sight, ticker, sieve, wave, join`. `spiral`, `sieve` and `join` do not exist in
  the app at all. Confirm which kind is active by default and judge the set as a designer would.

**P2 — The second hand "looks grey, isn't visible, only the centre shows".**
  Measured: `src/ui/clock/faces.ts:159` draws the second hand in `pal.accent`, which in the default
  dark palette is `#E0A47A` — a pale peach that reads as grey against the dial and is nearly the
  same value as the minute hand. `prompt.md` V4 specifies a RED-BROWN second hand. The hand path is
  `M0 18V-${L}`, so only ~L units reach past the centre before it thins out. Diagnose properly:
  is it a colour problem, a length problem, or both?

**P3 — The hands / centre artifact do not visibly rotate.**
  The reference drives rotation on rAF with sub-second precision:
  `pose(s,h,mi,sec)` where `sec = getSeconds() + getMilliseconds()/1000`, and rotates the centre
  spinning artifact separately via `.sp` elements, each with its own `data-v` velocity, as
  `translate(x y) rotate(t*v % 360)`. Verify against wall-clock over ≥60s with screenshots at t0 and
  t+60. Distinguish "not rotating" from "rotating but not visible" — these need different fixes.
  The app uses ONE `useFrameCallback` on the UI thread (`src/ui/clock/ClockFace.tsx`); establish
  whether it is actually firing, and whether second-hand rotation is smooth or stepped.

**P4 — Page transitions feel slow ("about half a second"), worst on To-do.**
  Measured: `src/navigation/Book.tsx:24` runs `withTiming(1, { duration: 520, easing:
  Easing.bezier(0.2,0.9,0.25,1) })` with `translateY -70 → 0`, `translateX 38 → 0`, `rotate
  4.5deg → 0`, `scale 1.045 → 1`. So 520ms of motion on every tab tap. MEASURE the real per-tab
  transition time in ms (method in Part 2) and recommend a target duration and easing curve.
  The owner's position: a page being placed on a desk should feel placed, not waited for.

**P5 — The Focus background is dimmed too much.**
  Measured: `src/screens/Focus.tsx:161` lays `c.desk` at `opacity: 0.62` over the scrapbook photo,
  and there is a second animated wash at `0.42` (`Focus.tsx:56`). `c.desk` in dark is `#1F1B16`,
  so 62% of a near-black over the photo crushes it. Quantify the current effective luminance and
  propose a target that keeps text legible while letting the photo read.

**P6 — The Focus centre dial lacks the clock-face artwork.**
  The five selectable faces (Guilloché Ivory, Rosette Blanc, Celtic Knot, Scales and Lily,
  Skeleton Movement) are available in Settings → Look & feel → Clock face and render on Today, but
  the Focus centre does not carry that artwork. Confirm exactly what is drawn there now, then
  propose how to bring the selected face's centre artifact into Focus — including the rotating
  centre element, which is the part the owner specifically wants.

════════════════════════════════════════════════════════════════════════
PART 2 — NEW WORK: CLOCK MOTION, PROGRESS BARS, PURE-BLACK DARK MODE
════════════════════════════════════════════════════════════════════════
These are the owner's explicit requests. Treat the HTML as the design of record and port the
*behaviour and composition*, not the CSS.

**W1 — Make the clock centre artifacts actually rotate.**
  The reference's mechanism (see P3) is the target: a rAF loop computes
  `sec = seconds + ms/1000` for a smooth sweep, `pose()` writes `rotate()` onto `.hh`, `.hm`, `.hs`
  and `.sb`, and every `.sp` element spins on its own `data-v` velocity as
  `translate(x y) rotate(t*v % 360)`. In the app: guarantee the frame callback runs while the face
  is focused, give each spinning artifact its own angular velocity, and make the second hand a
  smooth sweep rather than a step. Verify on device that an artifact's orientation visibly differs
  after 10 seconds.

**W2 — Make the progress bars work as designs, not as bars.**
  The reference's seven kinds and their intent:
    spines  Bookshelf   — 24 spines, the filled ones grow taller; a bookshelf of the day
    spiral  Spiral      — an Archimedean spiral drawn to the progress point, ghost track behind
    sight   Sight glass — a filling tube with a 0–100 tick scale and labels beneath
    ticker  Ticker      — a receding numeric ticker with a marker and a pointer arrow
    sieve   Sieve       — primes stay lit, composites get struck through as time passes
    wave    Trace       — an exponential pulse wave drawn under the playhead
    join    Join        — two labelled blocks joined by a 3×3 grid of squares that fill up
  The app has only `spines`, `glass` (≈sight), `trace` (≈wave), `ticker`. Port `spiral`, `sieve`
  and `join` as new kinds so all seven are selectable in Settings → Look & feel → Progress bar.
  Each must animate smoothly as the active class progresses, respect light/dark and both palettes,
  and stay under 44dp tap-target rules where interactive.

**W3 — Add a pure-black dark mode as the default.**
  Currently `src/tokens/theme.ts` has `palettes.refined` and `palettes.original`, each light+dark,
  and the default dark is a warm brown (`#2B2620`) that was a deliberate choice ("warm dark brown,
  NOT pitch black"). The owner now wants PURE BLACK available and used by default. Add a
  `palettes.black` (light+dark) or extend the theme model, with a genuinely black dark
  (`#000000` page) that keeps enough separation between paper / card / desk to remain legible, and
  set it as the default. Requirements:
    - Add it as a selectable option in Settings → Look & feel → palette, not a hard-coded swap.
    - Every hardcoded `#000000` must be audited: `REFINED.dark.shadow` and `ORIGINAL.dark.shadow`
      are already `#000000` and are used for shadows, so a black page will change how shadows read.
      Verify shadows and the paper grain/texture still look right on pure black.
    - `android/app/src/main/res/values-night/colors.xml` sets `activityBackground #2B2620` for the
      native pre-first-frame window. A black default must update that too, or a cold start flashes
      brown before the app paints.
    - Update `src/test/ui.test.ts` (which asserts refined contrast ≥4.5 for both themes) and add
      contrast assertions for the new palette. All body/caption text must clear 4.5:1.
    - Confirm it survives Settings → Reset and a cold relaunch.

════════════════════════════════════════════════════════════════════════
PART 3 — EXHAUSTIVE MEASURED USE
════════════════════════════════════════════════════════════════════════
Use the app as a student would, without stopping to theorise. Cover EVERY screen (Today, Week,
To-do, Grades, Stats, Focus) and EVERY sheet (Add, Task, Status, Course, Meeting, Mark, Note,
WhenPicker, Settings + all nested sub-pages, Diagnostics).

For every screen and interaction, RECORD:
- **Open time in milliseconds.** Cold start to first frame: `adb shell am start -W`. Per-screen
  navigation: derive from `adb logcat` timestamps or gfxinfo frame deltas. Report ms, not adjectives.
- **Animation timing** for page placement, sheet present/dismiss, tab press feedback, swipe-to-done,
  crumple, undo toast, chart entry, stamp, break sticker, dial drag.
- **Gradients and colour**: invisible gradients, banding, muddy mixes, anything ignoring the palette.
- **Layout**: clipping, overflow, misalignment, inconsistent padding/radius/font, content under the
  nav or the FAB, keyboard covering a field.
- **Tap targets** under 44dp, and any gesture with no non-gesture path.
- **State coverage**: empty, loading, error, populated, keyboard-open, modal-open, per screen.
- **Feel**: anything sluggish, floaty or late — quantified.
Also exercise: rapid double-tap on every action, back-button behaviour, HOME then return,
backgrounding mid-timer, and scale (seed 60+ `QA_` tasks).

════════════════════════════════════════════════════════════════════════
PART 4 — HOW TO DRIVE IT
════════════════════════════════════════════════════════════════════════
Primary: **mobile-mcp** (device R5CR117MTJJ).
  mobile_list_elements_on_screen · mobile_click_on_screen_at_coordinates · mobile_take_screenshot
  mobile_save_screenshot · mobile_get_device_logs · mobile_get_foreground_app · mobile_batch_commands
  Prefer element refs over raw coordinates — refs survive layout differences.
Secondary: the repo's hardened adb helpers (see qa/STATE.md):
  ./qa/scripts/adb.sh dump | texts | tap "<label>" | tapx X Y | type "..." | key BACK
  ./qa/scripts/adb.sh swipe up|down|left|right [px] | shot <name> | wait "t" [s] | gone "t" [s]
  ./qa/scripts/adb.sh locked | focus | awake | state
  bash qa/scripts/metro.sh status | restart        # Metro may already be running — do not kill it

Run in Expo Go (`host.exp.exponent`), SDK-57 matched and installed:
  adb reverse tcp:8081 tcp:8081
  adb shell am force-stop host.exp.exponent
  adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"     # then wait ~35s

HARD RULES — each of these has already cost this project a run:
- Do NOT edit anything under src/ while auditing. You audit and plan; the owner implements.
- Do NOT run `npm run check`, builds, `expo-doctor` or EAS. They are green and deterministic.
- Do NOT upgrade Expo SDK, React Native, TypeScript or any dependency.
- Do NOT delete android/ or ios/.
- Do NOT `pm clear`, uninstall anything, or alter device settings (font_scale, night mode,
  wm size/density, rotation). Baseline: font_scale=1.0, night=yes, 1080x2400, density=420,
  rotation=0. If a check needs a different setting, ASK.
- Do NOT tap system permission dialogs blindly.
- **NEVER `adb shell input keyevent 26`** — it is a toggle, not a wake. It sleeps the phone behind a
  SECURE PATTERN LOCK that no adb input can dismiss, and that has already ended an audit mid-run.
  To wake: `keyevent 224` + `wm dismiss-keyguard`. Confirm with `./qa/scripts/adb.sh locked`.
- **Always cold-restart before judging.** Fast refresh emits a spurious `ReferenceError: Property
  'dark' doesn't exist` plus ~90 bogus `"undefined" is not a valid color` warnings that do NOT
  occur in a real cold boot. Never report them.
- uiautomator dumps include HIDDEN pages: this app keeps every visited page mounted, so `dump` lists
  controls from pages you cannot see. Taps land on the visible page, but a label can resolve to a
  hidden page's element. Prefer resource-id (unique per component) or mobile-mcp refs, and check a
  screenshot before concluding anything.
- Every record you create is titled `QA_…`. Never modify or delete demo data.
- Metro reports "CI mode / reloads are disabled" — that only disables push-refresh. Bundles are
  rebuilt from disk, so a change appears after a cold restart.

════════════════════════════════════════════════════════════════════════
PART 5 — OUTPUTS
════════════════════════════════════════════════════════════════════════
1. `qa/DESIGN-PARITY.md` — a table: element → reference behaviour → current app behaviour → gap →
   severity. Cover the clock (rotation + centre artifacts), all progress-bar kinds, and the palette.
2. `qa/UX-REPORT.md` — findings table (id, severity, screen, repro, expected, actual, measurement,
   screenshot), a measurements table with the method used for every ms figure, a design review of the
   five faces and the bar kinds, a motion review giving each animation's current duration and a
   recommended duration + curve with reasoning, and a "what already works" section.
3. `qa/BUGS.md` — append new findings (continue the ID sequence), update its Summary table.
4. `qa/COVERAGE.md` — tick only what you genuinely exercised.
5. `qa/FIX-PLAN.md` — ordered, independently shippable slices. **Open with the smallest slice that
   is genuinely shippable** — the owner has a standing rule against adding features before
   finishing, so resist bundling. Per slice: exact files, the change, risk, and how to verify it.
   Then RE-REVIEW your own plan critically — what is wrong with it, what would you cut, what could
   regress, what did you assume without evidence — and rewrite it once. Say plainly which parts you
   are least confident in.
Commit `qa/` only.

Severity: Critical (crash/data-loss/blocked flow) > Major (feature wrong) > Minor (any visual or UX
defect, however small — this counts as a release blocker here) > Polish.

STOP RULE — BINDING
When DESIGN-PARITY.md, UX-REPORT.md and the reviewed FIX-PLAN.md are written, **STOP and ask the
owner to implement.** Do not begin implementing. Do not edit src/.

SECOND PASS — after the owner implements, they reconnect the phone and paste this same prompt again.
Then: skip Parts 1–2, verify every item in FIX-PLAN.md actually landed (before/after screenshot plus
a re-measured ms timing for each), then re-run Part 3 to catch regressions and anything the fixes
broke. Report, re-plan, stop again.

════════════════════════════════════════════════════════════════════════
SKILLS TO LOAD FIRST
════════════════════════════════════════════════════════════════════════
- `frontend-ui-engineering` — layout, responsive behaviour, accessibility
- `make-interfaces-feel-better` — visual detail, alignment, tap targets, motion restraint
- `impeccable` — UI defect audit and polish
- `animation-principles` — duration, easing, overshoot; use it to justify every motion change
- `motion-art-direction` — one consistent motion language across screens
- `frontend-design` — visual direction for the bar and clock redesign
- `vercel-react-native-skills` and `vercel-react-performance` — RN + React perf idioms
- `performance-optimization` — for the ms measurements
- `web-design-guidelines` — accessibility and interaction review
Read as plain files (not registered with the skill tool):
  .agents/skills/react-native-best-practices/SKILL.md
  .agents/skills/expo-overview/SKILL.md
  .agents/skills/expo-animation/SKILL.md
Caveat: the `expo-native-ui` skill found in another repo's .agents is generic iOS-flavoured Expo
advice. This app is Android-first and deliberately uses a custom navigator, hand-drawn SVG outlines
and a paper texture. Treat those as advisory, not as a style to impose.

FIRST ACTION
Read qa/STATE.md and qa/BUGS.md, confirm the gates are green by reading (do not re-run them), open
/home/jossy/Downloads/marginalia-v10(1).html and read its clock + progress-bar + theme source, then
confirm the device is UNLOCKED via `./qa/scripts/adb.sh locked` and begin Part 1.
```

---

### What changed from the previous prompt

- **Merged** the six reported problems and the three new work items (clock rotation, progress bars,
  pure-black dark mode) into one pass, instead of auditing them separately.
- **Added the HTML reference** as the design of record, with the concrete deltas already extracted
  for the agent: 7 bar kinds vs 4, the `.sp` per-element rotation mechanism, and the
  `sec + ms/1000` smooth sweep.
- **Added the pure-black default** as explicit work, including the two places it will break
  (`values-night/colors.xml` pre-first-frame colour, and the `#000000` shadows) and the contrast
  tests that must be extended.
- **Deleted** `AUDIT-PROMPT.md`, which this supersedes.

### One thing I did not do

I did **not** delete the repo's own `prompt.md` (184 lines, the V1–V20 verification plan). It is a
different document — a verification contract, not an audit brief — and `README.md` and `STATE.md`
both link to it, so removing it would break those references. Say the word and I will delete it, or
fold its V-items into `qa/COVERAGE.md` first.