/**
 * v0.7 R2 follow-up (polish-pass/handoff/week/SPEC.md decision 2): a class moved for one week counts at its new slot
 * in Stats, Grades, the face's news, the export and the Obsidian bridge, and the move itself survives export → import.
 */
import { attendanceByCourse, attendanceBreakdown, classDots } from '../domain/analytics';
import { occKey } from '../domain/attendance';
import { buildEnvelope } from '../domain/bridge';
import { parseImport } from '../domain/importPlan';
import { DEFAULT_SETTINGS } from '../domain/defaults';
import type { ClassMove } from '../domain/moves';
import type { AttRecord, Course, Meeting, Snapshot } from '../domain/types';
import { buildTables, toJson } from '../services/export';
import { attNews } from '../screens/faceNews';

const NOW = new Date(2026, 10, 13, 18).getTime(); // Fri 13 Nov 2026, evening
const db: Course = { id: 'db', name: 'Database', rooms: ['B1'], teacher: '', goal: null, sort: 0, demo: false };
const mon: Meeting = { id: 'm1', courseId: 'db', weekday: 0, start: '09:00', end: '10:00', demo: false };
// this week's Monday class moved to Tuesday 14:00
const move: ClassMove = { id: 'mv1', meetingId: 'm1', date: '2026-11-09', to: '2026-11-10', start: '14:00', end: '15:00' };
const kNew = occKey('2026-11-10', { start: '14:00', courseId: 'db' }), kOld = occKey('2026-11-09', mon);
const att: Record<string, AttRecord> = { [kNew]: { key: kNew, status: 'a', at: 0, reason: '' } };

it('Stats counts the moved class at its new slot', () => {
  const r = attendanceByCourse([db], [mon], att, {}, 7, NOW, [move])[0]!;
  expect([r.held, r.absent]).toEqual([1, 1]);
  expect(attendanceBreakdown([mon], att, {}, 7, NOW, [move]).absent).toBe(1);
  expect(classDots('db', [mon], att, {}, 7, NOW, [move]).map((d) => [d.date, d.status])).toEqual([['2026-11-10', 'a']]);
});

it('the face hears a present on the moved slot as the week\'s last class', () => {
  expect(attNews(kNew, 'p', { meetings: [mon], attendance: {}, dayMarks: {}, now: NOW, moves: [move] })).toBe('weekAttended');
});

const snap = (): Snapshot => ({ courses: [db], meetings: [mon], attendance: att, dayMarks: {}, tasks: [], notices: [], marks: [], adjusts: {}, focus: [], trips: [], alarms: [], variants: [],
  settings: { ...DEFAULT_SETTINGS, semesterStart: '2026-11-02', semesterEnd: '2026-12-20', moves: [move] } });

it('the export lists the moved class on its new day, and the move survives export → import', () => {
  const rows = buildTables(snap(), NOW).find((t) => t.name === 'Attendance')!.rows.filter((r) => String(r[0]) >= '2026-11-09');
  expect(rows.map((r) => [r[0], r[2], r[3]])).toEqual([['2026-11-10', '14:00', 'a']]);
  const plan = parseImport(toJson(snap(), NOW));
  expect(plan.problems).toEqual([]);
  expect(plan.snapshot.settings?.moves).toEqual([move]);
  expect(kOld).not.toBe(kNew);
});

it('the Obsidian bridge publishes the moved class at its new time', () => {
  const env = buildEnvelope({ now: new Date(2026, 10, 9, 7).getTime(), since: 0, courses: [db], meetings: [mon], tasks: [], notices: [], focus: [], horizonDays: 3, moves: [move] });
  const cls = env.events.filter((e) => e.data?.kind === 'class').map((e) => new Date(e.data!.at as number).toString().slice(0, 21));
  expect(cls).toEqual([new Date(2026, 10, 10, 14).toString().slice(0, 21)]);
});
