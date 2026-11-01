import type { SemesterRow, Settings } from '../domain/types';
import { withDefaults } from '../domain/defaults';
import { buildSnapshot, newSemester, semesterName } from '../domain/archive';
import { isYmd, suggestEnd, validRange } from '../domain/semester';
import { recordCrash } from '../services/problems';
import { configureFx } from '../services/fx';
import { applySnapshot, getState, set } from './core';
import { optimistic, persist, R } from './persist';
import { resync } from './reminders';
import { toast } from './toast';

/* ───── the row, and its mirror ───── */

/** Read the terms, and repair `settings.semesterStart/End` from the active row when the two disagree.
 *
 *  v0.9 split one fact in two: the active `semesters` row is the truth and the settings pair is its
 *  mirror. The split is only safe if a mirror that drifts is repaired, because the pair is written by
 *  code that never touches the row — `act.setSettings` (the tour's last step, `adoptDemo`'s hand-over)
 *  and the import door's settings patch among them — while the whole app (Grades, export, the Settings
 *  summary, the attendance grid) keeps reading the pair. The row is authoritative; this is the one place
 *  that makes that true on read, so a KV-only writer is harmless instead of a permanent disagreement.
 *
 *  Called by `hydrate()` (a restart, and the boot right after a demo session was adopted) and by
 *  `loadSemesters()` (the in-session read; the tour wrote the KV before adoption in the same session).
 *  Both use the SAME helper so the two doors cannot disagree about which one wins.
 *
 *  Failure is not fatal and is not silent: a repository that cannot answer leaves the cached rows alone
 *  (returning `null`, so callers keep what they had) and lands in the Problems log. `setActiveSemester`
 *  throws on an unknown id — wrapped here, because a read must never throw at the call site. */
export async function reconcileSemesters(): Promise<SemesterRow[] | null> {
  try {
    const rows = await R().listSemesters();
    const active = rows.find((x) => x.active);
    const st = getState().settings;
    if (active && (st.semesterStart !== active.start || st.semesterEnd !== active.end)) {
      await R().setActiveSemester(active.id); // one transaction: the row is re-mirrored into the KV
      set({ settings: withDefaults((await R().load()).settings) }); // and the app reads what landed on disk
    }
    return rows;
  } catch (e) { recordCrash(e, 'data', 'Semesters'); return null; }
}

/** The term an import asks for, written where v0.9 reads it: the active `semesters` row.
 *
 *  The import door wrote `settings.semesterStart/End` only, and the next `loadSemesters()` replaced
 *  that pair with the row's — so a file that says "the term starts 7 September" survived the toast and
 *  died on the next screen. The row is written here, after `importSnapshot` (a repository call inside
 *  its transaction would deadlock, the same reason it writes settings itself), and `setActiveSemester`
 *  mirrors the pair back into the KV, so the two cannot disagree afterwards.
 *
 *  Merge-only, as everywhere in this door: a file that carries no start changes nothing; a missing
 *  `semesterEnd` key keeps the row's end; an explicit empty one opens the term; and a start that would
 *  strand the old end (or a malformed end) takes the domain's own 15-week seed rather than storing an
 *  impossible pair. A repository with no active row gets one named from the start (`newSemester`'s
 *  naming rule). */
export async function carryImportedRange(patch: Partial<Settings> | undefined) {
  const start = patch?.semesterStart;
  if (!isYmd(start)) return;
  const rows = await R().listSemesters();
  const active = rows.find((x) => x.active) ?? null;
  const carriesEnd = !!patch && 'semesterEnd' in patch;
  const said = carriesEnd ? String(patch?.semesterEnd ?? '') : active?.end ?? suggestEnd(start);
  const end = !said || (isYmd(said) && validRange(start, said)) ? said : suggestEnd(start);
  if (active && active.start === start && active.end === end) { set({ semesters: rows }); return; }
  const next: SemesterRow = active
    ? { ...active, start, end }
    : { ...newSemester(getState().now), name: semesterName(start), start, end };
  await R().saveSemester(next);
  await R().setActiveSemester(next.id);
  set({ semesters: await R().listSemesters() });
}

/* ── semesters (v0.9) ─────────────────────────────────────────────────────────────────────────
 * `settings.semesterStart/End` stopped being the truth in v0.9: the active `semesters` row is, and
 * the pair is its mirror. Every write below goes through the repository's own mirror writer
 * (`setActiveSemester`) rather than writing the settings directly, so a range cannot end up on
 * screen that the row does not have. The store keeps the loaded rows so the Semesters page and the
 * Settings attendance control read and write the same term without a query per keystroke. */

/** List the terms. The active row is authoritative, so a settings mirror that disagrees with it is
 *  rewritten from the row as part of this read — a KV-only writer is therefore harmless rather than
 *  something every caller has to know about. A repository with no active row heals with today's term
 *  (fresh install, a wipe, or a roll-over killed between archiving and activating) inside the same
 *  call, and its mirror write comes back through the same reconciliation. */
