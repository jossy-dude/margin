import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Chip, HandBox, HStrip, Txt } from '../ui/kit';
import { CalHeat, Figures, Headline, HourBars, MarkLine, Quiet, Sheet, SubjectBars } from '../ui/stats/parts';
import { OnTop, ShowingUp } from '../ui/stats/sections';
import { emptyFace, pageFace } from '../ui/mascot/moments';
import { subjectTint } from '../ui/collage/tint';
import { useTheme } from '../ui/theme-context';
import { useLiveNow } from '../ui/live';
import { act, useStore } from '../store/store';
import { LiveFace, Page } from './common';
import * as A from '../domain/analytics';
import type { ClassMove } from '../domain/moves';
import { fmtDur, startOfDay } from '../domain/time';

const NO_MOVES: ClassMove[] = [];

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * Stats, as a report (owner, collage pass: "the stats are useful but not shown properly"). Three figures and
 * one sentence at the top; then one sheet per question — Are you showing up? Are you on top of work? Where
 * does your study time go? When do you work best? How are your grades? — each answered in a sentence built
 * from the numbers (domain/analytics, tested), then the evidence.
 *
 * Cost: the page is mounted once and kept. Data-only derivations are memoised on the data; the day series on
 * the DAY; the attendance ones on `now`, because a class that has ended counts as "here" (BUG-014's rules).
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const WEEKS = 15;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function StatsScreen() {
  const variants = useStore((s) => s.variants), moves = useStore((s) => s.settings.moves) ?? NO_MOVES, focus = useStore((s) => s.focus), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), hour12 = useStore((s) => s.settings.hour12);
  const { c, tints } = useTheme(), { width } = useWindowDimensions();
  const now = useLiveNow(60_000), iw = width - 32 - 32, [gc, setGc] = useState<string | null>(null);
  const day = startOfDay(now);
  const days = useMemo(() => A.lastDays(WEEKS * 7, day), [day]);
  const focusD = useMemo(() => A.focusMinutesByDay(focus, days), [focus, days]), doneD = useMemo(() => A.doneByDay(tasks, days), [tasks, days]);
  const gCourse = gc ?? courses.find((x) => marks.some((m) => m.courseId === x.id && m.score !== null))?.id ?? courses[0]?.id ?? '';
  const data = useMemo(() => ({
    ot: A.onTimeStats(tasks), fs: A.streak(focusD), ds: A.streak(doneD),
    bySub: A.focusBySubject(focus, courses, days.length ? new Date(`${days[0]}T00:00:00`).getTime() : -Infinity), gb: A.gradeBars(courses, marks, adjusts),
    hours: A.doneByHour(tasks), fh: A.focusByHour(focus), series: A.markSeries(gCourse, marks),
  }), [tasks, focus, courses, marks, adjusts, gCourse, focusD, doneD, days]);
  const att = useMemo(() => {
    const rows = A.attendanceByCourse(courses, meetings, attendance, dayMarks, 28, now, moves);
    const subjects = rows.map((r) => ({ course: r.course, rate: r.rate, here: r.here, held: r.held, canMiss: A.canMiss(r.here, r.held), parts: A.attendanceByPart(r.course, meetings, variants ?? [], attendance, dayMarks, 28, now, moves), dots: A.classDots(r.course.id, meetings, attendance, dayMarks, 28, now, moves) }))
      .sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2) || a.course.name.localeCompare(b.course.name));
    return { rows, totals: A.attendanceTotals(rows), b: A.attendanceBreakdown(meetings.filter((m) => courses.some((x) => x.id === m.courseId)), attendance, dayMarks, 28, now, moves), subjects };
  }, [courses, meetings, attendance, dayMarks, now, variants, moves]);
  const { ot, fs, ds, bySub, gb, hours, fh, series } = data;
  const work = useMemo(() => A.workNow(tasks, now), [tasks, now]);
  const todayWd = (new Date(day).getDay() + 6) % 7, weekly = A.weeklySums(doneD, 8, todayWd);
  const weekLabels = weekly.map((_, i) => { const d = new Date(day - (todayWd + 7 * (weekly.length - 1 - i)) * 86_400_000); return `${d.getDate()} ${MON[d.getMonth()]}`; });
  const wk = A.weekOverWeek(focusD), totalMin = focusD.reduce((a, b) => a + b, 0), totalDone = doneD.reduce((a, b) => a + b, 0);
  const fPeak = A.peakHour(fh), dPeak = A.peakHour(hours), at = (h: number | null) => (h === null ? null : A.hourTick(h, hour12));
  const hint = A.statsEmptyHint({ focusMinutes: totalMin, finished: totalDone });
  const nothing = totalMin === 0 && totalDone === 0 && att.totals.held === 0 && gb.every((g) => g.total === null);
  const headline = A.statsHeadline({ focus: wk, done: { week: doneD.slice(-7).reduce((a, b) => a + b, 0) }, att: att.totals, onTime: ot, streak: fs.current });
  const tint = (id: string) => (id === '_' ? c.card : subjectTint(id, tints));
  const ticks = [0, 6, 12, 18, 23].map((h) => ({ h, label: A.hourTick(h === 23 ? 0 : h, hour12) })).slice(0, 4).concat([{ h: 23, label: hour12 ? '12 AM' : '24:00' }]);
  const gCourseRow = courses.find((x) => x.id === gCourse), scale = A.markScale(series.map((s) => s.score), gCourseRow?.goal ?? null);
  const graded = gb.filter((g) => g.total !== null);

  return (
    <Page face={nothing ? null : pageFace('Stats', { hour: new Date().getHours() })} title="Stats" sub={nothing ? 'Fills in as you use the app' : undefined}>
      {nothing ? (
        <HandBox seed="stats-empty" fill={c.card} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <LiveFace name={emptyFace('statsNothingYet') ?? 'wink'} size={64} decorative />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt f="bold" s={20}>Nothing to report — yet</Txt>
            <Txt f="serif" s={15.5} c="mut">{hint ?? 'Mark a class, finish a task or run a focus session, and this page starts telling you how the term is going.'}</Txt>
          </View>
        </HandBox>
      ) : (
        <Headline line={headline} figures={[
          { k: 'Focus', v: fmtDur(wk.week), sub: wk.change === null ? undefined : `${wk.change >= 0 ? '+' : '−'}${Math.round(Math.abs(wk.change) * 100)}% vs last week` },
          { k: 'Attendance', v: att.totals.rate === null ? '—' : `${Math.round(att.totals.rate * 100)}%`, sub: att.totals.held ? `${att.totals.here}/${att.totals.held}` : undefined },
          { k: 'On time', v: ot.pct === null ? '—' : `${Math.round(ot.pct * 100)}%`, sub: ot.total ? `${ot.onTime}/${ot.total}` : undefined },
        ]} />
      )}

      <Sheet i={0} seed="st-att" title="Attendance">
        {att.rows.length === 0 ? <Quiet text="No classes in the timetable yet." /> : att.totals.held + att.b.cancelled === 0 ? <Quiet text="No class has been held in the last four weeks." /> : <ShowingUp b={att.b} rows={att.subjects} tint={tint} />}
      </Sheet>

      <Sheet i={1} seed="st-work" title="Work">
        <OnTop now={work} ot={ot} weeks={weekly} weekLabels={weekLabels} streak={ds.current} onOpen={() => act.go('Tasks')} />
      </Sheet>

      <Sheet i={2} seed="st-focus" title="Study time">
        {bySub.length ? <SubjectBars w={iw} fmt={fmtDur} rows={bySub.slice(0, 7).map((s) => ({ id: s.id, name: s.id === '_' ? 'No subject' : s.name, value: s.min, tint: tint(s.id) }))} /> : <Quiet text="No focus sessions yet." />}
        {totalMin ? <CalHeat days={days} values={focusD} w={iw} tone={c.acc} unit=" min of focus" /> : null}
        {totalMin ? <Figures items={[{ k: 'day streak', v: `${fs.current}` }, { k: 'best', v: `${fs.best}` }]} /> : null}
      </Sheet>

      <Sheet i={3} seed="st-hours" title="Best hours">
        {fPeak === null && dPeak === null ? <Quiet text="Shows after a few sessions." /> : (<>
          {fPeak !== null ? <View style={{ gap: 4 }} accessible accessibilityLabel={`Focus by hour, peak around ${at(fPeak)}`}><Txt f="bold" s={15}>Focus</Txt><HourBars values={fh} w={iw} tone={c.acc} ticks={ticks} /></View> : null}
          {dPeak !== null ? <View style={{ gap: 4 }} accessible accessibilityLabel={`Tasks finished by hour, peak around ${at(dPeak)}`}><Txt f="bold" s={15}>Tasks finished</Txt><HourBars values={hours} w={iw} tone={c.ok} ticks={ticks} /></View> : null}
        </>)}
      </Sheet>

      <Sheet i={4} seed="st-grades" title="Grades">
        {graded.length ? <SubjectBars w={iw} max={100} fmt={(v) => `${Math.round(v)}`} rows={graded.map((g) => ({ id: g.id, name: g.name, value: g.total as number, tint: tint(g.id), goal: g.goal, note: g.goal != null ? `goal ${g.goal}` : undefined }))} /> : <Quiet text="No marks yet." />}
        {courses.length ? (<>
          <Txt f="bold" s={17} style={{ marginTop: 4 }}>History</Txt>
          <HStrip gap={8} bg={c.card}>{courses.map((x) => <Chip key={x.id} label={x.name} small on={gCourse === x.id} onPress={() => setGc(x.id)} />)}</HStrip>
          {series.length ? <MarkLine w={iw} values={series.map((s) => s.score)} labels={series.map((s) => s.name)} scale={scale} goal={gCourseRow?.goal ?? null} /> : <Quiet text={`No scored marks for ${gCourseRow?.name ?? 'this subject'} yet.`} />}
        </>) : null}
      </Sheet>

    </Page>
  );
}
