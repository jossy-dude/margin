import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sheetFit } from '../ui/fit';

/* The break: the + FAB's form misbehaves when the soft keyboard comes up. `Sheet` sized itself from
   `useWindowDimensions().height`, assuming the JS window height is what shrinks for the keyboard. On the
   a 411 dp phone (`adjustResize` + edge-to-edge) it is not: the root view shrinks — nav bottom stroke at
   y 1485 against the keyboard top at y 1521, i.e. the bar sitting at the bottom of the *visible* area —
   while the window height stays full. So `lift = restH - H` read 0, `bottom` became a full keyboard
   height on top of a container that had already shrunk by one, and the sheet's top edge landed a full
   keyboard-height above the screen: grab handle, title, ✕ and the first field all clipped, footer
   floating with the page's dead space beneath it (qa/shots/d1_06_task_form_kbup.png vs
   d1_07_task_form_nokb.png). The same sizing-from-the-window family of the bug also bites on web,
   where the container can be shorter than the window with no keyboard event at all. */

const DP = 1080 / 411.43; // the device's px-per-dp, as measured in BUG-028
const dp = (px: number) => Math.round(px / DP);
const H_DEV = dp(2340);                       // window height, stays full with the keyboard up
const KB_DEV = dp(2340 - 1521);               // keyboard height, from the measured keyboard top edge
const BOX_DEV = H_DEV - KB_DEV;               // root view = window minus keyboard (adjustResize)

/** Where the sheet's top edge lands, in the container's own coordinates. Negative = clipped off the
 *  top of the screen, which is exactly how the break presented. */
const topEdge = (boxH: number, bottom: number, cap: number) => boxH - bottom - cap;

