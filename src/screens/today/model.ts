import type { AttRecord, Course, DayMark, Meeting, Notice, SubjectVariant, Task } from '../../domain/types';
import { effective, isCancelled, occEnd, occKey, occurrencesOn, statusLabel } from '../../domain/attendance';
import { DW, MO, addDays, atTime, fmtTime, mondayOf, plural, startOfDay, weekdayOf, ymd } from '../../domain/time';
import { roomOf } from '../../domain/rooms';
import type { ClassMove } from '../../domain/moves';
import { bubbleOf, bubbleWords, type BubbleState } from '../../ui/Bubble';
import type { FaceName } from '../../ui/mascot/faces';
import { pageFace } from '../../ui/mascot/moments';

/**
 * Today v2 (DESIGN.md D-11), as one pure function of the store and the clock: `todayView(input) → TodayVM`. The
 * screen draws the view-model and nothing else, so every state the owner named is a unit test (v2-today-model):
 * in class, between classes, before the first, after the last ("Done for today" when the day had classes, F6),
 * no classes, two classes at once, and a picked day. The current class is shown once: whatever the Now card is
 * about is never repeated in the rows under it (C1).
 *
 * Times are absolute ms; the card's countdown is a `target` the card formats with its own 1 Hz clock, so the page
 * itself only needs the 30 s cadence (which lands exactly on the minute, where every class boundary is).
 */

export type NowState = 'inClass' | 'between' | 'before' | 'after' | 'none' | 'picked';

/** One class occurrence, ready to draw. */
export interface ClassItem {
  /** the attendance key (`occKey`), also the React key */
  key: string; date: string; meetingId: string; courseId: string;
  name: string; part: string; room: string; teacher: string;
  start: number; end: number; range: string;
  bubble: BubbleState; cancelled: boolean; live: boolean; over: boolean;
  /** one sentence for TalkBack, attendance included */
  spoken: string;
}
/** The countdown: `left` runs to the end of the class, `until` to the start of the next one. */
export interface Countdown { kind: 'left' | 'until'; target: number }
export interface Track { from: number; to: number; stops: { start: number; end: number; bubble: BubbleState; label: string; cancelled: boolean }[] }
export interface NowCardVM {
  state: NowState;
  title: string; meta: string; room: string;
  /** where the class sits in the day: "class 1 of 3", "first of 3"; '' when it says nothing */
  position: string;
  count: Countdown | null;
  /** the attendance bubble button, only while a class is running */
  mark: { key: string; date: string; title: string; bubble: BubbleState } | null;
  track: Track | null;
  /** the line under the track: what comes after, or tomorrow's first class */
  next: string | null;
  /** two classes in one slot: one tab each; the card follows the chosen one */
  tabs: { label: string; on: boolean }[] | null;
  /** a picked day: its timetable lives inside the card */
  rows: ClassItem[];
  /** which classes the card's slot holds (their keys joined): a remembered tab only applies to the same slot */
  slot: string;
}
export interface DueRow { id: string; title: string; when: string; late: boolean; course: string; courseId: string | null }
export interface WeekPill { day: number; dw: string; date: number; isToday: boolean; selected: boolean; bubbles: BubbleState[]; label: string }
export interface TodayVM {
  dateLine: string; greeting: string; face: FaceName;
  isToday: boolean; selDay: number; selDate: string;
  card: NowCardVM;
  later: ClassItem[]; earlier: ClassItem[]; earlierSummary: string;
  /** the whole-day mark on the selected day, as words ("Absent · Sick"), or null */
  dayMark: string | null;
  week: WeekPill[];
  due: { overdue: DueRow[]; moreOverdue: number; today: DueRow[]; next: DueRow[]; empty: boolean; summary: string };
  notes: { id: string; text: string; meta: string }[];
}
export interface TodayInput {
  now: number;
  /** the day the user picked in the week strip (any ms inside it), or null for today */
  picked: number | null;
  /** which class of a two-at-once slot the card is about (0 = the first) */
  pick?: number;
  meetings: Meeting[]; courses: Course[]; variants: SubjectVariant[];
  attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>;
  tasks: Task[]; notices: Notice[];
  hour12: boolean; name: string;
  /** one-off class moves (`settings.moves`, R2): a class moved this week shows where it went */
  moves?: readonly ClassMove[];
}

const shortDay = (ms: number) => { const d = new Date(ms); return `${DW[weekdayOf(d)]} ${d.getDate()} ${MO[d.getMonth()]?.slice(0, 3)}`; };

