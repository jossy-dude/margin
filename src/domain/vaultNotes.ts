/**
 * The notes Margin writes whole into the vault (v0.8 SPEC §1.5, §3.2, §3.3; single writer: Margin). Pure.
 *   Margin/Timetable.md  the next two weeks of CLASSES (S14: a notice never shows as a 00:00 class)
 *   Margin/Subjects.md   one section per subject: tag, teacher, rooms, grade and goal
 *   Margin/Notices.md    the notice board: pinned first, then dated by date
 * Each starts with a line saying edits are overwritten, so nobody types into them.
 */
import type { Course, Mark, Notice, SubjectVariant } from './types';
import type { BridgeEvent, BridgeItem } from './bridge';
import { courseGrade } from './grades';
import { subjectTag } from './vaultTasks';
import { pad } from './time';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hm = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const day = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const head = (kind: string, title: string, what: string) => `---\nmargin: ${kind}\n---\n# ${title}\n\n> Written by Margin. Edits here are overwritten; ${what}\n\n`;

export function timetableNote(events: readonly BridgeItem<BridgeEvent>[]): string {
  const classes = events.filter((e) => e.data && !e.deleted && e.data.kind === 'class').map((e) => e.data!).sort((a, b) => a.at - b.at);
  const out = [head('timetable', 'Timetable', 'change classes in Margin.').trimEnd(), ''];
  let cur = '';
  for (const e of classes) {
    const k = day(e.at);
    if (k !== cur) { if (cur) out.push(''); out.push(`## ${DAYS[new Date(e.at).getDay()]} ${k}`); cur = k; }
    const text = `${hm(e.at)}${e.end ? `–${hm(e.end)}` : ''} ${e.title}${e.room ? ` · ${e.room}` : ''}`;
    out.push(`- ${e.cancelled ? `~~${text}~~ cancelled` : text}`);
  }
  if (!classes.length) out.push('No classes in the next two weeks.');
  return `${out.join('\n')}\n`;
}

export interface SubjectsInput { courses: readonly Course[]; marks: readonly Mark[]; variants: readonly SubjectVariant[]; adjusts: Record<string, number> }
export function subjectsNote(i: SubjectsInput): string {
  const out = [head('subjects', 'Subjects', 'change subjects in Margin.').trimEnd()];
  const live = i.courses.filter((c) => !c.demo && !c.archived).sort((a, b) => a.sort - b.sort);
  for (const c of live) {
    const parts = i.variants.filter((v) => v.subjectId === c.id);
    const g = courseGrade(i.marks.filter((m) => m.courseId === c.id && m.on), parts, i.adjusts[c.id] ?? 0);
    out.push('', `## ${c.name}`, `- Tag: ${subjectTag(c)}`);
    if (c.teacher) out.push(`- Teacher: ${c.teacher}`);
    if (c.rooms.length) out.push(`- Rooms: ${c.rooms.join(', ')}`);
    out.push(`- Grade: ${g === null ? '—' : `${Math.round(g)} %`}${c.goal != null ? ` (goal ${c.goal} %)` : ''}`);
    for (const p of parts.filter((x) => !x.isBase)) out.push(`- ${p.name}${p.weight ? `: ${p.weight} % of the grade` : ''}${p.teacher ? ` · ${p.teacher}` : ''}${p.room ? ` · ${p.room}` : ''}`);
  }
  if (!live.length) out.push('', 'No subjects yet.');
  return `${out.join('\n')}\n`;
}

/** Pinned first, then the dated ones by date, then the rest; archived ones are left out. */
export function noticeOrder(ns: readonly Notice[]): Notice[] {
  return ns.filter((n) => !n.demo && !n.archived).map((n, k) => ({ n, k }))
    .sort((a, b) => Number(!!b.n.pinned) - Number(!!a.n.pinned) || (a.n.dueAt ?? 9e15) - (b.n.dueAt ?? 9e15) || b.n.priority - a.n.priority || a.k - b.k)
    .map((x) => x.n);
}
export function noticesNote(ns: readonly Notice[], courses: readonly Course[], now: number): string {
  const out = [head('notices', 'Notice board', 'change notices in Margin.').trimEnd(), ''];
  const list = noticeOrder(ns);
  for (const n of list) {
    const c = courses.find((x) => x.id === n.courseId);
    const when = n.dueAt != null && n.dueAt >= now - 864e5 ? ` · ${day(n.dueAt)}` : '';
    out.push(`- ${n.pinned ? '📌 ' : ''}${n.priority >= 3 ? '**' : ''}${n.text.replace(/\n+/g, ' ')}${n.priority >= 3 ? '**' : ''}${c ? ` · ${subjectTag(c)}` : ''}${when}`);
  }
  if (!list.length) out.push('Nothing pinned.');
  return `${out.join('\n')}\n`;
}
