export const DAY_MS = 86_400_000;
export const DW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MO = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1); };
/** Monday = 0 … Sunday = 6 */
export const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
export const startOfDay = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const addDays = (ms: number, n: number) => { const d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); };
export const mondayOf = (ms: number) => addDays(startOfDay(ms), -weekdayOf(new Date(ms)));
/** The day a day-picker is showing: today until the user picks one, then their pick. Derived from the
 *  live `now` rather than snapshotted, so a clock ticking past midnight carries it forward instead of
 *  stranding it on the day the screen happened to be mounted on. */
export const selectedDay = (now: number, picked: number | null) => picked ?? startOfDay(now);
/** "HH:MM" → minutes since midnight (tolerates bad input) */
export const hm = (t: string) => { const [h, m] = t.split(':'); return (Number(h) || 0) * 60 + (Number(m) || 0); };
export const fromMin = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
/** local wall-clock time on the day containing `dayMs` */
export const atTime = (dayMs: number, t: string) => { const d = new Date(startOfDay(dayMs)); d.setHours(0, hm(t), 0, 0); return d.getTime(); };
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const fmtClock = (sec: number) => {
  const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600);
  return (h ? `${h}:${pad(Math.floor(s / 60) % 60)}` : pad(Math.floor(s / 60))) + ':' + pad(s % 60);
};
export const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
/** `1 day` / `2 days`. Takes the singular unit and derives the plural, so the caller picks one word
 *  and the helper picks which of the two to print. Irregulars pass their own plural explicitly.
 *  The app had this inlined in a dozen places and Stats' streak line was the one that got it wrong
 *  ("streak 1 days"); zero takes the plural, which is what English does. */
export const plural = (n: number, unit: string, many = `${unit}s`) => `${n} ${Math.abs(n) === 1 ? unit : many}`;
/** A wall-clock time of day. `h12` prints it on a 12-hour clock, unpadded with an AM/PM suffix
 *  ("8:30 AM", "12:05 AM"); the default prints the app's own 24-hour "08:30".
 *
 *  The flag is an ARGUMENT, not a module global: `settings.hour12` is the one owner of the choice
 *  (`domain/` imports no store), and every call site that prints a time for the user passes it in.
 *  Domain-internal bodies the user does not read back (reminder notification text) keep the default
 *  until W5/W6 thread the setting out to the OS — see the note in `docs/DEVICE_CHECKLIST.md` §W4. */
export const fmtTime = (ms: number, h12 = false) => {
  const d = new Date(ms), m = pad(d.getMinutes());
  if (!h12) return `${pad(d.getHours())}:${m}`;
  const h = d.getHours();
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
};
/** A fixed, deterministic anchor day for `fmtHM`. `atTime` only ever reads the anchor's DAY and sets the
 *  time from the string, so the output is a pure function of the string — `Date.now()` here would make it
 *  depend on when it happened to run. */
const HM_ANCHOR = new Date(2000, 0, 1).getTime();
/** An `'HH:MM'` string — the format the notification settings store uses (`activeFrom`, `quietFrom`, …) —
 *  printed in the app's clock format by way of `fmtTime`. `h12` is the caller's `settings.hour12`, passed
 *  in like every other print of a wall clock (see `fmtTime`). */
export const fmtHM = (v: string, h12 = false) => fmtTime(atTime(HM_ANCHOR, v), h12);
export const fmtDay = (ms: number, now = Date.now()) => {
  const d = startOfDay(ms), t = startOfDay(now), diff = Math.round((d - t) / DAY_MS);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  const x = new Date(ms); return `${DW[weekdayOf(x)]} ${x.getDate()} ${MO[x.getMonth()]?.slice(0, 3)}`;
};
export const fmtWhen = (ms: number, now = Date.now(), h12 = false) => `${fmtDay(ms, now)} · ${fmtTime(ms, h12)}`;
/** How long until `at`, in words someone would say. Honest about a time that has already gone by: the
 *  OS queue can still hold an alarm the phone never fired, and reporting it as "in -3 min" or quietly
 *  as "next up" would be a lie about what the phone is going to do. */
export function relFire(at: number, now = Date.now()): string {
  const d = at - now, m = Math.round(Math.abs(d) / 60_000);
  if (m === 0) return 'due now';
  if (d < 0) return m < 60 ? `${m} min overdue` : m < 1440 ? `${Math.round(m / 60)} h overdue` : `${Math.round(m / 1440)} d overdue`;
  return m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}m` : ''}` : `in ${Math.round(m / 1440)} d`;
}
export const uid = (() => { let n = 0; return (p = 'x') => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; })();

/* ── typed input (v0.5 U1) ──────────────────────────────────────────────────────────────────────
 * What a person types into a number, time or duration field, read leniently. Each returns `null` for
 * text that is not one, so the field can put the old value back instead of guessing. */

/** A number as typed on any keyboard: `7.5`, `7,5`, ` 80 `, `-2`. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * A time of day as typed, in minutes after midnight: `930` and `0930` → 9:30, `9:30`, `9.30`, `9h30`,
 * `9` → 9:00, `21` → 21:00, `9p` / `9:30 pm` → 21:30, `12am` → 0:00. With `hour12` and no am/pm, an hour
 * from 1 to 12 keeps the half of the day `near` is in, so retyping `930` on an afternoon field stays PM.
 */
export function parseClock(text: string, hour12 = false, near = 0): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(t) ?? /^(\d)(\d{2})(am|pm|a|p)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]); const min = m[2] === undefined ? 0 : Number(m[2]); const ap = m[3]?.[0];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === 'p' ? 12 : 0);
  } else {
    if (h > 23) return null;
    if (hour12 && h >= 1 && h <= 12) h = (h % 12) + (near >= 720 ? 12 : 0);
  }
  return h * 60 + min;
}

/**
 * A duration as typed, in minutes: `90`, `45m`, `1h`, `1h30`, `1h 30m`, `1.5h`, `2d`, `1w`, `2 days`,
 * `1 hour 15 min`. A bare number is minutes. Fractions round to the nearest minute.
 */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t));
  const UNIT: Record<string, number> = { w: 10080, week: 10080, weeks: 10080, d: 1440, day: 1440, days: 1440, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, m: 1, min: 1, mins: 1, minute: 1, minutes: 1 };
  const re = /(\d+(?:\.\d+)?)\s*([a-z]+)?/g;
  let total = 0, seen = 0, prevUnit = 0, consumed = '';
  for (let x = re.exec(t); x; x = re.exec(t)) {
    const n = Number(x[1]);
    /* `1h30`: a trailing bare number after hours means minutes. */
    const u = x[2] ? UNIT[x[2]] : prevUnit === 60 ? 1 : undefined;
    if (u === undefined) return null;
    total += n * u; prevUnit = u; seen++; consumed += x[0];
  }
  if (!seen || consumed.replace(/\s/g, '') !== t.replace(/\s/g, '')) return null;
  return Math.round(total);
}
/** A finished task's line (phone test #10): how late it was WHEN it was finished, not time since. The old
 *  `relDue(completedAt).replace('in ', '')` turned "0 min late" into "0 mlate" and kept growing. */
export function doneLine(dueAt: number, completedAt: number): string {
  const m = Math.round((completedAt - dueAt) / 60_000);
  if (m <= 0) return 'done on time';
  return `done ${m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`} late`;
}
