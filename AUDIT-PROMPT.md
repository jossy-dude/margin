# AUDIT PROMPT — Marginalia exhaustive UX + performance audit

Copy everything inside the fence below and paste it as the first message of a fresh session.
It is written to be self-contained: a new agent has no memory of this work.

```text
ROLE
You are a senior mobile engineer AND the product's design reviewer, running an exhaustive
pre-launch audit of "Marginalia" — a hand-drawn, offline-first Android school planner
(Expo SDK 57, React Native 0.86, React 19.2, New Architecture + React Compiler, TypeScript
strict, local SQLite, no backend, no network).

Repo: /home/jossy/Documents/Projects/School_planner_v2   (git branch `qa/prelaunch`)
Device: Samsung SM-A516N "Sefenit's A51", Android 13, 1080x2400 @420dpi = 411 dp wide,
        connected over USB. mobile-mcp device id: R5CR117MTJJ

You are NOT fixing anything in this session. You AUDIT, MEASURE, and PLAN. The human owns
the phone and will implement after you stop and ask. See STOP RULE at the end — it is binding.

HOW TO DRIVE THE APP
Primary tool: **mobile-mcp** (already authenticated, device R5CR117MTJJ is online).
  mobile-mcp_mobile_list_elements_on_screen   → prefer this over screenshots (refs survive layout)
  mobile-mcp_mobile_click_on_screen_at_coordinates  (ref or x,y)
  mobile-mcp_mobile_take_screenshot / mobile-mcp_mobile_save_screenshot
  mobile-mcp_mobile_get_device_logs           → filter for ReactNativeJS / AndroidRuntime
  mobile-mcp_mobile_get_foreground_app, _get_screen_size, _get_orientation
  mobile-mcp_mobile_batch_commands            → group tap,type,tap sequences (one round-trip)
Secondary: the repo's own adb helpers, which are hardened — read qa/STATE.md first:
  ./qa/scripts/adb.sh dump | texts | tap "<label>" | tapx X Y | type "..." | key BACK
  ./qa/scripts/adb.sh swipe up|down|left|right [px] | shot <name> | wait "t" [s] | gone "t" [s]
  ./qa/scripts/adb.sh locked | focus | awake | state
Metro is started by the repo script and may ALREADY be running — check `bash qa/scripts/metro.sh status`
and only restart it with `bash qa/scripts/metro.sh restart` if it is dead or serving stale bundles.

RUNNING THE APP
Test in **Expo Go** (`host.exp.exponent`), which is installed and SDK-57 matched. Launch:
  adb shell am force-stop host.exp.exponent
  adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081"
then wait ~35s for the bundle. `adb reverse tcp:8081 tcp:8081` must be set.

READ FIRST, IN THIS ORDER
1. qa/STATE.md — project facts, device baseline, and the "Harness traps" section (critical)
2. qa/BUGS.md — ~33 findings already logged; do not duplicate, and read the resolved ones so you
   do not re-report work that is already fixed
3. qa/COVERAGE.md — the screen × element matrix you are filling
4. qa/DATA_LEDGER.md — seeded baseline and the QA_ naming rule
5. prompt.md — the project's own verification plan (V1..V20) and architecture map
6. STATE.md at the REPO ROOT — prior decisions and the deviation ledger. Read, never edit.

MEASURED BASELINE (do not re-derive; it is already known)
- npm run check exits 0: tsc clean, eslint 0 warnings, 313 jest tests / 29 suites, depcruise clean.
- npm run bundle exits 0: 3.8 MB Hermes bytecode.
- Gate history went 82 → 104 → 111 → 148 → 209 → 254 → 313 tests over the QA passes.
- Node on this machine is v24.16.0 (the project docs say 22.22; gates pass anyway).
- The app auto-seeds demo data on first run. Settings → Clear demo history does NOT yield an
  empty DB (it only removes demo *history*; open tasks, subjects, timetable and notes remain).
- ALL status-bar / system-bar / edge-to-edge judgements are INVALID in Expo Go — Expo Go owns
  that window. Do not report them; they need the standalone release build.

HARD RULES (violating any of these wastes the session)
- Do NOT edit anything under src/. You audit and plan; the human implements.
- Do NOT run `npm run check`, builds, `expo-doctor`, or EAS. Report only.
- Do NOT upgrade Expo SDK, React Native, TypeScript or any dependency.
- Do NOT delete android/ or ios/.
- Do NOT `pm clear`, uninstall anything, or change device settings (font_scale, night mode,
  wm size/density, rotation). Baseline: font_scale=1.0, night=yes, 1080x2400, density=420,
  rotation=0. If a check requires a different setting, ASK rather than change it.
- Do NOT tap system permission dialogs blindly.
- **NEVER `adb shell input keyevent 26`.** It is a toggle, not a wake: it sleeps the phone and puts
  it behind a SECURE PATTERN LOCK that no adb input can dismiss. That has already ended one audit
  mid-run. To wake: `keyevent 224` + `wm dismiss-keyguard`. Verify with `./qa/scripts/adb.sh locked`.
- **Always cold-restart before judging.** Fast refresh emits a spurious
  `ReferenceError: Property 'dark' doesn't exist` plus ~90 bogus `"undefined" is not a valid color`
  warnings that do NOT occur in a real cold boot. Never report them as bugs.
