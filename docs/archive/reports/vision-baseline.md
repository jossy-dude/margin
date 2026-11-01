# Baseline visual review — `.shots/baseline/` (vision-critic, MiMo V2.6 Flash)

Reviewer: `opencode/mimo-v2.6-flash-free` (project agent `vision-critic`). Session 2 of 2 —
attempt 1 errored ("Timed out waiting for response headers", provider side, before any image read).
Captures: `tools/cap-baseline.mjs` @ 412×915 CSS, @2x. This is the "before" record for W2 (grain),
W3 (focus dial), W4 (Today countdown), W7 (stats), W8 (onboarding). Reproduced verbatim below.

---

## Observations (per image)

**onboarding-1** — Stacked paper cards with washi tape, marker headline, italic serif body; nav mock
and FAB annotated with hand-written captions.
- Strong: the paper/tape metaphor and the "hand annotates the UI" idea read instantly; headline vs
  body hierarchy is clear.
- Weak: big empty gap between the card stack and the tab-bar mock; caption "five tabs along the
  bottom" floats unanchored; "1/5" and dots are faint.

**onboarding-2** — Swipe demo: done card, crumple sketch, arrows.
- Strong: green Done / red Crumple / brown arrows encode direction well; strikethrough on the
  finished task is a nice touch.
- Weak: large dead zone between the crumple caption and the headline; "…and it stays there for six
  seconds." sits alone mid-page; Next button has a stray rectangular focus box around it [measure to
  confirm]; back button crowds "2/5".

**onboarding-3** — Two attendance cards, lock states, Here/Late/Absent/Sick chips.
- Strong: best-composed step; locked (black pill) vs Lock (outline) is legible.
- Weak: dashed cells are very low contrast against cream; second card's dashed divider blends in;
  large empty band above the headline.

**onboarding-4** — Big dial, duration chips, tape note, "Try it" dashed pill.
- Strong: dial + chips mirror the real Focus screen, so the tutorial transfers.
- Weak: **center "25" is buried in the rosette scribble and crossed by the hand — barely readable**;
  outer 60/15/30/45 ring competes with roman numerals (two scales); grey ring band looks
  flat/untextured versus rest of app.

**onboarding-5** — Tab legend card + version note.
- Strong: icon+name+one-line gloss is the clearest step of the five; Start button well placed.
- Weak: card floats in a lot of vertical whitespace top and bottom; back button overlaps/clips the
  "5/5" glyph [measure to confirm]; footer note lines are small and grey-on-grey.

**today** — Dark "Now" card, compass clock, week strip, schedule list.
- Strong: the black card is a confident focal point; "42:23 min left" plus tick-marked progress and
  dashed "After…" line is a good countdown story.
- Weak: compass clock bottom overlaps the dark card's top-left corner [measure to confirm]; the
  numerals in "42:23" use ambiguous hand-drawn glyph shapes (2/3 read oddly); fourth schedule row is
  cut behind the tab bar and a stray "Next…" + partial circle peek out below the bar; tick marks
  above/below the bar add noise.

**week** — Grid with hand-drawn blocks, now-line, due list.
- Strong: irregular block outlines and red flag glyphs are charming; Fri column highlighted.
- Weak: blocks bleed past grid lines (Fri DM, Thu DS); "ItE"/"DS" abbreviations are cryptic; bottom
  "Library book due" clipped by tab bar.

**tasks** — Filter chips then Late/Today groups.
- Strong: red card borders for Late; meta line with "4 d late / ~45m / tight" colour-coding works.
- Weak: three chip rows before content = heavy; "Newest" orphaned on its own row; subject chips cut
  off at right edge ("Dis…"); "tight" wraps alone onto line 3 in Problem set 5; last card under tab bar.

**grades** — Per-subject cards with weights, marks, curve, attendance row.
- Strong: big marker numerals for scores; legend row (✓ here, L late, × absent, S sick) is genuinely
  readable.
- Weak: **first attendance cell is clipped by the card's left edge** [measure to confirm]; weight
  percentages are faint; card cut mid-row by tab bar.

**stats** — At-a-glance rings, two heatmaps.
- Strong: rings with big % labels and supporting "71/71 classes" lines are clear.
- Weak: **4th ring "Focus stre…" and its sub-label are cut off by the card edge and rendered
  faded/grey**; heatmaps have no intensity legend; bottom two rows of each heatmap are horizontally
  offset from the rows above (looks broken) [measure to confirm]; M/W/F labels only cover 3 of 7 rows.

**focus** — Photographic collage (Venice torn photo, watercolor landscape, botanical), white dial,
chips, Start.
- Strong: most atmospheric screen; collage/torn-edge language is at its best; dial face is clean and
  centre "25 min" pill is high-contrast and readable.
- Weak: photo collage style is far richer than the rest of the app (inconsistent); hand sits at ~4
  o'clock in idle with no meaning; "ready when you are" and "focus doesn't happen by accident" are
  tiny and faint; break chip grey-on-grey.

**focus-running** — Same, center shows "24:57", Pause.
- Strong: countdown digits are legible, monospaced, on a solid pill.
- Weak: countdown is small relative to a 460px dial — the number should own the face; hand doesn't
  reflect remaining time; "25m to go" underneath duplicates and is faint; duration chips grey out to
  near-invisible (25 chip grey-on-grey); orange progress dot at dial top is tiny.

**task-sheet** — Assignment form.
- Strong: labelled groups, chip pickers, calm cream surface.
- Weak: very dense — 7 stacked sections; chips clipped at right in three rows (type, subject,
  quick-due); yellow "No due date" field introduces a colour used nowhere else; stray ".." fragment
  above the Add button; Add button looks disabled (muted) with empty form.

**settings** — Modal list over dimmed To-do.
- Strong: icon + name + one-line current-value is exactly the right density; dividers are light and
  consistent.
- Weak: background dimming is subtle so header text competes; name field's underline runs full-width
  and reads as a divider, crowding "SETTINGS"; no visible scroll affordance for rows below
  "Data & export".

## Top weaknesses
1. **[countdown]** Focus dial center countdown too small for the dial; hand doesn't track remaining
   time (focus-running).
2. **[focus dial]** Onboarding-4 center "25" illegible inside the rosette + hand overlay; dual
   60/roman scales.
3. **[other]** Heatmap rows horizontally offset and clipped 4th ring/label (stats).
4. **[countdown]** Today "42:23" ambiguous hand-drawn numerals + compass clock overlapping the dark card.
5. **[grain/other]** Focus screen's photo-collage richness doesn't match the drawn-paper language
   elsewhere.
6. **[onboarding]** Dead vertical zones on steps 1/2/3/5; stray focus box on Next; back button
   clipping "5/5".
7. **[other]** Content clipped under tab bar (today, week, tasks, grades) and chips clipped at right
   edge (tasks, task-sheet).
8. **[other]** Grades first attendance cell clipped at card edge; task-sheet density + stray ".."
   fragment.
