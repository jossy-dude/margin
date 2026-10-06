# CARD-GAP — the active-class card, reference vs. app

**Agent A5 · design of record:** `/home/jossy/Downloads/marginalia-v10(1).html`, the `deck()` function
(line 236) plus its CSS (`.dk`, `.tg`, `.cnt`, `.bar`, `.aft`, `.R`, `.c`, `.tape`) and its data model
(`SJ[key] = [name, room, teacher]`, `TT[day] = [[start, end, key]]`, `m()`, `tf()`, `isX()`).

**Owner's brief, verbatim:** *"I already love the design of the card from this html. Just do minor
refinements. Nothing more."* Everything below is measured against that, not against taste.

**How the reference was measured.** `deck()` was read out of the `<script>` and re-run with the clock
pinned, so both of its states were seen rather than guessed:

```bash
./qa/scripts/render.sh html "/home/jossy/Downloads/marginalia-v10(1).html" /tmp/render/A5-v10-full.png 411 3000
# `new Date` stubbed to Tue 6 Oct 2026 09:24 so deck() lands INSIDE class 1 (09:00–09:50):
./qa/scripts/render.sh html /tmp/render/a5/ref-now-light.html /tmp/render/a5/A5-ref-now-light.png 411 900
./qa/scripts/render.sh html /tmp/render/a5/ref-now-dark.html  /tmp/render/a5/A5-ref-now-dark.png  411 900
```

Looked at: `/tmp/render/A5-v10-full.png` (whole page), `/tmp/render/a5/pair-ref.png` (the card,
light beside dark), `/tmp/render/a5/zoom-corner.png` (the top-left corner at 500%, to settle whether
the card has a visible ink rim — **it does not**), and `/tmp/render/a5/cmp-B.png` (app-today beside
reference beside proposal, all at 411 px).

The side-by-side mockup is `/tmp/render/a5/mock.html` — a faithful JS port of `src/ui/hand.ts`, of
`DayBar`'s Bookshelf, and of the reference's own `BR.spines`, drawn in the app's real palette and its
real four fonts. Rendered to `/tmp/render/a5/A5-mock-light.png` and `A5-mock-dark.png`.

---

## 1. What the reference card actually is

`deck()` returns one element. Top to bottom, with the values its own CSS sets:

| Slot | Content | Type | Notes |
|---|---|---|---|
| `.dk.c` | the card | `border-radius: 255px 14px 225px 14px / 14px 225px 14px 255px`, `border: 2.5px`, `filter: url(#rough)` | **`.dk` re-points the tokens: `--ink: var(--p0)`, `--card: var(--i0)`, and `color: var(--p0)`. In light that is a near-black slab with cream text; in dark it is a cream slip with near-black text. The card always inverts against the page.** |
| `.dk::before` | the surface | `repeating-linear-gradient(45deg, ink 8%, 0 1px, transparent 1px 5px)` + `radial-gradient(110% 130% at 18% 0%, ink 14%, card)` | the diagonal hatch, visible at 500% |
| `.tg b` | state word | Caveat **700 22px**, `background: var(--p0)`, `color: var(--i0)`, `padding: 0 10px`, `rotate(-2deg)` | `"Now"` when a class is live, `"Next up"`, `"First class"` on a day that is not today, `"Rest day"` |
| `.tg span > .R` + text | room | `Permanent Marker`, 2.5px `currentColor` ring, `border-radius: 50%`, `rotate(-7deg)`, then the room code | the circled R is a hand-stamped "this is a room" mark |
| `h2` | subject | `Permanent Marker 400 32px / 1.05`, `margin: 8px 0 6px` | wraps to two lines on a long name |
| `.cnt` | countdown | `Special Elite 400 42px/1`, `letter-spacing: -.04em`, `font-variant-numeric: tabular-nums` | `tf()` = `MM:SS` under an hour, `H:MM:SS` over — the app's `fmtClock` is the same function |
| `.cnt small` | unit | Caveat **700 22px**, `align-items: baseline`, `gap: 9px` | `"min left"` in a class, `"until it starts"` before one, `"first bell"` on another day |
| `.bar` | progress | `height: 48px`, `margin: 10px 0 2px`, `role="img"` | `BR[S.bar](left)` where `left = (end − now) / (end − start) × 100` — **percent of THIS period still to run**, 1 → 0 |
| `.aft` | what is next | `border-top: 2.5px dashed`, `padding-top: 8px`, Newsreader italic 17px, `b` = Caveat 700 20px non-italic | `"After"` + `name · room`, or `"last class of the day"`, or `"nothing scheduled"` |

