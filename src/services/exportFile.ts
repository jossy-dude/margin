import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Snapshot } from '../domain/types';
import { buildTables, exportName, toCsvZip, toJson, toXlsx } from './export';

export type ExportFormat = 'xlsx' | 'csv' | 'json';
export type ExportTarget = 'folder' | 'share';
const MIME: Record<ExportFormat, string> = { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'application/zip', json: 'application/json' };

export function buildExport(format: ExportFormat, s: Snapshot, now = Date.now()): { name: string; data: string | Uint8Array; mime: string } {
  if (format === 'json') return { name: exportName(now, 'json'), data: toJson(s, now), mime: MIME.json };
  const tables = buildTables(s, now);
  return format === 'xlsx' ? { name: exportName(now, 'xlsx'), data: toXlsx(tables, now), mime: MIME.xlsx } : { name: exportName(now, 'zip', '-csv'), data: toCsvZip(tables, now), mime: MIME.csv };
}
/** 'folder' lets the person choose any directory (Android's folder picker); 'share' hands the file to the system share sheet (Drive, Files, mail …). */
export async function runExport(format: ExportFormat, target: ExportTarget, s: Snapshot): Promise<{ ok: boolean; where: string; name: string }> {
  const { name, data, mime } = buildExport(format, s);
  if (target === 'folder') {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(name, mime); file.write(data);
    return { ok: true, where: file.uri, name };
  }
  const file = new File(Paths.cache, name); if (file.exists) file.delete(); file.create(); file.write(data);
  if (!(await Sharing.isAvailableAsync())) return { ok: false, where: file.uri, name };
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name, UTI: format === 'json' ? 'public.json' : undefined });
  return { ok: true, where: file.uri, name };
}
