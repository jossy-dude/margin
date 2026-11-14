import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Bubble } from '../../ui/Bubble';
import { GlassCard, glassStyle } from '../../ui/Glass';
import { islandSpace } from '../../ui/Island';
import { Sky } from '../../ui/Sky';
import { Face } from '../../ui/mascot/Face';
import { FACES } from '../../ui/mascot/faces';
import { MOMENTS, faceEvent, useFaceMoment } from '../../ui/mascot/moments';
import { Icon } from '../../ui/kit';
import { RunningTimer } from '../../ui/RunningTimer';
import { pageBottomPad } from '../../ui/fit';
import { useScreenLive } from '../../ui/live';
import { useNow, useReduceMotion } from '../../ui/theme-context';
import { act, useStore } from '../../store/store';
import { SPACE, TOUCH } from '../../tokens/v2';
import { Button, Glyph, T, Tap, tintOf, useV2 } from './kitv2';
import { ClassRow, NowCard } from './NowCard';
import { completesWeek, todayView, type ClassItem, type DueRow, type TodayVM, type WeekPill } from './model';

/** What a tap on the face says (D-21: "Tap = a short line … tip of the day"). About this page, in the app's voice. */
export const TIPS = [
  'Tap the date to see your week.',
  'In class, one tap on Mark says you were there. Hold it for absent, cancelled or a reason.',
  'Hold a class to change its time or room.',
  'Tap a card’s title to fold it away.',
  'Pin a note and it waits for you here.',
] as const;

/** The day picker, opened from the date: seven pills, each with that day's classes as small bubbles. */
function WeekStrip({ week, onPick }: { week: WeekPill[]; onPick: (day: number) => void }) {
  const { t } = useV2();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: SPACE.s1 }}>
      {week.map((p, k) => (
        <Tap key={p.day} role="tab" selected={p.selected} label={`${p.label}${p.selected ? ', shown' : ''}`} testID={`day-${k}`} onPress={() => onPick(p.day)}
          style={{ flex: 1, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2,
            backgroundColor: p.selected ? t.glassStrong : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: p.selected ? t.ring : 'transparent' }}>
          <T k="caps" c={p.selected ? 'ink' : 'ink3'}>{p.dw}</T>
          <T k="subtitle" c={p.isToday || p.selected ? 'ink' : 'ink2'} style={p.isToday ? { textDecorationLine: 'underline' } : null}>{String(p.date)}</T>
          <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
            {p.bubbles.slice(0, 5).map((b, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1,
                borderColor: b === 'absent' ? t.absent : b === 'now' ? t.now : b === 'filled' || b === 'half' ? t.present : t.ink3,
                backgroundColor: b === 'absent' ? t.absent : b === 'filled' || b === 'half' ? t.present : 'transparent' }} />
            ))}
          </View>
        </Tap>
      ))}
    </View>
  );
}

/** A task due: the bubble is "done" (tap it), the row opens the task. Late dates read in `bad`. */
function DueItem({ row, divider }: { row: DueRow; divider: boolean }) {
  const { t, scheme } = useV2();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: divider ? 0.5 : 0, borderTopColor: t.ring }}>
      <Tap onPress={() => { act.toggleTask(row.id); faceEvent('taskDone'); }} label={`Mark ${row.title} done`} testID={`due-done-${row.id}`} style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', marginLeft: -SPACE.s3 }}>
        <Bubble state="empty" size={20} scheme={scheme} />
      </Tap>
      <Tap onPress={() => act.open({ t: 'task', id: row.id })} label={`${row.title}, ${row.course ? `${row.course}, ` : ''}due ${row.when}`} hint="Opens the task" testID={`due-${row.id}`} style={{ flex: 1, minHeight: 56, justifyContent: 'center', paddingVertical: SPACE.s2 }}>
        <T k="body" numberOfLines={2}>{row.title}</T>
        <T k="bodyS" c="ink3" numberOfLines={1}>
          {row.course ? `${row.course} · ` : ''}<T k="bodyS" c={row.late ? 'bad' : 'ink3'}>{row.when}</T>
        </T>
      </Tap>
    </View>
  );
}

const SubHead = ({ children, tone }: { children: string; tone?: 'bad' }) => <T k="label" c={tone ?? 'ink3'} accessibilityRole="header" style={{ marginTop: SPACE.s2 }}>{children}</T>;

/**
 * Today v2 — the screen (DESIGN.md D-11, PLAN R1). Top bar (date that opens the week strip, greeting, the face,
 * the focus timer, settings) → the Now card → today's other classes (later, then earlier, folded) → Due → Notes
 * (folded). The sky is behind it; the nav island floats over the end of the scroll, which stops above it.
 *
 * One face on the page (the one-face rule, `ui/mascot/moments.ts`): the top bar's, resting on `pageFace('Today')`
 * and reacting to a task done, a class marked, a week fully attended. Empty cards are words only.
 * `sky` stays true until the shell draws the sky once for every page. `onClassic` shows the v0.6 Today
 * (`TodayPage`) while the other screens are still being rebuilt.
 */
