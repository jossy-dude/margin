/**
 * Margin ↔ the Obsidian vault (v0.8 SPEC §1.5, §3.4). Replaces the v0.6/v0.7 file bridge (`obsidian.json` /
 * `margin.json` as a transport, D4): task lines in notes ARE the transport.
 *
 *  · in:  the native sync engine says which notes changed (`onVaultChanged`); their task lines that carry a tracked
 *         tag (default #school, a subject's tag counts too) become Margin tasks, keyed by block id (`extId`);
 *  · out: a task changed in Margin is written back as a field-level patch of its line (status, dates, priority;
 *         the title too in Margin/Tasks.md), through the native compare-and-swap write; a new school task is
 *         appended to Margin/Tasks.md with a block id;
 *  · Margin's own notes (Timetable, Subjects, Notices) and the read-only `.margin/margin.json` snapshot are
 *    rewritten when their text changes.
 * No SAF read on the JS thread and no polling: everything arrives as native events, and the native writes run on
 * the sync thread.
 */
import { applySnapshot, getState, subscribe } from './core';
import { db, R } from './persist';
import { resync } from './reminders';
import { faceEvent } from '../ui/mascot/moments';
import { recordCrash } from '../services/problems';
import { phoneRingsNow } from '../services/notifications';
import { whenIdle } from '../services/idle';
import { onSyncEvent, syncStart, syncInbox, vaultChanges, vaultEdit, vaultFiles, type VaultFile } from '../services/native';
import { timerActions } from './actions/timer';
import { buildEnvelope, prioToBone } from '../domain/bridge';
import { effective, isCancelled as occCancelled } from '../domain/attendance';
import {
  DEFAULT_TRACKED, TASKS_NOTE, TASKS_NOTE_HEAD, addBlockIds, appendLine, blockIdOf, findLine, nextOccurrence, hmOf, isDone, isLifeLine, isOpen, keysOf, newLine,
  parseLine, parseNote, patchLine, subjectTag, tracked, withId, withTasksHead, ymdOf, type LinePatch,
} from '../domain/vaultTasks';
import { noticesNote, subjectsNote, timetableNote } from '../domain/vaultNotes';
import { startOfDay } from '../domain/time';
import { bellFor, lineRingTimes, ringTimes, taskFromLine } from '../domain/vaultMap';
import type { Course, Task } from '../domain/types';


const K = { known: 'vault.known', ids: 'vault.ids', lines: 'vault.lines', out: 'vault.outAt', retry: 'vault.retry', gen: 'vault.gen', reread: 'vault.reread' };
/** Bumped when every note must be read once more from scratch. 1 (v0.7.5): brings back the Obsidian tasks that
 *  v0.7.4's first read dropped (see `refreshVault`). */
