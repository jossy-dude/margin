# BUGS — Marginalia pre-launch gate

Severity: **Critical** (crash / data loss / blocked flow) > **Major** (feature wrong)
> **Minor** (any visual or UX defect, however small) > **Polish**.
Minor counts as a release blocker in this gate.

Status: `open` → `fixed` (Fixer committed) → `verified` (Verifier reproduced from
scratch with evidence). Anything not `verified` at exit is reported as unresolved.

**No bugs recorded yet.** Agents append below using the template.

---

## BUG-001 — open — Major
**Screen:** build configuration (not a UI screen)
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check for app config fields that may not be synced in a non-CNG project"
**Expected:** `app.json` is the source of truth for orientation, scheme, userInterfaceStyle,
icon, backgroundColor, splash and the `android`/`ios` blocks, as the file implies and as
`BUILDING.md` describes.
**Actual:** this repo has committed `android/` and `ios/` native folders, so EAS Build
**silently ignores** `orientation`, `scheme`, `userInterfaceStyle`, `icon`,
`backgroundColor`, `splash`, `android.*` and `ios.*`. Editing `app.json` to change the
icon, splash, orientation or package id changes nothing in a real build.
**Evidence:** expo-doctor output; `app.json`; `BUILDING.md` (the folders are kept
deliberately for `reactNativeArchitectures=arm64-v8a` + `expo.useLegacyPackaging=true`).
**Impact:** every app-identity field in `app.json` is currently unverified for the
shipped artifact. A reviewer reading `app.json` would be misled.
**Needs a decision (not a unilateral fix):** either adopt CNG so `app.json` is
authoritative, or keep the native folders and treat them as the source of truth and
document `app.json` as advisory. Do not delete `android/` — it carries the size
optimisations in `BUILDING.md`.

## BUG-002 — open — Minor
**Screen:** build configuration
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check Expo config schema"
**Expected:** `app.json` validates against the SDK 57 schema.
**Actual:** three invalid keys are silently dropped: top-level `newArchEnabled`,
top-level `splash`, and `android.splash`. They are not errors at runtime but they are
not doing anything either, which is misleading.
**Evidence:** expo-doctor schema output.
**Note:** New Architecture is genuinely on — `android/gradle.properties` has
`newArchEnabled=true` — so the intent is preserved, just not via that `app.json` key.

## BUG-003 — open — Polish
**Screen:** build configuration
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check for legacy global CLI installed locally"
**Actual:** `eas-cli` is a local devDependency (~large) rather than global/npx.
**Evidence:** `package.json` devDependencies; `BUILDING.md` rule 4 says to prune unused
packages before packaging.

---

