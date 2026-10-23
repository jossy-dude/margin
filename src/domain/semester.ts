import { DAY_MS, MO, pad, parseYmd, startOfDay } from './time';

/**
 * The semester, as a range of local calendar days.
 *
 * `settings.semesterStart` existed from v0.1 and `semesterEnd` arrived in v0.3.1. Everything that used
 * to `parseYmd(settings.semesterStart)` directly now goes through here, because three questions are
 * asked of the range — where the attendance grid starts, what the semester is called, and whether a
 * given day is inside it — and three local re-derivations of "which day is the start" is how the grid
 * and the export came to disagree about the same term.
 *
 * `end: null` means open-ended, and that is the default (`semesterEnd: ''`): a term whose last day is
 * not known yet must not hide the attendance the user is marking today.
 */
export interface SemesterSpan { start: Date; end: Date | null }

/** The fields every helper needs. `Settings` satisfies it, and so does a `Partial<Settings>` patch. */
type Range = { semesterStart?: string; semesterEnd?: string };

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict `YYYY-MM-DD`. `parseYmd` is deliberately lenient (`Number()` coercion), so a stored
 *  `"not set"` would become 1 Jan 1970 and every range check would then say "inside the semester". */
export const isYmd = (v: string | null | undefined): v is string => typeof v === 'string' && YMD.test(v);

/** Days in a 1-based month. `new Date(y, m, 0)` is the last day of month `m` (JS months are 0-based). */
export const daysInMonth = (year: number, month: number): number => new Date(year, month, 0).getDate();

/** `v` when it is a real `YYYY-MM-DD`, otherwise `fallback`. Used by the date steppers, which need a
 *  day to stand on even when the stored setting is empty or damaged. */
export const ymdOr = (v: string | null | undefined, fallback: string): string => (isYmd(v) ? v : fallback);

/**
 * Move one part of a `YYYY-MM-DD` value. The year and month roll over properly; the day is clamped to
 * the month it lands in, so 31 Jan + 1 month is 28/29 Feb rather than an invalid date string. The UI's
 * day stepper is bounded by `daysInMonth`, so the clamp is a safety net for a typed or imported value
 * rather than the normal path.
 */
export function stepYmd(v: string, part: 'y' | 'm' | 'd', n: number): string {
  const base = parseYmd(ymdOr(v, '1970-01-01'));
  let y = base.getFullYear(), m = base.getMonth() + 1;
  let d = base.getDate();
  if (part === 'y') y += n;
  else if (part === 'm') { const total = y * 12 + (m - 1) + n; y = Math.floor(total / 12); m = ((total % 12) + 12) % 12 + 1; }
  else d += n;
  d = Math.min(Math.max(1, d), daysInMonth(y, m));
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

/** Fifteen weeks of teaching. Long enough to be a real term, short enough that the last day is a
 *  deadline the user edits rather than a horizon they never look at. */
const TERM_DAYS = 15 * 7;

/**
 * A starting guess for the last day of term, for when "No end date" is turned off.
 *
 * Seeding the end with the start itself made a one-day semester: the range looked set, but `inSemester`
 * admitted only that single day and the attendance grid stopped there. Fifteen weeks later is a term.
 * This is only a **seed** — the end is a calendar day the steppers own from the first press, and a
 * deliberately one-day term can still be typed in by hand; nothing here clamps a value the user set.
 *
 * The day is re-clamped through `daysInMonth` so the result is always a real date (31 Nov cannot be
 * printed), and an unusable start returns `''` rather than a fabricated 1970 end: the caller then has
 * nothing to stand on, which the label shows honestly, instead of a number the user must notice and undo.
 */
export function suggestEnd(start: string): string {
  if (!isYmd(start)) return '';
  const d = parseYmd(start);
  d.setDate(d.getDate() + TERM_DAYS);
  const y = d.getFullYear(), m = d.getMonth() + 1;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(Math.min(d.getDate(), daysInMonth(y, m)))}`;
}

/** The stored range as dates. A missing or malformed start reads as 1 Jan 1970 — the "no lower bound"
 *  answer every caller already had — and an end earlier than the start is treated as no end at all:
 *  a bad setting must not silently hide a whole term's attendance. */
export function semesterOf(s: Range): SemesterSpan {
  if (!isYmd(s.semesterStart)) return { start: new Date(1970, 0, 1), end: null };
  const start = parseYmd(s.semesterStart);
  if (!isYmd(s.semesterEnd)) return { start, end: null };
  const end = parseYmd(s.semesterEnd);
  return { start, end: startOfDay(end.getTime()) >= startOfDay(start.getTime()) ? end : null };
}

/** Is this day inside the semester? Both ends are inclusive by local calendar day — the last day of
 *  term is a school day. An empty end is always inside. */
export function inSemester(date: Date, s: Range): boolean {
  const { start, end } = semesterOf(s);
  const d = startOfDay(date.getTime());
  if (d < startOfDay(start.getTime())) return false;
  return end === null || d <= startOfDay(end.getTime());
}

const shortMonth = (m: number) => MO[m]?.slice(0, 3) ?? '';

/**
 * How the term is printed: `"7 Sep – 20 Dec 2026"` when both dates share a year, `"7 Sep 2026 –
 * 20 Jan 2027"` across the new year, `"from 7 Sep 2026"` when open-ended, `"not set"` when there is
 * no usable start. The year is printed once when it is the same on both ends — repeating it is noise
 * in the one line this label has to live in.
 */
export function semesterLabel(s: Range): string {
  if (!isYmd(s.semesterStart)) return 'not set';
  const { start, end } = semesterOf(s);
  const head = `${start.getDate()} ${shortMonth(start.getMonth())}`;
  if (end === null) return `from ${head} ${start.getFullYear()}`;
  const tail = `${end.getDate()} ${shortMonth(end.getMonth())}`;
  return start.getFullYear() === end.getFullYear()
    ? `${head} – ${tail} ${start.getFullYear()}`
    : `${head} ${start.getFullYear()} – ${tail} ${end.getFullYear()}`;
}

/** `now`, pulled inside the semester. Before the term it is the first day (so an export is not an empty
 *  file on the day the user sets the range); after it, the last millisecond of the end day. */
export function clampToSemester(now: number, s: Range): number {
  const { start, end } = semesterOf(s);
  const first = startOfDay(start.getTime());
  if (now < first) return first;
  if (end === null) return now;
  const last = startOfDay(end.getTime()) + DAY_MS - 1;
  return Math.min(now, last);
}

/** The first day the app should count attendance from. A malformed start falls back to 90 days ago
 *  rather than 1970: the old export path did exactly that, and a loop from 1970 would be 20 000 days
 *  of empty occurrences on every export. */
export function semesterFirstDay(s: Range, now: number): number {
  return isYmd(s.semesterStart) ? startOfDay(parseYmd(s.semesterStart).getTime()) : startOfDay(now - 90 * DAY_MS);
}

/** Can this pair be saved? A missing end is valid (open-ended); both present must be real dates with
 *  the end on or after the start. The UI asks this before committing, so an invalid edit is never
 *  written and never silently clamped. */
export function validRange(start: string, end: string): boolean {
  if (!isYmd(start)) return false;
  if (!end) return true;
  if (!isYmd(end)) return false;
  return startOfDay(parseYmd(end).getTime()) >= startOfDay(parseYmd(start).getTime());
}
