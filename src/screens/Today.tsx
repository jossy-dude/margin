import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { ClockFace } from '../ui/clock/ClockFace';
import { DayBar, type AnyBarKind } from '../ui/DayBar';
import { Btn, HandBox, HStrip, Icon, Tape, Txt } from '../ui/kit';
import { RunningTimer } from '../ui/RunningTimer';
import { useNow, useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { Empty, Page, Section, STATUS_GLYPH, TaskCard, statusColor, relDue, spokenStatus } from './common';
import { DW, MO, addDays, atTime, fmtClock, fmtDay, fmtTime, mondayOf, startOfDay, weekdayOf, ymd } from '../domain/time';
import { effective, dayBlock, isCancelled, occKey, occurrencesOn, ST, type Occurrence, type Period } from '../domain/attendance';
import { hexA, RS } from '../tokens/theme';
import { hatch } from '../ui/instruments/hatch';
import { FS } from '../ui/fit';
import type { Course } from '../domain/types';

/* ── the command deck ─────────────────────────────────────────────────────
   `deck()` in the design of record (`/home/jossy/Downloads/marginalia-v10(1).html`, line 236),
   rebuilt on this app's own primitives. Every row below is one of its rows, in its order: state
   word and room, subject, countdown, progress bar, what is next. Nothing added, nothing reordered,
   nothing moved out of the slab the app already had. `qa/CARD-GAP.md` carries the line-by-line
   comparison, and the three things the reference does that are deliberately NOT copied: the 2.5px ink
   rim, which is invisible against its own fill in the reference too (checked at 500%) and would be a
   divergence here; the 16%-opacity tape, which this app's solid `Tape` cannot be without becoming
   louder than the reference's; and the title's `1.05` leading, which `Txt`'s own `1.25` replaces
   because a fixed tighter leading collides with itself at the 1.3x font scale V14 asks to survive.

   The reference's `.dk` re-points its own tokens so the card inverts against the page — near-black
   with cream text in light, cream with near-black text in dark. `c.deck` is this app's command-deck
   token (`c.deck`/`c.deckInk`/`c.deckMut`, see `tokens/theme.ts`) and `DayBar` already draws `ink`
   on `bg` for exactly this surface, so that is the card. */

/** The reference's `.dk{padding:15px 16px 14px}`, and `.bar{height:48px}`. Both are named so the bar's
 *  width is derived from the padding instead of repeating `28` and drifting a pixel away from it. */
const DECK_PAD_X = 16;
const DECK_BAR_H = 48;

/* An overnight class (23:30–00:30) has both ends stamped on the day it occurs, so it arrives here with
 *  `end <= start` and disappears — `activePeriod` drops any period whose end is not after its start, and
 *  the card would show no class at all in the one hour it is genuinely running. `periodsOn` now pushes
 *  the end into the next day, once, in the domain, so nothing in this file re-opens the period and the
 *  other two views that read a Period stop being wrong separately. */

export type DeckState = 'live' | 'soon' | 'first' | 'rest';

export interface Deck {
  state: DeckState;
  /** the class the card is about, or null when the selected day has nothing ahead on it */
  period: Period | null;
  /** the word on the pill */
  word: string;
  /** what the digits say */
  countdown: string;
  /** the unit beside the digits */
  unit: string;
  /** where in the day this class sits, in the words the app already used here */
  position: string;
  /** index into the `periods`/`occ` pair `dayBlock` returns, or -1 */
  at: number;
  /** how many classes the day is counting, cancelled ones excluded */
  total: number;
}

/**
 * The card's whole derivation, from real clock time. Pure, and the four states are the reference's:
 * inside a class, in the gap before one, a day that is not today, and a day with nothing on it.
 *
 * `isToday` is what separates them: the reference only ever runs its clock for the day it is showing
 * (`it = sel == tdi`), and on any other day it falls back to naming the first class and printing its
 * start time instead of a countdown.
 */
export function deckOf(periods: Period[], t: number, isToday: boolean): Deck {
  // `Period.end` is already correct for an overnight class (see `periodsOn`), so this is index-for-index
  // with the `occ` list `dayBlock` builds, which is what lets the card find the same class in both.
  const ps = periods.map((p, i) => ({ p, i })).filter((x) => !x.p.cancelled);
  const cur = isToday ? ps.find((x) => t >= x.p.start && t < x.p.end) : undefined;
  const next = isToday ? ps.find((x) => x.p.start > t) : ps[0];
  const hit = cur ?? next;
  const period = hit ? hit.p : null;
  const target = cur ? cur.p.end : next ? next.p.start : null;
  const state: DeckState = cur ? 'live' : next ? (isToday ? 'soon' : 'first') : 'rest';
  const at = hit ? hit.i : -1;
  return {
    state, period, at, total: ps.length,
    word: cur ? 'Now' : next ? (isToday ? 'Next up' : 'First class') : 'Rest day',
    countdown: target === null ? '--:--' : isToday ? fmtClock((target - t) / 1000) : fmtTime(target),
    /* The reference's `lb` is only ever overwritten when there is a class to point at: with nothing
       on, `cn` and `lb` keep their opening values and it reads `--:--  nothing on`, not a countdown
       with a unit borrowed from a state that is not happening. */
    unit: cur ? 'min left' : next ? (isToday ? 'until it starts' : 'first bell') : 'nothing on',
    position: !period ? (ps.length ? 'Day complete' : 'No classes')
      : state === 'soon' ? `${ps.length - at} of ${ps.length} left` : `Period ${at + 1} of ${ps.length}`,
  };
}

/** The reference's `.dk::before` texture: a 45° hatch at 8% ink, drawn as clipped geometry with A2's
 *  own `hatch()` rather than an SVG `<Pattern>`, so two cards in one tree cannot collide on an
 *  element name (`prompt.md` R11 — the reason `Spines` was redrawn the same way).
 *
 *  `7`, not `5`: `hatch()` advances `d` along x while the line itself runs corner to corner at 45°,
 *  so the pitch you SEE is `step / √2`. The reference's gradient is `1px` lines every `5px` measured
 *  across the lines, which is `7.07` here. At `5` the pitch comes out at 3.5 px and the slab reads as
 *  corduroy rather than as tooth — caught by rendering it beside the reference, not by reading it. */
const HATCH_STEP = 7;

function SlabHatch({ ink }: { ink: string }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  return (
    <View pointerEvents="none" onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - sz.w) > 0.5 || Math.abs(height - sz.h) > 0.5) setSz({ w: width, h: height }); }} style={StyleSheet.absoluteFill}>
      {sz.w > 0 && <Svg width={sz.w} height={sz.h} style={StyleSheet.absoluteFill}>
        {hatch(0, 0, sz.w, sz.h, HATCH_STEP).map((g, i) => <Line key={i} {...g} stroke={ink} strokeWidth={1} strokeOpacity={0.09} />)}
      </Svg>}
    </View>
  );
}

