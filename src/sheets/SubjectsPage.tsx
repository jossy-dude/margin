import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Empty } from '../screens/common';
import { Pressable, View } from 'react-native';
import { Btn, Chip, Field, HandBox, Row, Txt } from '../ui/kit';
import { FullPage } from '../ui/FullPage';
import { useTheme } from '../ui/theme-context';
import { PALE, subjectTint } from '../ui/collage/tint';
import { act, useStore } from '../store/store';
import { toast } from '../store/toast';
import { deleteSays, normTag, subjectCards, tagTaken, type SubjectCard, type SubjectInput } from '../domain/subjects';
import { semesterFirstDay } from '../domain/semester';
import { subjectTag } from '../domain/vaultTasks';
import { dueWhen } from '../screens/today/model';
import type { Course } from '../domain/types';

/** The store slice every Subjects view reads, as the pure input `domain/subjects.ts` takes. */
function useSubjectInput(): SubjectInput {
  const s = useStore((x) => x);
  return useMemo(() => ({
    now: s.now, termStart: semesterFirstDay(s.settings, s.now), hour12: s.settings.hour12, courses: s.courses, meetings: s.meetings, variants: s.variants, marks: s.marks,
    adjusts: s.adjusts, attendance: s.attendance, dayMarks: s.dayMarks, tasks: s.tasks, notices: s.notices, moves: s.settings.moves,
  }), [s.now, s.settings, s.courses, s.meetings, s.variants, s.marks, s.adjusts, s.attendance, s.dayMarks, s.tasks, s.notices]);
}
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)} %`);

/**
 * Subjects (v0.8 §3.3): one card per subject (colour, name, grade vs goal, attendance vs goal, next class), and a
 * page per subject with everything about it. Opened from Grades' header, from Settings, and from a subject's name.
 */
export function SubjectsPage({ id }: { id?: string }) {
  const input = useSubjectInput();
  const cards = subjectCards(input);
  if (id) { const c = input.courses.find((x) => x.id === id); if (c) return <SubjectPage c={c} input={input} card={cards.find((x) => x.id === id)!} />; }
  return (
    <FullPage title="Subjects" sub={`${cards.filter((c) => !c.archived).length} this term`} onBack={act.closePage} testID="subjects" still
      right={<Btn small kind="primary" icon="plus" a11y="New subject" onPress={() => act.open({ t: 'course' })} />}>
      {cards.length === 0 ? <Empty icon="grad" face="happy" text="No subjects yet. Each one gathers its classes, marks and tasks." action={{ label: 'Add a subject', onPress: () => act.open({ t: 'course' }) }} /> : null}
      {cards.map((c) => <SubjectRow key={c.id} c={c} />)}
    </FullPage>
  );
}

function SubjectRow({ c }: { c: SubjectCard }) {
  const { tints } = useTheme();
  const att = c.att === null ? '—' : `${Math.round(c.att * 100)} %`;
  return (
    <Pressable testID={`subject-${c.id}`} accessibilityRole="button" accessibilityLabel={`${c.name}. Grade ${pct(c.grade)}${c.goal ? `, goal ${c.goal} %` : ''}. Attendance ${att}. ${c.next ? `Next: ${c.next}` : ''}`}
      onPress={() => act.openPage({ t: 'subjects', id: c.id })} style={{ opacity: c.archived ? 0.6 : 1 }}>
      <HandBox seed={`sr-${c.id}`} fill={subjectTint(c.id, tints)} style={{ padding: 12, gap: 4 }}>
        <Row style={{ flexWrap: 'nowrap' }}>
          <Txt f="bold" s={20} style={{ flex: 1 }} numberOfLines={2}>{c.name}</Txt>
          {c.archived ? <Txt f="serif" s={14} c="mut">archived</Txt> : null}
        </Row>
        <Txt f="type" s={14}>{`Grade ${pct(c.grade)}${c.goal ? ` / ${c.goal} %` : ''} · Attendance ${att}${c.attGoal ? ` / ${c.attGoal} %` : ''}`}</Txt>
        <Txt f="serif" s={14.5} c="mut">{[c.next ? `Next ${c.next}` : 'No class in the next two weeks', c.openTasks ? `${c.openTasks} open` : ''].filter(Boolean).join(' · ')}</Txt>
      </HandBox>
    </Pressable>
  );
}

function SubjectPage({ c, input, card }: { c: Course; input: SubjectInput; card: SubjectCard }) {
  const { tints, c: col } = useTheme();
  const [tag, setTag] = useState(subjectTag(c)), [sure, setSure] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const taken = tagTaken(tag, c.id, input.courses);
  const saveTag = () => { if (taken || !tag.trim()) return; const t = normTag(tag); setTag(t); if (t !== subjectTag(c)) { act.saveCourse({ ...c, tag: t }); toast(`Obsidian tag: ${t}`); } };
  const marks = input.marks.filter((m) => m.courseId === c.id).sort((a, b) => a.sort - b.sort);
  const tasks = input.tasks.filter((t) => t.courseId === c.id && t.status !== 2);
  const notices = input.notices.filter((n) => n.courseId === c.id && !n.archived);
  const del = () => {
    if (!sure) { setSure(true); timer.current = setTimeout(() => setSure(false), 6000); return; }
    act.removeCourse(c.id); act.openPage({ t: 'subjects' });
  };
  return (
    <FullPage title={c.name} sub={[c.teacher, c.rooms.join(', ')].filter(Boolean).join(' · ') || undefined} onBack={() => act.openPage({ t: 'subjects' })} testID="subject" still
      right={<Btn small kind="ghost" icon="pencil" a11y={`Edit ${c.name}`} onPress={() => act.open({ t: 'course', id: c.id })} />}>
      <HandBox seed={`sp-${c.id}`} fill={subjectTint(c.id, tints)} style={{ padding: 12, gap: 4 }}>
        <Txt f="type" s={15}>{`Grade ${pct(card.grade)}${c.goal ? ` · goal ${c.goal} %` : ''}`}</Txt>
        <Txt f="type" s={15}>{`Attendance ${card.att === null ? '—' : `${Math.round(card.att * 100)} %`}${card.attGoal ? ` · goal ${card.attGoal} %` : ''}`}</Txt>
        <Txt f="serif" s={15} c="mut">{card.next ? `Next class ${card.next}` : 'No class in the next two weeks'}</Txt>
      </HandBox>
      <Txt f="bold" s={18}>Colour</Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {PALE.map((k) => (
          <Pressable key={k} accessibilityRole="radio" accessibilityLabel={k} accessibilityState={{ checked: (c.color ?? null) === k }} onPress={() => act.saveCourse({ ...c, color: k })}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tints[k], borderWidth: (c.color ?? null) === k ? 3 : 1, borderColor: (c.color ?? null) === k ? col.ink : col.rule }} />
        ))}
        {c.color ? <Chip small label="Automatic" onPress={() => act.saveCourse({ ...c, color: null })} /> : null}
      </Row>
      <Field label="Obsidian tag" testID="subject-tag" value={tag} onChangeText={setTag} onEndEditing={saveTag} autoCapitalize="none" />
      <Txt f="serif" s={14} c={taken ? 'bad' : 'mut'}>{taken ? 'Another subject already has this tag.' : 'Task lines with this tag in any note come to this subject.'}</Txt>
      <Btn kind="ghost" icon="week" label="Timetable, rooms, lab and tutorial parts" onPress={() => act.open({ t: 'course', id: c.id })} />
      <Row style={{ justifyContent: 'space-between' }}><Txt f="bold" s={18}>Marks</Txt><Btn small kind="ghost" icon="plus" label="Mark" onPress={() => act.open({ t: 'mark', courseId: c.id })} /></Row>
      {marks.length === 0 ? <Txt f="serif" s={15} c="mut">No marks yet.</Txt> : marks.map((m) => (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => act.open({ t: 'mark', courseId: c.id, id: m.id })}>
          <Row style={{ flexWrap: 'nowrap' }}><Txt f="hand" s={17} style={{ flex: 1 }} numberOfLines={1}>{m.name}</Txt><Txt f="type" s={15}>{m.score === null ? '—' : `${m.score}`} · {m.weight} %</Txt></Row>
        </Pressable>
      ))}
      <Row style={{ justifyContent: 'space-between' }}><Txt f="bold" s={18}>Tasks</Txt><Btn small kind="ghost" icon="plus" label="Task" onPress={() => act.open({ t: 'task', courseId: c.id })} /></Row>
      {tasks.length === 0 ? <Txt f="serif" s={15} c="mut">Nothing open.</Txt> : tasks.map((t) => (
        <Pressable key={t.id} accessibilityRole="button" onPress={() => act.open({ t: 'task', id: t.id })}>
          <Row style={{ flexWrap: 'nowrap' }}><Txt f="hand" s={17} style={{ flex: 1 }} numberOfLines={1}>{t.title}</Txt>{t.dueAt ? <Txt f="serif" s={14} c="mut">{dueWhen(t.dueAt, input.now, input.hour12)}</Txt> : null}</Row>
        </Pressable>
      ))}
      <Row style={{ justifyContent: 'space-between' }}><Txt f="bold" s={18}>Notices</Txt><Btn small kind="ghost" icon="plus" label="Notice" onPress={() => act.open({ t: 'notice', courseId: c.id })} /></Row>
      {notices.length === 0 ? <Txt f="serif" s={15} c="mut">None pinned.</Txt> : notices.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => act.open({ t: 'notice', id: n.id })}><Txt f="hand" s={17} numberOfLines={2}>{n.text}</Txt></Pressable>
      ))}
      <View style={{ height: 8 }} />
      <Btn kind="ghost" icon="down" label={c.archived ? 'Bring back from the archive' : 'Archive (keep it, out of the way)'} onPress={() => { act.saveCourse({ ...c, archived: !c.archived }); toast(c.archived ? 'Back in this term' : 'Archived'); }} />
      <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" testID="subject-delete" label={sure ? `Tap again: ${deleteSays(c, input)}` : 'Delete subject'} onPress={del} />
    </FullPage>
  );
}
