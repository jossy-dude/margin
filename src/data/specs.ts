import type { EntityName } from './repository';

type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
export interface Field { p: string; c: string; k: Kind; nullable?: boolean }
export interface Spec { table: string; pk: string; pkProp: string; fields: Field[] }
const f = (p: string, k: Kind, nullable = false, c?: string): Field => ({ p, k, nullable, c: c ?? p.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()) });

export const SPECS: Record<EntityName, Spec> = {
  course: { table: 'course', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('name', 'text'), f('room', 'text'), f('teacher', 'text'), f('goal', 'real', true), f('sort', 'int')] },
  meeting: { table: 'meeting', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('weekday', 'int'), f('start', 'text', false, 'start_t'), f('end', 'text', false, 'end_t')] },
  attendance: { table: 'attendance', pk: 'key', pkProp: 'key', fields: [f('key', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text')] },
  dayMark: { table: 'day_mark', pk: 'date', pkProp: 'date', fields: [f('date', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text')] },
  task: { table: 'task', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('title', 'text'), f('courseId', 'text', true), f('kind', 'text'), f('dueAt', 'int', true), f('startAt', 'int', true), f('estimateMin', 'int', true), f('priority', 'int'), f('notes', 'text'), f('status', 'int'), f('createdAt', 'int'), f('completedAt', 'int', true), f('reminders', 'json'), f('subtasks', 'json'), f('demo', 'bool')] },
  /* No `read` field: the flag was written and never read anywhere, so the object, the export column
     and this mapping all dropped it. The `is_read` column stays in the table (an old migration is
     never edited) and is simply no longer bound — nullable, so puts leave it NULL and loads ignore it. */
  notice: { table: 'notice', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text', true), f('text', 'text', false, 'body'), f('dueAt', 'int'), f('priority', 'int')] },
  mark: { table: 'mark', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('name', 'text'), f('score', 'real', true), f('weight', 'real'), f('on', 'bool', false, 'on_'), f('sort', 'int')] },
  adjust: { table: 'adjust', pk: 'course_id', pkProp: 'courseId', fields: [f('courseId', 'text'), f('adj', 'real')] },
  focus: { table: 'focus_session', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('taskId', 'text', true), f('courseId', 'text', true), f('startedAt', 'int'), f('endedAt', 'int'), f('focusSec', 'int'), f('breakSec', 'int'), f('overSec', 'int'), f('rounds', 'int'), f('planMin', 'int'), f('demo', 'bool')] },
};
export const toSql = (fl: Field, v: unknown): string | number | null => {
  if (v === undefined || v === null) return null;
  if (fl.k === 'bool') return v ? 1 : 0;
  if (fl.k === 'json') return JSON.stringify(v);
  return v as string | number;
};
export const fromSql = (fl: Field, v: unknown): unknown => {
  if (v === null || v === undefined) return fl.nullable ? null : fl.k === 'json' ? [] : fl.k === 'text' ? '' : 0;
  if (fl.k === 'bool') return v === 1 || v === true;
  if (fl.k === 'json') { try { return JSON.parse(String(v)); } catch { return []; } }
  return v;
};

export const MIGRATIONS: string[] = [
  `CREATE TABLE course(id TEXT PRIMARY KEY, name TEXT NOT NULL, room TEXT, teacher TEXT, goal REAL, sort INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE meeting(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, weekday INTEGER NOT NULL, start_t TEXT NOT NULL, end_t TEXT NOT NULL, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE attendance("key" TEXT PRIMARY KEY, status TEXT NOT NULL, at INTEGER, reason TEXT, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE day_mark(date TEXT PRIMARY KEY, status TEXT NOT NULL, at INTEGER, reason TEXT, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE task(id TEXT PRIMARY KEY, title TEXT NOT NULL, course_id TEXT, kind TEXT, due_at INTEGER, start_at INTEGER, estimate_min INTEGER, priority INTEGER, notes TEXT, status INTEGER, created_at INTEGER, completed_at INTEGER, reminders TEXT, subtasks TEXT, demo INTEGER DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE notice(id TEXT PRIMARY KEY, course_id TEXT, body TEXT, due_at INTEGER, is_read INTEGER, priority INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE mark(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT, score REAL, weight REAL, on_ INTEGER, sort INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE adjust(course_id TEXT PRIMARY KEY, adj REAL, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE focus_session(id TEXT PRIMARY KEY, task_id TEXT, course_id TEXT, started_at INTEGER, ended_at INTEGER, focus_sec INTEGER, break_sec INTEGER, over_sec INTEGER, rounds INTEGER, plan_min INTEGER, demo INTEGER DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE setting(k TEXT PRIMARY KEY, v TEXT);
   CREATE TABLE notif_log(id TEXT PRIMARY KEY, kind TEXT, due_at INTEGER, shown_at INTEGER, opened_at INTEGER);
   CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, id TEXT, op TEXT, at INTEGER);
   CREATE INDEX idx_task_due ON task(due_at); CREATE INDEX idx_focus_start ON focus_session(started_at);`,
];
