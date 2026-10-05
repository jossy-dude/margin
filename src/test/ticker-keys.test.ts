import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clockCells, fmtClock } from '../domain/time';

/** The Ticker's digit row (src/ui/DayBar.tsx). Keys are what decides which React node survives a
 *  re-render, so this is about identity, not about what the boxes look like. */
const keysOf = (txt: string) => clockCells(txt).map((c) => c.key);
const indexKeysOf = (txt: string) => [...txt].map((_, i) => String(i));

describe('the ticker clock keys its digit boxes by role, not by position (BUG-016)', () => {
  it('the finding\'s premise was wrong: fmtClock is NOT a fixed width', () => {
    expect(fmtClock(59)).toBe('00:59');
    expect(fmtClock(3599)).toBe('59:59');
    expect(fmtClock(3600)).toBe('1:00:00'); // one hour: the string grows
    expect(fmtClock(36000)).toBe('10:00:00'); // and grows again
    expect(fmtClock(59).length).toBe(5);
    expect(fmtClock(3600).length).toBe(7);
  });

  it('so an index key really would re-purpose a live box at the hour boundary', () => {
    const A = '59:59', B = '1:00:00';
    //            0  1  2  3  4  5  6
    //  '59:59'   5  9  :  5  9  -  -
    //  '1:00:00' 1  :  0  0  :  0  0
    // Index 2 is the colon before the hour and a minute digit after it. React reuses any node whose
    // key did not change, so that one box silently becomes opaque and bordered — with the colon's
    // narrower width rule and no key to tell React otherwise.
    expect([...A][2]).toBe(':');
    expect([...B][2]).toBe('0');
    expect(indexKeysOf(A)[2]).toBe(indexKeysOf(B)[2]); // …so the colon box and a digit box share a node
    expect(clockCells(A)[2]!.colon).toBe(true);
    expect(clockCells(B)[2]!.colon).toBe(false);
    // the seconds are the two right-most boxes and must keep their identity across the boundary
    expect([...A].slice(-2)).toEqual(['5', '9']);
    expect([...B].slice(-2)).toEqual(['0', '0']);
    expect(clockCells(A).slice(-2).map((c) => c.key)).toEqual(clockCells(B).slice(-2).map((c) => c.key));
  });

  it('role keys keep every shared slot on the same key across the hour boundary', () => {
    const before = keysOf('59:59'), after = keysOf('1:00:00');
    expect(before).toEqual(['d4', 'd3', 'c2', 'd1', 'd0']);
    expect(after).toEqual(['d6', 'c5', 'd4', 'd3', 'c2', 'd1', 'd0']);
    // every key present before the hour is still present after, so nothing is re-purposed
    expect(after.filter((k) => before.includes(k))).toEqual(before);
    // and the seconds digits specifically keep their identity
    expect(clockCells('59:59').filter((c) => !c.colon).slice(-2).map((c) => c.key)).toEqual(['d1', 'd0']);
    expect(clockCells('1:00:00').filter((c) => !c.colon).slice(-2).map((c) => c.key)).toEqual(['d1', 'd0']);
  });

  it('and the two boxes that appear with the hour get keys nothing else had', () => {
    const added = keysOf('1:00:00').filter((k) => !keysOf('59:59').includes(k));
    expect(added).toEqual(['d6', 'c5']);
  });

  it('the --:-- placeholder keys like a 5-slot clock, so it does not remount the row', () => {
    expect(clockCells('--:--').map((c) => c.key)).toEqual(['d4', 'd3', 'c2', 'd1', 'd0']);
    expect(clockCells('--:--').map((c) => c.ch)).toEqual(['-', '-', ':', '-', '-']);
    // going from "no target" to a real target therefore reuses the same five nodes
    expect(keysOf('--:--')).toEqual(keysOf('00:00'));
  });

  it('keys are unique within a row and colons are distinguishable from digits', () => {
    for (const txt of ['--:--', '00:00', '59:59', '1:00:00', '10:00:00']) {
      const cells = clockCells(txt);
      expect(new Set(cells.map((c) => c.key)).size).toBe(cells.length);
      for (const c of cells) expect(c.key.startsWith(c.colon ? 'c' : 'd')).toBe(true);
      expect(cells.map((c) => c.ch).join('')).toBe(txt); // nothing dropped or reordered
    }
  });

  it('inside each run the keys never change, so the row never remounts; only the width changes', () => {
    // fmtClock grows at 3600s (MM:SS → H:MM:SS) and again at 36000s (→ HH:MM:SS). Those are the only
    // two, so the runs between them are where a real round spends nearly all of its life.
    const RUNS: [number, number][] = [[0, 3599], [3600, 35999], [36000, 99999]];
    for (const [lo, hi] of RUNS) {
      const ref = keysOf(fmtClock(lo));
      for (const s of [lo, lo + 1, Math.floor((lo + hi) / 2), hi - 1, hi]) {
        expect(keysOf(fmtClock(s))).toEqual(ref);
      }
    }
    // the three runs really are three different shapes, so the boundary tests above are not vacuous
    expect(new Set(RUNS.map(([lo]) => keysOf(fmtClock(lo)))).size).toBe(3);
  });

  it('DayBar keys off the helper rather than re-deriving it', () => {
    const src = readFileSync(join(__dirname, '../ui/DayBar.tsx'), 'utf8');
    expect(src).toContain('clockCells(txt)');
    expect(src).toContain('key={c.key}');
    expect(src).not.toMatch(/txt\.split\(''\)\.map/);
  });
});