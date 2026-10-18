import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, Settings, Snapshot, Task, Adjust, Trip, Alarm } from '../domain/types';

export interface EntityMap { course: Course; meeting: Meeting; attendance: AttRecord; dayMark: DayMark; task: Task; notice: Notice; mark: Mark; adjust: Adjust; focus: FocusSession; trip: Trip; alarm: Alarm }
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
  seed(snapshot: Snapshot): Promise<void>;
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
}
export const pkOf = (e: EntityName, v: unknown): string => {
  const o = v as Record<string, unknown>;
  return String(e === 'attendance' ? o.key : e === 'dayMark' ? o.date : e === 'adjust' ? o.courseId : o.id);
};
