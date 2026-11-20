/** A vault task line as the Margin task it becomes (v0.8 §3.4). Pure; `prev` is the task it updates, so the
 *  fields only Margin has (notes, reminders, subtasks, estimate) survive an edit made in Obsidian. */
import { prioFromBone } from './bridge';
import { atTime, startOfDay } from './time';
import { isCancelled, isDone, kindTagsOf, subjectTag, type VaultTask } from './vaultTasks';
import type { Course, Task, TaskKind } from './types';

const norm = (t: string) => t.replace(/^#/, '').toLocaleLowerCase();
export function taskFromLine(t: VaultTask, prev: Task | undefined, courses: readonly Course[], own: readonly string[], now: number): Task {
  const ownSet = new Set(own.map(norm));
  const course = courses.find((c) => t.tags.some((x) => norm(x) === norm(subjectTag(c))));
  const tags = t.tags.filter((x) => !ownSet.has(norm(x)) && !(course && norm(x) === norm(subjectTag(course)))).map(norm);
  // a tracked tag the owner keeps on the line stays visible as a tag in Margin (school on by default)
  for (const x of t.tags) if (ownSet.has(norm(x)) && !tags.includes(norm(x))) tags.push(norm(x));
  const kinds = kindTagsOf(tags);
  const at = (d: string | null, time: string | null, dflt: string) => (d ? atTime(startOfDay(new Date(`${d}T12:00:00`).getTime()), time ?? dflt) : null);
  const done = isDone(t.status) || isCancelled(t.status);
  const id = prev?.id ?? `ob-${t.blockId}`;
  return {
    id, title: t.title || prev?.title || '(untitled)', courseId: course?.id ?? prev?.courseId ?? null,
    kind: (kinds[0] as TaskKind | undefined) ?? (prev && prev.kind !== 'exam' ? prev.kind : 'other'),
    dueAt: at(t.due ?? t.scheduled, t.time, '23:59'), startAt: at(t.start, null, '00:00'),
    estimateMin: t.estimateMin ?? prev?.estimateMin ?? null, priority: prioFromBone(t.prio), notes: prev?.notes ?? '',
    status: done ? 2 : prev?.status === 1 ? 1 : 0, createdAt: prev?.createdAt ?? now,
    completedAt: done ? (prev?.completedAt ?? at(t.doneOn ?? t.cancelledOn, '12:00', '12:00') ?? now) : null,
    // in Bone Tasks a ⏰ time IS the reminder: a task arriving with one rings at that time through Margin's planner
    reminders: prev?.reminders ?? (t.due && t.time ? [{ id: `${id}-r0`, mode: 'before' as const, minutes: 0, label: '' }] : []),
    subtasks: prev?.subtasks ?? [], demo: false, ord: prev?.ord ?? null,
    origin: prev ? prev.origin ?? null : 'obsidian', extId: t.blockId, extPath: t.path,
    tags, important: t.status === '!', cancelled: isCancelled(t.status),
  };
}
