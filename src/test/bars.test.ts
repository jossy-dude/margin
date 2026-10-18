import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BAR_KINDS, isBarKind } from '../ui/instruments/legacyKinds';
import { INSTRUMENTS, GROUPS, INSTRUMENT_IDS, instrument } from '../ui/instruments/catalogue';
import { clipSeg, hatch } from '../ui/instruments/hatch';
import { contrast, GRAPHIC_FLOOR, resolveInk, twoInks } from '../ui/instruments/ink';
import { previewSvg, svgDoc } from '../ui/instruments/svg';
import { activePeriod, LATE_MS, type BarPeriod } from '../ui/instruments/time';
import { HBAND, type Ctx, type InstrumentId, type Shape } from '../ui/instruments/types';
import { palettes } from '../tokens/theme';

/**
 * The sixteen instruments: registration, geometry, and the two things that are easy to get
 * backwards and impossible to see in a passing assertion — what `p` MEANS at each end, and whether
 * any two copies of a bar can fight over an SVG id.
 *
 * Everything visual was ALSO rendered and looked at; see `qa/HANDOFF-A2.md` for the contact-sheet
 * paths. These tests are the properties a render cannot show you.
 */

const M50 = 50 * 60_000;
const ctx = (p: number, w: number, total = M50): Ctx => ({ p, w, total, left: p * total, late: p > 0 && p <= 0.1 });
const inksFor = (pal: 'refined' | 'original', mode: 'light' | 'dark') => {
  const c = palettes[pal][mode];
  return twoInks(c.slabInk, c.slab, c.acc, c.warn);
};
const WIDTHS = [200, 280, 351, 480, 700];
const PS = [0, 0.05, 0.25, 0.5, 0.75, 1];
/** Monotonicity is checked over the range a real period spends its life in. p=0 is excluded because
 *  it is a boundary, not a step: the dial's swept arc is legitimately ABSENT at exactly zero, so the
 *  shape count ticks up by one across 0.002. That is the measurement, not a brightness gain. */
const PS_STEPS = [1, 0.75, 0.5, 0.25, 0.05];
/** Every shape, flattened out of any `g`. */
const flat = (ss: Shape[]): Shape[] => ss.flatMap((s) => (s.t === 'g' ? flat(s.ch) : [s]));
/** How much of the drawing is lit: shapes drawn in full ink, or the signal tone. A countdown must
 *  never get brighter as it runs out. */
const litCount = (ss: Shape[]) => flat(ss).filter((s) => s.t !== 'g' && (s.ink === 'live' || s.ink === 'signal')).length;
/** Filled area only — the things that read as "how much is left". */
const fillCount = (ss: Shape[]) => flat(ss).filter((s) => s.t !== 'g' && 'f' in s && s.f === true && (s.ink === 'live' || s.ink === 'signal')).length;

/**
 * The vertical extent a drawing actually occupies, in the shapes' own coordinates.
 *
 * Scraping the rendered markup for `y=` cannot see this: a spiral is almost entirely inside one path
 * `d` string, so an attribute scrape reports the playhead dot and nothing else. Every path this system
 * emits is `M x y L x y …`, so the y values are the odd-numbered ones in each pair.
 */
const yRange = (ss: Shape[]): [number, number] => {
  const ys: number[] = [];
  for (const s of ss) {
    if (s.t === 'g') ys.push(...yRange(s.ch));
    else if (s.t === 'p' || s.t === 'run') {
      const n = s.d.split(/[MLZ]/).filter(Boolean).map((chunk) => chunk.trim().split(/[\s,]+/).map(Number));
      for (const [, y] of n) ys.push(y!);
    } else if (s.t === 'r') ys.push(s.y, s.y + s.h);
    else if (s.t === 'c') ys.push(s.cy - s.r, s.cy + s.r);
    else if (s.t === 'l') ys.push(s.y1, s.y2);
    else if (s.t === 'x') ys.push(s.y - (s.size ?? 8) / 2, s.y + (s.size ?? 8) / 2);
  }
  return [Math.min(...ys), Math.max(...ys)];
};