/**
 * The card.
 *
 * It owns its own 1 Hz clock rather than borrowing the page's 30 s one, so the digits can count
 * without re-rendering the class list, the notes strip and everything else below them. `live` is the
 * same off-screen gate the page applies to its own `useNow` — `prompt.md` V17 asks that a hidden
 * screen does not tick fast — so off Today the card drops to the same 60 s the page uses.
 */
const ActiveCard = React.memo(function ActiveCard({ periods, occ, courses, isToday, bar, w, live }: {
  periods: Period[]; occ: Occurrence[]; courses: Course[]; isToday: boolean; bar: AnyBarKind; w: number; live: boolean;
}) {
  const { c } = useTheme();
  const t = useNow(live ? 1000 : 60_000);
  const d = deckOf(periods, t, isToday);
  /* `occ[i]` is the meeting behind `periods[i]` — `periodsOn` maps one array to the other in order.
     `at` is -1 when the card has no class, and `at + 1` would then be the FIRST class of the day:
     the reference guards this the same way (`a = p && pl[pl.indexOf(p)+1]`), because "after the last
     class" and "after nothing" are different sentences. */
  const courseAt = (i: number) => { const o = i >= 0 ? occ[i] : undefined; return o ? courses.find((x) => x.id === o.meeting.courseId) ?? null : null; };
  const mine = courseAt(d.at), after = d.at >= 0 ? courseAt(d.at + 1) : null;
  const room = mine?.room?.trim() ?? '';
  const afterText = after ? [after.name, after.room.trim()].filter(Boolean).join(' · ') : d.period ? 'last class of the day' : 'nothing scheduled';
  return (
    <HandBox seed="deck" fill={c.deck} stroke={c.deck} sw={2} amp={1.1} style={{ paddingTop: 15, paddingBottom: 14, paddingHorizontal: DECK_PAD_X }}>
      <SlabHatch ink={c.deckInk} />
      {/* `.tg` — the state word is the card's own ink inverted back out, as the reference's `.tg b` is:
          the one place inside the slab that is lighter than the slab, so it reads first. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
          <View style={{ transform: [{ rotate: '-2deg' }] }}>
            <HandBox seed={`deck-pill-${d.word}`} fill={c.deckInk} stroke={c.deckInk} corners={RS} shadow={false} sw={1.6} amp={0.8}>
              <Txt f="bold" s={22} c={c.deck} maxFontSizeMultiplier={FS} style={{ paddingHorizontal: 10, paddingVertical: 1 }}>{d.word}</Txt>
            </HandBox>
          </View>
          <Txt f="serif" s={15} c={c.deckMut} maxFontSizeMultiplier={FS} numberOfLines={1} style={{ flexShrink: 1 }}>{d.position}</Txt>
        </View>
        {/* `.tg span > .R` … and the room code beside it. */}
        {room !== '' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderRadius: 999, borderWidth: 2.2, borderColor: c.deckInk, transform: [{ rotate: '-7deg' }] }}>
              <Txt f="marker" s={15} maxFontSizeMultiplier={FS} style={{ color: c.deckInk }}>R</Txt>
            </View>
            <Txt f="marker" s={22} maxFontSizeMultiplier={FS} numberOfLines={1} style={{ color: c.deckInk }}>{room}</Txt>
          </View>
        )}
      </View>
      {/* `h2` — uncapped, so it grows with the system font like every other heading in the app. The
          reference's tighter `1.05` leading is not reproduced: `Txt` sets `1.25` for the marker face so
          scaled glyphs still have their line box, and a fixed 1.05 would overlap them past 1.3x. The
          card is therefore about 20 px taller than the reference's, all of it in this row. */}
      <Txt f="marker" s={32} numberOfLines={2} style={{ color: c.deckInk, marginTop: 8, marginBottom: 6 }}>{d.period ? d.period.label : 'Free day'}</Txt>
      {/* `.cnt` — `tabular-nums` because these digits change every second; without it the readout is
          the one thing on the page that can shuffle its own neighbours as it counts. The reference's
          `letter-spacing: -.04em` is relative; RN wants absolute, so it is resolved at this size. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 9 }}>
        <Txt f="type" s={42} style={{ color: c.deckInk, letterSpacing: -1.7, fontVariant: ['tabular-nums'] }}>{d.countdown}</Txt>
        <Txt f="bold" s={22} maxFontSizeMultiplier={FS} style={{ color: c.deckInk }}>{d.unit}</Txt>
      </View>
      <DayBar kind={bar} periods={periods} now={t} ink={c.deckInk} bg={c.deck} w={w} h={DECK_BAR_H} live={live} />
      {/* `.aft` — a dashed rule, then what the day does next. */}
      <View style={{ marginTop: 10, borderTopWidth: 2.5, borderStyle: 'dashed', borderTopColor: c.deckMut, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 }}>
        <Txt f="bold" s={20} maxFontSizeMultiplier={FS} style={{ color: c.deckInk }}>After</Txt>
        <Txt f="serif" s={17} maxFontSizeMultiplier={FS} style={{ color: c.deckMut, flexShrink: 1 }}>{afterText}</Txt>
      </View>
    </HandBox>
  );
});

