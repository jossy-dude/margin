# Lag diagnosis — page transitions, clock-face selection (2026-10-14)

**Let's make v1 first.** This document is diagnosis only — no `src/**` file was touched. The fix
batch in §3 is deliberately scoped to **one shippable slice: F1–F3 ("make store writes and clock
ticks cheap")**. Everything else that this diagnosis turned up (picker mount cost, unvirtualized
task list, native SVG view mass, `dayBlock` recompute) is listed as *deferred to v2* and is **not**
part of v1. If F1–F3 land and the app still feels laggy, we re-measure with the probe (§5) before
adding anything else.

Two probes were added under `tools/` (not production code):

```bash
# full render-behaviour probe (E0–E3, 9 tests)
npx jest --testMatch '<rootDir>/tools/lag-probe.test.tsx'
# SVG string-generation + parse micro-benchmark (E4)
npx jest --testMatch '<rootDir>/tools/face-cost.test.ts'
```

**What the numbers are and are not.** They come from jest + V8 + `react-test-renderer` on this
machine — *not* Hermes + Fabric on a phone. Absolute milliseconds will differ on device; the
**relative shape** (which subtree re-renders, how many native views get created, which write fans
out where) is exact, because it is read off the real app tree and the real store. A React
"render" here is a JS render pass; it only becomes native layout/draw work when props or children
actually change (§4 lists what needs a device to settle). The prior web-only measurement
(press-in → painted ≈ 25–31 ms) is treated as a secondary baseline.

Gate: `npm run check` is green after this work — **46 suites / 764 tests pass, no boundary
violations** (typecheck + lint + tests + import boundaries all pass; only `docs/` and `tools/`
were added).

---

## 1. Traced paths

### 1.1 Tab tap

| step | where | cost |
|---|---|---|
| 1. Finger-down → `onPressIn` → `act.go(name)` + `navigation.navigate(name)` | `src/navigation/Book.tsx:102` | deliberate: store-first so one render pass, not two (`Book.tsx:59-68` comment) |
| 2. `set({ route, prevRoute })` → **one** broadcast (probe confirmed `route,prevRoute` only) | `src/store/store.ts:145` (`set` is a synchronous broadcast to every subscriber) | all subscribers run their selectors |
| 3. `Page` wrapper flips `display: 'none' ⇄ 'flex'` + `zIndex`, and `ScreenLive.Provider value={on}` flips | `src/navigation/Book.tsx:50-51` | **both** the leaving and the entering screen re-render through `useScreenLive` consumers; display flip changes `YogaDisplay.NONE` (see `Book.tsx:30-35, 91`) |
| 4. Consumers re-render: screen roots (`Today.tsx:258`, `Focus.tsx:205`), chart containers (`src/ui/charts.tsx:51` → `Ring/HBars/Hist24/Line2/Heatmap`), `DayBar`/`RunningTimer` via `live` prop (`DayBar.tsx:51`, `RunningTimer.tsx:43`) | | measured below |
| 5. Native: Yoga display flip + draw the new top page | device-only | see §4 H3 |

Measured (JS commit = `performance.now()` around one `act` = press-in → React commit finished):

| tap | JS commit | profiler render total | what re-rendered |
|---|---|---|---|
| Today → Week | 36.0 ms | 51 ms | TodayScreen×1, Txt×133, HandBox×35, Icon×28, WeekScreen×2 |
| Week → Today | 39.0 ms | 40 ms | TodayScreen×1, WeekScreen×1, Txt×133, HandBox×35 |
| Today → Tasks | 23.0 ms | 34 ms | TodayScreen×1, Txt×65, HandBox×17, TasksScreen×1, Chip×26 |
| Tasks → Today | 20.0 ms | 26 ms | TodayScreen×1, TasksScreen×1, Txt×65 |
| Today → Grades | — | 16 ms | TodayScreen only (Grades has no `route`/live-dependent body work) |
| Grades → Stats | — | 20 ms | **only chart containers + children** (Ring×8, HBars×6, Txt×34) — Grades/Stats bodies don't subscribe to route at all |
| Stats → Today | — | 37 ms | TodayScreen + StatsScreen (chart containers) |

