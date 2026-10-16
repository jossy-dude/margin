import type { Snapshot } from '../domain/types';
import { fmtTime, pad, parseYmd, ymd } from '../domain/time';
import { effective, occurrencesBetween } from '../domain/attendance';
import { total } from '../domain/grades';

export type Cell = string | number | boolean | null;
export interface Table { name: string; header: string[]; rows: Cell[][]; date?: number[] }
export const exportName = (now: number, ext: string, tag = '') => { const d = new Date(now); return `marginalia-${ymd(d)}${tag}.${ext}`; };

const isoUtc = (ms: number) => new Date(ms).toISOString();
/** local wall-clock "YYYY-MM-DD HH:mm" — what a person reading the spreadsheet expects */
const iso = (ms: number | null) => { if (ms === null) return ''; const d = new Date(ms); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
/** Every table the app tracks, full and un-sampled. XLSX gets one sheet per table, CSV one file per table, JSON the same structure. */
export function buildTables(s: Snapshot, now: number): Table[] {
  const cn = (id: string | null) => s.courses.find((c) => c.id === id)?.name ?? '';
  const st = s.settings as Record<string, unknown>;
  const first = s.settings.semesterStart ? parseYmd(s.settings.semesterStart).getTime() : now - 90 * 86_400_000;
  const occ = occurrencesBetween(first, now, s.meetings);
  const tables: Table[] = [
    { name: 'Courses', header: ['id', 'name', 'room', 'teacher', 'goal', 'total'], rows: s.courses.map((c) => [c.id, c.name, c.room, c.teacher, c.goal, total(s.marks.filter((m) => m.courseId === c.id), s.adjusts[c.id] ?? 0)]) },
    { name: 'Timetable', header: ['course', 'weekday', 'start', 'end', 'room'], rows: s.meetings.map((m) => [cn(m.courseId), WD[m.weekday] ?? '', m.start, m.end, s.courses.find((c) => c.id === m.courseId)?.room ?? '']) },
    { name: 'Attendance', header: ['date', 'course', 'start', 'status', 'source'], rows: occ.map((o) => { const e = effective(o.date, o.meeting, s.attendance, s.dayMarks, now); const label = e.status ?? 'upcoming'; return [ymd(o.date), cn(o.meeting.courseId), o.meeting.start, label, e.explicit ? 'marked' : e.inferred ? 'inferred' : 'future']; }) },
    { name: 'Day marks', header: ['date', 'status', 'marked at', 'reason'], rows: Object.values(s.dayMarks).map((d) => [d.date, d.status, iso(d.at), d.reason]) },
    { name: 'Tasks', header: ['id', 'title', 'course', 'kind', 'due', 'start', 'estimate min', 'priority', 'status', 'created', 'completed', 'on time', 'notes'], rows: s.tasks.map((t) => [t.id, t.title, cn(t.courseId), t.kind, iso(t.dueAt), iso(t.startAt), t.estimateMin, t.priority, ['open', 'in progress', 'done'][t.status] ?? '', iso(t.createdAt), iso(t.completedAt), t.completedAt && t.dueAt ? t.completedAt <= t.dueAt : null, t.notes]) },
    { name: 'Subtasks', header: ['task', 'subtask', 'done'], rows: s.tasks.flatMap((t) => t.subtasks.map((x): Cell[] => [t.title, x.t, x.done])) },
    { name: 'Reminders', header: ['task', 'mode', 'value', 'label'], rows: s.tasks.flatMap((t) => t.reminders.map((r): Cell[] => [t.title, r.mode, r.mode === 'abs' ? iso(r.at) : `${r.minutes} min before`, r.label])) },
    { name: 'Notices', header: ['id', 'course', 'text', 'date', 'priority'], rows: s.notices.map((n) => [n.id, cn(n.courseId), n.text, iso(n.dueAt), n.priority]) },
    { name: 'Marks', header: ['course', 'item', 'score', 'weight', 'counted'], rows: s.marks.map((m) => [cn(m.courseId), m.name, m.score, m.weight, m.on]) },
    { name: 'Focus sessions', header: ['id', 'course', 'started', 'ended', 'focus min', 'break min', 'overtime min', 'rounds', 'planned min'], rows: s.focus.map((f) => [f.id, cn(f.courseId), iso(f.startedAt), iso(f.endedAt), +(f.focusSec / 60).toFixed(1), +(f.breakSec / 60).toFixed(1), +(f.overSec / 60).toFixed(1), f.rounds, f.planMin]) },
    /* W5/W6's two entities: empty on every database built before those workstreams, but the export has
       to carry them the moment they are not, and a sheet that appears later would be a silent change to
       the file's shape. Cheap enough to be honest now. */
    { name: 'Trips', header: ['id', 'started', 'ended', 'route', 'note'], rows: s.trips.map((t) => [t.id, iso(t.startedAt), iso(t.endedAt), t.route, t.note]) },
    { name: 'Alarms', header: ['id', 'at', 'label', 'enabled', 'kind', 'task'], rows: s.alarms.map((a) => [a.id, iso(a.at), a.label, a.enabled, a.kind, a.taskId]) },
    { name: 'Settings', header: ['key', 'value'], rows: Object.entries(st).map(([k, v]): Cell[] => [k, typeof v === 'object' ? JSON.stringify(v) : (v as Cell)]) },
  ];
  tables.unshift({ name: 'Summary', header: ['item', 'value'], rows: [['exported', isoUtc(now)], ['app', 'Marginalia 1.0'], ...tables.map((t): Cell[] => [t.name, t.rows.length])] });
  return tables;
}
export const toJson = (s: Snapshot, now: number) => JSON.stringify({ app: 'marginalia', version: 1, exportedAt: isoUtc(now), ...Object.fromEntries(buildTables(s, now).filter((t) => t.name !== 'Summary').map((t) => [t.name, t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i] ?? null])))])), raw: s }, null, 2);

