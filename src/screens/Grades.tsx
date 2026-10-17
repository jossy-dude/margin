import React, { useCallback, useMemo, useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Btn, HandBox, HStrip, Icon, Row, Stepper, Txt } from '../ui/kit';
import { useNow, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, useStore } from '../store/store';
import { AttCell, Empty, Page, Section, spokenStatus } from './common';
import { fx } from '../services/fx';
import { total, needed, letter } from '../domain/grades';
import { effective, nextStatus, occKey, occurrencesBetween, attendanceRate } from '../domain/attendance';
import { DW, atTime, parseYmd, startOfDay, ymd, fmtDay, fmtTime } from '../domain/time';
import type { Course } from '../domain/types';

function AttendanceGrid({ course }: { course: Course }) {
  const locked = useStore((s) => s.settings.lockAttendance), semesterStart = useStore((s) => s.settings.semesterStart), hour12 = useStore((s) => s.settings.hour12), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks);
  /* The grid's own clock, frozen while this page is not the one on screen (audit M5) — an inferred
     "Here" only appears once a class has ended, so the tick is only useful under the finger. */
  const live = useScreenLive();
  const { c } = useTheme(), now = useNow(live ? 60_000 : 0), sem = parseYmd(semesterStart).getTime();
  const occ = useMemo(() => occurrencesBetween(sem, startOfDay(now) + 7 * 86_400_000, meetings.filter((m) => m.courseId === course.id)), [sem, now, meetings, course.id]);
  const rate = attendanceRate(occ, attendance, dayMarks, now), pulseKey = Object.keys(attendance).length;
  /* Scroll to the newest cell when the grid's content grows (new class weeks coming into range).
     An inline `ref` callback used to call scrollToEnd on EVERY render of this grid — the ref was
     detached and re-attached each time — which made every store write force a scroll here. */
  const gridRef = useRef<ScrollView>(null);
  const toEnd = useCallback(() => { gridRef.current?.scrollToEnd({ animated: false }); }, []);
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Txt f="bold" s={19}>Attendance {rate.rate === null ? '' : `· ${Math.round(rate.rate * 100)}%`}</Txt>
        <Btn small kind={locked ? 'ink' : 'ghost'} icon={locked ? 'lock' : 'unlock'} label={locked ? 'Locked' : 'Lock'} a11y={locked ? 'Unlock attendance grid' : 'Lock attendance grid'} onPress={() => { act.setSettings({ lockAttendance: !locked }); fx.toggle(!locked); }} quiet />
      </Row>
      <Txt f="serif" s={14} c="mut">{locked ? 'Locked: nothing can change by accident.' : 'Tap an empty cell once to mark it. After that, long-press to change.'}</Txt>
      {occ.length === 0 ? <Txt f="serif" s={16} c="mut">No classes scheduled yet.</Txt> : (
        <HStrip ref={gridRef} gap={3} bg={c.card} contentStyle={{ paddingVertical: 6 }} accessibilityLabel={`${course.name} attendance, ${occ.length} classes`} onContentSizeChange={toEnd}>
          {occ.map(({ date, meeting }) => {
            const e = effective(date, meeting, attendance, dayMarks, now), key = occKey(ymd(date), meeting), label = `${DW[(date.getDay() + 6) % 7]} ${date.getDate()}, ${fmtTime(atTime(date.getTime(), meeting.start), hour12)}, ${spokenStatus(e)}`;
            return <AttCell key={key} testID={`att-cell-${key}`} status={e.status} inferred={e.inferred} future={!e.status} locked={locked} label={label} pulse={pulseKey}
              onTap={() => act.setAtt(key, e.status && e.inferred ? nextStatus(e.status) : 'p')} onHold={() => act.open({ t: 'status', mode: 'class', key, title: `${course.name} · ${fmtDay(date.getTime(), now)}`, date: ymd(date) })} />;
          })}
        </HStrip>)}
      <Row style={{ gap: 12 }}>{[['✓', 'here', c.ink], ['L', 'late', c.warn], ['✕', 'absent', c.bad], ['S', 'sick', c.ok], ['–', 'cancelled', c.mut]].map(([g, l, col]) => <Txt key={l} f="serif" s={13.5} c="mut"><Txt f="marker" s={14} c={col}>{g}</Txt> {l}</Txt>)}</Row>
    </View>
  );
}
export function GradesScreen() {
  const courses = useStore((s) => s.courses), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), semesterStart = useStore((s) => s.settings.semesterStart);
  const st = { courses, marks, adjusts };
  const { c } = useTheme();
  const rows = st.courses.map((course) => { const marks = st.marks.filter((m) => m.courseId === course.id).sort((a, b) => a.sort - b.sort), adj = st.adjusts[course.id] ?? 0, tot = total(marks, adj); return { course, marks, adj, tot, need: course.goal ? needed(marks, course.goal, adj) : null }; });
  const scored = rows.filter((r) => r.tot !== null), avg = scored.length ? scored.reduce((a, r) => a + (r.tot as number), 0) / scored.length : null;
  return (
    <Page title="Grades" sub={avg === null ? 'Add marks to see your average' : `Average ${avg.toFixed(1)}% · ${letter(avg)}`} right={<Btn small kind="ghost" icon="plus" a11y="Add subject" onPress={() => act.open({ t: 'course' })} />}>
      {rows.length === 0 && <Empty icon="grad" text="No subjects yet. Add one to start tracking marks and attendance." />}
      {rows.map(({ course, marks, adj, tot, need }) => (
        <HandBox key={course.id} seed={course.id} style={{ padding: 14, gap: 10 }}>
          <Pressable onPress={() => act.open({ t: 'course', id: course.id })} accessibilityRole="button" accessibilityLabel={`${course.name}. Edit subject.`} onLongPress={() => act.open({ t: 'meeting', courseId: course.id })}>
            <Row style={{ flexWrap: 'nowrap' }}>
              <View style={{ flex: 1 }}><Txt f="marker" s={24} numberOfLines={2}>{course.name}</Txt><Txt f="serif" s={15} c="mut">{[course.room, course.teacher].filter(Boolean).join(' · ') || 'Tap to add room and teacher'}</Txt></View>
              <View style={{ alignItems: 'center', minWidth: 74 }}><Txt f="marker" s={34} c={tot !== null && course.goal && tot < course.goal ? 'warn' : 'ink'}>{tot === null ? '—' : Math.round(tot)}</Txt><Txt f="bold" s={17} c="mut">{letter(tot)}</Txt></View>
            </Row>
          </Pressable>
          {course.goal ? <Txt f="bold" s={17} c={need && !need.feasible ? 'bad' : need?.reached ? 'ok' : 'mut'}>{need === null ? `Goal ${course.goal}% ${tot !== null && tot >= course.goal ? 'reached' : '— everything is marked'}` : need.reached ? `Goal ${course.goal}% already safe` : need.feasible ? `For ${course.goal}%: average ${Math.ceil(need.need)}% on the remaining ${need.weightLeft}%` : `Goal ${course.goal}% is out of reach (${Math.round(need.need)}% needed)`}</Txt> : null}
          <View style={{ gap: 8 }}>
            {marks.map((m) => (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${m.name}, ${m.score === null ? 'not marked' : m.score + ' percent'}, weight ${m.weight}${m.on ? '' : ', not counted'}. Edit.`} onPress={() => act.open({ t: 'mark', courseId: course.id, id: m.id })} android_ripple={{ color: c.rule }}>
                <Row style={{ flexWrap: 'nowrap', minHeight: 40 }}><Txt f="bold" s={20} style={{ flex: 1, textDecorationLine: m.on ? 'none' : 'line-through', color: m.on ? c.ink : c.mut }}>{m.name}</Txt><Txt f="serif" s={15} c="mut">{m.weight}%</Txt>
                  <View style={{ minWidth: 62, alignItems: 'flex-end' }}>{m.score === null ? <Txt f="serif" s={16} c="mut">to do</Txt> : <Txt f="marker" s={20}>{m.score}</Txt>}</View></Row>
              </Pressable>))}
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Btn small kind="ghost" icon="plus" label="Mark" onPress={() => act.open({ t: 'mark', courseId: course.id })} /><Row style={{ flexWrap: 'nowrap', gap: 6 }}><Txt f="serif" s={14} c="mut">curve</Txt><Stepper label="curve" value={adj} min={-20} max={20} fmt={(v) => (v > 0 ? `+${v}` : String(v))} onChange={(v) => act.setAdjust(course.id, v)} /></Row></Row>
          </View>
          <AttendanceGrid course={course} />
        </HandBox>))}
      {rows.length > 0 && <Section title="Semester"><Row><Icon name="clock" size={18} color={c.mut} /><Txt f="serif" s={16} c="mut">Attendance counts from {semesterStart}. Change it in Settings → Attendance.</Txt></Row></Section>}
    </Page>
  );
}
