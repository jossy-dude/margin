# PROMPT.md — Marginalia: design-parity fix, performance forensics, measured UX audit, plan

> **How to use.** Paste everything inside the fence into a fresh session with your target agent.
> Self-contained. After the owner implements, paste it again for the verification pass.
>
> **Design references (read these; they are the design of record ONLY for the parts named):**
> - `/home/jossy/Downloads/subject-progress-bars-v2(1).html` — the 22-instrument progress-bar catalogue
> - `/home/jossy/Downloads/marginalia-v10(1).html` — clock rotation + centre spinning artifacts, early bar kinds, dark theme

```text
ROLE
You are a senior React Native / Expo engineer AND the product owner's design reviewer, running the
final pre-launch pass on "Marginalia" — a hand-drawn, offline-first Android school planner.
Expo SDK 57, React Native 0.86, React 19.2, New Architecture + React Compiler, TypeScript strict,
local SQLite, no backend, no network, Android-first.

Repo:       /home/jossy/Documents/Projects/School_planner_v2   (git branch `qa/prelaunch`)
Device:     Samsung SM-A516N "Sefenit's A51", Android 13, 1080x2400 @420dpi = 411 dp, USB
mobile-mcp: device id R5CR117MTJJ (authenticated, online)

In the FIRST pass you research, audit, measure and plan, then STOP. The owner implements.
In the SECOND pass (after they implement) you verify and re-audit. Both passes are below.

IMPORTANT CONTEXT FROM THE OWNER
They will be away and cannot always keep the phone connected. Therefore:
  - Do not stall waiting on the device. When the device is unreachable, switch to the research and
    code-reading work (Part 4, and Part 6) and continue. Record precisely what you could not verify.
  - Produce written artifacts for EVERYTHING. If a session ends, another agent must be able to
    continue from your files alone.
  - When you do have the device, work efficiently and write notes as you go, not at the end.

════════════════════════════════════════════════════════════════════════
PART 0 — READ FIRST, AND WHAT IS ALREADY KNOWN
════════════════════════════════════════════════════════════════════════
Read in this order:
1. qa/STATE.md         project facts, device baseline, "Harness traps" section (critical)
2. qa/BUGS.md          ~33 findings already logged. Do not duplicate. Read the FIXED ones so you
                       do not re-report completed work.
3. qa/COVERAGE.md      screen × element matrix you will fill
4. qa/DATA_LEDGER.md   seeded baseline + the QA_ naming rule
5. qa/RESEARCH-PERF.md the performance research dossier (Part 4). Read it before touching swipe or
                       transition performance — do not redo the research.
6. qa/DESIGN-PARITY.md measured gap between the HTML references and the app
7. prompt.md           the project's own V1–V20 plan and architecture map
8. STATE.md at REPO ROOT — prior decisions and the deviation ledger. Read, never edit.

Already established — do NOT re-derive, do NOT re-run:
- `npm run check` exits 0: tsc clean, eslint 0 warnings, **313 jest tests / 29 suites**, depcruise clean.
- `npm run bundle` exits 0: 3.8 MB Hermes bytecode. Test-count history: 82→104→111→148→209→254→313.
- Node here is v24.16.0 (docs say 22.22; gates pass regardless).
- The app seeds demo data on first run. Settings → Clear demo history does NOT reach an empty DB
  (it removes demo *history* only). A truly empty database is not reachable in-app — known, not a
  bug to rediscover.
- ALL status-bar / system-bar / edge-to-edge judgements are INVALID in Expo Go — Expo Go owns that
  window and the app cannot control it (Expo Go shows a pure-black band; the release build shows its
  own theme colour). Do not report system-bar findings.
- No Android SDK on this machine (ANDROID_HOME unset). Local Gradle/APK builds CANNOT run here;
  release validation is via EAS cloud.

════════════════════════════════════════════════════════════════════════
PART 1 — SCOPE LOCK ON THE HTML REFERENCES  (read before touching any design)
════════════════════════════════════════════════════════════════════════
The two HTML files are DESIGN REFERENCES FOR SPECIFIC PARTS ONLY. They are not the design of record
for the whole app, and the app is NOT a port of them.

MUST take from the HTML — and ONLY these three things:
  1. The clock's rotation mechanism and the centre spinning artifacts        (from marginalia-v10)
  2. The 22-instrument progress-bar catalogue and the countdown behaviour    (from subject-progress-bars-v2)
  3. "Add a full black palette as a 4th option"                              (from marginalia-v10's dark theme)

MUST NOT take from the HTML — the app keeps its own design here, unchanged:
  - **The gear / cog artifact.** KEEP the app's own gear exactly as it is. The HTML's gear is
    REDUNDANT and must NOT be copied, ported, restyled, or "improved". Do not touch `src/ui/hand.ts`,
    the hand-drawn outline helper, the icon set, or any gear/cog artwork. If a finding would require
    changing the gear, DROP that finding and note in your report why you dropped it.
  - Overall app layout, page structure, navigation, typography, paper texture, the hand-drawn
    outline system, the swipe/crumple cards, the bottom-sheet system, and every other existing
    visual. Those are the app's own and are not up for redesign.
  - Copy, microcopy, information architecture, or feature scope from the HTML.

If you are ever unsure whether something is in scope, it is OUT of scope. Porting the HTML's chrome
or its gear is a regression, not a fidelity win.

The governing principle in the v2 reference's own words: "A bar that measures, not a bar that
decorates." Take the measurement idea and the instruments. Leave the app's hand-drawn paper world
intact.

════════════════════════════════════════════════════════════════════════
PART 2 — WORK ITEM A: PROGRESS-BAR INSTRUMENTS (from subject-progress-bars-v2)
════════════════════════════════════════════════════════════════════════
Read `/home/jossy/Downloads/subject-progress-bars-v2(1).html` in full, including its `<script>`.
It is a catalogue of **22 instruments** in 6 groups: 7 that "work in any subject", then 3 takes each
for 5 subjects. Each `BARS[k](p, w)` returns the inside of one `<svg viewBox="0 0 w 44">` drawn in
REAL PIXELS against a measured width, painted in TWO INKS only (a resting grey draw and a live draw),
so a circle stays a circle at any size.

THE 22 INSTRUMENTS (id — name — group; g = -1 is "works in any subject"):
```
-1  odometer    Odometer       0  ticker     Ticker
-1  gauge       Dial           0  surplus    Surplus
-1  leader      Leader         0  compound   Compounding
-1  cassette    Transport      1  lattice    Lattice
-1  sightglass  Sight glass    1  sieve      Sieve
-1  spiral      Spiral         1  sets       Sets
-1  ladder      Ladder         2  wave       Trace
                                  2  spectrum   Analyzer
                                  2  blocks     Chain
                                  3  stack      Call stack
                                  3  commits    Commits
                                  3  heap       Generations
                                  4  btree      B-tree
                                  4  join       Join
                                  4  log        Log
