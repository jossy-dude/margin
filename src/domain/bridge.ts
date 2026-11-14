/**
 * The Margin ↔ Obsidian bridge, pure half (v0.6 foundation; transport lands in v0.7 — docs/BRIDGE.md).
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
/** The Margin row id for a task Obsidian made: stable from its block id, so a re-read never duplicates it. */
export const localIdFor = (origin: BridgeOrigin, id: string) => (origin === 'obsidian' ? `ob-${id}` : id);

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
  const notices = i.notices.filter((r) => !r.value.demo).map<BridgeItem<BridgeEvent>>((r) => ({
    id: `n-${r.id}`, origin: 'margin', updatedAt: r.updatedAt,
    ...(r.deleted ? { deleted: true } : { data: { title: r.value.text, at: r.value.dueAt, end: null, kind: 'notice', course: cname(r.value.courseId), room: null, cancelled: false } }),
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

/* ── envelope → checked ─────────────────────────────────────────────────────────────────────── */
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const day = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };
const clock = (v: unknown) => { const s = str(v); return s && /^\d{1,2}:\d{2}$/.test(s) ? s.padStart(5, '0') : null; };

export interface ParsedEnvelope { envelope: BridgeEnvelope | null; problems: string[] }
/** Read the other app's file. Never throws; a row it cannot read is named and skipped, the rest still land. */
export function parseEnvelope(text: string): ParsedEnvelope {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { envelope: null, problems: ['The bridge file is not valid JSON.'] }; }
  if (!isRec(raw) || raw.format !== BRIDGE_FORMAT) return { envelope: null, problems: [`Not a ${BRIDGE_FORMAT} file.`] };
  const problems: string[] = [];
  const items = <T>(k: string, read: (d: Record<string, unknown>) => T | null): BridgeItem<T>[] => {
    const list = Array.isArray(raw[k as never]) ? (raw as Record<string, unknown[]>)[k]! : [];
    const out: BridgeItem<T>[] = [];
    list.forEach((r, n) => {
      const at = `${k}[${n}]`;
      if (!isRec(r) || !str(r.id) || num(r.updatedAt) === null) { problems.push(`${at}: needs an id and an updatedAt.`); return; }
      const origin: BridgeOrigin = r.origin === 'margin' ? 'margin' : 'obsidian';
      if (r.deleted === true) { out.push({ id: r.id as string, origin, updatedAt: r.updatedAt as number, deleted: true }); return; }
      const d = isRec(r.data) ? read(r.data) : null;
      if (!d) { problems.push(`${at}: its data could not be read.`); return; }
      out.push({ id: r.id as string, origin, updatedAt: r.updatedAt as number, data: d });
    });
    return out;
  };
  const tasks = items<BridgeTask>('tasks', (d) => {
    const title = str(d.title)?.trim();
    if (!title) return null;
    return {
      title, done: d.done === true, doneOn: day(d.doneOn), due: day(d.due), time: clock(d.time), start: day(d.start),
      prio: Math.max(0, Math.min(5, Math.round(num(d.prio) ?? 0))), estimateMin: num(d.estimateMin), spentMin: Math.max(0, num(d.spentMin) ?? 0),
      course: str(d.course), kind: (str(d.kind) as TaskKind | null) ?? null, notes: str(d.notes) ?? '', path: str(d.path),
      steps: Array.isArray(d.steps) ? d.steps.filter(isRec).map((s) => ({ t: str(s.t) ?? '', done: s.done === true })).filter((s) => s.t) : [],
    };
  });
  const events = items<BridgeEvent>('events', (d) => {
    const title = str(d.title), at = num(d.at);
    if (!title || at === null) return null;
    const kind = d.kind === 'class' || d.kind === 'exam' ? d.kind : 'notice';
    return { title, at, end: num(d.end), kind, course: str(d.course), room: str(d.room), cancelled: d.cancelled === true };
  });
  const sessions = items<BridgeSession>('sessions', (d) => {
    const startedAt = num(d.startedAt), ms = num(d.ms);
    if (startedAt === null || ms === null || ms <= 0) return null;
    return { startedAt, ms, label: str(d.label) ?? '', task: str(d.task), course: str(d.course) };
  });
  const app: BridgeApp = raw.app === 'margin' ? 'margin' : 'bone';
  return { envelope: { format: BRIDGE_FORMAT, app, writtenAt: num(raw.writtenAt) ?? 0, tasks, events, sessions }, problems };
}

/* ── envelope → Margin rows ─────────────────────────────────────────────────────────────────── */
const KINDS: TaskKind[] = ['assignment', 'exam', 'reading', 'project', 'lab', 'deadline', 'other'];
/** A bridge task as the Margin row it becomes. `prev` is the row it replaces, so Margin-only fields survive. */
export function fromBridgeTask(item: BridgeItem<BridgeTask> & { data: BridgeTask }, courses: readonly Course[], prev: Task | undefined, now: number): Task {
  const d = item.data, course = d.course ? courses.find((c) => c.name.toLocaleLowerCase() === d.course!.toLocaleLowerCase()) : undefined;
  const at = (ymdS: string | null, t: string | null, dflt: string) => (ymdS ? atTime(startOfDay(new Date(`${ymdS}T12:00:00`).getTime()), t ?? dflt) : null);
  const id = localIdFor(item.origin, item.id);
  return {
    id, title: d.title, courseId: course?.id ?? prev?.courseId ?? null, kind: d.kind && KINDS.includes(d.kind) ? d.kind : prev?.kind ?? 'other',
    dueAt: at(d.due, d.time, '23:59'), startAt: at(d.start, null, '00:00'), estimateMin: d.estimateMin ?? prev?.estimateMin ?? null,
    priority: prioFromBone(d.prio), notes: d.notes || prev?.notes || '', status: d.done ? 2 : prev?.status === 1 ? 1 : 0,
    createdAt: prev?.createdAt ?? now, completedAt: d.done ? (prev?.completedAt ?? at(d.doneOn, '12:00', '12:00') ?? now) : null,
    /* In Bone Tasks a ⏰ time IS the reminder, so a task arriving from Obsidian with one rings at that time
       through Margin's own planner (the owner's ask: Margin notifies for Obsidian tasks). A task Margin
       already holds keeps the reminders set here. */
    reminders: prev?.reminders ?? (item.origin === 'obsidian' && d.due && d.time ? [{ id: `${id}-r0`, mode: 'before' as const, minutes: 0, label: '' }] : []), subtasks: d.steps.map((s, n) => ({ id: prev?.subtasks[n]?.id ?? `${id}-s${n}`, t: s.t, done: s.done })),
    demo: false, ...(item.origin === 'obsidian' ? { origin: 'obsidian' as const, extId: item.id } : {}), ...(d.path ? { extPath: d.path } : prev?.extPath ? { extPath: prev.extPath } : {}),
  };
}

export interface MergePlan { put: Task[]; remove: string[]; unchanged: number; stale: number }
/**
 * Last writer wins, per row. `local` is Margin's own change stamp for each task id (from the change feed or
 * a full read); a bridge row older than or equal to it is stale and ignored, so a re-read of the same file
 * is a no-op. A tombstone for a row Margin never had is ignored too.
 */
export function planTaskMerge(env: BridgeEnvelope, tasks: readonly Task[], stamps: ReadonlyMap<string, number>, courses: readonly Course[], now: number): MergePlan {
  const plan: MergePlan = { put: [], remove: [], unchanged: 0, stale: 0 };
  for (const item of env.tasks) {
    const id = localIdFor(item.origin, item.id), prev = tasks.find((t) => t.id === id), mine = stamps.get(id) ?? 0;
    if (item.updatedAt <= mine) { plan.stale++; continue; }
    if (item.deleted) { if (prev) plan.remove.push(id); else plan.unchanged++; continue; }
    const next = fromBridgeTask(item as BridgeItem<BridgeTask> & { data: BridgeTask }, courses, prev, now);
    if (prev && JSON.stringify(prev) === JSON.stringify(next)) { plan.unchanged++; continue; }
    plan.put.push(next);
  }
  return plan;
}

/* ── the Tasks-plugin line, both directions ─────────────────────────────────────────────────── */
const PRIO_EMOJI: Record<number, string> = { 5: '🔺', 4: '⏫', 3: '🔼', 2: '🔽', 1: '⏬' };
const PRIO_OF: Record<string, number> = { '🔺': 5, '⏫': 4, '🔼': 3, '🔽': 2, '⏬': 1 };
/** One markdown task line in Bone Tasks' grammar, ending in its block id so the line can be found again. */
export function taskLine(id: string, t: BridgeTask): string {
  const parts = [`- [${t.done ? 'x' : ' '}] ${t.title.replace(/\s+/g, ' ').trim()}`];
  if (t.course) parts.push(`#${t.course.replace(/\s+/g, '-')}`);
  if (PRIO_EMOJI[t.prio]) parts.push(PRIO_EMOJI[t.prio]!);
  if (t.start) parts.push(`🛫 ${t.start}`);
  if (t.due) parts.push(`📅 ${t.due}`);
  if (t.time) parts.push(`⏰ ${t.time}`);
  if (t.spentMin > 0) parts.push(`⏱ ${Math.round(t.spentMin)}m`);
  if (t.done && t.doneOn) parts.push(`✅ ${t.doneOn}`);
  parts.push(`^${blockId(id)}`);
  return parts.join(' ');
}
const TASK_RE = /^(\s*(?:>\s*)*)([-*+]|\d+[.)])\s+\[(.)\]\s+(.*)$/;
const FIELD_STRIP = /(?:[📅⏳🛫✅➕❌]\s*\d{4}-\d{2}-\d{2})|(?:[🔺⏫🔼🔽⏬])|(?:🔁\s*[^📅⏳🛫✅➕❌⏰⏱🔺⏫🔼🔽⏬]*)|(?:⏰\s*\d{1,2}:\d{2})|(?:⏱\s*\d+m)|(?:[🆔⛔]\s*\S+)/gu;
/** Bone Tasks' `parseTask`, reduced to what the bridge carries. Null when the line is not a task. */
export function parseTaskLine(line: string, path: string | null = null): (BridgeTask & { blockId: string | null; status: string }) | null {
  const m = TASK_RE.exec(line);
  if (!m) return null;
  const body = m[4]!, status = m[3]!;
  const get = (e: string) => new RegExp(`${e}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u').exec(body)?.[1] ?? null;
  const time = /⏰\s*(\d{1,2}:\d{2})/u.exec(body)?.[1] ?? null, spent = /⏱\s*(\d+)m/u.exec(body)?.[1];
  const prio = (body.match(/[🔺⏫🔼🔽⏬]/u) ?? [])[0], id = /\s\^([\w-]+)\s*$/.exec(body)?.[1] ?? null;
  const title = body.replace(FIELD_STRIP, '').replace(/\s\^[\w-]+\s*$/, '').replace(/\s{2,}/g, ' ').trim();
  return {
    title, blockId: id, status, done: status === 'x' || status === 'X', doneOn: get('✅'), due: get('📅') ?? get('⏳'), time: time ? clock(time) : null, start: get('🛫'),
    prio: prio ? PRIO_OF[prio] ?? 0 : 0, estimateMin: null, spentMin: spent ? +spent : 0, course: null, kind: null, notes: '', path, steps: [],
  };
}

