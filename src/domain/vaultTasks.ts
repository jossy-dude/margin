/**
 * Task lines in the Obsidian vault, both directions (v0.8 SPEC §1.5, §3.4). Pure: no React, no store, no I/O.
 *
 * The transport is the notes themselves (D4): Margin reads the task lines of changed notes and writes its own
 * changes back as a field-level patch of one line, found by its block id (`^id`). Everything Margin does not own
 * on a line (other fields, unknown text, a status character it has no meaning for) stays exactly as it was.
 *
 * Grammar: the Tasks plugin's emoji fields, plus Bone Tasks' ⏰ time and ⏱ estimate.
 *   - [ ] Title #school #Database-Systems #lab ⏫ 🛫 2026-11-20 ⏳ 2026-11-21 📅 2026-11-22 ⏰ 09:00 ⏱ 45m ➕ 2026-11-19 ^m1a2b3
 */
import { pad } from './time';

export const KIND_TAGS = ['assignment', 'reading', 'project', 'lab', 'deadline'] as const;
export type KindTag = (typeof KIND_TAGS)[number];
export const DEFAULT_TRACKED = ['#school'];
/** Folders whose task lines never count: the sync's conflict notes, templates, the trash. */
export const EXCLUDED_DIRS = ['Conflicts/', 'Templates/', '.trash/'];
/** Notes Margin writes whole (single writer): their lines are not tasks to read back. */
export const GENERATED = ['Margin/Timetable.md', 'Margin/Subjects.md', 'Margin/Notices.md'];
export const TASKS_NOTE = 'Margin/Tasks.md';

