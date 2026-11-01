/**
 * WS2 Task 2 — archive and roll-over.
 *
 * Two different claims live here, and they fail for different reasons:
 *
 *  1. **The pure archive** (`domain/archive.ts`). Archiving is the one operation that turns live rows
 *     into a file the app can never rewrite, so the round-trip is the whole test: what goes in must
 *     come back byte-equivalent, and a JSON string that is not this release's envelope must read as
 *     "unavailable" rather than as a half-populated semester.
 *  2. **The repository half.** `listSemesters`, `saveSemester`, `setActiveSemester` and
 *     `clearActiveSchedule` are contract methods, so both adapters run against ONE expectation: the
 *     memory adapter is the proof that nothing above the port depends on SQL, and the interesting
 *     part is not the rows but the invariant — exactly one active term, its range mirrored into the
 *     settings the rest of the app reads, and nothing the user typed deleted by a roll-over.
 *
 * `NOW` is 2026-10-05: inside the 2026-09-07…2026-12-20 term the fixtures use, so "days left" and
 * "which term is running" are decided by the data, not by when the suite happens to run.
 */
import { MemoryRepository } from '../data/memory';
import { SqliteRepository, type SqlDb } from '../data/sqlite';
import { seedSnapshot } from '../data/seed';
import type { Repository } from '../data/repository';
import { ARCHIVE_VERSION, buildSnapshot, newSemester, readSnapshot } from '../domain/archive';
import { activeSemester, daysLeft, suggestEnd } from '../domain/semester';
import type { Mark, SemesterRow, SubjectVariant } from '../domain/types';

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05

