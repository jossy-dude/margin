import type { Repository } from '../data/repository';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { TOUR_VERSION, toured } from '../domain/defaults';
import { hasRealRows } from '../domain/rows';
import type { ImportPlan } from '../domain/importPlan';
import { recordCrash } from '../services/problems';
import { configureFx } from '../services/fx';
import { applySnapshot, getState, set, type State } from './core';
import { openRepository } from './openRepository';
import { db, ensureRepo, R, reportSaveFailure } from './persist';
import { resync } from './reminders';
import { carryImportedRange, loadSemesters, reconcileSemesters, setActiveRange } from './semesters';
import { setSettings } from './actions/entities';
import { toast } from './toast';

/* ───── hydrate ───── */
export async function hydrate(r: Repository) {
  db.repo = r;
  try {
    const snap = await r.load();
    applySnapshot(snap); configureFx(getState().settings);
    const rows = await reconcileSemesters();
    set({ ready: true, now: Date.now(), semesters: rows ?? [] }); resync(1500);
    /* No JS update check at launch (D5): the build checks natively on every launch
       (`EXPO_UPDATES_CHECK_ON_LAUNCH=ALWAYS`), before any JS runs, and a second request from here only
       doubled the traffic. Resume checks (throttled) live in `lifecycle.ts`; the "you're now on…"
       sentence is said by the mounted shell (`useUpdateAnnouncement`). */
  } catch (e) { set({ error: String((e as Error)?.message ?? e), ready: true }); }
}
/** What App.tsx runs to bring the app up — the open-and-decide step v0.1 grew.
 *
 *  It opens the REAL database first (and keeps it in `db.real`), then on a **genuine first run** —
 *  never onboarded, and no row the user made (`domain/rows.ts`) — hands this session the sample
 *  semester as a seeded `MemoryRepository` instead of re-pointing the store at the database. The
 *  tour then runs over data that was never written to the file: what the user taps into existence
 *  during the tour is written ONLY to that memory copy, `act.adoptDemo()` gives the non-demo rows
 *  back to the real repository when the tour is left, and until then `resync` schedules nothing,
 *  because no reminder may ring for a sample class. A device with real rows but no tour yet — an
 *  upgrade — hydrates from its own database as always and gets the tour without the samples. */
export async function boot() {
  const r = await openRepository();
  db.real = r;
  const snap = await r.load();
  if (!toured(snap.settings.onboarded) && !hasRealRows(snap)) {
    const d = new MemoryRepository();
    await d.seed(seedSnapshot());
    db.demo = true;
    await hydrate(d);
  } else {
    await hydrate(r);
  }
}

/** Optimistic half of the repository purge: the same six collections the SQL DELETEs cover, so the
 *  screen cannot keep showing sample rows the database no longer has. */
export async function purgeDemo() {
  /* The screen follows the disk: a purge the repository refused leaves the samples where they are, on
     screen as on disk, and says so — rather than hiding rows that would come back on the next launch. */
  try { await R().purgeDemo(); } catch (e) { reportSaveFailure(e); return; }
  set((s) => ({ courses: s.courses.filter((c) => !c.demo), meetings: s.meetings.filter((m) => !m.demo), notices: s.notices.filter((n) => !n.demo), marks: s.marks.filter((m) => !m.demo), tasks: s.tasks.filter((t) => !t.demo), focus: s.focus.filter((f) => !f.demo) })); toast('Sample data removed'); resync();
}

/** The import path's write half. The parser has already refused anything it could not read, so a plan
 *  with problems is never applied; a plan without them lands in ONE transaction, and the store is then
 *  reloaded from the repository rather than patched from the file, so what is on screen is exactly what
 *  is on disk. The timer is deliberately kept (`applySnapshot(..., true)`): importing a term's timetable
 *  in the middle of a focus round must not end that round. */