Range: **JS commit 20–39 ms, profiler render 16–51 ms per tap.** The dominant cost is re-rendering
the leaving **and** entering screen subtrees (`ScreenLive` flip), not the store write itself.

### 1.2 Clock-face select (the reported symptom)

| step | where | cost |
|---|---|---|
| 1. Finger **lift** → `onPress` → `set({ clock: f.id })` + `fx.select()` | `src/sheets/Settings.tsx:176` | raw `onPress`, unlike tabs' `onPressIn` — response starts on lift, + a haptics/sound call |
| 2. `setSettings(patch)` → `set(...)` → synchronous broadcast → `configureFx` → `persist` | `src/store/store.ts:159-161` | every `s.settings` subscriber re-renders |
| 3. Subscribers of the **whole** settings object: `TodayScreen` (`Today.tsx:253`), `TasksScreen` (`Tasks.tsx:13`), `GradesScreen` (`Grades.tsx:14` and `:43`), `FocusScreen` (`Focus.tsx:204`), `SettingsSheet` (`Settings.tsx:101`) | | **5 screens fan out on every settings write, clock or not** |
| 4. Grades body recomputes rows per render: `courses.map` → `marks.filter().sort()` per course + totals/needs | `src/screens/Grades.tsx:43-46` | profiler 46–66 ms on a settings write — the single biggest screen |
| 5. Dial rebuild: `ClockFace` memo re-renders (props changed) → `SvgXml xml={base}` swap; `SvgXml` memoizes parse on `[xml]` (`node_modules/react-native-svg/src/xml.tsx:71-74`), so parse happens only because the string really changed | `src/ui/clock/ClockFace.tsx:65-68` | string gen 0.08–0.92 ms, parse 0.70–1.94 ms per face (E4 micro-bench) — **negligible** |
| 6. Two dials rebuild: Today 92 dp **and** hidden Focus 196 dp (`Focus.tsx:72` `Dial` subscribes `s.settings.clock`) | | `SvgXml×5` per select in probe (Today + Focus + 3 picker thumbs) |

Measured:

| action | JS commit | profiler total (all commits) | fan-out |
|---|---|---|---|
| `setSettings({clock:'c'})` | **152 ms** | 219 ms | TodayScreen (24 ms), TasksScreen (8), GradesScreen (52), FocusScreen (17), SettingsSheet (3), Txt×333, AttCell×115–230, ClockFace×2, SvgXml×5 |
| `setSettings({clock:'sl'})` | **156 ms** | 264 ms | same shape; GradesScreen 46 ms, FocusScreen 39 ms |
| **control**: `setSettings({soundOn:false})` (no clock change) | — | 169 ms | **identical fan-out minus ClockFace/SvgXml**: Today, Tasks, Grades (66 ms), Focus, SettingsSheet, Txt×333, AttCell×115 |
| open picker sheet | **82 ms** | 153 ms | SettingsSheet 72 ms, **FaceThumb×5 mounting 762 native SVG views**, FocusScreen×1 (it subscribes `s.sheet`, `Focus.tsx:204`) |

The control is the key result: **the fan-out, not the SVG rebuild, is the bulk of the 152–156 ms.**
Removing the dial swap entirely would save roughly the 5–10 ms of ClockFace/SvgXml work.

### 1.3 Per-second tick

