import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Btn, HandBox, Row, Txt } from '../ui/kit';
import { Label } from '../ui/Sheet';
import { useTheme } from '../ui/theme-context';
import { FONT } from '../tokens/theme';
import {
  DATASETS, detectDataset, detectImportFormat, parseImportFile, planCsv, type DatasetCount, type DatasetKind, type ImportPlan,
} from '../domain/importPlan';
import type { Snapshot } from '../domain/types';
import { parseCsv, type CsvTable } from '../domain/csv';
import { semesterLabel } from '../domain/semester';
import { act, useStore } from '../store/store';
import { pickImportFile } from '../services/pickFile';

/** The compact shape, short enough to read in a placeholder and complete enough to be copied. */
const SAMPLE = `{
  "semester": { "start": "2026-09-07", "end": "2026-12-20" },
  "courses": [{ "name": "DB Systems",
    "meetings": [{ "weekday": 1, "start": "08:30", "end": "10:00" }] }],
  "tasks": [{ "title": "Read chapter 1",
    "course": "DB Systems", "due": "2026-09-20T23:59" }]
}`;

/** Singular and plural for each count the preview prints: `1 subject`, not `1 subjects`. */
const WORD: Record<string, readonly [string, string]> = {
  courses: ['subject', 'subjects'], meetings: ['class', 'classes'], tasks: ['task', 'tasks'], notices: ['note', 'notes'],
  attendance: ['attendance mark', 'attendance marks'], dayMarks: ['day mark', 'day marks'], marks: ['mark', 'marks'],
  adjusts: ['curve', 'curves'], variants: ['variant', 'variants'], focus: ['focus session', 'focus sessions'],
  trips: ['trip', 'trips'], alarms: ['alarm', 'alarms'], semesters: ['past term', 'past terms'],
};
const word = (key: string, n: number) => { const w = WORD[key]; return w ? w[n === 1 ? 0 : 1] : key; };
const total = (plan: ImportPlan) => Object.values(plan.counts).reduce((a, b) => a + b, 0);

/** One dataset's ledger line: how many rows are written, and — only where the plan could look at what
 *  is already on the phone — how many of those are new and how many replace a row. Where it could not,
 *  it says "add or update" rather than calling a re-import "new". */
function describe(key: string, d: DatasetCount): { what: string; split: string } | null {
  if (!d.write) return null;
  const what = `${d.write} ${word(key, d.write)}`;
  if (d.add === null || d.update === null) return { what, split: 'add or update' };
  return { what, split: [d.add ? `${d.add} new` : '', d.update ? `${d.update} updated` : ''].filter(Boolean).join(', ') };
}
/** Above this many characters a picked file is not put in the paste box: a multiline TextInput lays
 *  out every glyph on every keystroke, and a term's export is easily 300 kB. The file is shown as a
 *  slip (name, size, lines) and planned straight from memory. */
const BIG = 20_000;
const sizeOf = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} kB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const linesOf = (t: string) => { let n = 1; for (let i = 0; i < t.length; i++) if (t.charCodeAt(i) === 10) n++; return n; };

/** Rows the file carried that this import will not write — a class that has not happened, a cell that
 *  could not be read. Every dataset is named here: a skip the preview hides is a row the user loses
 *  without being told. */
const skipped = (plan: ImportPlan) => Object.entries(plan.breakdown)
  .filter(([, d]) => d.skip > 0)
  .map(([k, d]) => `${d.skip} ${word(k, d.skip)}`)
  .join(' · ');

/** What a plan is built with: the rows already on the phone, so a CSV that names one by id, key or
 *  date merges over it instead of resetting it, and so the preview can split new from updated. Module
 *  level, not inside the page, because `Date.now()` in a component's body is an impure call during
 *  render. */
const options = (phone: Pick<Snapshot, 'courses' | 'meetings' | 'tasks' | 'attendance' | 'dayMarks' | 'marks' | 'variants'>) => ({
  courses: phone.courses, meetings: phone.meetings, tasks: phone.tasks,
  attendance: phone.attendance, dayMarks: phone.dayMarks, marks: phone.marks,
  variants: phone.variants ?? [], now: Date.now(),
});

/** The tables a CSV may be, printed the way the app names them. */
const DATASET_LABEL: Record<DatasetKind, string> = {
  courses: 'Subjects', timetable: 'Timetable', attendance: 'Attendance', dayMarks: 'Day marks', tasks: 'Tasks', marks: 'Marks',
};