- uiautomator dumps include HIDDEN pages: this app keeps every visited page mounted, so `dump`
  lists controls from pages you cannot see. Taps land on the visible page, but a label may resolve
  to a hidden page's element. Prefer tapping by resource-id (unique per component) or use
  mobile-mcp element refs, and sanity-check against a screenshot before concluding anything.
- Every record you create must be titled `QA_…`. Never modify or delete demo data.
- Metro in CI mode reports "reloads are disabled" — that only disables push-refresh; bundles are
  still rebuilt from disk, so a change appears after a cold restart.

PHASE 1 — ASSESS THE FOLLOWING REPORTED PROBLEMS
For each, state whether you CONFIRM, REFUTE, or PARTIALLY CONFIRM, with a screenshot and a
mechanism. These were reported by the product owner; do not take them on faith.
 1. The active-class progress card on Today is visually poor — "just a bar chart". Confirm what it
    currently renders (DayBar kinds are spines/glass/trace/ticker in src/ui/DayBar.tsx) and which
    kind is the default. Describe precisely what is wrong visually.
 2. On Today, the clock's second hand "looks grey, is not visible, and only the centre part shows".
    Note that src/ui/clock/faces.ts draws the second hand in `pal.accent` while prompt.md V4
    specifies a red-brown second hand, and that it may be too short. Measure what is actually on
    screen.
 3. The second hand / moving parts do not visibly rotate. Verify against wall-clock time over at
    least 60 seconds, with screenshots at t0 and t+60s. Distinguish "not rotating" from "rotating
    but not visible".
 4. Page transitions feel slow — "about half a second after the press", worst on To-do. The current
    animation is `duration: 520` in src/navigation/Book.tsx with a 70 dp drop. MEASURE the real
    per-tab transition time in ms (see PHASE 2 for how) and state what it should be.
 5. The Focus page background is dimmed too much. Current: c.desk at opacity 0.62 over the photo
    (src/screens/Focus.tsx:161), plus a second wash at 0.42. Quantify and propose a target.
 6. The Focus page's centre dial does not carry the clock-face artwork from the five clock faces.
    Confirm what is drawn there now versus what Settings → Look & feel → Clock face offers.

PHASE 2 — EXHAUSTIVE REAL USE, MEASURED
Use the app the way a student actually would, without stopping to theorise. Cover EVERY screen
(Today, Week, To-do, Grades, Stats, Focus) and EVERY sheet (Add, Task/Assignment, Status, Course,
Meeting, Mark, Note, WhenPicker, Settings and every nested sub-page, Diagnostics).

For every screen and every interaction, RECORD:
- **Open time in milliseconds.** Cold start to first frame, and per-screen open time. Use
  `adb shell am start -W` for cold start; for in-app navigation use logcat timestamps or
  frame-stat deltas. Report ms, not adjectives.
- **Animation timing and feel** for: page placement, sheet present/dismiss, tab press feedback,
  swipe-to-done, crumple, undo toast, chart entry, stamp, break sticker, dial drag.
- **Gradients and colour**: any gradient that is invisible, banding, muddy, or ignores the palette;
  hardcoded colours that ignore `palette: refined|original` or light/dark.
- **Layout and spacing**: clipping, overflow, misalignment, inconsistent padding/radius/font,
  content under the bottom nav or the FAB, keyboard covering a field.
- **Tap targets** under 44 dp, and anything that needs a gesture with no non-gesture path.
- **State coverage**: empty, loading, error, populated, keyboard-open, modal-open for each screen.
- **Feel**: does anything feel sluggish, floaty, or late? Quantify it.
Also exercise: rapid double-tap on every action, back-button behaviour, HOME then return,
backgrounding during a running timer, and a long list (seed 60+ `QA_` tasks to test scale).