| source | where | condition |
|---|---|---|
| Focus screen's own ticker: `useNow(focused \|\| st.timer.running ? 1000 : 30_000)` | `src/screens/Focus.tsx:207` | ticks at **1 Hz even when Focus is hidden**, as long as a round is running |
| `useEffect(() => act.timerPump(now), [now])` | `src/screens/Focus.tsx:213` → `src/store/store.ts:227-229` | writes only when `advance()` produced events (usually silent) |
| Today's visible widgets | `src/ui/DayBar.tsx:51` (`live ? 1000 : 60_000`), `src/ui/RunningTimer.tsx:43` (`live ? (running ? 1000 : 30_000) : 60_000`) | 1 Hz only while visible/running — legitimate |
| Grades/Week/Tasks/Stats minute-granular `useNow(60_000)` | `Grades.tsx:15` etc. | 1/min, cheap |
| every state write → synchronous broadcast | `src/store/store.ts:145` | any `set()` re-runs all subscribers' selectors |

Measured over 3.1 s (4 one-second slices, render counters cumulative):

| scenario | per-second churn |
|---|---|
| Focus visible (round running) | FocusScreen re-renders **every second** (×3), dragging ~20–90 `Txt`/`HandBox`/`Icon` leaves per tick; profiler ~283 ms total incl. one background broadcast |
| Focus **hidden**, round running, Today visible | `RunningTimer×3`, `DayBar×3` (visible, fine) **+ `FocusScreen×3` re-rendering a hidden screen at 1 Hz**, `Txt×102`, `HandBox×45` — profiler 50 ms in 3.1 s |
| idle | `DayBar×3` only (`Txt×30`, `HandBox×6` leaves) — ~17 profiler commits/3.1 s of tiny work; constant 1 Hz wakeups on an otherwise idle app |

### 1.4 Background broadcast (one-off, but during use)

Shortly after hydrate, `resync` fires a `notifStatus,plan` write; probe: **`StatsScreen×2`
(25 ms profiler) + AttCell×115 + TaskCard×21 + Chip×23** across the tree — because
`common.tsx:79` selects `s.settings.notif` and Grades/Tasks re-render through it
(`Settings.tsx:101` also selects `notifStatus`/`plan`). One write, five screens, ~25–51 ms —
right around the time the user starts touching the app.

---

## 2. Ranked root causes

Ranked by *cost × frequency × how much of the reported symptoms they explain*. File:line evidence
for every claim; numbers are the probe (§5).

### RC-1 — Every settings write re-renders five screens (the 152 ms clock-select is mostly this)

**Evidence:** whole-`s.settings` selectors at `Today.tsx:253`, `Tasks.tsx:13`, `Grades.tsx:14` +
`:43`, `Focus.tsx:204`, `Settings.tsx:101`. The A/B control in §1.2 proves it: `soundOn` (which
nobody sees on those screens) costs the **same** 169 ms profiler fan-out as `clock` — Grades alone
burns 46–66 ms recomputing rows (`Grades.tsx:43-46`) and re-rendering `AttCell×115–230`
(`AttendanceGrid`, `Grades.tsx:13-17`, plus `useNow(60_000)`).
**Explains:** clock-face select lag, and every other settings toggle (task filter/sort chips on
Tasks call `setSettings` too — `Tasks.tsx:36-37` region, so filtering the list re-renders Today,
Grades and Focus).

### RC-2 — Clock select also pays: finger-lift input + two dial rebuilds + haptics

**Evidence:** `Settings.tsx:176` raw `onPress` (fires on lift, unlike tabs' `onPressIn` at
`Book.tsx:102`); `ClockFace.tsx:65-68` full `SvgXml` swap of Today 92 dp **and** hidden Focus
196 dp (`Focus.tsx:72`); `store.ts:159-161` runs `configureFx` + `persist` on the same
synchronous path. Micro-bench (E4): the SVG *string+parse* is only 0.1–2 ms — the rebuild's real
cost is on the native side (§4 H2) plus re-rendering both dial subtrees.
**Explains:** the extra "dead" feel on lift for this specific control vs tabs.

### RC-3 — Opening the picker mounts 762 native SVG views in one commit

