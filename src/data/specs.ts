import type { EntityName } from './repository';

type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
export interface Field { p: string; c: string; k: Kind; nullable?: boolean }
export interface Spec { table: string; pk: string; pkProp: string; fields: Field[] }
const f = (p: string, k: Kind, nullable = false, c?: string): Field => ({ p, k, nullable, c: c ?? p.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()) });

export const SPECS: Record<EntityName, Spec> = {
  course: { table: 'course', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('name', 'text'), f('room', 'text'), f('teacher', 'text'), f('goal', 'real', true), f('sort', 'int'), f('demo', 'bool')] },
  meeting: { table: 'meeting', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('weekday', 'int'), f('start', 'text', false, 'start_t'), f('end', 'text', false, 'end_t'), f('demo', 'bool')] },
  attendance: { table: 'attendance', pk: 'key', pkProp: 'key', fields: [f('key', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text')] },
  dayMark: { table: 'day_mark', pk: 'date', pkProp: 'date', fields: [f('date', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text')] },
  task: { table: 'task', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('title', 'text'), f('courseId', 'text', true), f('kind', 'text'), f('dueAt', 'int', true), f('startAt', 'int', true), f('estimateMin', 'int', true), f('priority', 'int'), f('notes', 'text'), f('status', 'int'), f('createdAt', 'int'), f('completedAt', 'int', true), f('reminders', 'json'), f('subtasks', 'json'), f('demo', 'bool')] },
  /* No `read` field: the flag was written and never read anywhere, so the object, the export column
     and this mapping all dropped it. The `is_read` column stays in the table (an old migration is
     never edited) and is simply no longer bound — nullable, so puts leave it NULL and loads ignore it. */
  notice: { table: 'notice', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text', true), f('text', 'text', false, 'body'), f('dueAt', 'int'), f('priority', 'int'), f('demo', 'bool')] },
  mark: { table: 'mark', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('name', 'text'), f('score', 'real', true), f('weight', 'real'), f('on', 'bool', false, 'on_'), f('sort', 'int'), f('demo', 'bool')] },
  adjust: { table: 'adjust', pk: 'course_id', pkProp: 'courseId', fields: [f('courseId', 'text'), f('adj', 'real')] },
  /* `mode`/`completed` are bound here from W3 on: migration 2 (W1) added the columns, and until the finish
     path wrote them they were dead weight — a row loaded with the schema's own defaults and was exported
     without them. Both are non-null with SQL defaults, so a row written before this work still loads as
     `mode: 'focus'`, `completed: false` and re-exports with that meaning intact. */
  focus: { table: 'focus_session', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('taskId', 'text', true), f('courseId', 'text', true), f('startedAt', 'int'), f('endedAt', 'int'), f('focusSec', 'int'), f('breakSec', 'int'), f('overSec', 'int'), f('rounds', 'int'), f('planMin', 'int'), f('mode', 'text'), f('completed', 'bool'), f('demo', 'bool')] },
  /* W5/W6's entities, wired at the data layer only: nothing reads or writes them from the UI yet, so
     the shapes below are deliberately minimal — a later migration can add fields rather than this
     one guessing them. */
  trip: { table: 'trip', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('startedAt', 'int'), f('endedAt', 'int', true), f('route', 'text'), f('note', 'text')] },
  alarm: { table: 'alarm', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('at', 'int'), f('label', 'text'), f('enabled', 'bool'), f('kind', 'text'), f('taskId', 'text', true)] },
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
  /* A `json` column that will not parse THROWS instead of reading as `[]` (audit H2). The old `[]`
     was indistinguishable from "no reminders", so the next `upsert` of that row wrote the empty
     array over the user's real bytes and the loss became permanent. The caller in `sqlite.ts` catches
     this, skips the row and records a problem, leaving the stored value untouched for recovery. */
  if (fl.k === 'json') { try { return JSON.parse(String(v)); } catch { throw new Error(`column "${fl.c}" is not valid JSON — first 40 chars: ${String(v).slice(0, 40)}`); } }
  return v;
};

export const MIGRATIONS: string[] = [
  /* `IF NOT EXISTS` on every object, and the version marker is written in the same transaction as the
     DDL (see `init()`), because the two together are what makes a half-applied migration self-heal:
     a kill between the old `COMMIT` and `PRAGMA user_version` used to leave a database whose tables
     existed and whose version said "not yet migrated", so this statement failed with "already exists"
     on every launch afterwards (audit C2). */
  `CREATE TABLE IF NOT EXISTS course(id TEXT PRIMARY KEY, name TEXT NOT NULL, room TEXT, teacher TEXT, goal REAL, sort INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS meeting(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, weekday INTEGER NOT NULL, start_t TEXT NOT NULL, end_t TEXT NOT NULL, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS attendance("key" TEXT PRIMARY KEY, status TEXT NOT NULL, at INTEGER, reason TEXT, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS day_mark(date TEXT PRIMARY KEY, status TEXT NOT NULL, at INTEGER, reason TEXT, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS task(id TEXT PRIMARY KEY, title TEXT NOT NULL, course_id TEXT, kind TEXT, due_at INTEGER, start_at INTEGER, estimate_min INTEGER, priority INTEGER, notes TEXT, status INTEGER, created_at INTEGER, completed_at INTEGER, reminders TEXT, subtasks TEXT, demo INTEGER DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS notice(id TEXT PRIMARY KEY, course_id TEXT, body TEXT, due_at INTEGER, is_read INTEGER, priority INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS mark(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT, score REAL, weight REAL, on_ INTEGER, sort INTEGER, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS adjust(course_id TEXT PRIMARY KEY, adj REAL, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS focus_session(id TEXT PRIMARY KEY, task_id TEXT, course_id TEXT, started_at INTEGER, ended_at INTEGER, focus_sec INTEGER, break_sec INTEGER, over_sec INTEGER, rounds INTEGER, plan_min INTEGER, demo INTEGER DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS setting(k TEXT PRIMARY KEY, v TEXT);
   CREATE TABLE IF NOT EXISTS notif_log(id TEXT PRIMARY KEY, kind TEXT, due_at INTEGER, shown_at INTEGER, opened_at INTEGER);
   CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, id TEXT, op TEXT, at INTEGER);
   CREATE INDEX IF NOT EXISTS idx_task_due ON task(due_at); CREATE INDEX IF NOT EXISTS idx_focus_start ON focus_session(started_at);`,
  /* Migration 2 (W1). `trip` and `alarm` are W5/W6's entities, and `focus_session` gains the two
     columns DECISIONS D2 chose over a forked `study_sessions` table. Every table carries the same
     housekeeping columns (`updated_at`, `deleted_at`, `rev`) as the rest of the schema, because the
     adapter writes all three on every put/remove/restore; the column names are snake_case like every
     other table, so the SPECS rows above bind them. */
  `CREATE TABLE IF NOT EXISTS trip(id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, route TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE TABLE IF NOT EXISTS alarm(id TEXT PRIMARY KEY, at INTEGER NOT NULL, label TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1, kind TEXT NOT NULL DEFAULT 'leave', task_id TEXT, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   ALTER TABLE focus_session ADD COLUMN mode TEXT NOT NULL DEFAULT 'focus';
   ALTER TABLE focus_session ADD COLUMN completed INTEGER NOT NULL DEFAULT 0;`,
   /* Migration 3. `demo` marks the rows the first-run sample set seeded, so "Remove all sample data"
      can delete exactly those and nothing else. It lands here as plain ALTERs and deliberately NOT in
      migration 0's CREATE TABLEs: a fresh database runs every migration in order, so by the time these
      ALTERs run the column would already exist if 0 declared it too, and the statement would fail with
      "duplicate column". `DEFAULT 0` is the safety half: every row written before this migration is
      the user's own, reads back as "not sample" and survives the purge untouched. */
  `ALTER TABLE course ADD COLUMN demo INTEGER DEFAULT 0;
   ALTER TABLE meeting ADD COLUMN demo INTEGER DEFAULT 0;
   ALTER TABLE notice ADD COLUMN demo INTEGER DEFAULT 0;
   ALTER TABLE mark ADD COLUMN demo INTEGER DEFAULT 0;`,
];
