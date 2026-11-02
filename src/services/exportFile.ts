import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SemesterRow, Snapshot } from '../domain/types';
import { buildTables, exportName, toCsvZip, toJson, toTimetableJson, toXlsx } from './export';

export type ExportFormat = 'xlsx' | 'csv' | 'json' | 'timetable';
export type ExportTarget = 'folder' | 'share';
const MIME: Record<ExportFormat, string> = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'application/zip', json: 'application/json', timetable: 'application/json' };

export function buildExport(format: ExportFormat, s: Snapshot, now = Date.now(), terms: readonly SemesterRow[] = []): { name: string; data: string | Uint8Array; mime: string } {
  if (format === 'json') return { name: exportName(now, 'json'), data: toJson(s, now, terms), mime: MIME.json };
  if (format === 'timetable') return { name: exportName(now, 'json', '-timetable'), data: toTimetableJson(s, now, { program: '', section: '', title: s.settings.name ? `${s.settings.name}'s timetable` : 'A class timetable' }), mime: MIME.json };
  const tables = buildTables(s, now, terms);
  return format === 'xlsx' ? { name: exportName(now, 'xlsx'), data: toXlsx(tables, now), mime: MIME.xlsx } : { name: exportName(now, 'zip', '-csv'), data: toCsvZip(tables, now), mime: MIME.csv };
}
/** 'folder' lets the person choose any directory (Android's folder picker); 'share' hands the file to the system share sheet (Drive, Files, mail …). */
export async function runExport(format: ExportFormat, target: ExportTarget, s: Snapshot, terms: readonly SemesterRow[] = []): Promise<{ ok: boolean; where: string; name: string }> {
  const { name, data, mime } = buildExport(format, s, Date.now(), terms);
  if (target === 'folder') {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(name, mime); file.write(data);
    return { ok: true, where: file.uri, name };
  }
  const file = new File(Paths.cache, name); if (file.exists) file.delete(); file.create(); file.write(data);
  try {
    if (!(await Sharing.isAvailableAsync())) return { ok: false, where: file.uri, name };
    await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name, UTI: format === 'json' || format === 'timetable' ? 'public.json' : undefined });
    return { ok: true, where: file.uri, name };
  } finally {
    try { file.delete(); } catch { /* swallow; the cache entry may already be gone */ }
  }
}