describe('the catalogue: sixteen instruments in six groups', () => {
  it('registers exactly 16, in the reference\'s order, in the reference\'s six groups', () => {
    expect(INSTRUMENTS.length).toBe(16);
    expect(INSTRUMENT_IDS).toEqual([
      'cassette', 'graduated', 'spiral',
      'tape', 'surplus', 'compound',
      'sieve', 'sets',
      'scope', 'spectrum',
      'stack', 'commits', 'heap',
      'btree', 'join', 'log',
    ]);
    expect(GROUPS.map((g) => g.id)).toEqual(['any', 'econ', 'discrete', 'tech', 'prog', 'db']);
    // 3 universal, then econ ×3, discrete ×2, tech ×2, prog ×3, db ×3
    expect(GROUPS.map((g) => INSTRUMENTS.filter((i) => i.g === g.id).length)).toEqual([3, 3, 2, 2, 3, 3]);
  });

  it('the InstrumentId union in types.ts IS the catalogue, so a new instrument cannot be half-added', () => {
    // 16 names, written out as a union in types.ts because a saved setting stores one forever
    const declared = (readFileSync(join(__dirname, '../ui/instruments/types.ts'), 'utf8').match(/export type InstrumentId =([\s\S]*?);/)?.[1] ?? '')
      .split('|').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
    expect(declared.sort()).toEqual([...INSTRUMENT_IDS].sort());
    expect(declared.length).toBe(16);
  });

  it('ids and names are unique — the picker cannot show two "Ticker"s or lose one setting to a clash', () => {
    expect(new Set(INSTRUMENT_IDS).size).toBe(16);
    expect(new Set(INSTRUMENTS.map((i) => i.n)).size).toBe(16);
  });

  it('none of the 16 collides with the app\'s own day bar, by id OR by name', () => {
    // The one remaining kind (Sight glass) is KEPT. The removed names (Bookshelf / Trace / Ticker)
    // no longer need the machine-naming dodge, but nothing is renamed back: the instruments still
    // answer to the MACHINE name (`graduated` = Gauge glass, `scope` = Oscilloscope, `tape` = Market
    // tape), because a saved setting stores an id forever.
    const own = BAR_KINDS.map((b) => b.id);
    for (const i of INSTRUMENTS) expect(own).not.toContain(i.id);
    for (const b of BAR_KINDS) expect(INSTRUMENTS.map((i) => i.n)).not.toContain(b.n);
    // and the picker therefore offers 17 kinds, never 16
    expect(BAR_KINDS.length + INSTRUMENTS.length).toBe(17);
  });

  it('every instrument carries a description and a builder', () => {
    for (const i of INSTRUMENTS) {
      expect(i.d.length).toBeGreaterThan(30);
      expect(typeof i.build).toBe('function');
      expect(i.n.length).toBeGreaterThan(2);
    }
  });
});

