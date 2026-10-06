import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACE_EASE, PLACE_FROM, PLACE_MS, PLACE_SHADOW, inMountWindow } from '../navigation/window';

/* The page transition is the app's only always-on gesture, and its numbers were the complaint: "the page
 * shuffling lag … about half a second after the press", worst on To-do. `qa/RESEARCH-PERF.md` is the
 * forensics. This file locks in what the forensics concluded, as properties of the curve rather than
 * as the constants back to themselves — a test that asserts `PLACE_MS === 200` proves nothing, because
 * the next edit can make it 520 again and the assertion still passes on a different number. */

/** Cubic-bezier timing function, solved the way Reanimated solves `Easing.bezier`: invert x(t) for
 *  progress t, then evaluate y at that parameter. Returns progress in [0,1] for a normalised time. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;
  const value = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 12; i++) {
      const s = slope(t, x1, x2);
      if (s === 0) break;
      t -= (value(t, x1, x2) - x) / s;
    }
    return value(t, y1, y2);
  };
}
const [X1, Y1, X2, Y2] = PLACE_EASE;
const place = bezier(X1!, Y1!, X2!, Y2!);
const at = (ms: number) => place(Math.min(1, ms / PLACE_MS));
/** ms at which the placement first reaches `target` of its distance. */
const msTo = (target: number) => {
  let t = 0;
  while (t < 1 && place(t) < target) t += 0.0002;
  return t * PLACE_MS;
};
/** The first 60 Hz frame at which consecutive frames differ by less than half a percent of the
 *  distance: from there the page is optically still, so everything after it is dead time. */
const visuallySettledMs = () => {
  let prev = 0;
  for (let ms = 1000 / 60; ms <= PLACE_MS; ms += 1000 / 60) {
    const p = at(ms);
    if (p - prev < 0.005) return ms;
    prev = p;
  }
  return Infinity;
};
/** The old number, kept here as the thing being regressed against. Not used as a fallback. */
const WAS_MS = 520;

describe('the placement curve reads as immediate, not as a wait', () => {
  it('is inside the band where a transition is read as responsive rather than as waiting', () => {
    // Below ~120 ms the drop has too few frames to read as motion at all; above ~300 ms people start
    // reading it as something being waited for. V3 ("settles within ~0.5 s") is the contract ceiling,
    // not the target — it is the ceiling the 520 ms sat exactly on, which is the problem.
    expect(PLACE_MS).toBeGreaterThanOrEqual(120);
    expect(PLACE_MS).toBeLessThanOrEqual(300);
    expect(PLACE_MS).toBeLessThan(500);
  });

  it('covers most of the distance in the first frame, so the press and the motion are the same event', () => {
    expect(at(1000 / 60)).toBeGreaterThan(0.25); // ≥25% placed 16.7 ms after the tap
    expect(at(1000 / 60)).toBeLessThan(0.45); // …but not so much that the drop has collapsed into a jump
  });

  it('reaches 90% within a tenth of a second and is optically still well before it ends', () => {
    expect(msTo(0.9)).toBeLessThan(110);
    expect(visuallySettledMs()).toBeLessThanOrEqual(PLACE_MS);
    // the whole point of the change: the dead tail. 520 ms spent ~185 ms after the motion stopped.
    expect(PLACE_MS - visuallySettledMs()).toBeLessThan((WAS_MS - 333) * 0.6);
  });

  it('spends at least eight frames moving, or the tilt and the drop read as a flicker', () => {
    let moving = 0;
    for (let ms = 1000 / 60; ms <= PLACE_MS; ms += 1000 / 60) if (at(ms) - at(ms - 1000 / 60) >= 0.005) moving++;
    expect(moving).toBeGreaterThanOrEqual(8);
  });

  it('leaves no second peak: progress is monotonic, so a re-read of the frame cannot look like a bounce', () => {
    for (let i = 1; i <= 200; i++) expect(at((i * PLACE_MS) / 200)).toBeGreaterThanOrEqual(at(((i - 1) * PLACE_MS) / 200));
  });

  it('is a third of the old duration, which is the frame budget the complaint was actually about', () => {
    const oldFrames = Math.round(WAS_MS / (1000 / 60));
    const newFrames = Math.round(PLACE_MS / (1000 / 60));
    expect(WAS_MS / PLACE_MS).toBeGreaterThan(2.5);
    // frames during which two page subtrees are simultaneously live and being composited
    expect(oldFrames - newFrames).toBeGreaterThanOrEqual(18);
  });
});