/** Every class on `day`, in start order, with its attendance and its words. */
export function classesOn(day: number, i: Pick<TodayInput, 'now' | 'meetings' | 'courses' | 'variants' | 'attendance' | 'dayMarks' | 'hour12' | 'moves'>): ClassItem[] {
  const date = new Date(startOfDay(day));
  return occurrencesOn(date, i.meetings, i.moves).map(({ meeting: m }) => {
    const course = i.courses.find((c) => c.id === m.courseId), v = m.variantId ? i.variants.find((x) => x.id === m.variantId) : undefined;
    const e = effective(date, m, i.attendance, i.dayMarks, i.now), start = atTime(date.getTime(), m.start), end = occEnd(date.getTime(), m);
    const cancelled = isCancelled(e), live = !cancelled && i.now >= start && i.now < end, over = end <= i.now;
    const bubble: BubbleState = live && !e.explicit ? 'now' : bubbleOf(e.status ? { status: e.status, why: e.why } : null);
    const name = course?.name ?? 'Class', part = v?.name.trim() ?? '', room = roomOf(m, course, i.variants), teacher = (v?.teacher.trim() || course?.teacher.trim()) ?? '';
    const range = `${fmtTime(start, i.hour12)}–${fmtTime(end, i.hour12)}`;
    const said = !e.status ? (live ? 'on now' : 'not marked yet') : e.inferred ? 'present, not marked yet' : statusLabel(e.status, e.why).toLowerCase();
    return {
      key: occKey(ymd(date), m), date: ymd(date), meetingId: m.id, courseId: m.courseId, name, part, room, teacher, start, end, range, bubble, cancelled, live, over,
      spoken: [`${name}${part ? `, ${part}` : ''}`, `${fmtTime(start, i.hour12)} to ${fmtTime(end, i.hour12)}`, room ? `room ${room}` : '', said].filter(Boolean).join(', '),
    };
  });
}