```

Requirements:
- **All 22 must actually be implemented** and selectable in Settings → Look & feel → Progress bar,
  grouped exactly as the reference groups them ("Works in any subject" / one group per subject).
- **The design MUST count down.** In the reference `p` is percent *remaining*, and the deck runs it
  down (`state.p -= 0.25` every 60ms; the odometer literally prints `mm:ss` counting down; the leader
  counts 8 down as the hand goes round, then the run-out). In the app `p` must be the remaining
  fraction of the active class period derived from REAL clock time — not a decorative loop.
  Several instruments only read correctly while counting down (`leader`, `cassette`, `ticker`,
  `odometer`). Verify each one still reads true at p=1 (not started) and p=0 (period over).
- **Per-subject assignment.** The reference maps each subject to its own machine (Intro to Economics
  → ticker, Discrete Mathematics → lattice, Emerging Technology → wave, Computer Programming → stack,
  Database Systems → btree) and falls back to the "any subject" set for free periods. Decide with the
  owner whether the app assigns per subject or lets the user pick; propose the default and flag it as
  a decision.
- Each instrument must respect light/dark AND all four palettes, animate smoothly, and not distort at
  any width. The reference names the prior failure mode: one stretched viewBox flattened every disc
  into an oval.
- Two inks only — a resting draw and a live draw. Signal colour only on the part that moves.
- The app currently has 4 kinds in `src/ui/DayBar.tsx` (`spines`, `glass`, `trace`, `ticker`) and its
  default renders four vertical bars — the owner's complaint that it is "just a bar chart". Keep the
  existing 4 if they are good. The deliverable is that all 22 exist and one of them is a genuinely
  good default. Recommend the default and justify it.

════════════════════════════════════════════════════════════════════════
PART 3 — WORK ITEM B: CLOCK ROTATION + CENTRE ARTIFACTS (from marginalia-v10)
════════════════════════════════════════════════════════════════════════
Target mechanism, from the reference's script:
  - an rAF loop computes `sec = getSeconds() + getMilliseconds()/1000` for a SMOOTH sweep
  - `pose(s,h,mi,sec)` writes `rotate()` onto `.hh`, `.hm`, `.hs` and `.sb`
  - every centre spinning artifact is a `.sp` element with its own `data-v` angular velocity, rotated
    as `translate(x y) rotate(t*v % 360)`

Requirements:
- Guarantee the frame callback actually RUNS while the face is focused, and does NOT run when it is
  not — a hidden screen must not burn frames. This is a stated project rule.
- Give each centre artifact its own angular velocity, so the movement is not one uniform spin.
- The second hand must sweep smoothly rather than step, and must be RED-BROWN as `prompt.md` V4
  specifies. It is currently drawn in `pal.accent` (`src/ui/clock/faces.ts:159`), which in the
  default dark palette is `#E0A47A` — a pale peach that reads grey. Fix the COLOUR and the LENGTH
  (the path `M0 18V-${L}` only reaches a short stub past centre).