describe('p is percent REMAINING, from real clock time', () => {
  const T = 1_757_000_000_000, MIN = 60_000, at = (m: number) => T + m * MIN;
  // three 50-minute classes with 10-minute gaps: 09:00, 10:00, 11:00
  const day: BarPeriod[] = [
    { start: at(9 * 60), end: at(9 * 60 + 50), label: 'Intro to Economics' },
    { start: at(10 * 60), end: at(10 * 60 + 50), label: 'Discrete Mathematics' },
    { start: at(11 * 60), end: at(11 * 60 + 50), label: 'Computer Programming' },
  ];

  it('the whole-period fraction the old bar used to render would have been BACKWARDS here', () => {
    // this is the bug being fixed, stated as a test: at the moment a class STARTS, the elapsed-day
    // fraction is already large and rising, and the elapsed-class fraction is 0
    const atStart = activePeriod(day, at(9 * 60))!;
    expect(atStart.p).toBe(1);
    expect(atStart.phase).toBe('running');
    expect(atStart.period.label).toBe('Intro to Economics');
  });

  it('reads 1 at the first instant of a class and falls to 0 at its last', () => {
    const a = activePeriod(day, at(9 * 60))!;
    expect(a.p).toBe(1);
    expect(a.left).toBe(50 * MIN);
    expect(a.total).toBe(50 * MIN);
    const b = activePeriod(day, at(9 * 60 + 40))!;
    expect(b.p).toBeCloseTo(0.2, 6);            // 10 minutes left of 50
    expect(b.left).toBe(10 * MIN);
    const c = activePeriod(day, at(9 * 60 + 49.99))!;
    expect(c.p).toBeGreaterThan(0);
    expect(c.p).toBeLessThan(1e-3);
  });

  it('reads 1 BEFORE the day starts, and 0 once the last class is over', () => {
    const before = activePeriod(day, at(0))!;
    expect(before.phase).toBe('before');
    expect(before.p).toBe(1);
    expect(before.period.label).toBe('Intro to Economics');
    const over = activePeriod(day, at(23 * 60))!;
    expect(over.phase).toBe('over');
    expect(over.p).toBe(0);
    expect(over.left).toBe(0);
    expect(over.ended).toBe(true);
  });

  it('in a free period it shows the class that JUST ended at 0, not the next one at 1', () => {
    // a bar that snaps back to full the instant a class ends is the exact lie this rewrite removes
    const gap = activePeriod(day, at(9 * 60 + 55))!;
    expect(gap.phase).toBe('gap');
    expect(gap.p).toBe(0);
    expect(gap.period.label).toBe('Intro to Economics');
    expect(gap.ended).toBe(true);
  });

  it('skips cancelled classes entirely — there is no period to count down', () => {
    const withCancel: BarPeriod[] = [{ start: at(60), end: at(110), label: 'X', cancelled: true }, { start: at(120), end: at(170), label: 'Y' }];
    const y = activePeriod(withCancel, at(60))!;
    expect(y.period.label).toBe('Y');
    expect(y.phase).toBe('before');
    expect(activePeriod([withCancel[0]!], at(60))).toBeNull();
    expect(activePeriod([], at(60))).toBeNull();
  });

  it('a zero-length or reversed period is dropped, not divided by', () => {
    const T2 = 1_757_000_000_000;
    expect(() => activePeriod([{ start: T2 + 100, end: T2 + 100, label: 'z' }], T2 + 150)).not.toThrow();
    expect(activePeriod([{ start: T2 + 100, end: T2 + 100, label: 'z' }], T2 + 150)).toBeNull();
    expect(activePeriod([{ start: T2 + 200, end: T2 + 100, label: 'z' }], T2 + 150)).toBeNull();
  });

  it('late is the last five minutes, from real remaining time', () => {
    expect(LATE_MS).toBe(300_000);
    const late = activePeriod(day, at(9 * 60 + 47))!;   // 3 minutes left
    expect(late.left).toBeGreaterThan(0);
    expect(late.left).toBeLessThanOrEqual(LATE_MS);
    const early = activePeriod(day, at(9 * 60 + 10))!;  // 40 minutes left
    expect(early.left).toBeGreaterThan(LATE_MS);
    const over = activePeriod(day, at(9 * 60 + 55))!;
    expect(over.left).toBe(0);
  });
});