/** "3 classes · all present", "3 classes · 2 present, 1 absent", "2 classes · 1 cancelled". */
export function attendanceSummary(items: readonly ClassItem[]): string {
  if (!items.length) return 'No classes';
  const n = { present: 0, absent: 0, cancelled: 0, open: 0 };
  for (const x of items) {
    if (x.bubble === 'struck') n.cancelled++; else if (x.bubble === 'absent') n.absent++; else if (x.bubble === 'filled' || x.bubble === 'half') n.present++; else n.open++;
  }
  const held = items.length - n.cancelled;
  const parts = held > 0 && n.present === held ? ['all present']
    : [n.present ? `${n.present} present` : '', n.absent ? `${n.absent} absent` : '', n.open ? `${n.open} not yet` : ''].filter(Boolean);
  if (n.cancelled) parts.push(`${n.cancelled} cancelled`);
  return `${plural(items.length, 'class', 'classes')}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
}

/** The first class of the next day that has one (within a week): "Tomorrow 08:30 · Database Systems · L-4". */
export function nextDayLine(i: TodayInput, from: number): string | null {
  for (let k = 1; k <= 7; k++) {
    const d = addDays(startOfDay(from), k), first = classesOn(d, i).find((x) => !x.cancelled);
    if (first) return `${k === 1 ? 'Tomorrow' : DW[weekdayOf(new Date(d))]} ${fmtTime(first.start, i.hour12)} · ${first.name}${first.room ? ` · ${first.room}` : ''}`;
  }
  return null;
}

const trackOf = (items: readonly ClassItem[]): Track | null => items.length
  ? { from: Math.min(...items.map((x) => x.start)), to: Math.max(...items.map((x) => x.end)), stops: items.map((x) => ({ start: x.start, end: x.end, bubble: x.bubble, label: `${x.name} ${x.range}`, cancelled: x.cancelled })) }
  : null;

/** The Now card for the live day, and which classes it is about (so the rows can leave them out). */
function nowCard(items: ClassItem[], i: TodayInput): { card: NowCardVM; shown: Set<string> } {
  const on = items.filter((x) => !x.cancelled), track = trackOf(items), base = { rows: [] as ClassItem[], tabs: null, mark: null, position: '', room: '', meta: '', slot: '' };
  if (!on.length) {
    return { shown: new Set(), card: { ...base, state: 'none', title: 'No classes today', meta: items.length ? `${plural(items.length, 'class', 'classes')} cancelled` : '', count: null, track: null, next: nextDayLine(i, i.now) } };
  }
  const live = on.filter((x) => x.live), upcoming = on.filter((x) => x.start > i.now);
  if (!live.length && !upcoming.length) {
    /* F6: a day that had classes and is over is "Done for today", never "Free day". */
    return { shown: new Set(), card: { ...base, state: 'after', title: 'Done for today', meta: attendanceSummary(items), count: null, track, next: nextDayLine(i, i.now) } };
  }
  const slot = live.length ? live : upcoming.filter((x) => x.start === upcoming[0]!.start);
  const k = Math.min(Math.max(0, i.pick ?? 0), slot.length - 1), hit = slot[k]!;
  const state: NowState = live.length ? 'inClass' : on.some((x) => x.over) ? 'between' : 'before';
  const rank = on.indexOf(hit) + 1, keys = new Set(slot.map((x) => x.key));
  const after = on.find((x) => !keys.has(x.key) && x.start > (state === 'inClass' ? i.now : hit.start));
  const sameName = slot.filter((x) => x.name === hit.name).length > 1;
  return {
    shown: keys,
    card: {
      state, title: hit.name, meta: [hit.part, hit.teacher].filter(Boolean).join(' · '), room: hit.room,
      position: state === 'before' ? (on.length > 1 ? `first of ${on.length}` : 'the only class today') : `class ${rank} of ${on.length}`,
      count: state === 'inClass' ? { kind: 'left', target: hit.end } : { kind: 'until', target: hit.start },
      mark: state === 'inClass' ? { key: hit.key, date: hit.date, title: hit.name, bubble: hit.bubble === 'now' ? 'empty' : hit.bubble } : null,
      track,
      next: after ? `Then ${fmtTime(after.start, i.hour12)} · ${after.name}${after.room ? ` · ${after.room}` : ''}` : 'Last class today',
      tabs: slot.length > 1 ? slot.map((x, j) => ({ label: sameName && x.part ? x.part : x.name, on: j === k })) : null,
      rows: [], slot: slot.map((x) => x.key).join(','),
    },
  };
}

/** Another day, picked in the week strip: the card becomes that day's timetable. */
function pickedCard(items: ClassItem[], day: number, i: TodayInput): NowCardVM {
  const diff = Math.round((startOfDay(day) - startOfDay(i.now)) / 86_400_000);
  const rel = diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
  const on = items.filter((x) => !x.cancelled);
  return {
    state: 'picked', title: shortDay(day), room: '', position: '', count: null, mark: null, track: null, next: null, tabs: null, rows: items, slot: '',
    meta: items.length ? `${rel} · ${diff < 0 ? attendanceSummary(items) : plural(on.length, 'class', 'classes')}${on.length ? ` · ${fmtTime(on[0]!.start, i.hour12)}–${fmtTime(on[on.length - 1]!.end, i.hour12)}` : ''}` : `${rel} · no classes`,
  };
}

/** "3 d late", "45 min late", "today 20:00", "Tomorrow 08:00", "Mon 16 Nov 09:00". */
export function dueWhen(ms: number, now: number, h12 = false): string {
  if (ms < now) {
    const m = Math.round((now - ms) / 60_000);
    return m < 60 ? `${m} min late` : m < 1440 ? `${Math.round(m / 60)} h late` : `${Math.round(m / 1440)} d late`;
  }
  const d = Math.round((startOfDay(ms) - startOfDay(now)) / 86_400_000);
  return `${d === 0 ? 'today' : d === 1 ? 'Tomorrow' : shortDay(ms)} ${fmtTime(ms, h12)}`;
}

/** Today's Due (same groups as v0.6): overdue (oldest first, five shown), due later today, the next three. */
export function dueOf(i: Pick<TodayInput, 'tasks' | 'courses' | 'now' | 'hour12'>): TodayVM['due'] {
  const open = i.tasks.filter((t) => t.status !== 2 && t.dueAt !== null).sort((a, b) => (a.dueAt as number) - (b.dueAt as number));
  const tomorrow = addDays(startOfDay(i.now), 1);
  const row = (t: Task): DueRow => ({ id: t.id, title: t.title, when: dueWhen(t.dueAt as number, i.now, i.hour12), late: (t.dueAt as number) < i.now, course: i.courses.find((c) => c.id === t.courseId)?.name ?? '', courseId: t.courseId });
  const late = open.filter((t) => (t.dueAt as number) < i.now);
  const today = open.filter((t) => (t.dueAt as number) >= i.now && (t.dueAt as number) < tomorrow);
  const next = open.filter((t) => (t.dueAt as number) >= tomorrow).slice(0, 3);
  const bits = [today.length ? `${today.length} today` : '', late.length ? `${late.length} overdue` : ''].filter(Boolean);
  return {
    overdue: late.slice(0, 5).map(row), moreOverdue: Math.max(0, late.length - 5), today: today.map(row), next: next.map(row), empty: open.length === 0,
    summary: open.length === 0 ? 'Nothing due' : bits.length ? bits.join(', ') : `next ${next[0] ? dueWhen(next[0].dueAt as number, i.now, i.hour12) : ''}`.trim(),
  };
}

/** Pinned notes: urgent first, then the soonest date still ahead, then pin order (v0.6's rule). */
export function notesOf(i: Pick<TodayInput, 'notices' | 'courses' | 'now' | 'hour12'>): TodayVM['notes'] {
  const ahead = (n: Notice) => (n.dueAt > startOfDay(i.now) && n.dueAt >= i.now - 60_000 ? n.dueAt : null);
  return i.notices.map((n, k) => ({ n, k })).sort((a, b) => b.n.priority - a.n.priority || (ahead(a.n) ?? 9e15) - (ahead(b.n) ?? 9e15) || a.k - b.k)
    .map(({ n }) => {
      const when = ahead(n);
      const meta = [i.courses.find((c) => c.id === n.courseId)?.name ?? '', when !== null ? dueWhen(when, i.now, i.hour12) : '', n.priority >= 3 ? 'Urgent' : n.priority === 2 ? 'Important' : ''].filter(Boolean).join(' · ');
      return { id: n.id, text: n.text, meta };
    });
}

/** The top bar's face (D-21, `pageFace`): always about the live day, even while another day is picked. Sleepy at
 *  night or on a day with no classes (a cat on a free weekend), surprised in the last 5 min before a class,
 *  content once the day's classes are over, a smirk otherwise. */
export function todayFace(todays: readonly ClassItem[], card: NowCardVM, now: number): FaceName {
  const d = new Date(now), on = todays.filter((x) => !x.cancelled);
  const waiting = (card.state === 'before' || card.state === 'between') && card.count ? Math.ceil((card.count.target - now) / 60_000) : null;
  return pageFace('Today', { hour: d.getHours(), weekend: weekdayOf(d) >= 5, classesToday: on.length, classesLeft: on.filter((x) => !x.over).length, startsInMin: waiting });
}

/** Marking `key` present: does that make every class of this week present (the `weekAttended` moment)? A class
 *  still to come is not present yet, so this can only be true at the week's last class; cancelled ones don't count,
 *  and an ended class nobody marked counts as present, the app's own rule. */
export function completesWeek(i: TodayInput, key: string): boolean {
  const mon = mondayOf(i.now);
  let held = 0;
  for (let k = 0; k < 7; k++) {
    for (const x of classesOn(addDays(mon, k), i)) {
      if (x.cancelled) continue;
      held++;
      if (x.key !== key && x.bubble !== 'filled' && x.bubble !== 'half') return false;
    }
  }
  return held > 0;
}

export function todayView(i: TodayInput): TodayVM {
  const today = startOfDay(i.now);
  const sel = i.picked !== null && startOfDay(i.picked) !== today ? startOfDay(i.picked) : today, isToday = sel === today;
  const todays = classesOn(today, i), live = nowCard(todays, i);
  const card = isToday ? live.card : pickedCard(classesOn(sel, i), sel, i), shown = isToday ? live.shown : new Set<string>();
  /* The rows under the card are today's classes minus the card's own: the current class appears once (C1). */
  const rest = isToday ? todays.filter((x) => !shown.has(x.key)) : [];
  const later = rest.filter((x) => !x.over), earlier = rest.filter((x) => x.over);
  const week = weekPills(sel, i);
  const h = new Date(i.now).getHours(), hello = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const dm = i.dayMarks[ymd(new Date(sel))];
  return {
    dateLine: shortDay(i.now), greeting: i.name.trim() ? `${hello}, ${i.name.trim()}` : hello, face: todayFace(todays, live.card, i.now),
    isToday, selDay: sel, selDate: ymd(new Date(sel)), card, later, earlier,
    earlierSummary: attendanceSummary(earlier),
    dayMark: dm ? statusLabel(dm.status, dm.why) : null,
    week, due: dueOf(i), notes: notesOf(i),
  };
}

/** The week strip's seven days around `sel`, Monday first: each day's classes as small bubbles (Today and Week). */
export function weekPills(sel: number, i: Pick<TodayInput, 'now' | 'meetings' | 'courses' | 'variants' | 'attendance' | 'dayMarks' | 'hour12' | 'moves'>): WeekPill[] {
  const today = startOfDay(i.now), mon = mondayOf(sel);
  return Array.from({ length: 7 }, (_, k) => {
    const day = addDays(mon, k), items = classesOn(day, i), on = items.filter((x) => !x.cancelled).length, d = new Date(day);
    return {
      day, dw: DW[k]!, date: d.getDate(), isToday: day === today, selected: day === startOfDay(sel), bubbles: items.map((x) => x.bubble),
      label: `${DW[k]} ${d.getDate()} ${MO[d.getMonth()]}, ${plural(on, 'class', 'classes')}${day === today ? ', today' : ''}`,
    };
  });
}

/** What a bubble says, for the track's and the strip's TalkBack labels. */
export const bubbleSaid = (b: BubbleState) => bubbleWords(b);
