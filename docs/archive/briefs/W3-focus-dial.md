# W3 brief — Focus dial: a see-through face and a taped time label below it

**let's make v1 first.** This is a two-part workstream: the dial readout redesign (owner's locked
default) and the session-log completion (D2). Nothing else on Focus moves.

- Branch: `v2-improvements`. Do **not** commit — the orchestrator reviews and commits.
- Depends on: W2 committed (both touch `src/App.tsx`-adjacent screen code; start only after the
  orchestrator says the tree is free).
- Builder: `opencode/deepseek-v4.1-flash-free` (project agent `builder`). Load the `impeccable` skill
  if available and read its craft-floor reference before editing — this is a UI workstream inside the
  hand-drawn paper world; the design language in `docs/BATCH-2026-10-14.md` and the file's own
  comments are the standard.

## Part A — the dial readout (the locked default)

**Owner's chosen default:** the dial face becomes **see-through**, and the time readout leaves the
face's centre for a **taped paper label below the dial**. The alternative (translucent readout kept in
the face centre) is screenshotted for DECISIONS — it is not shipped.

Context you are changing (all in `src/screens/Focus.tsx`, read the file first — its comments explain
every decision you must not undo):

- The time currently lives in a paper **capsule on the dial's centre** (`Dial`, lines ~114–125):
  a `handPath` paper hub filled `c.card`, the `readout` text (type 27), plus three motion effects
  riding the hub — the per-tick wash (`tickS`), the last-10-seconds red ring (`warnS`), the flow-
  overtime accent flood (`washS`).
- The face itself (`ClockFace` at ~line 104) is fully opaque; the owner asked to see its centre
  artwork (guilloché, rosettes) — the capsule hid exactly that.
- Below the dial box (y 632 in the 440×1001 canvas): `subText` at y 640, the preset row at y 672.

### Requirements

1. **Taped label below the dial.** A hand-cut paper slip (existing kit: `HandBox`/`Tape`, the same
   vocabulary as the rest of the page) carries the time (`bigText`) as its primary line. It must sit
   entirely **below the face circle** — the face circle is 236 units wide, centred in the 282-unit
   dial box at (left 76, top 350), so its bottom edge is y ≈ 609 in canvas units.
2. **Face see-through.** The face artwork renders with opacity < 1 (pick 0.78–0.92; the page's paper
   and grain should read through it while the artwork stays legible). The feather veil, the progress
   rim ring and the pointer hand stay at full opacity and unchanged.
3. **The three hub effects get explicit new homes — or a documented removal.** The per-tick wash, the
   last-10-seconds warning, and the flow-overtime flood must each visibly survive somewhere sensible
   (the label is the readout now — a tick flash, a red pen border, an accent underline are the obvious
   candidates). Keep every one collapsed under reduce-motion exactly as its old form was. State in
   the summary where each went.
4. **Nothing below may collide.** `subText` and the preset row (y 672) currently occupy the space
   directly under the dial. You may shift the controls cluster **down by at most 24 canvas units**
   (there are ~150 free units below `end session`) to seat the label without crowding; nothing else
   moves, no control disappears, no control changes size or order. `subText` must remain visible at
   ≥12 pt with its halo or on paper.
5. **Dead code goes.** The capsule machinery (`CAP_*`, `hub`, hub paths, `CAP_RAD`) that no longer
   renders is removed cleanly; nothing else in the file may become unused. The drag-to-set gesture,
   the accessible adjustable wrapper, `a11y` labels and values change **not at all**.
6. **Measure, don't claim** — three stable handles for the deterministic assertion (RNW renders
   `testID` as `data-testid`): the dial wrapper `focus-dial`, the face wrapper `focus-dial-face`,
   the new label `focus-time`. Write `tools/w3-assert.mjs` (Playwright, phone viewport, one session —
   the web build is the MemoryRepository): scope every query to the **visible** screen (the Book
   navigator mounts all six; see `tools/cap-baseline.mjs` `tap()` and STATE deviation 5), focus-screen
   entry via `tab-focus`, and assert:
   - the `focus-time` bounding box lies **entirely outside** the circle of radius 118 centred on the
     `focus-dial` box's centre (that circle is the face);
   - the computed `opacity` of `focus-dial-face` is **< 1**;
   - `focus-time` shows the minutes in the `set` phase and changes when a round runs (one `Start`
     click, wait ~5 s, text differs).
   Run it against a web server you start on **port 8098** (`BROWSER=none npx expo start --web --port
   8098`); 8099 belongs to another session. Log to `/tmp/opencode/logs/w3-assert.log`.
7. **Both variants, screenshotted.** Capture the shipped default (`w3-default.png`) and, for the
   DECISIONS entry, the alternative (**translucent in-face readout, face also see-through, no label
   below** — build it as a temporary edit, capture, then revert; the final tree contains only the
   default). Save to `.shots/w3/` with the same viewport and state (set phase + a running phase for
   each). The orchestrator runs the vision review on these; leave them on disk.

## Part B — the session row (D2)

The finish path already writes a `focus_session` row; migration 2 added `mode` and `completed` columns
but nothing binds or writes them yet. Investigate then fix minimally:

1. Bind `mode` and `completed` in the data layer so they round-trip: `SPECS.focus` fields,
   `FocusSession` type, memory adapter, export shape (`src/services/export.ts` — the JSON path and
   its table). Existing rows read back with the schema defaults (`'focus'`, `0`/false) — a row from
   before this work must load and re-export unchanged in meaning.
2. The finish path (`act.timerFinish` / wherever the row is written, `src/store/store.ts` +
   `src/domain/timer.ts`) writes honest values: a completed focus round → `mode: 'focus'`,
   `completed: true`; an ended-early round → `completed: false`; a break is not written as a study
   session. **Do not invent semantics the timer does not have** — read `view()`/the finish code and
   follow what is actually known at that moment; state your mapping in the summary.
3. **Prefill check (link-to-work item).** Verify the row carries the `taskId`/`courseId` the screen
   shows (start focus from a task → the task box shows it → the written row must name it). Where the
   chain has a gap (e.g. after swap-task or after a pause), fix the minimal link; do not add new
   entry points or UI.
4. Tests: a store/domain test proving finish writes `mode`/`completed` correctly for (a) a full
   round, (b) an early end; and a repo test proving both columns round-trip through `load`/`seed`
   on both adapters. Extend existing test files; do not weaken pins.

## Evidence required

- `npm run check 2>&1 | tee /tmp/opencode/logs/w3-check.log` green.
- `tools/w3-assert.mjs` output (all three assertions pass) → `/tmp/opencode/logs/w3-assert.log`;
  screenshots in `.shots/w3/` (default ×2 states, alternative ×2 states).
- Summary: per item what changed where (file:line), where each hub effect went, the mode/completed
  mapping you implemented and the code that proves it, what is **UNVERIFIED-ON-DEVICE** (drag feel,
  face opacity on a phone's screen, tick/warn legibility), and open items.
- `docs/DEVICE_CHECKLIST.md`: append a `## W3` section per its footer protocol (face see-through in
  both themes; label position/legibility incl. largest font size; tick/warn/wash behaviour; drag
  still sets minutes; a finished round saved with the right task name).

## Out of scope

Timers' internals beyond the finish-row mapping; Today/Stats consumers (W4/W7); the clock-face ids in
`faces.ts` (no face is added or removed); session-list UI (W6).
