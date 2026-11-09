import type { AttRecord, AttStatus, AttWhy, Course, DayMark, DayStatus, FocusSession, Mark, Meeting, Notice, NotifSettings, Settings, SubjectVariant, Task } from '../../domain/types';
import { batchOf, duplicateMeeting, emptyRows, makeVariantChange, pkOfRow, removeVariantChange, type Change, type RowSet } from '../../domain/variants';
import type { EntityName } from '../../data/repository';
import { statusLabel, whyOf } from '../../domain/attendance';
import { uid } from '../../domain/time';
import { configureFx, fx } from '../../services/fx';
import * as notifs from '../../services/notifications';
import { getState, set, type State } from '../core';
import { optimistic, R } from '../persist';
import { resync } from '../reminders';
import { toast } from '../toast';

/* Every entity action is optimistic: the state moves synchronously, the write follows, and a refused
 * write puts back exactly the row it moved (`optimistic`). The actions that can change a reminder ask for
 * a debounced `resync`; deletes raise an undo toast whose undo is itself an optimistic write. */

type ListKey = 'tasks' | 'courses' | 'meetings' | 'marks' | 'notices' | 'focus';
type MapKey = 'attendance' | 'dayMarks';
/** Put one row of a list back the way it was: replaced, re-added at the end, or (no row) removed. */
const putRow = (k: ListKey, id: string, row: { id: string } | null) => set((s) => {
  const list = s[k] as { id: string }[], has = list.some((x) => x.id === id);
  const next = row ? (has ? list.map((x) => (x.id === id ? row : x)) : [...list, row]) : list.filter((x) => x.id !== id);
  return { [k]: next } as Partial<State>;
});
const putKey = (k: MapKey, key: string, row: AttRecord | DayMark | null) => set((s) => {
  const m = { ...(s[k] as Record<string, AttRecord | DayMark>) };
  if (row) m[key] = row; else delete m[key];
  return { [k]: m } as Partial<State>;
});
const findRow = (k: ListKey, id: string) => (getState()[k] as { id: string }[]).find((x) => x.id === id) ?? null;
/** Save one list row: insert or replace in place, write it, revert to what was there. */
function saveRow<T extends { id: string }>(k: ListKey, e: EntityName, row: T) {
  const prev = findRow(k, row.id);
  return optimistic(() => putRow(k, row.id, row), () => R().upsert(e, row as never), () => putRow(k, row.id, prev));
}
/** Delete one list row with an undo; the undo restores it on screen and on disk. */
function removeRow(k: ListKey, e: EntityName, id: string, said: string, rebuild: boolean) {
  const prev = findRow(k, id); if (!prev) return;
  void optimistic(() => putRow(k, id, null), () => R().remove(e, id), () => putRow(k, id, prev));
  if (rebuild) resync();
  toast(said, () => {
    void optimistic(() => putRow(k, id, prev), () => R().restore(e, id), () => putRow(k, id, null));
    if (rebuild) resync();
  });
}

export function setSettings(patch: Partial<Settings>) {
  const st = getState().settings;
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, st[k as keyof Settings]])) as Partial<Settings>;
  void optimistic(
    () => { set((s) => ({ settings: { ...s.settings, ...patch } })); configureFx(getState().settings); },
    () => R().putSettings(patch),
    () => { set((s) => ({ settings: { ...s.settings, ...before } })); configureFx(getState().settings); },
  );
  // The 12/24-hour choice reaches the notification BODIES the planner writes (`PlanInput.hour12`), so
  // flipping it has to rebuild the queue; every other display setting leaves the plan identical.
  if (patch.hour12 !== undefined) resync(400);
}
export function setNotif(patch: Partial<NotifSettings>) {
  const before = getState().settings.notif, notif = { ...before, ...patch };
  void optimistic(
    () => set((s) => ({ settings: { ...s.settings, notif } })),
    () => R().putSettings({ notif }),
    () => set((s) => ({ settings: { ...s.settings, notif: { ...s.settings.notif, ...Object.fromEntries(Object.keys(patch).map((k) => [k, before[k as keyof NotifSettings]])) } } })),
  );
  // D4: the channels are the truth for lock-screen text, so the toggle re-applies them rather than
  // trusting the setting alone. Nothing is awaited here — a refusal is read back by `status()`.
  if (patch.lockText !== undefined) void notifs.applyLockscreenText(notif.lockText);
  resync(500);
}

