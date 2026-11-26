/** A vault task line as the Margin task it becomes (v0.8 §3.4). Pure; `prev` is the task it updates, so the
 *  fields only Margin has (notes, reminders, subtasks, estimate) survive an edit made in Obsidian. */
import { prioFromBone } from './bridge';
import { atTime, startOfDay } from './time';
import { bellOf, hmOf, isDone, isOpen, kindTagsOf, subjectTag, ymdOf, type Ring, type VaultTask } from './vaultTasks';
import type { Course, ReminderSpec as Reminder, Task, TaskKind } from './types';

const norm = (t: string) => t.replace(/^#/, '').toLocaleLowerCase();
const MIN = 60_000;
/** ⏰ + 🔔 as Marrow reminders (SPEC §9.3): `-N` before ⏰, or before 09:00 on the due day when there is no ⏰. */
export function remindersOf(t: VaultTask, id: string, at: (d: string | null, time: string | null, dflt: string) => number | null): Reminder[] {
  const day = t.due ?? t.scheduled, out: Reminder[] = [];
  if (day && t.time) out.push({ id: `${id}-r0`, mode: 'before', minutes: 0, label: '' });
  t.rings.forEach((r, i) => {
    const rid = `${id}-r${i + 1}`;
    if (r.kind === 'on') { const ms = at(r.date, r.hm, r.hm); if (ms !== null) out.push({ id: rid, mode: 'abs', at: ms, label: '' }); return; }
    if (!day) return;
    if (r.kind === 'at') { const ms = at(day, r.hm, r.hm); if (ms !== null) out.push({ id: rid, mode: 'abs', at: ms, label: '' }); return; }
    if (t.time) out.push({ id: rid, mode: 'before', minutes: r.min, label: '' });
    else { const nine = at(day, '09:00', '09:00'); if (nine !== null) out.push({ id: rid, mode: 'abs', at: nine - r.min * MIN, label: '' }); }
  });
  return out;
}
/** v0.7.8.4 (B8): a task's reminders as a `🔔` list for its line. The ⏰ ring itself is the ⏰ field; `-N` only when the
 *  line has a ⏰ (without one, `-N` means "before 09:00"), otherwise the time on the due day or a full date. */
export function bellFor(t: Pick<Task, 'reminders' | 'dueAt'>, time: string | null): string {
  const rings: Ring[] = [];
  const abs = (ms: number) => { rings.push(t.dueAt !== null && ymdOf(ms) === ymdOf(t.dueAt) ? { kind: 'at', hm: hmOf(ms) } : { kind: 'on', date: ymdOf(ms), hm: hmOf(ms) }); };
  for (const r of t.reminders) {
    if (r.mode === 'abs') abs(r.at);
    else if (t.dueAt === null) continue;
    else if (time) { if (r.minutes > 0) rings.push({ kind: 'before', min: r.minutes }); }
    else abs(t.dueAt - r.minutes * MIN);
  }
  return bellOf(rings);
}
export const ringTimes = (t: Pick<Task, 'reminders' | 'dueAt'>) => t.reminders.map((r) => (r.mode === 'abs' ? r.at : (t.dueAt ?? 0) - r.minutes * MIN)).sort((a, b) => a - b);
/** A line's date and wall time as an instant (noon-anchored day, then the time). */
export const lineAt = (d: string | null, time: string | null, dflt: string) => (d ? atTime(startOfDay(new Date(`${d}T12:00:00`).getTime()), time ?? dflt) : null);
/** When each of a line's reminders rings, sorted: what the push compares, so `🔔 -1d` is never rewritten as a date. */
export function lineRingTimes(t: VaultTask): number[] {
  const due = lineAt(t.due ?? t.scheduled, t.time, '23:59');
  return remindersOf(t, 'x', lineAt).map((r) => (r.mode === 'abs' ? r.at : (due ?? 0) - r.minutes * MIN)).sort((a, b) => a - b);
}
export function taskFromLine(t: VaultTask, prev: Task | undefined, courses: readonly Course[], own: readonly string[], now: number): Task {
  const ownSet = new Set(own.map(norm));
  const course = courses.find((c) => t.tags.some((x) => norm(x) === norm(subjectTag(c))));
  const tags = t.tags.filter((x) => !ownSet.has(norm(x)) && !(course && norm(x) === norm(subjectTag(course)))).map(norm);
  // a tracked tag the owner keeps on the line stays visible as a tag in Margin (school on by default)
  for (const x of t.tags) if (ownSet.has(norm(x)) && !tags.includes(norm(x))) tags.push(norm(x));
  const kinds = kindTagsOf(tags);
  const at = lineAt;
  // B4: every closed character counts (`~` failed, `»` forwarded too); only `x` is done, the rest read as cancelled
  const done = !isOpen(t.status), cancelled = done && !isDone(t.status);
  const id = prev?.id ?? `ob-${t.blockId}`;
  return {
    id, title: t.title || prev?.title || '(untitled)', courseId: course?.id ?? prev?.courseId ?? null,
    kind: (kinds[0] as TaskKind | undefined) ?? (prev && prev.kind !== 'exam' ? prev.kind : 'other'),
    dueAt: at(t.due ?? t.scheduled, t.time, '23:59'), startAt: at(t.start, null, '00:00'),
    estimateMin: t.estimateMin ?? prev?.estimateMin ?? null, priority: prioFromBone(t.prio), notes: prev?.notes ?? '',
    status: done ? 2 : prev?.status === 1 ? 1 : 0, createdAt: prev?.createdAt ?? now,
    completedAt: done ? (prev?.completedAt ?? at(t.doneOn ?? t.cancelledOn, '12:00', '12:00') ?? now) : null,
    // B2 (v0.7.8.4): the line wins. A ⏰ rings at its time; each 🔔 item rings too. Re-read on every read, so a ring
    // added, moved or removed in Obsidian changes what rings on the phone.
    reminders: remindersOf(t, id, at),
    subtasks: prev?.subtasks ?? [], demo: false, ord: prev?.ord ?? null,
    origin: prev ? prev.origin ?? null : 'obsidian', extId: t.blockId, extPath: t.path,
    tags, important: t.status === '!', cancelled,
    // B5: a line with only ⏳ is planned for that day, not due on it
    ...(t.due === null && t.scheduled !== null ? { planned: true } : {}),
    // §9.11: a range is a block on Today's timeline
    ...(t.timeEnd && (t.due ?? t.scheduled) ? { endAt: at(t.due ?? t.scheduled, t.timeEnd, t.timeEnd) } : {}),
  };
}