/**
 * Settings → Data → Import.
 *
 * A page in the Settings tree, not a second sheet: the paste box is tall, the preview can list a dozen
 * problems, and a sheet inside the Settings sheet would put the keyboard, the preview and the Data page's
 * own scroll all in one thumb zone. Check parses; Import is disabled until the parse has no problems, and
 * its label is the row count the user is about to add, so the button never hides the size of the write.
 *
 * Two doors, one path. A picked file is put in the box and previewed at once (the person has already
 * said which file they mean), and pasted text is previewed on Check. Both end in the same plan, the same
 * preview and the same merge-only commit, so there is no second way for rows to arrive.
 */
export function ImportPage() {
  const { c } = useTheme();
  /* Every table a CSV can name by id, key or date, so a re-import merges over the row already here
     and the preview can say how many rows are new. Six selectors rather than the whole state so a
     clock tick elsewhere does not re-render the page. */
  const courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings);
  const tasks = useStore((s) => s.tasks), attendance = useStore((s) => s.attendance);
  const dayMarks = useStore((s) => s.dayMarks), marks = useStore((s) => s.marks), variants = useStore((s) => s.variants);
  const onPhone = { courses, meetings, tasks, attendance, dayMarks, marks, variants };
  const [text, setText] = useState(''), [plan, setPlan] = useState<ImportPlan | null>(null), [busy, setBusy] = useState(false);
  /** The picked file's name, and the parsed table when a CSV needs a second pass with the table chosen. */
  const [name, setName] = useState<string | undefined>(undefined), [csv, setCsv] = useState<CsvTable | null>(null), [pickErr, setPickErr] = useState('');
  /** A picked file too big for the box: its text, kept out of the TextInput (see `BIG`). */
  const [big, setBig] = useState<string | null>(null);

  const rows = plan ? total(plan) : 0;
  const notWritten = plan ? skipped(plan) : '';
  const semester = plan?.snapshot.settings?.semesterStart;
  const canImport = !!plan && plan.problems.length === 0 && (rows > 0 || !!semester);
  const label = rows ? `Import ${rows} row${rows === 1 ? '' : 's'}` : semester ? 'Save semester' : 'Import';
  const asksDataset = !!csv && !!plan?.problems.some((p) => p.field === 'dataset');

  /* A CSV is planned twice only when the header does not name its table: once to produce the question,
     then again once the person has answered it — which is why the parsed table is kept here. */
  const preview = (t: string, n: string | undefined) => {
    if (detectImportFormat(n, t) === 'csv') {
      const table = parseCsv(t);
      setCsv(table);
      setPlan(planCsv(table.header, table.rows, detectDataset(table.header) ?? undefined, options(onPhone)));
      return;
    }
    setCsv(null);
    setPlan(parseImportFile(n, t, options(onPhone)));
  };
  const choose = (dataset: DatasetKind) => { if (csv) setPlan(planCsv(csv.header, csv.rows, dataset, options(onPhone))); };

  const check = () => preview(big ?? text, name);
  const clearBig = () => { setBig(null); setName(undefined); setPlan(null); setCsv(null); };
  const pick = async () => {
    setPickErr('');
    try {
      const file = await pickImportFile();
      if (!file) return;
      const large = file.text.length > BIG;
      setName(file.name); setText(large ? '' : file.text); setBig(large ? file.text : null); setPlan(null); setCsv(null);
      preview(file.text, file.name);
    } catch (e) {
      setPickErr(`Couldn't read that file: ${String((e as Error)?.message ?? e).slice(0, 60)}`);
    }
  };
  const run = async () => {
    if (!plan || !canImport) return;
    setBusy(true);
    const ok = await act.importPlan(plan);
    setBusy(false);
    if (ok) act.settingsPop();
  };

  return (
    <View style={{ gap: 10 }}>
      <Txt f="serif" s={15.5} c="mut">Import a JSON export or a CSV table, from a file or pasted. Import only adds rows, or overwrites a row that carries the same id — nothing is ever deleted, so the same file twice changes nothing the second time.</Txt>
      <Row>
        <Btn small label="Pick file" icon="note" testID="import-pick" disabled={busy} onPress={() => void pick()} />
        <Txt f="serif" s={15} c="mut" numberOfLines={1} style={{ flexShrink: 1 }}>{name ?? 'or paste below'}</Txt>
      </Row>
      {pickErr ? <Txt f="serif" s={14.5} c="bad">{pickErr}</Txt> : null}
      {big !== null ? (
        <HandBox seed="import-slip" fill={c.card} style={{ padding: 12, gap: 4 }}>
          <Txt f="bold" s={20} numberOfLines={1}>{name}</Txt>
          <Txt f="type" s={13} c="mut">{sizeOf(big.length)} · {linesOf(big).toLocaleString()} lines · read from the file, not shown</Txt>
          <Row style={{ marginTop: 4 }}><Btn small kind="ghost" icon="x" label="Paste instead" testID="import-clear" onPress={clearBig} /></Row>
        </HandBox>
      ) : <>
      <Label>JSON or CSV</Label>
      <TextInput
        value={text} onChangeText={(v) => { setText(v); setPlan(null); setName(undefined); setCsv(null); }}
        multiline autoCapitalize="none" autoCorrect={false} spellCheck={false}
        placeholder={SAMPLE} placeholderTextColor={c.mut} accessibilityLabel="JSON to import"
        style={{ fontFamily: FONT.type, fontSize: 13, lineHeight: 18, color: c.ink, minHeight: 150, textAlignVertical: 'top', padding: 8, borderWidth: 1.4, borderColor: c.rule }}
      />
      </>}
      <Row>
        <Btn small label="Check" icon="check" testID="import-check" disabled={busy || !(big ?? text).trim()} onPress={check} />
        <Btn small kind="primary" label={label} testID="import-commit" disabled={busy || !canImport} onPress={() => void run()} />
        {busy ? <Txt f="serif" s={15} c="mut">working…</Txt> : null}
      </Row>
      {asksDataset ? (
        <View style={{ gap: 6 }}>
          <Label>Which table is this?</Label>
          <Row>
            {DATASETS.map((d) => (
              <Btn key={d} small kind="ghost" label={DATASET_LABEL[d]} testID={`import-dataset-${d}`} onPress={() => choose(d)} />
            ))}
          </Row>
        </View>
      ) : null}
      {plan ? (
        <View style={{ gap: 6 }}>
          <Label>What this file carries</Label>
          {/* A ledger, not a run-on sentence: one line per dataset, the count in the hand, the split in the
              typewriter, ruled like the page under it. */}
          {rows ? Object.entries(plan.breakdown).map(([k, d]) => [k, describe(k, d)] as const).filter((x): x is [string, { what: string; split: string }] => x[1] !== null).map(([k, l], i) => (
            <View key={k} testID={`import-line-${k}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 3, borderTopWidth: i ? 1 : 0, borderColor: c.rule }}>
              <Txt f="bold" s={19} style={{ flex: 1 }}>{l.what}</Txt>
              {l.split ? <Txt f="type" s={13} c="mut">{l.split}</Txt> : null}
            </View>
          )) : <Txt f="bold" s={19}>No rows</Txt>}
          {notWritten ? <Txt f="serif" s={15} c="mut">Skipped (not written): {notWritten}</Txt> : null}
          {plan.profileName ? <Txt f="serif" s={15.5} c="mut">Profile {plan.profileName}</Txt> : null}
          {semester ? <Txt f="serif" s={15.5} c="mut">Semester {semesterLabel(plan.snapshot.settings ?? {})}</Txt> : null}
          {plan.problems.length ? (
            <View style={{ gap: 3 }}>
              <Txt f="bold" s={18} c="bad">{plan.problems.length === 1 ? 'One problem stops the import' : `${plan.problems.length} problems stop the import`}</Txt>
              {plan.problems.map((p, i) => <Txt key={`${p.where}-${p.field}-${i}`} f="serif" s={14.5} c="bad">{p.where} · {p.field}: {p.message}</Txt>)}
            </View>
          ) : null}
          {plan.warnings.length ? (
            <View style={{ gap: 3 }}>
              <Txt f="bold" s={18} c="warn">{plan.warnings.length === 1 ? 'One warning' : `${plan.warnings.length} warnings`}</Txt>
              {plan.warnings.map((w, i) => <Txt key={`${w}-${i}`} f="serif" s={14.5} c="mut">{w}</Txt>)}
            </View>
          ) : null}
          <Txt f="serif" s={14} c="mut">Problems stop the import. Warnings do not: that row was read, and only the part named in the warning was ignored.</Txt>
        </View>
      ) : null}
    </View>
  );
}
