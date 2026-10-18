import { writeFileSync, mkdirSync } from 'node:fs';
import { buildTables, crc32, sheetName, toCsv, toJson, toXlsx, toCsvZip, exportName } from '../services/export';
import { seedSnapshot } from '../data/seed';

const NOW = new Date(2026, 9, 12, 9, 30).getTime();
const snap = seedSnapshot(NOW);

describe('export', () => {
  it('names the file from the export date', () => { expect(exportName(NOW, 'xlsx')).toBe('margin-2026-10-12.xlsx'); expect(exportName(NOW, 'zip', '-csv')).toBe('margin-2026-10-12-csv.zip'); });
  it('is the full dataset, not a sample', () => {
    const t = Object.fromEntries(buildTables(snap, NOW).map((x) => [x.name, x]));
    expect(t.Courses!.rows).toHaveLength(snap.courses.length); expect(t.Tasks!.rows).toHaveLength(snap.tasks.length); expect(t.Marks!.rows).toHaveLength(snap.marks.length);
    expect(t.Timetable!.rows).toHaveLength(snap.meetings.length); expect(t['Focus sessions']!.rows).toHaveLength(snap.focus.length); expect(t.Notices!.rows).toHaveLength(3);
    expect(t.Attendance!.rows.length).toBeGreaterThan(20); // every occurrence since the semester start
  });
  it('csv escapes quotes/commas/newlines and neutralises formula injection', () => {
    const c = toCsv({ name: 'x', header: ['a', 'b'], rows: [['he said "hi", ok', 'line\nbreak'], ['=HYPERLINK("x")', 5]] });
    expect(c).toContain('"he said ""hi"", ok"'); expect(c).toContain('"line\nbreak"'); expect(c).toContain(`"'=HYPERLINK(""x"")"`);
  });
  it('json carries every table and the raw snapshot', () => { const j = JSON.parse(toJson(snap, NOW)); expect(j.Tasks).toHaveLength(snap.tasks.length); expect(j.raw.courses).toHaveLength(5); expect(j.exportedAt).toMatch(/^2026-10-12T/); });
  it("W1's two new entities ride the JSON path and get their own sheets", () => {
    // Nothing writes a trip or an alarm yet (W5/W6 own that), so the only thing to pin is that the
    // export carries them the moment one exists — a sheet that appeared later would be a silent
    // change to the file's shape.
    const trip = { id: 't1', startedAt: NOW, endedAt: NOW + 600_000, route: 'To campus', note: 'bus' };
    const alarm = { id: 'a1', at: NOW, label: 'Leave for Physics', enabled: true, kind: 'leave', taskId: 'x' };
    const s2 = { ...snap, trips: [trip], alarms: [alarm] };
    const t = Object.fromEntries(buildTables(s2, NOW).map((x) => [x.name, x]));
    expect(t.Trips!.header).toEqual(['id', 'started', 'ended', 'route', 'note']);
    expect(t.Trips!.rows[0]![0]).toBe('t1');
    expect(t.Alarms!.header).toEqual(['id', 'at', 'label', 'enabled', 'kind', 'task']);
    expect(t.Alarms!.rows[0]![0]).toBe('a1');
    const j = JSON.parse(toJson(s2, NOW));
    expect(j.Trips).toHaveLength(1); // …as a table…
    expect(j.raw.trips[0].route).toBe('To campus'); // …and in the raw snapshot the JSON export already carried
    expect(j.raw.alarms[0].kind).toBe('leave');
  });
  it('the focus sheet and the JSON carry mode and completed (W3/D2)', () => {
    // The two columns D2 added reached the file for the first time in W3: the row's shape (order included)
    // and the JSON's key names are what a spreadsheet formula or a script reads, so pin both, not just the values.
    const f = Object.fromEntries(buildTables(snap, NOW).map((x) => [x.name, x]))['Focus sessions']!;
    expect(f.header.slice(-3)).toEqual(['planned min', 'mode', 'completed']);
    const mi = f.header.indexOf('mode'), ci = f.header.indexOf('completed');
    expect(f.rows.every((r) => r[mi] === 'focus')).toBe(true);
    expect(f.rows.every((r) => r[ci] === true)).toBe(true); // every seeded session ran a full round
    const j = JSON.parse(toJson(snap, NOW));
    expect(j['Focus sessions'][0]).toMatchObject({ mode: 'focus', completed: true });
    expect(j.raw.focus[0]).toMatchObject({ mode: 'focus', completed: true });
  });
  it('sheet names are unique, ≤31 chars, without forbidden characters', () => {
    const used = new Set<string>(); const a = sheetName('A/B:C*D?[E]'.padEnd(40, 'x'), used), b = sheetName('a/b:c*d?[e]'.padEnd(40, 'x'), used);
    expect(a.length).toBeLessThanOrEqual(31); expect(b.length).toBeLessThanOrEqual(31); expect(a.toLowerCase()).not.toBe(b.toLowerCase()); expect(/[\[\]:*?/\\]/.test(a + b)).toBe(false);
  });
  it('crc32 matches the standard check value and the xlsx container has the OOXML parts', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const x = toXlsx(buildTables(snap, NOW), NOW); expect(String.fromCharCode(x[0]!, x[1]!)).toBe('PK');
    mkdirSync('/tmp/export-check', { recursive: true });
    writeFileSync('/tmp/export-check/out.xlsx', x); writeFileSync('/tmp/export-check/out-csv.zip', toCsvZip(buildTables(snap, NOW), NOW));
  });
});
