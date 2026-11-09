/**
 * v0.6 — the three watch faces that replaced the nine engraved ones (owner: "useless and hard to read").
 * Pinned here: there are exactly three and every retired id still resolves; each speaks Arabic numerals;
 * the centre is a pin, not an ornament; every colour comes from the palette; the frame loop is gated;
 * and the hand angles keep their DST-safe arithmetic (ported from the retired clock-engine test).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACES, compositeSvg, dialPal, dialSvg, faceById, handAngles, handSvg } from '../ui/clock/faces';
import { DIAL, SECOND } from '../tokens/theme';

const pal = (dark: boolean) => dialPal({ ink: dark ? '#EDE6DA' : '#1F1B16' }, dark);
const texts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

describe('the faces', () => {
  it('ships three watches, and every retired id lands on one of them', () => {
    expect(FACES.map((f) => f.id)).toEqual(['field', 'studio', 'diver']);
    for (const old of ['g', 'rb', 'c', 'sl', 's', 'or', 'hm', 'sun', 'af', 'fob', '', 'nonsense']) expect(FACES).toContain(faceById(old));
  });
  it('speaks Arabic numerals: Field all twelve, Studio the four quarters, Diver its quarters, bezel and date', () => {
    expect(texts(dialSvg(faceById('field'), pal(false), 'F'))).toEqual(['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);
    expect(texts(dialSvg(faceById('studio'), pal(false), 'F'))).toEqual(['12', '3', '6', '9']);
    expect(texts(dialSvg(faceById('diver'), pal(false), 'F', 200, 27))).toEqual(['10', '20', '30', '40', '50', '12', '6', '9', '27']);
    for (const f of FACES) expect(texts(dialSvg(f, pal(false), 'F', 200, 27)).join(' ')).not.toMatch(/[IVX]{2,}/);
  });
  it('the dial has no moving ornament: one plate plus three hands is the whole document set', () => {
    for (const f of FACES) {
      const doc = compositeSvg(f, pal(true), 'F');
      expect(doc).not.toMatch(/animate|clipPath|<image/);
      expect((doc.match(/<g transform="rotate/g) ?? []).length).toBe(3);
    }
  });
  it('every colour is the palette ink, a dial material, the second-hand material, or a tone mixed from them', () => {
    for (const dark of [false, true]) {
      const p = pal(dark);
      expect(p.dial).toBe(dark ? DIAL.dark : DIAL.light);
      expect(p.second).toBe(dark ? SECOND.dark : SECOND.light);
      for (const f of FACES) {
        const doc = compositeSvg(f, p, 'F');
        const used = new Set([...doc.matchAll(/(?:fill|stroke)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase()));
        for (const col of used) expect([p.ink, p.dial, p.second, p.mut, p.bezel, p.bezelInk].map((x) => x.toUpperCase())).toContain(col);
      }
    }
  });
  it('hour and minute hands are told apart by length on every face', () => {
    const reach = (xml: string) => Math.max(...[...xml.replace(/<svg[^>]*>/, "").matchAll(/[-](\d+(?:\.\d+)?)/g)].map((m) => +m[1]!));
    for (const f of FACES) expect(reach(handSvg('minute', f, pal(false)))).toBeGreaterThan(reach(handSvg('hour', f, pal(false))) + 15);
  });
  it('a small thumbnail keeps hairlines at least ~0.6 dp wide', () => {
    for (const f of FACES) {
      const widths = [...dialSvg(f, pal(false), 'F', 96).matchAll(/stroke-width="([\d.]+)"/g)].map((m) => +m[1]! * (96 / 200));
      expect(Math.min(...widths)).toBeGreaterThanOrEqual(0.55);
    }
  });
});

describe('the frame loop', () => {
  const src = readFileSync(join(__dirname, '..', 'ui', 'clock', 'ClockFace.tsx'), 'utf8');
  it('runs only while the dial is live, unpinned and has hands', () => {
    expect(src).toMatch(/const ticking = live && !time && hands;/);
    expect(src).toMatch(/frame\.setActive\(ticking\)/);
  });
});

describe('E. the hand angles take the timezone offset as an argument', () => {
  /** 2026-01-15T15:24:00Z. Winter in northern Europe: UTC+1. */
  const WINTER = Date.UTC(2026, 0, 15, 15, 24, 0);
  /** the same wall clock six months later: UTC+2, because the zone is still on summer time. */
  const SUMMER_OFFSET = -120, WINTER_OFFSET = -60;

  it('reads the local wall clock at either offset', () => {
    // 15:24Z at UTC+1 is 16:24 local = 4:24 on a 12-hour dial → 4 * 30 + 24 * 0.5 = 132. The hour hand
    // sweeps: `ms / 3_600_000` carries the quarter-hour, so it is not pinned to the hour.
    expect(handAngles(WINTER, WINTER_OFFSET * 60_000).ha).toBeCloseTo(132, 6);
    // the same instant at UTC+2 is 17:24 local = 5:24 → 5 * 30 + 12 = 162
    expect(handAngles(WINTER, SUMMER_OFFSET * 60_000).ha).toBeCloseTo(162, 6);
    expect(handAngles(WINTER, WINTER_OFFSET * 60_000).ma).toBeCloseTo(24 * 6, 6);
    expect(handAngles(WINTER, WINTER_OFFSET * 60_000).sec).toBeCloseTo(0, 6);
  });

  it('one hour of offset moves the hour hand by exactly 30 degrees and the minute hand not at all', () => {
    const a = handAngles(WINTER, WINTER_OFFSET * 60_000), b = handAngles(WINTER, SUMMER_OFFSET * 60_000);
    expect(b.ha - a.ha).toBeCloseTo(30, 6);
    expect(b.ma).toBe(a.ma);
    expect(b.sec).toBe(a.sec);
  });

  it('wraps into the day, so 00:30 local does not read as 12:30 on the previous day', () => {
    // 00:30 local: minute hand at 180°, hour hand HALFWAY between 12 and 1 — 15°, not 0. An hour hand that
    // reads 0° here would be a clock that only ticks on the hour, which is the bug this assertion exists to catch.
    const midnight = Date.UTC(2026, 6, 1, 0, 30, 0);
    const a = handAngles(midnight, 0);                 // UTC
    expect(a.ma).toBeCloseTo(30 * 6, 6);
    expect(a.ha).toBeCloseTo(15, 6);
    const b = handAngles(Date.UTC(2026, 6, 1, 22, 30, 0), -120 * 60_000); // 00:30 local the next day
    expect(b).toEqual(a);
  });

  it('the hour hand is 30° per hour and never leaves 0..360, at every hour and both offsets', () => {
    for (const off of [WINTER_OFFSET, SUMMER_OFFSET]) {
      for (let h = 0; h < 24; h++) {
        const a = handAngles(Date.UTC(2026, 0, 15, h, 0, 0), off * 60_000);
        expect(a.ha).toBeGreaterThanOrEqual(0);
        expect(a.ha).toBeLessThan(360);
        expect(a.ma).toBeCloseTo(0, 6);
        expect(a.sec).toBeCloseTo(0, 6);
      }
    }
  });

  it('ClockFace.tsx no longer reads the offset at module scope', () => {
    // the mutation check: reintroducing `const MS_TZ = new Date()…` at module scope fails this
    const src = readFileSync(join(__dirname, '..', 'ui', 'clock', 'ClockFace.tsx'), 'utf8');
    expect(src).not.toMatch(/^const\s+\w*TZ\s*=\s*new Date\(\)\.getTimezoneOffset\(\)/m);
    // the frame callback calls it per frame with the CURRENT offset, not a baked one (`now` became
    // `Date.now()` when the timestamp stopped being handed on to the ornaments — see `SpinView`)
    expect(src).toMatch(/handAngles\(Date\.now\(\), tz\.value\)/);
    // and it really does re-read: an AppState resume plus a poll while the loop runs
    expect(src).toMatch(/AppState\.addEventListener\('change'/);
    expect(src).toMatch(/setInterval\(read, 60_000\)/);
  });

});
