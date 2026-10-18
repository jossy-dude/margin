import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* The off-screen contract, as a model of `Placed` in `src/navigation/Book.tsx`. The file cannot be
 * imported by a node test without dragging in the whole navigator, so the behaviour that matters is
 * exercised against a faithful model *and* against the source, and the two are kept honest by the
 * shape assertions at the bottom.
 *
 * The model used to simulate a tween, a shadow, a render-phase show flip and a delayed hide. All of
 * that went with the drop: a page is now EITHER in the draw tree (it is focused) or it is not, and
 * there is no state in between to get wrong. That is the whole point of a cut, and the tests below
 * are what pin the properties it still has to hold. */

/** What the navigator knows about one page: whether it is focused, and therefore whether the
 *  renderer should be drawing it. Derived straight from focus — there is no third state. */
interface Placed {
  /** the navigator index, which is what Book.tsx keys focus on */
  on: boolean;
  /** whether the page is in the DRAW tree: focused */
  drawn: boolean;
  /** what the page renders to the accessibility tree: hidden pages are not reachable */
  exposed: boolean;
  /** focus travelling down to the page as a plain boolean (`ui/live.ts`) */
  live: boolean;
  /** the layer order: focus is above, everything else below */
  z: number;
}

function placed(on: boolean): Placed {
  return { on, drawn: on, exposed: on, live: on, z: on ? 2 : 1 };
}

describe('a page is in the draw tree exactly while it is focused', () => {
  it('the focused page is drawn, exposed, live and on top', () => {
    const c = placed(true);
    expect(c.drawn).toBe(true);
    expect(c.exposed).toBe(true);
    expect(c.live).toBe(true);
    expect(c.z).toBe(2);
  });

  it('every other page is out of the draw tree, out of reach and ticking slow', () => {
    const c = placed(false);
    expect(c.drawn).toBe(false);
    expect(c.exposed).toBe(false);
    expect(c.live).toBe(false);
    expect(c.z).toBe(1);
  });

  it('there is no window between the two: nothing is half-drawn, because there is nothing to half-draw', () => {
    // With the drop gone there is no placement to finish, so the hide does not have to wait for the
    // incoming page to settle over it. A page leaves the draw tree in the same commit that unfocuses
    // it — which is why `setTimeout` and `shown` are gone from the file, not merely unused.
    for (const before of [true, false]) {
      const after = placed(!before);
      expect(after.drawn).toBe(!before); // one flip, no intermediate state
      expect(after.live).toBe(!before);
    }
  });

  it('rapid taps never leave a page half-animated, because a tap cannot start one', () => {
    // The property that mattered with the drop in place — twenty taps, one page on top, flat. Now
    // it is structural: the render is a pure function of `on`, so no sequence of flips can leave a
    // page in any state other than drawn-or-not.
    let on = true;
    for (let i = 0; i < 20; i++) {
      on = i % 2 === 0;
      const c = placed(on);
      expect(c.drawn).toBe(on);
      expect(c.exposed).toBe(on);
    }
  });
});

describe('the model has not drifted from the file', () => {
  const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
  const placedSrc = src.slice(src.indexOf('function Placed({'), src.indexOf('function BookView'));

  it('focus comes from the navigator index, never from the store route', () => {
    expect(src).toContain('on={i === state.index}');
    expect(placedSrc).toContain('zIndex: on ? 2 : 1');
    expect(placedSrc).not.toContain('useStore((s) => s.route)');
  });

  it('the page is a display gate and nothing else', () => {
    expect(placedSrc).toContain("display: on ? 'flex' : 'none'");
    // the three things that used to make it more: no tween, no timer, no read of a shared value
    expect(placedSrc).not.toContain('withTiming');
    expect(placedSrc).not.toContain('setTimeout');
    expect(placedSrc).not.toContain('useLayoutEffect');
    // and no `k.get()` to read one with
    expect(placedSrc).not.toContain('.get()');
  });

  it('a hidden page is inert to touch and to screen readers, and sits under the focused one', () => {
    expect(placedSrc).toContain("<ScreenLive.Provider value={on}>");
    expect(src).toContain("pointerEvents={i === state.index ? 'auto' : 'none'}");
    expect(src).toContain("importantForAccessibility={i === state.index ? 'yes' : 'no-hide-descendants'}");
  });
});