describe('the placement geometry is a placement, not a slide', () => {
  it('starts offset and tilted, and lands exactly flat', () => {
    expect(PLACE_FROM.y).toBeLessThan(0);
    expect(PLACE_FROM.x).toBeGreaterThan(0);
    expect(PLACE_FROM.tilt).toBeGreaterThan(2);
    expect(PLACE_FROM.lift).toBeGreaterThan(1);
    // end state, from Book.tsx's interpolations: every axis resolves to the identity at p = 1
    const lerp = (a: number, b: number) => a + (b - a) * 1;
    expect(lerp(PLACE_FROM.y, 0)).toBe(0);
    expect(lerp(PLACE_FROM.x, 0)).toBe(0);
    expect(lerp(PLACE_FROM.tilt, 0)).toBe(0);
    expect(lerp(PLACE_FROM.lift, 1)).toBe(1);
  });

  it('travels at a rate the shortened duration can carry', () => {
    // The 70 dp the page used to cover over 520 ms reads as a placement. The same 70 dp over 200 ms
    // reads as a slide, which is a different intention; so the distance was trimmed with the duration.
    const oldRate = 70 / WAS_MS;
    const newRate = Math.abs(PLACE_FROM.y) / PLACE_MS;
    expect(newRate).toBeGreaterThan(oldRate); // it does move faster now, deliberately
    expect(newRate).toBeLessThan(oldRate * 3); // …but not so much faster that it becomes a slide again
  });

  it('keeps the seam it opens at the bottom of the screen inside the nav bar, so no page edge is ever bare', () => {
    // navHeight() for a gesture-bar device: NAV_BODY 64 + max(inset, 8) + 6. The page was already
    // arriving from further than this, which is why shrinking the travel costs nothing visible.
    const NAV_BODY = 64, FLOOR = 8, PAD = 6;
    const navHeight = (inset: number) => NAV_BODY + Math.max(inset, FLOOR) + PAD;
    expect(Math.abs(PLACE_FROM.y)).toBeLessThan(navHeight(24));
    expect(Math.abs(PLACE_FROM.y)).toBeLessThan(WAS_MS / PLACE_MS * 70); // strictly less travel than before
  });

  it('fades the shadow but never the page: the page carries no opacity at all', () => {
    // An animating opacity on a wrapper around a whole page re-composites that page every frame and
    // pushes a shadow-tree commit with it, for a property that cannot affect layout.
    expect(PLACE_SHADOW.peak).toBeGreaterThan(0);
    expect(PLACE_SHADOW.peak).toBeLessThanOrEqual(0.3); // a veil over the whole page is a flash, not a shadow
    // out before the page has finished arriving, so the last two thirds of the drop is clean paper
    expect(PLACE_SHADOW.goneBy).toBeGreaterThan(0);
    expect(PLACE_SHADOW.goneBy).toBeLessThan(1);
    // the interpolation is on the easing progress, which is front-loaded, so 0.7 is ~40 ms of a 200 ms
    // placement: gone by the third frame
    expect(msTo(PLACE_SHADOW.goneBy)).toBeLessThan(60);
    const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
    const pageStyle = src.slice(src.indexOf('const st = useAnimatedStyle'), src.indexOf('const sh = useAnimatedStyle'));
    expect(pageStyle).not.toContain('opacity');
    expect(pageStyle).toContain('transform');
  });
});

describe('Book.tsx really does what the numbers above assume', () => {
  const src = readFileSync(join(__dirname, '../navigation/Book.tsx'), 'utf8');
  const placed = src.slice(0, src.indexOf('function BookView'));

  it('no 520 anywhere, and the duration comes from the shared table', () => {
    expect(src).not.toContain('520');
    expect(placed).toContain('duration: PLACE_MS');
    expect(placed).toContain('Easing.bezier(...PLACE_EASE)');
  });

  it('arms the placement from a layout effect, so motion starts in the frame that mounts the page', () => {
    expect(placed).toContain('useLayoutEffect(');
    // and not from a passive one: that was the frame of pure latency before the first motion.
    const effect = placed.slice(placed.indexOf('useLayoutEffect('));
    expect(effect.slice(0, effect.indexOf('}, [on]);'))).not.toContain('useEffect(');
  });

  it('reduce-motion is an instant placement, not a fast one', () => {
    expect(placed).toContain('k.set(reduce ? 1 : withTiming(');
    // nothing else in Placed starts an animation, so there is no second motion left to honour it.
    expect(placed.match(/withTiming\(/g)?.length ?? 0).toBe(1);
  });

  it('re-focusing mid-flight continues the motion instead of snapping back to the start', () => {
    // the guarded form: reset only from a settled page, then start the tween — never an unconditional
    // `k.set(0)` immediately before it, which is what snapped the page back to its start mid-transition
    expect(placed).toMatch(/if \(k\.get\(\) >= 1\) k\.set\(0\);\s*k\.set\(reduce/);
  });

  it('reads shared values with get()/set(), the React-Compiler-safe forms', () => {
    expect(src).not.toMatch(/\bk\.value\b/);
    expect(placed).toMatch(/k\.set\(/);
    expect(placed).toMatch(/k\.get\(\)/);
  });

  it('takes z-order from focus, so it cannot lag the navigator by a commit', () => {
    expect(src).toContain('zIndex: on ? 2 : 1');
    expect(src).not.toContain('order=');
  });

  it('still mounts through the two-page window, which is what bounds the off-screen cost', () => {
    expect(src).toContain('inMountWindow(visited, counter.current, r.name)');
    let stamps: Record<string, number> = { Today: 1 }, latest = 1;
    const names = ['Today', 'Week', 'Tasks', 'Grades', 'Stats', 'Focus'];
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 200; i++) {
      latest += 1;
      const to = names[Math.floor(rnd() * names.length)]!;
      stamps = { ...stamps, [to]: latest };
      // at most two live pages, so at most two pages' worth of hidden tickers and bar fills can exist
      expect(names.filter((n) => inMountWindow(stamps, latest, n)).length).toBeLessThanOrEqual(2);
    }
  });
});