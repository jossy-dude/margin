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
  s.attendance['2026-10-01|14:00|E~v-lab'] = { key: '2026-10-01|14:00|E~v-lab', status: 'l', at: NOW - 1000, reason: 'bus' };
  s.dayMarks['2026-10-02'] = { date: '2026-10-02', status: 's', at: NOW - 2000, reason: 'flu' };
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
