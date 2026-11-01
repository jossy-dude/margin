import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Btn, HandBox, Icon, Reveal, Row, Txt } from '../ui/kit';
import { Section } from '../screens/common';
import { SemesterRange } from '../ui/SemesterRange';
import { activeSemester, daysLeft, newSemesterRange, semesterLabel } from '../domain/semester';
import { readSnapshot, termSummary } from '../domain/archive';
import type { SemesterRow } from '../domain/types';
import { plural } from '../domain/time';
import { act, useStore } from '../store/store';
import { useTheme } from '../ui/theme-context';
import { FONT } from '../tokens/theme';

/**
 * The terms, one active and the rest kept.
 *
 * v0.5 made the semester a row rather than a pair of settings, and this is the page where that row can
 * be seen and changed. It answers the three questions the old Attendance control could not: which term
 * is running (name, range and days left), what came before, and how to move on — with the archive's
 * keep-attendance choice stated before anything is cleared.
 *
 * An archived term opens in place (D4): a read-only summary computed from its frozen snapshot — each
 * subject's final average, the classes it was present for, the tasks finished, and the term's focus time.
 * Nothing on it can be edited; it is the term as it was closed.
 */
export function SemestersPage() {
  const { c } = useTheme();
  const rows = useStore((s) => s.semesters), now = useStore((s) => s.now);
  const active = rows.find((x) => x.active) ?? null;
  const archived = rows.filter((x) => !x.active);
  const activeId = active?.id ?? '', activeName = active?.name ?? '';
  /* The name field is derived, not copied: `editing` holds only the text the user has typed, tagged
     with the term it belongs to. A roll-over changes the id, so the field falls back to the new term's
     name without an effect; a successful save drops the draft and the row's name shows through again. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const name = editing && editing.id === activeId ? editing.name : activeName;
  const [asking, setAsking] = useState(false), [busy, setBusy] = useState(false);

  useEffect(() => { void act.loadSemesters(); }, []);

  const span = active ? activeSemester(active) : null;
  const left = span ? daysLeft(span, now) : null;
  const leftLine = left === null ? 'No end date yet' : left > 0 ? `${plural(left, 'day')} left` : left === 0 ? 'Last day today' : `Ended ${plural(-left, 'day')} ago`;

  const rename = async () => { await act.renameSemester(activeId, name); setEditing(null); };
  /* The next term's dates are asked as part of the roll-over (D4), seeded with today and the usual
     15 weeks, so the new term starts on the range the student actually has instead of one to fix later. */
  const [next, setNext] = useState(() => newSemesterRange(now));
  const roll = async (keep: boolean) => { setBusy(true); await act.rollOverSemester(keep, next); setBusy(false); setAsking(false); };

  return (<>
    <Section title="Current term">
      {active ? <HandBox seed={`term-${active.id}`} fill={c.card} style={{ padding: 12, gap: 6 }}>
        <Txt f="serif" s={14.5} c="mut">Name</Txt>
        <TextInput
          value={name}
          onChangeText={(v) => setEditing({ id: activeId, name: v })}
          testID="semester-active-name"
          accessibilityLabel="Semester name"
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={() => void rename()}
          style={{ fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 4, borderBottomWidth: 1.4, borderBottomColor: c.ink }}
        />
        <Txt f="serif" s={15.5} c="mut">{semesterLabel({ semesterStart: active.start, semesterEnd: active.end })} · {leftLine}</Txt>
        <Row>
          <Btn small label="Save name" testID="semester-save-name" disabled={!name.trim() || name.trim() === active.name} onPress={() => void rename()} />
        </Row>
        <SemesterRange start={active.start} end={active.end} onChange={(p) => void act.setSemesterRange(active.id, p.semesterStart, p.semesterEnd)} />
      </HandBox> : <Txt f="serif" s={16} c="mut">Reading the term…</Txt>}

      {active && !asking ? <Btn icon="plus" label="Start a new semester" testID="semester-rollover" onPress={() => setAsking(true)} /> : null}
      {active && asking ? <HandBox seed="roll-over" fill={c.card} style={{ padding: 12, gap: 8 }}>
        <Txt f="bold" s={20}>Start a new semester?</Txt>
        <Txt f="serif" s={15.5} c="mut">“{active.name}” is put away whole first: its timetable, attendance, grades and curves, tasks, notes, day marks and focus time are saved with the term, and you can open it below. Then the timetable, tasks, notes, day marks, grades and curves are cleared so the new term starts lean. Subjects and their variants stay — they are what the new term inherits.</Txt>
        <Txt f="bold" s={18}>The new term runs</Txt>
        <SemesterRange start={next.start} end={next.end} onChange={(p) => setNext({ start: p.semesterStart, end: p.semesterEnd })} />
        <Txt f="serif" s={14.5} c="mut">Keep attendance leaves this term’s marks in your records; they fall before the new dates, so Today and Week will not show them.</Txt>
        <Row>
          <Btn small testID="semester-rollover-keep" disabled={busy} label="Keep attendance" onPress={() => void roll(true)} />
          <Btn small kind="ghost" testID="semester-rollover-wipe" disabled={busy} label="Start fresh" onPress={() => void roll(false)} />
          <Btn small kind="ghost" testID="semester-rollover-cancel" disabled={busy} label="Cancel" onPress={() => setAsking(false)} />
        </Row>
      </HandBox> : null}
    </Section>

    <Section title="Earlier semesters">
      {archived.length === 0
        ? <Txt f="serif" s={16} c="mut">No earlier semesters yet. When you roll this one over it will be kept here.</Txt>
        : <View style={{ gap: 8 }}>{archived.map((r) => <PastTerm key={r.id} row={r} />)}</View>}
    </Section>
  </>);
}

