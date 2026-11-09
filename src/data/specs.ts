import type { EntityName } from './repository';
import { splitRooms } from '../domain/rooms';

type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
/** `opt`: an optional property (v0.6) — a NULL column leaves it off the object instead of setting null. */
export interface Field { p: string; c: string; k: Kind; nullable?: boolean; opt?: boolean }
export interface Spec { table: string; pk: string; pkProp: string; fields: Field[] }
const f = (p: string, k: Kind, nullable = false, c?: string): Field => ({ p, k, nullable, c: c ?? p.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()) });
const o = (p: string): Field => ({ ...f(p, 'text', true), opt: true });

export const SPECS: Record<EntityName, Spec> = {
  /* Migration 5: `rooms` (a JSON list) replaces the bound `room` string, which stays in the table
     unbound — an old migration is never edited, and the backfill below copied it into `rooms` first. */
  course: { table: 'course', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('name', 'text'), f('rooms', 'json'), f('teacher', 'text'), f('goal', 'real', true), f('sort', 'int'), f('demo', 'bool'), f('bar', 'text', true)] },
  meeting: { table: 'meeting', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('weekday', 'int'), f('start', 'text', false, 'start_t'), f('end', 'text', false, 'end_t'), f('demo', 'bool'), f('variantId', 'text', true, 'variant_id'), f('room', 'text', true)] },
  attendance: { table: 'attendance', pk: 'key', pkProp: 'key', fields: [f('key', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text'), o('why')] },
  dayMark: { table: 'day_mark', pk: 'date', pkProp: 'date', fields: [f('date', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text'), o('why')] },
  task: { table: 'task', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('title', 'text'), f('courseId', 'text', true), f('kind', 'text'), f('dueAt', 'int', true), f('startAt', 'int', true), f('estimateMin', 'int', true), f('priority', 'int'), f('notes', 'text'), f('status', 'int'), f('createdAt', 'int'), f('completedAt', 'int', true), f('reminders', 'json'), f('subtasks', 'json'), f('demo', 'bool'), o('origin'), o('extId'), o('extPath')] },
  /* No `read` field: the flag was written and never read anywhere, so the object, the export column
     and this mapping all dropped it. The `is_read` column stays in the table (an old migration is
     never edited) and is simply no longer bound — nullable, so puts leave it NULL and loads ignore it. */
  notice: { table: 'notice', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text', true), f('text', 'text', false, 'body'), f('dueAt', 'int'), f('priority', 'int'), f('demo', 'bool'), o('origin'), o('extId')] },
  mark: { table: 'mark', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('name', 'text'), f('score', 'real', true), f('weight', 'real'), f('on', 'bool', false, 'on_'), f('sort', 'int'), f('demo', 'bool'), f('variantId', 'text', true, 'variant_id')] },
  adjust: { table: 'adjust', pk: 'course_id', pkProp: 'courseId', fields: [f('courseId', 'text'), f('adj', 'real')] },
  /* `mode`/`completed` are bound here from W3 on: migration 2 (W1) added the columns, and until the finish
     path wrote them they were dead weight — a row loaded with the schema's own defaults and was exported
     without them. Both are non-null with SQL defaults, so a row written before this work still loads as
     `mode: 'focus'`, `completed: false` and re-exports with that meaning intact. */
  focus: { table: 'focus_session', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('taskId', 'text', true), f('courseId', 'text', true), f('startedAt', 'int'), f('endedAt', 'int'), f('focusSec', 'int'), f('breakSec', 'int'), f('overSec', 'int'), f('rounds', 'int'), f('planMin', 'int'), f('mode', 'text'), f('completed', 'bool'), f('demo', 'bool'), o('origin'), o('extId')] },
  /* W5/W6's entities, wired at the data layer only: nothing reads or writes them from the UI yet, so
     the shapes below are deliberately minimal — a later migration can add fields rather than this
     one guessing them. */
  trip: { table: 'trip', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('startedAt', 'int'), f('endedAt', 'int', true), f('route', 'text'), f('note', 'text')] },
  alarm: { table: 'alarm', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('at', 'int'), f('label', 'text'), f('enabled', 'bool'), f('kind', 'text'), f('taskId', 'text', true)] },
  /* v0.5/WS8: a subject taught in more than one room, or by more than one teacher. Bound here (not
     read by the UI yet) so the import path writes a variant with the standard `put` — a `rev` and an
     outbox row in the same transaction — instead of a hand-rolled INSERT that would skip both. */
  variant: { table: 'subject_variants', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('subjectId', 'text'), f('name', 'text'), f('room', 'text'), f('teacher', 'text'), f('note', 'text'), f('ord', 'int')] },
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
  /* Migration 4 — the release's only migration (v0.5/WS2). Three storage objects in one bump:
     `semesters` (the live term, plus one row per archived term frozen as `snapshot_json`),
     `subject_variants` (a subject's alternate room/teacher) and `meetings.variant_id` (which of a
     subject's variants a class belongs to; NULL means "the subject's own"). `semesters` deliberately
     has no `updated_at`/`deleted_at`/`rev`: it is history, not a synced entity — an archived row's
     snapshot is immutable bytes, and a `put` must never renumber it. `subject_variants` does carry
     the housekeeping three, because it is an entity and the adapter writes all three on every put.
     `ALTER TABLE ... ADD COLUMN` is the one statement here SQLite cannot make conditional, which is
     exactly why `init()` commits each migration's DDL and its `user_version` in one transaction:
     this text runs once per database, never twice. */
  `CREATE TABLE IF NOT EXISTS semesters(id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', start TEXT NOT NULL DEFAULT '', end TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 0, snapshot_json TEXT, created_at TEXT NOT NULL DEFAULT '', archived_at TEXT);
   CREATE TABLE IF NOT EXISTS subject_variants(id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', room TEXT NOT NULL DEFAULT '', teacher TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', ord INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   ALTER TABLE meeting ADD COLUMN variant_id TEXT;`,
  /* Migration 5 (v0.5 D1): a subject's rooms as a list and its own progress bar, the room a class is
     in, and the variant a mark was earned in. Plain ALTERs only; the one data step (splitting the old
     room string into the list) is `BACKFILL[4]`, which `init()` runs inside the same transaction as
     this DDL and its `user_version`, so a kill leaves either the old file or the whole new one. */
  `ALTER TABLE course ADD COLUMN rooms TEXT;
   ALTER TABLE course ADD COLUMN bar TEXT;
   ALTER TABLE meeting ADD COLUMN room TEXT;
   ALTER TABLE mark ADD COLUMN variant_id TEXT;`,
  /* Migration 6 (v0.6). Attendance is three states plus a reason (`why`); the old letters are rewritten
     by `BACKFILL[5]` in the same transaction. The bridge columns get Margin ready to share tasks, events
     and focus time with the Bone plugins in Obsidian (docs/BRIDGE.md): `origin` says which side created
     a row ('obsidian'; NULL = Margin), `ext_id` is the other side's id (Bone's 🆔), `ext_path` the note a
     task line lives in. `updated_at` is the change feed, so it gets an index on the synced tables. */
  `ALTER TABLE attendance ADD COLUMN why TEXT;
   ALTER TABLE day_mark ADD COLUMN why TEXT;
   ALTER TABLE task ADD COLUMN origin TEXT;
   ALTER TABLE task ADD COLUMN ext_id TEXT;
   ALTER TABLE task ADD COLUMN ext_path TEXT;
   ALTER TABLE notice ADD COLUMN origin TEXT;
   ALTER TABLE notice ADD COLUMN ext_id TEXT;
   ALTER TABLE focus_session ADD COLUMN origin TEXT;
   ALTER TABLE focus_session ADD COLUMN ext_id TEXT;
   CREATE INDEX IF NOT EXISTS idx_task_ext ON task(ext_id);
   CREATE INDEX IF NOT EXISTS idx_task_upd ON task(updated_at);
   CREATE INDEX IF NOT EXISTS idx_notice_upd ON notice(updated_at);
   CREATE INDEX IF NOT EXISTS idx_focus_upd ON focus_session(updated_at);`,
];

