/** Shared layout metrics for the parts of the chrome that sit at the bottom of the screen.
 *
 *  The bottom nav, the + button and every page's scroll padding all have to agree about where the bar ends,
 *  otherwise the + button sits on top of the nav or the last card hides behind it. They are defined once here
 *  and imported by `navigation/Book.tsx` (which draws the bar), `ui/Overlay.tsx` (which floats the + button over
 *  it) and `screens/common.tsx` (which pads the scroll area clear of both).
 *
 *  `NAV_BODY` is the drawn bar: one 56 dp minimum touch target per tab plus 4 dp of padding above and below.
 *  `NAV_INSET_PAD` keeps the bar off the gesture bar / home indicator, and the 8 dp floor means the bar still
 *  has breathing room on devices that report no bottom inset at all. `navHeight` therefore returns the true
 *  distance from the bottom of the screen to the top edge of the bar, for any inset. */
export const NAV_BODY = 64;
export const NAV_INSET_PAD = 6;
export const NAV_INSET_FLOOR = 8;
/** The + button is a 62 dp hand-cut square; `FAB_GAP` is the air between it and the nav bar's top edge. */
export const FAB = 62;
export const FAB_GAP = 12;
export const navInset = (bottomInset: number) => Math.max(bottomInset, NAV_INSET_FLOOR) + NAV_INSET_PAD;
export const navHeight = (bottomInset: number) => NAV_BODY + navInset(bottomInset);
/** How far a page has to scroll to clear the nav bar *and* the + button, plus a little slack. */
export const pageBottomPad = (bottomInset: number) => navHeight(bottomInset) + FAB + FAB_GAP + 24;
/** Where the undo toast sits when no sheet is open: `TOAST_CLEAR` dp above the nav bar's top edge. */
export const TOAST_CLEAR = 20;
export const toastBottom = (bottomInset: number) => navHeight(bottomInset) + TOAST_CLEAR;

/** How wide the fade at a scrolling strip's trailing edge is, and where it starts. */
export const STRIP_FADE = 30;
export const FADE_START = 0.62;
/** Is there genuinely more of a horizontal strip to scroll to?
 *
 *  Ten call sites were a bare `<ScrollView horizontal showsHorizontalScrollIndicator={false}>`, which
 *  suppresses the only affordance the platform gives away for free — so a row of chips was sliced
 *  mid-glyph at the viewport edge with nothing to indicate there was more (BUG-026). `HStrip` fades its
 *  trailing edge instead, and this decides *whether* to: only when the content really is wider than the
 *  strip, and only until the end is reached, so the fade can never suggest more than there is. The
 *  `+ 1` / `- 1` slack absorbs the sub-pixel noise in measured layout widths, which would otherwise make
 *  the fade blink on and off as a row reflows. */
export function stripHasMore(contentW: number, viewW: number, offsetX: number) {
  return contentW > viewW + 1 && offsetX < contentW - viewW - 1;
}

/** An hour label's line box on the Week scale, at `s: 11.5` — `Txt` sets `lineHeight: round(size * 1.18)`. */
export const HOUR_LH = Math.round(11.5 * 1.18);
/** Where an hour label sits on the Week grid.
 *
 *  Each label was absolutely positioned at `i * 60 * PX - 5`, i.e. centred on its own rule line. That is
 *  right for every rule *except the last one*: the final rule sits on the grid's bottom edge at `y = H`,
 *  so the label was centred there too and half of it hung below the grid — 465 dp against a grid 456 dp
 *  tall on the shipped timetable — and the card's hand-drawn border ran straight through the glyph. The
 *  last label is therefore pulled up to sit fully inside, `2 dp` clear of the edge. Every other label is
 *  returned untouched, so the axis does not shift. */
export function hourTop(i: number, H: number, PX: number, lh = HOUR_LH) {
  const natural = i * 60 * PX - 5, cap = H - lh - 2;
  /* Only the pull-up is floored at zero. Clamping the natural position too would drag the *first* label
     down by its own 5 dp offset — a real shift of a label that was never clipped, to defend against a
     grid shorter than one label, which `start`/`end` make unreachable (they span at least 8 hours). */
  return natural <= cap ? natural : Math.max(0, cap);
}

/** Metrics for the attendance heatmap's "one row per subject" strip (Stats → "Attendance, last 4 weeks").
 *
 *  The row is a fixed number of equal day-cells beside a subject label, and both were hard-coded pixel
 *  widths: a 70 dp label and 11 dp cells with a 2 dp gap. 28 cells do not fit in 70 + 28×13 = 434 dp, so
 *  on every subject row the **last cell was sliced in half by the card's right border** — measured on
 *  device, the final cell spanned x 1034–1039 while the border sat at x 1035.
 *
 *  The cells are sized from the width the card actually has instead, and the label takes a capped share
 *  of what is left. `cell` never falls below `MIN_CELL`, and if even that does not fit, `label` shrinks
 *  to whatever is left rather than pushing a cell off the edge. */
export const HEAT_GAP = 2;
export const HEAT_CELL_H = 18;
export const HEAT_LABEL_MAX = 96;
export const HEAT_MIN_CELL = 5;
export interface HeatRow { label: number; cell: number; fits: boolean }
export function heatRow(avail: number, days: number): HeatRow {
  const gaps = HEAT_GAP * (days - 1);
  const label = Math.min(HEAT_LABEL_MAX, Math.max(44, Math.round(avail * 0.28)));
  const cell = Math.max(HEAT_MIN_CELL, Math.floor((avail - label - HEAT_GAP - gaps) / days));
  /* Below ~360 dp a full-height label and `HEAT_MIN_CELL` cells cannot both fit. The days are the data
     and the label is also on the row's accessibility label, so the label is what gives way — it shrinks
     to exactly the room left over rather than pushing the 28th cell over the card's edge again. */
  const room = avail - HEAT_GAP - days * cell - gaps;
  return room < label ? { label: Math.max(0, room), cell, fits: true } : { label, cell, fits: true };
}

/** Dynamic type ceiling, applied per-call as `maxFontSizeMultiplier={FS}`.
 *
 *  `allowFontScaling` is on everywhere and prompt.md V14 only requires the layout to survive Android's
 *  1.3x font scale. Boxes whose size is fixed in the design cannot grow with the glyphs — a 28 dp attendance
 *  cell, a 52x66 dp day cell, a 66 dp week strip cell, the 44 dp sheet header row — so at a 2.0x system
 *  setting they either clip the text or push the row's neighbours off the screen. Those call sites cap at FS.
 *  Prose, headings, body copy and anything already measured in `numberOfLines` stay uncapped, so the
 *  accessibility win is kept wherever the layout can actually absorb it.
 *
 *  Why 1.4 and not 1.3: V14 asks for 1.3x to survive, and 1.4 leaves a little headroom for the fonts whose
 *  natural line box is already taller than their point size (Permanent Marker at 1.25, Special Elite at 1.18).
 *  A fixed cell sized for the unscaled glyph still clears at 1.4x but not at 2.0x, so 1.4 is the point where
 *  the cap starts costing real accessibility rather than buying anything. `Btn` and `Chip` are deliberately
 *  NOT capped: their height is a `minHeight`, so they grow with the text instead of clipping it. */
export const FS = 1.4;