export async function loadSemesters() {
  const rows = await reconcileSemesters(); // records the failure itself; `null` keeps the cached rows
  if (rows) set({ semesters: rows });
}

export async function renameSemester(id: string, name: string) {
  const clean = name.trim(), row = getState().semesters.find((x) => x.id === id);
  if (!clean || !row || row.name === clean) return;
  const next: SemesterRow = { ...row, name: clean };
  const put = (r: SemesterRow) => set((s) => ({ semesters: s.semesters.map((x) => (x.id === id ? r : x)) }));
  await optimistic(() => put(next), () => R().saveSemester(next), () => put(row));
}

/** Save one term's range. The active term's pair is mirrored by `setActiveSemester`; an archived
 *  term keeps its own range and never touches what the app is reading today. */
export async function setSemesterRange(id: string, semesterStart: string, semesterEnd: string) {
  const row = getState().semesters.find((x) => x.id === id);
  if (!row) return;
  const next: SemesterRow = { ...row, start: semesterStart, end: semesterEnd };
  const was = getState().settings;
  const put = (r: SemesterRow, start: string, end: string) => set((s) => ({
    semesters: s.semesters.map((x) => (x.id === id ? r : x)),
    ...(row.active ? { settings: { ...s.settings, semesterStart: start, semesterEnd: end } } : {}),
  }));
  await optimistic(
    () => put(next, semesterStart, semesterEnd),
    async () => { await R().saveSemester(next); if (row.active) await R().setActiveSemester(id); },
    () => put(row, was.semesterStart, was.semesterEnd),
  );
}

/** The Settings → Attendance control knows the range but not the id. The active row is the one it
 *  means, so the write goes through `setSemesterRange` — a settings-only write would leave the row
 *  printing last term's dates. */
export async function setActiveRange(semesterStart: string, semesterEnd: string) {
  // The mirror moves first and synchronously: this control sits under the user's finger, and a day
  // typed into it must read back before the row write's promise resolves.
  set((s) => ({ settings: { ...s.settings, semesterStart, semesterEnd } }));
  let active = getState().semesters.find((x) => x.active);
  if (!active) {
    try {
      const rows = await R().listSemesters();
      set({ semesters: rows });
      active = rows.find((x) => x.active);
    } catch (e) { recordCrash(e, 'data', 'Settings'); }
  }
  if (!active) {
    // No row at all (a preview, or a store built for a test): the mirror is all there is to write.
    await persist(R().putSettings({ semesterStart, semesterEnd }));
    return;
  }
  const next: SemesterRow = { ...active, start: semesterStart, end: semesterEnd };
  set((s) => ({ semesters: s.semesters.map((x) => (x.id === active!.id ? next : x)) }));
  await persist(R().saveSemester(next));
  await persist(R().setActiveSemester(active.id));
}

/** Roll the term over: freeze the live rows into the old row's snapshot, clear the day tables (the
 *  owner chooses whether attendance goes with them), create the next term and make it active. The
 *  order matters — the archive is written before anything is cleared, and the next row exists before
 *  it becomes the one the app reads, so a kill in between leaves history, never a lost term. */
/** `range` is the next term's dates as the roll-over sheet asked for them (D4); absent = today plus the
 *  15-week seed, as before. */
export async function rollOverSemester(keepAttendance: boolean, range?: { start: string; end: string }) {
  const st = getState();
  const active = st.semesters.find((x) => x.active);
  if (!active) return;
  try {
    const snapshotJson = buildSnapshot(st.courses, st.meetings, st.attendance, st.marks, st.tasks, st.settings, st.variants, { notices: st.notices, dayMarks: st.dayMarks, adjusts: st.adjusts, focus: st.focus });
    await R().saveSemester({ ...active, active: false, snapshotJson, archivedAt: new Date().toISOString() });
    await R().clearActiveSchedule(keepAttendance);
    const seeded = newSemester(getState().now);
    const next = range && isYmd(range.start) ? { ...seeded, start: range.start, end: range.end, name: semesterName(range.start) } : seeded;
    await R().saveSemester(next);
    await R().setActiveSemester(next.id);
    applySnapshot(await R().load(), true);
    configureFx(getState().settings);
    set({ semesters: await R().listSemesters() });
    toast(`${active.name} archived${keepAttendance ? ' — attendance kept' : ''}`);
    resync(0);
  } catch (e) {
    recordCrash(e, 'save', 'Semesters');
    toast(`Couldn't start a new semester: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
    /* A roll-over that failed part-way may have archived, cleared or created some of its rows: the screen
       re-reads what the disk now holds instead of showing the term it started from. */
    try { applySnapshot(await R().load(), true); await loadSemesters(); } catch (e2) { recordCrash(e2, 'data', 'Semesters'); }
  }
}

export const semesterActions = { loadSemesters, renameSemester, setSemesterRange, setActiveRange, rollOverSemester };