const FIELD = '⏫🔼🔽🔺⏬📅⏳🛫➕✅❌⏰⏱🔁🔔';
const FIELD_RE = new RegExp(`[${FIELD}]`, 'u');
const LINE_RE = /^(\s*)([-*+]|\d+[.)])\s+\[(.)\]\s?(.*)$/u;
const ID_RE = /\s\^([\w-]+)\s*$/;
const TAG_RE = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;
const DATE = (e: string) => new RegExp(`${e}\\uFE0F?\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u');
const PRIO_OF: Record<string, number> = { '🔺': 5, '⏫': 4, '🔼': 3, '🔽': 2, '⏬': 1 };
const PRIO_EMOJI: Record<number, string> = { 5: '🔺', 4: '⏫', 3: '🔼', 2: '🔽', 1: '⏬' };

/** One task line as the vault holds it. Dates are calendar days (YYYY-MM-DD); `time` is a wall clock (HH:MM). */
export interface VaultTask {
  path: string; line: number; raw: string;
  /** The checkbox character: ' ' open, 'x' done, '-' cancelled, '!' important, '/' started, anything else kept. */
  status: string;
  title: string;
  /** Tags as written, without '#', in order. */
  tags: string[];
  blockId: string | null;
  /** `time` is the start; `timeEnd` the end of a `⏰ 15:15-16:45` range (bone-calendar's blocks), kept whole (B1). */
  due: string | null; time: string | null; timeEnd: string | null; scheduled: string | null; start: string | null; created: string | null;
  doneOn: string | null; cancelledOn: string | null;
  /** Bone's 0–5 scale (0 none). */
  prio: number; estimateMin: number | null;
  /** 🔁 rule text, kept untouched (read-only in Margin). */
  recur: string | null;
  /** v0.7.8.4 (SPEC §9.3): the extra rings of `🔔 -1h, -10m, 07:30, 2026-11-27 07:30`, in order; [] with no 🔔. */
  rings: Ring[];
}

/** One item of a `🔔` list: before ⏰ (or before 09:00 on the due day), a time on the due day, or a date and time. */
export type Ring = { kind: 'before'; min: number } | { kind: 'at'; hm: string } | { kind: 'on'; date: string; hm: string };
const RING_ITEM = '(?:-\\d+[mhd]|\\d{4}-\\d{2}-\\d{2}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2})';
const BELL_RE = new RegExp(`🔔\\uFE0F?\\s*(${RING_ITEM}(?:\\s*,\\s*${RING_ITEM})*)`, 'u');
/** The `🔔` list as rings; items it cannot read are left out (and left in the line). */
export function parseRings(list: string): Ring[] {
  const out: Ring[] = [];
  for (const raw of list.split(',')) {
    const x = raw.trim();
    let m = /^-(\d+)([mhd])$/.exec(x);
    if (m) { out.push({ kind: 'before', min: Number(m[1]) * (m[2] === 'd' ? 1440 : m[2] === 'h' ? 60 : 1) }); continue; }
    m = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})$/.exec(x);
    if (m) { out.push({ kind: 'on', date: m[1]!, hm: `${pad(Number(m[2]))}:${m[3]}` }); continue; }
    m = /^(\d{1,2}):(\d{2})$/.exec(x);
    if (m) out.push({ kind: 'at', hm: `${pad(Number(m[1]))}:${m[2]}` });
  }
  return out;
}
/** Rings as a `🔔` list, in the shortest unit: -1d, -2h, -10m, 07:30, 2026-11-27 07:30. */
export function bellOf(rings: readonly Ring[]): string {
  return rings.map((r) => (r.kind === 'before' ? (r.min % 1440 === 0 ? `-${r.min / 1440}d` : r.min % 60 === 0 ? `-${r.min / 60}h` : `-${r.min}m`) : r.kind === 'at' ? r.hm : `${r.date} ${r.hm}`)).join(', ');
}

export const isDone = (s: string) => s === 'x' || s === 'X';
export const isCancelled = (s: string) => s === '-';
/** bone-tasks' open characters. Anything else is closed: `x` done, `-` cancelled, and bone-calendar's `~` failed and
 *  `»` forwarded (v0.7.8.2, B4: those showed as open). */
export const OPEN_CH = ' /?!>*';
export const isOpen = (s: string) => OPEN_CH.includes(s);
const TIME_RE = /⏰\uFE0F?\s*(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?/u;

/** One line, or null when it is not a task. */
export function parseLine(raw: string, path = '', line = 0): VaultTask | null {
  const m = LINE_RE.exec(raw);
  if (!m) return null;
  const status = m[3]!, body = m[4] ?? '';
  const blockId = ID_RE.exec(body)?.[1] ?? null;
  // the title stops at the first Tasks field (S13: "… in class 📅 2026-" was a title)
  const cut = body.search(FIELD_RE);
  const head = (cut >= 0 ? body.slice(0, cut) : body).replace(ID_RE, '');
  const tags = [...body.matchAll(TAG_RE)].map((x) => x[2]!);
  const title = head.replace(TAG_RE, '$1').replace(/\s{2,}/g, ' ').trim();
  const get = (e: string) => DATE(e).exec(body)?.[1] ?? null;
  const time = TIME_RE.exec(body);
  const est = /⏱️?\s*(?:(\d+)h)?\s*(?:(\d+)m)?/u.exec(body);
  const estMin = est && (est[1] || est[2]) ? (Number(est[1] ?? 0) * 60 + Number(est[2] ?? 0)) : null;
  const prio = (body.match(/[🔺⏫🔼🔽⏬]/u) ?? [])[0];
  const recur = /🔁️?\s*([^⏫🔼🔽🔺⏬📅⏳🛫➕✅❌⏰⏱🔔^]+)/u.exec(body)?.[1]?.trim() ?? null;
  const bell = BELL_RE.exec(body)?.[1];
  return {
    path, line, raw, status, title, tags, blockId,
    due: get('📅'), time: time ? `${pad(Number(time[1]))}:${time[2]}` : null, timeEnd: time?.[3] ? `${pad(Number(time[3]))}:${time[4]}` : null, scheduled: get('⏳'), start: get('🛫'), created: get('➕'),
    doneOn: get('✅'), cancelledOn: get('❌'), prio: prio ? PRIO_OF[prio] ?? 0 : 0, estimateMin: estMin, recur, rings: bell ? parseRings(bell) : [],
  };
}

/** Is this a path whose task lines Margin reads? */
export const readsPath = (p: string) => p.toLowerCase().endsWith('.md') && !EXCLUDED_DIRS.some((d) => p.startsWith(d)) && !GENERATED.includes(p) && !p.startsWith('.');

/**
 * Every task line of a note that counts: outside frontmatter, fenced code, quotes and callouts (S7: a task inside a
 * `> [!conflict]` came back as "> > > - [x] …").
 */
export function parseNote(text: string, path: string): VaultTask[] {
  if (!readsPath(path)) return [];
  const out: VaultTask[] = [];
  const lines = text.split('\n');
  let i = 0, fence: string | null = null;
  if (lines[0]?.trim() === '---') { i = 1; while (i < lines.length && lines[i]!.trim() !== '---') i++; i++; }
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    const f = /^\s*(```+|~~~+)/.exec(l)?.[1];
    if (f) { if (!fence) fence = f[0]!.repeat(f.length); else if (l.trim().startsWith(fence)) fence = null; continue; }
    if (fence || /^\s*>/.test(l)) continue;
    const t = parseLine(l, path, i);
    if (t) out.push(t);
  }
  return out;
}