const REREAD = '1';
interface Cache { known: Record<string, string>; ids: Record<string, string[]>; lines: Record<string, { p: string; raw: string }>; gen: Record<string, string> }
let cache: Cache | null = null;
const loadJson = async <T,>(k: string, d: T): Promise<T> => { try { const v = await R().getKv(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } };
async function load(): Promise<Cache> {
  if (cache) return cache;
  cache = { known: await loadJson(K.known, {}), ids: await loadJson(K.ids, {}), lines: await loadJson(K.lines, {}), gen: await loadJson(K.gen, {}) };
  return cache;
}
async function save() { if (!cache) return; await R().setKv(K.known, JSON.stringify(cache.known)); await R().setKv(K.ids, JSON.stringify(cache.ids)); await R().setKv(K.lines, JSON.stringify(cache.lines)); await R().setKv(K.gen, JSON.stringify(cache.gen)); }

export interface ObsidianStatus { at: number; ok: boolean; note: string; tasks: number }
let status: ObsidianStatus = { at: 0, ok: true, note: '', tasks: 0 };
const subs = new Set<() => void>();
export const obsidianStatus = () => status;
export const onObsidian = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
const report = (s: Partial<ObsidianStatus>) => { status = { ...status, at: Date.now(), ...s }; subs.forEach((f) => f()); };

/** The tags whose lines come in: the owner's list, plus every subject's own tag. */
export function trackedTags(courses: readonly Course[] = getState().courses): string[] {
  const own = getState().settings.trackedTags?.length ? getState().settings.trackedTags! : DEFAULT_TRACKED;
  return [...own, ...courses.filter((c) => !c.demo && !c.archived).map(subjectTag)];
}
const norm = (t: string) => t.replace(/^#/, '').toLocaleLowerCase();
/** The out cursor follows the change feed's own clock (the repository's), never the wall clock. */
async function bumpOut() {
  const since = Number(await R().getKv(K.out)) || 0;
  const ch = await R().changes('task', since);
  if (ch.length) await R().setKv(K.out, String(Math.max(...ch.map((x) => x.updatedAt))));
}
const newId = () => `m${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;

const same = (a: Task, b: Task) => JSON.stringify({ ...a, ord: a.ord ?? null }) === JSON.stringify({ ...b, ord: b.ord ?? null });

/* ── in ───────────────────────────────────────────────────────────────────────────────────────── */
let busy: Promise<void> = Promise.resolve();
const serial = (f: () => Promise<void>) => { busy = busy.then(f).catch((e) => { recordCrash(e, 'save', 'Obsidian'); report({ ok: false, note: String((e as Error)?.message ?? e) }); }); return busy; };

/** Read the vault's notes (`only` = these paths, [] = every note) and bring their task lines in. */
export const refreshVault = (only: string[] = []) => serial(async () => {
  if (db.demo) return;
  const c = await load();
  /* The first read (after the upgrade to v0.8, or the first vault ever) only links tasks to their lines: before
     it nothing is known about the notes, so Margin's history must not go out as if it were new. v0.7.4 did that:
     the old Obsidian tasks were appended to Margin/Tasks.md as copies, and then dropped. After the first read the
     out cursor starts at the present. */
  const first = !(await R().getKv(K.out));
  // Margin's own changes go out first (they are newer than what the notes say), and before the notes are read,
  // so the read sees what Margin just wrote and not the text from before it
  if (!first) await pushOut();
  const full = only.length === 0;
  if (full && (await R().getKv(K.reread)) !== REREAD) c.known = {};
  const res = await vaultFiles(c.known, only);
  if (!res) return;
  if (res.error) { report({ ok: false, note: res.error === 'no vault' ? 'Choose the vault folder' : res.error }); return; }
  const n = await ingest(res.files, res.gone, full);
  if (first) { await startOut(); await catchUp(); }
  if (full) await R().setKv(K.reread, REREAD);
  await save();
  report({ ok: true, note: n.added || n.changed || n.removed ? `${n.added} new · ${n.changed} changed · ${n.removed} removed` : 'Up to date', tasks: Object.keys(c.lines).length });
  if (n.added) faceEvent('taskArrived');
});

async function ingest(files: VaultFile[], gone: string[], full: boolean): Promise<{ added: number; changed: number; removed: number }> {
  const c = await load(), s = getState(), now = Date.now();
  const own = s.settings.trackedTags?.length ? s.settings.trackedTags : DEFAULT_TRACKED, all = trackedTags(s.courses);
  const pending = new Set((await R().changes('task', Number(await R().getKv(K.out)) || 0)).map((x) => x.id));
  let added = 0, changed = 0, removed = 0;
  const writes: Task[] = [];
  const byExt = new Map(s.tasks.filter((t) => t.extId).map((t) => [t.extId!, t]));
  const byOwn = new Map(s.tasks.filter((t) => !t.origin).map((t) => [blockIdOf(t.id), t]));
  for (const f of files) {
    if (f.text === undefined) continue;
    let text = f.text, h = f.h;
    // a tracked line without a block id gets one, so Margin can find it again (written back at once)
    const ids = addBlockIds(text, f.p, all, newId);
    if (ids.given.size) {
      const r = await vaultEdit(f.p, h, ids.text);
      if (r.startsWith('ok:')) { text = ids.text; h = r.slice(3); }
    }
    /* v0.7.8.3 (D5): School lines (a tracked tag) as before, with a ^id; and every open Life line with a date, time
       or ring, known by its read-only Life key until Marrow first changes it (no ^id spam, §9.2). A line already
       known keeps coming in when it closes, so a tick in Obsidian reaches the phone. */
    const lines = [...keysOf(text, f.p)].filter(([k, t]) => (t.blockId ? tracked(t, all) || byOwn.has(k) : false) || byExt.has(k) || isLifeLine(t, all));
    c.ids[f.p] = lines.map(([k]) => k);
    c.known[f.p] = h;
    for (const [bid, t] of lines) {
      c.lines[bid] = { p: f.p, raw: t.raw };
      const prev = byExt.get(bid) ?? byOwn.get(bid);
      if (prev && pending.has(prev.id)) continue;   // changed in Margin since: that change goes out first
      const next = taskFromLine({ ...t, blockId: bid }, prev, s.courses, own, now);
      if (prev && same(prev, next)) continue;
      writes.push(next); if (prev) changed++; else added++;
    }
  }
  for (const p of gone) { delete c.known[p]; c.ids[p] = []; }
  // a block id that is in no note any more: its task goes (the line was deleted in Obsidian)
  const live = new Set(Object.values(c.ids).flat());
  const drop: string[] = [];
  const touched = new Set([...files.filter((f) => f.text !== undefined).map((f) => f.p), ...gone]);
  const wrote = new Set(writes.map((t) => t.id));
  for (const [bid, l] of Object.entries(c.lines)) {
    if (live.has(bid) || (!full && !touched.has(l.p))) continue;
    delete c.lines[bid];
    const t = byExt.get(bid) ?? byOwn.get(bid);
    // a task this read just wrote has its line in a note (it moved): it stays
    if (t && !pending.has(t.id) && !wrote.has(t.id)) { drop.push(t.id); removed++; }
  }
  for (const t of writes) await R().upsert('task', t);
  if (drop.length) await R().removeMany(drop.map((id) => ({ entity: 'task' as const, id })));
  if (writes.length || drop.length) { applySnapshot(await R().load(), true); resync(0); }
  // our own writes are not Margin edits: move the out cursor past them so they are not patched back
  if (writes.length || drop.length) await bumpOut();
  return { added, changed, removed };
}

/* ── out ──────────────────────────────────────────────────────────────────────────────────────── */
/** The line fields Margin owns, as they should be for this task. */
function wanted(t: Task, inTasksNote: boolean): LinePatch {
  const due = t.dueAt === null ? null : ymdOf(t.dueAt);
  const tm = t.dueAt === null ? null : hmOf(t.dueAt);
  const p: LinePatch = { due, time: tm === '23:59' ? null : tm, prio: prioToBone(t.priority), status: t.status === 2 ? (t.cancelled ? '-' : 'x') : ' ', today: ymdOf(t.completedAt ?? Date.now()) };
  if (inTasksNote) p.title = t.title;
  return p;
}
/** Only what differs from the line, so a line Margin did not change is left byte for byte. */
function diff(raw: string, w: LinePatch, task?: Task): LinePatch | null {
  const cur = parseLine(raw);
  if (!cur) return null;
  const out: LinePatch = {};
  // B4: `~` failed and `»` forwarded are closed, and read back as cancelled: Marrow never rewrites them as `-`
  const curOpen = isOpen(cur.status);
  if (w.status === ' ' && !curOpen) out.status = ' ';
  if (w.status === 'x' && !isDone(cur.status)) out.status = 'x';
  if (w.status === '-' && (curOpen || isDone(cur.status))) out.status = '-';
  if (out.status) out.today = w.today;
  // B5: a ⏳-only line is re-dated on its ⏳; it never gains a 📅
  if ((w.due ?? null) !== (cur.due ?? cur.scheduled ?? null)) { if (cur.due === null && cur.scheduled !== null && w.due !== null) out.scheduled = w.due; else out.due = w.due; }
  if ((w.time ?? null) !== (cur.time ?? null)) out.time = w.time;
  if (w.prio !== undefined && w.prio !== cur.prio) out.prio = w.prio;
  if (w.title !== undefined && w.title !== cur.title) out.title = w.title;
  // B8: the rings, compared as instants (the line's words win when they mean the same times)
  if (task) {
    const want = ringTimes({ reminders: task.reminders, dueAt: task.dueAt }), have = lineRingTimes(out.due !== undefined || out.time !== undefined || out.scheduled !== undefined ? parseLine(patchLine(raw, out))! : cur);
    if (want.join(',') !== have.join(',')) out.bell = bellFor(task, w.time ?? null) || null;
  }
  return Object.keys(out).length ? out : null;
}
/** Does a Margin task go to the vault? Its tags carry a tracked tag (the Task form has #school on by default). */
const goesOut = (t: Task, own: readonly string[]) => !t.demo && (t.tags ?? ['school']).some((x) => own.map(norm).includes(norm(x)));

async function textOf(p: string): Promise<{ text: string; h: string } | null> {
  const c = await load();
  const res = await vaultFiles({ ...c.known, [p]: '' }, [p]);
  const f = res?.files.find((x) => x.p === p);
  if (!f) return res && res.gone.includes(p) ? { text: '', h: '' } : null;
  return { text: f.text ?? '', h: f.h };
}
/** One edit of one note, retried once when the note changed under it. False = try again later. */
async function editNote(p: string, change: (text: string) => string | null): Promise<boolean> {
  for (let i = 0; i < 2; i++) {
    const cur = await textOf(p);
    if (!cur) return false;
    let next = change(cur.text);
    if (next === null || next === cur.text) return true;
    if (p === TASKS_NOTE) next = withTasksHead(next); // B7
    const r = await vaultEdit(p, cur.h, next);
    if (r.startsWith('ok:')) { const c = await load(); c.known[p] = r.slice(3); for (const t of parseNote(next, p)) if (t.blockId && c.lines[t.blockId]) c.lines[t.blockId] = { p, raw: t.raw }; return true; }
    if (r === 'deferred' || r.startsWith('error:')) return false;
  }
  return false;
}

/** After the first read: everything Margin had is either in a note already or caught up by `catchUp`. */
async function startOut() {
  const ch = await R().changes('task', 0);
  await R().setKv(K.out, String(ch.length ? Math.max(...ch.map((x) => x.updatedAt)) : 0));
}
/** A school task made in Margin that is in no note: one line in Margin/Tasks.md. False = try again later. */
async function appendToTasksNote(t: Task, stamp: Task[]): Promise<boolean> {
  const c = await load(), s = getState();
  const course = s.courses.find((x) => x.id === t.courseId);
  const w = wanted(t, true);
  const tags = [...new Set([...(t.tags ?? []).map(norm), ...(course ? [subjectTag(course).replace(/^#/, '')] : [])])];
  const ln = newLine({ title: t.title, tags, due: w.due ?? null, time: w.time ?? null, prio: w.prio ?? 0, estimateMin: t.estimateMin, created: ymdOf(t.createdAt), blockId: blockIdOf(t.id), done: t.status === 2, doneOn: t.completedAt ? ymdOf(t.completedAt) : null, bell: bellFor(t, w.time ?? null) });
  const ok = await editNote(TASKS_NOTE, (txt) => (txt.includes(`^${blockIdOf(t.id)}`) ? null : appendLine(txt || TASKS_NOTE_HEAD, ln)));
  if (!ok) return false;
  c.lines[blockIdOf(t.id)] = { p: TASKS_NOTE, raw: ln };
  c.ids[TASKS_NOTE] = [...new Set([...(c.ids[TASKS_NOTE] ?? []), blockIdOf(t.id)])];
  stamp.push({ ...t, extId: blockIdOf(t.id), extPath: TASKS_NOTE });
  return true;
}
/** Only Margin's own tasks are ever appended: one that came from a note, or has been in one, waits for its line. */
const mayAppend = (t: Task, own: readonly string[]) => !t.origin && !t.extId && goesOut(t, own);
/** The first read's catch-up: Margin's own school tasks that no note has yet (made before any vault was read). */
async function catchUp(): Promise<void> {
  const c = await load(), s = getState();
  const own = s.settings.trackedTags?.length ? s.settings.trackedTags : DEFAULT_TRACKED;
  const stamp: Task[] = [], failed: string[] = [];
  for (const t of s.tasks) if (mayAppend(t, own) && !c.lines[blockIdOf(t.id)] && !(await appendToTasksNote(t, stamp))) failed.push(t.id);
  for (const t of stamp) await R().upsert('task', t);
  if (stamp.length) { applySnapshot(await R().load(), true); await bumpOut(); }
  if (failed.length) { await R().setKv(K.retry, JSON.stringify(failed)); scheduleRetry(); }
}

async function pushOut(): Promise<void> {
  if (db.demo) return;
  // nothing goes out before the first read of the vault (`refreshVault`): no line is known yet
  if (!(await R().getKv(K.out))) return;
  const c = await load(), s = getState();
  const own = s.settings.trackedTags?.length ? s.settings.trackedTags : DEFAULT_TRACKED;
  const since = Number(await R().getKv(K.out)) || 0;
  const retry = new Set(await loadJson<string[]>(K.retry, []));
  const changes = await R().changes('task', since);
  const ids = new Set([...changes.map((x) => x.id), ...retry]);
  const failed: string[] = [];
  const stamp: Task[] = [];
  for (const id of ids) {
    const ch = changes.find((x) => x.id === id);
    const t = ch?.deleted ? null : s.tasks.find((x) => x.id === id) ?? ch?.value ?? null;
    const bid = t?.extId ?? ch?.value.extId ?? (id.startsWith('ob-') ? id.slice(3) : blockIdOf(id));
    const line = c.lines[bid];
    if (!t) {
      // deleted in Margin: its line leaves the note it is in
      if (line && !(await editNote(line.p, (txt) => { const ls = txt.split('\n'), i = findLine(txt, line.p, bid); if (i < 0) return null; ls.splice(i, 1); return ls.join('\n'); }))) failed.push(id); else delete c.lines[bid];
      continue;
    }
    if (line) {
      const d = diff(line.raw, wanted(t, line.p === TASKS_NOTE), t);
      if (!d) continue;
      // B6: the line is found by ID_RE, as the parser finds it (a trailing space no longer hides it)
      // a Life line gets its key as its ^id with this first change (§9.2), so it is found the same way from now on
      // D12: ticking a 🔁 line from the phone writes its next occurrence above it, as bone-tasks does
      let added = false;
      if (!(await editNote(line.p, (txt) => {
        const ls = txt.split('\n'), i = findLine(txt, line.p, bid);
        if (i < 0) return null;
        const old = ls[i]!, next = d.status === 'x' && !isDone(parseLine(old)?.status ?? ' ') ? nextOccurrence(old, ymdOf(Date.now())) : null;
        ls[i] = withId(patchLine(old, d), bid);
        if (next) { ls.splice(i, 0, next); added = true; }
        return ls.join('\n');
      }))) failed.push(id);
      // the new line is in no task yet: the next read takes the note again instead of trusting its hash
      else if (added) delete c.known[line.p];
      continue;
    }
    // a new school task: one line in Margin/Tasks.md, with the subject's tag and its kind tags
    if (!mayAppend(t, own)) continue;
    if (!(await appendToTasksNote(t, stamp))) failed.push(id);
  }
  for (const t of stamp) await R().upsert('task', t);
  if (stamp.length) applySnapshot(await R().load(), true);
  if (changes.length) await R().setKv(K.out, String(Math.max(...changes.map((x) => x.updatedAt))));
  if (stamp.length) await bumpOut();
  await R().setKv(K.retry, JSON.stringify(failed));
  await save();
  if (failed.length) scheduleRetry();
}
let retryT: ReturnType<typeof setTimeout> | null = null;
function scheduleRetry() { if (retryT) return; retryT = setTimeout(() => { retryT = null; void serial(pushOut); }, 5000); }

/* ── Margin's own notes ───────────────────────────────────────────────────────────────────────── */
async function writeGenerated() {
  if (db.demo) return;
  const c = await load(), s = getState(), now = Date.now();
  const env = buildEnvelope({
    now, since: now, courses: s.courses, meetings: s.meetings, tasks: [], notices: [], focus: [], moves: s.settings.moves ?? [],
    cancelled: (d, m) => occCancelled(effective(new Date(`${d}T12:00:00`), m, s.attendance, s.dayMarks, now)),
  });
  const cls = env.events.filter((e) => e.data?.kind === 'class' && !e.data.cancelled).map((e) => e.data!);
  const nowClass = cls.find((e) => e.at <= now && (e.end ?? e.at) > now) ?? null, nextClass = cls.find((e) => e.at > now) ?? null;
  const snapshot = {
    // no clock in it (`writtenAt`, each class's `updatedAt`): the file changes only when what it says changes
    ...env, writtenAt: 0, events: env.events.map((e) => ({ ...e, updatedAt: 0 })), format: 'margin-snapshot/2', readOnly: true,
    // for Bone Tasks' School switch and subject picker, and Bone Home's "Now" line (§3.4)
    trackedTags: trackedTags(s.courses).slice(0, (s.settings.trackedTags?.length || 1)),
    subjects: s.courses.filter((x) => !x.demo && !x.archived).map((x) => ({ id: x.id, name: x.name, tag: subjectTag(x), color: x.color ?? null })),
    now: nowClass, next: nextClass,
    // D6 (v0.7.8.4): the task rings the phone rings in the next two days, stamped with the day so the desktop knows
    // it is fresh (< 1 day); bone-tasks skips its own pop-up for each. Digests stay on the desktop.
    phoneRingsDay: ymdOf(now), phoneRings: phoneRingsNow().filter((r) => r.at > now && r.at < now + 2 * 86_400_000),
  };
  const out: [string, string][] = [
    ['Margin/Timetable.md', timetableNote(env.events)],
    ['Margin/Subjects.md', subjectsNote({ courses: s.courses, marks: s.marks, variants: s.variants ?? [], adjusts: s.adjusts })],
    ['Margin/Notices.md', noticesNote(s.notices, s.courses, startOfDay(now))],
    ['.margin/margin.json', `${JSON.stringify(snapshot, null, 1)}\n`],
  ];
  for (const [p, text] of out) {
    if (c.gen[p] === text) continue;
    const r = await vaultEdit(p, '*', text);
    if (r.startsWith('ok:')) c.gen[p] = text;
  }
  await save();
}

/* ── start ────────────────────────────────────────────────────────────────────────────────────── */
/** Rows the sync service queued while JS slept: only the newest timer state matters. */
function drainInbox() {
  const timers = syncInbox().filter((x) => x.kind === 'timer');
  const last = timers[timers.length - 1];
  if (last) timerActions.timerFromHub(last.json);
}

/** Starts the link. Work waits until the first screen is drawn (§2.3); returns the stop function. */
export function startObsidian(): () => void {
  syncStart();
  drainInbox();
  let stopped = false;
  const cancelFirst = whenIdle(() => {
    if (stopped) return;
    const queued = vaultChanges();
    void refreshVault(queued.length ? queued : []).then(() => serial(writeGenerated));
  }, 3000);
  const offVault = onSyncEvent('onVaultChanged', () => { const paths = vaultChanges(); if (paths.length) void refreshVault(paths); });
  const offTimer = onSyncEvent('onSyncTimer', (json) => timerActions.timerFromHub(json));
  let wasOnline = false;
  const offStatus = onSyncEvent('onSyncStatus', (json) => {
    let online = false; try { online = !!(JSON.parse(json) as { live?: boolean }).live; } catch { /* */ }
    if (online && !wasOnline) timerActions.timerRejoin();
    wasOnline = online;
  });
  /* 750 ms after Margin's own rows change: tasks go out as line patches, Margin's notes are rewritten */
  let soon: ReturnType<typeof setTimeout> | null = null;
  const rowsOf = () => { const s = getState(); return [s.tasks, s.meetings, s.courses, s.notices, s.marks, s.settings] as const; };
  let rows = rowsOf();
  const unsub = subscribe(() => {
    const next = rowsOf();
    if (next.every((x, i) => x === rows[i])) return;
    rows = next;
    if (soon) clearTimeout(soon);
    soon = setTimeout(() => { soon = null; void serial(pushOut).then(() => serial(writeGenerated)); }, 750);
  });
  return () => { stopped = true; cancelFirst(); if (soon) clearTimeout(soon); if (retryT) clearTimeout(retryT); offVault(); offTimer(); offStatus(); unsub(); };
}
/** Sync now (Settings): every note again, then Margin's notes. */
export const obsidianNow = () => refreshVault([]).then(() => serial(writeGenerated));
/** Tests only. */
export const resetObsidianCache = () => { cache = null; };
