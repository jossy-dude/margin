import type { AttRecord, AttStatus, Course, DayMark, DayStatus, FocusSession, Mark, Meeting, Notice, NotifSettings, Settings, Task } from '../../domain/types';
import { ST } from '../../domain/attendance';
import { uid } from '../../domain/time';
import { configureFx, fx } from '../../services/fx';
import * as notifs from '../../services/notifications';
import { getState, set } from '../core';
import { persist, R } from '../persist';
import { resync } from '../reminders';
import { toast } from '../toast';

/* Every entity action is optimistic: the state moves synchronously, the write follows through `persist`,
 * and the actions that can change a reminder ask for a debounced `resync`. Deletes raise an undo toast. */

export function setSettings(patch: Partial<Settings>) {
  set((s) => ({ settings: { ...s.settings, ...patch } })); configureFx(getState().settings); void persist(R().putSettings(patch));
  // The 12/24-hour choice reaches the notification BODIES the planner writes (`PlanInput.hour12`), so
  // flipping it has to rebuild the queue; every other display setting leaves the plan identical.
  if (patch.hour12 !== undefined) resync(400);
}
export function setNotif(patch: Partial<NotifSettings>) {
  const notif = { ...getState().settings.notif, ...patch }; set((s) => ({ settings: { ...s.settings, notif } })); void persist(R().putSettings({ notif }));
  // D4: the channels are the truth for lock-screen text, so the toggle re-applies them rather than
  // trusting the setting alone. Nothing is awaited here — a refusal is read back by `status()`.
  if (patch.lockText !== undefined) void notifs.applyLockscreenText(notif.lockText);
  resync(500);
}

export function saveTask(t: Task) {
  const exists = getState().tasks.some((x) => x.id === t.id);
  set((s) => ({ tasks: exists ? s.tasks.map((x) => (x.id === t.id ? t : x)) : [...s.tasks, t] })); void persist(R().upsert('task', t)); resync();
}
export function toggleTask(id: string) {
  const t = getState().tasks.find((x) => x.id === id); if (!t) return;
  const done = t.status !== 2, n: Task = { ...t, status: done ? 2 : 0, completedAt: done ? Date.now() : null, subtasks: done ? t.subtasks.map((x) => ({ ...x, done: true })) : t.subtasks };
  saveTask(n); if (done) fx.done(); else fx.undone();
}
export function toggleSubtask(id: string, sid: string) { const t = getState().tasks.find((x) => x.id === id); if (!t) return; saveTask({ ...t, subtasks: t.subtasks.map((x) => (x.id === sid ? { ...x, done: !x.done } : x)) }); fx.select(); }
export function removeTask(id: string) {
  const t = getState().tasks.find((x) => x.id === id); if (!t) return;
  set((s) => ({ tasks: s.tasks.filter((x) => x.id !== id) })); void persist(R().remove('task', id)); resync();
  toast('Task deleted', () => { set((s) => ({ tasks: [...s.tasks, t] })); void persist(R().restore('task', id)); resync(); });
}

export function setAtt(key: string, status: AttStatus, reason = '') { const prev = getState().attendance[key] ?? null; const r: AttRecord = { key, status, at: Date.now(), reason }; set((s) => ({ attendance: { ...s.attendance, [key]: r } })); void persist(R().upsert('attendance', r)); fx.stamp(status); resync(); toast(`Marked ${ST[status]}`, () => { set((s) => { const a = { ...s.attendance }; if (prev) a[key] = prev; else delete a[key]; return { attendance: a }; }); void persist(prev ? R().upsert('attendance', prev) : R().remove('attendance', key)); resync(); }); }
export function clearAtt(key: string) { const prev = getState().attendance[key]; if (!prev) return; set((s) => { const a = { ...s.attendance }; delete a[key]; return { attendance: a }; }); void persist(R().remove('attendance', key)); resync(); toast('Back to automatic', () => { set((s) => ({ attendance: { ...s.attendance, [key]: prev } })); void persist(R().restore('attendance', key)); resync(); }); }
export function setDay(date: string, status: DayStatus, reason = '') { const prev = getState().dayMarks[date] ?? null; const r: DayMark = { date, status, at: Date.now(), reason }; set((s) => ({ dayMarks: { ...s.dayMarks, [date]: r } })); void persist(R().upsert('dayMark', r)); fx.stamp(status); resync(); toast(`Marked ${ST[status]}`, () => { set((s) => { const a = { ...s.dayMarks }; if (prev) a[date] = prev; else delete a[date]; return { dayMarks: a }; }); void persist(prev ? R().upsert('dayMark', prev) : R().remove('dayMark', date)); resync(); }); }
export function clearDay(date: string) { const prev = getState().dayMarks[date]; if (!prev) return; set((s) => { const a = { ...s.dayMarks }; delete a[date]; return { dayMarks: a }; }); void persist(R().remove('dayMark', date)); resync(); toast('Day mark cleared', () => { set((s) => ({ dayMarks: { ...s.dayMarks, [date]: prev } })); void persist(R().restore('dayMark', date)); resync(); }); }

