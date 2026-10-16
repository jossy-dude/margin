# W3 focus-dial redesign review — `.shots/w3/` (vision-critic, MiMo V2.6 Flash)

Reviewer: `opencode/mimo-v2.6-flash-free` (project agent `vision-critic`).
Viewport: 412×915 CSS phone, light theme, @2x PNG.
Judged: `w3-default-set.png`, `w3-default-running.png` (shipped default); `w3-alt-set.png`,
`w3-alt-running.png` (alternative, comparison only). Regression reference: `.shots/baseline/focus.png`
and `.shots/baseline/focus-running.png`.
Saved by the orchestrator from the critic's reply (the agent had no write tool in its catalog).

## Verdicts at a glance

1. See-through face — **PASS**
2. Slip seating — **PASS** (tight clearance between tape corner and dial rim — measure to confirm)
3. Running-state consistency — **PASS**
4. Screen integrity after the controls drop — **PASS**
5. Default vs alternative — **default** (paragraph below)

## Observations (what is actually visible)

**w3-default-set** — The baseline Focus screen with one addition: a cream time slip reading "25 min" now
sits below the dial instead of a capsule inside it. Header pill reads "Round 1 · ready ○○○○". The dial
centre shows the complete guilloché rosette — no box punched through it — with faint blue/green watercolor
tone visible through the face disc; roman numerals, tick ring and the hand are solid black. The slip
carries a beige tape strip at its top-left corner, and the first character of "25 min" sits partly over the
tape's right end [measure to confirm]. Below it, in order: italic "ready when you are", the torn strip with
25/45/50/90 + Flow on, the dark Start button, then break·5m / leave.

**w3-default-running** — Identical geometry; the slip reads "24:56", the status line reads "25m to go", a
small orange progress dot appears at XII, Start becomes Pause, leave becomes end session, and the 25 chip
greys out. No text overflow, no reflow.

**w3-alt-set / w3-alt-running** — The time ("25 min" / "24:55") sits in the face centre on a pale
translucent readout; there is no slip, so a visible empty band remains between the dial's bottom rim and
the lone status line, while presets/Start/break stay at the same y as the default build (the cluster was
not moved back up). The readout's backdrop covers the heart of the rosette, and the digits cross the
pattern lines (contrast still holds). In running, the readout sits over the hand's hub, so the pointer
emerges from beneath the text [measure to confirm].

**Baseline reference** — Pre-W3 had an opaque cream capsule covering the rosette centre, controls sitting
~20 units higher, no slip. Everything else on the screen is unchanged in W3.

## Checklist verdicts

1. **See-through face — PASS** | centre of the dial: the rosette is fully unobstructed (baseline hid its
   middle behind the capsule), tonal wash from the paper world is visible through the face disc, the face
   is not washed out (numerals and tick marks stay crisp), and the hand plus the orange progress dot at XII
   remain clearly readable over it. Caveat: the transparency gain over baseline is subtle in a still — the
   strongest visible evidence is the wash inside the numeral ring, not a dramatic see-through effect; I
   cannot judge the exact 0.86 value from pixels [measure to confirm]. I also cannot confirm a distinct
   progress-rim *arc* (as opposed to the XII dot) at this size.

2. **Slip seating — PASS (tight)** | centre-bottom, between dial and status line: the slip sits entirely
   below the dial's torn rim with no drawn overlap onto the face artwork; the tape's top edge comes within
   a very few pixels of the rim's curve on the left [measure to confirm] — visually adjacent, not
   overlapping. No contact with "ready when you are" or with the preset strip's torn top edge. Tape +
   near-straight card matches the app's hand-placed language. The countdown is large (about half the dial's
   inner width) and instantly legible at phone size.

3. **Running state — PASS** | whole controls cluster: slip box, tape and status position are unchanged
   between set and running; "25 min" and "24:56" are the same glyph count so there is no width jump;
   status swaps to "25m to go" in the same slot; label/state changes (Start→Pause, leave→end session, 25
   chip grey) are consistent. The hand sits at the same ~4:30 angle in both states — a carry-over baseline
   issue, not a W3 regression.