const csvCell = (v: Cell) => { const x = v === null ? '' : String(v); return /[",\r\n]/.test(x) || /^[=+\-@]/.test(x) && typeof v === 'string' ? `"${(/^[=+\-@]/.test(x) && typeof v === 'string' ? "'" + x : x).replace(/"/g, '""')}"` : x; };
export const toCsv = (t: Table) => '\uFEFF' + [t.header, ...t.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/* ─── dependency-free ZIP (stored) + XLSX writer. The official SheetJS build is a CDN tarball; writing is all we need and it keeps the
   prototype-pollution advisory (which concerns *parsing*) out of the app entirely. ─── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = (CRC[(c ^ b[i]!) & 255] as number) ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const enc = (s: string) => new TextEncoder().encode(s);
export function zip(files: { name: string; data: Uint8Array }[], now = Date.now()): Uint8Array {
  const d = new Date(now), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  const parts: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  for (const f of files) {
    const name = enc(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, f.data); central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const colName = (i: number) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
export const sheetName = (n: string, used: Set<string>) => { let b = n.replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', x = b, i = 2; while (used.has(x.toLowerCase())) x = b.slice(0, 28) + ' ' + i++; used.add(x.toLowerCase()); return x; };
function sheetXml(t: Table): string {
  const widths = t.header.map((h, c) => Math.min(60, Math.max(h.length, ...t.rows.slice(0, 200).map((r) => String(r[c] ?? '').length)) + 2));
  const row = (cells: Cell[], r: number, head: boolean) => `<row r="${r}">${cells.map((v, c) => { const ref = `${colName(c)}${r}`; if (v === null || v === '') return ''; if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`; if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`; return `<c r="${ref}"${head ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`; }).join('')}</row>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${row(t.header, 1, true)}${t.rows.map((r, i) => row(r, i + 2, false)).join('')}</sheetData></worksheet>`;
}
export function toXlsx(tables: Table[], now = Date.now()): Uint8Array {
  const used = new Set<string>(), names = tables.map((t) => sheetName(t.name, used));
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([{ name: '[Content_Types].xml', data: enc(ct) }, { name: '_rels/.rels', data: enc(rels) }, { name: 'xl/workbook.xml', data: enc(wb) }, { name: 'xl/_rels/workbook.xml.rels', data: enc(wbRels) }, { name: 'xl/styles.xml', data: enc(styles) }, ...tables.map((t, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(sheetXml(t)) }))], now);
}
export const toCsvZip = (tables: Table[], now: number) => zip(tables.map((t) => ({ name: `${t.name.replace(/[^\w -]/g, '')}.csv`, data: enc(toCsv(t)) })), now);
export const fmt = { time: fmtTime, pad };
