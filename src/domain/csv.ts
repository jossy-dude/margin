/**
 * CSV in, a header and rows out. Pure, and deliberately small: the import path needs to read what a
 * spreadsheet exported, not to re-implement a spreadsheet engine.
 *
 * The rules that are actually load-bearing for a school planner's exports:
 *  - a field wrapped in double quotes may carry commas, newlines and doubled quotes (`""` = one `"`);
 *  - a UTF-8 BOM is stripped, because Excel writes one and it would otherwise become part of the first
 *    header's name (`"\uFEFFname"` matches nothing, so every course row would look nameless);
 *  - CRLF and LF both end a row, and a blank line is skipped rather than read as a row of one empty
 *    cell — a trailing newline at the end of a file is the normal case.
 *
 * What it does NOT do is pad or truncate a row to the header's width: a row whose field count does not
 * match the header is the one thing that cannot be guessed at, so it is carried through as it is and
 * `csvProblem` says why, with the line number a person reading the file would see.
 */
export interface CsvTable { header: string[]; rows: string[][] }

export function parseCsv(text: string): CsvTable {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  /** True once this field has been opened by a quote, so a later quote inside it is literal text. */
  let opened = false;
  /** Whether anything at all has been consumed for the record being built. */
  let started = false;

  const endField = () => { row.push(field); field = ''; opened = false; };
  const endRow = () => { endField(); records.push(row); row = []; started = false; };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch !== '"') { field += ch; continue; }
      if (src[i + 1] === '"') { field += '"'; i += 1; continue; }
      inQuotes = false;
      continue;
    }
    if (ch === '"' && field === '' && !opened) { inQuotes = true; opened = true; started = true; continue; }
    started = true;
    if (ch === ',') { endField(); continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
      continue;
    }
    field += ch;
  }
  if (started || field !== '') endRow();

  /* A line with one empty cell is a blank line, not a row. `,,` is a row of three empty cells and is
     kept — the distinction is the number of cells the line declared by hand. */
  const live = records.filter((r) => !(r.length === 1 && (r[0] ?? '').trim() === ''));
  const header = (live[0] ?? []).map((h) => h.trim());
  return { header, rows: live.slice(1) };
}

/**
 * Why the row at `rowIndex` (0-based, header excluded) cannot be read, or `''` when it is fine.
 *
 * Line numbers are spreadsheet line numbers (`rowIndex + 2`: line 1 is the header), because that is the
 * number the person's CSV editor shows them when they go to fix it.
 */
export function csvProblem(text: string, rowIndex: number): string {
  const { header, rows } = parseCsv(text);
  if (!header.length) return 'The file is empty.';
  const row = rows[rowIndex];
  if (!row) return `Row ${rowIndex + 2} is missing.`;
  if (row.length !== header.length) return `Row ${rowIndex + 2} has ${row.length} fields; the header has ${header.length}.`;
  return '';
}
