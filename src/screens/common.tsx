import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { HandBox, Icon, Txt, Tape } from '../ui/kit';
import { PaperBg } from '../ui/PaperBg';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { DAY_MS, fmtDur, fmtTime, startOfDay } from '../domain/time';
import type { AttStatus, Task } from '../domain/types';
import { workload } from '../domain/reminders';
import { ST } from '../domain/attendance';
import { hexA } from '../tokens/theme';
import { fx } from '../services/fx';
import { SwipeCard } from '../ui/Swipe';
import { FS, pageBottomPad } from '../ui/fit';

export function Page({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <PaperBg />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: ins.top + 10, paddingHorizontal: 16, paddingBottom: pageBottomPad(ins.bottom), gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          {/* `minWidth: 0` lets the title column actually shrink: without it a flex child keeps its widest
              word and pushes the right-hand cluster off a 320 dp screen (V2). The sub-line wraps instead. */}
          <View style={{ flex: 1, minWidth: 0 }}><Txt f="marker" s={32} numberOfLines={2} accessibilityRole="header">{title}</Txt>{sub ? <Txt f="serif" s={16} c="mut">{sub}</Txt> : null}</View>
          {right}
          <Pressable testID="open-settings" accessibilityRole="button" accessibilityLabel="Settings" onPress={() => act.open({ t: 'settings' })} hitSlop={6} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}><Icon name="gear" size={26} /></Pressable>
        </View>
        {children}
      </ScrollView>
    </View>
  );
}
export const Section = ({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <View style={{ gap: 8 }}><View style={{ flexDirection: 'row', alignItems: 'center' }}><Txt f="bold" s={24} style={{ flex: 1 }} accessibilityRole="header">{title}</Txt>{right}</View>{children}</View>
);
export function Empty({ text, icon = 'note' }: { text: string; icon?: string }) {
  return <HandBox seed={text} shadow={false} dashed fill="transparent" style={{ padding: 18, alignItems: 'center', gap: 6 }}><Icon name={icon} size={30} /><Txt f="serif" s={17} c="mut" style={{ textAlign: 'center' }}>{text}</Txt></HandBox>;
}
export const STATUS_GLYPH: Record<AttStatus, string> = { p: '✓', l: 'L', n: 'L', a: '✕', s: 'S', c: '–', t: '–' };
export function statusColor(s: AttStatus | null, c: ReturnType<typeof useTheme>['c']) { return s === 'a' ? c.bad : s === 'l' || s === 'n' ? c.warn : s === 's' ? c.ok : s === 'c' || s === 't' ? c.mut : c.ink; }
/** How an occurrence's status is spoken. `effective()` reports `inferred` for a class that has simply ended
 *  with no mark on it, which the grid draws as a faint dashed "Here" — reading that out as "Here" claims the
 *  student was marked present when nothing was ever marked, so an inferred status is announced as unmarked. */
export function spokenStatus(e: { status: AttStatus | null; inferred: boolean }): string {
  if (!e.status) return 'not marked yet';
  return e.inferred ? `${ST[e.status]}, not marked yet` : ST[e.status];
}

export function relDue(ms: number, now: number) {
  const d = ms - now, a = Math.abs(d), m = Math.round(a / 60_000);
  if (d < 0) return m < 60 ? `${m} min late` : m < 1440 ? `${Math.round(m / 60)} h late` : `${Math.round(m / 1440)} d late`;
  return m < 60 ? `in ${m} min` : m < 1440 ? `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}m` : ''}` : startOfDay(ms) - startOfDay(now) === DAY_MS ? `tomorrow ${fmtTime(ms)}` : `in ${Math.round(m / 1440)} d`;
}
const KIND_ICON: Record<Task['kind'], string> = { assignment: 'tasks', exam: 'exam', reading: 'book', project: 'flag', lab: 'lab', deadline: 'flag', other: 'pencil' };
/** Memoized: a card only re-renders when its task object changes or the minute boundary flips (its text is
 *  minute-granular). Narrow selectors keep it off every unrelated store write, and it opens its own sheet so
 *  the parent can't hand it a fresh inline callback that would defeat the memo. */
export const TaskCard = React.memo(function TaskCard({ t, now }: { t: Task; now: number }) {
  const { c } = useTheme();
  const courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), notif = useStore((s) => s.settings.notif);
  const open = () => act.open({ t: 'task', id: t.id });
  const course = courses.find((x) => x.id === t.courseId), done = t.status === 2, late = !done && t.dueAt !== null && t.dueAt < now, soon = !done && t.dueAt !== null && t.dueAt - now < 6 * 3_600_000 && !late;
  const w = !done && t.estimateMin && t.dueAt ? workload(t, { now, meetings, attendance, dayMarks, settings: notif }) : null, sd = t.subtasks.filter((x) => x.done).length;
  return (
    <SwipeCard onComplete={() => act.toggleTask(t.id)} onDelete={() => act.removeTask(t.id)} onOpen={open} doneLabel={done ? 'Reopen' : 'Done'}>
      <Pressable onPress={() => { fx.tap(); open(); }} onLongPress={() => act.focusOpen(t.id)} delayLongPress={450} android_ripple={{ color: hexA(c.ink, 0.12) }} accessibilityRole="button" accessibilityLabel={`${t.title}${course ? ', ' + course.name : ''}${t.dueAt ? ', due ' + relDue(t.dueAt, now) : ''}${done ? ', done' : ''}`} accessibilityHint="Opens it. Long press starts a focus session.">
        <HandBox seed={t.id} fill={done ? c.paper : c.card} stroke={late ? c.bad : c.ink} style={{ paddingLeft: 52, paddingRight: 12, paddingVertical: 11, minHeight: 66, opacity: done ? 0.78 : 1 }}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={`Mark ${t.title} ${done ? 'not done' : 'done'}`} onPress={() => act.toggleTask(t.id)} hitSlop={6} style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: c.ink, backgroundColor: done ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] }}>{done && <Icon name="check" size={20} color={c.card} sw={2.6} />}</View>
          </Pressable>
          <Txt f="bold" s={22} style={done ? { textDecorationLine: 'line-through', color: c.mut } : undefined} numberOfLines={2}>{t.title}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Icon name={KIND_ICON[t.kind]} size={15} color={c.mut} /><Txt f="serif" s={15} c="mut">{course?.name ?? 'Personal'}</Txt></View>
            {t.dueAt !== null && <Txt f="bold" s={17} c={late ? 'bad' : soon ? 'warn' : 'mut'}>{done && t.completedAt ? `done ${relDue(t.completedAt, now)}`.replace('in ', '') : relDue(t.dueAt, now)}</Txt>}
            {t.estimateMin ? <Txt f="serif" s={15} c="mut">~{fmtDur(t.estimateMin)}</Txt> : null}
            {t.subtasks.length ? <Txt f="serif" s={15} c="mut">{sd}/{t.subtasks.length} steps</Txt> : null}
            {t.priority >= 2 && <Icon name="flag" size={16} color={t.priority === 3 ? c.bad : c.warn} />}
            {w?.tight && <Txt f="bold" s={15} c="warn">tight</Txt>}
          </View>
        </HandBox>
      </Pressable>
    </SwipeCard>
  );
}, (a, b) => a.t === b.t && Math.floor(a.now / 60_000) === Math.floor(b.now / 60_000));
/** the 28px attendance cell; the hit area is the cell itself because the 3px gutter leaves no room for an honest bigger one */
export function AttCell({ status, inferred, future, locked, onTap, onHold, label, pulse, testID }: { status: AttStatus | null; inferred: boolean; future: boolean; locked: boolean; onTap: () => void; onHold: () => void; label: string; pulse?: number; testID?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), sc = useSharedValue(1), sh = useSharedValue(0);
  useEffect(() => { if (pulse && !reduce) sc.value = withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 160 })); }, [pulse, reduce, sc]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }, { translateX: sh.value }] })), col = statusColor(status, c);
  const deny = () => { fx.denied(); if (!reduce) sh.value = withSequence(withTiming(-3, { duration: 40 }), withTiming(3, { duration: 70 }), withTiming(0, { duration: 40 })); };
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={locked ? 'Locked. Unlock the grid to change.' : inferred || !status ? 'Tap to mark. After that, long press to change.' : 'Long press to change.'}
      onPress={() => { if (locked) return deny(); if (!status || inferred) onTap(); else deny(); }} onLongPress={() => { if (locked) return deny(); onHold(); }} delayLongPress={380} hitSlop={1}>
      <Animated.View style={[{ width: 28, height: 28, borderRadius: 7, borderWidth: inferred || future ? 1.2 : 1.9, borderColor: future ? hexA(c.ink, 0.25) : col, borderStyle: inferred || future ? 'dashed' : 'solid', backgroundColor: status && !inferred && !future ? hexA(col, 0.12) : 'transparent', alignItems: 'center', justifyContent: 'center' }, st]}>
        {status && <Txt f="marker" s={status === 'p' ? 16 : 15} maxFontSizeMultiplier={FS} style={{ color: col, opacity: inferred ? 0.55 : 1, lineHeight: 20 }}>{STATUS_GLYPH[status]}</Txt>}
      </Animated.View>
    </Pressable>
  );
}
export { StyleSheet, Tape, useWindowDimensions };
