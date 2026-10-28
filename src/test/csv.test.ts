import { csvProblem, parseCsv } from '../domain/csv';

/**
 * CSV in, a header and rows out. The input is whatever a spreadsheet exported — so quoted fields,
 * commas inside quotes, a note with a line break in it, and a stray blank line are all normal, not
 * edge cases. A row that does not line up with the header is the one thing the parser refuses to
 * guess about; `csvProblem` is what the preview prints for it.
 */
describe('parseCsv', () => {
  it('reads a plain table, with CRLF line endings and no trailing blank row', () => {
    expect(parseCsv('date,course,start\r\n2026-09-14,DB Systems,08:30\r\n')).toEqual({
      header: ['date', 'course', 'start'],
      rows: [['2026-09-14', 'DB Systems', '08:30']],
    });
  });

  it('keeps a comma inside a quoted field, and does not lose the field around it', () => {
    const t = 'name,room,teacher\n"DB Systems, room B12",A1,"Ms. X, PhD"\n';
    expect(parseCsv(t)).toEqual({
      header: ['name', 'room', 'teacher'],
      rows: [['DB Systems, room B12', 'A1', 'Ms. X, PhD']],
    });
  });

  it('keeps a newline inside a quoted field as part of that field', () => {
    const t = 'title,notes\n"Essay","first line\nsecond line"\n"Quiz",plain\n';
    expect(parseCsv(t)).toEqual({
      header: ['title', 'notes'],
      rows: [['Essay', 'first line\nsecond line'], ['Quiz', 'plain']],
    });
  });

  it('unescapes a doubled quote into one quote', () => {
    expect(parseCsv('title,notes\n"Read ""chapter 1""",""\n')).toEqual({
      header: ['title', 'notes'],
      rows: [['Read "chapter 1"', '']],
    });
  });

  it('drops the UTF-8 BOM, so the first header is "name" and not "\uFEFFname"', () => {
    const t = '\uFEFFname,room\nMaths,A1\n';
    expect(parseCsv(t).header).toEqual(['name', 'room']);
  });

  it('treats empty and whitespace-only input as an empty table', () => {
    for (const text of ['', '   ', '\n\n']) expect(parseCsv(text)).toEqual({ header: [], rows: [] });
  });

  it('a header with no rows still reads as its header', () => {
    expect(parseCsv('name,room\n')).toEqual({ header: ['name', 'room'], rows: [] });
  });

  it('does not turn a blank line in the middle of the file into a row', () => {
    const t = 'name\nMaths\n\nHistory\n';
    expect(parseCsv(t)).toEqual({ header: ['name'], rows: [['Maths'], ['History']] });
  });

  it('keeps spaces inside a quoted field but trims the header it reads', () => {
    expect(parseCsv(' name , room \n" Maths ",A1\n')).toEqual({
      header: ['name', 'room'],
      rows: [[' Maths ', 'A1']],
    });
  });
});

describe('csvProblem', () => {
  it('says nothing when the row lines up with the header', () => {
    expect(csvProblem('a,b\n1,2\n', 0)).toBe('');
  });

  it('names the spreadsheet line and both field counts for a ragged row', () => {
    expect(csvProblem('a,b,c\n1,2\n3,4,5\n', 0)).toBe('Row 2 has 2 fields; the header has 3.');
    expect(csvProblem('a,b,c\n1,2,3\n4,5\n', 1)).toBe('Row 3 has 2 fields; the header has 3.');
  });

  it('a file with no header at all is reported as empty, not as a ragged row', () => {
    expect(csvProblem('', 0)).toBe('The file is empty.');
  });
});
