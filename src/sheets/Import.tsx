import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Btn, Row, Txt } from '../ui/kit';
import { Label } from '../ui/Sheet';
import { useTheme } from '../ui/theme-context';
import { FONT } from '../tokens/theme';
import { parseImport, type ImportPlan } from '../domain/importPlan';
import { semesterLabel } from '../domain/semester';
import { act, useStore } from '../store/store';

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
  attendance: ['attendance mark', 'attendance marks'], dayMarks: ['day mark', 'day marks'], marks: ['mark', 'marks'], adjusts: ['curve', 'curves'],
};
const word = (key: string, n: number) => { const w = WORD[key]; return w ? w[n === 1 ? 0 : 1] : key; };
const total = (plan: ImportPlan) => Object.values(plan.counts).reduce((a, b) => a + b, 0);

/**
 * Settings → Data → Import.
 *
 * A page in the Settings tree, not a second sheet: the paste box is tall, the preview can list a dozen
 * problems, and a sheet inside the Settings sheet would put the keyboard, the preview and the Data page's
 * own scroll all in one thumb zone. Check parses; Import is disabled until the parse has no problems, and
 * its label is the row count the user is about to add, so the button never hides the size of the write.
 */
export function ImportPage() {
  const { c } = useTheme();
  const courses = useStore((s) => s.courses);
  const [text, setText] = useState(''), [plan, setPlan] = useState<ImportPlan | null>(null), [busy, setBusy] = useState(false);

  const rows = plan ? total(plan) : 0;
  const semester = plan?.snapshot.settings?.semesterStart;
  const canImport = !!plan && plan.problems.length === 0 && (rows > 0 || !!semester);
  const label = rows ? `Import ${rows} row${rows === 1 ? '' : 's'}` : semester ? 'Save semester' : 'Import';

  const check = () => { setPlan(parseImport(text, { courses, now: Date.now() })); };
  const run = async () => {
    if (!plan || !canImport) return;
    setBusy(true);
    const ok = await act.importPlan(plan);
    setBusy(false);
    if (ok) act.settingsPop();
  };

  return (
    <View style={{ gap: 10 }}>
      <Txt f="serif" s={15.5} c="mut">Paste a Margin JSON export, or the compact shape an AI can write. Import only adds rows, or overwrites a row that carries the same id — nothing is ever deleted, so the same file twice changes nothing the second time.</Txt>
      <Label>JSON</Label>
      <TextInput
        value={text} onChangeText={(v) => { setText(v); setPlan(null); }}
        multiline autoCapitalize="none" autoCorrect={false} spellCheck={false}
        placeholder={SAMPLE} placeholderTextColor={c.mut} accessibilityLabel="JSON to import"
        style={{ fontFamily: FONT.type, fontSize: 13, lineHeight: 18, color: c.ink, minHeight: 150, textAlignVertical: 'top', padding: 8, borderWidth: 1.4, borderColor: c.rule }}
      />
      <Row>
        <Btn small label="Check" icon="check" disabled={busy || !text.trim()} onPress={check} />
        <Btn small kind="primary" label={label} disabled={busy || !canImport} onPress={() => void run()} />
        {busy ? <Txt f="serif" s={15} c="mut">working…</Txt> : null}
      </Row>
      {plan ? (
        <View style={{ gap: 6 }}>
          <Label>What this file carries</Label>
          <Txt f="bold" s={19}>{rows ? Object.entries(plan.counts).map(([k, n]) => `${n} ${word(k, n)}`).join(' · ') : 'No rows'}</Txt>
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