export function TodayScreen() {
  /* Narrow selectors: each slice subscribes on its own, so toast/timer/sheet/plan writes no longer
     re-render this whole page — only the slices it actually reads. `st` is rebuilt locally each render. */
  const route = useStore((s) => s.route), settings = useStore((s) => s.settings), meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks), notices = useStore((s) => s.notices);
  const st = { route, settings, meetings, courses, attendance, dayMarks, tasks, notices };
  const { c } = useTheme(), { width } = useWindowDimensions(), now = useNow(st.route === 'Today' ? 30_000 : 60_000), today = startOfDay(now);
  /* The day block — strip, class list, "Mark day" — is ONE day, chosen by the user and otherwise the
     live today; the title, clock and "in class / next up" line above it stay about now, so they read
     the live day instead. Both come from `dayBlock`, so they cannot drift apart. */
  const [picked, setPicked] = useState<number | null>(null);
  const { day: sel, date: selDate, occ: selOcc, periods } = dayBlock(now, st.meetings, st.courses, st.attendance, st.dayMarks, picked);
  const { cur, next, periods: todayPeriods } = dayBlock(now, st.meetings, st.courses, st.attendance, st.dayMarks, null);
  const week = mondayOf(sel);
  const hour = new Date(now).getHours(), hello = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  /** The name is user-editable now, so it may be blank: drop the whole ", name" rather than greet nobody. */
  const who = st.settings.name.trim();
  const open = st.tasks.filter((t) => t.status !== 2 && t.dueAt !== null).sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).slice(0, 5);
  const dayMark = st.dayMarks[selDate];
  const nDone = open.length;
  return (
    <Page title={fmtDay(today, now) === 'Today' ? `${DW[weekdayOf(new Date(now))]} ${new Date(now).getDate()} ${MO[new Date(now).getMonth()]?.slice(0, 3)}` : ''} sub={who ? `${hello}, ${who}` : hello}
      right={<Pressable testID="open-focus" accessibilityRole="button" accessibilityLabel="Start a focus session" onPress={() => act.focusOpen(null)} hitSlop={6} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}><Icon name="timer" size={27} /></Pressable>}>
      {/* The one place outside Focus that admits a round is live. `prompt.md` R4 records the indicator as
          unbuilt and V10h asks for it here: back out of Focus lands on Today, so Today is where you find
          out whether to resume or start again. Same first-child placement To-do uses, and it reads the
          store itself, so it costs this page nothing to be wrong about. */}
      <RunningTimer />
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Pressable testID="clock-face" accessibilityRole="button" accessibilityLabel="Change clock face" onPress={() => { act.open({ t: 'settings' }); act.settingsPush('appearance'); act.settingsPush('clock'); }}><ClockFace id={st.settings.clock} size={124} live={st.route === 'Today'} /></Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Txt f="serif" s={15} c="mut">{cur ? 'In class' : next ? 'Next up' : todayPeriods.length ? 'All done for today' : 'No classes today'}</Txt>
          <Txt f="marker" s={23} numberOfLines={2}>{cur?.label ?? next?.label ?? (todayPeriods.length ? 'Nice work' : 'Free day')}</Txt>
          {(cur ?? next) && <Txt f="bold" s={19} c="mut">{cur ? `until ${fmtTime(cur.end)}` : `at ${fmtTime(next!.start)} · ${relDue(next!.start, now)}`}</Txt>}
        </View>
      </View>
      {/* The command deck, over the SELECTED day — the day strip above it can move it, so the bar under
          it and the class list below it always describe the same day. */}
      {periods.length > 0 && (
        <ActiveCard periods={periods} occ={selOcc} courses={st.courses} isToday={sel === today} bar={st.settings.bar as AnyBarKind} w={width - 32 - DECK_PAD_X * 2} live={st.route === 'Today'} />
      )}
      <Section title="This week" right={<Btn small kind="ghost" label={dayMark ? ST[dayMark.status] : 'Mark day'} onPress={() => act.open({ t: 'status', mode: 'day', key: selDate, title: fmtDay(sel, now), date: selDate })} />}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: 7 }, (_, i) => { const d = addDays(week, i), on = d === sel, n = occurrencesOn(new Date(d), st.meetings).length, isToday = d === today;
            return (
              <Pressable key={d} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${DW[i]} ${new Date(d).getDate()}, ${n} classes${isToday ? ', today' : ''}`} onPress={() => setPicked(d)}>
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
          <HStrip gap={12} contentStyle={{ paddingTop: 8 }}>
            {st.notices.map((n, i) => (
              <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Note: ${n.text}`} onPress={() => act.open({ t: 'notice', id: n.id })} style={{ transform: [{ rotate: `${(i % 3 - 1) * 1.6}deg` }] }}>
                <HandBox seed={n.id} fill={n.priority >= 2 ? c.hl : c.card} style={{ width: 220, minHeight: 110, padding: 12, paddingTop: 16 }}>
                  <Tape w={46} rot={-6} style={{ top: -9, left: 90 }} />
                  <Txt f="serif" s={13.5} c="mut">{st.courses.find((x) => x.id === n.courseId)?.name ?? 'Reminder'}{n.priority >= 2 ? ' · important' : ''}</Txt>
                  <Txt f="hand" s={19} numberOfLines={5}>{n.text}</Txt>
                </HandBox>
              </Pressable>))}
          </HStrip>)}
      </Section>
      <Section title="Due soon" right={<Btn small kind="ghost" label="All tasks" onPress={() => act.go('Tasks')} />}>
        {nDone === 0 ? <Empty icon="tasks" text="Nothing due. Tap + to add an assignment." /> : open.map((t) => <TaskCard key={t.id} t={t} now={now} />)}
      </Section>
    </Page>
  );
}
