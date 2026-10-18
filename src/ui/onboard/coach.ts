import { useEffect, useRef } from 'react';
import type { View } from 'react-native';
import { getState, type RouteName, type State } from '../../store/store';

/**
 * What the tour is made of: a list of real controls, and the questions the app answers about them.
 *
 * The tour used to be five illustrated screens that *depicted* the app — a drawing of the nav bar, a
 * drawing of the dial, a drawing of a crumpled row. Everything in those drawings had to be kept in
 * step with the real thing by hand, and every one of them could drift while still looking right
 * (`ui/onboard/art.tsx` copied a dial geometry `screens/Focus.tsx` had already thrown out). They are
 * gone, and so is that class of bug: a step here names a control that exists, is measured through the
 * same `measureInWindow` the Focus dial uses to place its own centre, and is acted on by the user's
 * own finger on the real screen.
 *
 * **Nothing in this file draws anything.** `Coach.tsx` owns the paper; this file owns the two things
 * that have to be right for the drawing to land on the right control: where the control is, and what
 * the app has to say for the step to be over.
 */

/** A rectangle in WINDOW coordinates — the space `measureInWindow` reports in and the space
 *  `useWindowDimensions` describes, so the two can be subtracted from one another directly. */
export interface CoachBox { x: number; y: number; w: number; h: number }

/** The id of the one step whose target lives *inside* a sheet rather than on a page. The coach puts
 *  away any sheet a previous step left open when it advances (`Coach.tsx`), and this is how it knows
 *  not to do that to the step that is deliberately standing in one. Named rather than written twice,
 *  because a step whose target id and the coach's exception disagree is a tour that closes the sheet
 *  it is in the middle of explaining. */
export const SHEET_TARGET = 'sheet-close';

export interface TourStep {
  /** Stable id: the progress label counts the steps and the tests look a step up by this. */
  id: string;
  /** Marker-sized heading. Also what Next announces as its destination. */
  heading: string;
  body: string[];
  /** What the last step says instead when the tour is a replay rather than a first run: the sample
   *  semester is not something to offer removal of to someone who has already been through here. */
  replayBody?: string[];
  /** The page the target lives on. The tour puts the app there itself before measuring, so a step can
   *  be reached by Next as honestly as by the tap it is waiting for. */
  route?: RouteName;
  /** Something the step needs to be *visible*, run on entry: the one case today is a sheet that has to
   *  be open before its ✕ can be pointed at. It calls the app's own action, never a stand-in. */
  enter?: (s: State) => void;
  /** The live control this step rings. Absent = the step is a plain card (the last one is). */
  target?: string;
  /** `true` when the app has reached the state this step is about — the step then advances on its own.
   *  Next and Skip still work on every step, so a predicate can never trap anyone. `startPlanMin` is
   *  the dial's setting when the tour mounted, which is what makes "you moved it" a real comparison. */
  await?: (s: State, startPlanMin: number) => boolean;
  /** The masthead. Only the first step carries it — the brand moment costs four lines. */
  brand?: boolean;
  /** Offers the destructive "Start empty" close. Rendered only on a genuine first run; a replay from
   *  Settings never offers it (see `hasRealRows`). */
  empty?: boolean;
  /** The two minute-steps under the dial. The dial is the one control in the app with no visible ±,
   *  so the callout carries the same write its accessibility actions make. */
  nudge?: boolean;
}

/** One live control, addressed by id.
 *
 *  A ref is stored rather than a node so the slot survives the control's own re-renders, and the map
 *  is a module registry rather than a context because the targets live in six files that share no
 *  ancestor with the overlay — `ui/Overlay`, `ui/Sheet`, `navigation/Book`, `screens/Week`,
 *  `screens/Focus` and `screens/common`. Those files pay one line each: a hook and a `ref`. */
type Slot = { current: View | null };
const slots = new Map<string, Slot>();

/** Register a control as a tour target and get the ref to attach to it. `id` is optional so a shared
 *  component (a task card, rendered on two pages) can be handed a slot only by the page the tour
 *  actually points at — otherwise the first page to mount would take the slot and the ring would end
 *  up on a row of a page that is not on screen.
 *
 *  **First wins.** `common.tsx`'s task card is one component rendered once per row, so every row asks
 *  for the same slot; the first row to mount takes it and the rest stand down. Without that rule the
 *  map would end up pointing at whichever row React happened to reconcile last, and unmounting a
 *  single row would blank the slot while nine rows were still on screen. */
