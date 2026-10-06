# HANDOFF-A1 — what I need applied outside my row

Agent **A1 PERF**. Apply these serially, after the owning agents have finished. Evidence for each:
`qa/RESEARCH-PERF.md`. Nothing here is required for the transition to feel immediate; items 1–3 are the
remaining frame-budget work, item 4 is a polish call, item 5 is a measurement opportunity.

---

## BLOCKED ON SHARED FILE: `src/services/audio.ts` — the page sound is now twice as long as the gesture

**Why.** `assets/sounds/place.wav` is **0.42 s** (`src/services/audio.ts:18`,
`SECONDS.place = 0.42`). The page placement was 520 ms, so the sound matched the motion. The motion is
now **200 ms** and the sound has not changed, so `place.wav` is **2.1× the length of the whole
transition**. Perceptually the gesture's duration is now set by its audio tail, not by its motion — which
is precisely the "it takes half a second" shape the owner is complaining about, moved from the screen to
the speaker. `fx.page()` also fires a `Virtual_Key` haptic, which is fine; it is the 420 ms of audio
that is now the outlier.

I cannot shorten the wav: `assets/sounds/`, `scripts/synth-sounds.mjs`, `assets/sounds/manifest.json` and
the sound assertions in `src/test/ui.test.ts` are all outside my row.

**Smallest fix that works, in `src/services/audio.ts` (unowned/shared), if the asset is not going to be
regenerated.** Nothing needs changing for this to be correct — it is a lever, not a bug:

```ts
export function play(n: SoundName, gain = 1, stopAfterMs?: number): boolean {
  // …
  start(free, Math.min(1, g));
  if (stopAfterMs !== undefined && stopAfterMs < SECONDS[n] * 1000) {
    setTimeout(() => { if (active.some((a) => a.pl === free)) stop(free); }, stopAfterMs);
  }
  // …
}
```

and in `src/services/fx.ts` — which **I own**, so once `play` accepts the argument this is a one-line
change on my side and needs no handoff:

```ts
page() { play('place', 1, 210); haptic('place'); },   // 210 ms ≈ the placement, not the file
```

**Better fix, if assets are in scope:** regenerate `place.wav` shorter. The synth is deterministic
(`npm run sounds`) and `scripts/synth-sounds.mjs` writes `manifest.json`, which `src/test/ui.test.ts`
asserts on. Target ≤ 0.22 s and keep the same attack/character so it still reads as paper meeting a desk.

**My recommendation:** the asset. A truncated tail is a hard stop mid-file and can read as a click. I am
not doing the `stopAfterMs` version unilaterally because it needs `audio.ts`.

---

## BLOCKED ON SHARED FILE: `src/screens/common.tsx` — `Page` re-renders on every store write

**Why.** `Page` (`common.tsx:18`) reads only `useSafeAreaInsets()`. It is **not** the problem. But it is
the wrapper every screen's `ScrollView` and `PaperBg` live in, and `PaperBg` mounts a full-screen SVG
`<Pattern>` fill plus a tiled 59 KB grain bitmap by default (`defaults.ts:23`: `paper: 'dots'`,
`texture: 'grain'`). That subtree is what the page transition used to re-rasterise every frame — now
fixed in `Book.tsx` — and it is still the bulk of what has to be laid out when a screen is mounted cold
(`RESEARCH-PERF.md` §#4).

**Not a perf fix I would make now.** `Page` is already minimal. The one thing worth considering, and I am
flagging it as an *option* rather than a recommendation, because it changes appearance:

```tsx
// PaperBg's grain tile is static for the life of the page. On Android, `resizeMode="repeat"` re-tiles
// the bitmap on every draw, and this View is inside the scroll content, so it is re-tiled on every
// scroll frame too.
<Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity: c.grain * (dark ? 0.55 : 0.8) }]} />
```

→ promote it out of the `ScrollView`'s content so it is a sibling of it (one view, drawn once per frame,
not per scroll step), or bake the grain into the `dots`/`ruled` `<Pattern>`. **Requires a render to
confirm the texture survives** — `qa/scripts/render.sh` can do that. Do not take this on blind.

