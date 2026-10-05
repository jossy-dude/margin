import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Chip, HandBox, HStrip, Row, Txt } from '../ui/kit';
import { Heatmap, HBars, Hist24, Line2, Ring } from '../ui/charts';
import { useNow, useTheme } from '../ui/theme-context';
import { useStore } from '../store/store';
import { Empty, Page, Section } from './common';
import { HEAT_CELL_H, HEAT_GAP, heatRow } from '../ui/fit';
import * as A from '../domain/analytics';
import { fmtDur, parseYmd, plural, startOfDay, weekdayOf } from '../domain/time';
import { ST } from '../domain/attendance';
import { hexA } from '../tokens/theme';

const Card = ({ title, sub, children, seed }: { title: string; sub?: string; children: React.ReactNode; seed: string }) => (
  <HandBox seed={seed} style={{ padding: 14, gap: 8 }}><View><Txt f="bold" s={22} accessibilityRole="header">{title}</Txt>{sub ? <Txt f="serif" s={14.5} c="mut">{sub}</Txt> : null}</View>{children}</HandBox>
);
export function StatsScreen() {
  const focus = useStore((s) => s.focus), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), plan = useStore((s) => s.plan);
  const { c } = useTheme(), { width } = useWindowDimensions(), now = useNow(60_000), iw = width - 32 - 28, [gc, setGc] = useState<string | null>(null);
  /* The attendance heatmap's row geometry is width-derived, so it is recomputed whenever the window is.
     28 equal cells beside a label only fit if the cells are sized from what the card actually has. */
  const heat = heatRow(iw, 28);
  /* Everything below is a full pass over the dataset, so it is split by what it actually depends on.
     `useNow(60_000)` re-renders this screen every minute; keying the day-window work on the *day*
     rather than on `now` is what stops it running 1440 times a day for a window that has not moved.
     The three attendance derivations stay keyed on `now` on purpose: `effective()` infers "Here" once
     a class has ended, so freezing them at midnight would leave a whole day reading as unmarked. */
  const day = startOfDay(now);
  const days = useMemo(() => A.lastDays(105, day), [day]), start = weekdayOf(parseYmd(days[0] as string));
  const focusD = useMemo(() => A.focusMinutesByDay(focus, days), [focus, days]), doneD = useMemo(() => A.doneByDay(tasks, days), [tasks, days]);
  const gCourse = gc ?? courses[0]?.id ?? '';
  const data = useMemo(() => ({
    ot: A.onTimeStats(tasks), fs: A.streak(focusD), ds: A.streak(doneD),
    bySub: A.focusBySubject(focus, courses), gb: A.gradeBars(courses, marks, adjusts),
    hours: A.doneByHour(tasks), fh: A.focusByHour(focus), series: A.markSeries(gCourse, marks),
  }), [tasks, focus, courses, marks, adjusts, gCourse, focusD, doneD]);
  const att = useMemo(() => ({
    overall: A.overallAttendance(courses, meetings, attendance, dayMarks, 30, now),
    rows: A.attendanceByCourse(courses, meetings, attendance, dayMarks, 60, now),
    heat: A.attendanceHeat(courses, meetings, attendance, dayMarks, 28, now),
  }), [courses, meetings, attendance, dayMarks, now]);
  const { ot, fs, ds, bySub, gb, hours, fh, series } = data, attRows = att.rows, attHeat = att.heat, attOverall = att.overall;
  const week = focusD.slice(-7).reduce((a, b) => a + b, 0), prev = focusD.slice(-14, -7).reduce((a, b) => a + b, 0), totalMin = focusD.reduce((a, b) => a + b, 0), totalDone = doneD.reduce((a, b) => a + b, 0);
  const hint = A.statsEmptyHint({ focusMinutes: totalMin, finished: totalDone });
  const bestH = (h: number[]) => { const m = Math.max(...h); return m ? `${String(h.indexOf(m)).padStart(2, '0')}:00` : null; };
  const lateWeeks = useMemo(() => tasks.filter((t) => t.status === 2 && t.completedAt && t.dueAt && t.completedAt > t.dueAt).length, [tasks]);
  return (
    <Page title="Stats" sub="Everything the app tracks, in one place">
      {hint && <Empty icon="stats" text={hint} />}
      <Card seed="rings" title="At a glance" sub="Attendance is the last 30 days">
        <HStrip gap={10} bg={c.card}>
          <Ring value={attOverall.rate} label="Attendance" sub={`${attOverall.here}/${attOverall.held} classes`} />
          <Ring value={ot.pct} label="On time" sub={`${ot.onTime}/${ot.total} tasks`} />
          <Ring value={Math.min(1, week / 300)} label="Focus week" sub={`${fmtDur(week)} of 5h`} />
          <Ring value={Math.min(1, fs.current / 7)} label="Focus streak" sub={`${fs.current} d · best ${fs.best}`} />
        </HStrip>
        <Txt f="serif" s={15.5} c="mut">{ot.avgLeadHours !== null ? `You finish on-time tasks about ${ot.avgLeadHours < 24 ? Math.round(ot.avgLeadHours) + ' h' : Math.round(ot.avgLeadHours / 24) + ' days'} before they are due. ` : ''}{prev ? `Focus is ${week >= prev ? 'up' : 'down'} ${Math.abs(Math.round(((week - prev) / prev) * 100))}% on last week. ` : ''}{lateWeeks ? `${lateWeeks} finished late.` : ''}</Txt>
      </Card>
      <Card seed="fheat" title="Focus heatmap" sub={`${fmtDur(totalMin)} in the last 15 weeks`}><Heatmap values={focusD} w={iw} startWd={start} unit=" min" /></Card>
      <Card seed="dheat" title="Tasks finished" sub={`${totalDone} in the last 15 weeks · streak ${plural(ds.current, 'day')}`}><Heatmap values={doneD} w={iw} startWd={start} unit=" tasks" /></Card>
      <Card seed="hh" title="When you work best" sub={bestH(fh) ? `Focus peaks around ${bestH(fh)}` : 'Start a focus session to see this'}><Hist24 values={fh} w={iw} /></Card>
      <Card seed="th" title="When you tick things off" sub={bestH(hours) ? `Most tasks are finished around ${bestH(hours)}` : 'Finish a task to see this'}><Hist24 values={hours} w={iw} accent={c.ok} /></Card>
      {bySub.length > 0 && <Card seed="sub" title="Focus by subject"><HBars items={bySub.slice(0, 6).map((s) => ({ label: s.name, value: s.min }))} w={iw} fmt={fmtDur} /></Card>}
      <Card seed="att" title="Attendance by subject" sub="Last 60 days">
        {attRows.length === 0 ? <Txt f="serif" s={16} c="mut">No classes yet.</Txt> : <HBars items={attRows.map((r) => ({ label: r.course.name, value: Math.round((r.rate ?? 0) * 100) }))} w={iw} fmt={(v) => `${v}%`} max={100} />}
      </Card>
      <Card seed="attheat" title="Attendance, last 4 weeks" sub="One row per subject, oldest to newest">
        {attHeat.length === 0 ? <Txt f="serif" s={16} c="mut">No classes yet, so there is nothing to lay out here.</Txt> : (<>
        {/* No horizontal ScrollView: 28 equal cells are sized from `iw` so the row fits the card exactly
            (see `heatRow`). It used to be a fixed 70 dp label + 28 × 11 dp cells, which is 434 dp — wider
            than the ~351 dp card — so every subject row's last cell was sliced by the right border, and
            the label was clipped at 70 dp at the same time ("Intro to Ec…"). */}
        <View style={{ gap: 6 }}>{attHeat.map((r) => (
          <View key={r.course.id} style={{ flexDirection: 'row', alignItems: 'center', gap: HEAT_GAP }} accessible accessibilityLabel={`${r.course.name}: ${r.cells.filter((x) => x.status).map((x) => ST[x.status as keyof typeof ST]).join(', ')}`}>
            <Txt f="serif" s={13} c="mut" style={{ width: heat.label }} numberOfLines={1}>{r.course.name}</Txt>
            {r.cells.map((x) => { const col = x.status === 'a' ? c.bad : x.status === 'l' || x.status === 'n' ? c.warn : x.status === 's' ? c.ok : x.status === 'c' || x.status === 't' ? c.mut : c.ink; return <View key={x.date} style={{ width: heat.cell, height: HEAT_CELL_H, borderRadius: 3, borderWidth: 1, borderColor: hexA(c.ink, x.status ? 0.35 : 0.1), backgroundColor: x.status ? hexA(col, x.inferred ? 0.3 : 0.85) : 'transparent' }} />; })}
          </View>))}</View>
        <Row style={{ gap: 10 }}>{[[c.ink, 'here'], [c.warn, 'late'], [c.bad, 'absent'], [c.ok, 'sick'], [c.mut, 'cancelled']].map(([col, l]) => <Row key={l} style={{ gap: 4 }}><View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: col }} /><Txt f="serif" s={13} c="mut">{l}</Txt></Row>)}</Row>
        </>)}
      </Card>
      <Section title="Grades">
        <Card seed="gb" title="Totals against goals">{gb.filter((g) => g.total !== null).length === 0 ? <Txt f="serif" s={16} c="mut">No marks yet.</Txt> : <HBars items={gb.filter((g) => g.total !== null).map((g) => ({ label: g.name, value: Math.round(g.total as number) }))} w={iw} fmt={(v) => `${v}`} max={100} />}</Card>
        <Card seed="gl" title="Mark history" sub={courses.find((x) => x.id === gCourse)?.name}>
          {courses.length === 0 ? <Txt f="serif" s={16} c="mut">No subjects yet. Add one to plot its marks.</Txt> : (<>
            <HStrip gap={8} bg={c.card}>{courses.map((x) => <Chip key={x.id} label={x.name} small on={gCourse === x.id} onPress={() => setGc(x.id)} />)}</HStrip>
            {series.length ? <Line2 values={series.map((s) => s.score)} labels={series.map((s) => s.name)} w={iw} goal={courses.find((x) => x.id === gCourse)?.goal ?? null} /> : <Txt f="serif" s={16} c="mut">No scored marks for this subject.</Txt>}
          </>)}
        </Card>
      </Section>
      <Card seed="rem" title="Reminders" sub="What the app is set to deliver on this phone">
        <Txt f="bold" s={19}>{plan ? `${plan.count} scheduled in the next 14 days${plan.shifted ? ` · ${plan.shifted} moved to stay out of class or quiet hours` : ''}${plan.deferred ? ` · ${plan.deferred} waiting for the queue to free up` : ''}` : 'Not planned yet'}</Txt>
      </Card>
    </Page>
  );
}