export function saveCourse(c: Course) { const ex = getState().courses.some((x) => x.id === c.id); set((s) => ({ courses: ex ? s.courses.map((x) => (x.id === c.id ? c : x)) : [...s.courses, c] })); void persist(R().upsert('course', c)); resync(); }
export function saveMeeting(m: Meeting) { const ex = getState().meetings.some((x) => x.id === m.id); set((s) => ({ meetings: ex ? s.meetings.map((x) => (x.id === m.id ? m : x)) : [...s.meetings, m] })); void persist(R().upsert('meeting', m)); resync(); }
export function removeMeeting(id: string) { const m = getState().meetings.find((x) => x.id === id); if (!m) return; set((s) => ({ meetings: s.meetings.filter((x) => x.id !== id) })); void persist(R().remove('meeting', id)); resync(); toast('Class removed from the timetable', () => { set((s) => ({ meetings: [...s.meetings, m] })); void persist(R().restore('meeting', id)); resync(); }); }
export function removeCourse(id: string) {
  const st = getState();
  const c = st.courses.find((x) => x.id === id); if (!c) return; const ms = st.meetings.filter((m) => m.courseId === id), mk = st.marks.filter((m) => m.courseId === id);
  set((s) => ({ courses: s.courses.filter((x) => x.id !== id), meetings: s.meetings.filter((m) => m.courseId !== id), marks: s.marks.filter((m) => m.courseId !== id) }));
  void persist((async () => { await R().remove('course', id); for (const m of ms) await R().remove('meeting', m.id); for (const m of mk) await R().remove('mark', m.id); })()); resync();
  toast(`${c.name} removed`, () => { set((s) => ({ courses: [...s.courses, c].sort((a, b) => a.sort - b.sort), meetings: [...s.meetings, ...ms], marks: [...s.marks, ...mk] })); void persist((async () => { await R().restore('course', id); for (const m of ms) await R().restore('meeting', m.id); for (const m of mk) await R().restore('mark', m.id); })()); resync(); });
}
export function saveMark(m: Mark) { const ex = getState().marks.some((x) => x.id === m.id); set((s) => ({ marks: ex ? s.marks.map((x) => (x.id === m.id ? m : x)) : [...s.marks, m] })); void persist(R().upsert('mark', m)); }
export function removeMark(id: string) { const m = getState().marks.find((x) => x.id === id); if (!m) return; set((s) => ({ marks: s.marks.filter((x) => x.id !== id) })); void persist(R().remove('mark', id)); toast('Mark deleted', () => { set((s) => ({ marks: [...s.marks, m] })); void persist(R().restore('mark', id)); }); }
export function setAdjust(courseId: string, adj: number) { set((s) => ({ adjusts: { ...s.adjusts, [courseId]: adj } })); void persist(R().upsert('adjust', { courseId, adj })); }
export function saveNotice(n: Notice) { const ex = getState().notices.some((x) => x.id === n.id); set((s) => ({ notices: ex ? s.notices.map((x) => (x.id === n.id ? n : x)) : [...s.notices, n] })); void persist(R().upsert('notice', n)); }
export function removeNotice(id: string) { const n = getState().notices.find((x) => x.id === id); if (!n) return; set((s) => ({ notices: s.notices.filter((x) => x.id !== id) })); void persist(R().remove('notice', id)); toast('Note torn off', () => { set((s) => ({ notices: [...s.notices, n] })); void persist(R().restore('notice', id)); }); }

export function addSession(s0: Omit<FocusSession, 'id' | 'demo'>) { const f: FocusSession = { ...s0, id: uid('f'), demo: false }; set((s) => ({ focus: [...s.focus, f] })); void persist(R().upsert('focus', f)); }

export const entityActions = {
  setSettings, setNotif,
  saveTask, toggleTask, toggleSubtask, removeTask,
  setAtt, clearAtt, setDay, clearDay,
  saveCourse, saveMeeting, removeMeeting, removeCourse,
  saveMark, removeMark, setAdjust, saveNotice, removeNotice,
  addSession,
};
