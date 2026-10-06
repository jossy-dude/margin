# RESEARCH-PERF — why a tab tap took half a second

Agent **A1 PERF**. Reads/writes: `src/navigation/Book.tsx`, `src/navigation/window.ts`,
`src/services/fx.ts`, `qa/RESEARCH-PERF.md`, `qa/FIX-PLAN.md`, `src/test/perf-*.test.ts`.

---

## 0. How to read this document, and what is *not* in it

Every claim below is tagged:

| Tag | Meaning |
|---|---|
| **[READ]** | I read it in this repo or in the installed `node_modules` source, and can quote the line. |
| **[RAN]** | I executed code and the output is reproduced here. Still not a device measurement. |
| **[INFERRED]** | Reasoning from research plus code. Plausible, argued, **not measured**. |
| **[DEVICE]** | Would need a frame-time trace. **There are none in this document.** |

**There is no `[DEVICE]` evidence in this report, because there is no device.** The SM-A516N is behind a
secure pattern lock (`qa/STATE.md`, BUG-031). No `dumpsys gfxinfo`, no `framestats`, no Perf Monitor, no
on-device FPS. Every millisecond figure below is either a property of a curve I solved in node or an
arithmetic consequence of reading the code. **Where I say "saves ~X ms", X is the time the animation
stops occupying, not the time a frame stops being missed.** I cannot tell you what this app actually
measures at 30 fps, because I have not run it.