Its states, from the code:

| State | Word | Countdown | Unit | After |
|---|---|---|---|---|
| inside a class, today | `Now` | `end − now` | `min left` | the class after this one |
| gap between classes, today | `Next up` | `next.start − now` | `until it starts` | the one after that |
| a day that is not today | `First class` | the **start time as text** | `first bell` | the second class |
| no classes left | `Rest day` | `--:--` | `nothing on` | `nothing scheduled` |

Cancelled classes (`isX` → status `c` or `t`) are filtered out of `pl` before anything is chosen.

---

## 2. The gap table

Severity: **H** = the reference's core idea is absent or wrong · **M** = a real inconsistency or lost
information · **L** = polish.

| # | Element | Reference | App today (`src/screens/Today.tsx`) | Gap | Sev |
|---|---|---|---|---|---|
| 1 | the card itself | one command-deck: tag row → title → countdown → bar → after row | `HandBox seed="deck"` holding **only** a `Period 1 of 3` caption and the day bar. No tag row, no title, no countdown, no after row | **The design of record for this card does not exist in the app** | **H** |
| 2 | live countdown | `MM:SS` counting the real class from real clock time | none. The only time text is the masthead's static `until 09:50` | no countdown at all; the brief requires one that ticks | **H** |
| 3 | state word | inverted rotated pill — `Now` / `Next up` / `First class` / `Rest day` | none on the card; the masthead says `In class` in 15px serif italic | missing, and the app's own word (`In class`) is neither of the reference's | **H** |
| 4 | room | stamped circled `R` + room code, top right of the card | absent from the card (only inside the per-class list rows) | missing | **M** |
| 5 | "After" row | dashed rule + `After` + next class · room | absent | missing | **M** |
| 6 | bar semantics | `left` = **percent of this period remaining**; at 26:00 of 50:00 exactly 12 of 24 Bookshelf spines are lit (confirmed in the render) | day-wide Bookshelf: one box per class, filled by the elapsed **day** fraction | different question. **Not fixed here** — `src/ui/instruments/legacyKinds.ts` states this divergence is deliberate ("each answers a question the twenty-two instruments do not"), and the instrument kinds already carry the reference's semantics | **M**, by design |
| 7 | card ink rim | `border: 2.5px solid var(--ink)`, but `--ink` is the card's own text colour, so the rim is **invisible against its own fill** — confirmed at 500% in `zoom-corner.png` | `stroke={c.slab}` — same colour as the fill, so also invisible | **no gap.** Left exactly as it is; adding a contrasting rim would be a divergence | — |
| 8 | slab texture | 45° hatch + top-left glow inside the card | flat fill | the slab is a plain black rectangle | **L** |
| 9 | theme inversion | the deck **inverts** in dark: cream slip, near-black text, on the near-black desk | `slab` is `#2F2920` in light and `#1F1B16` in dark, so in dark the card is *darker* than the `#2B2620` page it sits on | the card stops being the highest-contrast object on the page exactly when the page is darkest | **M** → handoff, shared token |
| 10 | countdown numerals | `font-variant-numeric: tabular-nums` | n/a | must be added: the readout changes every second | **L** |
| 11 | `settings.bar` typing | n/a | `kind={st.settings.bar as BarKind}` — `settings.bar` is `string`, so the cast is false the moment the user picks one of the 22 instruments. Harmless at runtime (`DayBar` re-narrows), wrong in the type | lie in the type | **L** |
| 12 | running timer | n/a | `RunningTimer` is mounted on To-do only. `prompt.md` V10h puts the running-timer indicator in the **Today** header — the page you land on when leaving Focus | Today shows no sign a round is live | **H** |
| 13 | tape | `.tape::after` at `ink 16%` — effectively invisible in the render | none | **not added.** The app's `Tape` is a solid translucent block and would be far louder than the reference's | — |
| 14 | title leading | `32px / 1.05` | `Txt` fixes `lineHeight` at `round(size × 1.25)` for `marker` | **not overridden.** A fixed 1.05 leading collides with itself at font scale 1.3+, which the brief makes a correctness requirement | — |
| 15 | long title | wraps to two lines (`COMPUTER / PROGRAMMING` in the render) | n/a | must not clip at 320 dp or 1.3× | **M** |