export function useCoachSlot(id?: string, slot?: Slot) {
  const own = useRef<View | null>(null);
  const ref = slot ?? own;
  useEffect(() => {
    if (!id || slots.has(id)) return;
    slots.set(id, ref);
    return () => { if (slots.get(id) === ref) slots.delete(id); };
  }, [id, ref]);
  return ref;
}

/** Where a registered control is, right now, in window coordinates. `null` means "not on screen":
 *  a page the user skipped past, an empty timetable, a list with nothing in it. The overlay draws no
 *  ring in that case and the callout still reads — a missing hole is a worse tour than a plain card,
 *  and a hole in the wrong place is worse than both. */
export function measureSlot(id: string): Promise<CoachBox | null> {
  const node = slots.get(id)?.current;
  const measure = node ? node.measureInWindow : undefined;
  if (typeof measure !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      measure.call(node, (x, y, w, h) => resolve(w > 0 && h > 0 ? { x, y, w, h } : null));
    } catch { resolve(null); }
  });
}

/** Two readings of the same control. Exact equality on purpose: the whole reason the overlay reads a
 *  second time is to notice one pixel of movement — the sheet that has not finished arriving, the list
 *  that has not finished laying out. */
export const sameBox = (a: CoachBox | null, b: CoachBox | null): boolean =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/** The four rectangles of scrim left once a hole is cut out of it.
 *
 *  Four views and not an SVG mask, because the app already paints its dim layers as views (`Sheet`'s
 *  dim, `Focus`'s dark-mode veil) and a mask would be a fifth way of drawing paper in a repo that has
 *  one. The union of the four is exactly the window minus the padded hole — which is the property the
 *  test asserts, since anything less than full coverage is a place a touch can reach the app through
 *  a tour that said it was modal. */
export function cutRects(box: CoachBox | null, W: number, H: number, pad: number): CoachBox[] {
  if (!box) return [{ x: 0, y: 0, w: W, h: H }];
  const x = Math.max(0, box.x - pad), y = Math.max(0, box.y - pad);
  const r = Math.min(W, box.x + box.w + pad), b = Math.min(H, box.y + box.h + pad);
  return [
    { x: 0, y: 0, w: W, h: y },
    { x: 0, y: b, w: W, h: H - b },
    { x: 0, y, w: x, h: b - y },
    { x: r, y, w: W - r, h: b - y },
  ];
}

/** The ring's own box: the control plus the breathing room the cut-out leaves around it. */
export const holeBox = (box: CoachBox | null, pad: number): CoachBox | null =>
  box ? { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 } : null;

/** Where the callout sits: under the hole when there is room, over it when there is not, and centred
 *  when there is no hole at all. `cardEst` is the card's height — measured by the overlay rather than
 *  guessed, because the copy is four lines long on one step and two on another, and a card that lands
 *  on top of the control it is explaining is worse than one that has to be measured.
 *
 *  The FAB and the tab bar live at the bottom of the screen, so "above" is not the odd case — it is
 *  half the tour — and both answers keep the card clear of the control the ring points at. */
export function cardTop(box: CoachBox | null, H: number, cardEst: number, insetTop: number, insetBottom: number): number {
  if (!box) return Math.max(insetTop, (H - cardEst) / 2);
  if (box.y + box.h + 12 + cardEst <= H - insetBottom) return box.y + box.h + 12;
  if (box.y - 12 - cardEst >= insetTop) return box.y - 12 - cardEst;
  /* Neither side fits — a tall control on a short screen. Take whichever side has more room and let
     the card run to its own edge; a card that stops short of the bottom is not a failure, and one
     that covers what it is talking about is. */
  return H - insetBottom - (box.y + box.h) >= box.y - insetTop ? Math.max(insetTop, box.y + box.h + 12) : insetTop;
}

/** Is there a row here that the user made? — the whole of the first-run test.
 *
 *  `demo: true` is stamped on every row the sample semester seeded (`data/seed.ts`), and is cleared by
 *  the first edit anyone makes to a row (`sheets/forms.tsx`), so "no row without it" means one of two
 *  things and both of them mean the same thing to a person: this planner is empty of anything they
 *  did, and the destructive close of the tour is one they can take. An upgrading device that has been
 *  collecting real marks for a term answers `true` here and is never offered it. */
export function hasRealRows(s: State = getState()): boolean {
  return s.courses.some((r) => !r.demo) || s.meetings.some((r) => !r.demo) || s.tasks.some((r) => !r.demo)
    || s.notices.some((r) => !r.demo) || s.marks.some((r) => !r.demo) || s.focus.some((r) => !r.demo);
}
