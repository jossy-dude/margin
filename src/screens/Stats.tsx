import React, { useMemo, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Chip, HandBox, HStrip, Row, Txt } from '../ui/kit';
import { CalHeat, Figures, Headline, HourBars, MarkLine, Quiet, Sheet, SubjectBars } from '../ui/stats/parts';
import { Scrap } from '../ui/mascot/Scrap';
import { subjectTint } from '../ui/collage/tint';
import { useNow, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { useStore } from '../store/store';
import { HEAT_CELL_H } from '../ui/fit';
import { Page, statusColor } from './common';
import * as A from '../domain/analytics';
import { fmtDur, plural, startOfDay } from '../domain/time';
import { statusLabel } from '../domain/attendance';
import { hexA } from '../tokens/theme';

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

export function StatsScreen() {
  const focus = useStore((s) => s.focus), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), plan = useStore((s) => s.plan), hour12 = useStore((s) => s.settings.hour12);
  const { c, tints } = useTheme(), { width } = useWindowDimensions();
  const live = useScreenLive(), now = useNow(live ? 60_000 : 0), iw = width - 32 - 32, [gc, setGc] = useState<string | null>(null);
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
    const rows = A.attendanceByCourse(courses, meetings, attendance, dayMarks, 28, now);
    return { rows, totals: A.attendanceTotals(rows), heat: A.attendanceHeat(courses, meetings, attendance, dayMarks, 28, now) };
  }, [courses, meetings, attendance, dayMarks, now]);
  const { ot, fs, ds, bySub, gb, hours, fh, series } = data;
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
    <Page title="Stats" sub={nothing ? 'Fills in as you use the app' : 'This week, and the weeks behind it'}>
      {nothing ? (
        <HandBox seed="stats-empty" fill={c.card} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Scrap size={84} mood="curious" awake={live} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt f="bold" s={20}>Nothing to report — yet</Txt>
            <Txt f="serif" s={15.5} c="mut">{hint ?? 'Mark a class, finish a task or run a focus session, and this page starts telling you how the term is going.'}</Txt>
          </View>
        </HandBox>
      ) : (
        <Headline line={headline} figures={[
          { k: 'Focus this week', v: fmtDur(wk.week), sub: wk.change === null ? (wk.prev ? undefined : 'nothing last week') : `${wk.change >= 0 ? '+' : '−'}${Math.round(Math.abs(wk.change) * 100)}% on last week` },
          { k: 'Attendance', v: att.totals.rate === null ? '—' : `${Math.round(att.totals.rate * 100)}%`, sub: att.totals.held ? `${att.totals.here} of ${att.totals.held}, 4 weeks` : 'no classes yet' },
          { k: 'On time', v: ot.pct === null ? '—' : `${Math.round(ot.pct * 100)}%`, sub: ot.total ? `${ot.onTime} of ${plural(ot.total, 'task')}` : 'no due dates yet' },
        ]} />
      )}

      <Sheet i={0} seed="st-att" kicker="Attendance · last 4 weeks" title="Are you showing up?" line={A.attendanceLine(att.totals, 28)}>
        {att.heat.length === 0 ? <Quiet text="No classes in the timetable yet." /> : (<>
          {att.rows.map((r) => {
            const strip = att.heat.find((h) => h.course.id === r.course.id);
            return (
              <View key={r.course.id} style={{ gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: tint(r.course.id), borderWidth: 1, borderColor: hexA(c.ink, 0.3) }} />
                  <Txt f="hand" s={17} numberOfLines={1} style={{ flex: 1 }}>{r.course.name}</Txt>
                  <Txt f="type" s={16} c={r.rate !== null && r.rate < 0.8 ? 'bad' : 'ink'}>{r.rate === null ? '—' : `${Math.round(r.rate * 100)}%`}</Txt>
                </View>
                {strip ? (
                  <View style={{ flexDirection: 'row', gap: 2 }} accessible accessibilityLabel={`${r.course.name}, each class: ${strip.cells.filter((x) => x.status).map((x) => statusLabel(x.status!, x.why)).join(', ') || 'none marked yet'}`}>
                    {strip.cells.map((x) => {
                      const col = statusColor(x.status, c, x.why);
                      return <View key={x.date} style={{ flex: 1, height: HEAT_CELL_H * 0.8, borderRadius: 2, backgroundColor: x.status ? hexA(col, x.inferred ? 0.4 : 0.85) : x.cls ? hexA(c.ink, 0.12) : 'transparent', borderWidth: x.cls && !x.status ? 1 : 0, borderColor: hexA(c.ink, 0.2) }} />;
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
          <Row style={{ gap: 12, flexWrap: 'wrap' }}>{[[c.ink, 'here'], [c.warn, 'late'], [c.bad, 'absent'], [c.ok, 'sick'], [c.mut, 'cancelled']].map(([col, l]) => <Row key={l} style={{ gap: 4 }}><View style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: hexA(col as string, 0.85) }} /><Txt f="serif" s={13} c="mut">{l}</Txt></Row>)}</Row>
        </>)}
      </Sheet>

      <Sheet i={1} seed="st-work" kicker={`Tasks · last ${WEEKS} weeks`} title="Are you on top of work?" line={A.tasksLine(ot, totalDone)}>
        <Figures items={[
          { k: 'finished', v: String(totalDone) },
          { k: 'on time', v: ot.total ? `${ot.onTime}/${ot.total}` : '—', tone: 'ok' },
          { k: 'late', v: String(ot.late), tone: ot.late ? 'bad' : undefined },
          { k: 'day streak', v: `${ds.current}`, },
        ]} />
        {totalDone ? <CalHeat days={days} values={doneD} w={iw} tone={c.ok} unit=" tasks" /> : <Quiet text="Tick a task off and the calendar starts filling in." />}
      </Sheet>

      <Sheet i={2} seed="st-focus" kicker={`Focus · last ${WEEKS} weeks`} title="Where does your study time go?" line={A.focusLine(totalMin, bySub)}>
        {bySub.length ? <SubjectBars w={iw} fmt={fmtDur} rows={bySub.slice(0, 7).map((s) => ({ id: s.id, name: s.id === '_' ? 'Not filed under a subject' : s.name, value: s.min, tint: tint(s.id) }))} /> : <Quiet text="Start a focus session for a subject and it shows up here." />}
        {totalMin ? <CalHeat days={days} values={focusD} w={iw} tone={c.acc} unit=" min of focus" /> : null}
        {totalMin ? <Figures items={[{ k: 'this week', v: fmtDur(wk.week) }, { k: 'last week', v: fmtDur(wk.prev) }, { k: 'day streak', v: `${fs.current}` }, { k: 'best streak', v: `${fs.best}` }]} /> : null}
      </Sheet>

      <Sheet i={3} seed="st-hours" kicker="By hour of day" title="When do you work best?" line={A.hoursLine(at(fPeak), at(dPeak))}>
        {fPeak === null && dPeak === null ? <Quiet text="After a few sessions and finished tasks, your best hours show up here." /> : (<>
          {fPeak !== null ? <View style={{ gap: 4 }} accessible accessibilityLabel={`Focus by hour, peak around ${at(fPeak)}`}><Txt f="bold" s={15}>Focus</Txt><HourBars values={fh} w={iw} tone={c.acc} ticks={ticks} /></View> : null}
          {dPeak !== null ? <View style={{ gap: 4 }} accessible accessibilityLabel={`Tasks finished by hour, peak around ${at(dPeak)}`}><Txt f="bold" s={15}>Tasks finished</Txt><HourBars values={hours} w={iw} tone={c.ok} ticks={ticks} /></View> : null}
        </>)}
      </Sheet>

      <Sheet i={4} seed="st-grades" kicker="Grades · weighted totals" title="How are your grades?" line={A.gradesLine(gb)}>
        {graded.length ? <SubjectBars w={iw} max={100} fmt={(v) => `${Math.round(v)}`} rows={graded.map((g) => ({ id: g.id, name: g.name, value: g.total as number, tint: tint(g.id), goal: g.goal, note: g.goal != null ? `goal ${g.goal}` : undefined }))} /> : <Quiet text="No marks yet. Add one from the + and it shows up here." />}
        {courses.length ? (<>
          <Txt f="bold" s={17} style={{ marginTop: 4 }}>Mark history</Txt>
          <HStrip gap={8} bg={c.card}>{courses.map((x) => <Chip key={x.id} label={x.name} small on={gCourse === x.id} onPress={() => setGc(x.id)} />)}</HStrip>
          {series.length ? <MarkLine w={iw} values={series.map((s) => s.score)} labels={series.map((s) => s.name)} scale={scale} goal={gCourseRow?.goal ?? null} /> : <Quiet text={`No scored marks for ${gCourseRow?.name ?? 'this subject'} yet.`} />}
        </>) : null}
      </Sheet>

      <View style={{ paddingHorizontal: 4, gap: 2 }}>
        <Txt f="bold" s={16}>Reminders</Txt>
        <Txt f="serif" s={14.5} c="mut">{plan ? `${plan.count} scheduled in the next 14 days${plan.shifted ? ` · ${plan.shifted} moved to stay out of class or quiet hours` : ''}${plan.deferred ? ` · ${plan.deferred} waiting for the queue to free up` : ''}` : 'Not planned yet'}</Txt>
      </View>
    </Page>
  );
}
