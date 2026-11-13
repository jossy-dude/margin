import type { ReminderRule } from './ruleReminders';
/** v0.6: three states — Present, Absent, Cancelled — and the reason is a separate `why` code
 *  (`domain/attendance.ts` WHY) plus the free-text `reason` line. Older builds wrote `l`, `n`, `s` and `t`;
 *  migration 6 and `legacyStatus()` turn those into a state and a why, so nothing new ever holds them. */
export type AttStatus = 'p' | 'a' | 'c';
export type DayStatus = AttStatus;
export type AttWhy = '' | 'late' | 'early' | 'arrivedLate' | 'kicked' | 'sick' | 'excused' | 'skipped' | 'teacher' | 'holiday' | 'moved' | 'other';
/** Which app created a row the bridge shares. Margin's own rows leave it null. */
export type Origin = 'obsidian';
export type TaskKind = 'assignment' | 'exam' | 'reading' | 'project' | 'lab' | 'deadline' | 'other';

/** `demo` marks a row the first-run sample set seeded, so Settings can remove the sample semester
 *  without touching the user's own data (Task and FocusSession already carry it). The rule: anything
 *  the user creates or edits is written with `demo: false` — you touched it, it's yours — and only
 *  `seed.ts` sets it to `true`. */
/** `rooms` (migration 5) replaced the single `room` string: a class is not always in the same room, so a
 *  subject owns a list and each meeting picks one (`Meeting.room`, defaulting to the first). The legacy
 *  string was split on `,` `/` `;` `·` when the column was added, so "LR-601, LR-303" became two chips.
 *  `bar` is the subject's own progress instrument; `null` means "use the default in Settings". */
export interface Course { id: string; name: string; rooms: string[]; teacher: string; goal: number | null; sort: number; demo: boolean; bar?: string | null }
/** A subject's alternate identity — the same course under another room/teacher, for a timetable that
 *  differs per group (v0.5/WS8). It is a separate table rather than fields on `Course` because a
 *  subject may have several, and a meeting points at exactly one by `variantId`.
 *
 *  `ord` is the display order inside the subject, like `Course.sort` is for subjects. The three
 *  housekeeping columns every entity shares (`updated_at`, `deleted_at`, `rev`) live in SQL only, so
 *  a variant written by the import path gets the same `rev`/outbox discipline as any other row. */
export interface SubjectVariant { id: string; subjectId: string; name: string; room: string; teacher: string; note: string; ord: number;
  /** v0.7 components (DATA_MODEL.md): absent on v0.6 rows. `weight` is the share of the course grade in %
   *  (absent/null on every component = pooled, as before); `isBase` owns the rows with no variant id. */
  kind?: ComponentKind | null; weight?: number | null; isBase?: boolean | null; scale?: number | null; attGoal?: number | null }
export type ComponentKind = 'lecture' | 'lab' | 'tutorial' | 'seminar' | 'practical' | 'other';
/** `variantId` is nullable on purpose: every meeting written before v0.5 has none, and that is the
 *  meaning ("the subject's own room/teacher"). Optional in the type so existing fixtures that name a
 *  meeting without it keep compiling; the adapter binds it, so a reload reports the column's null. */
export interface Meeting { id: string; courseId: string; weekday: number; start: string; end: string; demo: boolean; variantId?: string | null;
  /** Which of the subject's rooms this class is in (migration 5). Empty/absent = the variant's room, else the subject's first. */
  room?: string | null }
export interface AttRecord { key: string; status: AttStatus; at: number; reason: string; why?: AttWhy }
export interface DayMark { date: string; status: DayStatus; at: number; reason: string; why?: AttWhy }
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
  /** v0.6 bridge (docs/BRIDGE.md): who made it ('obsidian'; absent/null = Margin), the other side's id, and the note it lives in. */
  origin?: Origin | null; extId?: string | null; extPath?: string | null;
  /** v0.7 To-do "My order" (R3): a sortable position; absent = never hand-ordered. */
  ord?: number | null;
}
export interface Notice { id: string; courseId: string | null; text: string; dueAt: number; priority: 0 | 1 | 2 | 3; demo: boolean; origin?: Origin | null; extId?: string | null }
/** `variantId` (migration 5): a mark earned in one of the subject's variants (the lab, say). It still
 *  belongs to `courseId`, so the subject's average rolls every variant up; the id only splits the breakdown. */
export interface Mark { id: string; courseId: string; name: string; score: number | null; weight: number; on: boolean; sort: number; demo: boolean; variantId?: string | null }
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
  origin?: Origin | null; extId?: string | null;
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
  /** D4/W5: show reminder text on the lock screen. ON is the platform default (text visible); OFF puts
   *  `lockscreenVisibility: SECRET` on the `classes` and `tasks` channels, so a reminder still rings but
   *  its text is hidden until unlock. A plain boolean with a `DEFAULT_NOTIF` entry of `true`, so
   *  `withDefaults` gives every settings row written before this field existed the ON behaviour — no
   *  SQL migration. */
  lockText: boolean;
  /** v0.7: keep the class that is running pinned in the notification shade — its name, room, time left and
   *  what comes after. ON by default; a row written before this existed gets it through `withDefaults`. */
  pinClass: boolean;
}
/**
 * An alarm (v0.7). Two kinds: `clock` rings at `h:m` on the chosen weekdays (Monday first; none chosen = once,
 * at `once`), and `class` rings `lead` minutes before the first class of each chosen day, following the
 * timetable as it changes. Kept in the settings row, not the `alarm` table: that table holds single instants
 * (`Alarm.at`) and predates this, and a list this small needs no migration.
 */