/** Old letter → v0.6 state + why (the same table `domain/attendance.ts` `legacyStatus` reads). */
export const LEGACY_LETTERS: [string, string, string][] = [['l', 'p', 'late'], ['n', 'a', 'arrivedLate'], ['s', 'a', 'sick'], ['t', 'c', 'teacher']];

/** The slice of a database a backfill needs — the same two calls `SqlDb` has. */
export interface BackfillDb {
  runAsync(sql: string, params?: any[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params?: any[]): Promise<T[]>;
}
/** Data steps that follow a migration's DDL, by migration index. Each runs inside that migration's
 *  transaction and must be safe on every row shape an older build could have written (NULL, '', junk). */
export const BACKFILL: Partial<Record<number, (db: BackfillDb) => Promise<void>>> = {
  4: async (db) => {
    const rows = await db.getAllAsync<{ id: string; room: unknown }>('SELECT id, room FROM course WHERE rooms IS NULL');
    for (const r of rows) await db.runAsync('UPDATE course SET rooms=? WHERE id=?', [JSON.stringify(splitRooms(r.room)), r.id]);
  },
  /* v0.6: the seven attendance letters become three states and a why. Pure SQL, so it is one pass per
     table whatever the row count, and a row already in the new shape is left alone. */
  5: async (db) => {
    for (const t of ['attendance', 'day_mark']) {
      for (const [from, to, why] of LEGACY_LETTERS) await db.runAsync(`UPDATE ${t} SET status=?, why=? WHERE status=?`, [to, why, from]);
      await db.runAsync(`UPDATE ${t} SET why='' WHERE why IS NULL`, []);
    }
  },
};