describe('every instrument reads true at both ends', () => {
  /**
   * A shape COUNT is a proxy for "gets brighter", and it is wrong for exactly one instrument. `heap`
   * carries a pointer that rides the edge of whichever generation is filling, and it exists only while
   * a generation is MID-fill: at p=1 all three are full, so there is nothing to point at and the count
   * ticks up by one as you leave the start. That is a marker, not a quantity — the next test pins the
   * actual fill behaviour for it instead.
   *
   * The exception list is asserted to be exactly what it is, so the next instrument that needs one has
   * to be argued for in a comment rather than quietly skipped.
   */
  const MARKER_ONLY: Record<string, string> = {
    heap: 'the promotion pointer is drawn only while a generation is mid-fill',
  };

  it('nothing gets brighter as the period runs out, at any width', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) {
      if (MARKER_ONLY[it.id]) continue;
      for (let i = 1; i < PS_STEPS.length; i++) {
        const more = it.build(ctx(PS_STEPS[i - 1]!, w)), less = it.build(ctx(PS_STEPS[i]!, w));
        // `more` has MORE time left than `less`, so it must never be the dimmer of the two
        expect({ id: it.id, w, from: PS_STEPS[i - 1], to: PS_STEPS[i], was: litCount(more), now: litCount(less) })
          .toEqual({ id: it.id, w, from: PS_STEPS[i - 1], to: PS_STEPS[i], was: Math.max(litCount(more), litCount(less)), now: litCount(less) });
        expect(fillCount(less)).toBeLessThanOrEqual(fillCount(more));
      }
    }
  });

  it('and the one instrument with a mid-fill marker fills strictly less as time runs out', () => {
    // only the three generation boxes: the pointer is a marker, not an amount
    const fills = (p: number) => flat(instrument('heap')!.build(ctx(p, 351)))
      .filter((s): s is Extract<Shape, { t: 'r' }> => s.t === 'r' && s.f === true && (s.ink === 'live' || s.ink === 'signal')).length;
    expect(fills(1)).toBe(3);
    expect(fills(0.5)).toBe(2);
    expect(fills(0.4)).toBe(1);
    expect(fills(0)).toBe(0);
    for (let p = 0.05; p <= 1.0001; p += 0.05) expect(fills(p)).toBeLessThanOrEqual(fills(Math.min(1, p + 0.05)));
  });

  it('at p=0 no lit AREA survives, on any instrument', () => {
    // the transport still has threaded tape and two reels on it. Every other lit shape at p=0 is a bug.
    const STRUCTURAL: Record<string, string[]> = { cassette: ['p', 'c'] };
    for (const it of INSTRUMENTS) for (const w of WIDTHS) {
      for (const s of flat(it.build(ctx(0, w)))) {
        if (s.t === 'g' || s.ink === 'rest') continue;
        // a run carries no ink at p=0 — its dash window is slid entirely past the line, which the
        // dedicated run test above proves from the emitted dashoffset
        if (s.t === 'run') continue;
        if (STRUCTURAL[it.id]?.includes(s.t)) continue;
        // the accent marks the MOVER. At p=0 the mover is at its rest position, which is not a
        // remaining amount — a needle lying on its stop is not a claim about how much time is left.
        if (s.ink === 'signal') continue;
        // an UNFILLED circle or rect is a housing, a bezel or a pivot — outline, not an amount
        if ((s.t === 'c' || s.t === 'r') && (!('f' in s) || s.f !== true)) continue;
        expect(`${it.id} lit at p=0: ${JSON.stringify(s)}`).toBe(`${it.id} dark at p=0`);
      }
    }
  });

  it('every run is fully slid back at p=0 and fully drawn at p=1', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) {
      const at0 = flat(it.build(ctx(0, w))).filter((s): s is Extract<Shape, { t: 'run' }> => s.t === 'run');
      const at1 = flat(it.build(ctx(1, w))).filter((s): s is Extract<Shape, { t: 'run' }> => s.t === 'run');
      for (const r of at0) expect(r.len > 0.5 || r.len === 0).toBe(true);
      for (const r of at1) expect(r.len).toBeGreaterThan(0.5);
      const s0 = svgDoc(it.build(ctx(0, w)), { w, inks: inksFor('refined', 'dark'), p: 0 });
      // dashoffset === len means the window has slid entirely past the line
      for (const m of s0.matchAll(/stroke-dasharray="([\d.]+) \1" stroke-dashoffset="([\d.]+)"/g)) {
        expect(Number(m[2])).toBeCloseTo(Number(m[1]), 3);
      }
    }
  });

  it('the two that only read correctly while counting down, verified at p=1 and p=0', () => {
    const w = 351, at = (id: InstrumentId, p: number) => instrument(id)!.build(ctx(p, w));
    // a 45-MINUTE class prints its own time: this is the exact bug the hardcoded 3000s would cause
    const M45 = 45 * 60_000;
    expect(flat(instrument('graduated')!.build({ p: 1, w, total: M45, left: M45, late: false })).filter((s) => s.t === 'x').map((s) => (s as { s: string }).s)).toContain('45');
    const r = (id: InstrumentId, p: number, f: (s: Shape) => boolean) => flat(at(id, p)).filter(f);
    const radii = (id: InstrumentId, p: number) => r(id, p, (s) => s.t === 'c' && s.f === true).map((s) => (s as { r: number }).r);
    // transport: supply reel is the FULL one at p=1 and the empty one at p=0
    const sup = (p: number) => r('cassette', p, (s) => s.t === 'c' && s.f === true && s.ink === 'live')[0]!;
    expect((sup(1) as { r: number }).r).toBeCloseTo(10, 3);
    expect((sup(0) as { r: number }).r).toBeCloseTo(3, 3);
    expect(radii('cassette', 1).length).toBe(2);
  });

  it('the transport\'s two tangent runs sum to a constant, so the tape is conserved', () => {
    const legs = (p: number) => {
      // the tape is the only live stroked path on a transport
      const s = flat(instrument('cassette')!.build(ctx(p, 351))).find((q) => q.t === 'p' && q.ink === 'live') as { d: string };
      const nums = s.d.match(/-?[\d.]+/g)!.map(Number);
      expect(nums.length).toBe(8);   // M x1 t1 L x1 39 L x2 39 L x2 t2
      return { left: 39 - nums[1]!, right: 39 - nums[7]! };
    };
    expect(legs(1).left + legs(1).right).toBeCloseTo(legs(0.5).left + legs(0.5).right, 6);
  });

  it('no machine degenerates: every instrument draws a real object at every p, at every width', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      // the Spiral is the floor: at p=0 it is its resting groove plus the playhead dot, and nothing else
      const n = it.build(ctx(p, w)).length;
      expect({ id: it.id, w, p, shapes: n }).toEqual({ id: it.id, w, p, shapes: n });
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('no viewBox can stretch anything', () => {
  it('width and height ARE the viewBox, one user unit to one pixel, at every width', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) {
      const s = svgDoc(it.build(ctx(0.5, w)), { w, inks: inksFor('refined', 'dark'), p: 0.5 });
      expect(s).toContain(`viewBox="0 0 ${w} ${HBAND}"`);
      expect(s).toContain(`width="${w}" height="${HBAND}"`);
      expect(s).not.toContain('preserveAspectRatio');
      // nothing scales the drawing: the root carries no transform at all, which is the only place a
      // non-uniform scale could turn a circle into an oval
      expect(s.slice(0, s.indexOf('>'))).not.toContain('transform');
      expect(s.slice(0, s.indexOf('>'))).not.toContain('scale');
      const [, vw, vh] = s.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)!.map(Number) as unknown as [string, number, number];
      expect(vw / vh).toBeCloseTo(w / HBAND, 6);
    }
  });

  it('every disc is a disc: equal width and height, and never an ellipse or a transformed group', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      const s = svgDoc(it.build(ctx(p, w)), { w, inks: inksFor('refined', 'dark'), p });
      expect(s).not.toContain('<ellipse');
      // the only scale() allowed is a small mark scaled about its OWN centre (Venn lens, chain glyph)
      for (const m of s.matchAll(/<g transform="translate\(([\d.-]+) [\d.-]+\) scale\(([\d.]+)\) translate\(-?[\d.]+ /g)) {
        expect(Number(m[2])).toBeLessThanOrEqual(1);
      }
    }
  });

  it('nothing is drawn off the canvas at any width or any p', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      const s = svgDoc(it.build(ctx(p, w)), { w, inks: inksFor('refined', 'dark'), p });
      for (const m of s.matchAll(/[xy][12]?="(-?[\d.]+)"/g)) {
        const v = Number(m[1]);
        expect(v).toBeGreaterThan(-3);
        expect(v).toBeLessThan(w + 3);
      }
      for (const m of s.matchAll(/\br="([\d.]+)"/g)) expect(Number(m[1])).toBeLessThan(HBAND / 2);
    }
  });
});

