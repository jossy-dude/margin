# W4 — Today: time truth (countdown legibility, ranges, 12/24h, midnight)

**let's make v1 first.** The scope below is one shippable slice. The exclusions list is part of the
contract. Owner row: "home card / time ranges" (PLAN W4: live countdown + ranges + relative labels +
12/24h device setting + midnight/day-boundary correctness; unit tests for the math).

## Already built — verify, do not duplicate (recent commits, 43148dc etc.)

- Live countdown: `src/screens/Today.tsx` deck slot (:123–228; `COUNT_H = 68`, `Txt f="type" s={42}`
  tabular-nums, letterSpacing −1.7), states from `deckOf` (:59–100) with unit words; tick is
  per-second only while live.
- Relative labels: header (:297/:307) `at 08:30 · in 25 min` via `relDue` (`src/screens/common.tsx:61–64`,
  already has a tomorrow form); task cards (:97).
- Midnight carry: `selectedDay` (`src/domain/time.ts:12–15`), overnight ends (`occEnd`), the DST fix
  (eac2a65). What is NOT proven: the tests.

## v1 deliverables

1. **12/24h times (D8 fork).** Settings gains a toggle (**default: 24-hour clock ON** — today's look
   unchanged out of the box). Wire it through `fmtTime`/`fmtWhen` and every user-facing time-of-day
   print: Today (header, day list, non-today slot), Week, Tasks/forms (`WhenPicker`), Settings reminder
   rows — grep all call sites; notification/alarm bodies only if the setting is already reachable there
   cheaply, else leave and note. Constraints: `domain/` stays pure (no store import); one source of
   truth; persisted in the existing settings KV the way the other settings are. Convention — pick one
   and pin it in tests: 12h = unpadded hour + AM/PM ("8:30 AM"), 24h = "08:30".
2. **Ranges.** Class windows show as a range:
   - day list (:327–331): the time column is stacked start (bold 20) / end (serif 14) in a 54-wide
     column — make it a single-line range ("08:30–10:00", en dash), widening the column and sizing the
     numerals as needed to stay legible at 412; the vision round judges row harmony;
   - non-today deck slot (:92): the window ("09:00–10:30") instead of the bare start time — it must fit
     the card (measure; choose size/presentation; no wrap). Live/soon countdowns stay durations.
3. **Countdown numerals legibility** (vision-baseline #4: the s42 "42:23" has ambiguous 2/3 glyphs;
   letterSpacing −1.7 may crowd them). Present the countdown in the clearest numeral face this app owns
   at that size — candidates: Special Elite with normal tracking, Newsreader, Permanent Marker at a
   fitting size — while KEEPING tabular stability ("10:00" and "9:59" render the same width; prove in
   the DOM). Do not restyle the card. Also measure the baseline's "compass clock overlapping the dark
   card" [measure to confirm]: if the built page shows a real collision (not a deliberate tape
   gesture), give it clearance; the vision round adjudicates the after-shots.
4. **Midnight/day-boundary correctness + the math tests** (asked explicitly). Unit tests for: `deckOf`
   across midnight (23:50–00:10 class; at 00:05 the deck speaks of the next class), non-today window
   display, `relDue` tomorrow form, `fmtDay` flips, `selectedDay` carry, `fmtWhen`. Fix what they
   reveal. Known copy bug to fix and pin: when the next class is tomorrow, the header prints
   `at 08:30 · tomorrow 08:30` (relDue already carries the time) — dedupe into one truthful line.
5. **UX-4 (audit, re-verified shape).** Today's last row vs the tab bar (audit: rows y≈819–883, bar
   841–897). FIRST verify at scroll-end in the built page (scroll to bottom, measure last content
   bottom vs bar top — `pageBottomPad` is already `navHeight + FAB + FAB_GAP + 24`, so the audit may
   have measured mid-scroll). If content genuinely does not clear: fix (`fit.ts` `pageBottomPad` or
   Today) and re-verify on Today + Week. If it already clears: capture the proof, change nothing.

## Out of scope (v1 excludes)

- Follow-device locale detection (D8 records the fork; needs expo-localization, unverifiable here).
- Week/grid redesign; the week screen gets only formatter compliance if it prints times.
- Notification/alarm body formatting beyond cheap reach (W5/W6 own those bodies).
- The tab bar's own look; seconds-precision changes; new screens; tour copy (W8); Focus dial (shipped).

## Evidence contract

- `tools/w4-assert.mjs` (Playwright, port 8098, 412×915, scope asserts to the visible screen — the
  navigator mounts all six): ranges present (day list + non-today slot), 12h toggle flips strings
  across Today + one more screen, countdown width stable across digit changes, non-today slot width
  fits, UX-4 scroll-end geometry. Screenshots `.shots/w4/`: today with a picked tomorrow (window in
  slot), today live, header tomorrow case, 12h-on variant, day-list after. Print measured numbers the
  way `tools/w3-assert.mjs` does.
- `npm run check 2>&1 | tee /tmp/opencode/logs/w4-check.log` green. Tests pin source strings — if a pin
  legitimately changes, update it deliberately with an in-file rationale comment.
- Update `docs/DEVICE_CHECKLIST.md` §W4 (append format): countdown legibility at 1× on the A51; the
  toggle on-device + a real notification if bodies were touched; day-list column spacing on-device;
  scroll-end vs the bar; the 23:59 → 00:00 rollover watched live.
- Leave everything uncommitted; report the geometry/strings, assertion output, check line, and anything
  not provable from inside the browser.

## Model note

Builder: `opencode/deepseek-v4.1-flash-free`. Vision judge: MiMo V2.6 Flash. No new dependencies
without asking — none expected in v1.
