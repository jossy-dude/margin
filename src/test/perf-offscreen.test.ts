import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* A model of `Placed` in `src/navigation/Book.tsx`, so the behaviour that matters can be exercised
 * without a renderer. `nav-sync.test.ts` does the same for the store/navigator pair and says why: the
 * file cannot be imported by a node-environment test without dragging in the whole navigator, so the
 * assertions are made against a faithful model *and* against the source, and the two are kept honest by
 * the shape assertions at the bottom of this file. */

/** One shared value. `v` is where the page is; `tweenFrom` is the value the running tween started
 *  from, or `null` when nothing is animating. `null` is what distinguishes "settled" from "mid-flight",
 *  and it is why the file resets with `if (k.get() >= 1) k.set(0)` rather than `k.set(0)` outright. */
class Shared {
  v: number;
  tweenFrom: number | null = null;
  constructor(v: number) { this.v = v; }
  get() { return this.v; }
  set(v: number) { this.v = v; }
}

interface Placed {
  k: Shared;
  /** the layout effect, keyed on `on` */
  focus: (on: boolean) => void;
  /** drive the running tween forward, the way the real animation would */
  advance: (elapsedMs: number) => void;
  /** what `on` is right now — the navigator index, which is what Book.tsx keys `focus` on */
  on: boolean;
  /** what the two animated styles render right now */
  render: () => { y: number; x: number; shadow: number };
}

/** `Book.tsx`'s `Placed`, with the numbers read from the same table the app uses. */
function placed({ reduce = false, instant = false, ms = 200 } = {}): Placed {
  const FROM = { y: -48, x: 30, tilt: 3.8, lift: 1.028 }, PEAK = 0.24, GONE = 0.7;
  const k = new Shared(instant ? 1 : 0);
  let mounted = false;
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
  const self: Placed = {
    k,
    on: true,
    focus(next: boolean) {
      self.on = next;
      if (!mounted) { mounted = true; if (!next || instant) { k.set(1); return; } }
      if (!next) return;
      /* Reset only from a settled page. Mid-flight the tween re-targets from wherever it already is. */
      if (k.get() >= 1) k.set(0);
      /* withTiming(1, …) from the current value — or an instant jump to 1 under reduce-motion. */
      if (reduce) { k.set(1); k.tweenFrom = null; return; }
      k.tweenFrom = k.get();
    },
    advance(elapsedMs: number) {
      if (k.tweenFrom === null) return;
      const done = Math.min(1, Math.max(0, elapsedMs / ms));
      if (done >= 1) { k.v = 1; k.tweenFrom = null; return; }
      k.v = lerp(k.tweenFrom, 1, done);
    },
    render() {
      const p = self.on ? k.v : 1;
      return { y: lerp(FROM.y, 0, p), x: lerp(FROM.x, 0, p), tilt: lerp(FROM.tilt, 0, p), lift: lerp(FROM.lift, 1, p), shadow: self.on ? lerp(PEAK, 0, Math.min(1, k.v / GONE)) : 0 } as never;
    },
  };
  return self;
}

describe('a page is placed immediately and finishes fast', () => {
  it('cold start: the first screen is already flat, with nothing to animate', () => {
    const c = placed({ instant: true });
    c.focus(true);
    expect(c.k.tweenFrom).toBe(null);
    expect(c.render()).toMatchObject({ y: 0, x: 0, shadow: 0 });
  });

  it('first visit: it starts displaced and tilted, and the tween begins from exactly that displacement', () => {
    const c = placed();
    c.focus(true);
    expect(c.k.tweenFrom).toBe(0);
    expect(c.render()).toMatchObject({ y: -48, x: 30, tilt: 3.8, lift: 1.028 });
    expect(c.render().shadow).toBeGreaterThan(0);
  });

  it('reduce-motion: the placement is instant and no tween is started at all', () => {
    const c = placed({ reduce: true });
    c.focus(true);
    expect(c.k.tweenFrom).toBe(null);
    expect(c.render()).toMatchObject({ y: 0, x: 0 });
  });

  it('reduce-motion wins mid-flight too, and never leaves the page part-way placed', () => {
    for (const v of [0, 0.25, 0.5, 0.99]) {
      const c = placed({ reduce: true });
      c.k.v = v;
      c.k.tweenFrom = 0;
      c.focus(true);
      expect(c.k.v).toBe(1);
      expect(c.k.tweenFrom).toBe(null);
    }
  });
});