const norm = (t: string) => t.replace(/^#/, '').toLocaleLowerCase();
/** Does the line carry any tracked tag (the school tag, extra tags, or a subject's own tag)? */
export function tracked(t: Pick<VaultTask, 'tags'>, trackedTags: readonly string[]): boolean {
  const set = new Set(trackedTags.map(norm));
  return t.tags.some((x) => set.has(norm(x)));
}
/** A subject's tag as written in notes: its own, or its name with dashes. */
export const subjectTag = (c: { name: string; tag?: string | null }) => (c.tag && c.tag.trim() ? c.tag.trim() : `#${c.name.trim().replace(/\s+/g, '-')}`);
/** Which of the line's tags are kind tags. */
export const kindTagsOf = (tags: readonly string[]) => tags.map(norm).filter((t): t is KindTag => (KIND_TAGS as readonly string[]).includes(t));

/** A block id Obsidian accepts (`^id`: letters, digits, dashes). */
export const blockIdOf = (id: string) => id.replace(/[^\w-]/g, '-');

/* ── writing ─────────────────────────────────────────────────────────────────────────────────── */
/** Fields Margin may change on a line. Absent = leave as it is. null = remove the field. */
export interface LinePatch {
  status?: ' ' | 'x' | '-';
  due?: string | null; time?: string | null;
  /** ⏳: a line with only a scheduled date is re-dated here, not given a 📅 (B5) */
  scheduled?: string | null;
  prio?: number;
  title?: string;
  /** today, for ✅ / ❌ dates */
  today?: string;
  /** v0.7.8.4: the `🔔` list (bellOf), or null to remove it */
  bell?: string | null;
}
const dropField = (s: string, e: string, val: string) => s.replace(new RegExp(`\\s*${e}\\uFE0F?\\s*${val}`, 'u'), '');
const setField = (s: string, e: string, val: string | null, re: string) => {
  const has = new RegExp(`${e}\\uFE0F?\\s*${re}`, 'u');
  if (val === null) return dropField(s, e, re);
  if (has.test(s)) return s.replace(has, `${e} ${val}`);
  return appendField(s, `${e} ${val}`);
};
/** Adds a field before the block id (or at the end). */
function appendField(s: string, f: string) {
  const m = ID_RE.exec(s);
  if (m) return `${s.slice(0, m.index).replace(/\s+$/, '')} ${f} ^${m[1]}`;
  return `${s.replace(/\s+$/, '')} ${f}`;
}

/** ⏰ as a whole field: a range keeps its length when its start moves, and goes whole when the time is removed (B1:
 *  re-timing `⏰ 15:15-16:45` used to leave `-16:45` behind). */
function setTime(s: string, t: string | null): string {
  const m = TIME_RE.exec(s);
  if (t === null) return m ? s.replace(new RegExp(`\\s*${TIME_RE.source}`, 'u'), '') : s;
  if (!m) return appendField(s, `⏰ ${t}`);
  let v = t;
  const st = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m[3] && st) {
    const len = Number(m[3]) * 60 + Number(m[4]) - (Number(m[1]) * 60 + Number(m[2]));
    const end = Number(st[1]) * 60 + Number(st[2]) + len;
    if (len > 0 && end < 24 * 60) v = `${t}-${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
  }
  return s.replace(TIME_RE, `⏰ ${v}`);
}

/** Margin's change applied to one line, field by field. Unknown text and characters stay as they were. */
export function patchLine(raw: string, p: LinePatch): string {
  const m = LINE_RE.exec(raw);
  if (!m) return raw;
  const [, indent, bullet, status0] = m;
  let body = m[4] ?? '';
  let status = status0!;
  if (p.status !== undefined && !(p.status === 'x' && isDone(status)) && p.status !== status) {
    // reopening a task Obsidian marks "important" or "started" puts it back to open; other characters only change
    // when Margin's own state for the task changed (the caller only sends a status when it did)
    status = p.status;
    if (p.status === 'x') { body = dropField(body, '❌', '\\d{4}-\\d{2}-\\d{2}'); if (p.today && !DATE('✅').test(body)) body = appendField(body, `✅ ${p.today}`); }
    else if (p.status === '-') { body = dropField(body, '✅', '\\d{4}-\\d{2}-\\d{2}'); if (p.today && !DATE('❌').test(body)) body = appendField(body, `❌ ${p.today}`); }
    else { body = dropField(dropField(body, '✅', '\\d{4}-\\d{2}-\\d{2}'), '❌', '\\d{4}-\\d{2}-\\d{2}'); }
  }
  if (p.due !== undefined) body = setField(body, '📅', p.due, '\\d{4}-\\d{2}-\\d{2}');
  if (p.scheduled !== undefined) body = setField(body, '⏳', p.scheduled, '\\d{4}-\\d{2}-\\d{2}');
  if (p.time !== undefined) body = setTime(body, p.time);
  if (p.bell !== undefined) body = p.bell === null || p.bell === '' ? body.replace(new RegExp(`\\s*${BELL_RE.source}`, 'u'), '') : BELL_RE.test(body) ? body.replace(BELL_RE, `🔔 ${p.bell}`) : appendField(body, `🔔 ${p.bell}`);
  if (p.prio !== undefined) {
    const cur = (body.match(/[🔺⏫🔼🔽⏬]/u) ?? [])[0];
    const next = PRIO_EMOJI[p.prio] ?? null;
    if (cur && next) body = body.replace(cur, next);
    else if (cur && !next) body = body.replace(new RegExp(`\\s*${cur}`, 'u'), '');
    else if (!cur && next) body = appendField(body, next);
  }
  if (p.title !== undefined) {
    const cut = body.search(FIELD_RE);
    const head = cut >= 0 ? body.slice(0, cut) : body.replace(ID_RE, '');
    const tags = [...head.matchAll(TAG_RE)].map((x) => `#${x[2]}`);
    const rest = body.slice(head.length);
    body = `${[p.title.replace(/\s+/g, ' ').trim(), ...tags].join(' ')}${rest.startsWith(' ') || !rest ? '' : ' '}${rest}`;
  }
  return `${indent}${bullet} [${status}] ${body.replace(/\s+$/, '')}`;
}

