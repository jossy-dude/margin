export type AttStatus = 'p' | 'l' | 'n' | 'a' | 's' | 'c' | 't';
export type DayStatus = 'p' | 'a' | 's' | 'c';
export type TaskKind = 'assignment' | 'exam' | 'reading' | 'project' | 'lab' | 'deadline' | 'other';

export interface Course { id: string; name: string; room: string; teacher: string; goal: number | null; sort: number }
export interface Meeting { id: string; courseId: string; weekday: number; start: string; end: string }
export interface AttRecord { key: string; status: AttStatus; at: number; reason: string }
export interface DayMark { date: string; status: DayStatus; at: number; reason: string }
/** A reminder is either an absolute moment, or an offset before the due date. */
export type ReminderSpec =
  | { id: string; mode: 'abs'; at: number; label: string }
  | { id: string; mode: 'before'; minutes: number; label: string };
export interface Subtask { id: string; t: string; done: boolean }
export interface Task {
  id: string; title: string; courseId: string | null; kind: TaskKind;
  dueAt: number | null; startAt: number | null; estimateMin: number | null;
  priority: 0 | 1 | 2 | 3; notes: string; status: 0 | 1 | 2;
  createdAt: number; completedAt: number | null;
  reminders: ReminderSpec[]; subtasks: Subtask[]; demo: boolean;
}
export interface Notice { id: string; courseId: string | null; text: string; dueAt: number; priority: 0 | 1 | 2 | 3 }
export interface Mark { id: string; courseId: string; name: string; score: number | null; weight: number; on: boolean; sort: number }
export interface Adjust { courseId: string; adj: number }
/** A saved study session. `mode`/`completed` are the two columns DECISIONS D2 added to `focus_session`
 *  instead of forking a `study_sessions` table (W1's migration 2). Like `Alarm.kind` below, `mode` is a free
 *  string: the only value anything writes today is `'focus'` (the column's own default), and whether a later
 *  workstream adds others is its decision, not a guess made here — a `TEXT NOT NULL DEFAULT 'focus'` column
 *  carries a new one without a migration. `completed` is the finish path's honest reading of the timer, not a
 *  user choice: see `finish()` in `domain/timer.ts`. */
export interface FocusSession {
  id: string; taskId: string | null; courseId: string | null; startedAt: number; endedAt: number;
  focusSec: number; breakSec: number; overSec: number; rounds: number; planMin: number; mode: string; completed: boolean; demo: boolean;
}
/** A commute/route log entry (W5). Stored and exported from W1; nothing writes one yet, so the shape
 *  stays at the columns the brief named rather than guessing what the tracker will need. */
export interface Trip { id: string; startedAt: number; endedAt: number | null; route: string; note: string }
/** A leave-by / class alarm (W5). `kind` is a free string on purpose: the alarm types are a UI
 *  decision, and a `TEXT NOT NULL DEFAULT 'leave'` column needs no migration to carry a new one. */
export interface Alarm { id: string; at: number; label: string; enabled: boolean; kind: string; taskId: string | null }

export type SoundGroup = 'paper' | 'clock' | 'stamp' | 'done' | 'notify' | 'toggle' | 'dial' | 'break';
export interface NotifSettings {
  enabled: boolean;
  classSoon: boolean; classLeadMin: number; courseLead: Record<string, number>;
  classEnded: boolean; taskReminders: boolean; startBy: boolean; examReminders: boolean;
  defaultTaskMinutes: number[];
  activeDays: boolean[]; activeFrom: string; activeTo: string;
  quietEnabled: boolean; quietFrom: string; quietTo: string;
  weekend: 'normal' | 'quiet' | 'off';
  duringClass: 'defer' | 'allow';
  homeAt: string; effortBuffer: number;
}
export interface Settings {
  name: string; theme: 'light' | 'dark' | 'auto'; paper: 'dots' | 'grid' | 'ruled' | 'plain';
  pen: 'warm' | 'graphite' | 'red' | 'blue'; palette: 'refined' | 'original'; texture: 'grain' | 'photo' | 'none';
  clock: string; bar: string; semesterStart: string;
  /** Print every time-of-day as 12-hour ("8:30 AM") instead of 24-hour ("08:30"). Off by default, so
   *  the shipped look is unchanged. It is a plain boolean on `Settings` because that is the one place
   *  the app already keeps per-user display choices; `fmtTime`/`fmtWhen` take it as an argument rather
   *  than reading it, so `domain/` still imports no store. */
  hour12: boolean;
  soundOn: boolean; soundVol: Record<SoundGroup, number>; hapticsOn: boolean; tickOn: boolean;
  lockAttendance: boolean; reduceMotion: 'system' | 'on' | 'off';
  taskFilter: 'all' | 'open' | 'done'; taskSort: 'due' | 'priority' | 'created'; seededAt: number;
  breakMin: number; breaksPerRound: number; focusFlow: boolean; focusPresetMin: number;
  /** How many builds of the onboarding tour this phone has finished. `0` or absent = not seen. See `toured()`
   *  in `domain/defaults.ts`. Optional on purpose: a settings row written before the tour existed has no such
   *  key, which is the same answer as "has not seen it", so `DEFAULT_SETTINGS` needs no entry and a cold start
   *  needs no migration. It is a version stamp rather than a boolean so replay is one write of `0` — there is
   *  no second source of truth that can disagree with it. */
  onboarded?: number;
  notif: NotifSettings;
}
export interface Snapshot {
  courses: Course[]; meetings: Meeting[]; attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>;
  tasks: Task[]; notices: Notice[]; marks: Mark[]; adjusts: Record<string, number>; focus: FocusSession[];
  trips: Trip[]; alarms: Alarm[];
  settings: Partial<Settings>;
}
