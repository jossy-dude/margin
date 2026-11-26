/**
 * v0.7.8.3 (SPEC §9.1, §9.12, D9): School or Life. A task is School when it has a subject or carries one of the
 * owner's tracked tags (`#school` by default); everything else is Life (an Obsidian day plan, an errand, a task made
 * in Marrow without #school). To-do filters on it; the Tasks widget lists School first.
 */
import type { Task } from './types';
import { DEFAULT_TRACKED } from './vaultTasks';

const norm = (t: string) => t.replace(/^#/, '').toLocaleLowerCase();
export function isSchool(t: Pick<Task, 'courseId' | 'tags'>, tracked: readonly string[] = DEFAULT_TRACKED): boolean {
  if (t.courseId) return true;
  const own = new Set((tracked.length ? tracked : DEFAULT_TRACKED).map(norm));
  return (t.tags ?? []).some((x) => own.has(norm(x)));
}
/** The To-do subject filter: '' all, 'school', 'life' ('personal' from before 0.7.8.3 reads as Life), or a course id. */
export function inScope(t: Pick<Task, 'courseId' | 'tags'>, scope: string, tracked?: readonly string[]): boolean {
  if (!scope) return true;
  if (scope === 'school') return isSchool(t, tracked);
  if (scope === 'life' || scope === 'personal') return !isSchool(t, tracked);
  return t.courseId === scope;
}