4. **Screen integrity — PASS** | whole screen after the ~20-unit drop: nothing clipped (header, task card,
   dial, presets, Start, break/leave, bottom collage all fully rendered), no collisions; slip → status →
   preset strip → Start → break/leave all keep visible gaps. The tightest is slip-bottom → status line
   (single-digit pixels at this scale) [measure to confirm], and the bottom button row still clears the
   landscape collage.

## 5. Default vs alternative

The **default** better satisfies "show the face's centre artwork while keeping the time readable at a
glance." It is the only one of the two where the rosette reads as a *complete* medallion — the
alternative's readout lands exactly on the artwork's focal centre, so the pattern it is meant to reveal
still has a box punched through it, and its digits cross the busiest lines of the drawing. The default's
time also sits on a clean cream ground, giving the strongest ink-on-paper contrast. The trade-offs are
honest: the default makes the eye travel from dial to slip (two fixations instead of one), its tape sits
within a hair of the rim, and it squeezes the status line; the alternative keeps time and progress as a
single instrument, needs no extra element, and leaves the rim uninterrupted — at the cost of covering the
rosette's heart and leaving a dead band under the dial where the status line floats alone. If glanceability
is the worry, fix it inside the default (nudge the slip up a hair, or make progress bolder) rather than
swapping designs.

## Fixes

No FAILs — nothing must change to ship. Optional tightening, worst first:

1. **Tape/rim clearance** — if measurement shows the tape corner grazing the dial's torn rim, drop the slip
   ~4–6 units (or trim the tape strip's top edge) so a visible paper gap remains.
2. **Tape under the first digit** — shift the time text right ~6–10 units (or shorten the tape) so the
   digits don't sit on the tape; it reads okay now, but it is the one place that looks accidental.
3. **Status line breathing** — the gap from slip bottom to "ready when you are" is the screen's tightest;
   buy it back from the slip's bottom padding rather than pushing the presets down further.
4. Optional: confirm the progress rim draws an arc, not just the XII dot — I can only see the dot at this
   size [measure to confirm].

## Top weaknesses (W3 delta)

1. Slip tape corner sits within a few pixels of the dial rim (possible graze) [measure to confirm].
2. Status line squeezed between slip and preset strip (tighter than baseline).
3. Transparency gain over baseline is subtle in a still — worth a 2× side-by-side check.
4. Alt variant leaves a dead band under the dial and occludes the rosette heart.

## Round 2 — re-judgement of the tightening fixes

Same reviewer session, same four screenshot paths (re-captured from the fixed build; slip top 612→618,
height 42→38, controls dropped 20→22, tape narrowed 46→40 and moved out over the paper's left edge).
Browser-measured clearances: tape → feather rim 12.3 canvas units (was inside the 122-radius fade),
tape → first glyph 16.6 (was an overlap), slip → status 6.0 (unchanged on purpose), slip → drawn face
circle 9.0 (was 3.0).

1. **Tape vs dial rim — PASS.** Both default shots show a continuous band of bare paper between the dial's
   torn bottom rim and the tape's top edge; no graze, reads as deliberately stuck below the dial.
2. **First glyph clear of tape — PASS.** "25 min" and "24:55" both start on the cream card with a visible
   gap right of the tape's edge.
3. **Slip → status gap — PASS (tight but acceptable).** Renders as a small clean strip; neither touches
   the slip's bottom border nor the preset strip's torn top edge; stays legible.
4. **Tape overhang + anything new — PASS.** The tape hanging ~14 units past the slip's left paper edge
   reads as the same hand-placed device used at the task card, the preset strip and the photo tape —
   consistent language, not an error. No new problems: slip centred, doodle unobstructed, controls at the
   22-unit drop still breathe, bottom row clears the collage, nothing clipped in either state.
5. **Alt shots — CONFIRMED, unchanged design point.** Translucent in-face readout over the rosette, no
   slip, status line alone below the dial (a couple of units lower with the 22-unit drop).

No regressions seen; no new fixes required.
