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
| Major | 0 | 2 | 0 |
| Minor | 12 | 3 | 0 |
| Polish | 4 | 0 | 0 |

**Totals: 20 findings — 0 Critical, 2 Major (2 fixed), 14 Minor (3 fixed), 4 Polish.**
By agent: Phase 0 preflight 3 (BUG-001/002/003) · STATIC AUDITOR 15 (BUG-004…BUG-018) · FIXER 2
(BUG-019, BUG-020), plus BUG-009 fixed by the FIXER.

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

-