describe('sheet keyboard fit (Sheet hosts its own height)', () => {
  it('adjustResize (the device case): the sheet sits on the keyboard without a second lift', () => {
    const f = sheetFit({ H: H_DEV, boxH: BOX_DEV, restH: H_DEV, kb: KB_DEV, maxH: 0.93, insTop: 0 });
    expect(f.bottom).toBe(0);                 // the container already stops at the keyboard
    expect(f.cap).toBe(BOX_DEV);              // sized to the space that actually exists
    expect(topEdge(BOX_DEV, f.bottom, f.cap)).toBe(0); // header fully on screen
  });

  it('the OLD arithmetic, on the same numbers, is the reported break (non-vacuity for the diagnosis)', () => {
    const lift = 0;                            // restH - H: the window never shrank
    const bottom = Math.max(lift, KB_DEV) - lift;
    const cap = Math.min(H_DEV * 0.93, H_DEV - bottom);
    expect(bottom).toBe(KB_DEV);               // a full keyboard height on top of the shrink
    // …so the top edge is a keyboard-height off the top of the screen.
    expect(topEdge(BOX_DEV, bottom, cap)).toBeLessThan(-KB_DEV + 50);
  });

  it('adjustPan / edge-to-edge (container NOT shrunk): the sheet clears the keyboard itself', () => {
    const f = sheetFit({ H: H_DEV, boxH: H_DEV, restH: H_DEV, kb: KB_DEV, maxH: 0.93, insTop: 0 });
    expect(f.bottom).toBe(KB_DEV);
    expect(f.cap).toBe(H_DEV - KB_DEV);
    expect(topEdge(H_DEV, f.bottom, f.cap)).toBe(0);
  });

  it('web / missed event (container shrunk, NO keyboard event): the sheet still fits its container', () => {
    // The probe-emulated state: #root inset by 40%, `window.innerHeight` untouched, `kb` 0 because
    // RNW's Keyboard.addListener is a no-op. Before, `cap` came from the window and the sheet overflowed
    // the shrunk container with its header clipped off the top.
    const f = sheetFit({ H: 851, boxH: 511, restH: 851, kb: 0, maxH: 0.93, insTop: 0 });
    expect(f.bottom).toBe(0);                  // never negative, never pushed below the container
    expect(f.cap).toBe(511);                   // clamped to the container, not a share of 851
    expect(topEdge(511, f.bottom, f.cap)).toBe(0);
    // …while the old sizing would have thrown the header off the top by the shrunk-away height.
    const oldCap = Math.min(851 * 0.93, Math.max(0, 851 - 0 - 0));
    expect(topEdge(511, 0, oldCap)).toBeLessThan(0);
  });

  it('keyboard down: nothing moves — cap is the share of the window it always was', () => {
    const f = sheetFit({ H: 851, boxH: 851, restH: 851, kb: 0, maxH: 0.88, insTop: 47 });
    expect(f.bottom).toBe(0);
    expect(f.cap).toBe(Math.min(851 * 0.88, 851 - 47));
  });

  it('a safe-area inset never eats into the keyboard budget twice', () => {
    const f = sheetFit({ H: H_DEV, boxH: BOX_DEV, restH: H_DEV, kb: KB_DEV, maxH: 0.6, insTop: 24 });
    expect(f.bottom).toBe(0);
    expect(f.cap).toBe(Math.min(H_DEV * 0.6, BOX_DEV - 24));
    // the top edge clears the inset, whether the cap came from `maxH` or from the container
    expect(topEdge(BOX_DEV, f.bottom, f.cap)).toBe(BOX_DEV - f.cap);
    expect(topEdge(BOX_DEV, f.bottom, f.cap)).toBeGreaterThanOrEqual(24);
  });

  it('in every regime: bottom is never negative and the sheet never tops out of its container', () => {
    const cases = [
      { H: 851, boxH: 851, restH: 851, kb: 0 },
      { H: 851, boxH: 511, restH: 851, kb: 0 },   // web shrink, no event
      { H: H_DEV, boxH: BOX_DEV, restH: H_DEV, kb: KB_DEV }, // device adjustResize
      { H: H_DEV, boxH: H_DEV, restH: H_DEV, kb: KB_DEV },   // adjustPan
      { H: H_DEV, boxH: BOX_DEV, restH: H_DEV, kb: 0 },      // shrunk, event missed
      { H: H_DEV, boxH: H_DEV - KB_DEV + 40, restH: H_DEV, kb: KB_DEV }, // kb shorter than the shrink
    ];
    for (const c of cases) for (const maxH of [0.6, 0.62, 0.88, 0.93]) {
      const f = sheetFit({ ...c, maxH, insTop: 24 });
      expect(f.bottom).toBeGreaterThanOrEqual(0);
      expect(f.cap).toBeGreaterThanOrEqual(0);
      expect(f.cap).toBeLessThanOrEqual(c.boxH - f.bottom - 24 + 1e-9);
      expect(topEdge(c.boxH, f.bottom, f.cap)).toBeGreaterThanOrEqual(0);
    }
  });
});

/* The wiring: the arithmetic is only as good as the measurement feeding it, so the host that owns the
   container's real height is pinned too. */
const sheet = readFileSync(join(__dirname, '..', 'ui', 'Sheet.tsx'), 'utf8');

describe('Sheet.tsx feeds sheetFit its own laid-out height', () => {
  it('the sheet host measures itself with onLayout, not the window', () => {
    expect(sheet).toMatch(/onLayout=\{\(e\) => setBoxH\(e\.nativeEvent\.layout\.height\)\}/);
    // boxH initialises to the window height so the first frame is the old behaviour, and restH tracks
    // boxH (never H — tracking H is what let lift read 0 on the device).
    expect(sheet).toMatch(/\[boxH, setBoxH\] = useState\(H\)/);
    expect(sheet).toMatch(/if \(kb === 0 && boxH > restH\.current\) restH\.current = boxH/);
  });

  it('bottom and cap come from sheetFit and nowhere else', () => {
    expect(sheet).toMatch(/const \{ bottom, cap \} = sheetFit\(\{ H, boxH, restH: restH\.current, kb, maxH, insTop: ins\.top \}\)/);
    // The old window-derived arithmetic must not survive anywhere in the file.
    expect(sheet).not.toMatch(/restH\.current - H/);
    expect(sheet).not.toMatch(/Math\.min\(H \* maxH, Math\.max\(0, H - bottom/);
  });
});