export function TodayV2({ sky = true, onClassic }: { sky?: boolean; onClassic?: () => void }) {
  const meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), variants = useStore((s) => s.variants), attendance = useStore((s) => s.attendance);
  const dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks), notices = useStore((s) => s.notices);
  const name = useStore((s) => s.settings.name), hour12 = useStore((s) => s.settings.hour12), bar = useStore((s) => s.settings.bar), skyMode = useStore((s) => s.settings.sky), locked = useStore((s) => s.settings.lockAttendance);
  const { t, scheme } = useV2(), ins = useSafeAreaInsets(), reduce = useReduceMotion(), focused = useScreenLive();
  /* 30 s lands exactly on the minute (useNow aligns to the wall clock), where classes start and end; a hidden page
     is frozen (0) and gets true time the moment it shows again (audit M5). */
  const now = useNow(focused ? 30_000 : 0);
  const [picked, setPicked] = useState<number | null>(null), [strip, setStrip] = useState(false), [pick, setPick] = useState<{ slot: string; i: number } | null>(null);
  const [fold, setFold] = useState<Record<string, boolean>>({ earlier: true, notes: true });
  const input = { now, picked, meetings, courses, variants, attendance, dayMarks, tasks, notices, hour12, name };
  const first = useMemo(() => todayView({ ...input, pick: pick?.i ?? 0 }), [now, picked, meetings, courses, variants, attendance, dayMarks, tasks, notices, hour12, name, pick]); // eslint-disable-line react-hooks/exhaustive-deps
  /* A remembered tab belongs to the slot it was chosen in; a new slot starts at its first class. */
  const vm: TodayVM = pick && pick.slot !== first.card.slot ? todayView({ ...input, pick: 0 }) : first;
  const { face, play } = useFaceMoment(vm.face, focused);
  const [tip, setTip] = useState<{ text: string; n: number } | null>(null), tips = useRef(0);
  useEffect(() => { if (!tip) return; const id = setTimeout(() => setTip(null), MOMENTS.tip.holdMs); return () => clearTimeout(id); }, [tip]);
  const onFace = () => { play('tip'); const n = tips.current++; setTip({ text: TIPS[(Math.floor(now / 86_400_000) + n) % TIPS.length]!, n }); };
  const tint = (courseId: string) => tintOf(courseId, courses, scheme);
  const openClass = (x: ClassItem) => act.open({ t: 'status', mode: 'class', key: x.key, title: x.name, date: x.date });
  const editClass = (x: ClassItem) => act.open({ t: 'meeting', id: x.meetingId });
  const mark = vm.card.mark;
  const onMark = () => {
    if (!mark) return;
    /* One tap marks the running class present (D-11). Locked, or already marked: the sheet, which knows the lock. */
    if (locked || mark.bubble !== 'empty') { act.open({ t: 'status', mode: 'class', key: mark.key, title: mark.title, date: mark.date }); return; }
    const week = completesWeek(input, mark.key);
    act.setAtt(mark.key, 'p');
    faceEvent(week ? 'weekAttended' : 'markedPresent');
  };
  const fl = (k: string) => fold[k] ?? false, setFl = (k: string) => (v: boolean) => setFold((f) => ({ ...f, [k]: v }));
  const due = vm.due, quiet = vm.card.state === 'inClass';
  return (
    <View style={{ flex: 1 }} testID="today-v2">
      {sky ? <Sky mode={skyMode} scheme={scheme} /> : null}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: ins.top + SPACE.s3, paddingHorizontal: SPACE.gutter, paddingBottom: Math.max(pageBottomPad(ins.bottom), islandSpace(ins.bottom)), gap: SPACE.s3 }}>
        {/* Top bar: transparent over the sky. The date is the way into the week strip. */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s2, marginBottom: SPACE.s1 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Tap onPress={() => setStrip((v) => !v)} label={`${vm.dateLine}. ${strip ? 'Hide' : 'Show'} the week`} testID="date-toggle" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, alignSelf: 'flex-start', minHeight: TOUCH }}>
              <T k="titleL" accessibilityRole="header">{vm.dateLine}</T>
              <Glyph name={strip ? 'up' : 'down'} size={20} color={t.ink2} />
            </Tap>
            <T k="bodyS" c="ink2">{vm.greeting}</T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: TOUCH }}>
            <Tap onPress={onFace} label={`Jot, ${FACES[face.name].label}. Tap for a tip`} testID="today-face" style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Face {...face} size={28} scheme={scheme} awake={focused} decorative />
            </Tap>
            <RunningTimer />
            <Tap onPress={() => act.open({ t: 'settings' })} label="Settings" testID="open-settings" style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="gear" size={24} color={t.ink2} />
            </Tap>
          </View>
        </View>
        {tip ? (
          <Animated.View key={tip.n} entering={reduce ? undefined : FadeIn.duration(200)} accessibilityLiveRegion="polite" testID="today-tip"
            style={[glassStyle(scheme, true), { alignSelf: 'flex-end', maxWidth: 300, marginTop: -SPACE.s2, paddingVertical: SPACE.s2, paddingHorizontal: SPACE.s3 }]}>
            <T k="voice">{tip.text}</T>
          </Animated.View>
        ) : null}
        {strip ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} style={[glassStyle(scheme), { padding: SPACE.s2, gap: SPACE.s1 }]}>
            <WeekStrip week={vm.week} onPick={(d) => setPicked(d)} />
            {/* one way back to today, on the card itself (it shows while the strip is closed too) */}
            <Button small kind="text" testID="mark-day" label={vm.dayMark ? `Whole day: ${vm.dayMark}` : `Mark ${vm.isToday ? 'today' : vm.card.title} for every class`} style={{ alignSelf: 'flex-start' }}
              onPress={() => act.open({ t: 'status', mode: 'day', key: vm.selDate, title: vm.isToday ? 'Today' : vm.card.title, date: vm.selDate })} />
          </Animated.View>
        ) : null}
        <NowCard card={vm.card} live={focused} hour12={hour12} bar={bar} tintFor={tint}
          onPick={(i) => setPick({ slot: vm.card.slot, i })} onMark={onMark}
          onMarkLong={() => { if (mark) act.open({ t: 'status', mode: 'class', key: mark.key, title: mark.title, date: mark.date }); }}
          onOpenClass={openClass} onEditClass={editClass} onToday={() => setPicked(null)} />
        {vm.later.length ? (
          <GlassCard scheme={scheme} title="Later today" summary={`${vm.later.length} more`} folded={fl('later')} onFold={setFl('later')}>
            {vm.later.map((x, k) => <ClassRow key={x.key} item={x} tint={tint(x.courseId)} divider={k > 0} quiet={quiet} onOpen={() => openClass(x)} onEdit={() => editClass(x)} />)}
          </GlassCard>
        ) : null}
        {vm.earlier.length ? (
          <GlassCard scheme={scheme} title={vm.card.state === 'after' ? 'Today’s classes' : 'Earlier today'} summary={vm.earlierSummary} folded={fl('earlier')} onFold={setFl('earlier')}>
            {vm.earlier.map((x, k) => <ClassRow key={x.key} item={x} tint={tint(x.courseId)} divider={k > 0} quiet={quiet} onOpen={() => openClass(x)} onEdit={() => editClass(x)} />)}
          </GlassCard>
        ) : null}
        <GlassCard scheme={scheme} title="Due" summary={due.summary} folded={fl('due')} onFold={setFl('due')} action={{ label: 'All tasks', onPress: () => act.go('Tasks') }}>
          {due.empty ? <T k="voice" c="ink2" style={{ paddingVertical: SPACE.s2 }}>Nothing due. Enjoy it.</T> : (<>
            {due.overdue.length ? <SubHead tone="bad">Overdue</SubHead> : null}
            {due.overdue.map((r, k) => <DueItem key={r.id} row={r} divider={k > 0} />)}
            {due.moreOverdue ? <Button small kind="text" label={`${due.moreOverdue} more overdue`} onPress={() => act.go('Tasks')} style={{ alignSelf: 'flex-start' }} /> : null}
            {due.today.length ? <SubHead>Today</SubHead> : null}
            {due.today.map((r, k) => <DueItem key={r.id} row={r} divider={k > 0} />)}
            {due.next.length ? <SubHead>Coming up</SubHead> : null}
            {due.next.map((r, k) => <DueItem key={r.id} row={r} divider={k > 0} />)}
          </>)}
        </GlassCard>
        <GlassCard scheme={scheme} title="Notes" summary={vm.notes.length ? `${vm.notes.length} pinned` : 'none pinned'} folded={fl('notes')} onFold={setFl('notes')} action={{ label: 'Add', onPress: () => act.open({ t: 'notice' }) }}>
          {vm.notes.length === 0 ? <T k="voice" c="ink2" style={{ paddingVertical: SPACE.s2 }}>Nothing pinned. Add a reminder to yourself.</T>
            : vm.notes.map((n, k) => (
              <Tap key={n.id} onPress={() => act.open({ t: 'notice', id: n.id })} label={`${n.text}${n.meta ? `. ${n.meta}` : ''}`} hint="Opens the note" testID={`note-${n.id}`}
                style={{ paddingVertical: SPACE.s3, borderTopWidth: k > 0 ? 0.5 : 0, borderTopColor: t.ring }}>
                <T k="body" numberOfLines={3}>{n.text}</T>
                {n.meta ? <T k="bodyS" c="ink3">{n.meta}</T> : null}
              </Tap>
            ))}
        </GlassCard>
        {onClassic ? <Button small kind="text" label="Classic Today" a11y="Show the classic Today, from version 0.6" testID="today-classic" onPress={onClassic} style={{ alignSelf: 'center', marginTop: SPACE.s2 }} /> : null}
      </ScrollView>
    </View>
  );
}
