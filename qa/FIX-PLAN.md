# FIX-PLAN — page transitions that feel like a tap

Agent **A1 PERF**. Evidence and citations: `qa/RESEARCH-PERF.md`. Blocked work and exact patches:
`qa/HANDOFF-A1.md`.

Owner, verbatim: *"the page shuffling lag fix it by any means possible remove animation or even the
shuffle animation if that is the problem and everything else like visual polish, consistency and
attention to detail"*

**v1 is the transition only.** Four changes, all in `Book.tsx` + `window.ts`, all reversible by editing
one table. Nothing here touches a screen, the store, the theme or the gear.

---

## What I decided, per animation, and why

There are five motions in this app's navigation path. I kept three, shortened one, and deleted one.

| Motion | Verdict | Why, in one line |
|---|---|---|
| The page drop (translate + tilt + lift) | **kept, 520 → 200 ms, travel trimmed** | It is the app's whole gesture; it just costs a third of the time and two thirds of the travel for no perceptible gain (RESEARCH §#2). |
| The page fade-in | **deleted** | It is the single most expensive thing in the transition *and* it was making the first three frames translucent (RESEARCH §#1). |
| The shadow tightening | **kept, weakened** | It is what "placed on the table" *means*; at 0.24 and gone by 40 ms it is a cue, not a veil (RESEARCH §#1, and verified by render). |
| The bottom-nav tab highlight swap | **untouched, deliberately** | It has no animation at all today. Adding one would be scope creep. |
| The nav bar appearing/disappearing on Focus | **untouched** | A mount, not an animation; and it is outside the reported symptom. |

### The number, and why that number

**`PLACE_MS = 200`.** Not a taste call. Four constraints, all in
`src/test/perf-placement.test.ts`:

1. **It removes work, not just time.** 520 ms at 60 Hz is 31 frames during which two page subtrees are
   simultaneously live and being composited, plus a full-screen alpha veil. 200 ms is 12. Nineteen
   frames — ~320 ms of overlapping compositing — deleted per tap. This is the actual cost line.
2. **It removes dead time.** [RAN] The old curve was optically settled (consecutive frames < 0.5% apart)
   at **333 ms**, so 187 ms of the 520 was imperceptible. The new one settles at **167 ms**.
3. **It is responsive, not instant.** Frame 1 already covers 36% of the distance, 90% is covered by
   74 ms, and **≥ 8 frames** still move — below ~7 the drop reads as a jump rather than a placement. The
   old curve covered only 14% on frame 1, which is why it read as a pause followed by a lurch.
4. **It is inside the contract.** `prompt.md` V3: "settles within ~0.5 s". 520 sat *exactly on* the
   ceiling. 200 is comfortably inside it.

The **curve is unchanged** (`Easing.bezier(0.2, 0.9, 0.25, 1)`). It is already the right shape — fast
out, no overshoot, no second peak — so the *character* of the gesture survives and only its length does
not. Changing both at once would have made it impossible to tell which one fixed it.

**The travel is trimmed with it**: −70/38/4.5°/1.045 → **−48/30/3.8°/1.028**. 70 dp in 200 ms is a
*slide*; 70 dp in 520 ms was a *placement*. At 200 ms the arrival rate is 0.24 dp/ms against the old
0.135 — brisk, deliberately, but not a different gesture. The seam it opens at the bottom of the screen
is 48 dp, inside the 94 dp the nav bar already covers, which is why the "previous page visible
underneath" (V3) is unaffected: it was never visible along that edge before either.

---

## Changes, per file

### `src/navigation/window.ts` — the page-swap budget, in one place

Added `PLACE_MS`, `PLACE_EASE`, `PLACE_FROM`, `PLACE_SHADOW`. `inMountWindow` is **unchanged in
behaviour**; the module comment now says *why* two pages is the number (V3 needs the outgoing page
visible; a third is a page nobody can see but the renderer must keep current). The reason for `1` and the
reason for `200` are documented where the numbers live, not in a report nobody reads.

**Why here and not in `Book.tsx`:** `Book.tsx` cannot be imported by a node-environment test without
dragging in the whole navigator, which is why `nav-sync.test.ts` and `suppressions.test.ts` read it as
text. Putting the numbers in a pure module means the curve can be **solved and asserted on** instead of
asserted back at itself.

### `src/navigation/Book.tsx` — `Placed` only

1. **Removed `opacity` from the page's animated style.** The page is opaque paper and arrives by
   moving. This is the single biggest change and the only one that changes what you *see* as well as how
   fast.
2. **`useEffect` → `useLayoutEffect`.** The placement is armed in the commit that mounts the page rather
   than the frame after it. Removes one painted frame of "nothing has happened yet" per navigation.
3. **`k.value = 0` before the tween → `if (k.get() >= 1) k.set(0)`.** A second tap inside the 200 ms now
   resumes the motion from where it is instead of snapping the page back to its start. This is the
   "rapid tapping across 5 tabs 10× never leaves a page half-animated" half of V3, and it was failing.
4. **`zIndex` from focus, not the visit stamp** (`on ? 2 : 1`). With at most two pages mounted this is
   the whole rule, and it removes a correctness dependency on the stamp bookkeeping, which lands one
   commit after the navigator moves.
5. **`.value` → `.get()`/`.set()`** throughout `Placed`. The React-Compiler-safe forms, per Reanimated's
   own guidance. Hardening, not a bug fix — the compiler lint rule is not active on this tree today.
6. **Shadow 0.35→0 across the whole placement → 0.24 gone by progress 0.7 (~40 ms).** Consequence of (1):
   with the page no longer fading in under it, a 0.35 veil over the whole page for the whole drop would
   have been a flash of grey for the first three frames.

**Untouched, and why:** `TabRouter`, the two sync effects and their keying (`nav-sync.test.ts` and
`suppressions.test.ts` both assert on them, and they are load-bearing for BUG-021), the `backBehavior`
default, `inMountWindow`'s behaviour, the nav bar, the tab highlight, `act.go`, the sound and the haptic.
`fx.ts` needs no change — see `qa/FIX-PLAN.md` §"Not touched" for why the audio is now the longest part
of the gesture and why I cannot fix it.

---

## Verification

**`npm run check`** — green. `typecheck`, `eslint --max-warnings=0`, `374 + 31` jest tests across 31
suites, dependency-cruiser.

**New tests** (`src/test/perf-placement.test.ts`, `src/test/perf-offscreen.test.ts`, 31 assertions):

- the curve is **solved**, then asserted on: ≥25% placed on frame 1, 90% within 110 ms, optically
  settled inside the duration, ≥8 moving frames, monotonic, and **≥18 fewer frames than the old 520**.
- the geometry: starts displaced and tilted, lands exactly flat, arrival rate within 3× of the old, seam
  inside the nav bar.
- the page carries no `opacity`; `520` appears nowhere; `PLACE_MS` and `PLACE_EASE` are what `Book.tsx`
  actually passes.
- reduce-motion is **instant, with no tween started** — including mid-flight, so it can never leave a
  page part-way placed.
- an unfocused page is flat and unshadowed whatever its shared value is, and does not drift over 20
  frames — the off-screen half of `prompt.md` V17, asserted for the one component I own.
- rapid taps resume rather than snap; twenty taps leave one page flat with nothing still running.
- at most two pages are live for 200 random hops, which is what bounds the off-screen cost.

**Rendered and looked at** — `/tmp/render/STRIP2.png`, a frame strip of the real interpolation maths
before and after, at each transition's own frame times. I looked at it, and it changed one of my
decisions: the 0.35 shadow over the whole page was doing the fade's job, and with the fade gone it was
just a grey flash, which is why `PLACE_SHADOW.peak` came down. Before the trim, the strip at t=0 shows a
page that is *invisible* and at t=17/33 ms one you can see straight through — that translucency is a
large part of what "shuffly" looks like, and no duration change would have fixed it.

**Not verified, and I will not claim it:** anything on a device. No frame times, no janky-frame
percentage, no release-build comparison, no confirmation that 200 ms reads as *right* rather than merely
*fast* to the person holding the phone. Research §3 lists every number that needs a trace.

---

## Not touched, on purpose

- **`fx.page()`'s 0.42 s `place.wav` is now the longest part of the gesture** — 2.1× the 200 ms page
  drop. Once the motion is 200 ms the sound's tail *is* the transition's duration to the ear, which is
  the one thing in this plan I cannot reach: the wav, `scripts/synth-sounds.mjs`,
  `assets/sounds/manifest.json` and `src/test/ui.test.ts` (which asserts on the manifest) are all
  outside my row. Patch and rationale in `qa/HANDOFF-A1.md`.
- **The three commits per tap and the cold mount in the last one.** Research §#4 lists the four ways I
  tried to remove them and why each one either changes BACK behaviour, shows the wrong page underneath,
  or is an impure render. Not worth it.
- **The `s.route` subscription on every screen, `charts.tsx`'s 69 concurrent animated props, and
  `DayBar`'s off-screen 900 ms fills.** Research §#5–#7. All outside my row, all handed over with exact
  code.
- **The gear / `Skeleton Movement` train** (`qa/COORDINATION.md` §3). Not perf, not touched, and the
  clock's frame callback is correctly gated by `live={st.settings…}` already — the one thing in this
  area that was right.