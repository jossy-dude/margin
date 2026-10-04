import React, { useMemo, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Chip, HandBox, Row, Txt } from '../ui/kit';
import { Heatmap, HBars, Hist24, Line2, Ring } from '../ui/charts';
import { useNow, useTheme } from '../ui/theme-context';
import { useStore } from '../store/store';
import { Empty, Page, Section } from './common';
import * as A from '../domain/analytics';
import { fmtDur, parseYmd, weekdayOf, addDays, startOfDay } from '../domain/time';
import { ST } from '../domain/attendance';
import { hexA } from '../tokens/theme';

const Card = ({ title, sub, children, seed }: { title: string; sub?: string; children: React.ReactNode; seed: string }) => (
  <HandBox seed={seed} style={{ padding: 14, gap: 8 }}><View><Txt f="bold" s={22} accessibilityRole="header">{title}</Txt>{sub ? <Txt f="serif" s={14.5} c="mut">{sub}</Txt> : null}</View>{children}</HandBox>
);
export function StatsScreen() {
  const focus = useStore((s) => s.focus), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), plan = useStore((s) => s.plan);
  const st = { focus, tasks, courses, meetings, attendance, dayMarks, marks, adjusts, plan };
  const { c } = useTheme(), { width } = useWindowDimensions(), now = useNow(60_000), iw = width - 32 - 28, [gc, setGc] = useState<string | null>(null);
  const days = useMemo(() => A.lastDays(105, now), [now]), start = weekdayOf(parseYmd(days[0] as string));
  const focusD = useMemo(() => A.focusMinutesByDay(st.focus, days), [st.focus, days]), doneD = useMemo(() => A.doneByDay(st.tasks, days), [st.tasks, days]);
  const ot = A.onTimeStats(st.tasks), att = A.overallAttendance(st.courses, st.meetings, st.attendance, st.dayMarks, 30, now), fs = A.streak(focusD), ds = A.streak(doneD);
  const week = focusD.slice(-7).reduce((a, b) => a + b, 0), prev = focusD.slice(-14, -7).reduce((a, b) => a + b, 0), totalMin = focusD.reduce((a, b) => a + b, 0), totalDone = doneD.reduce((a, b) => a + b, 0);
  const bySub = A.focusBySubject(st.focus, st.courses), attRows = A.attendanceByCourse(st.courses, st.meetings, st.attendance, st.dayMarks, 60, now), attHeat = A.attendanceHeat(st.courses, st.meetings, st.attendance, st.dayMarks, 28, now), gb = A.gradeBars(st.courses, st.marks, st.adjusts);
  const gCourse = gc ?? st.courses[0]?.id ?? '', series = A.markSeries(gCourse, st.marks), hours = A.doneByHour(st.tasks), fh = A.focusByHour(st.focus), nothing = st.focus.length === 0 && st.tasks.every((t) => t.status !== 2);
  const bestH = (h: number[]) => { const m = Math.max(...h); return m ? `${String(h.indexOf(m)).padStart(2, '0')}:00` : null; };
  const lateWeeks = st.tasks.filter((t) => t.status === 2 && t.completedAt && t.dueAt && t.completedAt > t.dueAt).length;
  return (
    <Page title="Stats" sub="Everything the app tracks, in one place">
      {nothing && <Empty icon="stats" text="Finish a task or a focus session and the charts fill in." />}
      <Card seed="rings" title="At a glance" sub="Attendance is the last 30 days">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          <Ring value={att.rate} label="Attendance" sub={`${att.here}/${att.held} classes`} />
          <Ring value={ot.pct} label="On time" sub={`${ot.onTime}/${ot.total} tasks`} />
          <Ring value={Math.min(1, week / 300)} label="Focus week" sub={`${fmtDur(week)} of 5h`} />
          <Ring value={Math.min(1, fs.current / 7)} label="Focus streak" sub={`${fs.current} d · best ${fs.best}`} />
        </ScrollView>
        <Txt f="serif" s={15.5} c="mut">{ot.avgLeadHours !== null ? `You finish on-time tasks about ${ot.avgLeadHours < 24 ? Math.round(ot.avgLeadHours) + ' h' : Math.round(ot.avgLeadHours / 24) + ' days'} before they are due. ` : ''}{prev ? `Focus is ${week >= prev ? 'up' : 'down'} ${Math.abs(Math.round(((week - prev) / prev) * 100))}% on last week. ` : ''}{lateWeeks ? `${lateWeeks} finished late.` : ''}</Txt>
      </Card>
      <Card seed="fheat" title="Focus heatmap" sub={`${fmtDur(totalMin)} in the last 15 weeks`}><Heatmap values={focusD} w={iw} startWd={start} unit=" min" /></Card>
      <Card seed="dheat" title="Tasks finished" sub={`${totalDone} in the last 15 weeks · streak ${ds.current} days`}><Heatmap values={doneD} w={iw} startWd={start} unit=" tasks" /></Card>
      <Card seed="hh" title="When you work best" sub={bestH(fh) ? `Focus peaks around ${bestH(fh)}` : 'Start a focus session to see this'}><Hist24 values={fh} w={iw} /></Card>
      <Card seed="th" title="When you tick things off" sub={bestH(hours) ? `Most tasks are finished around ${bestH(hours)}` : 'Finish a task to see this'}><Hist24 values={hours} w={iw} accent={c.ok} /></Card>
      {bySub.length > 0 && <Card seed="sub" title="Focus by subject"><HBars items={bySub.slice(0, 6).map((s) => ({ label: s.name, value: s.min }))} w={iw} fmt={fmtDur} /></Card>}
      <Card seed="att" title="Attendance by subject" sub="Last 60 days">
        {attRows.length === 0 ? <Txt f="serif" s={16} c="mut">No classes yet.</Txt> : <HBars items={attRows.map((r) => ({ label: r.course.name, value: Math.round((r.rate ?? 0) * 100) }))} w={iw} fmt={(v) => `${v}%`} max={100} />}
      </Card>
      <Card seed="attheat" title="Attendance, last 4 weeks" sub="One row per subject, oldest to newest">
        {attHeat.length === 0 ? <Txt f="serif" s={16} c="mut">No classes yet, so there is nothing to lay out here.</Txt> : (<>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ gap: 6 }}>{attHeat.map((r) => (
            <View key={r.course.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }} accessible accessibilityLabel={`${r.course.name}: ${r.cells.filter((x) => x.status).map((x) => ST[x.status as keyof typeof ST]).join(', ')}`}>
              <Txt f="serif" s={13} c="mut" style={{ width: 70 }} numberOfLines={1}>{r.course.name}</Txt>
              {r.cells.map((x) => { const col = x.status === 'a' ? c.bad : x.status === 'l' || x.status === 'n' ? c.warn : x.status === 's' ? c.ok : x.status === 'c' || x.status === 't' ? c.mut : c.ink; return <View key={x.date} style={{ width: 11, height: 18, borderRadius: 3, borderWidth: 1, borderColor: hexA(c.ink, x.status ? 0.35 : 0.1), backgroundColor: x.status ? hexA(col, x.inferred ? 0.3 : 0.85) : 'transparent' }} />; })}
            </View>))}</View>
        </ScrollView>
        <Row style={{ gap: 10 }}>{[[c.ink, 'here'], [c.warn, 'late'], [c.bad, 'absent'], [c.ok, 'sick'], [c.mut, 'cancelled']].map(([col, l]) => <Row key={l} style={{ gap: 4 }}><View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: col }} /><Txt f="serif" s={13} c="mut">{l}</Txt></Row>)}</Row>
        </>)}
      </Card>
      <Section title="Grades">
        <Card seed="gb" title="Totals against goals">{gb.filter((g) => g.total !== null).length === 0 ? <Txt f="serif" s={16} c="mut">No marks yet.</Txt> : <HBars items={gb.filter((g) => g.total !== null).map((g) => ({ label: g.name, value: Math.round(g.total as number) }))} w={iw} fmt={(v) => `${v}`} max={100} />}</Card>
        <Card seed="gl" title="Mark history" sub={st.courses.find((x) => x.id === gCourse)?.name}>
          {st.courses.length === 0 ? <Txt f="serif" s={16} c="mut">No subjects yet. Add one to plot its marks.</Txt> : (<>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{st.courses.map((x) => <Chip key={x.id} label={x.name} small on={gCourse === x.id} onPress={() => setGc(x.id)} />)}</ScrollView>
            {series.length ? <Line2 values={series.map((s) => s.score)} labels={series.map((s) => s.name)} w={iw} goal={st.courses.find((x) => x.id === gCourse)?.goal ?? null} /> : <Txt f="serif" s={16} c="mut">No scored marks for this subject.</Txt>}
          </>)}
        </Card>
      </Section>
      <Card seed="rem" title="Reminders" sub="What the app is set to deliver on this phone">
        <Txt f="bold" s={19}>{st.plan ? `${st.plan.count} scheduled in the next 14 days${st.plan.shifted ? ` · ${st.plan.shifted} moved to stay out of class or quiet hours` : ''}${st.plan.deferred ? ` · ${st.plan.deferred} waiting for the queue to free up` : ''}` : 'Not planned yet'}</Txt>
      </Card>
      <View style={{ height: 1 }}>{addDays(startOfDay(now), 0) ? null : null}</View>
    </Page>
  );
}
