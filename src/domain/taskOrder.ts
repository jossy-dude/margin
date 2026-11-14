import type { Settings, Task } from './types';

export type TaskSort = Settings['taskSort'];
const due = (t: Task) => t.dueAt ?? 9e15;
const CMP: Record<TaskSort, (a: Task, b: Task) => number> = {
  due: (a, b) => due(a) - due(b),
  priority: (a, b) => b.priority - a.priority || due(a) - due(b),
  created: (a, b) => b.createdAt - a.createdAt,
  /* v0.7 R3 "My order": the order you gave (`task.ord`); tasks you never moved come after, newest first */
  mine: (a, b) => (a.ord ?? Infinity) - (b.ord ?? Infinity) || b.createdAt - a.createdAt,
};
/** To-do's open list in the chosen order (a stable sort: ties keep their order). */
export const sortTasks = (list: readonly Task[], sort: TaskSort): Task[] => [...list].sort(CMP[sort] ?? CMP.due);

/** The `ord` values that put `id` just before `beforeId` (or at the end when null) in "My order", given the list as
 *  it is shown. Every task above the drop point that has no `ord` yet gets one, so the order is all written down. */
export function moveOrds(shown: readonly Task[], id: string, beforeId: string | null): Map<string, number> {
  const rest = shown.filter((t) => t.id !== id), moved = shown.find((t) => t.id === id);
  if (!moved) return new Map();
  const at = beforeId === null ? rest.length : Math.max(0, rest.findIndex((t) => t.id === beforeId));
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  const out = new Map<string, number>();
  next.forEach((t, i) => { if (t.ord !== i + 1) out.set(t.id, i + 1); });
  return out;
}
