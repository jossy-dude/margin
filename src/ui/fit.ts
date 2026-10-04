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