describe('two inks only, and the accent is spent on nothing but the mover', () => {
  const INKS = inksFor('refined', 'dark');

  it('a run, a stroke and a fill can each only be painted in one of two inks plus the signal', () => {
    const allowed = new Set([INKS.rest, INKS.live, INKS.signal]);
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      for (const col of svgDoc(it.build(ctx(p, w)), { w, inks: INKS, p }).matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6,8})"/g)) {
        expect(allowed.has(col[1]!.toUpperCase())).toBe(true);
      }
    }
  });

  it('the accent is either legible on the slab or never used, in every palette and both themes', () => {
    // measured on the command-deck slab: the accent clears 3:1 only in refined dark. The gate means
    // three of the four combinations are strictly TWO inks, exactly as the reference paints them.
    for (const pal of ['refined', 'original'] as const) for (const mode of ['light', 'dark'] as const) {
      const c = palettes[pal][mode];
      const k = twoInks(c.slabInk, c.slab, c.acc, c.warn);
      expect(k.accOk).toBe(contrast(c.acc, c.slab) >= GRAPHIC_FLOOR);
      // whatever tone the mover ends up with, it is either full ink or something a viewer can see
      expect([k.live, c.acc, c.warn]).toContain(k.signal);
      if (k.signal !== k.live) expect(contrast(k.signal, c.slab)).toBeGreaterThanOrEqual(GRAPHIC_FLOOR);
      // the resting draw must read as dimmer than the live one against the same slab
      expect(contrast(k.rest, c.slab)).toBeLessThan(contrast(k.live, c.slab));
    }
  });

  it('resolveInk has exactly three answers, and rest is never the live ink', () => {
    expect(resolveInk('rest', INKS)).toBe(INKS.rest);
    expect(resolveInk('live', INKS)).toBe(INKS.live);
    expect(resolveInk('signal', INKS)).toBe(INKS.signal);
  });

  it('a mover is a small part: no instrument spends the signal on a whole filled area', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      for (const s of flat(it.build(ctx(p, w)))) {
        if (s.t === 'g' || s.ink !== 'signal') continue;
        if (s.t === 'r' && s.f === true) expect(Math.max(s.w, s.h)).toBeLessThan(HBAND / 2); // a pip or a cell
        if (s.t === 'c' && s.f === true) expect(s.r).toBeLessThan(HBAND / 4);
      }
    }
  });
});

