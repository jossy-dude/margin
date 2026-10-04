import React, { useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { ClockFace } from '../ui/clock/ClockFace';
import { DayBar, type BarKind } from '../ui/DayBar';
import { Btn, HandBox, Icon, Tape, Txt } from '../ui/kit';
import { useNow, useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { Empty, Page, Section, STATUS_GLYPH, TaskCard, statusColor, relDue, spokenStatus } from './common';
import { DW, MO, addDays, atTime, fmtDay, fmtTime, mondayOf, startOfDay, weekdayOf, ymd, DAY_MS } from '../domain/time';
import { effective, isCancelled, occKey, occurrencesOn, ST } from '../domain/attendance';
import { hexA } from '../tokens/theme';
import { FS } from '../ui/fit';

export function TodayScreen() {
  /* Narrow selectors: each slice subscribes on its own, so toast/timer/sheet/plan writes no longer
     re-render this whole page — only the slices it actually reads. `st` is rebuilt locally each render. */
  const route = useStore((s) => s.route), settings = useStore((s) => s.settings), meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks), notices = useStore((s) => s.notices);
  const st = { route, settings, meetings, courses, attendance, dayMarks, tasks, notices };
  const { c } = useTheme(), { width } = useWindowDimensions(), now = useNow(st.route === 'Today' ? 30_000 : 60_000), today = startOfDay(now);
  const [sel, setSel] = useState(today), week = mondayOf(sel), selOcc = occurrencesOn(new Date(sel), meetings);
  const todayOcc = occurrencesOn(new Date(today), meetings);
  const periods = todayOcc.map((o) => ({ start: atTime(today, o.meeting.start), end: atTime(today, o.meeting.end), label: st.courses.find((x) => x.id === o.meeting.courseId)?.name ?? '?', cancelled: isCancelled(effective(o.date, o.meeting, st.attendance, st.dayMarks, now)) }));
  const cur = periods.find((p) => now >= p.start && now < p.end && !p.cancelled), next = periods.find((p) => p.start > now && !p.cancelled);
  const hour = new Date(now).getHours(), hello = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  /** The name is user-editable now, so it may be blank: drop the whole ", name" rather than greet nobody. */
  const who = st.settings.name.trim();
  const open = st.tasks.filter((t) => t.status !== 2 && t.dueAt !== null).sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).slice(0, 5), cw = width - 32 - 30;
  const dayMark = st.dayMarks[ymd(new Date(sel))];
  const nDone = open.length;
  return (
    <Page title={fmtDay(today, now) === 'Today' ? `${DW[weekdayOf(new Date(now))]} ${new Date(now).getDate()} ${MO[new Date(now).getMonth()]?.slice(0, 3)}` : ''} sub={who ? `${hello}, ${who}` : hello}
      right={<Pressable accessibilityRole="button" accessibilityLabel="Start a focus session" onPress={() => act.focusOpen(null)} hitSlop={6} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}><Icon name="timer" size={27} /></Pressable>}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change clock face" onPress={() => { act.open({ t: 'settings' }); act.settingsPush('appearance'); act.settingsPush('clock'); }}><ClockFace id={st.settings.clock} size={124} live={st.route === 'Today'} /></Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt f="serif" s={15} c="mut">{cur ? 'In class' : next ? 'Next up' : todayOcc.length ? 'All done for today' : 'No classes today'}</Txt>
          <Txt f="marker" s={23} numberOfLines={2}>{cur?.label ?? next?.label ?? (todayOcc.length ? 'Nice work' : 'Free day')}</Txt>
          {(cur ?? next) && <Txt f="bold" s={19} c="mut">{cur ? `until ${fmtTime(cur.end)}` : `at ${fmtTime(next!.start)} · ${relDue(next!.start, now)}`}</Txt>}
        </View>
      </View>
      {periods.length > 0 && (
        <HandBox seed="deck" fill={c.slab} stroke={c.slab} style={{ padding: 14, paddingBottom: 10 }}>
          <Txt f="serif" s={15} c={c.slabMut}>{cur ? `Period ${periods.indexOf(cur) + 1} of ${periods.length}` : next ? `${periods.length - periods.indexOf(next)} of ${periods.length} left` : 'Day complete'}</Txt>
          <DayBar kind={st.settings.bar as BarKind} periods={periods} now={now} ink={c.slabInk} bg={c.slab} w={width - 32 - 28} />
        </HandBox>
      )}
      <Section title="This week" right={<Btn small kind="ghost" label={dayMark ? ST[dayMark.status] : 'Mark day'} onPress={() => act.open({ t: 'status', mode: 'day', key: ymd(new Date(sel)), title: fmtDay(sel, now), date: ymd(new Date(sel)) })} />}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: 7 }, (_, i) => { const d = addDays(week, i), on = d === sel, n = occurrencesOn(new Date(d), st.meetings).length, isToday = d === today;
            return (
              <Pressable key={d} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${DW[i]} ${new Date(d).getDate()}, ${n} classes${isToday ? ', today' : ''}`} onPress={() => setSel(d)}>
                <HandBox seed={`dy${i}`} fill={on ? c.ink : c.card} shadow={false} style={{ height: 66, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Txt f="serif" s={13} maxFontSizeMultiplier={FS} c={on ? 'paper' : 'mut'}>{DW[i]}</Txt><Txt f="marker" s={21} maxFontSizeMultiplier={FS} c={on ? 'paper' : 'ink'}>{new Date(d).getDate()}</Txt>
                  <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>{Array.from({ length: Math.min(n, 5) }, (_, k) => <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.paper : c.mut }} />)}</View>
                  {isToday && !on && <View style={{ position: 'absolute', bottom: 3, width: 16, height: 2, backgroundColor: c.acc }} />}
                </HandBox>
              </Pressable>);
          })}
        </View>
      </Section>
      <Section title={fmtDay(sel, now)}>
        {selOcc.length === 0 ? <Empty icon="today" text="No classes. Add one from the + button." /> : selOcc.map(({ date, meeting }) => {
          const course = st.courses.find((x) => x.id === meeting.courseId), e = effective(date, meeting, st.attendance, st.dayMarks, now), a = atTime(date.getTime(), meeting.start), b = atTime(date.getTime(), meeting.end), live = now >= a && now < b && !isCancelled(e), key = occKey(ymd(date), meeting), col = statusColor(e.status, c);
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${course?.name}, ${meeting.start} to ${meeting.end}, ${spokenStatus(e)}. Opens attendance.`} onPress={() => act.open({ t: 'status', mode: 'class', key, title: course?.name ?? 'Class', date: ymd(date) })} onLongPress={() => act.open({ t: 'meeting', id: meeting.id })}>
              <HandBox seed={key} stroke={live ? c.acc : c.ink} sw={live ? 2.4 : 1.6} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 12, opacity: isCancelled(e) ? 0.7 : 1 }}>
                <View style={{ width: 54 }}><Txt f="bold" s={20}>{meeting.start}</Txt><Txt f="serif" s={14} c="mut">{meeting.end}</Txt></View>
                <View style={{ flex: 1, minWidth: 0 }}><Txt f="bold" s={22} style={isCancelled(e) ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={1}>{course?.name}</Txt><Txt f="serif" s={15} c="mut">{[course?.room, course?.teacher].filter(Boolean).join(' · ')}</Txt></View>
                <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: e.inferred || !e.status ? 1.4 : 2, borderStyle: e.inferred || !e.status ? 'dashed' : 'solid', borderColor: e.status ? col : hexA(c.ink, 0.3), alignItems: 'center', justifyContent: 'center' }}>{e.status ? <Txt f="marker" s={20} maxFontSizeMultiplier={FS} style={{ color: col, opacity: e.inferred ? 0.55 : 1 }}>{STATUS_GLYPH[e.status]}</Txt> : <Icon name="plus" size={18} color={c.mut} />}</View>
              </HandBox>
            </Pressable>);
        })}
      </Section>
      <Section title="Notes" right={<Btn small kind="ghost" icon="plus" a11y="New note" onPress={() => act.open({ t: 'notice' })} />}>
        {st.notices.length === 0 ? <Empty text="Nothing pinned. Add a reminder to yourself." /> : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 8, paddingRight: 8 }}>
            {st.notices.map((n, i) => (
              <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Note: ${n.text}`} onPress={() => act.open({ t: 'notice', id: n.id })} style={{ transform: [{ rotate: `${(i % 3 - 1) * 1.6}deg` }] }}>
                <HandBox seed={n.id} fill={n.priority >= 2 ? c.hl : c.card} style={{ width: 220, minHeight: 110, padding: 12, paddingTop: 16 }}>
                  <Tape w={46} rot={-6} style={{ top: -9, left: 90 }} />
                  <Txt f="serif" s={13.5} c="mut">{st.courses.find((x) => x.id === n.courseId)?.name ?? 'Reminder'}{n.priority >= 2 ? ' · important' : ''}</Txt>
                  <Txt f="hand" s={19} numberOfLines={5}>{n.text}</Txt>
                </HandBox>
              </Pressable>))}
          </ScrollView>)}
      </Section>
      <Section title="Due soon" right={<Btn small kind="ghost" label="All tasks" onPress={() => act.go('Tasks')} />}>
        {nDone === 0 ? <Empty icon="tasks" text="Nothing due. Tap + to add an assignment." /> : open.map((t) => <TaskCard key={t.id} t={t} now={now} />)}
      </Section>
      <View style={{ height: cw > 0 ? 0 : 0 }} />
    </Page>
  );
}
export { DAY_MS };