- Carry the selected face's centre artwork and its rotating artifact into the **Focus** page's centre
  dial, which currently has none of it.

════════════════════════════════════════════════════════════════════════
PART 4 — WORK ITEM C: PAGE / SWIPE PERFORMANCE FORENSICS
════════════════════════════════════════════════════════════════════════
Run this as a DEDICATED SUBAGENT with web research, before any optimisation. Your own measurement and
the code reading are the raw material; the subagent supplies root-cause grounding.

Known symptom: page transitions feel slow — "about half a second after the press", worst on To-do.
Measured so far: `src/navigation/Book.tsx:24` runs
`withTiming(1, { duration: 520, easing: Easing.bezier(0.2,0.9,0.25,1) })` with `translateY -70→0`,
`translateX 38→0`, `rotate 4.5deg→0`, `scale 1.045→1` on every tab tap. So 520ms of motion is partly
BY DESIGN — but "feels slow" may also be a frame-budget problem, not only a duration problem.
Establish which, with evidence.

SUBAGENT BRIEF — pass this to it verbatim:
> Research page-transition and scroll/swipe performance in React Native 0.86 with Reanimated 4.5 +
> worklets on the New Architecture, on a mid-range Android device (Snapdragon 720G-class, Android 13).
> Search the web properly and go deep: official Reanimated and React Native performance docs, the
> Reanimated docs on `useFrameCallback` and UI-thread work, Fabric and static rendering, the known
> costs of animating `transform`/`opacity` versus layout properties, `withTiming` duration and easing
> cost, gesture-handler row performance, image decoding and texture-upload costs, shadow/elevation on
> Android, and text measurement. Look for known regressions or open issues in RN 0.86 / SDK 57
> specifically, and for the React Compiler's interaction with animated styles.
> Then MEASURE the app on the device: `adb shell dumpsys gfxinfo host.exp.exponent reset`, perform the
> transition, then dump and read the janky-frame percentage; `adb shell dumpsys meminfo`; and the
> app's own logs. Compare the observed transition against the 520ms budget.
> Deliver `qa/RESEARCH-PERF.md` containing: (1) a ranked list of root causes, each with evidence and
> a source URL; (2) the measured numbers; (3) concrete recommended changes with expected effect;
> (4) what CANNOT be measured in Expo Go and needs a release build. Be specific and quantitative.
> Clearly distinguish what you MEASURED from what you READ.

Then, yourself: read `qa/RESEARCH-PERF.md` and fold its conclusions into `qa/FIX-PLAN.md`. Any
recommendation the research contradicts must be dropped, with a note saying why.

════════════════════════════════════════════════════════════════════════
PART 5 — WORK ITEM D: A FOURTH, FULL-BLACK PALETTE
════════════════════════════════════════════════════════════════════════
**KEEP ALL EXISTING PALETTES.** Every palette that exists today stays fully available and selectable
— none may be removed, renamed away, or have its values altered. Pure black is ADDED as a 4th
selectable option, and made the DEFAULT dark.

Two things will break and must be handled:
  1. `android/app/src/main/res/values-night/colors.xml` sets `activityBackground` to the warm
     `#2B2620` for the pre-first-frame window. With a black default that becomes a brown flash on
     cold start unless it is updated to match.
  2. The existing dark palettes already use `#000000` for `shadow`. On a genuinely black page,
     shadows become invisible — re-check the hand-drawn card shadows, the paper grain/texture
     (`src/ui/PaperBg.tsx`) and the elevation reads on pure black, and adjust if they die.
