/**
 * v0.5 D2 — an export is a whole backup. The brief's case: export, uninstall (the key switch), install,
 * import — and everything is back. So the claim is equality, dataset by dataset, between what was
 * exported and what the import plans to write into an empty phone: subjects with their rooms and bar,
 * variants, classes with their room and variant, attendance (variant keys included), day marks, tasks
 * with subtasks and reminders, notes, marks with their variant, curves, focus history, trips, alarms,
 * the person's settings and the archived terms.
 */
import { seedSnapshot } from '../data/seed';
import { parseImport } from '../domain/importPlan';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import type { SemesterRow, Snapshot } from '../domain/types';
import { toJson } from '../services/export';

const NOW = new Date(2026, 9, 7, 10).getTime();

function fullPlanner(): Snapshot {
  const s = seedSnapshot(NOW);
  s.courses[0] = { ...s.courses[0]!, rooms: ['LR-601', 'LR-303'], bar: 'spiral', goal: 80 };
  s.variants = [{ id: 'v-lab', subjectId: s.courses[0]!.id, name: 'Lab', room: 'Lab 2', teacher: 'Mr Y', note: 'Thu group', ord: 0 }];
  s.meetings.push({ id: 'm-lab', courseId: s.courses[0]!.id, weekday: 3, start: '14:00', end: '16:00', demo: false, variantId: 'v-lab', room: 'Lab 2' });
  s.marks.push({ id: 'k-lab', courseId: s.courses[0]!.id, name: 'Lab 1', score: 9, weight: 5, on: true, sort: 9, demo: false, variantId: 'v-lab' });
  s.attendance['2026-10-01|14:00|E~v-lab'] = { key: '2026-10-01|14:00|E~v-lab', status: 'p', why: 'late', at: NOW - 1000, reason: 'bus' };
  s.dayMarks['2026-10-02'] = { date: '2026-10-02', status: 'a', why: 'sick', at: NOW - 2000, reason: 'flu' };
  s.adjusts = { [s.courses[0]!.id]: 2.5 };
  s.trips = [{ id: 'p1', startedAt: NOW - 9000, endedAt: NOW - 8000, route: 'home → campus', note: '' }];
  s.alarms = [{ id: 'a1', at: NOW + 3_600_000, label: 'Leave', enabled: true, kind: 'leave', taskId: null }];
  s.settings = { ...DEFAULT_SETTINGS, name: 'Jossy', theme: 'dark', pen: 'blue', paper: 'ruled', hour12: true, semesterStart: '2026-09-07', semesterEnd: '2026-12-20', seededAt: 123 };
  return s;
}
const TERM: SemesterRow = { id: 'sem-old', name: 'Spring 2026', start: '2026-02-02', end: '2026-06-12', active: false, snapshotJson: JSON.stringify({ v: 10, datasets: { courses: [] } }), createdAt: '2026-02-02T08:00:00.000Z', archivedAt: '2026-06-13T08:00:00.000Z' };
const LIVE: SemesterRow = { ...TERM, id: 'sem-now', name: 'Autumn 2026', active: true, snapshotJson: null, archivedAt: null };