export async function importPlan(plan: ImportPlan): Promise<boolean> {
  if (plan.problems.length) return false;
  try {
    await R().importSnapshot(plan.snapshot);
    await carryImportedRange(plan.snapshot.settings);
    /* Archived terms (margin/2) are history: one the phone already has keeps the phone's copy, the rest
       are added as archived rows. None is ever made active — the running term is the phone's. */
    if (plan.semesters?.length) {
      const have = new Set((await R().listSemesters()).map((r) => r.id));
      for (const row of plan.semesters) if (!have.has(row.id)) await R().saveSemester({ ...row, active: false });
      await loadSemesters();
    }
    applySnapshot(await R().load(), true);
    configureFx(getState().settings);
    const rows = Object.values(plan.counts).reduce((a, b) => a + b, 0);
    toast(rows ? `Imported ${rows} row${rows === 1 ? '' : 's'}` : 'Semester saved');
    resync(0);
    return true;
  } catch (e) {
    recordCrash(e, 'save', 'Import');
    toast(`Import failed: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
    return false;
  }
}

/** The one true "erase everything": wipe every table (on device, the FILE itself — SQLite's close
 *  + delete, WAL/SHM with it), then re-open a fresh, EMPTY database. No sample semester comes
 *  back: since v0.1 the demo set is a first-session memory playground, not something the database
 *  holds, so a full reset leaves a clean planner. */
export async function resetAll() {
  try {
    /* The REAL database is what "erase everything" means, even from inside the tour (whose memory copy
       is discarded with the session), and a wipe that failed stops here with its reason: re-opening a
       file that still holds everything and calling it erased was the old behaviour. */
    const target = db.real ?? await ensureRepo();
    await target.wipe();
    db.repo = db.real = await openRepository();
    const snap = await R().load(); applySnapshot(snap); configureFx(getState().settings); db.demo = false;
    /* The rows cached from the erased file are gone with it: a later `setActiveRange` (Settings →
       Attendance, before the Semesters page has ever been opened) would otherwise find the ghost
       active row and write it back into the fresh database. Cleared rather than reloaded — the heal
       is lazy, and `listSemesters()` creates the new term when something reads it. */
    set({ ready: true, error: null, semesters: [] }); toast('Everything erased'); resync(300);
  } catch (e) { set({ error: `Couldn't reset: ${String((e as Error)?.message ?? e).slice(0, 80)}` }); }
}

/** Called when the tour is left, however it is left (App.tsx maps the finishes: "Get started"
 *  passes `false`, "Keep exploring" and every skip pass `true`). The demo session's memory copy
 *  is reconciled into the real database: the rows the USER made — anything whose `demo` flag is
 *  still set is by definition not theirs — plus attendance, day marks, adjustments, trips, alarms
 *  and the settings they changed while exploring. The six sample collections never migrate, so
 *  the promise "the demo data is not inside the actual database" survives every path out of the
 *  tour. After adoption the store points back at the real database, and `resync(0)` lets the
 *  real session plan again.
 *
 *  `keepSamples` is only about what stays on screen for the rest of THIS session: "Keep
 *  exploring" means the sample semester continues to be visible; it was never persisted, so the
 *  next launch opens on the real planner alone. A failed reconciliation write lands in the
 *  Problems log with a toast (as every save does) and the switch still happens — there is
 *  nothing better kept for the user in a memory-only copy. */
export async function adoptDemo(keepSamples: boolean) {
  if (!db.demo) return keepSamples ? undefined : purgeDemo();
  db.demo = false;
  const session = R();                    // the memory repository everything this session wrote
  const snap = await session.load();
  db.real = db.real ?? await openRepository();
  const r = db.real;
  const { seededAt: _drop, ...settings } = snap.settings; // a sample-made timestamp never migrates
  void _drop;
  let failed: unknown = null;
  try {
    /* ONE transaction (`importSnapshot`): the hand-over lands whole or not at all. Writing it row by row
       left a half-adopted database after any failure part-way, with no way to tell which half. */
    await r.importSnapshot({
      courses: snap.courses.filter((x) => !x.demo), meetings: snap.meetings.filter((x) => !x.demo), tasks: snap.tasks.filter((x) => !x.demo),
      notices: snap.notices.filter((x) => !x.demo), marks: snap.marks.filter((x) => !x.demo), focus: snap.focus.filter((x) => !x.demo),
      attendance: snap.attendance, dayMarks: snap.dayMarks, adjusts: snap.adjusts, trips: snap.trips, alarms: snap.alarms, settings,
      variants: (snap.variants ?? []).filter((v) => snap.courses.some((c) => c.id === v.subjectId && !c.demo)),
    });
  } catch (e) { failed = e; recordCrash(e, 'save', 'Tour'); }
  finally { db.repo = r; }
  /* The term cache belongs to the repository that is now open. Boot hydrated from the DEMO memory
     copy, so `state.semesters` still held the sample term; leaving it there let the next Settings →
     Attendance edit save that phantom id into the real file and deactivate the term the user actually
     had — the failure `resetAll` had, at the other repository swap, and the same cure in the same
     order: the cache is cleared synchronously with the swap (a write can never interleave and find
     the sample rows, and this cannot fail, so the phantom is gone for good even if the next step
     throws). The re-read right after is for the session's UX, not correctness: a real term exists by
     the time it answers — `listSemesters()` heals one, carrying the range the hand-over just stored —
     so the Semesters page is correct without waiting for a lazy load, and the same read re-mirrors
     the settings pair from the row. Should that read fail (recorded there, never thrown), the cache
     is already empty and `setActiveRange`'s own no-active-row path re-reads and heals. */
  set({ semesters: [] });
  await loadSemesters();
  set((s: State) => (keepSamples ? s : { courses: s.courses.filter((c) => !c.demo), meetings: s.meetings.filter((m) => !m.demo), notices: s.notices.filter((n) => !n.demo), marks: s.marks.filter((m) => !m.demo), tasks: s.tasks.filter((t) => !t.demo), focus: s.focus.filter((f) => !f.demo) }));
  if (failed) toast(`Couldn't save what you made in the tour: ${String((failed as Error)?.message ?? failed).slice(0, 50)}`);
  else toast(keepSamples ? 'Your work is saved — the samples stay until the next session' : 'Your planner is empty — add your first class');
  resync(0);
}

/** Where the onboarding's data page sent the user. `sample` keeps the sample semester for this session,
 *  `hand` starts empty, `import` starts empty and opens Import (file or paste), `keep` is a replay on a
 *  planner that already holds the user's own data: nothing about the data changes. */
export type OnboardDoor = 'sample' | 'hand' | 'import' | 'keep';
export interface OnboardChoice { door: OnboardDoor; name: string; semesterStart: string; semesterEnd: string }

/**
 * Leave the onboarding. In this order, because each step writes where the previous one left the store:
 *  1. the name and term go into the session first, so a first run's hand-over carries them to the real file;
 *  2. the session is adopted (a no-op on a replay, which already runs on the real file);
 *  3. the term is written through the active semester row, which the settings mirror alone would not move;
 *  4. only then is the onboarding marked done — a kill before this point shows it again, never half-applies it.
 */
export async function finishOnboarding(o: OnboardChoice) {
  const s0 = getState().settings, name = o.name.trim().slice(0, 40), moved = o.semesterStart !== s0.semesterStart || o.semesterEnd !== s0.semesterEnd;
  setSettings({ name, ...(db.demo && moved ? { semesterStart: o.semesterStart, semesterEnd: o.semesterEnd } : {}) });
  if (o.door !== 'keep') await adoptDemo(o.door === 'sample');
  const s1 = getState().settings;
  if (o.semesterStart && (o.semesterStart !== s1.semesterStart || o.semesterEnd !== s1.semesterEnd)) await setActiveRange(o.semesterStart, o.semesterEnd);
  setSettings({ onboarded: TOUR_VERSION });
  if (o.door === 'import') set({ sheet: { t: 'settings' }, settingsPath: ['data', 'import'] });
}

export const sessionActions = { purgeDemo, importPlan, resetAll, adoptDemo, finishOnboarding };