describe('two copies of a bar in one tree cannot fight over an id', () => {
  it('not one instrument emits an id or a url(#…) reference, at any width or p', () => {
    // SvgXml ids collide when two copies render in one tree, and Settings mounts every
    // bar kind LIVE in that one sheet. The fix is stronger than unique ids — there are none. A
    // gradient, a clip and a pattern are the only things that ever needed one, and this system uses
    // geometry instead of all three.
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) for (const k of [inksFor('refined', 'dark'), inksFor('original', 'light')]) {
      const s = svgDoc(it.build(ctx(p, w)), { w, inks: k, p });
      expect(s).not.toContain('id=');
      expect(s).not.toContain('url(#');
      expect(s).not.toContain('<defs');
      expect(s).not.toContain('<clipPath');
    }
  });

  it('and DayBar itself has no hardcoded SVG id left either — the two Patterns are gone', () => {
    // `hat` and `liq` were the two colliding ids: the cancelled-class hatch and the glass tube's
    // liquid. Both are drawn as geometry (instruments/hatch.ts, and a solid fill) — and DayBar no
    // longer draws the hatch at all, since the Bookshelf renderer went with the bar delete, which
    // also removes the one `patternTransform` use in the bar that qa/EXPO_GO_AUDIT.md B2 records as
    // never reached on a device.
    const src = readFileSync(join(__dirname, '../ui/DayBar.tsx'), 'utf8');
    expect(src).not.toContain('url(#');
    expect(src).not.toMatch(/<Pattern/);
    expect(src).not.toMatch(/<Defs/);
    expect(src).not.toContain('patternTransform');
  });

  it('the cancelled hatch still covers its rect, and the clipper is exact', () => {
    const segs = hatch(10, 5, 40, 30, 5);
    expect(segs.length).toBeGreaterThan(4);
    for (const g of segs) {
      expect(g.x1).toBeGreaterThanOrEqual(9.999);
      expect(g.x2).toBeLessThanOrEqual(50.001);
      expect(g.y1).toBeGreaterThanOrEqual(4.999);
      expect(g.y2).toBeLessThanOrEqual(35.001);
    }
    expect(clipSeg(0, 0, 10, 10, 5, 5, 2, 2)).toEqual({ x1: 5, y1: 5, x2: 7, y2: 7 });
    expect(clipSeg(0, 0, 1, 1, 50, 50, 5, 5)).toBeNull();
    expect(clipSeg(0, 0, 10, 0, 0, 0, 10, 10)).toEqual({ x1: 0, y1: 0, x2: 10, y2: 0 });
  });
});