/** A task Margin made, as a new line for `Margin/Tasks.md`. */
export interface NewLine { title: string; tags: string[]; due: string | null; time: string | null; prio: number; estimateMin: number | null; created: string; blockId: string; done?: boolean; doneOn?: string | null; bell?: string }
export function newLine(t: NewLine): string {
  const parts = [`- [${t.done ? 'x' : ' '}] ${t.title.replace(/\s+/g, ' ').trim()}`];
  const seen = new Set<string>();
  for (const tag of t.tags) { const k = norm(tag); if (!k || seen.has(k)) continue; seen.add(k); parts.push(`#${tag.replace(/^#/, '').replace(/\s+/g, '-')}`); }
  if (PRIO_EMOJI[t.prio]) parts.push(PRIO_EMOJI[t.prio]!);
  if (t.due) parts.push(`📅 ${t.due}`);
  if (t.time) parts.push(`⏰ ${t.time}`);
  if (t.bell) parts.push(`🔔 ${t.bell}`);
  if (t.estimateMin) parts.push(`⏱ ${t.estimateMin}m`);
  parts.push(`➕ ${t.created}`);
  if (t.done && t.doneOn) parts.push(`✅ ${t.doneOn}`);
  parts.push(`^${blockIdOf(t.blockId)}`);
  return parts.join(' ');
}

/* ── whole-note edits ────────────────────────────────────────────────────────────────────────── */
/** The line that carries `^blockId`, by the parser's own ID_RE (trailing spaces allowed: B6), or -1. */
export const lineIndexOf = (lines: readonly string[], blockId: string) => lines.findIndex((l) => ID_RE.exec(l)?.[1] === blockId);
/** The note with the line of `blockId` replaced (or removed with `next === null`). Unchanged when not found. */
export function replaceLine(text: string, blockId: string, next: string | null): string {
  const lines = text.split('\n'), i = lineIndexOf(lines, blockId);
  if (i < 0) return text;
  if (next === null) lines.splice(i, 1); else lines[i] = next;
  return lines.join('\n');
}
/** Appends a line to a note, keeping one newline at the end. */
export function appendLine(text: string, line: string): string {
  if (!text.trim()) return `${line}\n`;
  return `${text.replace(/\n*$/, '\n')}${line}\n`;
}
/** B7: `Margin/Tasks.md` keeps `margin: tasks` in its front matter. Restored on Margin's next write, keeping any
 *  other front matter (Obsidian's `created:`). A note without front matter gets it at the top. */
