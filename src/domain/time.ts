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
/** One box per character of a clock string, for the Ticker's digit row.
 *
 *  `key` is the character's **distance from the right**, not its index. That matters because
 *  `fmtClock` is not a fixed width: it is `MM:SS` under an hour and `H:MM:SS` over it, so an
 *  index key re-purposes the seconds-tens box as the minute-ones box the moment a round passes an
 *  hour. Keying from the right keeps every shared slot on the same key across that boundary and
 *  gives the two newly-appeared slots (the leading `H:`) keys nothing else had. */
export interface ClockCell { key: string; ch: string; colon: boolean }
export const clockCells = (txt: string): ClockCell[] => [...txt].map((ch, i) => ({ key: `${ch === ':' ? 'c' : 'd'}${txt.length - 1 - i}`, ch, colon: ch === ':' }));
export const fmtDur = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min}m`);
/** `1 day` / `2 days`. Takes the singular unit and derives the plural, so the caller picks one word
 *  and the helper picks which of the two to print. Irregulars pass their own plural explicitly.
 *  The app had this inlined in a dozen places and Stats' streak line was the one that got it wrong
 *  ("streak 1 days"); zero takes the plural, which is what English does. */
export const plural = (n: number, unit: string, many = `${unit}s`) => `${n} ${Math.abs(n) === 1 ? unit : many}`;
export const fmtTime = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDay = (ms: number, now = Date.now()) => {
  const d = startOfDay(ms), t = startOfDay(now), diff = Math.round((d - t) / DAY_MS);
  if (diff === 0) return 'Today'; if (diff === 1) return 'Tomorrow'; if (diff === -1) return 'Yesterday';
  const x = new Date(ms); return `${DW[weekdayOf(x)]} ${x.getDate()} ${MO[x.getMonth()]?.slice(0, 3)}`;
};
export const fmtWhen = (ms: number, now = Date.now()) => `${fmtDay(ms, now)} · ${fmtTime(ms)}`;
export const uid = (() => { let n = 0; return (p = 'x') => `${p}${Date.now().toString(36)}${(n++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; })();
