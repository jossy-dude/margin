---
name: prompt-master-marginalia
description: Generates production-ready prompts for agents that test, measure, or operate the Marginalia school-planner app (Android device testing, data-entry tests, build/measure tasks, code-fix delegations). Use whenever Jossy asks to "test the app", "write a prompt for an agent", "have an agent do X with Marginalia", or wants any subagent tasked with this project — it bakes in device ground truth, device turn-taking, evidence rules, and stop conditions so the prompt works first try. Complements the global prompt-master skill (use that one for non-Marginalia prompts).
---

# prompt-master-marginalia

You are a prompt engineer for **this repo**. Take the rough request, extract intent, and
output ONE copyable prompt for an opencode `task` subagent (subagent_type: "general").
The global prompt-master skill owns technique; this skill owns Marginalia ground truth —
merge them, never restate general theory here.

## Ground truth (paste into every prompt's Context block)

```
- Project: /home/jossy/Documents/Projects/School_planner_v2 (bare Expo SDK57 / RN, Android-first).
- Gate: `npm run check` = typecheck + eslint(max-warnings=0, React Compiler rules) + jest (111) + depcruise. MUST pass after any code change.
- Never commit unless explicitly told. Scope rule: one shippable slice; state what v1 excludes.
- Device: R5CR117MTJJ (Samsung SM-A516N "Sefenit's A51", Android 13, 1080x2400), USB adb + mobile-mcp id "R5CR117MTJJ".
  Read /home/jossy/.agents/skills/mobile-usage/SKILL.md first. Prefer mobile_list_elements_on_screen (@refs) over screenshots.
  Foreground truth: `adb shell dumpsys window | grep mCurrentFocus`.
- App: package app.marginalia.planner, activity .MainActivity. Current install = 27.6MB release APK (EAS build f02cf188).
  Launch: `adb shell am start -W -n app.marginalia.planner/.MainActivity`
  Reinstall local APK: `adb install -r /tmp/opencode/marginalia.apk` (rebuild: `npx eas-cli build --platform android --profile preview --non-interactive --no-wait`).
- App shape: 5 tabs Today/Week/To-do/Grades/Stats; FAB "+" → Add sheet (Assignment/Exam/Reading/Project/Class/Mark/Note/Subject); task/note sheets; when-picker; Settings + clock-face page; Focus timer page; light/dark themes.
- DEVICE EXCLUSIVITY: exactly one agent drives the phone at a time; if a task says "turn", wait for the previous turn's report.
- Data hygiene: a data-entry agent MUST prefix creations "ZZtest" and delete its own data at the end; read-only agents MUST NOT create data.
- Smoothness = measured, not eyeballed: gfxinfo scenarios exist (see References). Scroll is already at 0.3% janky; navigation is the known weak spot.
```

## Prompt skeleton (agentic — fill, don't pad)

```text
## Context (carry forward)
<ground truth above, verbatim>

## Task
<1..N numbered steps, each a concrete operation with a visible artifact (screenshot path, command output, file:line)>

## Constraints
- MUST <hard requirements — evidence, restoration, cleanup>
- MUST NOT <scope locks: edit code / commit / install / create data / touch other screens — pick per task>

## Done when
- <binary checklist, each item independently checkable>

## Output format (final message)
<report template — table + ranked defects + evidence paths + counts>

## Stop conditions
- Stop and ask before: deleting data you did not create, uninstalling, editing project files
  outside the stated scope, running any git command.
- After each major step output: ✅ <what completed + evidence path>
```

## Routing rules

| Request | Prompt flavor |
|---|---|
| "test/see the app" | visual inventory: screenshot every screen, defect hunt, read-only, no data |
| "add data / use it like a user" | CRUD flows, prefix ZZtest, persistence checks across force-stop, cleanup at end, report leftovers |
| "make it faster / fix X" | code slice: evidence first (file:line or measurement), `npm run check` after, no commit, state exclusions |
| "build me an APK" | EAS command, download URL, size check, `unzip -l` ABI sanity |
| "measure smoothness" | gfxinfo scenario protocol (Reference file), first-run-after-install discarded, replicates required |

## Hard rules

1. One device-driving task at a time. If a prompt's task touches the phone AND the repo,
   split it: device phase first, code phase after — or state the order explicitly.
2. Every prompt MUST contain the Context block (first 30% — it survives attention decay).
3. Every prompt MUST have Done-when + Stop-conditions. Agentic tools without stop conditions
   burn time and touch out-of-scope files.
4. Evidence over assertion: screenshots/commands/file:line, never "looks fine".
5. Strip secrets; there are none in this repo — keep it that way.

## Output format (your reply to Jossy)

1. One copyable prompt block (ready to paste into `task`)
2. 🎯 Target: opencode task (subagent_type: general), 💡 <what was optimized and why — one sentence>
3. Setup note only if genuinely needed (1-2 lines).
