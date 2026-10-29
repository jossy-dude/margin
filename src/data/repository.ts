import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, SemesterRow, Settings, Snapshot, Task, Adjust, Trip, Alarm, SubjectVariant } from '../domain/types';

export interface EntityMap { course: Course; meeting: Meeting; attendance: AttRecord; dayMark: DayMark; task: Task; notice: Notice; mark: Mark; adjust: Adjust; focus: FocusSession; trip: Trip; alarm: Alarm; variant: SubjectVariant }
export type EntityName = keyof EntityMap;
export interface OutboxRow { seq: number; entity: string; id: string; op: 'put' | 'del' | 'restore'; at: number }
export interface NotifLogRow { id: string; kind: string; dueAt: number; shownAt: number | null; openedAt: number | null }

/**
 * The persistence port. The UI and store only ever see this interface. A sync server later drains `pendingOutbox()`
 * (every mutation writes an outbox row in the same transaction) without any component changing.
 */
export interface Repository {
  load(): Promise<Snapshot>;
  upsert<K extends EntityName>(entity: K, value: EntityMap[K]): Promise<void>;
  remove(entity: EntityName, id: string): Promise<void>;
  restore(entity: EntityName, id: string): Promise<void>;
  putSettings(patch: Partial<Settings>): Promise<void>;
  /* ── the setting table as a KV (v0.9) ──────────────────────────────────────────────────────────
   * Not every stored fact is a user setting: the OTA loop's "this bundle was applied" marker is
   * bookkeeping, must survive a restart, and has no place on a Settings page (it is not part of the
   * `Settings` type and no screen writes it). It still belongs in the one key-value table this app
   * has, so the port exposes that table directly for keys the type does not name. Values are strings,
   * stored JSON-encoded like every other setting; `null` deletes the key, absent and unreadable are
   * both `null`. Because `load()` returns every row in that table, the marker rides along in an
   * exported settings object — harmless: a toast requires the exported id to equal the update id of
   * the phone that imports it, and no phone runs another phone's bundle. */
  getKv(key: string): Promise<string | null>;
  setKv(key: string, value: string | null): Promise<void>;
  seed(snapshot: Snapshot): Promise<void>;
  /** The import path's write half: add or overwrite exactly the rows a plan carries, in one
   *  transaction, with the same discipline as `seed()` (a `put` per row, so every row gets a `rev`
   *  and an outbox entry). Nothing is deleted — an import can only add a row or overwrite the one
   *  with the same id. */
  importSnapshot(snapshot: Partial<Snapshot>): Promise<void>;
  purgeDemo(): Promise<void>;
  /** Erase everything — every entity row, settings and both bookkeeping tables — leaving this
   *  repository open, empty and usable. The wipe does NOT bring the demo set back anywhere; a
   *  wiped planner is an empty planner. On SQLite the adapter may realize this by deleting the
   *  database file itself (the store re-opens a fresh copy right after). */
  wipe(): Promise<void>;
  logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number): Promise<void>;
  /** Record that a reminder was handed to the OS, before it has rung. `logNotif` can only write a
   *  `shown_at` or an `opened_at`, and inventing one of those to mean "queued" would be a lie in a
   *  column the Delivery page reads. */
  schedNotif(id: string, kind: string, dueAt: number): Promise<void>;
  notifLog(): Promise<NotifLogRow[]>;
  pendingOutbox(limit?: number): Promise<OutboxRow[]>;
  ackOutbox(upToSeq: number): Promise<void>;
  /* ── semesters (v0.9) ──────────────────────────────────────────────────────────────────────────
   * Four methods, not an `EntityName`: a term is not a synced row and must not be tombstoned or
   * renumbered by a `put`. `saveSemester` inserts or overwrites by id, and `setActiveSemester` owns
   * the one-active invariant — including mirroring the row's range into `settings.semesterStart/End`,
   * because that pair is what Grades, export and Settings print. `clearActiveSchedule` is the
   * roll-over's destructive half and goes through `remove()`, so every cleared row lands in the outbox
   * with a `del` like any other deletion. */
  /** Every term: the active one first, then history newest-first. Never empty — a repository with no
   *  active term (a fresh install, a wipe, or a roll-over killed between archiving and activating)
   *  heals by creating one from today. */
  listSemesters(): Promise<SemesterRow[]>;
  saveSemester(row: SemesterRow): Promise<void>;
  setActiveSemester(id: string): Promise<void>;
  /** Clear the day-to-day schedule of the term that just ended: meetings, tasks, notices, day marks
   *  and marks. Attendance is the user's choice — kept, it is the term's record; wiped, it goes with
   *  everything else. Subjects and their variants are never touched: they are what the next term
   *  inherits. */
  clearActiveSchedule(keepAttendance: boolean): Promise<void>;
}
export const pkOf = (e: EntityName, v: unknown): string => {
  const o = v as Record<string, unknown>;
  return String(e === 'attendance' ? o.key : e === 'dayMark' ? o.date : e === 'adjust' ? o.courseId : o.id);
};
