import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Line, Rect } from 'react-native-svg';
import { BEAT, Btn, EASE, HandBox, Icon, Row, Txt } from '../ui/kit';
import { useNow, useReduceMotion, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, useStore } from '../store/store';
import { Page, Section } from './common';
import { DW, MO, addDays, atTime, hm, mondayOf, startOfDay, ymd } from '../domain/time';
import { effective, isCancelled, occKey, occurrencesOn } from '../domain/attendance';
import { hexA } from '../tokens/theme';
import { hourTop } from '../ui/fit';
import { fx } from '../services/fx';

export function WeekScreen() {
  const meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks);
  const st = { meetings, courses, attendance, dayMarks, tasks };
  const { c } = useTheme(), reduce = useReduceMotion(), live = useScreenLive(), { width } = useWindowDimensions(), now = useNow(live ? 30_000 : 0), [off, setOff] = useState(0), mon = addDays(mondayOf(now), off * 7);
  const start = Math.min(8 * 60, ...st.meetings.map((m) => Math.floor(hm(m.start) / 60) * 60)), end = Math.max(16 * 60, ...st.meetings.map((m) => Math.ceil(hm(m.end) / 60) * 60)), PX = 0.95, H = (end - start) * PX;
  const gw = width - 32, tw = 30, cw = (gw - tw) / 7, hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start / 60 + i);
  const wkEnd = addDays(mon, 6), label = `${new Date(mon).getDate()} ${MO[new Date(mon).getMonth()]?.slice(0, 3)} – ${new Date(wkEnd).getDate()} ${MO[new Date(wkEnd).getMonth()]?.slice(0, 3)}`;
  const due = st.tasks.filter((t) => t.status !== 2 && t.dueAt !== null && t.dueAt >= mon && t.dueAt < mon + 7 * 86_400_000);
  const nowY = ((now - startOfDay(now)) / 60_000 - start) * PX;
  /* Turning the week.
   *
   * The header buttons already play `fx.swipe()` — a paper rustle — and the whole grid used to swap in
   * place, so the sound promised movement the eye never saw. The fix is a short directional slide of the
   * grid: 26 dp, 90 ms out and a 210 ms settle, direction taken from which way `off` moved, so "next"
   * enters from the right and "previous" from the left.
   *
   * One value, retargeted, never reset — `useNow(live ? 30_000 : 0)` re-renders this screen twice
   * a minute under your finger and not at all while another page is up, and the
   * `last` guard is what stops that from re-flicking the grid; and three fast taps leave one continuous
   * movement rather than three. Transform only: the grid is the densest thing in the app, so opacity
   * here would re-rasterise every rule, block and label in it for 240 ms. */
  const turn = useSharedValue(0), dir = useSharedValue(1), lastOff = useRef(0);
  useEffect(() => {
    if (lastOff.current === off) return;
    dir.set(off > lastOff.current ? 1 : -1);
    lastOff.current = off;
    if (reduce) { turn.set(0); return; }
    turn.set(withSequence(withTiming(1, { duration: BEAT, easing: EASE }), withSpring(0, { duration: 210, dampingRatio: 0.72 })));
  }, [off, reduce, turn, dir]);
  const turned = useAnimatedStyle(() => ({ transform: [{ translateX: dir.get() * 26 * turn.get() }] }));
  return (
    <Page title="Week" sub={off === 0 ? `This week · ${label}` : off > 0 ? `${off} week${off > 1 ? 's' : ''} ahead` : `${-off} week${off < -1 ? 's' : ''} ago`}
      right={<Row style={{ gap: 4, flexWrap: 'nowrap' }}><Btn small kind="ghost" icon="back" a11y="Previous week" onPress={() => { setOff(off - 1); fx.swipe(); }} />{off !== 0 ? <Btn small kind="ghost" label="Today" onPress={() => setOff(0)} /> : null}<Btn small kind="ghost" icon="chevron" a11y="Next week" onPress={() => { setOff(off + 1); fx.swipe(); }} /></Row>}>
      <Animated.View style={turned}>
      <HandBox seed="wk" style={{ padding: 0 }} sw={1.8}>
        <View style={{ flexDirection: 'row', paddingLeft: tw }}>{DW.map((d, i) => { const day = addDays(mon, i), today = day === startOfDay(now); return <View key={d} style={{ width: cw, alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1.4, borderColor: c.rule }}><Txt f="serif" s={12.5} c={today ? 'acc' : 'mut'}>{d}</Txt><Txt f="marker" s={17} c={today ? 'acc' : 'ink'}>{new Date(day).getDate()}</Txt></View>; })}</View>
        <View style={{ height: H, flexDirection: 'row' }}>
          {/* This grid used to open with a `<Defs><Pattern id="hx" … patternTransform="rotate(45)">` — a
              45° hatch at 6 px that NOTHING filled with. `rg 'url(#hx)' src/` returns no hits, so it was
              markup that cost a node to parse and produced nothing, and it was the last hardcoded SVG id in
              the page. The rules below are the grid; the hatch was never on it. */}
          <Svg width={gw} height={H} style={{ position: 'absolute' }}>
            {hours.map((h, i) => <Line key={h} x1={tw - 4} x2={gw} y1={i * 60 * PX + 0.5} y2={i * 60 * PX + 0.5} stroke={c.dot} strokeWidth={1} />)}
            {DW.map((_, i) => <Line key={i} x1={tw + i * cw} x2={tw + i * cw} y1={0} y2={H} stroke={c.dot} strokeWidth={1} />)}
            {off === 0 && nowY > 0 && nowY < H && <Line x1={tw - 4} x2={gw} y1={nowY} y2={nowY} stroke={c.acc} strokeWidth={2} />}
            {off === 0 && nowY > 0 && nowY < H && <Rect x={tw - 8} y={nowY - 3} width={6} height={6} rx={3} fill={c.acc} />}
          </Svg>
          <View style={{ width: tw }}>{hours.map((h, i) => <Txt key={h} f="serif" s={11.5} c="mut" style={{ position: 'absolute', top: hourTop(i, H, PX), right: 4 }}>{h}</Txt>)}</View>
          {DW.map((_, i) => {
            const day = addDays(mon, i), occ = occurrencesOn(new Date(day), st.meetings);
            return (
              <View key={i} style={{ width: cw, height: H }}>
{occ.map(({ date, meeting }) => {
              // A class stored 23:30–00:30 has negative raw minutes; it ends the NEXT day, so its column is
              // the height of the remainder of that first day. Without this it collapses to a 20dp stub at
              // the top of the column — see `periodsOn`, which applies the same rule to a `Period`.
              const course = st.courses.find((x) => x.id === meeting.courseId), e = effective(date, meeting, st.attendance, st.dayMarks, now), top = (hm(meeting.start) - start) * PX, mins = hm(meeting.end) - hm(meeting.start), h = (mins > 0 ? mins : mins + 24 * 60) * PX, key = occKey(ymd(date), meeting), x = isCancelled(e);
                  return (
                    <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${course?.name}, ${DW[i]} ${meeting.start} to ${meeting.end}${x ? ', cancelled' : ''}`} onPress={() => act.open({ t: 'status', mode: 'class', key, title: course?.name ?? 'Class', date: ymd(date) })} onLongPress={() => act.open({ t: 'meeting', id: meeting.id })}
                      style={{ position: 'absolute', left: 2, right: 2, top, height: Math.max(20, h - 2) }}>
                      <HandBox seed={key} fill={x ? c.paper : hexA(c.acc, 0.2)} stroke={x ? c.mut : c.acc} shadow={false} sw={1.4} corners={{ h: [8, 4, 8, 4], v: [4, 8, 4, 8] }} style={{ flex: 1, padding: 2, overflow: 'hidden' }}>
                        <Txt f="bold" s={13} style={x ? { textDecorationLine: 'line-through', color: c.mut } : undefined} numberOfLines={2}>{course?.name.split(' ').map((w) => w[0]).join('').slice(0, 3)}</Txt>
                        {h > 38 && <Txt f="serif" s={10.5} c="mut" numberOfLines={1}>{course?.room}</Txt>}
</HandBox>
                    </Pressable>);
                })}
                {due.filter((t) => t.dueAt !== null && startOfDay(t.dueAt) === day).map((t) => <View key={t.id} accessible accessibilityLabel={`Due: ${t.title}`} style={{ position: 'absolute', right: 2, top: Math.max(0, Math.min(H - 12, (new Date(t.dueAt as number).getHours() * 60 + new Date(t.dueAt as number).getMinutes() - start) * PX)) }}><Icon name="flag" size={12} color={c.bad} sw={2.4} /></View>)}
              </View>);
          })}
        </View>
      </HandBox>
      </Animated.View>
      <Row style={{ justifyContent: 'space-between' }}><Txt f="serif" s={15} c="mut">Tap a block to mark attendance · long-press to edit</Txt><Btn small kind="ghost" icon="plus" label="Class" onPress={() => act.open({ t: 'meeting' })} /></Row>
      <Section title="Due this week">
        {due.length === 0 ? <Txt f="serif" s={17} c="mut">Nothing due this week.</Txt> : [...due].sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).map((t) => <Pressable key={t.id} testID={`week-due-${t.id}`} accessibilityRole="button" accessibilityLabel={`${t.title}, due ${DW[(new Date(t.dueAt as number).getDay() + 6) % 7]} ${new Date(t.dueAt as number).toTimeString().slice(0, 5)}`} accessibilityHint="Opens the task" onPress={() => act.open({ t: 'task', id: t.id })}><Row style={{ flexWrap: 'nowrap' }}><Icon name="flag" size={16} color={c.bad} /><Txt f="bold" s={19} style={{ flex: 1 }} numberOfLines={1}>{t.title}</Txt><Txt f="serif" s={15} c="mut">{DW[(new Date(t.dueAt as number).getDay() + 6) % 7]} {atTime(startOfDay(t.dueAt as number), '00:00') && new Date(t.dueAt as number).toTimeString().slice(0, 5)}</Txt></Row></Pressable>)}
      </Section>
    </Page>
  );
}
