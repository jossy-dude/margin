/**
 * v0.7 R9 — reminder rules that read as sentences (DESIGN.md D-19): "1 h before first class · Mon–Fri · Leave the
 * house". A rule is an offset from an anchor on chosen days; anchors move with the timetable, so "first class"
 * follows a cancelled or moved class like the class alarm does. Stored in `settings.reminders` (no migration) and
 * delivered as notifications through the existing planner (within its cap, quiet hours respected).
 */
import type { Meeting, Task } from './types';
import type { ClassMove } from './moves';
import { occurrencesOn } from './attendance';

export type Anchor =
  | { kind: 'firstClass' } | { kind: 'lastClass' } | { kind: 'everyClass' }
  | { kind: 'course'; courseId: string } | { kind: 'component'; componentId: string }
  | { kind: 'exam' } | { kind: 'taskDue' }
  | { kind: 'time'; at: string };
export interface ReminderRule {
  id: string; enabled: boolean;
  /** minutes relative to the anchor: −60 = 1 h before, 15 = 15 min after; ignored for `time` */
  offsetMin: number;
  anchor: Anchor;
  /** Sunday-first, like Date.getDay() */
  days: boolean[];
  text: string;
  ringInQuiet?: boolean;
}
export interface RuleHit { ruleId: string; at: number; text: string; key: string }

const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const at = (day: Date, minutes: number) => { const d = new Date(day); d.setHours(0, 0, 0, 0); return d.getTime() + minutes * 60_000; };

/** Every time a rule fires between `from` and `to` (ms). `cancelled` holds occurrence keys that do not happen. */
export function ruleHits(rule: ReminderRule, i: { meetings: Meeting[]; moves?: readonly ClassMove[]; tasks: Task[]; from: number; to: number; cancelled?: ReadonlySet<string> }): RuleHit[] {
  if (!rule.enabled) return [];
  const out: RuleHit[] = [];
  const push = (ms: number, key: string) => { if (ms >= i.from && ms < i.to) out.push({ ruleId: rule.id, at: ms, text: rule.text, key: `${rule.id}|${key}` }); };
  const a = rule.anchor;
  if (a.kind === 'exam' || a.kind === 'taskDue') {
    for (const t of i.tasks) {
      if (t.status === 2 || t.dueAt === null || (a.kind === 'exam' && t.kind !== 'exam')) continue;
      const ms = t.dueAt + rule.offsetMin * 60_000;
      if (rule.days[new Date(ms).getDay()]) push(ms, t.id);
    }
    return out.sort((x, y) => x.at - y.at);
  }
  // one pass per day, with a day's margin either side so an offset can cross midnight
  const start = new Date(i.from - 86_400_000); start.setHours(0, 0, 0, 0);
  for (let d = new Date(start); d.getTime() < i.to + 86_400_000; d.setDate(d.getDate() + 1)) {
    const day = new Date(d);
    if (a.kind === 'time') { if (rule.days[day.getDay()]) push(at(day, hm(a.at)), day.toDateString()); continue; }
    const occ = occurrencesOn(day, i.meetings, i.moves).filter((o) => !i.cancelled?.has(`${day.toDateString()}|${o.meeting.id}`));
    const pick = a.kind === 'firstClass' ? occ.slice(0, 1)
      : a.kind === 'lastClass' ? occ.slice(-1)
      : a.kind === 'course' ? occ.filter((o) => o.meeting.courseId === a.courseId)
      : a.kind === 'component' ? occ.filter((o) => (o.meeting.variantId ?? `${o.meeting.courseId}~base`) === a.componentId)
      : occ;
    for (const o of pick) {
      const base = a.kind === 'lastClass' ? hm(o.meeting.end) : hm(o.meeting.start);
      const ms = at(day, base + rule.offsetMin);
      if (rule.days[new Date(ms).getDay()]) push(ms, `${day.toDateString()}|${o.meeting.id}`);
    }
  }
  return out.sort((x, y) => x.at - y.at);
}

/** The sentence a rule reads as: "1 h before first class · Mon–Fri". */
export function ruleSentence(r: ReminderRule, courseName: (id: string) => string = (x) => x): string {
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const abs = Math.abs(r.offsetMin);
  const amt = abs === 0 ? '' : abs % 60 === 0 ? `${abs / 60} h` : abs > 60 ? `${Math.floor(abs / 60)} h ${abs % 60} min` : `${abs} min`;
  const rel = r.offsetMin === 0 ? 'At' : `${amt} ${r.offsetMin < 0 ? 'before' : 'after'}`;
  const a = r.anchor;
  const what = a.kind === 'firstClass' ? 'first class' : a.kind === 'lastClass' ? 'the end of the last class' : a.kind === 'everyClass' ? 'every class'
    : a.kind === 'course' ? `every ${courseName(a.courseId)}` : a.kind === 'component' ? `every ${courseName(a.componentId)}`
    : a.kind === 'exam' ? 'any exam' : a.kind === 'taskDue' ? 'any task due' : '';
  const head = a.kind === 'time' ? a.at : `${rel} ${what}`;
  const on = r.days.every(Boolean) ? 'every day' : r.days.join() === [false, true, true, true, true, true, false].join() ? 'Mon–Fri'
    : r.days.join() === [true, false, false, false, false, false, true].join() ? 'weekends' : DAYS.filter((_, k) => r.days[k]).join(' ');
  return `${head} · ${on}`;
}

/** The six starting points on the Reminders page. */
export const RULE_TEMPLATES: Omit<ReminderRule, 'id'>[] = [
  { enabled: true, offsetMin: -60, anchor: { kind: 'firstClass' }, days: [false, true, true, true, true, true, false], text: 'Leave the house' },
  { enabled: true, offsetMin: -20 * 60 + 0, anchor: { kind: 'firstClass' }, days: [true, true, true, true, true, false, false], text: 'Pack your bag for tomorrow' },
  { enabled: true, offsetMin: -20, anchor: { kind: 'everyClass' }, days: [false, true, true, true, true, true, false], text: 'Class in 20 minutes' },
  { enabled: true, offsetMin: -16 * 60, anchor: { kind: 'exam' }, days: [true, true, true, true, true, true, true], text: 'Exam tomorrow: pack calculator and ID' },
  { enabled: true, offsetMin: 0, anchor: { kind: 'time', at: '19:00' }, days: [true, false, false, false, false, false, false], text: 'Plan the week' },
  { enabled: true, offsetMin: 15, anchor: { kind: 'lastClass' }, days: [false, true, true, true, true, true, false], text: 'Return the library book' },
];
