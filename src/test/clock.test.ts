/**
 * v0.7 — the one clock face (owner: "I don't like the clock design overall" → one refined analog face).
 * Pinned here: there is one dial and no catalogue; it carries no numerals and nothing that turns but the
 * hands; every colour comes from the palette; the dial beats once a second instead of running a frame loop;
 * and the hand angles keep their DST-safe arithmetic.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as faces from '../ui/clock/faces';
import { compositeSvg, dialPal, dialSvg, handAngles, handSvg } from '../ui/clock/faces';

const C = (dark: boolean) => (dark ? { ink: '#ECEBE7', card: '#212225', acc: '#9BBBE0', shadow: '#000000' } : { ink: '#1C1D1F', card: '#FFFFFF', acc: '#35619A', shadow: '#1C1D1F' });
const PAPERS = { kraft: '#C49B6D', mustard: '#E1B03C', denim: '#4C79AE', cream: '#F5EEDF', blush: '#F2D3C7', tomato: '#D7553B' };
const pal = (dark: boolean) => dialPal(C(dark), dark, PAPERS);

describe('the face', () => {
  it('is one dial: no catalogue of faces and no picker to choose from', () => {
    expect(Object.keys(faces)).not.toContain('FACES');
    expect(Object.keys(faces)).not.toContain('faceById');
    expect(readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8')).not.toMatch(/Clock face|ui\/clock/);
  });
  it('marks twelve hours — a double baton at twelve, batons at the quarters, dots between — and no numerals', () => {
    const d = dialSvg(pal(false));
    expect(d).not.toMatch(/<text/);
    expect((d.match(/stroke-width="4\.4"/g) ?? []).length).toBe(2);
    expect((d.match(/stroke-width="4\.8"/g) ?? []).length).toBe(3);
    expect((d.match(/<circle cx="[-\d.]+" cy="[-\d.]+" r="2\.6"/g) ?? []).length).toBe(8);
  });
  it('draws today\'s classes on the rim, the finished ones faded, and nothing when the day is empty', () => {
    expect(dialSvg(pal(false))).not.toContain(PAPERS.tomato);
    const d = dialSvg(pal(false), 200, [{ from: 480, to: 570, done: true }, { from: 600, to: 690 }, { from: 700, to: 700 }]);
    expect((d.match(new RegExp(`stroke="${PAPERS.tomato}"`, 'g')) ?? []).length).toBe(2);
    expect((d.match(/stroke-opacity="0\.3"/g) ?? []).length).toBe(1);
  });
  it('without the coloured papers it still draws, in tones mixed from the palette', () => {
    expect(compositeSvg(dialPal(C(false), false))).not.toMatch(/undefined|NaN/);
  });
  it('the dial has no moving ornament: one plate plus three hands is the whole document set', () => {
    const doc = compositeSvg(pal(true));
    expect(doc).not.toMatch(/animate|clipPath|<image/);
    expect((doc.match(/<g transform="rotate/g) ?? []).length).toBe(3);
  });
  it('every colour is the palette: ink, the card the dial is cut from, the accent pen, the shadow, or a tone mixed from them', () => {
    for (const dark of [false, true]) {
      const p = pal(dark), c = C(dark);
      expect(p).toMatchObject({ ink: c.ink, dial: c.card, second: c.acc, shadow: c.shadow });
      const doc = compositeSvg(p);
      const used = new Set([...doc.matchAll(/(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]!.toUpperCase()));
      for (const col of used) expect([p.ink, p.dial, p.second, p.mut, p.shadow, ...Object.values(PAPERS)].map((x) => x.toUpperCase())).toContain(col);
    }
  });
  it('the second hand is the only thing drawn in the accent', () => {
    expect(dialSvg(pal(false))).not.toContain(pal(false).second);
    expect(handSvg('hour', pal(false))).not.toContain(pal(false).second);
    expect(handSvg('second', pal(false))).toContain(pal(false).second);
  });
  it('hour and minute hands are told apart by length', () => {
    const reach = (xml: string) => Math.max(...[...xml.replace(/<svg[^>]*>/, '').matchAll(/[-](\d+(?:\.\d+)?)/g)].map((m) => +m[1]!));
    expect(reach(handSvg('minute', pal(false)))).toBeGreaterThan(reach(handSvg('hour', pal(false))) + 15);
  });
  it('at masthead size no hairline is thinner than ~0.6 dp', () => {
    const widths = [...dialSvg(pal(false), 115).matchAll(/stroke-width="([\d.]+)"/g)].map((m) => +m[1]! * (115 / 200));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(0.55);
  });
});

describe('the beat', () => {
  const src = readFileSync(join(__dirname, '..', 'ui', 'clock', 'ClockFace.tsx'), 'utf8');
  it('is one timer a second, aligned to the second — not a frame loop', () => {
    expect(src).not.toMatch(/useFrameCallback/);
    expect(src).toMatch(/setTimeout\(\(\) => beat\(true\), 1000 - \(now % 1000\)/);
  });
  it('runs only while the dial is live and unpinned, and stops when it is not', () => {
    expect(src).toMatch(/const ticking = live && !time;/);
    expect(src).toMatch(/if \(!ticking\) return;/);
    expect(src).toMatch(/return \(\) => \{ clearTimeout\(t\); sub\.remove\(\); \};/);
  });
  it('eases one step forward only: a resume, a clock change or midnight is set outright', () => {
    expect(src).toMatch(/a\.sa - last === 6 \? withTiming\(a\.sa, STEP\) : a\.sa/);
  });
  it('the second hand angle is cumulative within the day, so 59 → 0 is +6°, never −354°', () => {
    const a = handAngles(Date.UTC(2026, 0, 15, 10, 0, 59), 0), b = handAngles(Date.UTC(2026, 0, 15, 10, 1, 0), 0);
    expect(b.sa - a.sa).toBe(6);
    expect(handAngles(Date.UTC(2026, 0, 15, 0, 0, 0), 0).sa).toBe(0);
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
    // every beat reads the CURRENT offset, not a baked one
    expect(src).toMatch(/handAngles\(now, new Date\(\)\.getTimezoneOffset\(\) \* 60_000\)/);
    // and a resume re-reads at once instead of waiting out a stale timer
    expect(src).toMatch(/AppState\.addEventListener\('change'/);
  });

});
