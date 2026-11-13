import type { EntityName } from './repository';
import { splitRooms } from '../domain/rooms';

type Kind = 'text' | 'int' | 'real' | 'bool' | 'json';
/** `opt`: an optional property (v0.6) — a NULL column leaves it off the object instead of setting null. */
export interface Field { p: string; c: string; k: Kind; nullable?: boolean; opt?: boolean }
export interface Spec { table: string; pk: string; pkProp: string; fields: Field[] }
const f = (p: string, k: Kind, nullable = false, c?: string): Field => ({ p, k, nullable, c: c ?? p.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()) });
const o = (p: string, k: Kind = 'text', c?: string): Field => ({ ...f(p, k, true, c), opt: true });

export const SPECS: Record<EntityName, Spec> = {
  /* Migration 5: `rooms` (a JSON list) replaces the bound `room` string, which stays in the table
     unbound — an old migration is never edited, and the backfill below copied it into `rooms` first. */
  course: { table: 'course', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('name', 'text'), f('rooms', 'json'), f('teacher', 'text'), f('goal', 'real', true), f('sort', 'int'), f('demo', 'bool'), f('bar', 'text', true)] },
  meeting: { table: 'meeting', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('courseId', 'text'), f('weekday', 'int'), f('start', 'text', false, 'start_t'), f('end', 'text', false, 'end_t'), f('demo', 'bool'), f('variantId', 'text', true, 'variant_id'), f('room', 'text', true)] },
  attendance: { table: 'attendance', pk: 'key', pkProp: 'key', fields: [f('key', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text'), o('why')] },
  dayMark: { table: 'day_mark', pk: 'date', pkProp: 'date', fields: [f('date', 'text'), f('status', 'text'), f('at', 'int'), f('reason', 'text'), o('why')] },
  task: { table: 'task', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('title', 'text'), f('courseId', 'text', true), f('kind', 'text'), f('dueAt', 'int', true), f('startAt', 'int', true), f('estimateMin', 'int', true), f('priority', 'int'), f('notes', 'text'), f('status', 'int'), f('createdAt', 'int'), f('completedAt', 'int', true), f('reminders', 'json'), f('subtasks', 'json'), f('demo', 'bool'), o('origin'), o('extId'), o('extPath'), o('ord', 'real')] },
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
  /* v0.7 (migration 7, DATA_MODEL.md): a variant is a COMPONENT of the course — its kind, its share of the
     grade (`weight`, NULL = pooled as in v0.6), whether it is the base (owner of the variant-less rows), what
     its marks are out of, and its own attendance goal. All optional on the object, so v0.6 rows and files
     read exactly as before. */
  variant: { table: 'subject_variants', pk: 'id', pkProp: 'id', fields: [f('id', 'text'), f('subjectId', 'text'), f('name', 'text'), f('room', 'text'), f('teacher', 'text'), f('note', 'text'), f('ord', 'int'),
    o('kind'), o('weight', 'real'), o('isBase', 'bool'), o('scale', 'real'), o('attGoal', 'real')] },
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
  /* Migration 7 (v0.7, DATA_MODEL.md Part 1 and PLAN N3). Variants become course components: kind, share of the
     grade (`weight`, NULL everywhere = v0.6's pooled grade, so nothing changes on upgrade), the base flag, the
     scale marks are out of, and an attendance goal. `task.ord` is To-do's "My order" (R3). `meeting_override`
     holds one-off moves from Week's drag ("this week only", R2) so no attendance key is ever rewritten (F19).
     The base rows are made by `BACKFILL[6]` in the same transaction. */
  `ALTER TABLE subject_variants ADD COLUMN kind TEXT;
   ALTER TABLE subject_variants ADD COLUMN weight REAL;
   ALTER TABLE subject_variants ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE subject_variants ADD COLUMN scale REAL NOT NULL DEFAULT 100;
   ALTER TABLE subject_variants ADD COLUMN att_goal REAL;
   ALTER TABLE task ADD COLUMN ord REAL;
   CREATE TABLE IF NOT EXISTS meeting_override(id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, date TEXT NOT NULL, new_date TEXT, new_start TEXT, new_end TEXT, room TEXT, cancelled INTEGER NOT NULL DEFAULT 0, updated_at INTEGER, deleted_at INTEGER, rev INTEGER DEFAULT 0);
   CREATE INDEX IF NOT EXISTS idx_override_meeting ON meeting_override(meeting_id, date);
   CREATE INDEX IF NOT EXISTS idx_meeting_variant ON meeting(variant_id);
   CREATE INDEX IF NOT EXISTS idx_mark_variant ON mark(variant_id);`,
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
  /* v0.7: every course that has a live variant gets an explicit base component (`<courseId>~base`, "Lecture",
     the course's first room and teacher), so the base can carry a share and a teacher without rewriting a
     single attendance key; then each other component gets a kind from its name. Weights stay NULL. */
  6: async (db) => {
    const courses = await db.getAllAsync<{ id: string; rooms: unknown; teacher: unknown }>(
      'SELECT id, rooms, teacher FROM course WHERE deleted_at IS NULL AND id IN (SELECT subject_id FROM subject_variants WHERE deleted_at IS NULL)');
    const now = Date.now();
    for (const c of courses) {
      let room = '';
      try { const r = JSON.parse(String(c.rooms ?? '[]')) as unknown; if (Array.isArray(r) && typeof r[0] === 'string') room = r[0]; } catch { /* keep '' */ }
      await db.runAsync(
        'INSERT OR IGNORE INTO subject_variants(id, subject_id, name, room, teacher, note, ord, kind, is_base, scale, updated_at, rev) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
        [`${c.id}~base`, c.id, 'Lecture', room, typeof c.teacher === 'string' ? c.teacher : '', '', -1, 'lecture', 1, 100, now, 1]);
    }
    await db.runAsync(`UPDATE subject_variants SET kind = CASE WHEN lower(name) LIKE '%lab%' THEN 'lab' WHEN lower(name) LIKE '%tut%' THEN 'tutorial' ELSE 'other' END WHERE kind IS NULL AND is_base = 0`, []);
  },
};
