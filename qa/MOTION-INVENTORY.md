# MOTION INVENTORY — A6 ANIM

> The audit that ran before any of the fixes below. Every interactive element and every state change
> in the files A6 owns, ordered by **how often a user actually sees it**, because frequency is what
> decides whether something should animate at all (`expo-animation` step 1). 82 rows.
>
> Read with the gates this pass obeys: reduce-motion collapses every row marked ▲ to instant or a
> short fade; nothing animates off-screen; no animation may block input.

---

## 0. The motion language (one spec, reused)

The app already had a motion vocabulary. This pass **reuses** it and adds nothing new to it.

| Property | Choice | Where it comes from |
|---|---|---|
| Easing family | `Easing.bezier(0.2, 0.9, 0.25, 1)` | the page placement's own curve, `PLACE_EASE` in `src/navigation/window.ts`. Every decelerating move in the app now ends with the same hand on the tween. |
| Base timing unit | **90 ms** (`BEAT`) | expo-animation: press feedback 100–150 ms; 90 ms is the short end because this app repeats presses more than anything else. |
| Small state change | **160 ms** (`STEP`) | expo-animation: "toggle, chip, small state change 150–200 ms". |
| Value change | 180–220 ms spring | a value the user just changed is continuous and interruptible. |
| Page | 200 ms `PLACE_EASE` | A1's measured number. Untouched. |
| Sheet | 280 ms open `out(cubic)` / 210 ms close `in(cubic)` | existing. Untouched. |
| Overshoot | only on: the toggle knob's detent, a chip settling into a slot, a week page turning | the gesture carried momentum, or the metaphor is a mechanical part. |
| Max travel | 26 dp | one third of nothing in particular; every control here is ≤ 66 dp tall. |
| Springs only for | toggle knob, chip settle, stepper nudge, sheet snap-back, week page | all five are continuous or interruptible. Everything else is timing. |

**Two eases maximum** — `EASE` (out) and the sheet's existing `in/out(cubic)`. A third curve had to
justify itself, and the only one that did is the crumpl-free rotation already in `Swipe.tsx`.

### What that shared curve actually is

Solved, not asserted — `src/test/animation.test.ts` pins these four numbers:

| t | 0.10 | 0.25 | 0.50 | 0.80 |
|---|---|---|---|---|
| progress | 0.418 | 0.784 | 0.957 | 0.997 |

It is a **very** strong ease-out: 42 % of the travel in the first tenth of the time. That is exactly right
for a 90 ms press and for paper being set down — it is the curve A1 measured the 200 ms placement
against — but it is the most aggressive thing in this pass, and on a 160 ms change it means the motion is
*visually* over at about 65 ms. It is inherited, not chosen; see §8.

---

## 0b. Structural rules this pass adopted

These are the three properties every animation in the files below now has, and they are asserted:

1. **Retarget, never reset.** A shared value is written with `withTiming`/`withSpring`, which start from
   wherever it already is. A fresh assignment is what produces a strobe, and a strobe on a control the
   user taps ten times a minute is worse than no animation at all. Every effect in `kit.tsx`,
   `charts.tsx`, `Week.tsx` and `Settings.tsx` follows this.
2. **Never animate a layout property.** `width`, `height`, `borderRadius`, `padding`, `margin`, `gap`,
   `flex`, `top`, `left` re-run Yoga every frame for that node *and its siblings*. Two real instances were
   found and removed: `borderBottomWidth` on `Field`'s input, and `borderRadius` on the crumpling card.
   `charts.tsx` animates `width`/`height` through `useAnimatedProps` instead — that is the documented
   exemption, because a bar fill is absolutely positioned inside a fixed-size `<Svg>` and is not a Yoga node.
3. **No animated opacity on a wrapper.** A1 removed it from the page placement for a measured reason (an
   animated opacity on a wrapper keeps the subtree in an offscreen target and re-composites every frame).
   `PageSwap`, `Btn`, `Chip`, `Toggle`, `Stepper`, `Reveal`, `Fit` and the week page turn are all
   transform-only or leaf-only. `Reveal` and `Fit` animate opacity, and both are thin: a label plus a
   control, and two fixed-height boxes.