**Evidence:** E0 — 5 × `FaceThumb` (`Settings.tsx:177`, size 96) = per-thumb
`[130,127,114,243,148]` host views (heaviest: `sl` at 243). Picker open = 82 ms JS commit,
SettingsSheet 72 ms of it. Baseline across the always-mounted tree: Today 235, Week 84, Tasks 228,
Grades 45, Stats 408, Focus 225 = **1 225 SVG host views already mounted** (all six pages stay
mounted, `Book.tsx:50`); picker open pushes it to **1 987**.
**Explains:** stutter when the clock sheet opens, before any face is even chosen.

### RC-4 — Hidden Focus screen ticks at 1 Hz whenever a round runs

**Evidence:** `Focus.tsx:207` keys the interval on `focused || st.timer.running` → probe shows
`FocusScreen×3` in 3.1 s **while Focus is display:none**, dragging `Txt×102`/`HandBox×45` with
it, plus a `timerPump` effect run per tick (`Focus.tsx:213`).
**Explains:** background jank during a focus round (scrolling, streak animations, sheet gestures
getting interrupted by a 1 Hz commit nobody can see).

### RC-5 — Tab taps re-render both screen subtrees + a Yoga display flip

**Evidence:** `Book.tsx:50-51` flips `display` and `ScreenLive` for the leaving *and* entering
page; probe E1 = 20–39 ms JS commits, `TodayScreen×1 + Txt×65–133 + HandBox×17–35` even for a tap
that leaves Today. Grades→Stats is cheap (20 ms) precisely because those bodies don't re-render —
confirming the mechanism is the live-flip, not navigation itself.
**Explains:** general "page changes feel laggy" — 20–39 ms JS + Yoga flip + next vsync ≈ a
visible frame or two; Tasks is the worst destination (unvirtualized list, RC-6).

### RC-6 — Un-memoized kit leaves multiply every parent re-render

**Evidence:** `Txt` ×65–333, `HandBox` ×17–115, `Icon` ×11–111 re-render per event with no memo
boundary (probe counters; e.g. one settings write = `Txt×333`). They're individually cheap
(0–5 ms total) but they are what turns a screen re-render into 100+ JS operations, and they
re-execute style/hint work every time. Related: `Today.tsx:264-265` builds two fresh `dayBlock`
arrays every render (new array identities → children re-render even if contents match),
`Grades.tsx:43-46` recomputes+sorts rows every render, `Tasks.tsx:36-37` re-`map`s the whole
task list with no virtualization (228 SVG icons already mounted, `TasksScreen` 228 views).
**Explains:** why *everything* costs more than it should — the amplifier on RC-1/RC-4/RC-5.

### RC-7 — Hydrate's `notifStatus,plan` broadcast re-renders 5 screens (~25–51 ms) right after launch

**Evidence:** E3 store-write watcher; `common.tsx:79` (`s.settings.notif`), `Settings.tsx:101`
(`s.notifStatus`, `s.plan`), `store.ts:98-128` (`resync` only notifies when visible state changed —
it did change, so the fan-out is "correct" but broad).
**Explains:** a hitch when the app settles after hydrate / after permission checks.

### Rejected/deprioritised

- **"SVG string generation or parse is the cost"** — rejected: E4 micro-bench is 0.08–0.92 ms gen
  and 0.70–1.94 ms parse per face; and `SvgXml` memoizes on `[xml]` so no parse happens unless the
  id actually changed (`react-native-svg/src/xml.tsx:71-74`).
- **"RawText → measure/layout thrash every commit"** — not supported by the data: a re-render
  only re-runs JS render functions; the probe can't see Yoga. Text relayout would only happen if
  text/style props change. This needs a device to settle either way (§4 H3) rather than a claim.
- **Memo wrappers in the probe matched by `displayName ?? name`** — measurement caveat, not a
  product issue.

---

## 3. Proposed fix batch — v1 (ordered)