Also extend `src/test/ui.test.ts` (which asserts refined contrast ≥4.5) with contrast assertions for
the new palette. All body and caption text must clear **4.5:1**. Confirm it survives
Settings → Reset and a cold relaunch.

════════════════════════════════════════════════════════════════════════
PART 6 — BUILD-CONFIG QUESTIONS (work that needs NO device)
════════════════════════════════════════════════════════════════════════
Two open items are device-independent. Resolve them by reading and reasoning, and record the
conclusion with a recommendation. Do NOT unilaterally change build configuration.
  - BUG-001 (Major): this repo has committed `android/` and `ios/` folders, so EAS Build silently
    IGNORES `orientation`, `scheme`, `userInterfaceStyle`, `icon`, `backgroundColor`, `splash` and the
    `android`/`ios` blocks in `app.json`. Every app-identity field in `app.json` is inert for the
    shipped artifact. Present BOTH options — adopt CNG so `app.json` is authoritative, or keep the
    native folders as the source of truth and document `app.json` as advisory — with a
    recommendation. The folders must NOT be deleted: they carry the size work in `BUILDING.md`.
  - BUG-002/003/007: `app.json` has three keys the SDK 57 schema silently drops (`newArchEnabled`,
    top-level `splash`, `android.splash`); `eas-cli` is a local devDependency; TypeScript is 5.9.3
    against an expected ~6.0.3. Report the impact of each. Do not upgrade anything.

════════════════════════════════════════════════════════════════════════
PART 7 — EXHAUSTIVE MEASURED USE, WITH A FULL WORKING LOG
════════════════════════════════════════════════════════════════════════
Use the app as a student would, without stopping to theorise. Cover EVERY screen (Today, Week, To-do,
Grades, Stats, Focus) and EVERY sheet (Add, Task, Status, Course, Meeting, Mark, Note, WhenPicker,
Settings + all nested sub-pages, Diagnostics).

RECORD, for every screen and every interaction:
- **Open time in milliseconds.** Cold start to first frame: `adb shell am start -W`. Per-screen
  navigation: from `adb logcat` timestamps or gfxinfo frame deltas. Report ms, not adjectives.
- **Animation timing**: page placement, sheet present/dismiss, tab press feedback, swipe-to-done,
  crumple, undo toast, chart entry, stamp, break sticker, dial drag.
- **Every gradient**: whether it renders at all, banding, muddy mixes, anything ignoring the palette.
- **Layout**: clipping, overflow, misalignment, inconsistent padding/radius/font, content under the
  nav or the FAB, keyboard covering a field.
- **Tap targets** under 44dp, and any gesture with no non-gesture path.
- **State coverage**: empty, loading, error, populated, keyboard-open, modal-open, per screen.
- **Feel**: anything sluggish, floaty or late — quantified.

OBSERVATION AND TRACEABILITY REQUIREMENTS (the owner asked for these explicitly):
- **Note EVERY visual detail you observe**, with a screenshot for anything you intend to report. Do
  not summarise from memory at the end — capture as you go.
- **Reason from the data, not from impression.** For each finding, state the evidence, the code path,
  and your confidence. Say "uncertain" where you are uncertain.
- **Keep a running log of everything you did** — every tap, swipe, setting changed, record created,
  screenshot taken — in `qa/WALKTHROUGH.md`, timestamped. Another agent must be able to replay your
  session from that file alone.
- **Record cross-page effects explicitly.** When you change something on one page (a setting, a theme,
  a palette, a bar kind, a layout), verify and RECORD what it did and did not affect on every other
  page. Write it as an explicit table: change → page → affected yes/no → what. If a change on page 1
  did not affect page 4, that is a finding worth recording, not a silence.
- **Record what you deliberately did NOT test, and why.**

Also exercise: rapid double-tap on every action, back-button behaviour, HOME then return,
backgrounding mid-timer, and scale (seed 60+ `QA_` tasks).

════════════════════════════════════════════════════════════════════════
PART 8 — HOW TO DRIVE IT
════════════════════════════════════════════════════════════════════════
Primary: **mobile-mcp** (device R5CR117MTJJ).
  mobile_list_elements_on_screen · mobile_click_on_screen_at_coordinates · mobile_take_screenshot
  mobile_save_screenshot · mobile_get_device_logs · mobile_get_foreground_app · mobile_batch_commands
  Prefer element refs over raw coordinates — refs survive layout differences.
