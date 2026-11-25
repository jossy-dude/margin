import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, HandBox, Row, Txt } from '../ui/kit';
import { NumberField } from '../ui/fields';
import { FullPage } from '../ui/FullPage';
import { useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { courseGrade } from '../domain/grades';
import { LETTERS, cumulative, pastTerms, termGpa } from '../domain/gpa';
import { uid } from '../domain/time';
import type { PastGrade } from '../domain/types';

const fmt = (g: number | null) => (g === null ? '—' : g.toFixed(2));

/** This term's subjects with their current %, the way the Grades page works them out. */
export function useTermCourses() {
  const courses = useStore((s) => s.courses), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), variants = useStore((s) => s.variants);
  return useMemo(() => courses.filter((c) => !c.archived).map((c) => ({
    id: c.id, name: c.name,
    pct: courseGrade(marks.filter((m) => m.courseId === c.id), (variants ?? []).filter((v) => v.subjectId === c.id), adjusts[c.id] ?? 0),
  })), [courses, marks, adjusts, variants]);
}

/**
 * The GPA page (v0.7.6.4, the owner: "add old grades with their credit hours … do proper GPA calculations"). Three
 * parts: the two numbers that matter (this term, overall), this term's subjects with their credit hours, and the
 * earlier terms typed in from the transcript.
 */
export function GpaPage() {
  const { c } = useTheme();
  const credits = useStore((s) => s.settings.credits) ?? {}, past = useStore((s) => s.settings.pastGrades) ?? [];
  const courses = useTermCourses(), term = termGpa(courses, credits), all = cumulative(past, term.rows), terms = pastTerms(past);
  const [draft, setDraft] = useState<{ term: string; name: string; credits: number | null; grade: string }>(() => ({ term: past[past.length - 1]?.term ?? '', name: '', credits: 3, grade: '' }));
  const setCredits = (id: string, v: number | null) => {
    const next = { ...credits }; if (v === null || v <= 0) delete next[id]; else next[id] = v;
    act.setSettings({ credits: next });
  };
  const add = () => {
    if (!draft.name.trim() || !draft.grade || !draft.credits) return;
    const g: PastGrade = { id: uid('pg'), term: draft.term.trim() || 'Earlier', name: draft.name.trim(), credits: draft.credits, grade: draft.grade };
    act.setSettings({ pastGrades: [...past, g] });
    setDraft({ ...draft, name: '', grade: '' });
  };
  const remove = (id: string) => act.setSettings({ pastGrades: past.filter((g) => g.id !== id) });
  return (
    <FullPage title="GPA" sub="On the 4.0 scale, weighted by credit hours" onBack={act.closePage} testID="gpa">
      <HandBox seed="gpa-head" fill={c.deck} style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
        {[['This term', term.gpa, term.credits], ['Overall', all.gpa, all.credits]].map(([k, v, cr]) => (
          <View key={k as string} style={{ flex: 1 }} accessible accessibilityLabel={`${k} GPA ${fmt(v as number | null)}, ${cr} credit hours`}>
            <Txt f="type" s={34} c="deckInk">{fmt(v as number | null)}</Txt>
            <Txt f="bold" s={15} c="deckInk">{k as string}</Txt>
            <Txt f="serif" s={13} c="deckMut">{cr as number} credit hours</Txt>
          </View>
        ))}
      </HandBox>

      <Txt f="marker" s={22} accessibilityRole="header" style={{ marginTop: 8 }}>This term</Txt>
      {courses.length === 0 ? <Txt f="serif" s={15} c="mut">No subjects yet.</Txt> : courses.map((x) => {
        const r = term.rows.find((y) => y.id === x.id);
        return (
          <HandBox key={x.id} seed={`gpa-${x.id}`} shadow={false} style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt f="bold" s={16} numberOfLines={1}>{x.name}</Txt>
              <Txt f="serif" s={13.5} c="mut">{x.pct === null ? 'no marks yet' : `${x.pct.toFixed(0)}%${r ? ` · ${r.letter}` : ''}`}</Txt>
            </View>
            <NumberField value={credits[x.id] ?? null} onChange={(v) => setCredits(x.id, v)} min={0} max={12} unit="cr" emptyLabel="—" label={`${x.name} credit hours`} width={64} />
          </HandBox>
        );
      })}
      {term.missing.some((m) => m.why === 'credits') ? <Txt f="serif" s={13.5} c="mut">Subjects without credit hours are left out of the GPA.</Txt> : null}

      <Txt f="marker" s={22} accessibilityRole="header" style={{ marginTop: 8 }}>Earlier terms</Txt>
      {terms.map((t) => (
        <HandBox key={t.term} seed={`gpa-t-${t.term}`} style={{ padding: 14, gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}><Txt f="bold" s={17}>{t.term}</Txt><Txt f="type" s={17}>{fmt(t.gpa)}</Txt></Row>
          {t.list.map((g) => (
            <Row key={g.id} style={{ flexWrap: 'nowrap' }}>
              <Txt f="hand" s={16} numberOfLines={1} style={{ flex: 1 }}>{g.name}</Txt>
              <Txt f="type" s={14} c="mut">{g.credits} cr</Txt>
              <Txt f="type" s={16} style={{ minWidth: 30, textAlign: 'right' }}>{g.grade}</Txt>
              <Btn small kind="ghost" icon="trash" a11y={`Remove ${g.name}`} onPress={() => remove(g.id)} />
            </Row>
          ))}
        </HandBox>
      ))}
      <HandBox seed="gpa-add" shadow={false} dashed style={{ padding: 14, gap: 10 }}>
        <Txt f="bold" s={16}>Add a course from your transcript</Txt>
        <Field label="Term" placeholder="Year 1, Semester 1" value={draft.term} onChangeText={(t) => setDraft({ ...draft, term: t })} />
        <Field label="Course" placeholder="Introduction to Physics" value={draft.name} onChangeText={(t) => setDraft({ ...draft, name: t })} />
        <NumberField value={draft.credits} onChange={(v) => setDraft({ ...draft, credits: v })} min={1} max={12} unit="credit hours" label="Credit hours" />
        <Row gap={6}>{LETTERS.map((l) => <Chip key={l} small label={l} on={draft.grade === l} onPress={() => setDraft({ ...draft, grade: l })} />)}</Row>
        <Btn icon="plus" label="Add" disabled={!draft.name.trim() || !draft.grade || !draft.credits} onPress={add} />
      </HandBox>
    </FullPage>
  );
}
