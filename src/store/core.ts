import { useSyncExternalStore } from 'react';
import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, Snapshot, SubjectVariant, Task, Trip, Alarm } from '../domain/types';
import type { NotifLogRow } from '../data/repository';
import { withDefaults } from '../domain/defaults';
import type { Planned } from '../domain/reminders';
import { initTimer, type TimerState } from '../domain/timer';
import type { NotifStatus } from '../services/notifications';

/** The store's state, its one writer (`set`) and its subscription. Every other store module reads
 *  through `getState()` — never a captured copy — because `set` replaces the object on every write. */

export type RouteName = 'Today' | 'Week' | 'Tasks' | 'Grades' | 'Stats' | 'Focus';
export type SheetSpec =
  | { t: 'add' } | { t: 'task'; id?: string; kind?: Task['kind']; courseId?: string | null } | { t: 'status'; mode: 'class' | 'day'; key: string; title: string; date: string }
  | { t: 'settings' } | { t: 'course'; id?: string } | { t: 'meeting'; courseId?: string; id?: string; weekday?: number } | { t: 'mark'; courseId: string; id?: string } | { t: 'notice'; id?: string };
export interface Toast { id: number; text: string; undo?: () => void; kind?: 'success' | 'error' }
export interface Moved { title: string; at: number; was: number; why: string }
export interface PlanInfo { count: number; deferred: number; shifted: number; next: Planned | null; at: number; moved: Moved[]; dropped: { id: string; why: string }[] }
export interface State {
  ready: boolean; error: string | null; now: number;
  courses: Course[]; meetings: Meeting[]; attendance: Record<string, AttRecord>; dayMarks: Record<string, DayMark>;
  tasks: Task[]; notices: Notice[]; marks: Mark[]; adjusts: Record<string, number>; focus: FocusSession[]; trips: Trip[]; alarms: Alarm[]; variants: SubjectVariant[]; settings: Settings;
  semesters: SemesterRow[];
  timer: TimerState; sheet: SheetSpec | null; settingsPath: string[]; toast: Toast | null; route: RouteName; prevRoute: RouteName | null; focusTaskId: string | null;
  notifStatus: NotifStatus | null; plan: PlanInfo | null; notifLog: NotifLogRow[];
  fev: { k: string; at: number } | null;
}

let state: State = {
  ready: false, error: null, now: Date.now(), courses: [], meetings: [], attendance: {}, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], variants: [], settings: withDefaults({}), semesters: [],
  timer: initTimer(), sheet: null, settingsPath: [], toast: null, route: 'Today', prevRoute: null, focusTaskId: null, notifStatus: null, plan: null, notifLog: [], fev: null,
};
const subs = new Set<() => void>();
export const getState = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export function set(patch: Partial<State> | ((s: State) => Partial<State>)) { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; subs.forEach((f) => f()); }
export function useStore<T>(sel: (s: State) => T): T { return useSyncExternalStore(subscribe, () => sel(state), () => sel(state)); }

/** Put a snapshot into the store. `keepTimer` is the import path: it must not reset a running focus
 *  round, so the timer write is skipped entirely rather than being recomputed to the same value — a
 *  recomputed `initTimer` would lose the seconds already spent in this round. The snapshot's own
 *  settings win either way; the current ones are the base only so a partial patch cannot blank a
 *  setting the file did not carry. */
export function applySnapshot(s: Partial<Snapshot>, keepTimer = false) {
  // Computed once: `withDefaults` rebuilds the whole settings object (and `initTimer` reads four of its
  // fields), so calling it per use rebuilt it four times per hydrate (audit M2).
  const settings = withDefaults(keepTimer ? { ...state.settings, ...(s.settings ?? {}) } : (s.settings ?? {}));
  const patch: Partial<State> = { settings };
  if (s.courses) patch.courses = s.courses;
  if (s.meetings) patch.meetings = s.meetings;
  if (s.attendance) patch.attendance = s.attendance;
  if (s.dayMarks) patch.dayMarks = s.dayMarks;
  if (s.tasks) patch.tasks = s.tasks;
  if (s.notices) patch.notices = s.notices;
  if (s.marks) patch.marks = s.marks;
  if (s.adjusts) patch.adjusts = s.adjusts;
  if (s.focus) patch.focus = s.focus;
  if (s.trips) patch.trips = s.trips;
  if (s.alarms) patch.alarms = s.alarms;
  if (s.variants) patch.variants = s.variants;
  if (!keepTimer) {
    patch.timer = initTimer({ planMin: settings.focusPresetMin, flow: settings.focusFlow, breakMs: settings.breakMin * 60_000, breaksAllowed: settings.breaksPerRound });
  }
  set(patch);
}
export const snapshotOf = (s: State = state): Snapshot => ({ courses: s.courses, meetings: s.meetings, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, notices: s.notices, marks: s.marks, adjusts: s.adjusts, focus: s.focus, trips: s.trips, alarms: s.alarms, variants: s.variants, settings: s.settings });