Secondary: the repo's hardened adb helpers (see qa/STATE.md):
  ./qa/scripts/adb.sh dump | texts | tap "<label>" | tapx X Y | type "..." | key BACK
  ./qa/scripts/adb.sh swipe up|down|left|right [px] | shot <name> | wait "t" [s] | gone "t" [s]
  ./qa/scripts/adb.sh locked | focus | awake | state
  bash qa/scripts/metro.sh status | restart      # Metro may already be running — do not kill it

Run in Expo Go (`host.exp.exponent`), SDK-57 matched and installed:
  adb reverse tcp:8081 tcp:8081
  adb shell am force-stop host.exp.exponent
  adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"    # then wait ~35s

HARD RULES — each of these has already cost this project a run:
- Do NOT edit anything under src/ while auditing. You audit and plan; the owner implements.
- Do NOT run `npm run check`, builds, `expo-doctor` or EAS. They are green and deterministic.
- Do NOT upgrade Expo SDK, React Native, TypeScript or any dependency.
- Do NOT delete android/ or ios/, and do not remove any existing palette.
- Do NOT `pm clear`, uninstall anything, or alter device settings (font_scale, night mode, wm
  size/density, rotation). Baseline: font_scale=1.0, night=yes, 1080x2400, density=420, rotation=0.
  If a check needs a different setting, ASK.
- Do NOT tap system permission dialogs blindly.
- **NEVER `adb shell input keyevent 26`** — it is a toggle, not a wake. It sleeps the phone behind a
  SECURE PATTERN LOCK that no adb input can dismiss, and that has already ended an audit mid-run. To
  wake: `keyevent 224` + `wm dismiss-keyguard`. Confirm with `./qa/scripts/adb.sh locked`.
- **Always cold-restart before judging.** Fast refresh emits a spurious
  `ReferenceError: Property 'dark' doesn't exist` plus ~90 bogus `"undefined" is not a valid color`
  warnings that do NOT occur in a real cold boot. Never report them.
- uiautomator dumps include HIDDEN pages: this app keeps every visited page mounted, so `dump` lists
  controls from pages you cannot see. Taps land on the visible page, but a label can resolve to a
  hidden page's element. Prefer resource-id (unique per component) or mobile-mcp refs, and check a
  screenshot before concluding anything.
- Every record you create is titled `QA_…`. Never modify or delete demo data.
- Metro reports "CI mode / reloads are disabled" — that only disables push-refresh. Bundles are
  rebuilt from disk, so a change appears after a cold restart.

════════════════════════════════════════════════════════════════════════
PART 9 — OUTPUTS
════════════════════════════════════════════════════════════════════════
1. qa/RESEARCH-PERF.md  — from the Part 4 subagent: ranked root causes with sources, measured numbers,
                          recommended changes, and what needs a release build.
2. qa/DESIGN-PARITY.md  — table: element → reference behaviour → current app behaviour → gap → severity.
                          Cover the clock (rotation + centre artifacts), all 22 instruments, the
                          countdown behaviour, and the four palettes.
3. qa/WALKTHROUGH.md    — the timestamped log of every action taken, plus the cross-page effect matrix
                          (change → page → affected yes/no → what).
4. qa/UX-REPORT.md      — findings table (id, severity, screen, repro, expected, actual, measurement,
                          screenshot); a measurements table giving the method behind every ms figure; a
                          design review of the five faces and the instruments; a motion review giving
                          each animation's current duration and a recommended duration + curve with
                          reasoning; and a "what already works" section.
5. qa/BUGS.md           — append new findings (continue the ID sequence), update its Summary table.
6. qa/COVERAGE.md       — tick only what you genuinely exercised.
7. qa/FIX-PLAN.md       — ordered, independently shippable slices. **Open with the smallest slice that
                          is genuinely shippable** — the owner has a standing rule against adding
                          features before finishing, so resist bundling. Per slice: exact files, the
                          change, risk, and how to verify it. Then RE-REVIEW your own plan critically —
                          what is wrong with it, what would you cut, what could regress, what did you
                          assume without evidence — and rewrite it once. Say plainly which parts you
                          are least confident in.
Commit `qa/` only.

