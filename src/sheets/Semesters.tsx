import React, { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Btn, HandBox, Row, Txt } from '../ui/kit';
import { Section } from '../screens/common';
import { SemesterRange } from '../ui/SemesterRange';
import { activeSemester, daysLeft, semesterLabel } from '../domain/semester';
import { plural } from '../domain/time';
import { act, useStore } from '../store/store';
import { useTheme } from '../ui/theme-context';
import { FONT } from '../tokens/theme';

/**
 * The terms, one active and the rest kept.
 *
 * v0.9 made the semester a row rather than a pair of settings, and this is the page where that row can
 * be seen and changed. It answers the three questions the old Attendance control could not: which term
 * is running (name, range and days left), what came before, and how to move on — with the archive's
 * keep-attendance choice stated before anything is cleared.
 *
 * Archived terms are shown, not opened: their snapshot is stored whole (`domain/archive.ts`) and the
 * reader for it is `readSnapshot`, but a history browser is a later screen. Saying "snapshot kept" is
 * still the honest difference between a term the app can show again and one it cannot.
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
  const roll = async (keep: boolean) => { setBusy(true); await act.rollOverSemester(keep); setBusy(false); setAsking(false); };

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
        <Txt f="serif" s={15.5} c="mut">“{active.name}” is archived first: its timetable, subjects, attendance, grades and tasks are saved into the term itself. The timetable, tasks, notices and grades are then cleared so Today and Week start the new term lean. Subjects stay — they are what the new term inherits.</Txt>
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
        : <View style={{ gap: 8 }}>{archived.map((r) => (
          <HandBox key={r.id} seed={`past-${r.id}`} shadow={false} fill={c.card} style={{ padding: 10, gap: 2 }}>
            <Txt f="bold" s={20}>{r.name}</Txt>
            <Txt f="serif" s={15} c="mut">{semesterLabel({ semesterStart: r.start, semesterEnd: r.end })}</Txt>
            <Txt f="serif" s={14} c="mut">{r.snapshotJson ? 'Snapshot kept with this term' : 'No snapshot was taken'}</Txt>
          </HandBox>
        ))}</View>}
    </Section>
  </>);
}