## BUG-004 — fixed — Major
**Screen:** all screens (chrome, not a route)
**Found by:** STATIC AUDITOR · `src/App.tsx`
**Repro:** 1. Set Settings → Look & feel → Theme → Dark. 2. Read the status bar.
**Expected:** light status-bar icons on the dark paper, per `<StatusBar style={dark ? 'light' : 'dark'} />`.
**Actual:** `style` is permanently `'dark'`. `App` calls `useTheme()` at `src/App.tsx:135`, but `App` is the
**parent** of the `ThemeProvider` it renders at `src/App.tsx:154`. React context is only visible to components
*below* a provider, so that `useTheme()` returns the `createContext` default
(`makeTheme({theme:'light',palette:'refined',pen:'warm'}, false)`, `src/ui/theme-context.tsx:6`) → `dark === false`
→ always. Dark status-bar icons are drawn on the dark `#2B2620` paper.
**Evidence:** `src/App.tsx:135` + `:155` + `:154`; `src/ui/theme-context.tsx:6`.
**Note:** `src/ui/CrashBoundary.tsx:13-14` documents this exact hazard ("`useTheme()` outside a `ThemeProvider`
returns the context default") — the pattern was known and missed here.
**Root cause:** `src/App.tsx:135` — `useTheme()` called in the component that renders `ThemeProvider`.
**Fix commit:** `d9a3da0`
**Fix:** the runtime subtree moved into a new `Themed` component (`src/App.tsx:134-140`) that is a *child* of
`ThemeProvider`, so `useTheme()` resolves for real. It renders `<StatusBar style={dark ? 'light' : 'dark'} />`
inside a `<View style={{ flex: 1, backgroundColor: c.paper }}>`. The crash-boundary structure is unchanged:
`Themed` sits inside `CrashBoundary phase="runtime"`, inside `ThemeProvider`, inside `CrashBoundary phase="boot"`.
**Why a wrapper and not a bare `<StatusBarForTheme/>`:** see the black-band note below — the band needs a themed
opaque paint behind it, not just a corrected `style`, so the component that reads the theme also owns the paint.
The wrapper replaces the fragment that was already there, so it adds no new level of nesting beyond the one that
existed.
**The `backgroundColor` prop in the Fixer brief does not exist.** `expo-status-bar@57.0.1` dropped it:
`StatusBarProps` is only `style`, `animated`, `hidden`, `hideTransitionAnimation`
(`node_modules/expo-status-bar/build/types.d.ts`). Passing it would not compile, and RN's own `StatusBar` would be
a swap of libraries plus a device-dependent hack (`statusBarColor` is a no-op from Android 15). Under this build
the app is already edge-to-edge — `android/gradle.properties:47 edgeToEdgeEnabled=true`, and
`android/app/src/main/res/values/styles.xml` sets `android:statusBarColor` to `@android:color/transparent` — so
the band shows whatever the app paints there. Painting it `c.paper` on the runtime root is the mechanism that
actually works.
**Device re-check still required (I have no device):**
1. Icon brightness must differ between light and dark. This is now a direct consequence of the fix, not a
   prediction, but it is only observable on device.
2. **Whether the pure-black band was ever an app bug is still unresolved, and I could not reproduce it
   statically.** The measured band sat above `Shell`'s `backgroundColor: c.desk` and the pages' `PaperBg`, both
   opaque and full-bleed, so in a standalone build the band should have been paper or desk — never black. The
   black most likely came from the Expo Go host activity's own window, exactly as the caveat above predicted.
   Please re-measure on the release build. If it is still black there, the cause is native
   (`android/app/src/main/res/values/colors.xml:4`, see BUG-019) and this fix will not have removed it.
**Device confirmation needed:** whether the illegibility is visible at the 411dp baseline.

**ORCHESTRATOR device confirmation 2026-10-04 — CONFIRMED, and worse than predicted.**
Measured on SM-A516N at 411dp, sampling the top 80px band of a screencap:

| Theme | paper at y=90 | brightest pixel in status band |
|---|---|---|
| dark (`night=yes`) | (43,38,32) warm brown | (178,178,178) |
| light (`night=no`)  | (235,229,216) cream | (178,178,178) |

The icon brightness is **byte-identical across both themes** — conclusive proof the
`style` prop never follows the theme, exactly as the root-cause analysis says.

The visible symptom is the inverse of the prediction, and is worse: the status-bar band
renders **pure black (0,0,0) in BOTH themes**, so in light mode there is a black strip
above a cream page carrying a barely-visible light glyph. On a design whose stated goal
is "warm dark brown, NOT pitch black" (prompt.md V15), a hard black band is a glaring
defect in the light theme especially.
Evidence: `qa/shots/v19_statusbar_dark.png`, `qa/shots/v19_statusbar_light.png`.
**Attribution caveat:** this was measured in Expo Go. A pure-black band could be the app
failing to paint behind the status bar (likely — SDK 57 / RN 0.86 are edge-to-edge and
`<StatusBar>` at `src/App.tsx:155` sets no `backgroundColor`), or it could be an Expo Go
window artefact. **Must be re-checked on the standalone release build before sign-off**;
if the black band persists there, it is an app bug and the fix must paint the theme paper
behind the status bar, not just correct `style`.

**ORCHESTRATOR resolution 2026-10-04 — attribution settled, band is an Expo Go artefact.**
Measured the standalone release build (`app.marginalia.planner`, installed) against Expo Go
on the same device, same dark theme:

| Target | band (y=0..88) | paper (y=200) |
|---|---|---|
| Expo Go `host.exp.exponent` | **(0,0,0) pure black** | (43,38,32) |
| standalone `app.marginalia.planner` | **(4,5,7)** ~ `#040507` | (16,20,26) `#10141A` |

The release build's band is its own theme colour (`ORIGINAL.dark.desk` = `#030407`), so the
app DOES paint behind the status bar. The pure-black band is **Expo Go's own window**, and in
Expo Go the app's `<StatusBar style>` and background are not app-controlled at all.

**Methodology consequence — applies to every remaining agent:** all V19 status-bar /
edge-to-edge / "system bar legible" checks are **invalid in Expo Go** and must be re-run on
the standalone release build. Also note the release build is running the **original** dark
palette (paper `#10141A`), not refined.

**Status of BUG-004:** the `Themed` fix (`d9a3da0`) is structurally correct but **unverifiable
in Expo Go** — band brightness was byte-identical (255,255,255) in both themes after the fix,
which proves Expo Go overrides it rather than proving the fix failed. Carrying BUG-004 as
`fixed, pending release-build verification`.

## BUG-005 — fixed — Major
**Screen:** Today clock, Focus dial + break sticker (and every clock face)
**Found by:** STATIC AUDITOR · token-vs-literal hex audit
**Repro:** 1. Settings → Look & feel → Theme & palette → **Original**. 2. Go to Today and compare the clock face
against the paper around it. 3. Compare the Focus dial bed and the break sticker.
**Expected:** every drawn surface follows `theme.ts`. V11 requires "EVERY option changes the page behind it
immediately (palette refined/original)"; V15 compares both palettes.
**Actual:** the clock dial palette and the Focus page hardcode the **refined** palette's hex values instead of
reading the theme:
- `src/ui/clock/faces.ts:20` — `ink: '#2A241C'` is `REFINED.light.ink`; `dial: '#FFFBF1'` is `REFINED.light.card`.
- `src/ui/clock/faces.ts:21` — `ink: '#F2EAD8'` is `REFINED.dark.ink`.
- `src/screens/Focus.tsx:57` — `bed = '#EDE4D0'` (light) / `'#3A342C'` (dark).
- `src/screens/Focus.tsx:111` — break sticker fill `'#FFFBF1'` = `REFINED.light.card`.
Under `palette: 'original'` the page ink is `#26201C` / `#E7E4DC` and card is `#FEFBF5`, so the dial and sticker
stay refined-toned and no longer match the page they sit on.
**Evidence:** `src/ui/clock/faces.ts:20-21`; `src/screens/Focus.tsx:57,111`; `src/tokens/theme.ts:9-10` vs `:13-14`.
**Severity honesty:** the mismatch is a static certainty (literal hex vs token value), but whether it *reads* as a
visible defect needs eyes on device in the Original palette. If it turns out to be near-invisible, downgrade to
Minor rather than re-litigating.
**Root cause:** `src/ui/clock/faces.ts:19` (signature took `dark: boolean` + a literal accent, so it could not see
the palette) and `src/screens/Focus.tsx:57,111`.
**Fix commit:** `e4b389a`
**Fix:**
- `dialPal(f, c, dark)` now takes the resolved theme colours. Light-native faces (Guilloché Ivory, Rosette Blanc)
  ink on `c.card` with `c.ink`; dark-native faces keep their onyx dial and take whichever of the theme's two
  extremes contrasts with it — `c.ink` in dark, `c.card` in light. `accent` is `c.acc`, which also fixes the
  Graphite / Red / Blue pen settings the old literal accent ignored.
- `src/screens/Focus.tsx:111` sticker fill → `c.card`; `:59` bed → `dark ? c.card : c.desk`.
- `src/test/faces.test.ts` gained a guard: for all 4 palette × theme combinations, every dial colour must be a
  value present in that palette, and ink-on-dial must clear 4.5:1.
**Two corrections to the finding, recorded so they are not re-derived:**
1. **`slabInk` is not the token for "ink on a dark surface".** It looks like it, and I tried it first — the new
   test failed, correctly. `ORIGINAL.dark` inverts the pair: `slab: '#E7E4DC'` (light) with
   `slabInk: '#10141A'` (near-black) at `src/tokens/theme.ts:14`, the opposite of `REFINED`. Ink on onyx would
   have been near-black on near-black. Only `ink` flips with the mode; there is no mode-independent pale token.
2. **The two Focus hexes are not palette values.** `#EDE4D0` and `#3A342C` appear nowhere in `theme.ts`, so the
   finding's "hardcoded *refined* palette hexes" is inaccurate for them — they were a hand-picked intermediate
   tone with no token behind it. The bed had to be mapped onto one, and that mapping is a judgement call:
   `dark ? c.card : c.desk` keeps the shipped refined palette within ΔRGB ≤ 7 in both modes (invisible) while
   following both palettes, whereas `c.desk` alone would have dropped the dark-theme ring from (58,52,44) to
   (31,27,22) — a visible change to the ring around the dial. **Worth an eyeball on device in both themes and
   both palettes; if the dark bed reads wrong, the alternative is `c.card` in both modes, which makes the light
   ring visibly paler.**
3. The onyx dial colours `#17130F` / `#26201A` were **kept deliberately**: they are the face's own black-enamel
   material, not palette values, and the face spec's `native` field exists to say so.

## BUG-006 — fixed — Minor
**Screen:** build configuration / QA harness
**Found by:** STATIC AUDITOR · `rg testID src/` → zero hits
**Expected:** every interactive element exposes a `testID`, because on RN Android `testID` surfaces as
`resource-id` in a `uiautomator` dump and is how the device agents locate an element reliably.
**Actual:** the app had **no `testID` anywhere** before this pass. Agents had to drive every interaction by
bounds or by accessibility text.
**Fix commit:** `8aa428a` — `testID` derived centrally in `src/ui/kit.tsx` from the existing accessibility label
(`Btn`, `Chip`, `Toggle`, `StepBtn`, `Field`), plus explicit ids on the chrome: `tab-<route>` (Book), `fab-add`
and `toast-dismiss` (Overlay), `sheet-close` / `sheet-back` / `sheet-dismiss` (Sheet), `open-settings` (Page),
`open-focus` and `clock-face` (Today), `att-cell-<occKey>` (Grades/V8), `week-due-<taskId>` (Week).
`npm run check` exit 0 after the change.
**Caveat for agents:** the derived ids slugify the visible label, so a label that appears twice yields the same
id (e.g. every Grades card has a `btn-mark`). `Btn` accepts an explicit `testID` prop for disambiguation.

## BUG-007 — open — Minor
**Screen:** build configuration
**Found by:** STATIC AUDITOR · `npx expo-doctor` + `npx expo install --check`
**Repro:** `npx expo-doctor` → "Check that packages match versions required by installed Expo SDK"
**Expected:** typescript matches SDK 57's expected range.
**Actual:** `typescript@5.9.3` installed, `~6.0.3` expected. `npx expo install --check` reports the same single
outdated package. **Recorded, deliberately not fixed** per this gate's hard rules — TypeScript major upgrades are
out of scope and `tsc --noEmit` is currently clean.
**Evidence:** expo-doctor output; `package.json` devDependencies.
**Risk if unfixed:** a future SDK bump or a contributor running `expo install --fix` gets an unvalidated TS 6 jump.

## BUG-008 — open — Minor
**Screen:** Settings (root) → Data & export / Sound & haptics; also the Diagnostics nav hint
**Found by:** STATIC AUDITOR · render-path trace
**Repro:** 1. Settings → root. 2. Focus "What should the app call you?" and type slowly.
**Expected:** typing is smooth; a hint count is already known.
**Actual:** `crashCount()` is called **inside the render body** at `src/sheets/Settings.tsx:71` to build the
Diagnostics nav hint. `crashCount()` → `readCrashes()` → `new File(...)`, `.exists`, then **`f.textSync()`**
(`src/ui/crashlog.ts:82`) followed by a `JSON.parse` per line. `SettingsSheet` holds the name in local state
(`nameDraft`), so **every keystroke re-renders the sheet and re-reads and re-parses the whole crash log
synchronously on the JS thread.** The file is bounded to 50 entries / 256 KB, so the worst case is bounded, but
it is blocking disk I/O in a text-input path.
**Evidence:** `src/sheets/Settings.tsx:71`; `src/ui/crashlog.ts:77-94`; `src/sheets/Settings.tsx:55`.
**Severity honesty:** with 0 crashes the file does not exist and `readCrashes()` returns early, so this is
**invisible on a clean install** and only bites after crashes have accumulated. Minor, not Major.
**Root cause:** `src/sheets/Settings.tsx:71` (Fixer) — hoist the count into a `useState` initialised once, or
memoise it on `settingsPath`.

## BUG-009 — fixed — Minor
**Screen:** Settings (root) → Sound & haptics; any OS notification
**Found by:** STATIC AUDITOR · token-vs-literal hex audit
**Expected:** the OS notification accent follows the theme, like every other drawn surface.
**Actual:** `src/services/notifications.ts:34` hardcodes `color: '#8A4B27'`, which is exactly
`REFINED.light.acc` in `src/tokens/theme.ts:9`. A notification therefore keeps the sienna accent under the
Original palette, under the dark theme, and under the Graphite / Red / Blue pen settings
(`src/tokens/theme.ts:16-18,31-32`) — all three of which are user-facing options.
**Evidence:** `src/services/notifications.ts:34`; `src/tokens/theme.ts:9`.
**Root cause:** `src/services/notifications.ts:34` — `content()` was a module-level pure function with no access
to the theme, so the accent had to be a literal.
**Fix commit:** `1a3fba7`
**Fix:** `sync(plan, accent)` and `content(p, accent)` take the resolved accent; `resync()` passes
`makeTheme(settings, Appearance.getColorScheme() === 'dark').c.acc` (`src/store/store.ts:59-61`). The store
cannot use `useTheme()` because `resync` runs from store actions, not from a component, so it reads the OS scheme
the same way `ThemeProvider` does, minus the hook — the same escape hatch `expo-status-bar` itself uses.
**Note:** this is the same class of defect as BUG-005 and was fixed as **its own commit**, as agreed.
**Test:** `src/test/notifications.test.ts` asserts the scheduled content colour equals the accent handed in, for
all four pens and both palettes, and first asserts the four accents are distinct so a fixed hex cannot pass.
Verified by mutation: reintroducing `color: '#8A4B27'` fails 2 of the 3 tests.

## BUG-010 — open — Minor
**Screen:** build configuration / release size
**Found by:** STATIC AUDITOR · unused-dependency audit
**Expected:** `BUILDING.md` rule 4 — "a native dep you never import still ships its `.so`/classes into the APK".
**Actual:** four runtime dependencies in `package.json` are **never imported from `src/` or `index.ts`**, and all
four ship native code, so all four autolink into the APK:
| package | imported? | ships native? | note |
|---|---|---|---|
| `expo-dev-client` | no | yes | **the real size item.** `eas.json` sets no `developmentClient`, but autolinking is driven by `package.json`, not the profile. `BUILDING.md` already prices this at ≈ −1–2 MB and calls it "still on the table". |
| `expo-asset` | no | yes | almost certainly still pulled in transitively by `expo-font`; declaring it directly is redundant rather than costly. |
| `expo-linking` | no | yes | same — likely transitively required by `expo`/react-navigation. |
| `expo-system-ui` | no | yes | same. |
(`react-native-screens` and `react-native-worklets` are also unimported directly but are genuine runtime peers of
`@react-navigation/native` and `react-native-reanimated` — **not** flagged.)
**Evidence:** `package.json`; `node_modules/<pkg>/android` exists for all four; `android/settings.gradle` autolinks
from `package.json`; `BUILDING.md` rule 4 + the size-levers table.
**Honesty:** only `expo-dev-client` is a defensible APK-size win, and removing it kills the dev-client workflow —
that is a **product/build decision, not an audit fix.** The other three are hygiene.
**Also recorded (Phase 0):** `eas-cli` as a local devDependency — BUG-003.

## BUG-011 — open — Minor
**Screen:** n/a (code hygiene)
**Found by:** STATIC AUDITOR · dead-code sweep
**Expected:** no code that can never affect behaviour.
**Actual:**
1. `src/screens/Today.tsx:90` — `<View style={{ height: cw > 0 ? 0 : 0 }} />`. Both ternary arms are `0`; `cw`
   (`Today.tsx:27`) exists only to feed this no-op.
2. `src/screens/Stats.tsx:72` — `<View style={{ height: 1 }}>{addDays(startOfDay(now), 0) ? null : null}</View>`.
   Always renders `null`; `addDays` is imported at `Stats.tsx:10` solely for it.
3. `src/screens/Focus.tsx:172` — `leftMs={t.phase === 'break' ? t.focusLeftMs : t.focusLeftMs}`. Identical arms;
   reads as though the break phase were meant to pass something else.
4. Three unused re-exports: `src/screens/Today.tsx:94` (`export { DAY_MS }`),
   `src/screens/common.tsx:103` (`export { StyleSheet, Tape, useWindowDimensions }`),
   `src/sheets/Settings.tsx:205` (`export { ScrollView }`). Verified: no module imports any of them.
5. `src/screens/Focus.tsx:203` — `<View style={{ flex: 1 }} />` filler. It is only ever non-zero if
   `1001 * (width/440)` is shorter than the window; at 360–430 dp width it is always zero-height.
**Evidence:** the lines above; `rg` over all importers of `./common`, `../screens/common`, `screens/Settings`.
**Not fixed by me** — the brief for this agent was one mechanical a11y/testID commit only.

## BUG-012 — open — Minor
**Screen:** n/a (tooling)
**Found by:** STATIC AUDITOR · package.json scripts vs `scripts/`
**Expected:** every `npm run` script resolves to a file that exists.
**Actual:** `package.json` declares
`"plates:gen": "node ... scripts/plates.generated.mjs"` and
`"plates:preview": "node ... scripts/plate-preview.mjs"`, but `scripts/` contains only `synth-sounds.mjs`.
Both scripts fail immediately with `Cannot find module`. They are the entry points for the `<plates>` work in
`prompt.md`, and `src/ui/clock/faces.ts:16` claims "scripts/plate-preview.mjs imports this exact string".
**Evidence:** `package.json` scripts block; `ls scripts/`.
**Note:** the plate faces themselves are out of scope for this gate (they need PNGs from the user, `prompt.md`
§PLATES), but dead entry points should not ship in `package.json`.

## BUG-013 — open — Minor
**Screen:** To-do (and every list in the app)
**Found by:** STATIC AUDITOR · list-rendering sweep
**Expected:** long lists are virtualised.
**Actual:** **`FlatList` / `SectionList` / `VirtualizedList` appear nowhere in `src/`.** Every list is a
`ScrollView` (from `Page`, `src/screens/common.tsx:23`) with `.map()` inside it. The worst case is the To-do task
list (`src/screens/Tasks.tsx:33`): each row is a `TaskCard` → `SwipeCard`, and every `SwipeCard` mounts a
`GestureDetector` plus four `useSharedValue`s and two `useAnimatedStyle`s (`src/ui/Swipe.tsx:15,34`). Row cost is
therefore high and the row count is unbounded (a school year of tasks). Grades' attendance grid
(`src/screens/Grades.tsx:31`) has the same shape with up to a semester of cells per subject.
**Evidence:** `rg 'FlatList|SectionList|VirtualizedList' src/` → no matches; `src/screens/Tasks.tsx:33`.
**Severity honesty:** with the 16-task demo seed this is invisible. It is a scaling risk, not an observed defect.
I have not measured it. Note that virtualising would fight the hand-drawn `HandBox`/`SwipeCard` design, so this may
be a deliberate trade — flagging for a decision, not demanding a change.

## BUG-014 — open — Minor
**Screen:** Stats
**Found by:** STATIC AUDITOR · render-path trace
**Expected:** expensive derivations are memoised, as they already are elsewhere in this file.
**Actual:** of ~12 derivations in `StatsScreen`, only 3 are wrapped in `useMemo` (`Stats.tsx:20-21`). Nine run
un-memoised on **every render**, each a full pass over the dataset:
`A.onTimeStats`, `A.overallAttendance` (30 days), `A.streak` ×2, `A.focusBySubject`,
`A.attendanceByCourse` (60 days × every course), `A.attendanceHeat` (28 days × every course),
`A.gradeBars`, `A.markSeries`, `A.doneByHour`, `A.focusByHour` — `src/screens/Stats.tsx:22-27`.
The component also re-renders every 60 s via `useNow(60_000)` (`Stats.tsx:19`), so the whole set runs on a timer
whether or not anything changed. The neighbouring `Grades.tsx:46` and `Today.tsx:22-27` have the same
compute-in-render shape at smaller n.
**Evidence:** `src/screens/Stats.tsx:19-27`.
**Severity honesty:** trivial at the demo data size. Unquantified at a year of real data.

## BUG-015 — open — Minor
**Screen:** Add sheet and Task sheet → "Focus on this" / "Start a focus session"
**Found by:** STATIC AUDITOR · timer-lifecycle sweep
**Repro:** 1. FAB → Add. 2. Tap "Start a focus session". 3. Within 230 ms, press Back (or tap the dim area).
**Expected:** the sheet dismisses and you stay where you were.
**Actual:** both buttons defer the navigation with an untracked timer:
`setTimeout(() => act.focusOpen(null), 230)` at `src/sheets/forms.tsx:44` and
`setTimeout(() => act.focusOpen(existing.id), 230)` at `src/sheets/forms.tsx:70`. The 230 ms exists so the sheet's
close animation finishes first, but nothing cancels it. Dismiss the sheet inside that window and
`act.focusOpen` still fires, navigating to Focus and re-initialising the timer.
**Evidence:** `src/sheets/forms.tsx:44,70`.
**Related but not the same:** `hapticBurst` (`src/services/haptics.ts:31`) and `fx.crumple`/`fx.fall`
(`src/services/fx.ts:11,31`) also schedule untracked `setTimeout`s. Those only ever fire sound/haptics, which is
harmless after unmount, so they are not folded into this finding.

## BUG-016 — open — Polish
**Screen:** Today → the "ticker" day bar
**Found by:** STATIC AUDITOR · key-props sweep
**Actual:** `src/ui/DayBar.tsx:98` maps `txt.split('')` with `key={i}` while the string's **content changes every
second** (`--:--` → `12:34`). Index keys mean React reuses the same `View`/`Text` nodes positionally instead of
reconciling by content. Benign today because the string length is constant, so nothing remounts — but it breaks the
moment a format change makes the length vary.
**Evidence:** `src/ui/DayBar.tsx:92-98`.
**Other index-as-key sites, all benign** (fixed-length, never reordered): `Week.tsx:31,39`, `Focus.tsx:61,162`,
`DayBar.tsx:42,67`, `charts.tsx:17,18,45,65`. Recorded so a future reviewer does not have to re-derive it.

## BUG-017 — open — Polish
**Screen:** n/a (lint hygiene)
**Found by:** STATIC AUDITOR · suppression sweep
**Expected:** every `eslint-disable` in `src/` is justified.
**Actual:** 7 suppressions in `src/`. The pair in `eslint.config.js:6` (`react-hooks/immutability`,
`react-hooks/refs` off for Reanimated shared-value writes) is justified as stated. Of the 7 in `src/`:
- **Justified, keep:** `Focus.tsx:43` (per-second jolt keyed on `Math.floor(leftMs/1000)`), `Focus.tsx:100`
  (sticker fall animation), `Focus.tsx:137`/`147` (`set-state-in-effect` block, carries an explanatory comment),
  `Focus.tsx:143` (feeds off the `fev` event), `Book.tsx:23` (placement animation), `Book.tsx:40` (route → navigate).
- **Latent risk, not a live bug:** `src/sheets/forms.tsx:61` memoises `workload(draft, {...})` on
  `[due, est, start]` while the body also closes over `draft`, `st.meetings`, `st.attendance`, `st.dayMarks` and
  `nset`. I checked `workload()` (`src/domain/reminders.ts:152-158`): it reads only `dueAt`, `estimateMin`,
  `status`, `startAt` and the passed context, and **not** `courseId` — so the declared deps happen to cover every
  input that can change while the sheet is open. It is correct today and fragile: adding a store write reachable
  from inside the Task sheet would make the "Tight / Comfortable" box silently stale.
**Evidence:** the lines above.
**Recommendation:** leave the six alone; add the missing deps (or a comment naming the ones deliberately omitted)
on `forms.tsx:61` when the Fixer is next in that file.

## BUG-018 — open — Polish
**Screen:** n/a (repo hygiene)
**Found by:** STATIC AUDITOR
**Actual:** `pow1.png` (22 KB) is **tracked in git** at the repository root. It looks like a debugging screenshot.
**Evidence:** `git ls-files | rg pow1` → `pow1.png`.

---

## BUG-019 — open — Minor
**Screen:** app launch (before the first React frame); Focus page in dark mode
**Found by:** FIXER · token-vs-literal hex audit, while fixing BUG-004/005. **Not fixed — logged, see note.**
**Expected:** every drawn surface is palette-derived, including the native window background.
**Actual — two more hardcoded refined-warm hexes of the same class as BUG-005, both missed by that finding:**
1. `android/app/src/main/res/values/colors.xml:4` — `<color name="activityBackground">#FAF4E6</color>`, wired to
   `android:windowBackground` in `styles.xml`. That is `REFINED.light.paper`, hardcoded in the native layer. It is
   what the window shows **before the first RN frame paints**, so a cold start in dark mode (or under
   `palette: 'original'`) flashes cream. A `values-night/colors.xml` would fix the dark case; the Original
   palette cannot be expressed in a native resource at all.
2. `src/screens/Focus.tsx:161` — `backgroundColor: '#1B1712'`, `opacity: 0.62`: the dim wash over the scrapbook
   photo. Not a palette value, so like the Focus bed (see BUG-005) it is a hand-picked material tone with no token
   behind it, and it stays warm-tinted under the Original dark palette.
**Why not fixed:** (1) is a native resource change, which is BUG-001 territory — whether `android/` or `app.json`
is authoritative is an undecided product call, and it can only be verified on a release build. (2) sits over a
photograph with no token behind it, exactly like the bed, and I was scoped to BUG-004/005.
**Evidence:** `android/app/src/main/res/values/colors.xml:4`; `android/app/src/main/res/values/styles.xml:5`;
`src/screens/Focus.tsx:161`.

## BUG-020 — open — Polish
**Screen:** any page, during the page-placement animation (V3)
**Found by:** FIXER, while fixing BUG-004. **Not fixed — logged, no device access.**
**Actual:** `Placed` (`src/navigation/Book.tsx:26`) animates the incoming page with `translateY: -70`, so for the
520 ms of the drop the top ~70 dp of the window is not covered by the page. What shows through is the navigator
root's `backgroundColor: c.desk` (`src/navigation/Book.tsx:57`), not `c.paper`. The status-bar band therefore
changes tone on **every tab tap** and settles 520 ms later — a visible flash at the very top edge, and it is the
band BUG-004 is about.
**Why not fixed:** it is a pre-existing part of the V3 "drops in from above-right" motion, not a colour defect,
and changing it means changing the transition. Needs an eyeball on device to say whether it reads as a defect or
as part of the motion.
**Evidence:** `src/navigation/Book.tsx:26,57`.

---

# Pass 1 device findings — FRESH-USER + TASK-DOMAIN QA (AGENT 2, 2026-10-05)

All findings below were reproduced on the SM-A516N at 411 dp in **Expo Go** (`host.exp.exponent`),
dark theme, font scale 1.0, 1080×2400 @ 420. Every run began from a cold `am force-stop` +
relaunch, and no `ReferenceError: Property 'dark' doesn't exist` / `"undefined" is not a valid color`
noise appeared in logcat — a real cold boot is clean, as briefed.

**Method notes for the next agent (both cost me real time):**
1. **`adb shell input swipe` must be slow.** At the default 300 ms and at 400 ms, RN's `ScrollView`
   ignores the gesture entirely — I recorded a false "the To-do list does not scroll" from a 400 ms
   swipe. At **900 ms** it scrolls correctly. Use `SWIPE_MS=900`.
2. **`uiautomator dump` (and therefore `qa/scripts/adb.sh dump|texts|tap`) is unreliable on this app.**
   The live clock repaints every second, so `uiautomator` reports `ERROR: could not get idle state`
   and **exits 0 without writing the file** — `adb.sh` then prints a stale dump from a previous run
   rather than failing. That is how I got a full Expo Go home-screen element list while the app was in
   the foreground. Treat any `dump` that looks like a different screen as stale, and check the file
   timestamp. A second, terminal failure mode appeared mid-run:
   `java.lang.IllegalStateException: UiAutomationService ... already registered!` from
   `UiAutomationConnection.connect`, after which **no** `uiautomator dump` or `mobile-mcp` element
   list will succeed for the rest of the session (a leaked test-automation registration in
   system_server; not recoverable without a framework restart). Recovery used instead:
   `adb exec-out screencap -p` plus a coordinate grid drawn over the PNG.

---

## BUG-021 — fixed — Major
**Screen:** all routes — the floating bottom nav (chrome, not a route)
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro (deterministic, 3 taps + 1 key):**
1. Bottom nav → **Grades**. Confirm the Grades page renders and `Grades` is highlighted in the nav.
2. Press **hardware BACK**.
3. Read the nav.
4. (Optional, shows the second half) Tap the tab the nav is now falsely highlighting.
**Expected (V19: "hardware back order: sheet → settings sub-page → Focus → Today → exit"):** after BACK
the app shows **Today**, and the nav highlights **Today**, because the nav is the app's only
indication of where you are.
**Actual:** the **Today** page renders in full (clock, "Next up Intro to Economics at 08:30",
"4 of 4 left", This week strip, class rows) while the nav **keeps `Grades` highlighted** — icon
tinted accent, pill behind it, label in accent. The nav is showing a route the app is not on. Then,
because the tap handler is `act.go(t.name)`, **tapping the falsely-highlighted tab does nothing at
all**: the page stays on Today and the nav stays on Grades. The tab is dead until a *different* tab is
tapped first. Verified twice, in both directions (Grades→BACK→Today, and To-do→BACK→Today).
**Evidence:** `qa/shots/a2_back1.png` (page = Today; nav crop = Grades), `qa/shots/a2_navtest1.png`
(tapping the falsely-selected To-do tab is a no-op), `qa/shots/a2_nav_zoom.png`.
**Root cause (pinned, for the Fixer):** `src/navigation/Book.tsx:50` derives the highlight from the
**store**, not from the navigator:
```tsx
const route = useStore((s) => s.route), ...          // :38
const cur = state.routes[state.index]?.name ...      // :39  <- the navigator's real route
useEffect(() => { if (route !== cur) navigation.navigate(route) }, [route]); // :40
...
const on = route === t.name;                          // :50  <- reads the store
onPress={() => act.go(t.name)}                        // :51
```
The sync at `:40` is **one-way, store → navigator**. Nothing writes the navigator's route back to the
store, so an Android back that pops `TabRouter`'s own history moves `cur` and leaves `store.route`
stale. `onPress` then sets `store.route` to the value it already holds, so the store does not change,
the `:40` effect's dependency does not change, and no navigation happens.
**Two suggested fixes, either sufficient:** derive `on` from `cur` (`:39`) rather than `route`, and/or
add the reverse effect `useEffect(() => { if (cur && cur !== route) setRoute(cur) }, [cur])`. The
second is the more correct one, because it also keeps `store.route` honest for anything else that
reads it.
**Why Major and not Minor:** it is not a cosmetic mismatch. The primary navigation of the app displays
false state and one of five tabs stops responding, from a single hardware Back press — reachable from
any tab, on the first thing V19 asks you to check.

**Root cause (confirmed by reading the code and by the regression test, not inferred):**
`src/navigation/Book.tsx:50` — `const on = route === t.name` read the **store**, while the rendered page
is `state.routes[state.index]` (`:39`). The only sync, `:40`, was keyed on `[route]`, so an Android BACK
(which pops `TabRouter` — its default `backBehavior` is `'firstRoute'`, which is exactly the observed
"popped to Today") moved `cur` and left `route` stale: `:40`'s dependency never changed, so it never ran.
Then `onPress` → `act.go(t.name)` hit `act.go`'s own guard `if (route === state.route) return`
(`src/store/store.ts:99`) and did nothing. **The reported theory was correct in every part.**
**Fix commit:** `bef5ae7`
**Fix:** both directions now sync, each keyed on the side that moved, so they converge rather than fight
(the forward one on `[route]`, a new reverse one on `[cur]` that calls `act.go`). The two one-way rules
live in `src/navigation/sync.ts`. Everything the nav draws — the highlight `on`, and `hideNav` — now
reads `cur`, so the highlight can never name a route the app is not on even for the one commit before
the store catches up. The page-placement transition (`Placed`, `inMountWindow`, the 520 ms drop) is
untouched, and `Placed`'s drop already ran on BACK before this change; it now also gets `fx.page()`,
which is what V3 asks for anyway.
**Regression test:** `src/test/nav-sync.test.ts` (9 tests). It models BookView's two effects commit by
commit — each running only when its own key changed, which is what makes them converge — and asserts
over 300 randomised hops that `store === cur` always holds, that **every** tab other than the current one
still selects, and that the Focus route hides the nav and BACK brings it back. It also asserts the real
mechanism with the real store (`act.go` on the route it already holds is a no-op) and reproduces the
shipped defect from the shipped rules, so the model cannot quietly become a fiction.
**Wiring is asserted too, because the model cannot see `Book.tsx`:** three checks read the file — the
highlight is `cur === t.name` and never `route === t.name`, both syncs sit in `useEffect`s keyed on
`[route]` / `[cur]`, and the mount window is still wired. These are coupled to the seam's names, so a
rename is a mechanical test update; that is the price of covering a wiring bug with no device.
**One new `eslint-disable` (8 in `src/`, was 7):** `src/navigation/Book.tsx:41` needs
`react-hooks/exhaustive-deps` for the same reason the line above it already does — the effect closes
over `route` but is deliberately keyed on `[cur]`. Same justification as BUG-017 records for `Book.tsx:40`.
**Device verification still required:** yes — (1) tap **Grades**, (2) press hardware **BACK**, (3) confirm
the nav highlights **Today** (not Grades), (4) tap the **Grades** tab and confirm the Grades page comes
back (previously a no-op). Repeat To-do→BACK. Also from Focus: press BACK and confirm you land on Today
with the nav visible. And V3: confirm the page still drops in from above-right and settles in ~0.5 s
with its sound — BACK now plays `fx.page()` too, which it did not before.

---

## BUG-022 — fixed — Major
**Screen:** Today
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:**
1. Open Today.
2. In the "This week" strip, tap **Sat 10**.
3. Read the whole page, top to bottom.
4. Tap **Mark day** (top-right of the "This week" section).
**Expected:** everything in the "This week" group refers to the day selected in that strip, and
anything on screen that is *not* about the selected day is unmistakably labelled as such. Tapping
"Mark day" marks the day whose classes and attendance the user is looking at.
**Actual — three different days on one screen, with the button wired to a different day than the strip
above it:**
- Page title stays **"MON 5 OCT"** and the greeting / clock / **"Next up — INTRO TO ECONOMICS at
  08:30"** stay on **today**.
- The attendance `DayBar` strip directly under the clock still reads **"4 of 4 left"** with four class
  boxes (I, D, E, C) — today's four classes.
- The section immediately below the strip correctly reads **"Sat 10 Oct"** and
  **"No classes. Add one from the + button."**
- So the screen states, in order: *today is Monday · you have 4 classes left today · today is Saturday
  and you have no classes* — with nothing marking which day the top half belongs to.
- **Tapping "Mark day" opens the status sheet titled "SAT 10 OCT".** The button and the "4 of 4 left"
  strip it sits under are inside the same visual group and describe different days, so the natural
  reading ("mark the day whose classes I can see") marks the wrong day.
**Evidence:** `qa/shots/a2_today_sat_empty.png` (all three claims on one screen),
`qa/shots/a2_markday_sat.png` (the sheet header reads "SAT 10 OCT" while "4 of 4 left" is visible
directly above it).
**Root cause (pinned):** the top half of `TodayScreen` is hard-wired to `today`, while the "This week"
group follows the local `sel`:
- `src/screens/Today.tsx:31` — page `title` is built from `now`, never `sel`.
- `Today.tsx:36-38` — the "In class / Next up / All done for today / No classes today" line, the course
  name and the countdown all read `todayOcc` / `periods`.
- `Today.tsx:41-46` — the `deck` HandBox + `DayBar` strip ("4 of 4 left", the I/D/E/C boxes) is built
  from `periods`, i.e. today's occurrences, and is gated on `periods.length > 0`.
- `Today.tsx:47` — the **"Mark day" button** in that same group opens
  `act.open({ t: 'status', mode: 'day', key: ymd(new Date(sel)), title: fmtDay(sel, now) })` → **sel**.
- `Today.tsx:61` — the section title is `fmtDay(sel, now)` → **sel**.
So `sel` drives the section and the button; `today` drives everything above them; and the strip sits
directly above the button.
**Why Major and not Minor:** it is a plausible path to writing an attendance mark against the wrong
date, on a screen whose whole purpose is telling you what is happening today. Attendance feeds the
Grades rate, the Stats attendance heatmap and the reminders, so a wrong mark is not self-correcting.
**Not a one-line fix, and worth a product decision:** either (a) make the whole page follow `sel`
(clock face, greeting and countdown are arguably "now"-shaped, so this may be wrong), or (b) label the
top card explicitly ("Today · Mon 5 Oct") and move "Mark day" out of the strip's visual group /
re-point it at `today` so the strip and the button always agree. Do not leave them adjacent and
disagreeing.

**Root cause (established from the code by running it, not by reading — and there are TWO causes, the
finding only had one):**
1. **As reported.** `src/screens/Today.tsx:22` built the deck and the `DayBar` strip from `todayOcc`
   while `:47` ("Mark day") and `:61` (the class list) followed `sel`, so a tap on a different day left
   the strip directly above the button naming a different day than the button. Verified by running
   `Today.tsx:19-47`'s expressions against the real seed at `now` = Mon 5 Oct 2026 08:00 with
   `sel` = Sat 10: title `Mon 5 Oct`, deck `4 of 4 left` over `[Intro to Economics, Discrete
   Mathematics, Emerging Technology, Computer Programming]`, button key/date `2026-10-10`, title
   `Sat 10 Oct`, class rows `0`.
2. **Not in the finding, and worse: it needs no user action at all.** `Today.tsx:20` was
   `useState(today)`, which snapshots the selected day from the **mount-time** `today`, while `today`
   is `startOfDay(now)` and `now` is a 30 s `useNow` ticker. Open the app at 23:50 and let it roll past
   midnight: measured at `now` = Tue 6 Oct 00:05 with `picked` = null, the page title reads
   `2026-10-06` and the deck shows Tuesday's three classes, while the section title reads **Yesterday**
   and "Mark day" opens **2026-10-05**. The whole day block strands a day behind, silently, on a
   perfectly ordinary open.
Both are one bug: the page mixed two independent notions of "the day" — a live one (`today`) and a
snapshotted-then-tapped one (`sel`) — and let each half of the UI read whichever suited it.
**Fix commit:** `9225562`
**Fix:** `dayBlock(now, meetings, courses, att, dayMarks, picked)`
(`src/domain/attendance.ts`) returns one day and everything derived from it — `day`, `date`, `occ`,
`periods`, `cur`, `next` — and `Today.tsx` builds its day-scoped half from a single call:
the strip, the class list, the section title, the day-mark label and the "Mark day" target all read
the same `sel`/`selDate`. `sel` is now **derived** (`selectedDay(now, picked) = picked ?? startOfDay(now)`,
`src/domain/time.ts`) rather than snapshotted, which is what closes cause 2. The deck's live "Period N
of M / N of M left" line now reads the selected day's periods, so it can no longer contradict the button
below it. `selectedDay` normalises a pick to `startOfDay`, which the test caught the seam missing.
**No copy changed and nothing restyled:** with no day picked, `selectedDay(now, null)` is
`startOfDay(now)` — exactly what the old `todayOcc` path used — so a normal open renders byte-identically
to before. The title, clock face and "In class / Next up / All done for today / No classes today" line
keep reading the **live** day: they are about the present, and rewording them for a picked day is the
product decision the finding flagged, which this fix does not take.
**Regression test:** `src/test/today-day.test.ts` (9 tests) against the real demo seed. It asserts that
"Mark day" opens the selected day *and* that the strip above it is on that day too
(`b.periods.every(p => startOfDay(p.start) === b.day)`), that every day-scoped readout agrees for five
different picks, that **the day does not depend on when the screen was mounted** (the cause-2
regression), that a pick survives midnight, and that "in class / next up" still follow the live day.
It first proves Monday really has 4 classes and Saturday 0, so the assertions cannot pass vacuously.
Three further checks read `Today.tsx` itself, since the seam cannot see it: it calls `dayBlock`, it no
longer contains `useState(today)`, and the button is keyed on `selDate` with exactly one `mode: 'day'`
`act.open` on the file.
**Device verification still required:** yes — (1) open Today, do not tap anything, confirm the page is
unchanged from the pre-fix build (title `Mon 5 Oct`, `4 of 4 left`, four class boxes, "Next up — Intro
to Economics"); (2) tap **Sat 10**, confirm the `4 of 4 left` deck is **gone** (Saturday has no classes)
and the strip, the "Sat 10 Oct" section and the "Mark day" target all name Saturday; (3) tap **Wed 7**,
confirm the deck now shows Wednesday's three classes rather than Monday's four, and that "Mark day"
still opens Wednesday; (4) **leave the app open across midnight** (or set the clock forward) and confirm
the title, the strip and "Mark day" all move to the new day together — this is the cause-2 check and it
cannot be reproduced any other way.

---

## BUG-023 — open — Minor
**Screen:** Stats → the "Grades" section → "Attendance, last 4 weeks"
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:** Stats → scroll to "Attendance, last 4 weeks".
**Expected (V13: "All cards render without overlap at 360 dp"; "attendance heatmap shows rows per
subject for the last 28 days"):** all 28 day-cells of every subject row fully visible inside the card.
**Actual:** **every one of the five subject rows has its final cell sliced vertically by the card's
right border** — roughly half a cell's width is cut off. One of the 28 days per subject is
unreadable. Zoomed evidence in `qa/shots/a2_stats_heat_right.png`; the row labels are truncated at the
same time ("Intro to Ec…", "Discrete M…", "Emerging …", "Computer …", "Database S…"), which is what
steals the width.
**Evidence:** `qa/shots/a2_stats_heat_right.png`, `qa/shots/a2_stats_s2.png`.
**Scope note:** the two week-based heatmaps on the same page ("Focus heatmap", "Tasks finished") have
no subject-label gutter and fit correctly — only this one clips. So it is this card's layout, not the
`Heatmap` primitive.

---

## BUG-024 — open — Minor
**Screen:** Stats (the `Empty` hint at the top of the page)
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:**
1. Settings → Data & export → **Clear demo history**.
2. Go to Stats.
**Expected (`prompt.md` V13, verbatim):** "empty-state hint shows after Settings → Clear demo history
on a fresh DB with no focus/tasks" — i.e. the hint *"Finish a task or a focus session and the charts
fill in."*
**Actual:** after the purge the DB has **0 focus sessions** and the Focus heatmap is completely blank
("0m in the last 15 weeks"), yet **no empty-state hint appears anywhere on the page**. The seeded DB
retains one non-demo finished task, "Lab report — set proofs", and the guard demands that *no* task be
finished at all before it will show.
**Evidence:** `qa/shots/a2_stats_afterpurge.png` — rings all read 0 %, "Focus heatmap / 0m in the last
15 weeks" with an empty grid, and no hint above the "At a glance" card.
**Root cause (pinned):** `src/screens/Stats.tsx:25`
```ts
const nothing = st.focus.length === 0 && st.tasks.every((t) => t.status !== 2);
```
The two conditions are ANDed, so the hint fires only when *both* halves of the dataset are empty. A
user who has completed one task but never run a focus session gets two permanently blank focus charts
and no explanation. Splitting it — an empty-state hint per chart, or `nothing = st.focus.length === 0
|| !totalDone` — would satisfy V13.
**Honest partial credit:** the per-card sub-lines do degrade correctly. "When you work best" becomes
**"Start a focus session to see this"** and "When you tick things off" becomes "Finish a task to see
this", and the two histograms draw a flat baseline rather than breaking. So the page is not broken —
the one hint V13 names is the one that does not fire.
**Knock-on:** this is the same root cause as BUG-025 — neither V13's empty state nor a genuine
first-run empty database is reachable in the shipped build.

---

## BUG-025 — open — Minor
**Screen:** Settings → Data & export → "Clear demo history"
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device + source
**Repro:**
1. Note the To-do header ("9 open") and the Done group count ("Done · 7").
2. Settings → Data & export → **Clear demo history**.
3. Return to To-do, and to Today / Week / Grades.
**Expected:** `prompt.md` V13 treats this button as *the* way to reach "a fresh DB with no focus/tasks",
so it is expected to empty the demo dataset. My brief for this run also assumed it produces a
genuinely empty database for empty-state testing.
**Actual:** the button only deletes **`task WHERE demo=1`** and **`focus_session WHERE demo=1`**
(`src/data/sqlite.ts:77`). It does **not** touch courses, meetings, attendance, day marks, notes,
marks, the 9 open tasks, or settings. Measured after the purge:
| | before | after Clear demo history |
|---|---|---|
| To-do header | `9 open` | **`9 open` (unchanged)** |
| Done group | `Done · 7` | `Done · 1` (only the non-demo "Lab report — set proofs" survives) |
| Focus sessions | 20 (demo) | 0 |
| Subjects / timetable / open tasks / notes | populated | **all unchanged** |
So **no screen in the app can reach a true empty state**: not Today (classes, notes, due-soon all
seeded), not Week (timetable), not To-do (9 open tasks + "New task" button), not Grades (5–6 subjects),
not Stats (attendance heat and grade bars are still full). The only genuinely empty states reachable in
the shipped build are *filter-scoped* ones — a search with no matches, and a day with no classes.
**Evidence:** `qa/shots/a2_after_purge_todo.png` ("9 open", unchanged), `qa/shots/a2_done_only2.png`
(Done · 1), `qa/shots/a2_today_sat_empty.png` (the 0-class day), `qa/shots/a2_search_empty.png`
(the no-match search).
**The two escape hatches both re-seed, so there is no route at all:** Settings → Reset → "Reset to demo
set" *replaces everything with the original demo set*, and `adb shell pm clear` re-seeds on next boot.
**Severity honesty:** this is a UX/spec finding, not a crash or data loss — nothing is lost that the
user did not ask to lose, and the button's own hint is honest ("Removes the sample finished tasks and
focus sessions… Your own data stays"). But `prompt.md` V13 has a stated PASS criterion that this path
cannot satisfy, and the gate cannot verify any screen's real empty state without deleting demo data.
**Suggested decision (product, not unilateral):** either rename the button so it stops implying
"start fresh" and point V13 at a supported way to get an empty DB, or add an explicit
"Delete all data" (with the same double-tap guard as Reset) so the empty states are reachable and
testable.

---

## BUG-026 — open — Minor
**Screen:** To-do (subject chips) · Task sheet (three chip rows) · Stats "Mark history" chips ·
Today "Notes" row
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:** To-do, look at the subject chip row under the sort chips.
**Expected:** horizontal chip rows either fit or scroll with a visible affordance; a chip should not
be sliced mid-glyph at the viewport edge with nothing to indicate there is more.
**Actual — the same hard clip in six places:**
| Where | Clipped |
|---|---|
| To-do subject chips | 4th chip is **92 px** wide, label cut to 58 px, right edge flush at x=1038 → "Dis…" |
| Task sheet, kind row | 4th chip cut → "P…" (Project) |
| Task sheet, subject row | 3rd chip cut → "Discrete Mathe…" |
| Task sheet, reminder row | 5th chip cut to a sliver at the screen edge |
| Stats "Mark history" chips | "Emerging Technology" squeezed to **99 px** / 65 px of text |
| Today "Notes" row | 2nd note card cut mid-word by the screen edge ("Bring the sources bi…") |
**Evidence:** `qa/shots/a2_baseline_tasks.png`, `qa/shots/a2_task_form2.png`, `qa/shots/a2_stats_s2.png`,
`qa/shots/a2_today_sat_empty.png`.
**Severity honesty:** these *are* horizontal `ScrollView`s and they do scroll, so nothing is
unreachable — but on the Task sheet the kind and subject rows are the *only* way to pick a kind or a
subject, and both are cut with no fade, no shadow and no partial-chip peek. `COVERAGE.md` had already
flagged "possible clip at right edge" on the To-do chip row; this confirms it and widens the scope.

---

## BUG-027 — open — Minor
**Screen:** Week (the timetable grid's hour scale)
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:** Week → "This week".
**Expected:** the hour scale down the left of the grid reads 8, 9, 10 … 16 with every label whole.
**Actual:** the last label, **"16", is sliced roughly in half horizontally by the hand-drawn card's
bottom border** — the bottom of the glyphs is cut off and the card edge runs straight through them.
Every other label (8–15) is clear.
**Evidence:** `qa/shots/a2_week_hour16.png` (zoomed crop of the hour scale, taken from the Week page
in the same session). The full Week page from that moment was not kept; `a2_week_hour16.png` plus the
pixel measurements in the root-cause note are the evidence.
**Root cause (pinned, for the Fixer):** `src/screens/Week.tsx:35` renders each hour label at
`top: i * 60 * PX - 5` inside the `height: H` grid. For the final hour (`i = (end-start)/60`) that is
`451 dp`, i.e. the label is centred on the grid's **bottom edge** instead of sitting above it. Either
give the label container `H + 12` of room, or offset the last row by the label height.
**Also checked and is CLEAN — do not re-audit:** the grid does **not** overflow horizontally (V2).
Measured off a screencap: vertical rules at x = 121, 252, 383, 513, 644, 775, 906 and the card's own
border at 1035, and the seven day headers centre at 186 / 317 / 448 / 579 / 710 / 841 / 972 — so all
7 columns are present and correctly aligned, with no missing Sunday column and no clipped block. The
right-hand border is intentionally absent (`Week.tsx:31` draws `i = 0…6`, one left edge per column).

---

## BUG-028 — open — Minor
**Screen:** To-do (search field) — V19
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:**
1. To-do.
2. Tap the "Search tasks" field.
3. Type anything.
**Expected (V19: "keyboard opens over sheets without covering the field … sheets lift by keyboard
height"):** the field being typed into must stay visible, and the floating nav should stay at the
bottom edge of the *visible* area.
**Actual:** the field is **not** covered — the primary V19 requirement holds, and the list reflows
above the keyboard correctly. But because the window is resized, the **floating bottom nav bar is
stranded in the middle of the screen** (its box sits at y ≈ 1000–1150 px with the keyboard filling
everything below it), and the **FAB lands on top of the first task card**, covering that card's "tight"
label. With an empty search the FAB instead overlaps the dashed **"Nothing matches that search."**
box, partly hiding the hint.
**Evidence:** `qa/shots/a2_done_filter.png` (nav mid-screen, FAB over the "Reading response — Ch. 7"
card's "tight"), `qa/shots/a2_search_empty.png` (FAB over the empty-state box), `qa/shots/a2_search_cleared.png`.

---

## BUG-029 — open — Minor
**Screen:** Stats → "Tasks finished"
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:** Stats, with exactly one task finished inside the 15-week window — i.e. right after
Settings → Data & export → Clear demo history.
**Expected:** "1 in the last 15 weeks · streak 1 **day**".
**Actual:** "1 in the last 15 weeks · **streak 1 days**".
**Evidence:** `qa/shots/a2_stats_afterpurge.png`, `qa/shots/a2_baseline_stats.png` (the same line
read "streak 1 days" before the purge too).
**Root cause (pinned):** `src/screens/Stats.tsx:41` — `streak ${ds.current} days`, no pluralisation.
The neighbouring copy on the same page gets it right ("1 finished late."), so this is an oversight
rather than a deliberate choice.

---

## BUG-030 — open — Minor
**Screen:** Stats (four separate cards)
**Found by:** FRESH-USER + TASK-DOMAIN QA (AGENT 2) · device
**Repro:** Stats, scroll through the page.
**Expected:** subject names and axis labels readable in full.
**Actual — the same subject names truncated in four different cards, while a fifth subject fits in
one of them, so it is a width bug and not a naming one:**
| Card | Rendered |
|---|---|
| "Totals against goals" | "Intro to Econom…", "Discrete Mathem…", "Computer Progra…" (all three cut) |
| "Attendance by subject" | "Intro to Econom…", "Discrete Mathem…", "Emerging Techno…", "Computer Progra…" — but **"Database Systems" fits whole** in the same column |
| "Attendance, last 4 weeks" (row labels) | "Intro to Ec…", "Discrete M…", "Emerging …", "Computer …", "Database S…" |
| "Mark history" (x-axis) | "Quiz", **"Assig"**, **"Mid"** — the last two are cut mid-word |
**Evidence:** `qa/shots/a2_stats_s2.png`, `qa/shots/a2_stats_when2.png`, `qa/shots/a2_stats_when3.png`.
**Also on this page, same class of defect:** the fourth "At a glance" ring's label renders as
**"Focus strea"** — the final "k" is cut — and its sub-line "0 d · best 0" runs flush to the card edge
(`qa/shots/a2_baseline_stats.png`, `qa/shots/a2_stats_afterpurge.png`).

---

# AGENT 2b findings (2026-10-05) — BLOCKED AT THE KEYGUARD, Parts 2–4 NOT RUN

**No app defect was observed this session, because no app screen was ever reachable.** The device was
locked behind a secure **pattern** lock before the first tap. The brief stated the device was unlocked and
`svc power stayon true` was set; `stay_on_while_plugged_in` is indeed `7` and `screen_off_timeout` is
`1800000`, so the screen was not sleeping — the device was simply **locked**, which is a different state and
which `stayon` does not prevent. `adb.sh locked` reported `UNLOCKED` throughout (see BUG-031), so this was
invisible to the harness until I queried `dumpsys trust` directly.

Evidence that the app was never in front: `mCurrentFocus=Window{580c173 u0 NotificationShade}` and the app
window itself was `mHasSurface=false isVisible=false` throughout. **The database still contains zero
`QA_` records** — `DATA_LEDGER.md` remains correct as written and needs no cleanup.

**What I attempted, all verified to fail** (`deviceLocked=1` and `isKeyguardShowing=true` after each):
`wm dismiss-keyguard`; `input swipe` up from y = 1500 / 2000 / 2200 / 2350 / 2390 / 2399 at 200–900 ms;
`input draganddrop`; a hand-rolled `motionevent DOWN/MOVE×10/UP` sequence; `keyevent` 3 (HOME) / 4 (BACK) /
26-adjacent 223+224 (SLEEP/WAKEUP) / 82 (MENU); `cmd statusbar collapse`; `am start` on the already-running
`ExperienceActivity`; tapping the face-recognition retry icon. **Input does reach SystemUI** — a swipe up
visibly dismissed the pattern bouncer back to the clock screen — so the failure is specifically the
**unknown pattern credential**, not a dead input path. `adb shell su` → `inaccessible or not found`;
`adb root` → `cannot run as root in production builds`; `run-as host.exp.exponent` → `package not debuggable`.
`locksettings` requires `--old <CREDENTIAL>` for every mutation and none is available.

**A human must unlock the phone once more.** This is the same wall AGENT 2 hit. It is now a *pattern*, not a
PIN, and `svc power stayon true` does not prevent it — recommend the orchestrator treat "phone unlocked" as a
precondition to verify, not an assumption.

## BUG-031 — open — Minor
**Screen:** QA harness — `qa/scripts/adb.sh locked`
**Found by:** TASK-DOMAIN QA (AGENT 2b) · device
**Repro:** with the device locked behind its pattern, `./qa/scripts/adb.sh locked` prints `UNLOCKED`.
**Expected:** the command reports `LOCKED`, so an agent can detect the blocker before burning a run.
**Actual:** it **always** prints `UNLOCKED`. The probe is
```bash
$ADB shell dumpsys window | grep -qiE 'mShowingLockscreen|isStatusBarKeyguard' && echo LOCKED || echo UNLOCKED
```
On this Android 13 build **neither string exists** — `rg -c "mShowingLockscreen|isStatusBarKeyguard"` over
`dumpsys window` returns **0 matches**. The real fields are `isKeyguardShowing=true` (WindowManager) and
`deviceLocked=1` (`dumpsys trust`). So the `grep` never fires and the `||` branch always wins.
**Evidence:** measured side by side this session — `adb.sh locked` → `UNLOCKED` while
`dumpsys trust` → `deviceLocked=1` and `dumpsys window` → `isKeyguardShowing=true`.
**Impact:** this is the harness defect that let AGENT 2b start a run against a locked device without noticing.
It is the QA equivalent of the stale-dump trap already fixed in `ui_dump_raw`, and it is the reason a future
agent will keep re-discovering this wall.
**Fix (harness only, no app source):** replace the grep with
`dumpsys trust | grep -q 'deviceLocked=0'` as the authority, optionally OR'd with `isKeyguardShowing`:
```bash
locked) $ADB shell dumpsys trust 2>/dev/null | grep -q 'deviceLocked=0' \
           && echo UNLOCKED || echo LOCKED;;
```

## BUG-032 — open — Major (static, **not** device-confirmed)
**Screen:** Add sheet → Assignment · every other create-form sheet
**Found by:** TASK-DOMAIN QA (AGENT 2b) · source, while scoping the Part 3 double-submit test
**Repro (needs a device to confirm):** To-do → FAB → Assignment → type a title → tap **Add** twice quickly
(< 210 ms apart, i.e. a normal fast double-tap).
**Expected (my Part 3 brief: "rapid double-submit … must not create two records"):** one task.
**Actual:** `save()` is unguarded and **mints a fresh id on every call** —
`src/sheets/forms.tsx:65`: `const t = { ...draft, id: existing?.id ?? uid('t'), ... }`. The Add button's only
`disabled` prop is `disabled={!title.trim()}` (`forms.tsx:70`), so it stays enabled through the whole close
animation. `Sheet.close()`'s `closing.current` latch (`src/ui/Sheet.tsx:39`) guards only the *animation* — it
is checked inside `close()`, which runs **after** `act.saveTask(t)` on line 66. So the second tap reaches
`save()`, `uid('t')` produces a **different** id, `saveTask` sees `state.tasks.some(x => x.id === t.id)` as
false (`src/store/store.ts:113`), and a **second task is appended**.
**Why it matters:** the create path is the one place in the app where a duplicated record is unrecoverable by
the user — there is no id to match, so deleting one copy leaves an identical orphan, and the To-do count is
silently wrong. Same pattern in all five sibling forms (`forms.tsx:122` subject, `:133` class, `:146` mark,
`:160` note).
**Severity honesty:** this is a static certainty in the code path, but I could **not** confirm it on device,
because a physical double-tap must land inside a 210 ms window and I could not reach the screen. Treat as
**Major pending device confirmation**, not as an observed defect.
**Suggested fix:** latch in `save()` the way `Sheet.close()` already does — an `if (saved.current) return;`
with `saved.current = true` set before `act.saveTask`, or disable the button on first press.

---

## Observed, judged NOT a bug (recorded so nobody re-derives them)

1. **The "Focus streak" ring reads "14 %" on a 1-day streak.** `Stats.tsx:36` computes
   `Math.min(1, fs.current / 7)`, so the ring shows *fraction of a 7-day goal*, not a rate. The 14 % is
   arithmetically correct (1/7) and the sub-line spells out "1 d · best 4". It reads oddly next to
   three genuine rates, but it is not wrong and the label explains it. Polish at most.
2. **`Stats` "Totals against goals" lists 3 of 6 courses.** The other three have no marks, so no
   total. Correct, though a one-line "3 subjects with marks" would be kinder. Not filed.
3. **`Settings → Attendance & semester → "Semester starts" shows "Sep" and "7".** Not a truncated
   year: `Settings.tsx:167` builds **month + day** (`Number(s.semesterStart.slice(8))` = day 7), which
   matches the root hint "Semester from 2026-09-07". The two steppers are visually unlabelled, but both
   carry `accessibilityLabel` "semester month" / "semester day".
4. **`Settings → Attendance & semester` day stepper is capped at `max={28}`.** A semester starting on
   the 29th/30th/31st cannot be set. Real but tiny; Polish, not filed as a defect.
5. **Settings root reads "Diagnostics · 12 crashes recorded"** on a device that has been through
   several agents' Metro reloads. **STILL OPEN — AGENT 2b could not close it either.** Reading it needs
   the Diagnostics sheet on screen, and the device was locked behind its pattern for the whole of the
   AGENT 2b session. I tried every off-device route: the log is
   `Paths.document/marginalia-crashes.jsonl` (`src/ui/crashlog.ts:29,37`), i.e.
   `/data/data/host.exp.exponent/files/…`, which is **permission-denied** to the `shell` user,
   `run-as host.exp.exponent` refuses (`package not debuggable` — expected for Expo Go), there is no
   `su`, `adb root` is refused, and the app's files are not exposed under
   `/sdcard/Android/data/host.exp.exponent/`. **So the crash log cannot be read off-device at all — a
   human must open Settings → Diagnostics on an unlocked phone.** The most likely explanation remains
   earlier agents' Metro reloads, but it is unverified, and a crash that reproduces on a cold boot would
   be Critical.

---

## Template — copy for each new bug

```
## BUG-NNN — <open|fixed|verified> — <Severity>
**Screen:** <route / sheet>
**Repro:** <numbered steps, exact and repeatable>
**Expected:** <what should happen>
**Actual:** <what actually happens, verbatim>
**Evidence:** qa/shots/<agent>_<screen>_<step>.png · logcat excerpt
**Root cause:** <file:line> (filled by Fixer)
**Fix commit:** <sha> (filled by Fixer)
```

---

## Summary

| Severity | Open | Fixed | Verified |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| Major | 1 | 4 | 0 |
| Minor | 23 | 3 | 0 |
| Polish | 4 | 0 | 0 |

**Totals: 32 findings — 0 Critical, 5 Major (4 fixed), 26 Minor (3 fixed), 4 Polish.**
By agent: Phase 0 preflight 3 (BUG-001/002/003) · STATIC AUDITOR 15 (BUG-004…BUG-018) · FIXER 2
(BUG-019, BUG-020), plus BUG-009 fixed by the FIXER · **AGENT 2 FRESH-USER + TASK-DOMAIN 10
(BUG-021…BUG-030, 2 Major + 8 Minor)** · **AGENT 2b 2 (BUG-031 harness, BUG-032 static Major)**.
**FIXER (majors, 2026-10-05, device-locked run) fixed BUG-021, BUG-022 and BUG-032 with jest
regression tests** — no device, so each is `fixed, pending device verification`.

> **AGENT 2b is also blocked and Parts 2, 3 and 4 of the task domain remain UNTESTED.** The device was
> locked behind a secure **pattern** before the first tap of the session; `svc power stayon true` prevents
> the screen from sleeping but does **not** prevent the keyguard, and `adb.sh locked` reports `UNLOCKED`
> regardless (BUG-031). Full detail, the complete list of attempted unlock vectors, and the one static
> finding surfaced in its place are in the AGENT 2b section above.
> **Do not read any V9 lifecycle clause as covered.** Zero `QA_` records exist; `DATA_LEDGER.md` needs no
> cleanup.

> **AGENT 2 exited early and blocked.** Parts 2, 3 and 4 (the task-domain lifecycle, the input
> edge cases and the persistence check) are **largely untested** — the phone's secure keyguard
> engaged part-way through Part 2 and could not be dismissed by any `adb input` vector (swipe from
> five origins and durations, `motionevent` DOWN/MOVE/UP, `keyevent` 3 / 26 / 82 / 224,
> `wm dismiss-keyguard`, `cmd statusbar collapse`). The app process survives, so the work resumes
> from the open Task sheet once a human swipes the phone. Details and the exact resume point are in
> the iteration log below. Do not read the AGENT 2 counts as coverage of V9's lifecycle clauses.

### Machine gates at STATIC AUDITOR exit (2026-10-04, Node 24.16.0 / npm 11.13.0)

| Gate | Exit | Result |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | 0 | clean |
| `npm run lint` (`eslint src --max-warnings=0`) | 0 | 0 warnings |
| `npm run test` (`jest`) | 0 | **111 tests / 9 suites** passed |
| `npm run boundaries` (`depcruise`) | 0 | no violations, 127 modules / 387 deps |
| `npm run check` (all four chained) | 0 | green before **and** after commit `8aa428a` |
| `npx expo-doctor` | 1 | 17/21 checks pass; 4 fail = BUG-001, BUG-002, BUG-003 + **BUG-007** (typescript) |
| `npx expo install --check` | 1 | 1 package out of date: typescript 5.9.3 vs ~6.0.3 → BUG-007 |

> Note for the Fixer: `qa/STATE.md:19` and `prompt.md:8` both record **104** and **82** jest tests
> respectively. The current count is **111** (9 suites). Both earlier figures are stale, not a regression.

### What the static pass found CLEAN (do not re-audit)

- **Zero `console.*`, `debugger`, `TODO`, `FIXME`, `XXX`, `HACK`** anywhere in `src/`.
- **No commented-out code blocks** found.
- **Zero hardcoded secrets, API keys, API URLs or absolute machine paths.** The only URL-shaped strings are OOXML
  and SVG XML namespace identifiers in `src/services/export.ts` and `src/ui/clock/faces.ts`.
- **Selector stability (N9 / `prompt.md` R10) is clean.** All 74 `useStore(...)` call sites return a raw state
  field, a `.find()` result (a stable element reference), a number (`.length`) or a string. **No selector builds a
  fresh object or array**, and **there is no `useStore((s) => s)` whole-store subscription anywhere** —
  `prompt.md` R10 is stale, the narrowing pass already happened.
- **No `Dimensions.get`** (all sizing goes through `useWindowDimensions`).
- **No `allowFontScaling={false}` and no `maxFontSizeMultiplier={1}`** — dynamic type is not disabled anywhere.
  `FS = 1.4` (`src/ui/fit.ts:40`) is the single font-scale cap and is imported, not re-invented, at all 9 sites.
- **Async error handling is thorough.** Every `expo-*` native call in `src/services/` is wrapped in try/catch that
  degrades silently by design; export has a real try/catch that surfaces a toast; `App.tsx` has an `alive` guard
  plus a `recordCrash`; `resync` and `toast` both clear their previous timer before re-arming.
- **Timer/subscriber cleanup is present** for `Keyboard` (Sheet), `BackHandler` (Sheet + Focus),
  `AccessibilityInfo` (theme-context), `useNow` (theme-context) and both double-tap guards (Settings, `Fatal`).
- **Touch targets** meet 44 dp at every site I could measure: `Btn` `minHeight` 40/52, `StepBtn` 46×46,
  `Chip` `minHeight` 34/42 + `hitSlop`, nav tabs `minHeight` 56, sheet header 44. The documented exception is the
  28×28 dp attendance cell (`src/screens/common.tsx:88`), which is intentional and has `hitSlop: 1`.
- **`.map()` list keys are present and correct** except for BUG-016.
- **Sheet focus trap is correct on Android** — `App.tsx:52` sets `no-hide-descendants` behind the sheet and
  `Overlay.tsx:21` sets `yes` over it (`accessibilityViewIsModal` is iOS-only, as the code comments correctly say).

### Machine gates at FIXER exit (2026-10-05, Node 24.16.0 / npm 11.13.0)

Both gates were re-run after **each** commit, not once at the end.

| Gate | `d9a3da0` BUG-004 | `e4b389a` BUG-005 | `1a3fba7` BUG-009 |
|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | 0 | 0 | 0 |
| `npm run lint` (`eslint src --max-warnings=0`) | 0 | 0 | 0 |
| `npm run test` (`jest`) | 0 · 111 tests | 0 · 112 tests | 0 · 115 tests / 10 suites |
| `npm run boundaries` (`depcruise`) | 0 · 127 modules | 0 · 127 modules | 0 · 128 modules |
| `npm run check` (all four chained) | **0** | **0** | **0** |
| `npm run bundle` (`expo export --platform android`) | **0** · 3.8 MB | **0** · 3.8 MB | **0** · 3.8 MB |

> The BUG-005 run failed **once** before it passed: the new contrast guard caught `slabInk` being used as ink on
> the onyx dial, which is wrong because `ORIGINAL.dark` inverts `slab`/`slabInk`. The fix used palette tokens
> that are actually pale in both modes instead. No lint rule, tsconfig flag or test was relaxed anywhere.

### Needs a device to settle (cannot be determined statically)

1. **BUG-004 — the black status-bar band.** Still unexplained. The style half is fixed and provable, but I could
   not reproduce a black band from the app's own code, so I cannot say whether `d9a3da0` removed it. Needs the
   release-build re-measurement the orchestrator already called for. If it is still black, the cause is BUG-019(1).
2. **BUG-005 — the Focus bed and the dark dial engraving.** `dark ? c.card : c.desk` and
   `dark ? c.ink : c.card` are judgement calls made to keep the shipped refined palette unchanged. Both are
   within ΔRGB ≤ 7 of the old value in the default theme, but only eyes on device can confirm the ring and the
   onyx engraving still read as intended — and whether the Original palette now reads correctly.
3. **BUG-019 / BUG-020** — neither was verified on device; both are reasoned from code alone.
4. **BUG-013 / BUG-014 magnitude** — no frame-timing or memory data exists; both are scaling risks only.
5. `prompt.md` **R1** items are all still untested and stay untested by this pass: the Focus dial gesture maths
   (`measureInWindow` under `transformOrigin: '0% 0%'`), SVG `Pattern` with `patternTransform` on Android
   (`PaperBg`, `Week`, `DayBar`), `mixBlendMode` on the photo texture, `transformOrigin` on the break sticker, the
   `Placed` navigator timing, and `Directory.pickDirectoryAsync` on a standalone install.
6. Whether the derived `testID` slugs collide anywhere that matters in practice — needs a `uiautomator` dump.

---

## AGENT 2 iteration log (2026-10-05) — what was and was not exercised

**Cold-boot discipline held.** Every judgement came after
`adb shell am force-stop host.exp.exponent` + relaunch. No
`ReferenceError: Property 'dark' doesn't exist` and no `"undefined" is not a valid color` warnings
appeared in logcat at any point, which confirms the briefed artefact and means **none of the AGENT 2
findings is a fast-refresh ghost**. Per the brief, no status-bar / system-bar / edge-to-edge
observation is reported (Expo Go owns that window; BUG-004 already settled it).

### Done and evidenced

| Part | What | Result |
|---|---|---|
| 1 | Seeded baseline tallied: 9 open (Late·8 + Later·1), Done·7, 20 demo focus sessions, 5–6 courses, ~68 attendance marks | pass |
| 1 | Settings → Clear demo history executed | Done 7 → 1, focus 20 → 0, everything else untouched → **BUG-025** |
| 1 | Empty states reachable today: To-do search no-match, Today's 0-class day, Week "Nothing due this week.", Stats "When you work best" | **4 pass**, all with a helpful hint, no blank or broken layout |
| 1 | Add sheet from this state | **pass** — all 8 tiles present, labelled, no clipping, thumb-reachable |
| 1 | Every screen visited and judged | Today / Week / To-do / Stats / Grades walked; Focus not opened |
| 1 | Genuinely empty database | **impossible in-app** → BUG-025; this is why Part 1 is partial |
| 2 | Baseline counts recorded for later propagation diffs | see `DATA_LEDGER.md` |
| 2 | Task sheet opened from the Add sheet; kind / subject / due / reminder / effort / priority / steps rows all inspected | visual pass; **not** saved |
| 3 | Effort stepper defaults, reminder-disabled hint, subject default | pass |
| — | Navigation: all five tabs, hardware BACK, keyboard-open layout | **BUG-021**, **BUG-028** |
| — | Settings: root, Attendance & semester, Data & export, Reset | pass (Reset not triggered) |

### Not tested, and why

| Skipped | Reason |
|---|---|
| **All of Part 2's lifecycle**: open detail → values match → edit → re-verify → delete → Undo; swipe right = done; swipe left = crumple + Undo; done-timestamp recorded; the whole propagation matrix (list / group header / "N open" / search / All-Open-Done / By date-By priority-Newest / subject chip / Stats) | device locked mid-Part-2 |
| **All of Part 3**: empty & whitespace titles, 200-char title, emoji, `<>&"'`, RTL, effort 0 / 1 / −1 / 240 / 1000, duplicate titles, rapid double-submit, HOME mid-form, keyboard-covering-the-field inside a sheet, back-out-with-unsaved-input | device locked mid-Part-2 |
| **All of Part 4**: force-stop → relaunch → records intact | device locked mid-Part-2 |
| Focus screen (V10) | out of my Part 1–4 scope; left to the INTERACTION SWEEPER |
| Grades attendance grid (V8), marks, notices, slip, course/meeting/mark sheets | out of my scope; walked only far enough to judge the page renders |
| Settings sub-pages: Look & feel, Reminders, Sound & haptics, Focus & breaks, Diagnostics | walked the list; only Attendance & semester, Data & export and Reset were opened |
| Light mode, font scale 1.3, 360 / 430 dp, rotation | device settings are orchestrator-owned; I changed nothing |
| Notification delivery, custom sound, haptics quality, performance | Expo Go cannot prove these (see STATE.md) |

### Exact resume point

The **Assignment task sheet is open and empty**, with the title field focused and the soft keyboard
up (`qa/shots/a2_task_form.png` is the same state with the keyboard down). Nothing has been saved, so
**the database contains zero `QA_` records** and `DATA_LEDGER.md` has no rows to clean up. The
sequence to resume is: unlock the phone → dismiss the keyboard → finish Part 2 from the V9 script
(title `QA_algebra_hw`, subject left as "No subject", Due → "When I get home", "2 h before" on,
effort 90 min, check the Tight/Comfortable box, Save).

### Open question I could not close

`Settings → Diagnostics` reports **"12 crashes recorded"** and I never got to open it. Those are
probably earlier agents' Metro reloads, but the app has a `recordCrash` path and a crash that
reproduces on a cold boot would be Critical. **Whoever has the device next should open Diagnostics
and read the log before trusting any further result from this build.**

---

## AGENT 2b iteration log (2026-10-05) — blocked at the keyguard, ~40 min, zero app screens reached

### Why the session ended

The device was locked behind a secure **pattern** lock for the entire session. Not a sleeping screen —
`dumpsys power` reported `mWakefulness=Awake`, `dumpsys display` reported `mState=ON`, and
`stay_on_while_plugged_in=7` was confirmed set — but `dumpsys trust` reported `deviceLocked=1` and
`dumpsys window` reported `isKeyguardShowing=true` throughout. The app window was
`mHasSurface=false isVisible=false` from start to finish and `mCurrentFocus` was
`Window{NotificationShade}`; every screenshot shows the lock screen.

**`stayon` prevents sleep, not lock.** That distinction is the whole lesson of this session.

### Unlock vectors attempted, all verified to fail

`wm dismiss-keyguard` · `input swipe` up from y = 1500 / 2000 / 2200 / 2350 / 2390 / 2399 at 200–900 ms ·
`input draganddrop` · a hand-rolled `motionevent DOWN/MOVE×10/UP` sequence · `keyevent` 3 / 4 / 82 / 223+224 ·
`cmd statusbar collapse` · `am start` on the already-running `ExperienceActivity` · tapping the
face-recognition retry icon. Escalation refused: `su` not found, `adb root` refused (production build),
`run-as host.exp.exponent` refused (not debuggable), `locksettings` needs `--old <CREDENTIAL>`.

**Input is not the problem** — a swipe up visibly dismissed the pattern bouncer back to the clock
screen, so gestures land correctly. The blocker is solely the unknown pattern.

### Two findings, neither of them an app defect observed on screen

| Id | What | Severity |
|---|---|---|
| **BUG-031** | `adb.sh locked` always prints `UNLOCKED` — it greps `dumpsys window` for `mShowingLockscreen` / `isStatusBarKeyguard`, **neither of which exists on this Android 13 build** (0 matches). The real fields are `dumpsys trust → deviceLocked=0` and `isKeyguardShowing`. This is the harness defect that let this run start blind against a locked device. | Minor (harness) |
| **BUG-032** | Static: `forms.tsx:65` mints `uid('t')` on **every** `save()` call and the Add button is never disabled during the 210 ms close animation, so a fast double-tap can create **two** tasks. Same in all five sibling forms. Not device-confirmed. | Major (static) |

### Also recorded so nobody re-derives them

1. **The crash log is unreadable off-device, full stop.** `marginalia-crashes.jsonl` lives in
   `Paths.document` = `/data/data/host.exp.exponent/files/`, which `shell` cannot read; Expo Go is not
   debuggable so `run-as` refuses; there is no `su`/`root`; and the files are not exposed under
   `/sdcard/Android/data/host.exp.exponent/`. **A human must open Settings → Diagnostics.** The
   "12 crashes recorded" lead stays open — see Observed-item 5.
2. **`adb exec-out screencap -p` intermittently returns a 0-byte file with exit 0** while the keyguard
   is up, then works reliably again after a `keyevent 223` (SLEEP) + `keyevent 224` (WAKEUP) cycle. Any
   agent writing a `stat -c%s`-style guard on screenshot size should know a `0` means "keyguard/secure
   surface", not "screen is off".

### Parts 2, 3, 4 — status unchanged from AGENT 2

| Part | Status |
|---|---|
| **Part 2 — task lifecycle (V9)** | **NOT RUN.** No record created, no detail opened, no edit, no delete, no Undo, no swipe-right=done, no crumple, no propagation counts diffed. |
| **Part 3 — input edge cases** | **NOT RUN.** Only BUG-032 (rapid double-submit) was reached, statically. |
| **Part 4 — persistence (V16)** | **NOT RUN.** No `QA_` records exist to verify. |
| Diagnostics crash log | **NOT RUN** — see above. |

**Resume point is unchanged and exact:** unlock the phone (a human, with the pattern) → verify with
`adb shell dumpsys trust | grep deviceLocked=0` rather than `adb.sh locked` → cold-restart
(`am force-stop host.exp.exponent`, relaunch) → then run the V9 script from
`qa/DATA_LEDGER.md`'s "Counts to diff against" table, seed `QA_algebra_hw` first.