PHASE 3 — WRITE THE REPORT
Write an extensive markdown report to `qa/UX-REPORT.md` (create it). Structure:
 1. Verdict per PHASE 1 item: CONFIRMED / REFUTED / PARTIAL + evidence + proposed fix direction.
 2. A findings table: id, severity (Critical > Major > Minor > Polish; Minor is a release
    blocker in this project), screen, repro, expected, actual, measurement, screenshot path.
 3. A measurements table: every ms timing you captured, with the method you used.
 4. Design review of the five clock faces and the four day-bar kinds, judged as a designer would.
 5. Motion review: every animation with its current duration and a recommended duration + curve,
    with the reasoning (a page transition should feel like a page being placed, not a wait).
 6. A "what already works" section — do not only report problems; the next agent needs to know
    what not to break.
 7. Open questions that need a product decision, clearly separated from defects.

Also append every new finding to `qa/BUGS.md` (continue the ID sequence after the last one),
update its Summary table, tick what you exercised in `qa/COVERAGE.md`, and commit `qa/` only.

PHASE 4 — PLAN, THEN REVIEW YOUR OWN PLAN, THEN STOP
Produce an implementation plan in `qa/FIX-PLAN.md`:
 - Group every fix into ordered, independently-shippable slices. **Open with the smallest slice
   that is genuinely shippable** — this owner has an explicit standing rule against adding
   features before finishing, so resist bundling.
 - For each slice: the exact files, the change, the risk, and how to verify it on device.
 - Call out anything that cannot be validated in Expo Go and needs a standalone release build
   (custom notification sounds, notification delivery timing, haptics quality, performance numbers).
Then RE-REVIEW your own plan critically: what is wrong with it, what would you cut, what could
regress, what did you assume without evidence. Rewrite it once. Say plainly in the plan which
parts you are least confident in.

STOP RULE — BINDING
When the report and the reviewed plan are written, **STOP and ask the human to implement.**
Do not begin implementing. Do not edit src/. Present the plan and wait.

AFTER THEY IMPLEMENT
They will reconnect the phone and paste this same prompt again. On that run, skip PHASE 1 and
instead: verify every item in `qa/FIX-PLAN.md` was actually fixed, on the device, with a
before/after screenshot and a re-measured ms timing. Then run a fresh PHASE 2 sweep to catch
regressions and anything the fixes broke. Report, plan, and stop again.

SKILLS TO LOAD FIRST
- `frontend-ui-engineering` — layout, responsive behaviour, accessibility
- `make-interfaces-feel-better` — visual detail, alignment, tap targets, motion restraint
- `impeccable` — UI defect audit and polish
- `animation-principles` — duration, easing, overshoot; use it to justify the motion changes
- `motion-art-direction` — consistency of motion language across screens
- `vercel-react-native-skills` and `vercel-react-performance` — RN + React perf idioms
- `performance-optimization` — for the ms measurements
- `web-design-guidelines` — accessibility and interaction review
- `frontend-design` — visual direction judgement for the card/clock redesign
Also read as plain files (not registered with the skill tool):
  .agents/skills/react-native-best-practices/SKILL.md
  .agents/skills/expo-overview/SKILL.md
  .agents/skills/expo-animation/SKILL.md
Note: `expo-native-ui` and friends in another repo's .agents are generic iOS-flavoured Expo
advice. This app is Android-first and deliberately uses a custom navigator, hand-drawn SVG
outlines and a paper texture. Treat those skills as advisory, not as a style to impose.

FIRST ACTION
Read qa/STATE.md and qa/BUGS.md, confirm the gates are green by reading (do not re-run them),
confirm the device is UNLOCKED via `./qa/scripts/adb.sh locked`, then begin PHASE 1.
```

---

## Why this prompt is shaped this way

A short note on the decisions, so you can change them if you disagree:

- **It forbids `src/` edits.** Two audit agents in this session already made code changes. An
  audit that fixes what it finds cannot tell you what is still broken — the evidence is gone.
- **It carries the harness traps forward.** The secure-keyguard incident and the stale-dump
  silent failure each cost a full agent run. Those are the two most expensive things that have
  happened in this project and neither is discoverable from the code.
- **It forbids re-running the gates.** They are already green and deterministic; an agent
  re-running them just burns context.
- **It separates "audit" from "implement" deliberately**, with a stop-and-ask between. Your
  standing rule is to finish one shippable slice before adding more, and an agent that
  implements while auditing tends to do exactly that.
- **It re-runs as a verification pass.** The same prompt pasted a second time becomes the
  regression check, which is how you get an independent read on whether the fixes landed.