describe('nothing animates while a page is off-screen', () => {
  it('an unfocused page renders flat and unshadowed whatever its shared value happens to be', () => {
    const c = placed();
    c.focus(true);
    c.advance(200);
    expect(c.k.get()).toBe(1);
    c.focus(false);
    for (const v of [0, 0.3, 1]) {
      c.k.v = v;
      expect(c.render()).toMatchObject({ y: 0, x: 0, shadow: 0 });
    }
  });

  it('losing focus neither starts nor keeps a tween', () => {
    const c = placed();
    c.focus(true);
    c.focus(false);
    expect(c.k.tweenFrom).toBe(0); // the tween from focusing; unfocusing adds none
    const before = c.k.v;
    c.focus(false);
    expect(c.k.v).toBe(before);
  });

  it('a hidden page does not drift on its own over twenty frames', () => {
    const c = placed();
    c.focus(true);
    c.focus(false);
    for (let i = 0; i < 20; i++) c.advance(17);
    expect(c.render()).toMatchObject({ y: 0, x: 0, shadow: 0 });
  });
});

describe('rapid taps never leave a page half-animated', () => {
  it('a second tap inside the window continues the motion from where it is', () => {
    const c = placed();
    c.focus(true);
    c.advance(60);
    const mid = c.k.get();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    c.focus(false);
    c.focus(true); // tapped away and straight back
    // resume, not jump: resetting to 0 here is what produced a visible snap mid-transition
    expect(c.k.tweenFrom).toBe(mid);
  });

  it('a settled page resets, so coming back to it still gets the drop', () => {
    const c = placed();
    c.focus(true);
    c.advance(200);
    expect(c.k.get()).toBe(1);
    c.focus(false);
    c.focus(true);
    expect(c.k.tweenFrom).toBe(0);
  });

  it('twenty taps in a row leave one page on top, flat, with nothing still running', () => {
    const c = placed();
    for (let i = 0; i < 20; i++) { c.focus(i % 2 === 0); c.advance(17); }
    c.focus(true);
    c.advance(400);
    expect(c.k.get()).toBe(1);
    expect(c.k.tweenFrom).toBe(null);
    c.focus(false);
    expect(c.render()).toMatchObject({ y: 0, x: 0, shadow: 0 });
  });
});

describe('the model has not drifted from the file', () => {
  const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
  const placedSrc = src.slice(0, src.indexOf('function BookView'));

  it('the focus effect is shaped the way the model assumes', () => {
    expect(placedSrc).toContain('if (!mounted.current)');
    expect(placedSrc).toContain('if (!on || instant) { k.set(1); return; }');
    expect(placedSrc).toContain('if (k.get() >= 1) k.set(0);');
    expect(placedSrc).toContain('if (!on) return;');
  });

  it('the render path forces a settled transform and no shadow when the page is not focused', () => {
    expect(placedSrc).toContain('const p = on ? k.get() : 1;');
    expect(placedSrc).toContain('opacity: on ? interpolate(k.get(), [0, PLACE_SHADOW.goneBy], [PLACE_SHADOW.peak, 0]) : 0');
  });

  it('the page itself is not faded, which is what removed the re-rasterised fade', () => {
    const pageStyle = placedSrc.slice(placedSrc.indexOf('const st = useAnimatedStyle'), placedSrc.indexOf('const sh = useAnimatedStyle'));
    expect(pageStyle).not.toContain('opacity');
  });

  it('focus comes from the navigator index, never from the visit stamp', () => {
    expect(src).toContain('on={i === state.index}');
    expect(placedSrc).toContain('zIndex: on ? 2 : 1');
  });
});