export interface AlarmRule { id: string; label: string; kind: 'clock' | 'class'; h: number; m: number; days: boolean[]; lead: number; on: boolean; snooze: number; vib: boolean; once?: number }
export interface Settings {
  name: string; theme: 'light' | 'dark' | 'auto'; paper: 'dots' | 'grid' | 'ruled' | 'plain';
  pen: 'denim' | 'warm' | 'graphite' | 'red' | 'blue'; palette: 'collage' | 'plain' | 'refined' | 'original'; texture: 'grain' | 'none';
  clock: string; bar: string; semesterStart: string;
  /** The last day of term, `YYYY-MM-DD`; `''` means open-ended, which is the default. A settings KV
   *  row written before v0.3.1 has no such key, so `withDefaults` fills the empty string in — no SQL
   *  migration, exactly like every other display setting here. See `domain/semester.ts`. */
  semesterEnd: string;
  /** Print every time-of-day as 12-hour ("8:30 AM") instead of 24-hour ("08:30"). Off by default, so
   *  the shipped look is unchanged. It is a plain boolean on `Settings` because that is the one place
   *  the app already keeps per-user display choices; `fmtTime`/`fmtWhen` take it as an argument rather
   *  than reading it, so `domain/` still imports no store. */
  hour12: boolean;
  soundOn: boolean; soundVol: Record<SoundGroup, number>; hapticsOn: boolean; tickOn: boolean;
  lockAttendance: boolean; reduceMotion: 'system' | 'on' | 'off'; /** v0.7 Daylight sky: follows the clock, one image per theme, or flat (DESIGN.md D-3) */ sky: 'live' | 'still' | 'off';
  /** Absences as the teacher's register has them, per subject id. Typed in by hand: the register and
   *  the marks made here do not always agree, and the register is the one that counts. Absent = not set. */
  teacherAbsent?: Record<string, number>;
  /** The Obsidian vault folder this phone was given (a Storage Access Framework URI). Absent/null = not linked. */
  vaultUri?: string | null;
  taskFilter: 'open' | 'done'; /** the To-do page's subject filter: a course id, 'personal' (no subject) or '' for all (BUGS #7) */ taskSubject: string; taskSort: 'due' | 'priority' | 'created'; seededAt: number;
  breakMin: number; breaksPerRound: number; focusFlow: boolean; focusPresetMin: number;
  /** How many builds of the onboarding tour this phone has finished. `0` or absent = not seen. See `toured()`
   *  in `domain/defaults.ts`. Optional on purpose: a settings row written before the tour existed has no such
   *  key, which is the same answer as "has not seen it", so `DEFAULT_SETTINGS` needs no entry and a cold start
   *  needs no migration. It is a version stamp rather than a boolean so replay is one write of `0` — there is
   *  no second source of truth that can disagree with it. */
  onboarded?: number;
  /** The alarms (v0.7). Optional for the same reason: an older row has none, and none is the answer. */
  alarms?: AlarmRule[];
  /** Reminder rules (v0.7 R9, `domain/ruleReminders.ts`). Optional: an older row has none. */
  reminders?: ReminderRule[];
  /** Which generation of the default look this settings row has been moved to (2 = the collage). Absent on
   *  a row written before the collage existed; `withDefaults` moves such a row over once. See there. */
  lookV?: number;
  notif: NotifSettings;
}
export interface Snapshot {
  courses: Course[]; meetings: Meeting[]; attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>;
  tasks: Task[]; notices: Notice[]; marks: Mark[]; adjusts: Record<string, number>; focus: FocusSession[];
  trips: Trip[]; alarms: Alarm[];
  /** Subject variants (v0.5). Optional, because a snapshot written before the table existed has none
   *  and every other shape of this object (an import file, a test fixture) may legitimately omit it. */
  variants?: SubjectVariant[];
  settings: Partial<Settings>;
}

/**
 * A term as stored: the one active row, plus one row per archived term. `snapshotJson` is the frozen
 * envelope `domain/archive.ts` writes (`{ v: 9, datasets }`); it is only ever set together with
 * `archivedAt`, so a row with a snapshot is history and a row without one is live. `active` is the
 * single owner of "which term is running now" — the DDL carries the column for that reason, and the
 * settings range is a mirror of it for the screens that print a range, never a second pointer.
 */
export interface SemesterRow {
  id: string; name: string; start: string; end: string; active: boolean;
  snapshotJson: string | null; createdAt: string; archivedAt: string | null;
}
