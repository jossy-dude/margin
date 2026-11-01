# W4 "Today time truth" visual review — `.shots/w4/` (vision-critic, MiMo V2.6 Flash)

Reviewer: `opencode/mimo-v2.6-flash-free` (project agent `vision-critic`), session
`ses_eb63da1dcffegvwKf9XsQ7eJ9d` (three rounds resumed in one session).
Viewport: 412×915 CSS phone, light theme, @2x PNG.
Saved by the orchestrator from the critic's replies (the agent has no write tool in its catalog).

## Round 1 — the first six frames

Flags raised (as recorded in `tools/w4-assert.mjs` `7d`–`7f` and the fix comments in
`src/screens/Today.tsx` / `src/screens/Week.tsx`):

1. Deck header subtitle clipped — `Period 1 o…` where `Period 1 of 4` was meant (12-hour frames).
2. The 12-hour day list paid for its wider strings with the course name and range
   (`Computer Programming`, `9:00 AM–9:50 AM` truncated).
3. Week: due rows sitting under the FAB.
4. Week: axis labels bare/stale (no meridiem reading in 12-hour mode).

Adjudicated deliberates (confirmed, kept): the taped clock overlapping the card's corner, and an
empty day rendering no deck card (clock + "No classes today" only).

## Round 2 — the re-shot set (10 frames)

- Deck headers, every frame — **PASS**: `Now · Period 1 of 4 · Ⓡ B-12` (live), `First class ·
  Period 1 of 3 · Ⓡ C-4` (picked day), `Period 1 of 4` at the widest state — all complete.
- 12-hour day list — **PASS** (names and ranges whole).
- Week in 12 h — **PASS**: axis reads `8a 9a … 4p`; due rows clear of the FAB.
- Settings / Stats frames — **PASS, no regression** (the Stats frame's copy sits below the fold;
  the sentence itself is covered by the assert, `[7i]`).
- One NEW surface failed: `12h-picker.png` —
  (a) the meridiem control was a lone flipping `AM` chip, which in a static frame reads as a label
      (nothing on screen says PM exists);
  (b) the day-strip cards print the weekday twice on non-first cards (`Tue 20 Tue`);
  (c) a rectangular focus ring on the `✓ Done` chip.

## Round 2b — the picker re-check (after the in-pass fix)

- The AM/PM pair now sits under the steppers — **PASS**: both halves visible, the active one
  (AM, matching the pen's `10:00 AM`) filled brown, the inactive outlined — the sheet's own
  choice-chip convention. Layout slot judged comfortable between the steppers and `+ Start date`.
- (b) and (c) **acknowledged as adjudicated** — (b) is byte-identical in `HEAD` (pre-existing
  label logic; the top slot's month anchor only fires on the first card / the 1st), and (c) is the
  browser's default focus outline (app-wide focus styling, kept for keyboard use). Both recorded in
  `STATE.md` as candidates for a later polish decision, not W4 fixes.

## Verdict

**W4 visuals: PASS.** All four round-1 flags are resolved on the re-shot frames, the one new
surface the review caught (the picker's meridiem affordance) was fixed and re-checked in the same
pass, and nothing in the frame set is failing on the checklist. The two pre-existing findings are
logged, not silently dropped.
