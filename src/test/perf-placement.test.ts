import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACE_EASE } from '../navigation/window';

/* The page swap is the app's only always-on gesture, and its cost was the complaint: pages arrived
 * "sooo long" after the press, worst on To-do.
 *
 * The answer was not to shorten the motion — it was proven FRAME FOR FRAME that the motion was not
 * the thing that made it feel fast. `PLACE_MS` went 520 → 200 → 160 and the report kept coming, so
 * the variable was the drop itself, not its length: 70 dp of travel plus a tilt plus a scale plus a
 * shadow overlay on a page nobody asked to move. It engaged the app's one always-mounted cost —
 * six full-screen pages, each with a pattern, a grain tile and a blended photograph — by sliding a
 * new page ON TOP of the old one and compositing both for ten frames.
 *
 * So the swap is a cut. This file locks in what makes that cut correct: that it costs no animation
 * at all, that the tab tap still lands in one commit, and that the page it shows is the one on top
 * in that same commit.
 */
const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');

describe('the page swap is a cut, and costs no animation', () => {
  it('no duration constant survives, and the swap is not gated on one', () => {
    // There is no `PLACE_MS` in the budget file any more: a cut has no length, and keeping the
    // constant would only invite someone to re-attach a motion to a number that reads as tuning.
    const win = readFileSync(join(__dirname, '../navigation/window.ts'), 'utf8');
    expect(win).not.toContain('PLACE_MS');
    expect(win).not.toContain('PLACE_FROM');
    expect(win).not.toContain('PLACE_SHADOW');
    expect(win).not.toContain('520');
  });

  it('the page carries no transform property at all — it does not travel, tilt or lift', () => {
    // An animated `transform` on a wrapper around a whole page is the one property this codebase
    // concluded a page must never have. What replaced the drop replaced ALL of them, not just the
    // ones that are cheap.
    const placed = src.slice(src.indexOf('function Placed({'), src.indexOf('function BookView'));
    expect(placed).not.toContain('transform');
    expect(placed).not.toContain('rotate');
    expect(placed).not.toContain('scale');
    expect(placed).not.toContain('opacity');
  });

  it('neither is there a shadow overlay to fade, which is what removed the re-rasterised fade', () => {
    // The shadow was a leaf with a solid colour over the whole page — cheap, but it was also the one
    // animated opacity left in the swap, and an opacity on something that big is a re-composite.
    expect(src).not.toContain('c.shadow');
    expect(src).not.toContain('withTiming');
    expect(src).not.toContain('useAnimatedStyle');
    expect(src).not.toContain('useSharedValue');
  });

  it('the page swap is a display flip, and focus decides it independently of the store', () => {
    expect(src).toContain("display: on ? 'flex' : 'none'");
    // the draw gate and the z-order both read the navigator's own index, never `route`
    expect(src).toContain('on={i === state.index}');
    expect(src).toContain('zIndex: on ? 2 : 1');
    // no `instant` prop any more: with no drop there is nothing to park
    expect(src).not.toContain('instant');
    expect(src).not.toContain('landed');
  });

  it('the tab tap writes the store and moves the navigator in ONE event, so it lands in one commit', () => {
    // The cut can only be instant if the commit that focuses the page also sets the store's route.
    // Two writes in two statements inside one handler is what `before` batching looked like, and it
    // is the property that survives the removal of the motion.
    const line = src.split('\n').find((l) => l.includes('act.go(t.name)'))!;
    expect(line).toContain('navigation.navigate(');
    expect(line).toContain('onPressIn=');
    expect(src).not.toContain('onPress={() => { act.go');
  });

  it('the focus flip is the ONLY visual work a tap does to a page, and it is render-phase', () => {
    // There is no layout effect on the page any more, because there was no motion to arm: the page
    // is simply in the tree when focused. This is the payoff of a cut — no pass between the press
    // and the paint just to start something.
    const placed = src.slice(src.indexOf('function Placed({'), src.indexOf('function BookView'));
    expect(placed).not.toContain('useLayoutEffect');
    expect(placed).not.toContain('setTimeout');
    expect(placed).not.toContain('setShown');
    expect(placed).not.toContain('useRef');
  });

  it('hidden pages still leave the DRAW tree, so six pages never composite at once', () => {
    // The overdraw was the reason the swap ever needed an overlay at all: ~20 full-screen fills per
    // frame with all six pages drawn. `display: 'none'` is what takes a page out on Android.
    expect(src).toContain("display: on ? 'flex' : 'none'");
  });

  it('the shared curve survives for everything that IS worth animating', () => {
    // `PLACE_EASE` is deliberately kept: `kit.tsx`'s `EASE` is literally this curve, so a chip and
    // a sheet still decelerate with the same hand. Deleting it with the drop would have cost the
    // app its single settle.
    expect(PLACE_EASE).toEqual([0.2, 0.9, 0.25, 1]);
    const kit = readFileSync(join(__dirname, '../ui/kit.tsx'), 'utf8');
    expect(kit).toContain('export const EASE = Easing.bezier(0.2, 0.9, 0.25, 1);');
  });
});
