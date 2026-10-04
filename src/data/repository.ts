import type { AttRecord, Course, DayMark, FocusSession, Mark, Meeting, Notice, Settings, Snapshot, Task, Adjust } from '../domain/types';

export interface EntityMap { course: Course; meeting: Meeting; attendance: AttRecord; dayMark: DayMark; task: Task; notice: Notice; mark: Mark; adjust: Adjust; focus: FocusSession }
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
  reset(): Promise<void>;
  logNotif(id: string, kind: string, dueAt: number, event: 'shown' | 'opened', at: number): Promise<void>;
  notifLog(): Promise<NotifLogRow[]>;
  pendingOutbox(limit?: number): Promise<OutboxRow[]>;
  ackOutbox(upToSeq: number): Promise<void>;
}
export const pkOf = (e: EntityName, v: unknown): string => {
  const o = v as Record<string, unknown>;
  return String(e === 'attendance' ? o.key : e === 'dayMark' ? o.date : e === 'adjust' ? o.courseId : o.id);
};
