import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TOAST_CLEAR, navHeight } from '../ui/fit';

const book = readFileSync(join(__dirname, '..', 'navigation', 'Book.tsx'), 'utf8');
const overlay = readFileSync(join(__dirname, '..', 'ui', 'Overlay.tsx'), 'utf8');
const kb = readFileSync(join(__dirname, '..', 'ui', 'keyboard.ts'), 'utf8');

/* The defect (BUG-028) was that the floating chrome kept floating while the keyboard was up. Measured at
   411 dp with the keyboard showing: the nav's bottom stroke sat at y 1485 and the
   keyboard's top edge at y 1521 — a 36 px gap, i.e. exactly `navInset`'s 14 dp. So the nav was already at
   the bottom of the *visible* area; what was wrong is that anything floats
   over the content at all. The + button occupied y 1131-1278, squarely on a task card's text. */

describe('floating chrome yields to the keyboard (BUG-028)', () => {
  it('the nav is hidden while the keyboard is up, and only for that reason added', () => {
    // `hideNav` already covered the Focus route; the keyboard is the second reason.
    expect(book).toMatch(/const hideNav = cur === 'Focus' \|\| kbUp;/);
    expect(book).toMatch(/!hideNav && \(/);
  });

  it('the + button is hidden while the keyboard is up', () => {
    // W1/M6: the route half of this gate is now a selector that returns a PRIMITIVE
    // (`fabAllowed`), so tapping a tab re-renders the overlay only when this boolean actually flips;
    // `showFab` still means "not behind a sheet, not on Focus, and no keyboard", which is what the
    // assertion below pins.
    expect(overlay).toMatch(/const fabAllowed = useStore\(\(s\) => !s\.sheet && s\.route !== 'Focus'\)/);
    expect(overlay).toMatch(/showFab = fabAllowed && !kbUp/);
    expect(overlay).toContain('showFab && (');
    expect(overlay).not.toContain('useStore((s) => s.route)'); // the object-shaped route read is gone
  });

  it('the nav was already at the bottom of the visible area, so this hides rather than repositions it', () => {
    // Non-vacuity for the diagnosis, and the reason the fix is a hide and not a reposition.
    // `adjustResize` shrinks the window, so `bottom: 0` tracks the keyboard's top edge and the only gap
    // below the bar is its own inset padding. Measured on device: bar bottom stroke at y 1485, keyboard
    // top at y 1521 — 36 px apart, i.e. ~14 dp at this density. That is the nav bar's own breathing
    // room, not a mis-position, so "move the bar" would have treated a correct position as the bug.
    const DP_PX = 1080 / 411.43;
    expect(36 / DP_PX).toBeGreaterThan(8); // the measured gap is dp-scale…
    expect(36 / DP_PX).toBeLessThan(24); // …and far too small to be a keyboard the app failed to clear
    expect(navHeight(14)).toBe(84); // so `bottom: 0` is already sitting on the keyboard's edge
  });

  it('the toast lifts clear of the nav while the keyboard is up, so it is not stranded either', () => {
    // The toast is the same floating chrome; leaving it behind would have been a half-fix of one defect.
    expect(overlay).toMatch(/kbUp \? Math\.max\(ins\.bottom, 8\) \+ TOAST_CLEAR : toastBottom\(ins\.bottom\)/);
    expect(TOAST_CLEAR).toBe(20);
    // …and it sits below where the nav's top edge would be, since the nav is not drawn at all.
    expect(Math.max(14, 8) + TOAST_CLEAR).toBeLessThan(navHeight(14));
  });

  it('the hook listens for both edges of the keyboard and unsubscribes', () => {
    expect(kb).toMatch(/Keyboard\.addListener\('keyboardDidShow'/);
    expect(kb).toMatch(/Keyboard\.addListener\('keyboardDidHide'/);
    // A leaked pair of listeners on a hook used by the always-mounted chrome would re-fire forever.
    expect(kb).toMatch(/return \(\) => \{ show\.remove\(\); hide\.remove\(\); \};/);
  });

  it('both consumers read one shared hook, and neither subscribes to the keyboard itself', () => {
    expect(book).toMatch(/kbUp = useKeyboardUp\(\)/);
    expect(overlay).toMatch(/const kbUp = useKeyboardUp\(\), showFab/);
    // The regression this guards is the two pieces of chrome each deciding for themselves — one hiding
    // and one not, or one leaking a listener pair. `ui/Sheet.tsx` also listens, but legitimately: it
    // measures the keyboard's *height* to lift itself, which is a different question from visibility.
    for (const f of [book, overlay]) expect(f).not.toMatch(/keyboardDidShow/);
    const listeners = walk(join(__dirname, '..')).filter((f) => !f.includes(`${join(__dirname, '..')}/test/`) && /keyboardDidShow/.test(readFileSync(f, 'utf8')));
    expect(listeners.map((f) => f.replace(`${join(__dirname, '..')}/`, ''))).toEqual(['ui/Sheet.tsx', 'ui/keyboard.ts']);
  });
});

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}