One slice: **make store writes and clock ticks cheap.** Ordered by value/risk; each is verifiable
by adding assertions to `tools/lag-probe.test.tsx` (e.g. "a `soundOn` write must not re-render
`GradesScreen`").

| # | fix | touches | expected effect | risk |
|---|---|---|---|---|
| **F1** | **Narrow every whole-`s.settings` selector to the fields actually read** — `Today.tsx:253`, `Tasks.tsx:13`, `Grades.tsx:14`+`:43`, `Focus.tsx:204`. (Enumerate each screen's real field reads: Grades = `lockAttendance`/`semesterStart`, Focus = `tickOn`/`soundOn`/h24-ish, Today = `clock`/`bar`/`name`, Tasks = `taskFilter`/`taskSort`.) `Settings.tsx:101` keeps the whole object — it *is* the settings UI. | 4 screen files, mechanical | Kills RC-1's cross-screen fan-out: the `soundOn` control's 169 ms profiler (Grades 66 + Tasks 5 + Today/Focus) collapses to the sheet; clock select loses the Grades/Tasks/FocusScreen chunks (≈60–90 ms of the 152–156 ms) | **low** — pure selector narrowing; test asserts no behavior change |
| **F2** | **Pull `settings.clock` reads out of the screen bodies** so a clock write re-renders only the dials + sheet: Today's inline `<ClockFace id={st.settings.clock}>` (`Today.tsx:283`/`:295`) into a memo'd leaf (Focus already has `Dial` at `Focus.tsx:71-72` as its leaf — keep it, it's the pattern); ensure `FocusScreen` (after F1) no longer reads `clock`. | Today.tsx (+ maybe ClockFace usage) | Remaining clock-write cost ≈ dial rebuilds + sheet ≈ **20–40 ms JS** instead of 152–156 | **medium** — touches the Today header's two clock branches; verify both analog/digital variants render + `onPressIn` on `clock-face` testID still opens the picker |
| **F3** | **Tick hygiene:** (a) `Focus.tsx:207` key the interval on `focused` only (hidden screen never ticks at 1 Hz; visible Focus still 1 Hz); (b) make `useNow` re-align **immediately** when `ms` changes (`src/ui/theme-context.tsx:26-31` — add a `setN(Date.now())` at effect start) so switching back to Focus shows fresh time instead of waiting ≤30 s; (c) drop `s.sheet` from `Focus.tsx:204` if the body only needs it for effects (probe shows sheet-open re-renders the whole Focus screen, E2 picker line). | Focus.tsx, theme-context.tsx | Removes a 1 Hz hidden-screen commit during every focus round (RC-4) and one whole-screen re-render per sheet open/close | **low** — (a)+(b) are two lines; (c) needs a check of what `sheet` drives in Focus |
| — | *deferred to v2 (NOT in v1):* picker thumb lazy/staggered mount (RC-3), virtualized Tasks list, `dayBlock`/rows memoisation (RC-6), Stats' 408-view heatmap, compressing SVG node counts, native-side view/draw work from §4. | | | |

**v1 acceptance:** with F1–F3 in, re-run the probe — target numbers: clock select commit
≤ ~50 ms JS, `setSettings({soundOn})` re-renders `SettingsSheet` only (+ the screens that truly
read `soundOn`), Focus hidden ticks show `FocusScreen×0` over 3 s. Then verify on device (§4)
before touching v2 items.

---

## 4. What could not be determined without a device — and how to measure it

No Android device is attached to this machine (`adb devices` is empty), so everything native-side
is hypothesis, marked H1–H5 with the exact recipe that settles it.

| # | open question | why it can't be answered here | how to measure |
|---|---|---|---|
| **H1** | Does the settings fan-out cost the same on Hermes (152 ms JS commit → ? ms on device)? | Numbers above are V8 + test renderer; Hermes speed and Fabric commit path differ (usually slower JS, different scheduling) | `npx react-native profile-hermes` (or dev-menu *Start CPU sampling*) → perform: open picker, select `sl`, toggle `soundOn`; read the sampling profile: if `GradesScreen`/`TodayScreen`/`setSettings` frames dominate → RC-1 confirmed on device; if `plateSvg`/`Xml.parse` dominate → revise ranking |
| **H2** | How long does the native side take: creating/mounting the **762 picker views** (RC-3) and the two dial rebuilds (RC-2)? | `react-test-renderer` creates no Android views; draw/inflate cost is invisible here | (a) Android Studio **Layout Inspector** connected to the debug build: view count before/after opening picker (expect +762 SVG nodes); (b) Perfetto/atrace with `gfx`, `view` categories (below) → look for `doFrame` spans longer than 16.7 ms around the sheet-open and the face-select; (c) `adb shell dumpsys gfxinfo <pkg> framestats` before/after each action → janky frames and their stage (execute/draw) |
| **H3** | Does the `display:'none' ⇄ 'flex'` tab flip (`Book.tsx:50`) trigger a full Yoga re-layout of the 1 225-view tree on the UI thread? | Yoga never runs in the test renderer; the comment at `Book.tsx:30-35, 91` claims `display:none` drops layout — unverified | Perfetto with `view` + `gfx` atrace: perform 10 tab taps, inspect UI-thread `performTraversals`/layout spans and whether they scale with tree size; compare Today→Grades (cheap body) vs Today→Tasks to separate layout from render cost |
| **H4** | What does the user actually *see*: press-in → first painted frame on device (vs web's 25–31 ms)? | No frame pipeline in jest | `adb shell dumpsys gfxinfo <pkg> framestats` → reset, tap a tab, read the first `FrameCompleted` delta; repeat for picker open + face select; also dev-menu **Perf Monitor** for JS/UI FPS during each gesture |
| **H5** | Steady-state jank during a focus round (RC-4): does a 1 Hz hidden commit actually drop frames while scrolling? | No Choreographer here | Same recipes while: (i) scrolling Tasks with a round running *before* F3, (ii) after F3 — expect the `FocusScreen` commit to vanish from the trace and janky-frame count to fall |

**Trace recipe (H2/H3/H5):**

```bash
adb shell perfetto -o /data/misc/perfetto-traces/trace.pftrace -t 20s \
  sched freq idle am wm gfx view binder_driver hal
adb pull /data/misc/perfetto-traces/trace.pftrace   # open in ui.perfetto.dev
```

Record one trace per action (open picker / select face / tab tap / 10 s idle with round running),
then look for: UI-thread `Choreographer#doFrame` > 16.7 ms, `view`-category layout spans, and
`ReactMarker`/JS-thread gaps between the touch event and the next frame.

**Also device-only:** whether reanimated hand-spin (`SpinView` in `ClockFace.tsx:69-76`) stays on
the UI thread while the JS thread is busy (perceived smoothness of the dial), and real
`persist`/SQLite latency on the settings-write path (`store.ts:159-161`).

---

## 5. Reproducing this diagnosis

```bash
npm run check                     # gate: 46 suites / 764 tests, boundaries clean
npx jest --testMatch '<rootDir>/tools/lag-probe.test.tsx'    # E0–E3, full app tree
npx jest --testMatch '<rootDir>/tools/face-cost.test.ts'     # E4 SVG gen/parse micro-bench
```

Probe design notes (so future edits don't invalidate it): screens are wrapped by *calling* the
original component inside a wrapper (hooks attach to the same fiber) with per-component render
counters; `React.memo` exports get a bail-out wrapper; `<Profiler>` boundaries attribute time per
screen; fake timers use `doNotFake: ['performance']` and advance in 1000 ms slices, one `act` per
slice; module mocks spreading `jest.requireActual` must keep `__esModule: true`.

Latest run (pre-fix baseline): **9/9 tests pass**, full log banked at `/tmp/opencode/lag-probe-final.txt`.
Post-batch (F1–F3 landed, 2026-10-14): still **9/9**, fan-out gone — clock select 152→36 ms (light faces),
`soundOn` 169→21 ms, hidden Focus 1 Hz commits → none. Full table in `docs/BATCH-2026-10-14.md`; after-log at
`/tmp/opencode/lag-probe-after.txt`. The probes are now the regression pins for the fix.
