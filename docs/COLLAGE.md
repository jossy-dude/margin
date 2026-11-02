# The collage: Margin's design system (v0.5)

Read this before changing any screen. Decision record: `DECISIONS.md` D13. The owner's references: a torn-paper
collage landing page (Snip: crumpled paper, torn dividers, denim/mustard/sage/kraft papers, charcoal ink, clean
grotesque type) and two minimal app screens (Ancient Time, a coffee app: big editorial titles, sparse engraved
art at the edges, quiet indicators).

## The rules
1. **Paper, not plastic.** Every surface is a piece of paper on a desk. Big surfaces are **torn** (a white core
   along the tear, soft lift shadow, no ink outline). Small controls are **scissor-cut** (wide → pill, squarer →
   softly rounded). Never draw an ink outline around paper, except where a line *means* something: a ghost
   button, a dashed drop-zone, a selection ring (on a torn sheet a coloured mark becomes a strip tucked under its
   left edge).
2. **Calm.** One idea per surface. Big type for the one number that matters; everything else smaller and muted.
   Density only where it helps (analytics, week planning).
3. **Elapsed time dims; it never slides a marker.** Every progress display dims what has passed.
4. **Motion = paper moving.** Things are dealt, placed, lifted, torn, stamped. Movement and springs, never fades
   for arrival. **Page switches stay a cut** (no animated wrapper on a page — `perf-placement.test.ts`, owner's
   report of slow page arrivals). Respect `useReduceMotion()` everywhere.
5. **Accessibility is not optional:** `accessibilityRole` + label on every control, text pairs ≥ 4.5:1 (the
   tokens are measured), `maxFontSizeMultiplier={FS}` on chrome, live regions for changing numbers.

## The kit (use these; don't re-invent)
| Need | Use |
|---|---|
| Colours | `useTheme()` → `c` (paper, card, desk, ink, mut, acc, ok, warn, bad, deck/deckInk/deckMut, hl…), `tints` (sky, sage, sand, cream, blush = pale papers under text; mustard, denim, moss, tomato, kraft = art only), `look` (`'collage'` or `'ink'`), `dark` |
| Materials | `tokens/theme.ts`: `PAPER` (core white, scrap ink), `AMBIENT`, `DIAL`, `ONYX`, `SECOND`, `TAPE`. **No hex literals outside `tokens/theme.ts`** (`color-drift.test.ts` enforces it) |
| Text | `<Txt f s c>`; roles: `marker` (headings, Bricolage 800), `bold` (labels, 600), `hand` (body, 400), `serif` (italic asides), `type` (numbers, DM Mono), `script` (real handwriting, Caveat). Sizes are the old Caveat-tuned numbers; the theme scales them. For TextInput/SVG text use `faceOf(theme, role, size)` |
| A card / slip | `<HandBox seed fill [stroke] [cut="torn"/"cut"] [shadow] [dashed]>` |
| A full-width torn divider / sheet | `<TornSheet seed fill [lift] [crumple]>` (`ui/collage/Torn.tsx`) |
| Paper art (sun, hills, scraps, leaves, ruled strip, tape, denim disc) | `<Art name w [rot]>` (`ui/collage/Art.tsx`); new pieces: add a recipe to `scripts/paper-art.mjs`, run `node scripts/paper-art.mjs --only <name>` |
| A subject's colour | `subjectTint(id, tints)` (`ui/collage/tint.ts`) — the same everywhere |
| The mascot | `<Scrap size mood cue [lookX lookY] [awake]>` (`ui/mascot/Scrap.tsx`, moods in `scrap-rig.ts`) |
| Buttons, chips, toggles, fields | `Btn`, `Chip`, `Toggle`, `Field` (kit), `NumberField`, `TimeField`, `DurationField`, `Slider` (ui/fields) |
| Sounds + haptics | `fx.*` (`services/fx.ts`) — one call per action |
| Press timing | `usePressIn(action)` — acts on press-in, TalkBack-safe |

## Working rules for any agent
- Check while working: the jest files you touched (`npx jest src/test/<file>`), `npx tsc --noEmit`,
  `npx eslint <your files> --max-warnings=0`. Full gate before handing back: `npm run check`.
- **See it**: run the web build (`npx expo start --web --port <yours>`), then `node tools/look-shots.mjs --url
  http://localhost:<port> --out .shots/<dir> --steps "onboarding-skip,wait:4500,tab-stats,wait:1200,shot:stats"`
  (`--dark` for dark mode; steps: a testid to tap, `text:`, `label:`, `scroll:<px>`, `wait:<ms>`, `shot:<name>`).
  The first launch shows onboarding — `onboarding-skip` leaves it; a toast covers the + for ~4 s after.
  Look at every frame you make, light **and** dark, at 412 wide (and 320 for anything dense).
- Tests that pin exact source strings: change them on purpose with a `Rationale:` comment, never just to go
  green; prefer behaviour tests.
- Commits: **no attribution trailers of any kind** (no Co-Authored-By, no "Generated with"); git identity as is.
- Never run Gradle or any native build locally; never push.