---

## 3. What was changed, and what was deliberately not

**Changed** — all of it is a missing piece of the reference, restored into the card that was already
there. No slot moved, no hierarchy inverted, no copy invented.

1. state pill, stamped room, title, live countdown, `After` row (gaps 1–5)
2. the slab's 45° hatch (gap 8), drawn as clipped geometry with A2's own `hatch()` — no `<Pattern>`
   id, so no `SvgXml` id collision (`prompt.md` R11)
3. `tabular-nums` on the countdown (gap 10)
4. `as BarKind` → `AnyBarKind` (gap 11)
5. `RunningTimer` wired into the Today header (gap 12)
6. defensive period normalisation for a class that runs past midnight (gap 15's sibling — see §4)

**Not changed:** the bar call and its semantics; the day bar's own `Period N of M` caption, which
moves into the tag row rather than being deleted; the slab colours; the ink rim; the masthead; the
`Txt` leading; the tape.

**Blocked on a shared file:** gap 9, the dark-theme inversion. `c.slab` / `c.slabInk` are shared
tokens in `src/tokens/theme.ts` and `COORDINATION.md` §4 forbids altering a palette. Exact patch in
`qa/HANDOFF-A5.md`.

---

## 4. The past-midnight case

`atTime(day, t)` puts both ends of a meeting on the same day, so a class stored as `23:30`–`00:30`
comes out with `end < start`. `activePeriod` filters those (`p.end > p.start`), so such a class would
vanish from the card entirely rather than show a negative countdown.

The card normalises its own periods before reading them: an end at or before the start is moved to the
next day. That is card-local and changes nothing for `Week`, the class list or the bars, so it cannot
break another agent's work — but the honest fix belongs in `domain/attendance.ts`, which is not mine.
The exact patch is in `qa/HANDOFF-A5.md`.

## 5. States exercised

`src/test/card.test.ts` drives the pure derivations over the real seed data: inside a class, at its
start, at its end, in the gap between two classes, on a day that is not today, with no classes at all,
with a class running past midnight, and with the whole day cancelled. `Today.tsx` cannot be imported
into a node-environment test (no renderer, `react-native-reanimated`), so — following
`today-day.test.ts` and `perf-offscreen.test.ts` — the derivations are modelled in the test **and**
asserted against the file's source, so the model cannot drift from what ships.

---

## 6. After — what each gap became, and what it looks like

45 tests, `npm run check` green (37 suites / 611 tests, tsc clean, eslint `--max-warnings=0`,
depcruise clean).

| # | Gap | Now | Verified by |
|---|---|---|---|
| 1 | the card did not exist | `ActiveCard` in `Today.tsx`, in the slab the app already had, six rows in the reference's order | `A5-after-live.png` |
| 2 | no live countdown | `MM:SS` from real clock time, `tabular-nums`, ticking on the card's own 1 Hz clock | `A5-after-live.png` shows `26:00` at 09:24 of a 50-minute class |
| 3 | no state word | `Now` / `Next up` / `First class` / `Rest day`, inverted pill, rotated −2° | `A5-after-live.png`, `…-soon`, `…-first`, `…-rest` |
| 4 | no room on the card | auto-sized stamped ring + room code, top right | `FINAL-tags.png` |
| 5 | no after row | dashed rule, `After`, next class · room | `A5-after-live.png` |
| 6 | bar semantics | **unchanged, deliberately** — `legacyKinds.ts` documents the day-wide four as answering a question the instruments do not | — |
| 7 | no visible ink rim | **unchanged, deliberately** — the reference's rim is invisible against its own fill too | `zoom-corner.png` |
| 8 | flat slab | 45° hatch at 9% ink, `step 7` so the pitch you *see* is the reference's 5 px | `hatch-cmp3.png`, reference above / card below |
| 9 | no dark inversion | **still open — handoff** | `A5-stress-s_live_th_dark.png` |
| 10 | no tabular numerals | added | — |
| 11 | `as BarKind` lie | `as AnyBarKind` | — |
| 12 | no running timer on Today | `<RunningTimer />`, first child of `Page`, as on To-do | source-asserted |
| 13 | no tape | **not added, deliberately** | — |
| 14 | title leading 1.05 | **not overridden, deliberately** | — |
| 15 | long titles | two-line cap, same as every other course name on the page | `A5-slong.png` |

### Two defects the render found that reading the code did not

Both were invisible in the source and obvious in a PNG:

1. **The rest state borrowed a unit from a state that was not happening** — `--:--  until it starts`.
   The reference only overwrites `lb` when there is a class to point at; with nothing on, `--:--` keeps
   its opening value and the label reads `nothing on`. Fixed, and `card.test.ts` pins all four states'
   labels against the file's source.

2. **The after row reached back to the first class of the day.** With no class, `at` is `-1`, so `at + 1`
   is `0` — the *first* class — and a finished day read "After Intro to Economics". The reference guards
   this the same way (`a = p && pl[pl.indexOf(p)+1]`). Fixed, and pinned by a test whose comment names
   the bug.

### Renders looked at

All at 411 px, the device's real width. Nothing below was asserted from a number; every one was opened
and read.

| PNG | what |
|---|---|
| `/tmp/render/A5-v10-full.png` | the whole reference page, unmodified |
| `/tmp/render/a5/A5-ref-now-light.png`, `…-dark.png` | the reference card with the clock pinned into a class, both themes |
| `/tmp/render/a5/zoom-corner.png` | the reference card's top-left corner at 500% — how the invisible ink rim was settled |
| `/tmp/render/a5/A5-mock-light.png`, `cmp-B.png` | app-today beside reference beside proposal, from a faithful JS port of `handPath`, `DayBar` and `BR.spines` |
| `/tmp/render/a5/A5-after-live.png`, `…-soon`, `…-first`, `…-rest` | the card **as implemented**, all four states |
| `/tmp/render/a5/hatch-cmp3.png` | reference above, card below, same magnification — the hatch match |
| `/tmp/render/a5/FINAL-sidebyside.png` | the same comparison at the end |
| `/tmp/render/a5/FINAL-tags.png` | the tag row at 1× / 1.3× font scale / 320 dp |
| `/tmp/render/a5/A5-s320.png`, `A5-sfs13.png`, `A5-slong.png` | 320 dp, font scale 1.3, and a title long enough to run to three lines at 1.3× |
| `/tmp/render/a5/A5-stress-s_live_th_dark.png` | the dark theme |

### What could not be verified

There is no device (`qa/COORDINATION.md` §0). Specifically unverified: the Reanimated/SVG path at
runtime, the `HandBox` outline at real measured sizes, the true Android font rasterisation of Caveat,
Permanent Marker, Newsreader and Special Elite, the actual system font scale, and whether
`borderStyle: 'dashed'` on the `After` rule draws with the reference's 2.5 px dash on device. The
harness is Chrome at 411 px with the same four families, which is a faithful preview of the phone and
not the phone.