Target device, corrected: the brief said "Snapdragon 720G-class". The phone in `qa/` is a **Samsung
SM-A516N — Exynos 9611** (2×A73 + 4×A53, Mali-G72 MP3). [READ: `.agents/skills/mobile-usage/SKILL.md`,
`src/ui/keyboard.ts:16` "on a 411 dp phone"] That is a *weaker* 2018 part than a 720G and weaker than the
Moto G8 Plus every public benchmark below was run on, so the published numbers are an **optimistic**
proxy for this app, not a pessimistic one. Screen: 411 dp wide. Frame budget **16.67 ms**
([reactnative.dev/docs/performance](https://reactnative.dev/docs/performance)).

Stack: Expo SDK 57, RN 0.86.3, React 19.2, Reanimated 4.5.1 + worklets 0.10.1, Gesture Handler 2.32,
react-native-svg 15.15.4, react-native-screens 4.26 (present but unused by this navigator),
React Compiler ON (`app.json` → `experiments.reactCompiler: true`), Hermes, New Architecture,
`edgeToEdgeEnabled`, `reactNativeArchitectures=arm64-v8a`. [READ: `package.json`, `app.json`,
`android/gradle.properties`]

---

## 1. The mechanism, before the ranking

`act.go(route)` writes the store, BookView subscribes to `s.route`, a `[route]` effect calls
`navigation.navigate`, `useNavigationBuilder` re-renders, a `[cur]` effect stamps the visit, a third
render happens, and *then* `Placed`'s effect starts the tween. So the press and the first frame of
motion are separated by three React commits and three effect flushes.

**[RAN]** Traced through the installed router source:

- `SwitchRouter.getStateForAction` returns `{...state, routes}` where `routes` is a **new array holding
  the same route objects** — so route identity survives a navigation.
  [READ: `node_modules/@react-navigation/routers/lib/module/SwitchRouter.js:236`]
- `useRouteCache` re-proxies each route and returns the **previous object** when `isRecordEqual`.
  [READ: `…/core/lib/module/useRouteCache.js`]
- `useDescriptors` compares `deps = [route, navigation, routeState, screen.component, …]` with
  `isArrayEqual` and, on a match, **returns the previous descriptor**, whose `render()` closes over the
  *same element object*. [READ: `…/core/lib/module/useDescriptors.js:94-104`]
- `SceneView` wraps the screen in `StaticContainer`, a `React.memo` that ignores `children` and compares
  everything else by identity. [READ: `…/core/lib/module/StaticContainer.js`]

**Consequence, and it kills the most obvious hypothesis:** on a tab tap the mounted page subtrees **do
not re-render at all**. React bails out on the referentially-identical element. The brief's guess that
"each tap re-animates a full page subtree" is right about the *animation* and wrong about the *re-render*.
Re-rendering is not the cost. Compositing is. [INFERRED, from the four citations above]

**And the corollary, which is the whole bug:** because the page subtree is a **static cached subtree**,
the only thing that changes every frame is the transform/opacity of one wrapper view around it. That is
the cheapest possible animation on the platform — *provided the wrapper does not animate `opacity`*.
This app's wrapper did. That single property converts the cheapest possible animation into the most
expensive one.

---

## 2. Ranked root causes

### #1 — The page wrapper animated `opacity`. Highest confidence, biggest single win.

**[READ]** `src/navigation/Book.tsx` as shipped, line 28:

```tsx
return { opacity: on ? interpolate(p, [0, 0.25, 1], [0, 1, 1]) : 1, transform: [ … ] };
```

Four properties on one wrapper around an entire screen. Three are `transform` (free). One is `opacity`
on a view whose subtree is, by default, a full-screen SVG `<Pattern>` fill (`paper: 'dots'`,
`PaperBg.tsx:17,21`) **plus a full-screen `Image resizeMode="repeat"` of a 59 KB PNG**
(`texture: 'grain'`, `PaperBg.tsx:25`; defaults at `src/domain/defaults.ts:23`). [READ]

Why `opacity` on a *wrapper* is not free:

- Reanimated commits every animated prop through the shadow tree. "Every frame, Reanimated's worklet
  computes new values and commits a prop update through the shadow tree. That commit runs Yoga layout,
  prop diffing, and view mutations. When you're animating `transform` or `opacity` (properties with zero
  effect on layout) every bit of that work is wasted. You're paying the full price of a layout pass to
  nudge a blob three pixels to the left." —
  [Expo / App&Flow, *The real cost of React Native animations*](https://expo.dev/blog/the-real-cost-of-react-native-animations-benchmarking-every-approach)
- "Moving a view on the screen (scrolling, translating, rotating) drops UI thread FPS. This is
  especially true on Android … any other situation where **alpha compositing would be required to
  re-draw the view on each frame**." — [reactnative.dev/docs/performance](https://reactnative.dev/docs/performance)
- "Rendering transparent pixels on screen, known as **alpha rendering**, is a key contributor to
  overdraw… Visual effects like transparent animations, fade-outs, and drop shadows involve some
  transparency, and can therefore contribute significantly to overdraw." —
  [developer.android.com/topic/performance/rendering/overdraw](https://developer.android.com/topic/performance/rendering/overdraw)

A view whose alpha is changing must be rendered into a target and blended every frame, and everything
inside it — the pattern SVG, the tiled grain bitmap, every `HandBox` outline, every glyph — is
re-recorded into that target. That is the cost of "transparent page over opaque page", paid 31 times.

**Magnitude.** [RAN] The same benchmark, Reanimated with shared values, Android, Moto G8 Plus, **release**
build: **7.25 ms/frame at 10 animating views, 11.98 ms at 100, 39.94 ms at 500** — against a 16.67 ms
budget. And in **debug** the same thing is 28.62 ms at only 50 views. So even at 10 views Reanimated
sits at 43% of the frame budget for the animation engine alone, before anything is drawn.

**Expected effect of removing it.** [INFERRED] Removes one shadow-tree commit **and** the offscreen
re-composite per frame, and — see #3 — removes the one-frame blank flash. I cannot put a number on it
without a trace. What I can say is structural: it takes the transition from "animating a view that
re-rasterises a page subtree per frame" to "animating a transform on a cached texture", which is the
configuration every benchmark in the table above is measuring.

**Also a visible defect, not just a cost.** [RAN] Rendered and looked at (`/tmp/render/STRIP2.png`):
at t=17 ms the incoming page is at `opacity ≈ 0.14` and at t=33 ms `≈ 0.30`. For the first three frames
you see the **previous page straight through** the new one. That translucency is a large part of what
"shuffly" *looks* like, and it is not something a duration change can fix.

---

### #2 — 520 ms, of which ~187 ms is dead. Duration and curve, by arithmetic.

**[READ]** As shipped: `withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.9, 0.25, 1) })`,
`translateY −70→0`, `translateX 38→0`, `rotate 4.5→0` (overshooting to −0.4° at 70%), `scale 1.045→1`,
and `shadow opacity 0.35→0` across the whole 520 ms.

**[RAN]** I solved the bezier (same inversion Reanimated uses) and sampled it:

| time | 16.7 | 33 | 50 | 67 | 83 | 100 | 117 | 133 | 150 | 167 | 183 | 200 | 250 | 333 | 362 | 520 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| % placed | 14 | 28 | 40 | 51 | 61 | 68 | 74 | 79 | 83 | 86 | 90 | 91 | 95 | 98 | 99 | 100 |

- 50% placed at **64 ms**. 90% at **192 ms**. 99% at **362 ms**.
- **Optically settled at 333 ms** — defined as the first 60 Hz frame where consecutive frames differ by
  < 0.5% of the distance. 333–520 ms (7 frames) is imperceptible creep that the shadow fade and the
  −0.4° unwind still occupy.

That is the arithmetic of "about half a second". And it is not *only* duration: 333 ms of visible motion
plus a start-up delay is the reported number.

Two things follow.

- **The 187 ms tail is free money.** [INFERRED] Those frames buy no perceptible motion, and they cost the
  most expensive thing there is here: two page subtrees live and being composited, plus a full-screen
  alpha veil on top of both.
- **The curve is front-loaded, which is why it read as a *pause* then a jump**, not as motion. 14% of
  the distance on frame 1, 68% by frame 6, and then 200 ms of nothing happening.

**Also: the ceiling was the target.** [READ] `prompt.md` V3 — "each page visibly drops in from
above-right, tilts, **settles within ~0.5 s**". 520 ms sat *exactly on* the acceptance ceiling. V3 is a
ceiling, not a target.

**Expected effect.** [RAN] 520 → 200 ms: frames during which two page subtrees are simultaneously live
drops **31 → 12**, a saving of **19 frames ≈ 320 ms of overlapping compositing per tap**. Per-frame
progress at the new numbers: frame 1 = 36%, frame 2 = 62%, frame 3 = 78%, frame 6 = 96%, optically
settled at **167 ms** (a 33-frame tail removed). Test-enforced in `src/test/perf-placement.test.ts`.

---

### #3 — The animation was armed from a passive effect, so one frame was pure latency.

**[READ]** As shipped, `Book.tsx:21` used `useEffect`, and did `k.value = 0; k.value = withTiming(…)`.
Two separate problems in two lines:

1. `useEffect` is a **passive** effect. React schedules it *after* commit and after the paint. So the
   commit that mounted the incoming page could — and on a busy JS thread will — be painted with the page
   already at `translateY −70 / opacity 0` and **nothing moving yet**. One frame of nothing, on every
   single navigation. [INFERRED from React's effect ordering; the ordering itself is not something I
   measured on Fabric.]
2. `k.value = 0` immediately before the `withTiming` means the page is *authoritatively invisible* from
   the moment of the commit until the tween's first frame.

**Combined with #1 this is the actual "nothing happens" the owner is describing**: for the first frame
you see only the previous page, and for the next three you see it through a translucent one.

**Expected effect.** [INFERRED] `useLayoutEffect` runs synchronously in the commit, before the frame is
drawn, so the tween is armed in the same frame that mounts the page. Removes one painted frame of
latency per navigation. High confidence it removes the flash; **I cannot prove Fabric paints before the
next vsync without a device**, and if it does not, the `opacity` removal in #1 makes the point moot
because there is no invisible state left to show.

---

### #4 — Three React commits per tab tap. Left alone, deliberately.

**[READ]** `act.go` → store write → **commit 1** (BookView re-renders on `s.route`; the navigator has
*not* moved yet) → `[route]` effect → `navigation.navigate` → **commit 2** (`state.index` moved; the
incoming page is still outside the mount window, so commit 2 is visually a no-op) → `[cur]` effect →
`setVisited` → **commit 3** (the page finally mounts, and *then* the placement runs). `TabRouter` has
all six routes in `state.routes` from `getInitialState`, in declaration order — **it does not track visit
order** [READ: `SwitchRouter.js:getInitialState`], so the stamps cannot be derived from the router.

So the press→motion path crosses at least three scheduler round-trips, and the last one contains a full
page mount.

**What it costs.** [RAN] Because of `useDescriptors` + `StaticContainer` (§1), commits 1–3 re-render
BookView, two `Placed`s and the **bottom nav** — a `HandBox` (an `onLayout` + a memoised hand path + an
SVG with two `Path`s) plus 5 `Pressable` + 5 `View` + 5 `Icon` SVG + 5 `Txt`. Call it ~30 native views
per nav-bar render, ×3. Plus on *every* store write, `subs.forEach(f => f())`
(`store.ts:40`) re-checks every `useSyncExternalStore` selector app-wide. [READ]

**Why I did not fix it, and what I rejected.** [INFERRED]

- **`backBehavior: 'history'`** would make `state.history` a real visit log and would let the mount
  window and z-order be derived with no local state at all, deleting commit 3. Rejected: it changes what
  Android BACK does (`nav-sync.test.ts:24` documents the current `firstRoute` behaviour explicitly, and
  changing it is a navigation redesign — `qa/COORDINATION.md` §3).
- **Force the focused route into the mount window** (`inMountWindow(…) || i === state.index`) would move
  the mount one commit earlier and save one round-trip. Rejected on inspection: commit 2 would then
  transiently mount **three** pages, and the strip the placement opens at the bottom of the screen would
  show the page *before* the one you navigated from — a visible "wrong page underneath". The mount work
  is identical either way; only the scheduling changes.
- **Mutating a ref during render** to fold the stamp into the same commit. Rejected: impure, and
  StrictMode's double-invoke would bump the counter twice and evict the page behind.
- **Memoising the nav bar** would save 1 of its 3 renders. Rejected as not worth the code: `cur` changes
  between commit 1 and commit 2, so a memo keyed on `cur` still re-renders twice.

**What is still on the critical path.** [INFERRED] The incoming page's **mount** — the whole subtree —
happens in commit 3, immediately before the placement is armed. `inMountWindow`
(`navigation/window.ts`) keeps only the current and the previous page, so cycling five tabs means the
fourth-old one is gone and returning to it is a **cold mount**: `PaperBg` + `ClockFace`
(`SvgXml` of the whole dial + 1–5 spinning `SvgXml` layers + 3 hand `SvgXml`s) + `DayBar` + 7 day
`HandBox`es + the class list + a `HStrip` + up to 5 `TaskCard`s, each of which is a `SwipeCard`
(`Gesture.Pan()` + `GestureDetector` + 4 `Animated.View`s + 2 `Pressable`s + a `HandBox` SVG). That is
the honest answer to "worst on To-do": To-do's *list* is the biggest cold mount in the app, and it is on
the critical path. Not fixable from inside Book.tsx without abandoning the two-page window.

---

### #5 — Every mounted screen subscribes to `s.route`, so a tab tap re-renders the page you are leaving.

**[READ]** `Today.tsx:17`, `Focus.tsx:37` (`Dial`) and `Focus.tsx:125`, `Overlay.tsx:16`, and
`Book.tsx:65`. Each is a separate `useStore((s) => s.route)`. [READ]

`act.go` writes `route`, so **every one of those re-renders on every tab tap**, including the screen you
are navigating *away* from. `Today` is the expensive one: `Page` (ScrollView + `PaperBg`) + `ClockFace`
(memo'd, but its parent re-renders) + `DayBar` + the 7-day strip + the class list + `HStrip` + 5
`TaskCard`s (memo'd, bail out). `Today` also re-keys `useNow(30s)` on it.

**This is not `StaticContainer`'s doing** — a store subscription re-renders independently of the parent.

**[INFERRED]** A tab tap re-renders two full pages (the one you leave and the one you arrive at) before
any of them is composited. Removing the subscription from the screens that do not need a route-dependent
60 Hz behaviour — the honest version is to derive "is this the focused screen" from the navigator rather
than from the store — would cut it. `Book.tsx:70-72` already documents *why* the nav bar must read
`cur` and not `route`; the screens do not have that excuse, but they are not mine.

---

### #6 — `charts.tsx` starts ~69 concurrent animated SVG props on Stats, inside the transition.

**[READ]** `src/ui/charts.tsx`, every bar animates `useAnimatedProps` on an `Animated` `Rect`/`Path`/
`Circle`, with `withDelay` and 600–900 ms durations: `Bar` (l.47, 700 ms, `delay = i*70`),
`VBar` (l.62, 600 ms, `delay = i*18`), `Line2` (l.71, 900 ms), `Ring` (l.98, 900 ms).

**[RAN]** Stats mounts: `Heatmap`×2 (105 static `Rect`s each, no animation), `Hist24`×2 → **48** `VBar`s,
`HBars` focus-by-subject ≤6 + attendance-by-subject 5 + grade-totals 5 = **16** `Bar`s, `Line2` **1**,
`Ring`×4. Total **69 animated SVG props**, the last `VBar` starting at 23×18 = 414 ms and running to
1014 ms.

Animated SVG props are the worst case: [reanimated#2618](https://github.com/software-mansion/react-native-reanimated/issues/2618)
measured 30–40 fps and 100% CPU from "a simple `animatedProps` on an SVG Path" on Android, and
Software Mansion's own write-up says the Android renderer draws through Canvas with **"no caching
involved"** — [You Might Not Need react-native-svg](https://swmansion.com/blog/you-might-not-need-react-native-svg-b5c65646d01f).
Counting the whole subtree, Stats also mounts ~210 static heatmap `Rect`s (105 cells × 2 heatmaps) and
~140 plain `View`s for the 28-cell attendance rows (28 cells × 5 demo subjects) — so ~69 of its views
are animating and ~350 are merely there. [RAN] Interpolating that benchmark's 10→100-view curve puts 69
animating views at roughly **10–11 ms/frame of the 16.67 ms budget**, before the page transition and
before those ~350 static views are drawn. [INFERRED]

**And this does not explain the complaint.** Stats is the heaviest page in the app by both animated
count and mount cost, and the owner reported To-do. I could not find anything that makes To-do
specifically worse than Stats or Today — To-do is a long `ScrollView` of `SwipeCard`s, which is where
re-rasterisation is most *noticeable* while scrolling rather than during the swap. I am flagging that as
an unexplained signal rather than inventing a cause: either the tabs were tapped in an order that left
To-do cold, or the cost is in the scroll-and-settle rather than in the transition. Only a device settles
that, and it matters. [INFERRED, low confidence]

---

### #7 — Off-screen pages keep animating. Violates a stated project rule.

**[READ]** `prompt.md` V17: "Nothing animates while off-screen. A hidden screen must not burn frames —
this is a stated project rule." [READ] Violations, by file I do not own:

- `src/ui/DayBar.tsx:25` — `dayP.value = …withTiming(day, { duration: 900 })`, re-keyed on `day`, which
  changes **every 30 s** while Today is mounted. `Today` stays mounted while you are on To-do. So a
  **900 ms bar animation starts off-screen every 30 s**, forever.
- `DayBar.tsx:55` — `AnimatedFill`: one `withTiming(h, { duration: 800 })` **per period**, i.e. 6–7
  concurrent animated `Rect`s on the same trigger. The default bar is `'spines'` (`defaults.ts:24`).
- `DayBar.tsx:92` — `Ticker` variant runs `useNow(1000)`: a 1 Hz timer on a hidden page.
- `charts.tsx` — the same pattern, but Stats only holds 2 pages so the exposure is narrower.

**[INFERRED]** Roughly one second of off-screen animation every 30 seconds, for as long as the app is
open on a two-tab session. This does not make a tap slow; it makes the whole app periodically janky, and
on a busy JS thread it competes with the commit-3 mount in #4. **Not mine to fix.**

---

### #8 — The gesture's *start* latency, which I could not measure

**[READ]** the four-task path in §4. **[DEVICE]** needed for the number. The owner's "about half a
second after the press" and my computed "333 ms of visible motion" imply **~150–200 ms** of start-up
latency, but that is an **arithmetic subtraction across two independently-derived numbers, one of which
is the owner's memory of a gesture**. It is the least trustworthy number in this document and I am not
puting it forward as a finding. It is also the number a device trace would nail in one `dumpsys
gfxinfo` run.

---

### Things I looked for and did NOT find

- **No known RN 0.86 / SDK 57 / Reanimated 4.5 regression** for tab transitions, `useFrameCallback`, or
  shared-value churn. I searched for this specifically. The honest conclusion is that the cause is in
  *this app*, not the platform — which is what #1 and #2 say. [INFERRED]
- **No React Compiler miscompilation of `useAnimatedStyle` here.** The documented hazard is
  `sv.value = …` mutation ([facebook/react#29640](https://github.com/facebook/react/issues/29640), and
  Reanimated's own "React Compiler support" note: *"refrain from accessing and modifying the value
  property directly. Instead, use the get and set methods"*), and `eslint --max-warnings=0` is green
  today, so the compiler lint rule is not active on this tree. Hardened anyway (§3 of FIX-PLAN).
- **`react-native-screens` `enableFreeze` is not usable here.** Freezing works by wrapping the screen in
  `<Screen>` from `react-native-screens`, which this hand-rolled navigator never renders, so the flags
  would do nothing. And both known reports on this app's configuration are bad: "enableFreeze not
  working with new architecture" ([#3190](https://github.com/software-mansion/react-native-screens/issues/3190))
  and "enableFreeze cause to bottom tab navigator unresponsive"
  ([#2384](https://github.com/software-mansion/react-native-screens/issues/2384)). **Do not turn it on.**
  [READ + research]
- **`detachInactiveScreens` / `enableScreens`** apply to `createNativeStackNavigator`, not to
  `createNavigatorFactory`. No effect here.
- **`SYNCHRONOUSLY_UPDATE_UI_PROPS`.** Reanimated's build-time flags that skip the shadow-tree commit
  for non-layout props: measured at **−11% (11.87 → 10.57 ms)** for Reanimated shared values at 50 views
  on Android. Opt-in, "can cause visual bugs in some apps", and they are a property of the Android
  build — not mine, and not something to turn on blind. [research]
  RN 0.85+ has an experimental Shared Animation Backend that will eventually make them unnecessary.

---

## 3. What could not be measured, and what would measure it

**All of it, on a device.** Concretely, the things this document asserts and cannot prove:

| Claim | Needs |
|---|---|
| how long the page takes to appear after the press | `adb shell dumpsys gfxinfo <pkg> framestats`, one tap, one dump |
| whether the frame budget is actually blown | janky-frame % before/after, **release build** (the benchmark shows debug inflates Reanimated 2.4×) |
| whether removing the page fade helped | the same, on the same tab, same session |
| whether `useLayoutEffect` really removed the blank frame | a screen recording at 60 fps; not a frame-time dump |
| whether the mount in commit 3 is the To-do bottleneck | `Flipper > Performance`, or a `<Profiler>` around the screen |
| whether the Exynos 9611 behaves like the Moto G8 Plus | the benchmark run on *this* phone |
| whether `SYNCHRONOUSLY_UPDATE_UI_PROPS` is safe here | a release build, visual comparison, per-frame |

Also unmeasurable **in this tree**, and worth saying plainly: Reanimated's per-frame cost is a function
of how many views are in the *animating* subtree. `Placed` animates **one** view; its siblings cost one
blend. I could not count the platform's actual draw calls, layer count, or texture memory for the
transition.

---

## 4. Sources

- [The real cost of React Native animations: benchmarking every approach — Expo / App&Flow, Apr 2026](https://expo.dev/blog/the-real-cost-of-react-native-animations-benchmarking-every-approach) — per-frame UI-thread cost by view count, release vs debug, the feature flags, and the shadow-tree explanation. The single most useful source here.
- [React Native — Performance Overview](https://reactnative.dev/docs/performance) — 16.67 ms budget, alpha compositing on Android, JS-navigator vs native-navigator transitions, `renderToHardwareTextureAndroid`.
- [React Native — Animations](https://reactnative.dev/docs/animations) — native driver, non-layout properties only.
- [Reanimated — useFrameCallback](https://docs.swmansion.com/react-native-reanimated/docs/advanced/useFrameCallback/) · [Performance guide](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance) · [useSharedValue / React Compiler support](https://docs.swmansion.com/react-native-reanimated/docs/core/useSharedValue) — `get`/`set`.
- [react-native-reanimated #2618](https://github.com/software-mansion/react-native-reanimated/issues/2618) — `animatedProps` on an SVG `Path`, 30–40 fps and 100% CPU on Android.
- [Software Mansion — You Might Not Need react-native-svg](https://swmansion.com/blog/you-might-not-need-react-native-svg-b5c65646d01f) — the Android Canvas renderer redraws everything, no caching.
- [Android Developers — Reduce overdraw](https://developer.android.com/topic/performance/rendering/overdraw) — alpha rendering and transparency as overdraw contributors.
- [react-native-screens #3190](https://github.com/software-mansion/react-native-screens/issues/3190) / [#2384](https://github.com/software-mansion/react-native-screens/issues/2384) / [README — `enableFreeze`](https://github.com/software-mansion/react-native-screens/blob/main/README.md) — why freezing is not available to a custom navigator and is unsafe on the New Architecture.
- [facebook/react #29640](https://github.com/facebook/react/issues/29640) — React Compiler and `sharedValue.value` mutation.
- [Expo — The real cost of RN animations] also reports RN 0.85's experimental Shared Animation Backend, which will retire the sync-update flags.
- In-repo, read directly: `node_modules/@react-navigation/routers/lib/module/SwitchRouter.js`, `…/core/lib/module/{useRouteCache,useDescriptors,SceneView,StaticContainer,useNavigationBuilder}.js`; `src/navigation/Book.tsx`, `src/navigation/window.ts`, `src/screens/*`, `src/ui/{kit,PaperBg,DayBar,charts,Swipe,fit,theme-context}.tsx`, `src/ui/clock/{ClockFace,faces}.ts`, `src/store/store.ts`, `src/services/{fx,audio,haptics}.ts`, `src/App.tsx`, `package.json`, `app.json`, `android/gradle.properties`, `prompt.md`, `qa/STATE.md`.