Severity: Critical (crash/data-loss/blocked flow) > Major (feature wrong) > Minor (any visual or UX
defect, however small — this counts as a release blocker here) > Polish.

STOP RULE — BINDING
When RESEARCH-PERF.md, DESIGN-PARITY.md, WALKTHROUGH.md, UX-REPORT.md and the reviewed FIX-PLAN.md
are written, **STOP and ask the owner to implement.** Do not begin implementing. Do not edit src/.

SECOND PASS — after the owner implements, they reconnect the phone and paste this same prompt again.
Then: skip Parts 2–6, verify every item in FIX-PLAN.md actually landed (before/after screenshot plus a
re-measured ms timing for each), confirm the gear artifact is UNCHANGED, confirm every palette is
still selectable, then re-run Part 7 to catch regressions and anything the fixes broke. Report,
re-plan, stop again.

════════════════════════════════════════════════════════════════════════
SKILLS TO LOAD FIRST
════════════════════════════════════════════════════════════════════════
- frontend-ui-engineering — layout, responsive behaviour, accessibility
- make-interfaces-feel-better — visual detail, alignment, tap targets, motion restraint
- impeccable — UI defect audit and polish
- animation-principles — duration, easing, overshoot; use it to justify every motion change
- motion-art-direction — one consistent motion language across screens
- frontend-design — visual direction for the instrument and clock work
- vercel-react-native-skills and vercel-react-performance — RN + React perf idioms
- performance-optimization — for the ms measurements
- web-design-guidelines — accessibility and interaction review
- deep-research — for the Part 4 subagent's web research
Read as plain files (not registered with the skill tool):
  .agents/skills/react-native-best-practices/SKILL.md
  .agents/skills/expo-overview/SKILL.md
  .agents/skills/expo-animation/SKILL.md
Caveat: the expo-native-ui skill found in another repo's .agents is generic iOS-flavoured Expo advice.
This app is Android-first and deliberately uses a custom navigator, hand-drawn SVG outlines and a paper
texture. Treat those as advisory, not as a style to impose.

FIRST ACTION
Read qa/STATE.md and qa/BUGS.md, confirm the gates are green by reading (do not re-run them), read
both HTML references (their <script> blocks carry the actual drawing logic), confirm the device is
UNLOCKED via ./qa/scripts/adb.sh locked, then launch the Part 4 performance subagent and begin the
confirm-or-refute pass on the six reported problems.
```

---

## What changed in this revision

1. **New reference added**, and it replaced the old 7-kind bar list:
   `/home/jossy/Downloads/subject-progress-bars-v2(1).html`. It actually contains **22 instruments** in
   6 groups (7 universal + 3 takes each for 5 subjects), not 7. All 22 are enumerated with their groups.
2. **Countdown made a hard requirement.** The reference runs `p` (percent *remaining*) down every
   60ms, and several instruments — `odometer`, `leader`, `cassette`, `ticker` — only read correctly
   while counting. The prompt requires real clock-derived remaining time and verification at p=1 and
   p=0.
3. **Gear protected explicitly.** Part 1 is a scope lock placed *before* any design work: keep the
   app's gear, never port the HTML's, and *drop* any finding that would require changing it. Same
   protection for layout, typography, texture, outline system, and the sheet/swipe systems.
4. **Performance forensics split out** into a dedicated subagent doing web research plus device
   measurement, delivering `qa/RESEARCH-PERF.md` for the other agents to draw from. It is explicitly
   told to distinguish "slow because 520 ms" from "slow because frame budget".
5. **Colour corrected.** You said keep all and *add* black; the previous draft said pure black
   *replaces* the warm brown default. Now: keep every existing palette untouched, add black as a 4th,
   make black the default dark.
6. **Traceability requirements added** — running timestamped `WALKTHROUGH.md`, note every visual
   detail, reason from data with stated confidence, and record a cross-page effect matrix
   (change → page → affected yes/no → what) so "page 1 change didn't affect page 4" gets written down
   instead of silently dropped.
7. **Your phone availability is first-class context** — don't stall on an unreachable device, write
   everything down so another agent can continue, and Part 6 supplies device-free work meanwhile.
8. **Emphasis added at the top** — with "if unsure, it is out of scope", because over-porting the
   HTML is the failure mode you're guarding against.

The repo's own `prompt.md` (the V1–V20 contract that `README.md` and `STATE.md` link) is still there.
Say the word if you want it gone.