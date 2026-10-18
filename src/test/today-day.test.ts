import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dayBlock } from '../domain/attendance';
import { seedSnapshot } from '../data/seed';
import { addDays, mondayOf, startOfDay, ymd } from '../domain/time';
import type { Snapshot } from '../domain/types';

const MON8 = new Date(2026, 9, 5, 8).getTime(); // Monday 5 Oct 2026, 08:00 — the demo set's Monday
const SAT = addDays(mondayOf(MON8), 5); // what "tap Sat 10 in the This week strip" sets
const block = (now: number, picked: number | null, s: Snapshot = seedSnapshot(now)) => dayBlock(now, s.meetings, s.courses, s.attendance, s.dayMarks, picked);

describe('Today: the day-scoped half of the page is one day (BUG-022)', () => {
  it('the demo set really does give Monday four classes and Saturday none, so the two differ', () => {
    expect(block(MON8, null).periods.map((p) => p.label)).toEqual(['Intro to Economics', 'Discrete Mathematics', 'Emerging Technology', 'Computer Programming']);
    expect(block(MON8, SAT).periods).toHaveLength(0);
  });

  it('"Mark day" opens the selected day, and so does the strip sitting directly above it', () => {
    const b = block(MON8, SAT);
    expect(b.date).toBe('2026-10-10');
    expect(ymd(new Date(b.day))).toBe(b.date); // the date the button writes against
    expect(b.date).not.toBe(ymd(new Date(startOfDay(MON8)))); // …and not today's, which the page title shows
    expect(b.periods.every((p) => startOfDay(p.start) === b.day)).toBe(true); // the strip's classes are on that day too
  });

  it('every day-scoped readout comes from one day whatever the pick is', () => {
    for (const picked of [null, MON8, SAT, addDays(mondayOf(MON8), 2), addDays(mondayOf(MON8), -1)]) {
      const b = block(MON8, picked);
      expect({ date: b.date, periods: b.periods.map((p) => startOfDay(p.start)) }).toEqual({ date: ymd(new Date(b.day)), periods: b.periods.map(() => b.day) });
      expect(b.occ.every((o) => ymd(o.date) === b.date)).toBe(true);
    }
  });

  it('the day does not depend on when the screen was mounted — a clock ticking past midnight carries it', () => {
    // mounted 23:50 Monday, the 30 s `now` ticker rolls over to 00:05 Tuesday with no tap at all
    const mountedAt = new Date(2026, 9, 5, 23, 50).getTime(), ticked = new Date(2026, 9, 6, 0, 5).getTime();
    expect(block(ticked, null).date).toBe('2026-10-06');
    expect(block(ticked, null).date).toBe(block(ticked, null, seedSnapshot(ticked)).date);
    expect(block(ticked, null).date).not.toBe(ymd(new Date(startOfDay(mountedAt)))); // not stranded on the mount day
    expect(mountedAt).toBeLessThan(ticked); // …and that is a real midnight crossing, not a synthetic one
  });

  it('a pick the user made sticks across midnight rather than being overwritten by the new today', () => {
    expect(block(new Date(2026, 9, 6, 0, 5).getTime(), SAT).date).toBe('2026-10-10');
  });

  it('"in class" and "next up" stay about now, so they follow the live day, not the pick', () => {
    const live = block(MON8, null);
    expect(live.next?.label).toBe('Intro to Economics');
    expect(block(MON8, SAT).cur).toBeUndefined();
    expect(block(MON8, SAT).next).toBeUndefined();
  });
});

describe('Today.tsx wiring — the block above cannot see the file', () => {
  const src = readFileSync(join(__dirname, '../screens/Today.tsx'), 'utf8').split('\n');
  it('the page takes its day from dayBlock, so the strip and the button cannot drift apart', () => {
    expect(src.join('\n')).toContain('dayBlock(now, st.meetings, st.courses, st.attendance, st.dayMarks, picked)');
  });
  it('the selected day is no longer snapshotted out of the mount-time today', () => {
    expect(src.join('\n')).not.toContain('useState(today)');
    expect(src.join('\n')).toContain('useState<number | null>(null)');
  });
  it('"Mark day" and the day-mark label are keyed on the block\'s date, not on a second date', () => {
    expect(src.join('\n')).not.toMatch(/ymd\(new Date\(sel\)\)/);
    expect(src.filter((l) => l.includes('act.open({ t: \'status\', mode: \'day\'')).length).toBe(1);
    expect(src.join('\n')).toContain('st.dayMarks[selDate]');
  });
});