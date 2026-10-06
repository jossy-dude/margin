# HANDOFF — A8 AUDIT (the last agent)

Read `qa/COORDINATION.md` §3–§4 first. The gear scope lock held: `src/ui/hand.ts`, `gearGeometry`,
`toothPath`, `meshPhase`, `SKELETON`, `RAW` and the icon set are **byte-identical** to `47339a5`. Nothing
in this pass required changing them and nothing did.

Everything here is either (a) done and gated, or (b) a decision that is the owner's and is not mine to
take. Section 3 is the short version.

---

## 1. The F-06 resolution — contrast without touching a palette

`COORDINATION.md` §4 and `prompt.md` V15 contradict each other as written:

- §4: *"Never remove, rename, or alter an existing palette. Every one that exists today stays selectable
  with its current values."*
- V15: *"if any text reads below 4.5:1 … fix the colour in `src/tokens/theme.ts`"*
- R9: *"the Original palette … is NOT guaranteed to pass 4.5:1"*

A7 computed the failures and found the contradiction unresolvable. **It is resolvable, because §4 binds
the palette and V15 binds the result.** The three measured pairs:

| pair | refined light | refined dark | original light | original dark |
|---|---|---|---|---|
| `mut` on `hl` | 5.17 | 4.89 | 5.82 | **4.02** |
| `warn` on `hl` | 4.51 | 5.22 | **4.40** | 4.62 |
| `mut` on `desk` | 5.02 | 8.08 | **4.03** | 8.26 |
| `ink` on `hl` | 11.97 | 8.66 | 11.97 | 7.85 |

**The ruling: no palette value changes. The surfaces that fail are repainted at the use site, because
`hl` is a *surface* and the only text token guaranteed to clear 4.5:1 on it in all four combinations is
`ink`.** A warning colour belongs on a 1.6 px hand-cut stroke, not in 19 px words over a yellow fill.

| site | was | now |
|---|---|---|
| `screens/Today.tsx` — an important note's subject line | `c="mut"` on `fill={c.hl}` | `c={n.priority >= 2 ? c.ink : 'mut'}` |
| `sheets/forms.tsx` — the Task sheet's Tight box | `c="warn"` on `fill={c.hl}` | default `ink`; `warn` stays on `stroke` |
| `ui/onboard/art.tsx` — the Focus dial bed's numerals | `fill={c.mut}` on `bed = c.desk` | `fill={c.ink}` |

A7 named the first two but placed the first at `forms.tsx:83`, which is the "Latest start" line — that
line is a *sibling* of the highlight card, on the sheet's `PaperBg card`, so it was never the failing
pair. The real live site is `Today.tsx`'s important-note card. The third pair (`warn`/`hl`) is not in
A7's list at all.

**The mechanism, so it cannot rot:** `src/test/ui.test.ts` now asserts every reachable text/background
pair in **both** palettes and **both** themes — it used to assert sixteen pairs for `refined` only,
which is exactly how F-06 could be true and the suite green. `src/test/color-drift.test.ts` reads the
three sources and asserts the rule at the use site, mutation-checked. And the three known failures are
pinned as *negatives*, so the suite fails if anyone re-values `ORIGINAL` to make them go away — which §4
forbids.

## 2. The pure-black palette (F-01) — NOT DONE, and still unassigned

`PROMPT.md` Part 5 orders a fourth palette, pure black, made the default dark. It does not exist.
Of the six files it needs, four were owned by nobody, which is why no agent started it:

| File | §2 owner at dispatch |
|---|---|
| `src/tokens/theme.ts` | **shared, unowned** |
| `src/domain/types.ts` | **shared, unowned** |
| `src/test/ui.test.ts` | nobody |
| `android/.../values-night/colors.xml` | nobody, and outside `src/` |
| `src/domain/defaults.ts` | A4 (onboarding) |
| `src/sheets/Settings.tsx` | A6 |

I did not build it, and the reason is not effort. It is a new default for the app's appearance, it
changes what the app looks like on first launch, and `COORDINATION.md` §4 governs palettes — so the
first move has to be a ruling, not an implementation. It also needs the Android night colour, outside
`src/`, or a cold start flashes brown on black.

Exact patch when it is wanted: `palettes = { refined, original, onyx }`; `ONYX` already exists as a dial
material and is the obvious name to collide with, so call it `NOIR`; `Settings['palette']` gains
`'noir'`; `DEFAULT_SETTINGS.palette` becomes `'noir'`; `ui.test.ts` gains a loop over all three; and
`values-night/colors.xml` gets `#0B0B0D` for `activityBackground`. `ui.test.ts:16` already asserts
`refined.dark.paper` is not pitch black, so the existing palette must keep `#2B2620`.

## 3. Per-subject bars, and which instrument is the default (F-11, F-12) — NOT DONE

`PROMPT.md` Part 2 says *"Decide with the owner … propose the default and flag it as a decision"* and
*"Recommend the default and justify it"* — twice, and nobody asked. Two open questions:

1. **One global picker or per subject?** `Settings.bar` is a single `string`; there is no per-subject
   mapping anywhere, and the timetable's own vocabulary is per-course.
2. **Which of the 26 is the default?** It is `spines` — "Bookshelf", one spine per class — which is
   literally the plain bar chart the owner complained about.