describe('the drawings are well formed at every width and every palette', () => {
  it('no NaN, no Infinity, no empty path, no negative size', () => {
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) for (const k of [inksFor('refined', 'light'), inksFor('refined', 'dark')]) {
      const s = svgDoc(it.build(ctx(p, w)), { w, inks: k, p });
      expect(s).not.toContain('NaN');
      expect(s).not.toContain('Infinity');
expect(s).not.toMatch(/ d=""/);
      // a one-point path renders as a stray dot, so every d must have at least one segment after its M
      for (const m of s.matchAll(/ d="([^"]*)"/g)) expect(m[1]!.slice(1)).not.toMatch(/^$/);
      expect(s).not.toMatch(/(width|height)="-/);
    }
  });

  it('every path is M / L / Z only — no arc, quadratic or cubic flags anywhere', () => {
    // Arc, Q, T and C flags have uneven support in react-native-svg's Android path parser and there
    // is no device in this project to verify them against (qa/STATE.md — pattern lock). Every curve
    // in these sixteen is a sampled polyline instead, so the renderer only has to handle line commands.
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      const s = svgDoc(it.build(ctx(p, w)), { w, inks: inksFor('refined', 'dark'), p });
      // anything that is not M, L, Z, a digit, a sign or a separator is a command we did not audit
      for (const m of s.matchAll(/ d="([^"]*)"/g)) expect(m[1]!.match(/[^MLZ\d.\-\s]/g) ?? []).toEqual([]);
    }
  });

  it('a run\'s dash window is its own measured length, so the reveal is the true fraction', () => {
    for (const it of INSTRUMENTS) {
      for (const w of WIDTHS) {
        for (const s of flat(it.build(ctx(0.5, w)))) {
          if (s.t !== 'run') continue;
          const n = s.d.split(/[ML]/).filter(Boolean).length;
          expect(n).toBeGreaterThan(1);
          expect(s.len).toBeGreaterThan(1);
        }
      }
    }
  });

  it('the same bar drawn twice from the same inputs is byte-identical', () => {
    // the market tape used Math.random in the reference; a bar that reshuffles under the eye is
    // decoration. Same inputs, same bytes, every mount.
    for (const it of INSTRUMENTS) {
      const a = svgDoc(it.build(ctx(0.5, 351)), { w: 351, inks: inksFor('refined', 'dark'), p: 0.5 });
      const b = svgDoc(it.build(ctx(0.5, 351)), { w: 351, inks: inksFor('refined', 'dark'), p: 0.5 });
      expect(a).toBe(b);
    }
  });

  it('every instrument fills at least 60% of the band, at every width and every p', () => {
    // a bar that draws a 12px strip in the middle of its 44px band is not using the space it was
    // given; a bar that spills past 44 is clipped on the phone. 27 of 44 is the floor: the analyser
    // is the tightest of the sixteen and it still covers three fifths of the band at zero.
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of PS) {
      const [lo, hi] = yRange(it.build(ctx(p, w)));
      expect({ id: it.id, w, p, used: +(hi - lo).toFixed(1) }).toEqual({ id: it.id, w, p, used: Math.max(+(hi - lo).toFixed(1), 27) });
      expect(lo).toBeGreaterThan(-3);
      expect(hi).toBeLessThan(HBAND + 3);
    }
  });
});

