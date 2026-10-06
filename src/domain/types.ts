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
export interface Notice { id: string; courseId: string | null; text: string; dueAt: number; read: boolean; priority: 0 | 1 | 2 | 3 }
export interface Mark { id: string; courseId: string; name: string; score: number | null; weight: number; on: boolean; sort: number }
export interface Adjust { courseId: string; adj: number }
export interface FocusSession {
  id: string; taskId: string | null; courseId: string | null; startedAt: number; endedAt: number;
  focusSec: number; breakSec: number; overSec: number; rounds: number; planMin: number; demo: boolean;
}

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
  settings: Partial<Settings>;
}
