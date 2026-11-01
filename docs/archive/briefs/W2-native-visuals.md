# W2 brief — Native visuals: grain that actually tiles + the status-bar band

**let's make v1 first.** Two symptoms, one file-area each, both reasoned from real platform behaviour
and both proven on-device *later* via `docs/DEVICE_CHECKLIST.md` — there is no ADB device in this
environment, so nothing here may claim a device pass.

- Branch: `v2-improvements`. Do **not** commit — the orchestrator reviews and commits.
- Depends on: W1 committed first (W1 touches `store.ts`/screens; do not start before its commit lands,
  so the diff for this workstream stays readable).
- Builder: `opencode/deepseek-v4.1-flash-free` (project agent `builder`). If the `impeccable` skill is
  loadable, load it and read `reference/craft-floor.md` before editing; this is a refinement — the
  hand-drawn paper world, its texture, and everything outside the two symptoms stay exactly as they are.

## Symptom 1 — native grain paints one block and stops tiling

Owner's phone screenshots (from his brief; the files themselves are not in the repo) show the grain
arriving as one dense ~360×405 block in the top-left corner with clean paper everywhere else, and a
black band across the status-bar area. Web is fine (CSS `background-repeat` path, fixed 2026-10-14).
Native path today (`src/ui/PaperBg.tsx:125`): `<Image source={GRAIN_SRC} resizeMode="repeat" style={StyleSheet.absoluteFill} />`
inside `<Animated.View style={[StyleSheet.absoluteFill, grainStyle]}>` — the file's own comment
(`PaperBg.tsx:61-62`) *assumes* native tiles at bitmap size; the screenshots say otherwise on the
owner's device.

Investigate before changing anything, and write down which of these is true (they are candidates, not
conclusions):
1. Read RN 0.86's own Android implementation in `node_modules/react-native` (the repeated-image path,
   Fabric/New Architecture included) — does `resizeMode="repeat"` still tile with
   `newArchEnabled: true`, or does it degrade to a single tile (or to the image's intrinsic size)?
   The same question for iOS (the file must be right on both).
2. Reproduce the *shape* of the failure on web: temporarily render the native element structure in the
   web build and observe (the web element-sizes-to-the-image trap is already documented in this file at
   lines 118-123 — the same trap may exist natively for a different reason).
3. Check whether the `Animated.View` wrapper (opacity animation) or `absoluteFill` interacts with the
   sizing.

Then fix it with the most boring mechanism that provably tiles on both platforms, chosen from:
- **a. `react-native-svg` `<Pattern>` + `<Image>`** — the ruling layers already use `<Pattern>`; a
  bitmap-in-pattern tile is one draw call and works on both platforms. Check react-native-svg's
  documented `<Image>` support inside `<Pattern>` for the installed version before choosing.
- **b. an explicit grid of N `<Image>` tiles** (same module, no new dependency), sized from
  `useWindowDimensions`.
- **c. keep `Image resizeMode="repeat"` but correct whatever defeats it** — only if the investigation
  finds a definite cause, and say what it was.

Hard constraints (owner's brief): **no blend modes anywhere in the grain path** (no `mixBlendMode`, no
`experimental_backgroundImage` tricks, no new dependencies); the grain's opacity math
(`c.grain * (dark ? 0.55 : 0.8)`), the cross-fade (`PAPER_MS`, `cross` two-window mount), the per-instance
pattern id, and the web CSS path all stay as they are — web is proven, don't touch it. Reduce-motion
snaps opacity but still runs the mount dance; keep that.

Evidence required: the source/reads that settle the investigation (quote file:line from
`node_modules/react-native` or Expo docs), the diff, and `npm run check` green. Device truth →
UNVERIFIED-ON-DEVICE + checklist.

## Symptom 2 — black band under the status bar

`app.json` sets no `androidStatusBar` and no edge-to-edge flag; Expo SDK 57 / targetSdk 35 / RN 0.86
is the context. `src/App.tsx` `Themed` paints `c.paper` behind the status bar on purpose (comment at
`App.tsx:141-143`, "V19"), and screens pad content by `ins.top`.

Investigate (Expo SDK 57 docs via `webfetch` are allowed and encouraged — verify, never invent):
1. What does SDK 57 do by default with edge-to-edge on Android (enforced vs opt-in), and what does the
   status-bar area show then?
2. Which config (`androidStatusBar` fields, `android.edgeToEdgeEnabled`, or a dedicated paper-coloured
   band view drawn by `Themed` *under* `ins.top`) is the right lever in SDK 57 — and which ones are
   deprecated no-ops that would look like a fix while changing nothing?
3. Tie the answer to the screenshots: is the black band (i) the window behind the app, (ii) the status
   bar painted opaque, or (iii) the grain block itself landing dark? Only (i)/(ii) are this symptom.

Then apply the SDK-57-correct fix, minimal: config change and/or a band view in `Themed` that exists
only where the paper should already be. If the fix is a config that only takes effect in a native
build, say so explicitly in the checklist steps.

Evidence: the Expo doc quotes (URL + the sentence), the diff, `npm run check` green,
UNVERIFIED-ON-DEVICE.

## Device checklist (create `docs/DEVICE_CHECKLIST.md` now — later workstreams append)

Numbered steps a human can follow on the phone build, each with **what to look at** and the
pass/fail line. At minimum: grain tiles seamlessly full-screen both themes (no block, no seam at the
top edge), texture switch (grain↔photo↔plain) cross-fades without a flash, status bar area shows paper
(not black) in both themes, and the sheet-over-page case (open Add sheet: paper still correct behind).
State the exact build command we expect (`npx expo run:android` or EAS profile) — check `eas.json`
before writing it.

## Deliverable

1. The edits, uncommitted. Web path untouched (or say why a web line had to move).
2. `docs/DEVICE_CHECKLIST.md` (new).
3. Summary: per symptom — the evidence that settled the investigation (quotes with file:line / doc
   URL), the chosen mechanism and why it beats the alternatives, what is UNVERIFIED-ON-DEVICE, and the
   `npm run check` result line. Open items listed, not blocked on.
