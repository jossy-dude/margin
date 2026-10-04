import { freeMinutes, latestStart, type Ctx } from '../domain/reminders';
import { DEFAULT_NOTIF } from '../domain/defaults';
import type { NotifSettings } from '../domain/types';

const MIN = 60_000, S15 = 15 * MIN;
const hm = (t: string) => { const [h, m] = t.split(':'); return (Number(h) || 0) * 60 + (Number(m) || 0); };
const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;

/** Pre-optimization slot-stepping implementations, kept verbatim as the semantic oracle. */
function refFreeMinutes(from: number, to: number, c: Ctx): number {
  let n = 0;
  for (let t = from; t < to; t += S15) {
    const d = new Date(t), wd = weekdayOf(d), m = d.getHours() * 60 + d.getMinutes();
    if (!c.s.activeDays[wd] || m < hm(c.s.activeFrom) || m >= hm(c.s.activeTo)) continue;
    if (c.busy.some(([x, y]) => t >= x && t < y)) continue;
    n += Math.min(15, (to - t) / MIN);
  }
  return n;
}
function refLatestStart(due: number, needMin: number, c: Ctx): number {
  let got = 0, t = due;
  for (let n = 0; n < 24 * 4 * 21 && got < needMin; n++) {
    t -= S15; const d = new Date(t), wd = weekdayOf(d), m = d.getHours() * 60 + d.getMinutes();
    if (!c.s.activeDays[wd] || m < hm(c.s.activeFrom) || m >= hm(c.s.activeTo)) continue;
    if (c.busy.some(([x, y]) => t >= x && t < y)) continue;
    got += 15;
  }
  return t;
}

/** Deterministic LCG so failures reproduce. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const merge = (a: [number, number][]): [number, number][] => {
  a.sort((x, y) => x[0] - y[0]);
  const m: [number, number][] = [];
  for (const iv of a) {
    const last = m[m.length - 1];
    if (last && iv[0] <= last[1]) { if (iv[1] > last[1]) last[1] = iv[1]; } else m.push([iv[0], iv[1]]);
  }
  return m;
};
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

const BASE = new Date(2026, 9, 5, 7, 13, 29, 411).getTime();

function randomSettings(r: () => number): NotifSettings {
  // Keep bounds out of [00:00, 04:00): on DST-transition days a bound inside the
  // skipped/ambiguous hour is interpreted differently by setHours vs the per-slot
  // local-reading check — a calendar corner, not a logic difference.
  const a0 = 4 * 60 + Math.floor(r() * (1440 - 4 * 60));
  const a1 = r() < 0.05
    ? Math.floor(r() * 1440) // occasionally inverted (must yield zero free time)
    : Math.min(a0 + 30 + Math.floor(r() * (1440 - a0)), 1439);
  return {
    ...DEFAULT_NOTIF,
    activeDays: Array.from({ length: 7 }, () => r() > 0.2),
    activeFrom: hhmm(a0), activeTo: hhmm(a1),
  };
}
function randomBusy(r: () => number, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.floor(r() * 30);
  for (let i = 0; i < n; i++) {
    const x = from + Math.floor(r() * Math.max(1, to - from));
    const len = Math.floor(r() * 4 * S15) + S15 / 7; // some sub-15-min, some multi-slot
    out.push([x, x + len]);
  }
  return merge(out);
}

describe('freeMinutes / latestStart closed form == slot-stepping oracle', () => {
  it('matches on randomized settings, busy spans, off-grid anchors and partial tails', () => {
    const r = rng(20261005);
    for (let i = 0; i < 400; i++) {
      const s = randomSettings(r);
      const spanFrom = BASE + Math.floor((r() - 0.3) * 45 * 86400000);
      const busy = randomBusy(r, spanFrom - 86400000, spanFrom + 60 * 86400000);
      const c: Ctx = { s, busy };
      // freeMinutes: random from/to including sub-15-min tails and multi-week spans
      const from = spanFrom + Math.floor(r() * 1000 * MIN);
      const to = from + Math.floor(r() * 25 * 86400000) + Math.floor(r() * 40 * MIN);
      expect(freeMinutes(from, to, c)).toBe(refFreeMinutes(from, to, c));
      // latestStart: random dues and needs (0, tiny, huge enough to exhaust the 21-day walk)
      const due = spanFrom + Math.floor(r() * 45 * 86400000);
      const need = r() < 0.1 ? 0 : Math.floor(r() * 3 * 21 * 1440);
      expect(latestStart(due, need, c)).toBe(refLatestStart(due, need, c));
    }
  });
  it('matches known boundaries: zero-length ranges, exhausted walks, inverted hours, empty busy', () => {
    const cases: Ctx[] = [
      { s: DEFAULT_NOTIF, busy: [] },
      { s: { ...DEFAULT_NOTIF, activeFrom: '22:00', activeTo: '06:00' }, busy: [[BASE + MIN, BASE + 40 * MIN]] },
      { s: { ...DEFAULT_NOTIF, activeDays: [false, false, false, false, false, false, false] }, busy: [] },
      { s: { ...DEFAULT_NOTIF, activeFrom: '00:00', activeTo: '23:59' }, busy: merge([[BASE, BASE + 3 * 86400000]]) },
      { s: { ...DEFAULT_NOTIF, activeFrom: '04:00', activeTo: '24:00' }, busy: merge([[BASE + 3600000, BASE + 86400000 + 7200000], [BASE + 2 * 86400000, BASE + 2 * 86400000 + 1800000]]) },
    ];
    const froms = [BASE, BASE + 37, BASE + S15 - 1, BASE + 21 * 86400000];
    for (const c of cases) {
      for (const from of froms) {
        for (const dur of [0, 1, S15, S15 + 1, 17 * MIN, 23 * 86400000 + 7, 30 * 86400000]) {
          expect(freeMinutes(from, from + dur, c)).toBe(refFreeMinutes(from, from + dur, c));
        }
        for (const need of [0, 1, 14, 15, 16, 120, 100000, 9999999]) {
          expect(latestStart(from, need, c)).toBe(refLatestStart(from, need, c));
        }
        expect(freeMinutes(from + 10 * MIN, from, c)).toBe(0);
      }
    }
  });
});