/** The same node:sqlite shim the repository contract test uses. */
function nodeDb(): SqlDb {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(n: string): { DatabaseSync: new (p: string) => any } }).getBuiltinModule('node:sqlite');
  const db = new DatabaseSync(':memory:');
  const stmt = (s: string, p: unknown[] = []) => db.prepare(s).run(...p);
  return {
    execAsync: async (s) => { db.exec(s); },
    runAsync: async (s, p = []) => { stmt(s, p); },
    getAllAsync: async <T,>(s: string, p: unknown[] = []) => db.prepare(s).all(...p) as T[],
    withTransactionAsync: async (fn) => { db.exec('BEGIN'); try { await fn(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
}
const factories: [string, () => Promise<Repository>][] = [
  ['memory', async () => new MemoryRepository(() => NOW)],
  ['sqlite', async () => { const r = new SqliteRepository(nodeDb(), () => NOW); await r.init(); return r; }],
];

const row = (extra: Partial<SemesterRow> = {}): SemesterRow => ({
  id: 's1', name: 'Autumn 2026', start: '2026-09-07', end: '2026-12-20', active: true,
  snapshotJson: null, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null, ...extra,
});
const variant = (id: string, ord: number): SubjectVariant => ({ id, subjectId: 'E', name: 'Group B', room: 'B-14', teacher: 'Hale', note: 'Wednesdays', ord });

describe('the archive envelope (pure)', () => {
  it('round-trips every dataset: what goes into the snapshot is what comes back out', () => {
    const s = seedSnapshot(NOW);
    const marks: Mark[] = [{ id: 'K1', courseId: 'E', name: 'Quiz 1', score: 18, weight: 10, on: true, sort: 0, demo: false }];
    const variants = [variant('v1', 0), variant('v2', 1)];
    const json = buildSnapshot(s.courses, s.meetings, s.attendance, marks, s.tasks, { semesterStart: '2026-09-07', semesterEnd: '2026-12-20' }, variants);

    expect(typeof json).toBe('string');
    const back = readSnapshot(json);
    expect(back).not.toBeNull();
    expect(back!.v).toBe(ARCHIVE_VERSION);
    expect(back!.datasets.courses).toEqual(s.courses);
    expect(back!.datasets.meetings).toEqual(s.meetings);
    expect(back!.datasets.attendance).toEqual(s.attendance);
    expect(back!.datasets.marks).toEqual(marks);
    expect(back!.datasets.tasks).toEqual(s.tasks);
    expect(back!.datasets.settings).toEqual({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    expect(back!.datasets.variants).toEqual(variants);
  });

  it('an unspecified variant list archives as an empty one, never as undefined', () => {
    const s = seedSnapshot(NOW);
    const back = readSnapshot(buildSnapshot(s.courses, s.meetings, s.attendance, [], [], { semesterStart: '' }));
    expect(back!.datasets.variants).toEqual([]);
  });

  /* The history viewer reads rows the app wrote months ago; a version it does not know, or bytes it
     cannot parse, must say "unavailable" rather than render half a semester as if it were whole. */
  it('refuses an envelope it cannot trust: bad JSON, a foreign version, or no datasets', () => {
    expect(readSnapshot('not json')).toBeNull();
    expect(readSnapshot('[]')).toBeNull();
    expect(readSnapshot(JSON.stringify({ v: 8, datasets: {} }))).toBeNull();
    expect(readSnapshot(JSON.stringify({ v: 9 }))).toBeNull();
    expect(readSnapshot('')).toBeNull();
  });

  it('a new term is today plus the 15-week seed, active, and unnamed history until it is archived', () => {
    const t = newSemester(NOW);
    expect(t).toMatchObject({ start: '2026-10-05', end: suggestEnd('2026-10-05'), active: true, snapshotJson: null, archivedAt: null });
    expect(t.name).toMatch(/\S/);
    expect(t.id).toBeTruthy();
    expect(t.id).not.toBe(newSemester(NOW).id); // two roll-overs are two terms, never one id twice
  });
});

describe('the term as a range and as a countdown (pure)', () => {
  it('bridges a stored row to the SemesterSpan every range check already speaks', () => {
    const span = activeSemester(row());
    expect(span.start).toEqual(new Date(2026, 8, 7));
    expect(span.end).toEqual(new Date(2026, 11, 20));
  });

  it('keeps an open-ended term open-ended, and a broken start reads as "no lower bound"', () => {
    expect(activeSemester(row({ end: '' })).end).toBeNull();
    expect(activeSemester(row({ start: 'not a date' }))).toEqual({ start: new Date(1970, 0, 1), end: null });
    // an end before the start is a bad pair, not an empty term: no upper bound, keep the attendance
    expect(activeSemester(row({ end: '2026-09-01' })).end).toBeNull();
  });

  it('counts days left inclusively, is 0 on the last day, negative after it and null when open', () => {
    expect(daysLeft(activeSemester(row()), NOW)).toBe(76); // 5 Oct → 20 Dec
    expect(daysLeft(activeSemester(row({ end: '2026-10-05' })), NOW)).toBe(0);
    expect(daysLeft(activeSemester(row({ end: '2026-10-02' })), NOW)).toBe(-3);
    expect(daysLeft(activeSemester(row({ end: '' })), NOW)).toBeNull();
  });
});

describe.each(factories)('semesters in the repository · %s', (_name, make) => {
  /** A term that is really running, with one row in every dataset a roll-over touches. */
  async function seeded(): Promise<Repository> {
    const r = await make();
    await r.seed(seedSnapshot(NOW));
    await r.upsert('variant', variant('v1', 0));
    await r.upsert('variant', variant('v2', 1));
    await r.upsert('attendance', { key: '2026-09-14|08:30|E', status: 'l', at: NOW, reason: 'bus' });
    await r.upsert('dayMark', { date: '2026-09-15', status: 'c', at: NOW, reason: 'holiday' });
    return r;
  }

  it('a repository always has exactly one active term, and its range is the settings range', async () => {
    const r = await make();
    const all = await r.listSemesters();
    expect(all).toHaveLength(1);
    expect(all[0]!.active).toBe(true);
    const l = await r.load();
    expect(all[0]!.start).toBe(l.settings.semesterStart);
    expect(all[0]!.end).toBe(l.settings.semesterEnd);
    expect(daysLeft(activeSemester(all[0]!), NOW)).not.toBeNull();
  });

  it('saves and renames by id, and lists the active term before the archived ones', async () => {
    const r = await make();
    const old: SemesterRow = row({ id: 'old', start: '2025-09-01', end: '2025-12-19', active: false, archivedAt: '2025-12-20T00:00:00.000Z' });
    await r.saveSemester(old);
    await r.saveSemester(row({ id: 'older', start: '2024-09-02', end: '2024-12-20', active: false, archivedAt: '2024-12-21T00:00:00.000Z' }));
    await r.saveSemester({ ...old, name: 'Autumn 2025 (renamed)' });

    const all = await r.listSemesters();
    expect(all.map((s) => s.id).indexOf(all.find((s) => s.active)!.id)).toBe(0);
    expect(all.filter((s) => !s.active).map((s) => s.id)).toEqual(['old', 'older']);
    expect(all.find((s) => s.id === 'old')!.name).toBe('Autumn 2025 (renamed)');
    expect(all).toHaveLength(3); // the update replaced, it did not add a fourth
  });

  it('switching the active term leaves exactly one active and mirrors its range into the settings', async () => {
    const r = await make();
    await r.saveSemester(row({ id: 'next', start: '2027-01-11', end: '2027-05-07', active: false }));
    await r.setActiveSemester('next');

    const all = await r.listSemesters();
    expect(all.filter((s) => s.active).map((s) => s.id)).toEqual(['next']);
    const l = await r.load();
    expect(l.settings.semesterStart).toBe('2027-01-11');
    expect(l.settings.semesterEnd).toBe('2027-05-07');
    await expect(r.setActiveSemester('nope')).rejects.toThrow();
  });

  /* Parity on the OTHER half of the heal, and the one the memory adapter used to get wrong: a
     repository that already has history (a term was archived, a roll-over was killed) must NOT adopt
     the stored range — that range belongs to the term that was just closed. Both adapters pin the
     same answer here: today, and the 15-week seed after it. */
  it('heals a history-only term list with today, not the closed term\'s stored start', async () => {
    const r = await make();
    const [live] = await r.listSemesters();
    await r.saveSemester({ ...live!, active: false, archivedAt: '2026-10-05T00:00:00.000Z' });
    await r.putSettings({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' }); // the closed term's range

    const all = await r.listSemesters();
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.active)).toHaveLength(1);
    expect(all.find((s) => s.id === live!.id)!.active).toBe(false);
    const healed = all.find((s) => s.active)!;
    expect(healed.start).toBe('2026-10-05');
    expect(healed.end).toBe(suggestEnd('2026-10-05'));
    expect((await r.load()).settings.semesterStart).toBe('2026-10-05');
  });

  it('clearing the schedule keeps attendance when asked, and keeps subjects and their variants', async () => {
    const r = await seeded();
    const before = await r.load();
    expect(before.meetings.length).toBeGreaterThan(0);
    await r.clearActiveSchedule(true);

    const l = await r.load();
    expect(l.meetings).toHaveLength(0);
    expect(l.tasks).toHaveLength(0);
    expect(l.notices).toHaveLength(0);
    expect(l.marks).toHaveLength(0);
    expect(Object.keys(l.dayMarks)).toHaveLength(0);
    expect(Object.keys(l.attendance)).toEqual(Object.keys(before.attendance)); // the term's history stays
    expect(Object.keys(l.attendance)).toHaveLength(1);
    expect(l.courses.map((c) => c.id)).toEqual(before.courses.map((c) => c.id)); // subjects are not schedule
    expect(l.variants!.map((v) => v.id)).toEqual(['v1', 'v2']);
    // the semesters themselves are untouched: a roll-over clears what is taught, not which term it is
    expect(await r.listSemesters()).toHaveLength(1);
    // and every cleared row went through `remove`, so a sync boundary sees the deletion
    expect((await r.pendingOutbox(500)).some((o) => o.op === 'del' && o.entity === 'meeting')).toBe(true);
  });

  it('clearing the schedule wipes attendance too when the user says so', async () => {
    const r = await seeded();
    const before = await r.load();
    expect(Object.keys(before.attendance)).toHaveLength(1);
    expect(Object.keys(before.dayMarks)).toHaveLength(1);
    await r.clearActiveSchedule(false);
    const l = await r.load();
    expect(Object.keys(l.attendance)).toHaveLength(0);
    expect(Object.keys(l.dayMarks)).toHaveLength(0);
    expect(l.meetings).toHaveLength(0);
    expect(l.courses.length).toBeGreaterThan(0);
  });
});

describe('the memory adapter heals a missing active row from the settings it has', () => {
  /* Parity with SQLite's `ensureActiveSemester`: a repository with no terms adopts the stored range
     rather than today's, which is the demo/sample semester case — a heal must not silently replace the
     dates the user was shown. */
  it('carries the stored range instead of replacing it with today', async () => {
    const r = new MemoryRepository(() => NOW);
    await r.putSettings({ semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    const all = await r.listSemesters();
    expect(all).toHaveLength(1);
    expect(all[0]!.start).toBe('2026-09-07');
    expect(all[0]!.end).toBe('2026-12-20');
  });
});

describe('a roll-over, end to end', () => {
  /* The composition the Semesters page performs, exercised without the UI: archive the live rows into
     the active row, clear the schedule (keeping attendance), then make a new term active. The claims:
     the archive is readable and still holds the old timetable, the day tables are lean afterwards, and
     the new active term is the one the rest of the app now reads. */
  it('archives the old term, clears the day tables, and activates a fresh term', async () => {
    const r = new SqliteRepository(nodeDb(), () => NOW);
    await r.init();
    await r.seed(seedSnapshot(NOW));
    const live = await r.load();
    const [old] = await r.listSemesters();
    const archived: SemesterRow = {
      ...old!, name: 'Autumn 2026', snapshotJson: buildSnapshot(live.courses, live.meetings, live.attendance, live.marks, live.tasks, live.settings, live.variants ?? []),
      active: false, archivedAt: '2026-12-21T00:00:00.000Z',
    };

    await r.saveSemester(archived);
    await r.clearActiveSchedule(true);
    const next = newSemester(new Date(2027, 0, 11, 8).getTime());
    await r.saveSemester(next);
    await r.setActiveSemester(next.id);

    const all = await r.listSemesters();
    expect(all.map((s) => s.id).sort()).toEqual([archived.id, next.id].sort());
    const active = all.find((s) => s.active)!;
    expect(active.id).toBe(next.id);
    expect(activeSemester(active).start).toEqual(new Date(2027, 0, 11));

    const frozen = readSnapshot(archived.snapshotJson!)!;
    expect(frozen.datasets.meetings).toHaveLength(live.meetings.length);
    expect(frozen.datasets.tasks).toHaveLength(live.tasks.length);
    expect(frozen.datasets.settings.semesterStart).toBe('2026-09-07');

    const after = await r.load();
    expect(after.meetings).toHaveLength(0);
    expect(Object.keys(after.attendance)).toEqual(Object.keys(live.attendance));
    expect(after.settings.semesterStart).toBe(next.start); // the app reads the new term's range
  });

  /* A roll-over is two writes — archive the row, then activate the new one — so a kill in between
     leaves history with no active term. The archived row must stay archived (its snapshot is frozen,
     and resurrecting it would show last term's cleared day tables as if they were current) and the
     app still needs a term to open on, so the next read heals with today's. */
  it('heals a term list that lost its active row, without resurrecting the archived one', async () => {
    const r = new SqliteRepository(nodeDb(), () => NOW);
    await r.init();
    const [live] = await r.listSemesters();
    await r.saveSemester({ ...live!, active: false, archivedAt: '2026-10-05T00:00:00.000Z', snapshotJson: buildSnapshot([], [], {}, [], [], live!.end ? { semesterStart: live!.start, semesterEnd: live!.end } : {}) });

    const all = await r.listSemesters();
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.active)).toHaveLength(1);
    expect(all.find((s) => s.id === live!.id)!.active).toBe(false);
    expect(all.find((s) => s.active)!.start).toBe('2026-10-05'); // today, not the closed term's start
    expect((await r.load()).settings.semesterStart).toBe('2026-10-05');
  });
});

/* v0.5 D4 — the read-only viewer reads a closed term back as numbers: each subject's final average (with
   its curve), the classes it was present for out of those marked (cancelled ones are not held), tasks
   finished, and focus time. */
describe('termSummary', () => {
  it('reads a closed term back as averages, attendance, tasks and focus', () => {
    const { buildSnapshot: build, readSnapshot: read, termSummary: summary } = jest.requireActual('../domain/archive') as typeof import('../domain/archive');
    const course = { id: 'DB', name: 'Database', rooms: [], teacher: '', goal: null, sort: 0, demo: false };
    const mk = (id: string, score: number) => ({ id, courseId: 'DB', name: id, score, weight: 50, on: true, sort: 0, demo: false });
    const att = (key: string, status: 'p' | 'a' | 'c' | 'l') => ({ key, status, at: 0, reason: '' });
    const task = (id: string, status: 0 | 2) => ({ id, title: id, courseId: 'DB', kind: 'assignment' as const, dueAt: null, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status, createdAt: 0, completedAt: null, reminders: [], subtasks: [], demo: false });
    const json = build([course], [], {
      '2026-03-02|08:30|DB': att('2026-03-02|08:30|DB', 'p'), '2026-03-09|08:30|DB': att('2026-03-09|08:30|DB', 'l'),
      '2026-03-16|08:30|DB': att('2026-03-16|08:30|DB', 'a'), '2026-03-23|08:30|DB': att('2026-03-23|08:30|DB', 'c'),
    }, [mk('a', 70), mk('b', 90)], [task('t1', 2), task('t2', 0)], {}, [], {
      adjusts: { DB: 5 }, focus: [{ id: 'f', taskId: null, courseId: 'DB', startedAt: 0, endedAt: 1, focusSec: 5400, breakSec: 0, overSec: 0, rounds: 1, planMin: 90, mode: 'focus', completed: true, demo: false }],
    });
    const s = summary(read(json)!);
    expect(s.subjects).toEqual([{ id: 'DB', name: 'Database', average: 85, marks: 2, here: 2, held: 3, tasks: 2, tasksDone: 1 }]);
    expect(s).toMatchObject({ tasks: 2, tasksDone: 1, focusMin: 90, notes: 0 });
  });
});
