/** The page-swap budget, in one place: how many pages are live while a swap happens, and how long the
 *  swap takes. They are one decision — a page has to be *mounted* before it can be animated, so every
 *  millisecond of the transition is also milliseconds during which two page subtrees exist at once.
 *
 *  ── what stays mounted ──
 *  `stamps` maps route name → visit counter (each navigation stamps the new route with `latest + 1`),
 *  `latest` is the newest stamp. A screen renders only while it holds one of the two newest stamps: the
 *  current screen, and the one directly behind it, which the placement animation shows underneath.
 *  Everything older unmounts, so tab-hopping does not keep every visited screen's tree, tickers and
 *  scroll containers alive for the whole session — and, just as importantly, does not leave three or six
 *  pages' worth of hidden `DayBar` fills and `charts.tsx` bars animating behind the one you are on.
 *  Two is a floor, not a preference: the outgoing page has to be visible under the incoming one
 *  (`prompt.md` V3), and a third page is a page nobody can see but the renderer still has to keep
 *  up to date.
 *
 *  ── how long it takes ──
 *  `PLACE_MS` was 520 and read as lag, not as paper being set down — the owner reported the page
 *  arriving "about half a second after the press". 520 was two thirds longer than it needed to be and
 *  sat exactly on the `prompt.md` V3 ceiling ("settles within ~0.5 s"), which is a ceiling and not a
 *  target. Two things make 200 the number rather than a taste call, and both are asserted in
 *  `src/test/perf-placement.test.ts`: it removes **work** — 31 frames of two-page compositing become 12,
 *  so ~320 ms of overlapping compositing is deleted per tap, not merely hidden — and it removes
 *  **dead time**, because the curve was optically settled at 333 ms of the old 520. 200 ms is still 12
 *  frames at 60 Hz, which is enough for a drop and a tilt to read as motion rather than as a jump.
 *
 *  `PLACE_EASE` keeps the original fast-out shape, so the *character* of the gesture is unchanged and
 *  only its length is not — changing both at once would make it impossible to tell which one fixed it.
 *  `PLACE_FROM` is trimmed to match: the same 70 dp of travel that read as a placement over 520 ms reads
 *  as a *slide* over 200 ms, and the seam it opens at the bottom of the screen is under the 94 dp the nav
 *  bar already covers either way, so nothing that was visible before is visible now.
 */
export const inMountWindow = (stamps: Record<string, number>, latest: number, name: string) =>
  (stamps[name] ?? -1) >= latest - 1;

/** Placement duration, ms. Also the number of frames both pages are live and being blended. */
export const PLACE_MS = 200;
/** `Easing.bezier` control points. Spread out here rather than in `Book.tsx` so the shape is testable
 *  as maths — see `src/test/perf-placement.test.ts`, which solves the curve rather than asserting a
 *  number back at itself. */
export const PLACE_EASE = [0.2, 0.9, 0.25, 1] as const;
/** Where the page starts, in dp/degrees, and how far it is "lifted" off the table. */
export const PLACE_FROM = { y: -48, x: 30, tilt: 3.8, lift: 1.028 } as const;
/** The shadow under the incoming page: how dark it starts, and how far along the placement it has gone.
 *
 *  It is the one opacity the transition keeps, and it is cheap precisely because it is a leaf view with a
 *  solid colour rather than a wrapper around a page — one blend, not a re-rasterised page.
 *
 *  `peak` is lower than the 0.35 it used to carry, and it is out by `goneBy` rather than at the end,
 *  because the page no longer fades in underneath it. At 0.35 across the whole page for the whole
 *  placement, the veil was doing the fade's job; with the fade gone it is just a flash of grey over the
 *  first two or three frames. `goneBy` is in easing-progress, not milliseconds, and the curve is
 *  front-loaded: 0.7 lands at 40 ms of a 200 ms placement. The veil is therefore gone by the third
 *  frame, while the page is still moving — which is what "placed" should look like. */
export const PLACE_SHADOW = { peak: 0.24, goneBy: 0.7 } as const;