A2's honest default would be an instrument from the *"Works in any subject"* group, because it is the
only group that is not tied to one syllabus and the only one whose seven members all read the same clock.
Proposing **`chronograph` or `sundial`** there and flagging it is a one-line change to
`DEFAULT_SETTINGS.bar` once the owner picks.

## 4. The remaining open decisions nobody has been asked

From `qa/FINDINGS-UNSTATED.md` §5, with this pass's status:

| # | Decision | Status now |
|---|---|---|
| 1 | Drop or finish the plate faces | **Dropped**, recorded as `STATE.md` deviation 10 with how to reverse it |
| 2 | May an existing palette's `mut` be re-valued? | **Resolved without the ruling** — see §1. It does not need to be asked |
| 3 | Per-subject bars, and the default instrument | Open — §3 |
| 4 | Promote the auditioned sound set? | Open. `audio.ts:14` still points `nudge` at `sounds-candidates/` while 27 other candidates sit unreferenced, and `assets/sounds-candidates/` is not in `src/` so this pass did not touch it |
| 5 | Confirm the notification action buttons were wanted | Open. They are built, nobody asked, and they are unverified |
| 6 | Delete `slip`, or give it a trigger? | **Deleted** |
| 7 | Nudge every 5 min, or every `breakMs`/3? | **Resolved** — the code is right and the copy now says what the code does |
| 8 | Accept the mount-window trade? | Documented in `prompt.md` and `PROMPT.md` Part 8 rather than decided |
| 9 | BUG-001: keep the native folders? | Open; `colorPrimary` is still the template blue at `values/colors.xml:4` |

## 5. What I changed, in one table

Every row is a regression test or a documented grep. Full detail in the final report.

| file | change | proof |
|---|---|---|
| `screens/Onboarding.tsx` | removed `scrollEnabled={!rm}` | `onboarding.test.ts` ×2 + mutation check |
| `screens/Today.tsx` | important-note text → `ink`; masthead no longer repeats the class name | `color-drift.test.ts`, `card.test.ts` ×4 |
| `sheets/forms.tsx` | Tight box text → `ink` | `color-drift.test.ts` |
| `ui/onboard/art.tsx` | dial numerals → `ink`; hub capsule + correct `viewBox`; nav label cap removed | `color-drift.test.ts`, `onboarding.test.ts` ×4, `/tmp/render/a8/DIALBUG.png` |
| `sheets/Settings.tsx` | `nudgeWord(...)` instead of a typed cadence; dropped the stale `onboarded` cast | `settings-render.test.ts` ×5 |
| `domain/timer.ts` | added `nudgeWord` (derived, not typed) | as above |
| `ui/clock/faces.ts` | `handAngles(utcMs, offsetMs)`; removed `PLATE_DARK_MATRIX`; `sc` id per instance | `clock-engine.test.ts` ×5, `scripts.test.ts`, `faces.test.ts` ×3 |
| `ui/clock/ClockFace.tsx` | offset in a shared value, re-read on `AppState` + a minute's poll | `clock-engine.test.ts` mutation check |
| `sheets/Settings.tsx` (bar picker) | `w={280}` → `max(44, width - 52)` | visual; 320 dp clip |
| `screens/Week.tsx` | deleted an unreferenced `<Pattern id="hx">` | `faces.test.ts` |
| `screens/Focus.tsx` | `hatch` id → `useId()`, sanitised | `faces.test.ts` |
| `store.ts`, `Overlay.tsx`, `forms.tsx` | deleted `SheetSpec.slip` / `State.slip` | tsc + `dead-code.test.ts` |
| `audio.ts`, `fx.ts`, `Sheet.tsx`, `analytics.ts`, `catalogue.ts`, `DayBar.tsx` | deleted 6 dead exports | `dead-code.test.ts` ×1, mutation-checked |
| `services/fx.ts` | `fx.denied()` now uses `Feel:'error'` instead of `warn` | fills a V7 gap; nothing to delete |
| `test/dead-code.test.ts` | generalises to "no top-level export is referenced nowhere" | mutation-checked |
| `test/ui.test.ts` | 16 refined-only pairs → every reachable pair, both palettes, both themes | mutation-checked |
| `qa/scripts/render.sh` | contact sheet was 460 px for a 2-row grid and cropped to 5 of 10 faces | `/tmp/render/CONTACTSHEET.png` |
| `README.md`, `prompt.md`, `PROMPT.md`, `STATE.md`, `qa/STATE.md`, `qa/EXPO_GO_AUDIT.md` | stale claims corrected; test counts removed from prose | `qa/HANDOFF-A8.md` §4 |

## 6. The one thing that would most change this app's verdict

Not a defect. A fact: **no phone has ever run this app.** `qa/STATE.md` BUG-031 is a secure pattern
lock, two agent sessions were lost to it, and everything in `prompt.md` §VERIFY — all twenty items —
is still unproven. This pass raised the count of things that are *provably* right from nothing
observable to 678 assertions and a set of renders. That is not the same as one screen having been
seen on glass.

The cheapest thing that would change the verdict most: unlock the phone and run `npm run check`, then
`npx expo run:android --variant release`, then V1 → V4 → V10 in that order. V10's dial was verified
good from seven drags on 2026-09-30 and nothing since has changed its maths; V4's five faces were
rendered and eyeballed here; V5's notification *buttons* are the largest unverified surface in the app
and the one nobody asked for.