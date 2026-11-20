/**
 * Margin's snapshot for the vault (`.margin/margin.json`, read-only since v0.8, D4): tasks, notices, the
 * timetable ahead and focus sessions, for Bone Home / Bone Tasks to read. Task lines themselves travel in the
 * notes (`vaultTasks.ts`); the inbound half of the v0.6 bridge (parsing Obsidian's envelope) was retired with
 * `obsidian.json`.
 *
 * Two apps on one phone share a folder inside the vault. Each writes ONE envelope file of its own and only
 * reads the other's, so neither ever edits a file the other is writing. An envelope lists the rows its app
 * owns or has changed — tasks, events and focus time — each with `updatedAt` and a tombstone flag, and the
 * reader merges them last-writer-wins. Everything here is pure: no React, no store, no I/O.
 *
 * Tasks travel in Bone Tasks' own terms (the Tasks-plugin emoji line, priority 0–5, dates as YYYY-MM-DD),
 * so the Obsidian side writes and reads its markdown unchanged, and `taskLine` / `parseTaskLine` below are
 * the same grammar Bone Tasks parses (`.obsidian/plugins/bone-tasks/main.js`, `parseTask`).
 */
import type { Course, FocusSession, Meeting, Notice, Task, TaskKind } from './types';
import { addDays, atTime, pad, startOfDay, ymd } from './time';
import { occEnd, occurrencesBetween } from './attendance';
import type { ClassMove } from './moves';

export const BRIDGE_FORMAT = 'margin-bridge/1';
export type BridgeApp = 'margin' | 'bone';
export type BridgeOrigin = 'margin' | 'obsidian';

/** A task as both apps can hold it. Dates are calendar days (the vault's own unit); `time` is a wall clock. */
export interface BridgeTask {
  title: string; done: boolean; doneOn: string | null;
  due: string | null; time: string | null; start: string | null;
  /** Bone's 0–5 scale (0 none, 1 lowest … 5 highest). */
  prio: number; estimateMin: number | null; spentMin: number;
  /** The subject's NAME, not Margin's id: Obsidian has no subject table, it has `#tags` and folders. */
  course: string | null; kind: TaskKind | null; notes: string;
  /** Where the line lives in the vault (Obsidian-made tasks; Margin-made ones are filed by the Bone side). */
  path: string | null;
  steps: { t: string; done: boolean }[];
}
/** Something with a time on the calendar: a class occurrence or a notice from Margin. Read-only on the Bone side. */
export interface BridgeEvent { title: string; at: number; end: number | null; kind: 'class' | 'notice' | 'exam'; course: string | null; room: string | null; cancelled: boolean }
/** A focus session either app recorded. `task` is the other side's task id when there is one. */
export interface BridgeSession { startedAt: number; ms: number; label: string; task: string | null; course: string | null }

export interface BridgeItem<T> { id: string; origin: BridgeOrigin; updatedAt: number; deleted?: boolean; data?: T }
export interface BridgeEnvelope {
  format: typeof BRIDGE_FORMAT; app: BridgeApp; writtenAt: number;
  tasks: BridgeItem<BridgeTask>[]; events: BridgeItem<BridgeEvent>[]; sessions: BridgeItem<BridgeSession>[];
}

/* ── priority ───────────────────────────────────────────────────────────────────────────────── */
/** Margin 0–3 → Bone 0–5: none, low 🔽, medium 🔼, high ⏫. */
export const prioToBone = (p: Task['priority']): number => [0, 2, 3, 4][p] ?? 0;
/** Bone 0–5 → Margin 0–3: lowest and low are low, highest and high are high. */
export const prioFromBone = (p: number): Task['priority'] => (p >= 4 ? 3 : p === 3 ? 2 : p >= 1 ? 1 : 0);

/* ── ids ────────────────────────────────────────────────────────────────────────────────────── */
/** A block id Obsidian accepts (`^id`: letters, digits, dashes). Margin's ids are base36 already. */
export const blockId = (id: string) => id.replace(/[^\w-]/g, '-');

