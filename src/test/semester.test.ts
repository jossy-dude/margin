import {
  clampToSemester, daysInMonth, inSemester, isYmd, semesterFirstDay, semesterLabel, semesterOf, stepYmd, suggestEnd, validRange, ymdOr,
} from '../domain/semester';
import { DAY_MS, startOfDay } from '../domain/time';

const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
const at = (y: number, m: number, d: number) => startOfDay(day(y, m, d));

/**
 * The semester is the one range three screens and the export all read. These tests pin the answers to
 * the three questions they ask — where it starts, what it is called, and whether a day is inside — plus
 * the two date-stepper primitives, because a wrong day is what a calendar-less picker produces.
 */
describe('semester range', () => {
  describe('isYmd is strict, because parseYmd is not', () => {
    it('accepts only a real YYYY-MM-DD', () => {
      expect(isYmd('2026-09-07')).toBe(true);
      expect(isYmd('2026-9-7')).toBe(false); // parseYmd would take this, and then Number('') would not
      expect(isYmd('')).toBe(false);
      expect(isYmd('not set')).toBe(false);
      expect(isYmd(null)).toBe(false);
      expect(isYmd(undefined)).toBe(false);
    });
  });

  describe('daysInMonth', () => {
    it('knows the month lengths, leap years included', () => {
      expect(daysInMonth(2026, 1)).toBe(31);
      expect(daysInMonth(2026, 2)).toBe(28);
      expect(daysInMonth(2024, 2)).toBe(29);
      expect(daysInMonth(2026, 4)).toBe(30);
      expect(daysInMonth(2026, 12)).toBe(31);
    });
  });

  describe('semesterOf', () => {
    it('reads a full range as local dates', () => {
      const s = semesterOf({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
      expect(s.start.getTime()).toBe(day(2026, 9, 7));
      expect(s.end?.getTime()).toBe(day(2026, 12, 20));
    });

    it('an empty or malformed start is 1 Jan 1970 and open-ended, never "inside every term"', () => {
      for (const start of ['', 'not set', undefined]) {
        const s = semesterOf({ semesterStart: start, semesterEnd: '2026-12-20' });
        expect(s.start.getTime()).toBe(day(1970, 1, 1));
        expect(s.end).toBeNull();
      }
    });

    it('an end before the start is treated as no end, so a bad setting cannot hide a term', () => {
      expect(semesterOf({ semesterStart: '2026-09-07', semesterEnd: '2026-08-01' }).end).toBeNull();
    });

    it('an empty end is open-ended', () => {
      expect(semesterOf({ semesterStart: '2026-09-07', semesterEnd: '' }).end).toBeNull();
    });
  });

  describe('inSemester', () => {
    const s = { semesterStart: '2026-09-07', semesterEnd: '2026-12-20' };

    it('includes both ends by local calendar day — the last day of term is a school day', () => {
      expect(inSemester(new Date(2026, 8, 7), s)).toBe(true);
      expect(inSemester(new Date(2026, 11, 20), s)).toBe(true);
      expect(inSemester(new Date(2026, 11, 20, 23, 59), s)).toBe(true); // any hour of the last day
      expect(inSemester(new Date(2026, 8, 6, 23, 59), s)).toBe(false);
      expect(inSemester(new Date(2026, 11, 21), s)).toBe(false);
    });

    it('an open end admits every day from the start onward', () => {
      expect(inSemester(new Date(2027, 5, 1), { semesterStart: '2026-09-07', semesterEnd: '' })).toBe(true);
      expect(inSemester(new Date(2026, 8, 6), { semesterStart: '2026-09-07', semesterEnd: '' })).toBe(false);
    });
  });

  describe('semesterLabel', () => {
    it('prints the year once when both ends share it', () => {
      expect(semesterLabel({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' })).toBe('7 Sep – 20 Dec 2026');
    });

    it('prints both years across the new year', () => {
      expect(semesterLabel({ semesterStart: '2026-09-07', semesterEnd: '2027-01-20' })).toBe('7 Sep 2026 – 20 Jan 2027');
    });

    it('says "from" for an open-ended term, and "not set" with no usable start', () => {
      expect(semesterLabel({ semesterStart: '2026-09-07', semesterEnd: '' })).toBe('from 7 Sep 2026');
      expect(semesterLabel({ semesterStart: '', semesterEnd: '' })).toBe('not set');
      expect(semesterLabel({ semesterStart: '07/09/2026', semesterEnd: '' })).toBe('not set');
    });
  });

  describe('clampToSemester', () => {
    const s = { semesterStart: '2026-09-07', semesterEnd: '2026-12-20' };

    it('pulls a time before the term to its first day', () => {
      expect(clampToSemester(day(2026, 8, 1, 12), s)).toBe(at(2026, 9, 7));
    });

    it('pulls a time after the term to the last millisecond of the end day', () => {
      expect(clampToSemester(day(2027, 1, 5), s)).toBe(at(2026, 12, 20) + DAY_MS - 1);
    });

    it('leaves a time inside the term, or after an open start, alone', () => {
      expect(clampToSemester(day(2026, 10, 1, 9), s)).toBe(day(2026, 10, 1, 9));
      expect(clampToSemester(day(2027, 1, 5), { semesterStart: '2026-09-07', semesterEnd: '' })).toBe(day(2027, 1, 5));
    });
  });

  describe('semesterFirstDay', () => {
    it('is the start of the first day when the setting is usable', () => {
      expect(semesterFirstDay({ semesterStart: '2026-09-07' }, day(2026, 10, 1))).toBe(at(2026, 9, 7));
    });

    it('falls back to 90 days ago, not 1970, when it is not', () => {
      const now = day(2026, 10, 1, 9);
      expect(semesterFirstDay({ semesterStart: '' }, now)).toBe(at(2026, 10, 1) - 90 * DAY_MS);
    });
  });

  describe('validRange', () => {
    it('needs a real start, and an end on or after it', () => {
      expect(validRange('2026-09-07', '')).toBe(true); // open-ended
      expect(validRange('2026-09-07', '2026-09-07')).toBe(true); // a one-day term is a range
      expect(validRange('2026-09-07', '2026-12-20')).toBe(true);
      expect(validRange('2026-09-07', '2026-09-06')).toBe(false);
      expect(validRange('', '2026-09-07')).toBe(false);
      expect(validRange('2026-09-07', 'soon')).toBe(false);
    });
  });

  describe('stepYmd moves one part and clamps the day', () => {
    it('moves years, months and days', () => {
      expect(stepYmd('2026-09-07', 'y', 1)).toBe('2027-09-07');
      expect(stepYmd('2026-09-07', 'm', 1)).toBe('2026-10-07');
      expect(stepYmd('2026-09-07', 'd', 1)).toBe('2026-09-08');
    });

    it('rolls months and years over', () => {
      expect(stepYmd('2026-12-07', 'm', 1)).toBe('2027-01-07');
      expect(stepYmd('2026-01-07', 'm', -1)).toBe('2025-12-07');
    });

    it('keeps a day step inside its own month — crossing months is the month stepper\'s job', () => {
      expect(stepYmd('2026-09-30', 'd', 1)).toBe('2026-09-30');
      expect(stepYmd('2026-01-01', 'd', -1)).toBe('2026-01-01');
    });

    it('clamps 31 Jan + 1 month to the end of February, leap year included', () => {
      expect(stepYmd('2026-01-31', 'm', 1)).toBe('2026-02-28');
      expect(stepYmd('2024-01-31', 'm', 1)).toBe('2024-02-29');
      expect(stepYmd('2026-03-31', 'm', -1)).toBe('2026-02-28');
    });

    it('stands on 1970 when the stored value is not a date', () => {
      expect(stepYmd('', 'd', 1)).toBe('1970-01-02');
    });
  });

  describe('suggestEnd seeds a real term, not a one-day semester', () => {
    it('is fifteen weeks after the start', () => {
      expect(suggestEnd('2026-09-07')).toBe('2026-12-21'); // the tour's hand-over default
    });

    it('lands on a real calendar date from a month-end start — 31 Nov is never printed', () => {
      const out = suggestEnd('2026-09-30');
      expect(out).toBe('2027-01-13');
      const [y, m, d] = out.split('-').map(Number) as [number, number, number];
      expect(isYmd(out)).toBe(true);
      expect(d).toBeLessThanOrEqual(daysInMonth(y, m));
    });

    it('handles February in a leap year and in a common year', () => {
      const leap = suggestEnd('2024-02-01');
      const common = suggestEnd('2026-02-01');
      expect(leap).toBe('2024-05-16');
      expect(common).toBe('2026-05-17');
      // …and a 29 February start stays real in the year that has one
      expect(suggestEnd('2024-02-29')).toBe('2024-06-13');
      for (const out of [leap, common, suggestEnd('2024-02-29')]) {
        const [y, m, d] = out.split('-').map(Number) as [number, number, number];
        expect(d).toBeLessThanOrEqual(daysInMonth(y, m));
      }
    });

    it('never seeds backwards and never seeds 1970', () => {
      for (const start of ['2026-01-01', '2026-01-31', '2026-09-07', '2026-12-31', '2024-02-29']) {
        const out = suggestEnd(start);
        expect(out > start).toBe(true); // YYYY-MM-DD sorts chronologically
        expect(out.startsWith('1970')).toBe(false);
      }
    });

    it('an empty or malformed start has no seed to give — it returns an empty string, not a guess', () => {
      // The choice: `''` rather than a fabricated date. The caller then shows an open range, and the
      // user sees that there is nothing to stand on instead of a 1970 end they must notice and undo.
      for (const bad of ['', 'not set', '7 Sep 2026', '2026-9-7']) expect(suggestEnd(bad)).toBe('');
    });
  });

  describe('ymdOr', () => {
    it('passes a real date through and falls back otherwise', () => {
      expect(ymdOr('2026-09-07', '2000-01-01')).toBe('2026-09-07');
      expect(ymdOr('', '2000-01-01')).toBe('2000-01-01');
      expect(ymdOr(null, '2000-01-01')).toBe('2000-01-01');
    });
  });
});