export function withTasksHead(text: string): string {
  if (!text.trim()) return text;
  const lines = text.split('\n');
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      if (lines.slice(1, end).some((l) => /^margin:\s*tasks\s*$/.test(l))) return text;
      lines.splice(1, 0, 'margin: tasks');
      return lines.join('\n');
    }
  }
  return `---\nmargin: tasks\n---\n${text}`;
}
export const TASKS_NOTE_HEAD = '---\nmargin: tasks\n---\n# School tasks\n\n> Tasks made in Margin. Tick, re-date or edit them here or in Margin; both stay in step.\n\n';

/** Gives every tracked task line without a block id one, so Margin can find it again. Returns the new text and
 *  the ids given, by line number. */
export function addBlockIds(text: string, path: string, trackedTags: readonly string[], makeId: () => string): { text: string; given: Map<number, string> } {
  const lines = text.split('\n'), given = new Map<number, string>();
  for (const t of parseNote(text, path)) {
    if (t.blockId || !tracked(t, trackedTags)) continue;
    const id = makeId();
    lines[t.line] = `${lines[t.line]!.replace(/\s+$/, '')} ^${id}`;
    given.set(t.line, id);
  }
  return { text: given.size ? lines.join('\n') : text, given };
}

/* ── Life lines (v0.7.8.3, SPEC §9.1–9.2, D5) ─────────────────────────────────────────────────── */
/** Folders whose untagged (Life) lines stay out, on top of EXCLUDED_DIRS. */
export const LIFE_EXCLUDED = ['Archive/'];
/** Does a line carry a date, a time or a ring: the D5 rule for what reaches the phone. */
export const isDated = (t: Pick<VaultTask, 'due' | 'scheduled' | 'time' | 'raw'>) => !!(t.due || t.scheduled || t.time || /🔔/u.test(t.raw));
/** A Life line that is not Marrow's to track: open, dated, outside Archive/, no tracked tag. */
export const isLifeLine = (t: VaultTask, trackedTags: readonly string[]) =>
  isOpen(t.status) && isDated(t) && !tracked(t, trackedTags) && !LIFE_EXCLUDED.some((d) => t.path.startsWith(d));
/** FNV-1a, 32 bit, base 36: a short stable hash with no I/O. */
function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
/** What a line says, without its status and fields: the part that stays when it is ticked, re-dated or re-timed. */
const coreOf = (t: VaultTask) => `${t.title}|${t.tags.map(norm).sort().join(' ')}`;
/**
 * A Life line's key, read-only (no `^id` written just for reading it, D5 §9.2): `lf` + a hash of its note and what it
 * says without fields, `n` telling apart identical lines in one note. When Marrow first changes the line, this key is
 * written as its `^id`, so the task keeps the same identity from then on.
 */
export const lifeKey = (path: string, t: VaultTask, n = 0) => `lf${fnv(`${path}\n${coreOf(t)}`)}${n ? `-${n}` : ''}`;
/** Every line of a note by its key: its `^id`, or its Life key when it has none. */
export function keysOf(text: string, path: string): Map<string, VaultTask> {
  const out = new Map<string, VaultTask>(), seen = new Map<string, number>();
  for (const t of parseNote(text, path)) {
    if (t.blockId) { out.set(t.blockId, t); continue; }
    const base = lifeKey(path, t), n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.set(n ? lifeKey(path, t, n) : base, t);
  }
  return out;
}
/** The line of `key` in a note (by `^id`, else by Life key), or -1. */
export function findLine(text: string, path: string, key: string): number {
  const i = lineIndexOf(text.split('\n'), key);
  if (i >= 0 || !key.startsWith('lf')) return i;
  return keysOf(text, path).get(key)?.line ?? -1;
}
/** The first change Marrow makes to a Life line also gives it its key as a `^id`. */
export const withId = (line: string, key: string) => (ID_RE.test(line) ? line : `${line.replace(/\s+$/, '')} ^${key}`);

export const ymdOf = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const hmOf = (ms: number) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