/** An earlier term: its name and range, and — on a tap — what it amounted to. Read-only by design. */
function PastTerm({ row }: { row: SemesterRow }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const sum = useMemo(() => { const env = row.snapshotJson ? readSnapshot(row.snapshotJson) : null; return env ? termSummary(env) : null; }, [row.snapshotJson]);
  const label = semesterLabel({ semesterStart: row.start, semesterEnd: row.end });
  return (
    <HandBox seed={`past-${row.id}`} shadow={false} fill={c.card} style={{ padding: 10, gap: 2 }}>
      <Pressable
        accessibilityRole="button" accessibilityState={{ expanded: open, disabled: !sum }} accessibilityLabel={`${row.name}, ${label}${sum ? (open ? ', hide its summary' : ', show its summary') : ''}`}
        testID={`semester-past-${row.id}`} disabled={!sum} onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt f="bold" s={20} numberOfLines={1}>{row.name}</Txt>
          <Txt f="serif" s={15} c="mut">{label}</Txt>
        </View>
        {sum ? <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chevron" size={18} color={c.mut} /></View> : null}
      </Pressable>
      {!sum ? <Txt f="serif" s={14} c="mut">{row.snapshotJson ? 'The saved copy of this term could not be read.' : 'No copy of this term was kept.'}</Txt> : null}
      {sum ? <Reveal open={open}>
        <View style={{ gap: 2, paddingTop: 6 }}>
          {sum.subjects.length === 0 ? <Txt f="serif" s={15} c="mut">No subjects in this term.</Txt> : sum.subjects.map((x, i) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 4, borderTopWidth: i ? 1 : 0, borderColor: c.rule }}>
              <Txt f="bold" s={18} numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{x.name}</Txt>
              <Txt f="type" s={13} c="mut">{[x.average === null ? '—' : `${Math.round(x.average)}%`, x.held ? `here ${x.here}/${x.held}` : '', x.tasks ? `tasks ${x.tasksDone}/${x.tasks}` : ''].filter(Boolean).join(' · ')}</Txt>
            </View>
          ))}
          <Txt f="serif" s={14.5} c="mut" style={{ marginTop: 4 }}>{[`${sum.tasksDone} of ${plural(sum.tasks, 'task')} done`, sum.focusMin ? `${Math.round(sum.focusMin / 6) / 10} h of focus` : '', sum.notes ? plural(sum.notes, 'note') : ''].filter(Boolean).join(' · ')}</Txt>
        </View>
      </Reveal> : null}
    </HandBox>
  );
}
