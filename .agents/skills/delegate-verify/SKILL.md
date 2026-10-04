---
name: delegate-verify
description: Implement-and-delegate workflow for Marginalia — take test findings or instructions, slice them, generate a scope-locked prompt (via prompt-master-marginalia), dispatch it to a subagent with the task tool, then verify the result with npm run check and on-device evidence before reporting. Use whenever Jossy says "delegate it", "have another agent do X", "implement and hand off", "another agent should take a turn", or when a test/audit report needs its findings fixed or exercised by someone else.
---

# delegate-verify

You are the orchestrator: you slice, dispatch, gate, and report — the subagent does the
hands-on work. The point of delegating is a fresh context that cannot inherit your
assumptions; give it evidence-grounded instructions, not vibes.

## Workflow

### 1. Slice before you dispatch
One task = one shippable slice with a stated exclusion list. If findings arrive as a list
(rank them by user impact), group them into slices of one theme each. Never bundle
"visual + perf + features" into one dispatch. State what v1 excludes in your reply to Jossy.

### 2. Generate the prompt
Load `prompt-master-marginalia` and fill its skeleton with the slice's specifics.
Device tasks get the ground-truth block; repo-only tasks can drop device lines but keep
the gate, exclusivity, and no-commit rules.

### 3. Dispatch
```
task(subagent_type: "general", description: "<3-5 words>", prompt: "<the full generated prompt>")
```
- Dispatch SEQUENTIALLY when tasks share the device or overlapping files — the second
  task's prompt must say it starts only after the first reports (or simply wait and
  dispatch after the first returns).
- Parallel dispatch is allowed only for disjoint files AND no device use.

### 4. Gate the result (never trust "done")
| Claim | Required evidence |
|---|---|
| "code is correct" | fresh `npm run check` output (exit 0, test count) pasted or re-run by you |
| "app works" | screenshot/adb output on the device, path to evidence |
| "data persisted" | force-stop → relaunch → state re-checked, both steps shown |
| "no regression" | the specific behavior before AND after |

Re-run cheap gates yourself when in doubt; a subagent's summary is a hypothesis.
If a gate fails: send the subagent back once with the failure output; if it fails twice,
take the slice back and do it yourself.

### 5. Restore state
After device work: theme/data/uninstall leftovers returned to how you found them
(the prompt's cleanup clause is your checklist — verify it ran, spot-check with
`adb shell` / screenshots).

### 6. Report to Jossy
Short: what slice, what changed (file:line), gate results, evidence paths, what remains
(next slice proposal + exclusions). Include the subagent's key findings verbatim when
they surprise you — the orchestrator must not silently rewrite field reports.

## Rules

- **No commits** unless Jossy explicitly asks in the current session.
- **One device, one driver.** Check for an in-flight device task before dispatching another.
- **Scope locks travel with the prompt**: every dispatch MUST carry MUST-NOT lines
  (files outside the slice, git, uninstall, other agents' data).
- **Stop conditions travel too**: destructive/out-of-scope actions → subagent stops and asks.
- **Test data**: prefixed ZZtest, deleted by its creator at the end; leftovers get
  cleaned in step 5 and listed in the report.
- If a subagent asks a question, relay it to Jossy instead of answering from memory when
  the answer changes the slice's shape.

## Report contract (your final message)

```
Slice: <one line>
Dispatched: <subagent description> → <verdict: passed gates / taken back>
Gates: npm run check <result> | device <result>
Evidence: <paths>
Next slice: <proposal + what it excludes>
```