---

## HANDOFF → A5 CARD (`src/screens/Today.tsx`): drop the `s.route` subscription

`Today.tsx:17` subscribes to `s.route`, so **every tab tap re-renders the whole of Today** — even the
taps that navigate away from it. `RESEARCH-PERF.md` §#5. This is a genuine per-tap cost that the
transition fix does not touch.

Today uses `st.route` in exactly two places (`Today.tsx:19` and `:37`):

```tsx
const now = useNow(st.route === 'Today' ? 30_000 : 60_000), today = startOfDay(now);
// …
<ClockFace id={st.settings.clock} size={124} live={st.route === 'Today'} />
```

Both need "is this page focused", which `Book.tsx:70-72` already explains must come from the
**navigator**, not the store (a hardware BACK moves the navigator without the store changing). The
screens don't have the Book's excuse, but they can't read the navigator without a hook the custom
navigator doesn't export.

**Cheapest correct patch, all inside `Today.tsx`, no shared file:**

```tsx
// before
const route = useStore((s) => s.route), settings = useStore((s) => s.settings), /* … */;
const st = { route, settings, meetings, courses, attendance, dayMarks, tasks, notices };
const now = useNow(st.route === 'Today' ? 30_000 : 60_000), today = startOfDay(now);

// after — focus is a per-frame-free boolean, not a store subscription
import { useIsFocused } from '@react-navigation/native';   // ← requires Book to provide the context,
//                                                            which it does not. See below.
```

So the honest version needs one thing from me or the orchestrator: **`Book.tsx` does not expose the
focused route to its screens.** The smallest thing that would let every screen drop its `s.route`
subscription:

```tsx
// src/navigation/Book.tsx — BookView, next to the existing `const cur = …` line
const FocusCtx = React.createContext(false);
export const useBookFocused = () => React.useContext(FocusCtx);
// …and wrap the pages: <FocusCtx.Provider value={i === state.index}>{descriptors[r.key]?.render()}</FocusCtx.Provider>
```

Then each screen does `const focused = useBookFocused()`. **I have not made this change** — it touches
all six screens and the coordinator's serialisation order, and it is a net-new public hook. Flagging it
as the structural fix for §#5 and leaving it to the orchestrator.

**Interim, zero-risk alternative if A5 does not want a hook:** `Today` may simply accept a 60 s clock and
a static `live` clock face. The cost of the wrong choice is a clock face that is not live on Today, which
is a visible regression — so this alternative is only worth it if `ClockFace` grows its own
focus check. Not my call.

---

## HANDOFF → A6 ANIM (`src/ui/DayBar.tsx`, `src/ui/charts.tsx`): hidden pages must not burn frames

`prompt.md` **V17** is a stated project rule: *"Nothing animates while off-screen. A hidden screen must
not burn frames."* Today it is violated in two places, both in files I do not own. Evidence:
`RESEARCH-PERF.md` §#6 and §#7.

**A. `DayBar.tsx` — the worst offender, and it runs forever.**
`DayBar.tsx:25` re-keys `withTiming(day, { duration: 900 })` on `day`, and `day` is derived from `now`,
which `Today.tsx:19` ticks every **30 s**. `Today` stays mounted behind every other tab, so:

> a 900 ms bar animation starts off-screen every 30 seconds, for the whole session.

`DayBar.tsx:55` adds one `AnimatedFill` (`withTiming(h, { duration: 800 })`) **per period** on the same
trigger — 6–7 concurrent animated SVG `Rect`s, and `'spines'` is the default bar (`defaults.ts:24`).

The fix needs to know whether the page is visible, and `DayBar` cannot see the navigator. Cheapest
correct version, entirely inside `DayBar.tsx`, no shared file:

```tsx
// DayBar.tsx — a day progress bar that is on screen does not need to be *animated*; one that is not on
// screen must not be animated at all.
export function DayBar({ kind, periods, now, ink, bg, w, h = 58, live = true }: /* … */ { /* … */ }) {
  const reduce = useReduceMotion(), /* … */;
  const still = reduce || !live;                       // ← NEW: off-screen, or reduce-motion
  const dayP = useSharedValue(still ? day : 0);
  useEffect(() => { dayP.value = still ? day : withTiming(day, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [day, still, dayP]);
  // …and pass `still` down as the existing `animate` flag to AnimatedFill (DayBar.tsx:53).
```