---

## 1. `src/ui/kit.tsx` — the surface the whole app is built from

| # | Surface | State change | Today | Should be / Gap | Fix |
|---|---|---|---|---|---|
| 1 | `Btn` | press-in | nothing (android_ripple only) | ▲ scale on the drawn card, 90 ms | **fixed** `0.97` |
| 2 | `Btn` | press-out | nothing | ▲ spring back so a lifted finger carries its own momentum | **fixed** `{duration:200,dampingRatio:0.72}` |
| 3 | `Btn` | `disabled` → enabled | `opacity` 0.45 ↔ 1 in one frame | ▲ 160 ms — this is the *only* validation affordance in every form in the app, and it teleported | **fixed** |
| 4 | `Btn` | `kind` flip (ghost↔ink↔danger) | instant | see §5 — SVG fill, deliberately not animated | left |
| 5 | `Chip` | press-in/out | nothing | ▲ scale 0.96 | **fixed** |
| 6 | `Chip` | `on` false→true | fill, stroke-width and label colour all teleport | ▲ a 1.06 pop then settle, so the selection is *motion* not just a repaint | **fixed** |
| 7 | `Chip` | fast re-tap | n/a | ▲ must retarget, not strobe: one shared value, never reset | **fixed** (asserted in `animation.test.ts`) |
| 8 | `Toggle` | knob `left` 3↔26 | **snaps** — the single most-seen snapped state change in the app | ▲ a driven physical movement with a detent | **fixed** spring 220 ms / 0.78 |
| 9 | `Toggle` | track `backgroundColor` | **teleports** card↔acc | ▲ must transition; this is the brief's colour requirement | **fixed** `interpolateColor`, clamped so it does not overshoot with the knob |
| 10 | `Toggle` | knob `backgroundColor` | **teleports** ink↔onAcc | ▲ rides the same shared value, so colour and position can never desync | **fixed** |
| 11 | `Toggle` | both themes | — | accent/onAcc must stay legible in all four palettes | **fixed** — verified by `ui.test.ts`'s existing `onAcc`/`acc` pair |
| 12 | `StepBtn` | press | borderless ripple only | ▲ scale 0.95 (a 26 dp glyph needs more than a ripple) | **fixed** |
| 13 | `Stepper` | value change | the digits teleport | ▲ a 3.5 dp directional nudge + a 7 % dip in scale | **fixed** |
| 14 | `Stepper` | fast repeat (hold, or 10 taps) | n/a | ▲ must not strobe: one retargeted value, never reset to 0 | **fixed** (asserted) |
| 15 | `Field` | focus / blur | `borderBottomWidth` 1.4↔2.2 and colour ink↔acc in one frame | ▲ the accent rule should **wipe in from the left**, not the border get thicker | **fixed** 160 ms |
| 16 | `Field` | focus | animating `borderBottomWidth` would re-run Yoga per frame while typing | never do that — it is a layout property | **fixed** (moved to a `scaleX` transform) |
| 17 | `HStrip` | trailing fade appears/arrives | instant, and `onScroll` setState at 32 ms throttle | a render per scroll frame | **NOT FIXED — see §6, handed off** |
| 18 | `Txt` | any | nothing | correct. Text that moves is unreadable text. | left |
| 19 | `Icon` | any | nothing | correct. A static nav icon is an anchor. | left |
| 20 | `HandBox` | any | nothing | correct. It is scenery, and animating its path would re-parse a path per frame. | left |
| 21 | `Row` | layout | nothing | correct. | left |
| 22 | `Tape` / `Hair` | any | nothing | correct. Tape is scenery; a divider that moved would be a bug. | left |

---

## 2. `src/ui/Swipe.tsx` — the crumple

