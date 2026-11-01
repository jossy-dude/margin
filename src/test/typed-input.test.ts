/** v0.5 U1 — what a person types into a number, time or duration field, read leniently. */
import { parseClock, parseDuration, parseNumber } from '../domain/time';

describe('parseNumber', () => {
  it.each([['80', 80], [' 7,5 ', 7.5], ['7.5', 7.5], ['-2', -2], ['+3', 3], ['.5', 0.5]])('%s → %s', (t, n) => expect(parseNumber(t)).toBe(n));
  it.each(['', 'abc', '7.5.1', '1e3', '--2'])('%s is not a number', (t) => expect(parseNumber(t)).toBeNull());
});

describe('parseClock', () => {
  it.each([['930', 570], ['0930', 570], ['9:30', 570], ['9.30', 570], ['9h30', 570], ['9', 540], ['21', 1260], ['2105', 1265], ['0', 0], ['23:55', 1435]])('%s → %s', (t, m) => expect(parseClock(t)).toBe(m));
  it('am/pm', () => {
    expect(parseClock('9p')).toBe(21 * 60);
    expect(parseClock('9:30 pm')).toBe(21 * 60 + 30);
    expect(parseClock('12am')).toBe(0);
    expect(parseClock('12pm')).toBe(720);
  });
  it('on a 12-hour clock a bare hour keeps the half of the day the field was in', () => {
    expect(parseClock('230', true, 13 * 60)).toBe(14 * 60 + 30);
    expect(parseClock('230', true, 9 * 60)).toBe(2 * 60 + 30);
    expect(parseClock('14', true, 9 * 60)).toBe(14 * 60);
  });
  it.each(['24', '960', '9:75', 'noon', '13pm', ''])('%s is not a time', (t) => expect(parseClock(t)).toBeNull());
});

describe('parseDuration', () => {
  it.each([['90', 90], ['45m', 45], ['1h', 60], ['1h30', 90], ['1h 30m', 90], ['1.5h', 90], ['2d', 2880], ['1w', 10080], ['2 days', 2880], ['1 hour 15 min', 75], ['0', 0]])('%s → %s', (t, m) => expect(parseDuration(t)).toBe(m));
  it.each(['', 'soon', '2x', 'h', '1h banana'])('%s is not a duration', (t) => expect(parseDuration(t)).toBeNull());
});