export function saveTask(t: Task) { void saveRow('tasks', 'task', t); resync(); }
export function toggleTask(id: string) {
  const t = getState().tasks.find((x) => x.id === id); if (!t) return;
  const done = t.status !== 2, n: Task = { ...t, status: done ? 2 : 0, completedAt: done ? Date.now() : null, subtasks: done ? t.subtasks.map((x) => ({ ...x, done: true })) : t.subtasks };
  saveTask(n); if (done) fx.done(); else fx.undone();
}
export function toggleSubtask(id: string, sid: string) { const t = getState().tasks.find((x) => x.id === id); if (!t) return; saveTask({ ...t, subtasks: t.subtasks.map((x) => (x.id === sid ? { ...x, done: !x.done } : x)) }); fx.select(); }
export function removeTask(id: string) { removeRow('tasks', 'task', id, 'Task deleted', true); }

/** A class stamp or a day mark: the record replaces whatever was there, and the undo puts that back. */
function stamp(k: MapKey, e: 'attendance' | 'dayMark', key: string, r: AttRecord | DayMark, said: string) {
  const prev = (getState()[k] as Record<string, AttRecord | DayMark>)[key] ?? null;
  void optimistic(() => putKey(k, key, r), () => R().upsert(e, r as never), () => putKey(k, key, prev));
  resync();
  toast(said, () => {
    void optimistic(() => putKey(k, key, prev), () => (prev ? R().upsert(e, prev as never) : R().remove(e, key)), () => putKey(k, key, r));
    resync();
  });
}
function unstamp(k: MapKey, e: 'attendance' | 'dayMark', key: string, said: string) {
  const prev = (getState()[k] as Record<string, AttRecord | DayMark>)[key]; if (!prev) return;
  void optimistic(() => putKey(k, key, null), () => R().remove(e, key), () => putKey(k, key, prev));
  resync();
  toast(said, () => {
    void optimistic(() => putKey(k, key, prev), () => R().restore(e, key), () => putKey(k, key, null));
    resync();
  });
}
export function setAtt(key: string, status: AttStatus, reason = '', why: AttWhy = '') { const w = whyOf(status, why); fx.stamp(status, w); stamp('attendance', 'attendance', key, { key, status, at: Date.now(), reason, ...(w ? { why: w } : {}) }, `Marked ${statusLabel(status, w)}`); }
export function clearAtt(key: string) { unstamp('attendance', 'attendance', key, 'Back to automatic'); }
export function setDay(date: string, status: DayStatus, reason = '', why: AttWhy = '') { const w = whyOf(status, why); fx.stamp(status, w); stamp('dayMarks', 'dayMark', date, { date, status, at: Date.now(), reason, ...(w ? { why: w } : {}) }, `Marked ${statusLabel(status, w)}`); }
export function clearDay(date: string) { unstamp('dayMarks', 'dayMark', date, 'Day mark cleared'); }

/* ── compound edits ──────────────────────────────────────────────────────────────────────────────
 * A change is two row sets (`domain/variants.ts`): the screen swaps `before` for `after`, the repository
 * writes the same swap in one transaction (`commit`), and a refused write — or the undo — swaps back. */
const LIST: (keyof RowSet)[] = ['courses', 'meetings', 'marks', 'tasks', 'notices', 'focus', 'variants'];
function swap(from: RowSet, to: RowSet) {
  set((s) => {
    const patch: Partial<State> = {};
    for (const k of LIST) {
      const gone = new Set([...(from[k] as unknown[]), ...(to[k] as unknown[])].map((r) => pkOfRow(k, r)));
      const next = [...(s[k] as { id: string }[]).filter((r) => !gone.has(r.id)), ...(to[k] as { id: string }[])];
      (patch as Record<string, unknown>)[k] = k === 'courses' ? (next as Course[]).sort((a, b) => a.sort - b.sort) : k === 'variants' ? (next as SubjectVariant[]).sort((a, b) => a.ord - b.ord) : next;
    }
    const att = { ...s.attendance };
    for (const r of from.attendance) delete att[r.key];
    for (const r of to.attendance) att[r.key] = r;
    patch.attendance = att;
    return patch;
  });
}
function applyChange(c: Change, said: string) {
  void optimistic(() => swap(c.before, c.after), () => R().commit(batchOf(c.before, c.after)), () => swap(c.after, c.before));
  resync();
  toast(said, () => { void optimistic(() => swap(c.after, c.before), () => R().commit(batchOf(c.after, c.before)), () => swap(c.before, c.after)); resync(); });
}