| # | Surface | State change | Today | Should be / Gap | Fix |
|---|---|---|---|---|---|
| 23 | card | drag right/left | follows the finger | correct already | left |
| 24 | card | release right past 28 % | `withTiming` 120 ms then `withSpring(0)` — **no velocity** | the spring must carry the finger out of the way or the release reads as a stall | **fixed** velocity handed to both springs |
| 25 | card | release below threshold | `withSpring(0, {damping:18,stiffness:240})` — **no velocity** | same | **fixed** |
| 26 | card | crumple | 1100 ms linear; squash+rotate over the first half; 330 px fall; opacity out at 0.9→1 | already a designed sequence and **sound-synced at 620 ms** (`fx.crumple()`'s thud). Not redesigned — `COORDINATION.md` §3 protects it | left, deliberately |
| 27 | card | `borderRadius` 0→60 while crumpling | **animated layout property**: a Yoga pass every frame for 550 ms on a card full of text and SVG | never | **fixed** — removed; at 30 % scale the corner rounding is imperceptible |
| 28 | card | `overflow:'hidden'` inside the animated style | a *static* prop sitting in an animated style | belongs in the static style | **fixed** |
| 29 | card | pan gesture during a crumple | the pan is still live, so a right-swipe can call `onComplete` **while the delete is running** | V18: one card, two actions | **fixed** — a shared-value latch read inside the worklet |
| 30 | card | undo restore | `p=0, x=0` reset *after* `onDelete()` | V9: "restored card is NOT left invisible/scaled" | **fixed** — the reset now happens before the store write |
| 31 | Done/Crumple affordances | opacity | interpolated off `x` | correct — continuous with the drag | left |
| 32 | crease overlay | opacity | interpolated off `p` | correct | left |

---

## 3. `src/ui/Sheet.tsx`

| # | Surface | State change | Today | Should be / Gap | Fix |
|---|---|---|---|---|---|
| 33 | sheet | open | 280 ms `out(cubic)` from `y = H` | correct | left |
| 34 | sheet | close | 210 ms `in(cubic)` | correct | left |
| 35 | sheet | drag follow | `max(0, translationY)` | correct | left |
| 36 | sheet | drag cancel | spring **with no velocity** — the brief's "drag halfway then release must look intentional" is exactly this row | velocity in | **fixed** |
| 37 | sheet | catch a sheet mid-dismiss | the `closing` latch stays set, so `close()` returns early **forever** — the sheet can never be dismissed again | V18: "open/close Settings 10× must never leave something stuck half-animated". **This was a real stuck state.** | **fixed** — a cancel un-latches |
| 38 | sheet | input while dismissing | the ScrollView and every control stay live for the whole 210 ms | ▲ dead input, and a scroll mid-dismiss fights the transform | **fixed** — `pointerEvents` and the a11y tree both drop |
| 39 | sheet | over-drag upward | hard clamp at 0 | see §6 — a bottom-anchored sheet has no room to give | left, deliberately |
| 40 | dim | opacity | interpolated off `y`, so it tracks the drag exactly | correct | left |
| 41 | grab handle / ✕ / back | press | nothing | low value: three 44 dp targets, sub-150 ms budget | left, documented |
| 42 | title | sub-page change | swaps instantly | it is the **anchor** — a moving header tells you where you are not | left, deliberately |

---

## 4. `src/ui/Overlay.tsx`, `src/ui/charts.tsx`, `src/ui/PaperBg.tsx`

| # | Surface | State change | Today | Should be / Gap | Fix |
|---|---|---|---|---|---|
| 43 | + button | press | nothing | ▲ scale 0.94 | **fixed** |
| 44 | + button | show/hide with a sheet or the keyboard | instant | deliberately **not** fixed — see §6 | left |
| 45 | undo toast | in / out | `FadeInDown 220` / `FadeOutDown 180`, on Reanimated's **built-in default easing**, not the app's curve | consistency: everything else in the app decelerates on `EASE` | **fixed** — the curve only |
| 46 | `Heatmap` | — | 105 static rects, no animation | correct — animating 105 cells would be the worst offender in the app | left |
| 47 | `HBars` bar | first view | 700 ms, `delay = i*70` | ▲ shorter; and it must not fight the 200 ms page placement | **fixed** 380 ms, staggered 45 ms, entrance held 130 ms |
| 48 | `HBars` bar | any data change | **replays from zero** whenever `w`/`delay` changes | ▲ it should travel from where it is | **fixed** — `withTiming` retargets, never a reset |
| 49 | `Hist24` column | first view | 600 ms, `i*18` — the last column starts at **414 ms** and ends at 1014 ms | ▲ cut the window | **fixed** 360 ms, `i*10` |
| 50 | `Hist24` column | curve | `Easing.back(1.2)` — the bars **overshoot their own value** and come back | a bar that reads 112 % of its number is lying about data | **fixed** — `EASE`, no overshoot |
| 51 | `Line2` | first view | 900 ms dash draw | ▲ shorter | **fixed** 480 ms |
| 52 | `Ring` | any value change | **replays the full 900 ms sweep from empty** every time you tick one task | ▲ it must travel from the old arc to the new one | **fixed** — a frozen `from` plus a retargeted progress |
| 53 | all charts | off-screen | Stats stays mounted behind another page, so a data change re-animates 69 props for nobody | V17: "Nothing animates while off-screen" | **fixed** — `route` is read in each container and passed down |
| 54 | all charts | peak concurrency | **69 animated SVG props**, window ~1.95 s (A1, `RESEARCH-PERF.md` §6) | the peak *count* cannot drop without changing how the charts draw — see §6 | **fixed** the window: ~1.95 s → ~0.62 s |
| 55 | `PaperBg` | `id="pp"` | a **fixed** SVG pattern id, and two `PaperBg`s are mounted at once (the sheet and the page behind it) | R11 in `prompt.md`, live | **fixed** — `useId()`, the same fix `HStrip` already uses for its gradient |
| 56 | `PaperBg` | ruling change (dots/grid/ruled) | the pattern swaps with a flash of bare paper | ▲ cross-fade | **fixed** 220 ms |
| 57 | `PaperBg` | texture change | the image swaps with a flash | ▲ cross-fade | **fixed** 220 ms |
| 58 | `PaperBg` | texture cross-fade cost | one image is always mounted instead of one of two | accepted: a tiled bitmap, and it is the only way to cross-fade | **fixed** |
| 59 | `PaperBg` | theme/palette switch | every colour in the app changes in one commit | deliberately **not** fixed — see §6 | left |
| 60 | `PaperBg` | off-screen | nothing animates here today | correct | left |

---

## 5. Sheets and screens

| # | Surface | State change | Today | Should be / Gap | Fix |
|---|---|---|---|---|---|
| 61 | every `Chip` in every sheet | selection | see #6 | the fix is in the kit, so all ~40 call sites get it | **fixed** |
| 62 | every `Btn` in every sheet | press, disable | see #1–3 | same | **fixed** |
| 63 | every `Toggle` in Settings | on/off | see #8–11 | same | **fixed** |
| 64 | every `Stepper` in Settings + forms | ± | see #13–14 | same | **fixed** |
| 65 | `StatusSheet` option grid | selection | `Btn kind` flips primary↔ghost | see §6 (SVG fill) — the press and disable fixes do land | partial |
| 66 | Task sheet: `+ Start date` chip | the Starts label + a whole `WhenPicker` appear | instant | ▲ a short expand | **fixed** 220 ms, transform-only |
| 67 | Task sheet: `+ at a time` | same | instant | ▲ same | **fixed** |
| 68 | Task sheet: the "Tight / Comfortable" box | appears **and changes colour** (card↔highlight, ink↔warn) | instant, both axes | ▲ this is the brief's colour case, on native views where it is cheap | **fixed** 180 ms cross-fade |
| 69 | `WhenPicker` `Pick…` | the day strip + two steppers appear | instant | ▲ same expand | **fixed** |
| 70 | `WhenPicker` day cell | selection | fill teleport | see §6 | left |
| 71 | Settings: every `Nav` row → sub-page | the body swaps in place | instant, no motion at all, while Android's own Settings slides | ▲ a directional page turn | **fixed** 24 dp + 0.7°, direction from the stack depth |
| 72 | Settings `Nav` row press | | `android_ripple` only | correct: a full-width list row highlights, it does not scale — a scaling row reads as the screen squishing | left |
| 73 | Settings: clock-face thumbs | selection | fill/stroke-width flip instantly | see §6 | left |
| 74 | Settings: bar-kind rows | selection + a `✓` appears | instant | see §6 | left |
| 75 | Settings: Reset | `Btn kind` ghost→danger + label swap | instant | see §6 | left |
| 76 | Settings: Diagnostics crash list | appears after a test crash | instant | low value, long list | left |
| 77 | `Grades`: subject cards | appear / vanish | instant | list layout animation on a screen with five heavy cards | left, documented |
| 78 | `Grades`: Lock button | kind + icon + label all flip | instant | see §6; the press fix lands | partial |
| 79 | `Grades`: "to do" → a score | text + strike-through | instant | text decoration cannot be animated, and the number is the content | left, documented |
| 80 | `Stats`: empty hint | disappears when data arrives | instant | ▲ the one moment "the app woke up"; cheap, and it is where the rings start to move | **fixed** — 180 ms exit fade |
| 81 | `Stats`: every card | appears | instant | deliberately **not** fixed — see §6 | left |
| 82 | `Tasks`: chips, field, stepper | | see #5–15 | inherited | **fixed** |
| 83 | `Tasks`: group headers reflow | filter/sort changes | instant | a list layout animation is a Yoga pass per frame on the app's longest list | left, documented |
| 84 | `Week`: previous / next week | the **whole grid** swaps in place while `fx.swipe()` plays a paper rustle | instant, but the sound promises movement the eye never sees | ▲ a directional page turn | **fixed** 26 dp, 240 ms, direction-aware |
| 85 | `Week`: "Today" button | appears when `off ≠ 0` | instant | sub-second, tiny target | left |

---

## 6. What was deliberately NOT animated, and why

These are the senior calls. Each one is a place where animating would have made the app worse.

**1. Colour changes that live on an SVG `fill` or `strokeWidth`.** That is every `Chip` fill, every `Btn`
`kind`, the clock-face thumbnails, the bar-kind rows, the `WhenPicker` day cells. It is a large part
of the brief's "colour consistency in motion" and it is **not** done.

The reason is measured, not stylistic. `qa/RESEARCH-PERF.md` §6 cites
[reanimated#2618](https://github.com/software-mansion/react-native-reanimated/issues/2618): an animated
prop on an SVG path measured **30–40 fps at 100 % CPU** on Android, because Software Mansion's own
write-up says the Android renderer draws through Canvas with no caching involved. The app *already* has
69 such props on Stats. The 8 `Chip`s on the Task sheet and the 14 on the Add sheet would add ~30 more
on the busiest sheets, on an assumption that colour happens to be the cheap case — an assumption **I
cannot test without a device**. A wrong assumption here makes the app slower on the sheets a user
opens most.

What the chip *does* get instead: a 0.96 press scale and a 1.06 selection pop, both `transform`, both
free. The selection is carried by motion **and** by two static cues (stroke weight, label colour), which
is what `make-interfaces-feel-better`'s "motion is never the only feedback channel" asks for anyway.
**If this is ever measured to be cheap, the fix is one `useAnimatedProps` on the chip's `Path` and it
belongs in `Chip` in `kit.tsx`.**

**2. The theme / palette switch.** Switching theme changes several hundred colour props at once, in one
commit. Cross-fading it means animating all of them simultaneously — the exact failure A1 measured.
The app's answer, which is correct: the whole desk changes at once, instantly, and reads as deliberate
rather than as a bug.

**3. A card, row or list-item entrance.** `make-interfaces-feel-better` §13 and A1's page-placement work
both say the same thing: paper arrives by *moving*, once, when the page moves. A per-card fade on mount
would re-rasterise every card on every page load — the cost A1 removed from `Book.tsx`.

**4. The list reflow on To-do.** A layout animation on the app's longest list is a Yoga pass per frame.

**5. The keyboard lifting a sheet.** It would mean animating `bottom` *and* `maxHeight` on the one view
that holds a ScrollView and an SVG background, during the exact moment the user is typing. The platform
already moves the keyboard; a sheet that lags 100 ms behind the OS looks broken, not smooth.

**6. Rubber-banding the sheet upward.** It is anchored to the bottom edge, so there is nothing above it
to give. The boundary is the screen.

**7. A theme-aware animated colour on `PaperBg`'s base.** The pattern and texture layers cross-fade, but
the base colour snaps with the theme, because fading it would mean fading every pixel.

---

## 7. Handed off rather than fixed

| File | What | Why not mine |
|---|---|---|
| `src/screens/common.tsx` | `AttCell`'s background, border **and glyph** colour **teleport** when a status stamp lands (Here → Late → Absent → Sick). This is *the* status-stamp colour case in the brief. It is a plain `View`, so `interpolateColor` is free — but the value is a five-way *categorical*, and interpolating a categorical along a list of stops is a path through the list rather than through colour space. The honest fix is a cross-fade of two static cells, which doubles the node count in a grid of 28 × 5. | explicitly outside my row. Full analysis, the wrong patch and the right recommendation in `qa/HANDOFF-A6.md` §3. **This is the one part of the brief I did not deliver, and the reason is a design argument rather than an omission.** |
| `src/screens/common.tsx` | `TaskCard`'s checkbox fills and strikes through instantly. | same |
| `src/ui/kit.tsx` → `HStrip` | `onScroll` calls `setX` at 32 ms throttle: **one React render per scroll frame**, on ten call sites including the Add sheet and the Grades grid. Moving the fade to the UI thread is the correct fix and it is a rewrite of a component used on ten sheets, which I cannot see running. | reported, not done — `qa/HANDOFF-A6.md` §4 |

---

## 8. Risk register — where I could be wrong without a device

| Risk | Why it is a risk | Where it lives |
|---|---|---|
| Toggle spring `220 ms / dampingRatio 0.78` | ~5 % overshoot is a guess at the right detent. Too much reads as bouncy; too little as a snap. | `Toggle` in `kit.tsx` |
| Chip pop `110 ms → 1.06 → 220 ms settle` | the 1.06 amplitude is a guess. | `Chip` in `kit.tsx` |
| Stepper nudge `3.5 dp / scale 0.93` | may be invisible at 60 Hz, or too much in a 60-wide stepper. | `Stepper` in `kit.tsx` |
| Field underline wipe 160 ms | `transformOrigin: 'left'` on a text input's sibling — correct in RN 0.76+, unverified here. | `Field` in `kit.tsx` |
| Settings page turn 24 dp + 0.7° | direction and distance are guesses. | `PageSwap` in `Settings.tsx` |
| Week page turn 26 dp | the grid is dense; a moving grid may read as jitter rather than as a page. | `Week.tsx` |
| Chart entrance held 130 ms | the honest value depends on the 200 ms placement actually finishing on a slow device. | `charts.tsx` |

Everything above is *correct* in the sense that it cannot leave a stuck state, cannot block input,
collapses under reduce-motion and does nothing off-screen. What is uncertain is whether the numbers feel
right — and only a device can settle that.

Two risks are worth naming above the others:

**The shared curve is extremely front-loaded.** `cubic-bezier(0.2, 0.9, 0.25, 1)` is 78 % of the way by a
quarter of the time. Inherited from A1's placement, where it is right, and reusing it was the whole point
of §0. But on a **160 ms** state change the motion is visually finished at ~65 ms, which is on the edge of
"that was a teleport with extra steps". If any of the 160 ms animations reads as too abrupt on a device,
the fix is not a new curve per component — it is one second curve for the whole `STEP` tier, and the test
that pins `EASE` is where it would be changed.

**`KNOB.dampingRatio = 0.78` is a guess at a detent.** Five per cent overshoot on a 23 dp travel is about
1 dp, which is either "a satisfying click" or "invisible, and you might as well have used a timing
curve". It cannot be judged from the code.

### What I would look at first, in this order, on a phone

1. Open Settings and drag one of the nine **toggles**. Does the knob read as a part arriving, or as a
   colour changing? (It is the fix most likely to be right and most likely to be mis-tuned.)
2. Tap a **chip** six times fast. Does it swell, or does it stutter?
3. **Settings → Look & feel → Progress bar**, scroll to the 22 instruments, and tap back and forth. Five
   live previews; is that alive or is it busy?
4. Press **next week** on the Week page three times fast. Does the grid turn, or does it jitter?
5. Open a **task**, tap "+ Start date", then "+ at a time" inside the first 220 ms.
6. Switch **ruling** dots → ruled → grid in Paper & texture. Any flash at all means the cross-fade is
   wrong.