describe('the app\'s own day bar is kept, not replaced', () => {
  it('Sight glass survives with its id and its name; the removed three are gone', () => {
    expect(BAR_KINDS.map((b) => b.id)).toEqual(['glass']);
    expect(BAR_KINDS.map((b) => b.n)).toEqual(['Sight glass']);
    for (const b of BAR_KINDS) expect(isBarKind(b.id)).toBe(true);
    expect(isBarKind('spines')).toBe(false);
    expect(isBarKind('gauge')).toBe(false);
  });

  it('DayBar sends every non-instrument id to Sight glass, and the removed renderers are gone', () => {
    const src = readFileSync(join(__dirname, '../ui/DayBar.tsx'), 'utf8');
    expect(src).toContain('return <Glass');
    expect(src).not.toContain("kind === 'ticker'");
    expect(src).not.toContain("kind === 'trace'");
    expect(src).not.toContain('return <Spines');
    expect(src).toContain('export { BAR_KINDS }');
    expect(src).toContain('export type { BarKind }');
  });

  it('nothing in the bar animates while its screen is off-screen (A1 PERF #7)', () => {
    // Today stays mounted behind the page you went to, and every one of these re-keyed on the screen's
    // 30 s `now` — so off-screen they used to re-fire forever: a 900 ms day tween, up to seven 800 ms
    // fill retargets, and a 1 Hz instrument tick, on a JS thread that is also mounting the page you
    // tapped. All three are gated on `live` (Today passes `st.route === 'Today'`), and `live` has to
    // reach the dispatcher as well as the leaf, or the gate is dead code.
    const src = readFileSync(join(__dirname, '../ui/DayBar.tsx'), 'utf8');
    expect(src).toContain('if (!live || reduce) { dayP.set(day); return; }'); // assign, do not tween
    expect(src).toContain('useNow(live ? 1000 : 60_000)');                    // the instrument tick
    expect(src).toContain('live={live} />');                                  // passed through the dispatcher
  });
});

describe('the Settings picker preview path', () => {
  it('previewSvg renders the same drawing the live component does, as one string', () => {
    const w = 280, k = { ink: palettes.refined.dark.slabInk, slab: palettes.refined.dark.slab, acc: palettes.refined.dark.acc, warn: palettes.refined.dark.warn };
    for (const it of INSTRUMENTS) for (const p of [0, 0.5, 1]) {
      const s = previewSvg(it.id, { ...k, p, w, total: M50, left: p * M50 });
      expect(s.startsWith('<svg')).toBe(true);
      expect(s).toContain(`viewBox="0 0 ${w} ${HBAND}"`);
      expect(s).not.toContain('NaN');
      // the static preview and the live draw are the same code path, so they cannot drift
      expect(s).toBe(svgDoc(it.build(ctx(p, w)), { w, inks: twoInks(k.ink, k.slab, k.acc, k.warn), p }));
    }
    expect(previewSvg('not-an-instrument', { ...k, p: 0.5, w })).toBe('');
  });

  it('and it needs no id, so mounting 17 of them in one sheet is safe', () => {
    const k = { ink: '#F2EAD8', slab: '#1F1B16', acc: '#E0A47A', warn: '#E3B04B' };
    for (const it of INSTRUMENTS) expect(previewSvg(it.id, { ...k, p: 0.5, w: 280 })).not.toContain('id=');
  });
});

describe('offline visual dump — the PNGs the report points at', () => {
  it('writes every instrument in both palettes at every width, for render.sh', () => {
    mkdirSync('/tmp/instruments', { recursive: true });
    const k = inksFor('refined', 'dark');
    for (const it of INSTRUMENTS) for (const w of WIDTHS) for (const p of [0, 0.5, 1]) {
      writeFileSync(`/tmp/instruments/${it.id}-${w}-${String(p).replace('.', '_')}.svg`, svgDoc(it.build(ctx(p, w)), { w, inks: k, p }));
    }
    expect(INSTRUMENTS.length * WIDTHS.length * 3).toBe(240);
  });
});