/* ── Margin → envelope ──────────────────────────────────────────────────────────────────────── */
const dayOf = (ms: number | null) => (ms === null ? null : ymd(new Date(ms)));
const clockOf = (ms: number | null) => { if (ms === null) return null; const d = new Date(ms); const t = d.getHours() * 60 + d.getMinutes(); return t === 23 * 60 + 59 ? null : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function toBridgeTask(t: Task, courses: readonly Course[], spentMin = 0): BridgeTask {
  return {
    title: t.title, done: t.status === 2, doneOn: dayOf(t.completedAt), due: dayOf(t.dueAt), time: clockOf(t.dueAt), start: dayOf(t.startAt),
    prio: prioToBone(t.priority), estimateMin: t.estimateMin, spentMin, course: courses.find((c) => c.id === t.courseId)?.name ?? null,
    kind: t.kind, notes: t.notes, path: t.extPath ?? null, steps: t.subtasks.map((s) => ({ t: s.t, done: s.done })),
  };
}
/** The id a Margin task travels under: the other side's id when it came from there, else its own. */
export const bridgeIdOf = (t: Pick<Task, 'id' | 'origin' | 'extId'>) => (t.origin === 'obsidian' && t.extId ? t.extId : t.id);

export interface EnvelopeInput {
  now: number; since: number;
  courses: readonly Course[]; meetings: readonly Meeting[];
  /** The change feed (`Repository.changes`), so deletions travel as tombstones. */
  tasks: readonly { id: string; updatedAt: number; deleted: boolean; value: Task }[];
  notices: readonly { id: string; updatedAt: number; deleted: boolean; value: Notice }[];
  focus: readonly { id: string; updatedAt: number; deleted: boolean; value: FocusSession }[];
  /** True when a class occurrence is cancelled (attendance), so the calendar can strike it. */
  cancelled?: (occKeyDate: string, m: Meeting) => boolean;
  /** How many days of timetable to publish ahead. */
  horizonDays?: number;
  /** One-week class moves (`settings.moves`), so a moved class is published at its new time. */
  moves?: readonly ClassMove[];
}
/** Margin's envelope: changed tasks / notices / sessions since `since`, plus the timetable ahead (always whole,
 *  because occurrences are derived, not stored — the reader replaces its class events wholesale). */
export function buildEnvelope(i: EnvelopeInput): BridgeEnvelope {
  const origin = (o: string | null | undefined): BridgeOrigin => (o === 'obsidian' ? 'obsidian' : 'margin');
  const tasks = i.tasks.filter((r) => !r.value.demo).map<BridgeItem<BridgeTask>>((r) => ({
    id: bridgeIdOf(r.value), origin: origin(r.value.origin), updatedAt: r.updatedAt, ...(r.deleted ? { deleted: true } : { data: toBridgeTask(r.value, i.courses) }),
  }));
  const cname = (id: string | null) => i.courses.find((c) => c.id === id)?.name ?? null;
  const notices = i.notices.filter((r) => !r.value.demo && (r.deleted || r.value.dueAt != null)).map<BridgeItem<BridgeEvent>>((r) => ({
    id: `n-${r.id}`, origin: 'margin', updatedAt: r.updatedAt,
    ...(r.deleted ? { deleted: true } : { data: { title: r.value.text, at: r.value.dueAt ?? 0, end: null, kind: 'notice', course: cname(r.value.courseId), room: null, cancelled: false } }),
  }));
  const from = startOfDay(i.now), to = addDays(from, i.horizonDays ?? 14);
  const classes = occurrencesBetween(from, to, i.meetings.filter((m) => !m.demo), i.moves ?? []).map<BridgeItem<BridgeEvent>>(({ date, meeting }) => {
    const d = ymd(date), c = i.courses.find((x) => x.id === meeting.courseId);
    return {
      id: `c-${d}-${meeting.start}-${meeting.courseId}${meeting.variantId ? `~${meeting.variantId}` : ''}`, origin: 'margin', updatedAt: i.now,
      data: { title: c?.name ?? 'Class', at: atTime(date.getTime(), meeting.start), end: occEnd(date.getTime(), meeting), kind: 'class', course: c?.name ?? null, room: meeting.room || c?.rooms[0] || null, cancelled: !!i.cancelled?.(d, meeting) },
    };
  });
  const sessions = i.focus.filter((r) => !r.value.demo && r.value.mode !== 'break').map<BridgeItem<BridgeSession>>((r) => ({
    id: r.value.origin === 'obsidian' && r.value.extId ? r.value.extId : r.id, origin: origin(r.value.origin), updatedAt: r.updatedAt,
    ...(r.deleted ? { deleted: true } : { data: { startedAt: r.value.startedAt, ms: r.value.focusSec * 1000, label: '', task: r.value.taskId, course: cname(r.value.courseId) } }),
  }));
  return { format: BRIDGE_FORMAT, app: 'margin', writtenAt: i.now, tasks, events: [...notices, ...classes], sessions };
}