and let the caller decide, which means `Today.tsx` passes `live={focused}` — see the `useBookFocused`
note above. **A2/A6: this is the whole V17 fix; it is four lines once focus is available.**

Also `DayBar.tsx:92`: the `'ticker'` bar runs `useNow(1000)`, a 1 Hz timer on a hidden page. It needs the
same gate, or it needs to move into a child that only mounts when focused.

**B. `charts.tsx` — 69 concurrent animated SVG props, staggered over ~1 s, all inside the transition.**
`Bar` (l.47, 700 ms, `delay = i*70`), `VBar` (l.62, 600 ms, `delay = i*18`), `Line2` (l.71, 900 ms),
`Ring` (l.98, 900 ms). Stats mounts 48 `VBar` + 16 `Bar` + 1 `Line2` + 4 `Ring`, the last starting at
414 ms and running to 1014 ms — so the transition and every bar's entrance share every frame for the
first 200 ms, with ~210 static heatmap `Rect`s and ~140 attendance-cell `View`s also on screen.

Animated SVG props are the documented worst case
([reanimated#2618](https://github.com/software-mansion/react-native-reanimated/issues/2618): 30–40 fps
and 100% CPU on Android from one animated `Path`). All of them already honour `useReduceMotion()`, so
the gate has to be focus, not preference. **All of these already honour `useReduceMotion()` — the gap is
focus only, and it is the same one-line gate as DayBar.** The cheapest version, inside `charts.tsx`:

```tsx
// A bar's entrance is decoration; it must never be able to compete with a page transition. Cap the
// stagger so the last bar is not still growing a second after the page arrived, and make the duration a
// prop the screen can shorten for a mount that happens during a navigation.
const HB_STAGGER = 24;   // was i * 70
const VT_STAGGER = 8;    // was i * 18
```

That alone takes Stats' last bar from 1014 ms to ~584 ms and drops the peak concurrent count. I am not
prescribing the exact numbers without a device — **A6 owns the look of these.**

---

## NOT A HANDOFF — a warning about `react-native-screens`

`react-native-screens@4.26` is installed, and the obvious "freeze the inactive tab" fix is a trap. The
freeze mechanism works by wrapping screens in `<Screen>` from `react-native-screens`, which this
hand-rolled navigator never renders — `enableFreeze()` / `detachInactiveScreens` / `enableScreens()` would
be **no-ops**. And both reports on this app's configuration (New Architecture) are bad:
[#3190](https://github.com/software-mansion/react-native-screens/issues/3190) "enableFreeze not working
with new architecture" and [#2384](https://github.com/software-mansion/react-native-screens/issues/2384)
"enableFreeze cause to bottom tab navigator unresponsive". **Do not add it.** `inMountWindow` is the
correct answer for this navigator, and it is already there.

---

## ONE MEASUREMENT, if anyone gets a device

Everything above is reasoned. One command settles most of it, and it is the single highest-value thing
still outstanding for this app:

```bash
npx expo run:android --variant release          # release only — debug inflates Reanimated ~2.4×
adb shell dumpsys gfxinfo app.marginalia.planner reset
# …tap Week → To-do → Grades → Stats → Today, ten times, slowly…
adb shell dumpsys gfxinfo app.marginalia.planner framestats | head -40
```

Read the janky-frame percentage and the `Total frames rendered / Janky frames` pair, before and after
this change, on a release build, on the actual SM-A516N. Also useful, for the two questions I could not
answer:

- **`useLayoutEffect` vs `useEffect`** — does Fabric paint between the commit and the passive effect?
  A 60 fps screen recording of one tab tap, not a frame-time dump.
- **"worst on To-do"** — `RESEARCH-PERF.md` §#6. I could not find anything that makes To-do worse than
  Stats or Today, and I would rather flag that as unexplained than invent a cause for it.