import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plural } from '../domain/time';
import { streak } from '../domain/analytics';
import { seedSnapshot } from '../data/seed';

/** The exact sub-line Stats draws under "Tasks finished" (src/screens/Stats.tsx). Modelled here so
 *  the copy is asserted against the real `streak()` output rather than against a hand-written stub. */
const doneCardSub = (totalDone: number, current: number) => `${totalDone} in the last 15 weeks · streak ${plural(current, 'day')}`;

describe('pluralisation (BUG-029)', () => {
  it('"streak 1 days" is gone: one day reads "1 day"', () => {
    expect(doneCardSub(1, 1)).toBe('1 in the last 15 weeks · streak 1 day');
    expect(doneCardSub(1, 1)).not.toContain('1 days');
  });

  it('the counts around it are still right', () => {
    expect(doneCardSub(0, 0)).toBe('0 in the last 15 weeks · streak 0 days'); // zero takes the plural
    expect(doneCardSub(7, 3)).toBe('7 in the last 15 weeks · streak 3 days');
    expect(doneCardSub(1, 2)).toBe('1 in the last 15 weeks · streak 2 days');
  });

  it('plural() agrees with the idiom the rest of the app already used', () => {
    for (const n of [0, 1, 2, 5, 11, 21, 100]) expect(plural(n, 'day')).toBe(n === 1 ? '1 day' : `${n} days`);
    // the "1 reminder" / "3 reminders" shape in Settings, and the negative week offsets in Week
    for (const n of [0, 1, 2]) expect(plural(n, 'reminder')).toBe(`${n} reminder${n === 1 ? '' : 's'}`);
    expect(plural(-1, 'week')).toBe('-1 week'); // Week.tsx renders "-1 week ago", not "-1 weeks ago"
    expect(plural(-2, 'week')).toBe('-2 weeks');
    expect(plural(1, 'y', 'ies')).toBe('1 y'); // irregular units pass their own plural
    expect(plural(3, 'y', 'ies')).toBe('3 ies');
  });

  it('the streak it is fed is real: one finished task on one day gives a 1-day streak', () => {
    // so the "1 day" case above is a state the app can actually reach, not a synthetic one
    expect(streak([0, 0, 0, 1, 1]).current).toBe(2);
    expect(streak([0, 0, 1, 0, 0]).current).toBe(0); // a gap breaks it
    expect(streak([0, 0, 0, 0, 1]).current).toBe(1); // exactly the shape that read "1 days"
    const finished = seedSnapshot(new Date(2026, 9, 5).getTime()).tasks.filter((t) => t.status === 2);
    expect(finished.length).toBeGreaterThan(0);
    expect(finished.every((t) => t.completedAt !== null)).toBe(true); // and they carry the date the streak counts
  });

  it('and it is the plural helper the screen uses, not a copy that can drift', () => {
    const stats = readFileSync(join(__dirname, '../screens/Stats.tsx'), 'utf8');
    expect(stats).toContain("streak ${plural(ds.current, 'day')}");
    expect(stats).not.toMatch(/streak \$\{[^}]*\} days/); // the old shape is gone
  });
});