describe('export → import round trip (margin/2)', () => {
  const s = fullPlanner();
  const text = toJson(s, NOW, [LIVE, TERM]);
  const plan = parseImport(text, { now: NOW });

  it('reads with no problems and declares its format', () => {
    expect(plan.problems).toEqual([]);
    expect(JSON.parse(text)).toMatchObject({ app: 'margin', format: 'margin/2', version: 2 });
  });
  const byId = <T extends { id: string }>(xs: readonly T[] | undefined) => [...(xs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  it.each(['courses', 'meetings', 'tasks', 'notices', 'marks', 'focus', 'trips', 'alarms', 'variants'] as const)('%s come back exactly', (k) => {
    const norm = (xs: readonly unknown[] | undefined) => byId(xs as { id: string }[]).map((r) => ({ variantId: null, room: null, bar: null, ...r }));
    expect(norm(plan.snapshot[k] as unknown[])).toEqual(norm(s[k] as unknown[]));
  });
  it('attendance (variant keys too), day marks and curves come back exactly', () => {
    expect(plan.snapshot.attendance).toEqual(s.attendance);
    expect(plan.snapshot.dayMarks).toEqual(s.dayMarks);
    expect(plan.snapshot.adjusts).toEqual(s.adjusts);
  });
  it('the person\'s settings come back, but not the phone\'s own bookkeeping', () => {
    expect(plan.snapshot.settings).toMatchObject({ name: 'Jossy', theme: 'dark', pen: 'blue', paper: 'ruled', hour12: true, semesterStart: '2026-09-07', semesterEnd: '2026-12-20' });
    expect(plan.snapshot.settings).not.toHaveProperty('seededAt');
  });
  it('the archived term travels; the running one does not', () => {
    expect(plan.semesters).toEqual([TERM]);
  });
  it('a version-1 export (no format, no semesters) still imports', () => {
    const v1 = JSON.stringify({ app: 'margin', version: 1, exportedAt: 'x', raw: { ...s, variants: undefined } });
    const p = parseImport(v1, { now: NOW });
    expect(p.problems).toEqual([]);
    expect(p.snapshot.courses).toHaveLength(s.courses.length);
    expect(p.semesters).toBeUndefined();
  });
  it('a settings value of the wrong kind is refused with a warning, never written', () => {
    const p = parseImport(JSON.stringify({ app: 'margin', raw: { settings: { theme: 7, hour12: 'yes', name: 'Sam' } } }), { now: NOW });
    expect(p.snapshot.settings).toEqual({ name: 'Sam' });
    expect(p.warnings.filter((w) => w.startsWith('settings.'))).toHaveLength(2);
  });
});

/* v0.7 item 8 (the move to the release key): a whole term of data the size of the owner's — every dataset's
   count comes back equal, so "Bring my data back" after the reinstall can promise "everything". */
describe('export → import of a full term keeps every count (v0.7 item 8)', () => {
  const s = fullPlanner();
  const c0 = s.courses[0]!;
  for (let d = 0; d < 90; d++) {
    const ymd = new Date(2026, 8, 7 + d).toISOString().slice(0, 10);
    for (const t of ['09:00', '11:00', '14:00']) {
      const key = `${ymd}|${t}|${c0.id}`;
      s.attendance[key] = (d % 7 === 0 ? { key, status: 'a', why: 'sick', at: NOW - d * 1000, reason: 'flu' } : { key, status: 'p', at: NOW - d * 1000, reason: '' }) as never;
    }
  }
  for (let i = 0; i < 60; i++) s.tasks.push({ ...s.tasks[0]!, id: `t-big-${i}`, title: `Task ${i}`, done: i % 3 === 0 } as never);
  for (let i = 0; i < 40; i++) s.marks.push({ id: `k-big-${i}`, courseId: c0.id, name: `Quiz ${i}`, score: i % 10, weight: 1, on: true, sort: i, demo: false } as never);
  for (let i = 0; i < 120; i++) s.focus.push({ ...(s.focus[0] ?? { id: 'f', startedAt: NOW, endedAt: NOW, minutes: 25 }), id: `f-big-${i}` } as never);
  const plan = parseImport(toJson(s, NOW, [LIVE, TERM]), { now: NOW });
  it('reads with no problems', () => expect(plan.problems).toEqual([]));
  it.each(['courses', 'meetings', 'tasks', 'notices', 'marks', 'focus', 'trips', 'alarms', 'variants'] as const)('%s: same count', (k) => {
    expect((plan.snapshot[k] as unknown[] | undefined)?.length ?? 0).toBe((s[k] as unknown[]).length);
  });
  it('attendance and day marks: same count, whys and reasons kept', () => {
    expect(Object.keys(plan.snapshot.attendance ?? {})).toHaveLength(Object.keys(s.attendance).length);
    expect(plan.snapshot.attendance).toEqual(s.attendance);
    expect(Object.keys(plan.snapshot.dayMarks ?? {})).toHaveLength(Object.keys(s.dayMarks).length);
  });
});