export function saveCourse(c: Course) { void saveRow('courses', 'course', c); resync(); }
/** Refuses (and says so) a class that would share its attendance key with one already in the timetable —
 *  the same subject, variant, day and start — because the two could never be marked apart. */
export function saveMeeting(m: Meeting): boolean {
  if (duplicateMeeting(m, getState().meetings)) { toast('That class is already in the timetable at that time'); return false; }
  void saveRow('meetings', 'meeting', m); resync(); return true;
}
export function saveVariant(v: SubjectVariant) {
  const prev = getState().variants.find((x) => x.id === v.id) ?? null;
  const before = emptyRows(), after = emptyRows();
  if (prev) before.variants.push(prev);
  after.variants.push(v);
  void optimistic(() => swap(before, after), () => R().upsert('variant', v), () => swap(after, before));
  resync();
}
export function removeVariant(id: string) {
  const c = removeVariantChange(getState(), id); if (!c) return;
  applyChange(c, `${c.before.variants[0]?.name ?? 'Variant'} removed`);
}
/** Subject `childId` becomes a variant of `parentId`, with everything it owned — one transaction, one undo. */
export function makeVariantOf(childId: string, parentId: string) {
  const st = getState(), c = makeVariantChange(st, childId, parentId, uid('v')); if (!c) return;
  applyChange(c, `${st.courses.find((x) => x.id === childId)?.name ?? 'Subject'} is now part of ${st.courses.find((x) => x.id === parentId)?.name ?? 'the subject'}`);
}
export function removeMeeting(id: string) { removeRow('meetings', 'meeting', id, 'Class removed from the timetable', true); }
/** A subject goes with its variants, meetings and marks, in ONE repository transaction, so the disk never
 *  holds half a cascade; a refused write brings all of them back on screen, and the undo restores them all. */
export function removeCourse(id: string) {
  const st = getState(), c = st.courses.find((x) => x.id === id); if (!c) return;
  const before = emptyRows();
  before.courses.push(c);
  before.variants.push(...st.variants.filter((v) => v.subjectId === id));
  before.meetings.push(...st.meetings.filter((m) => m.courseId === id));
  before.marks.push(...st.marks.filter((m) => m.courseId === id));
  applyChange({ before, after: emptyRows() }, `${c.name} removed`);
}
export function saveMark(m: Mark) { void saveRow('marks', 'mark', m); }
export function removeMark(id: string) { removeRow('marks', 'mark', id, 'Mark deleted', false); }
export function setAdjust(courseId: string, adj: number) {
  const prev = getState().adjusts[courseId];
  const put = (v: number | undefined) => set((s) => { const a = { ...s.adjusts }; if (v === undefined) delete a[courseId]; else a[courseId] = v; return { adjusts: a }; });
  void optimistic(() => put(adj), () => R().upsert('adjust', { courseId, adj }), () => put(prev));
}
export function saveNotice(n: Notice) { void saveRow('notices', 'notice', n); }
export function removeNotice(id: string) { removeRow('notices', 'notice', id, 'Note torn off', false); }

export function addSession(s0: Omit<FocusSession, 'id' | 'demo'>) { const f: FocusSession = { ...s0, id: uid('f'), demo: false }; void saveRow('focus', 'focus', f); }

export const entityActions = {
  setSettings, setNotif,
  saveTask, toggleTask, toggleSubtask, removeTask,
  setAtt, clearAtt, setDay, clearDay,
  saveCourse, saveMeeting, removeMeeting, removeCourse, saveVariant, removeVariant, makeVariantOf,
  saveMark, removeMark, setAdjust, saveNotice, removeNotice,
  addSession,
};
