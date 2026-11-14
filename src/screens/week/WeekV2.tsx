import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Bubble } from '../../ui/Bubble';
import { DragCard } from '../../ui/DragCard';
import { GlassCard, glassStyle } from '../../ui/Glass';
import { islandSpace } from '../../ui/Island';
import { Sky } from '../../ui/Sky';
import { TimeField } from '../../ui/fields';
import { Icon } from '../../ui/kit';
import { Face } from '../../ui/mascot/Face';
import { FACES } from '../../ui/mascot/faces';
import { MOMENTS, emptyFace, pageFace, useFaceMoment } from '../../ui/mascot/moments';
import { FAB, FAB_GAP, navHeight, pageBottomPad } from '../../ui/fit';
import { useScreenLive } from '../../ui/live';
import { useNow, useReduceMotion } from '../../ui/theme-context';
import { act, useStore } from '../../store/store';
import { lanes } from '../../domain/attendance';
import { moveAt, moveClashes, withMove } from '../../domain/moves';
import { uid } from '../../domain/time';
import { RADIUS, SPACE, TOUCH } from '../../tokens/v2';
import { Button, Glyph, Segmented, T, Tap, TintMark, tintOf, useV2 } from '../today/kitv2';
import { WeekStrip } from '../today/WeekStrip';
import type { ClassItem } from '../today/model';
import { SNAP, dropSlot, hhmm, slotId, slotOf, weekView, type WeekDay, type WeekVM } from './model';

/** Grid scale: 0.9 dp a minute (08:00–16:00 is 432 dp); the hour gutter. */
const PX = 0.9, GUTTER = 34;
const minOf = (ms: number) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
const durOf = (x: ClassItem) => Math.max(SNAP, Math.round((x.end - x.start) / 60_000));
/** A grid card's name (D-12: the first word): whole when it fits a 46 dp column at 12 sp, else its first four letters. */
export const gridName = (name: string) => { const w = name.split(' ')[0] ?? name; return w.length <= 6 ? w : w.slice(0, 4); };

export const WEEK_TIPS = [
  'Hold a class in the grid and drag it to move it.',
  'Moving a class asks: this week only, or every week.',
  'Tap a day in the strip to see just that day.',
] as const;

/** A move being decided: the class, where it is now, where it would go; `pick` = choose the day and time here. */
interface Draft { item: ClassItem; from: WeekDay; to: number; start: number; dur: number; pick: boolean }

/** One class as a card on the day's rail: time, tint, name, the rest, its bubble. Tap = attendance, hold = move. */
function RailCard({ x, tint, live, onOpen, onHold }: { x: ClassItem; tint: string; live: boolean; onOpen: () => void; onHold: () => void }) {
  const { t, scheme } = useV2();
  return (
    <Tap onPress={onOpen} onLongPress={onHold} delayLongPress={250} label={x.spoken} hint="Opens attendance. Hold to move it." testID={`week-class-${x.key}`}
      style={[glassStyle(scheme), live ? { borderColor: t.now, borderTopColor: t.now, borderWidth: 1.5 } : null, { flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s3 }]}>
      <View style={{ width: 52 }}>
        <T k="subtitle">{x.range.split('–')[0]}</T>
        <T k="bodyS" c="ink3">{x.range.split('–')[1]}</T>
      </View>
      <TintMark color={tint} height={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T k="body" c={x.cancelled ? 'ink3' : 'ink'} numberOfLines={2} style={[{ fontWeight: '600' }, x.cancelled ? { textDecorationLine: 'line-through' } : null]}>{x.name}</T>
        <T k="bodyS" c="ink2" numberOfLines={2}>{[x.part, x.room, x.teacher].filter(Boolean).join(' · ') || x.range}</T>
      </View>
      <Bubble state={x.bubble} size={20} scheme={scheme} label={x.name} />
    </Tap>
  );
}

/** The selected day as a rail: cards in time order; a free stretch is a gap that grows with its length, capped. */
function DayRail({ day, isToday, now, tintFor, onOpen, onHold }: { day: WeekDay; isToday: boolean; now: number; tintFor: (id: string) => string; onOpen: (x: ClassItem) => void; onHold: (x: ClassItem) => void }) {
  if (!day.classes.length) return <T k="voice" c="ink2" style={{ paddingVertical: SPACE.s3, paddingHorizontal: SPACE.s1 }}>{`No classes on ${day.dw}.`}</T>;
  return (
    <View testID="week-rail">
      {day.classes.map((x, k) => {
        const prev = day.classes[k - 1], gap = prev ? Math.round((x.start - prev.end) / 60_000) : 0;
        const nowHere = isToday && prev && now >= prev.end && now < x.start;
        return (
          <React.Fragment key={x.key}>
            {k > 0 ? (
              <View style={{ height: Math.min(40, Math.max(SPACE.s2, gap * 0.5)), justifyContent: 'center', paddingLeft: SPACE.s4 }}>
                {gap >= 30 ? <T k="label" c={nowHere ? 'now' : 'ink3'}>{nowHere ? 'Now' : `${gap >= 60 ? `${Math.floor(gap / 60)} h ` : ''}${gap % 60 ? `${gap % 60} min ` : ''}free`}</T> : null}
              </View>
            ) : null}
            <RailCard x={x} tint={tintFor(x.courseId)} live={x.live} onOpen={() => onOpen(x)} onHold={() => onHold(x)} />
          </React.Fragment>
        );
      })}
    </View>
  );
}

/** The week as a grid: seven columns, the hours down the side, short names; hold a card and drag it (D-23). */
function Grid({ vm, now, reduce, ghost, tintFor, onOpen, onHold, onSlot, onDrop, onDay }: {
  vm: WeekVM; now: number; reduce: boolean; ghost: { slot: number; dur: number } | null; tintFor: (id: string) => string;
  onOpen: (x: ClassItem) => void; onHold: (x: ClassItem, d: WeekDay) => void; onSlot: (x: ClassItem | null, slot: number | null) => void;
  onDrop: (x: ClassItem, d: WeekDay, slot: number) => void; onDay: (d: WeekDay) => void;
}) {
  const { t } = useV2();
  const [w, setW] = useState(0);
  const { start: s0, end: s1 } = vm.span, H = (s1 - s0) * PX, colW = Math.max(1, (w - GUTTER) / 7);
  const hours = Array.from({ length: (s1 - s0) / 60 + 1 }, (_, i) => s0 / 60 + i);
  const today = vm.days.findIndex((d) => d.isToday), nowY = (minOf(now) - s0) * PX;
  return (
    <View onLayout={(e) => { const v = Math.round(e.nativeEvent.layout.width); if (v !== w) setW(v); }} testID="week-grid">
      <View style={{ flexDirection: 'row', paddingLeft: GUTTER, marginBottom: SPACE.s2 }}>
        {vm.days.map((d) => (
          <Tap key={d.day} onPress={() => onDay(d)} label={`${d.label}, ${d.classes.length} classes. Show the day`} style={{ width: colW, alignItems: 'center', minHeight: 40, justifyContent: 'center' }}>
            <T k="caps" c={d.isToday ? 'ink' : 'ink3'}>{d.dw}</T>
            <T k="label" c={d.isToday ? 'ink' : 'ink2'} style={d.isToday ? { fontWeight: '700' } : null}>{d.label.split(' ')[1]}</T>
          </Tap>
        ))}
      </View>
      {w > 0 ? (
        <View style={{ height: H }}>
          {hours.map((h, i) => (
            <View key={h} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: i * 60 * PX, flexDirection: 'row', alignItems: 'center' }}>
              <T k="label" c="ink3" style={{ width: GUTTER - 6, textAlign: 'right', marginTop: -16 }}>{String(h)}</T>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: t.ring, marginLeft: 6 }} />
            </View>
          ))}
          {today >= 0 && nowY > 0 && nowY < H ? <View pointerEvents="none" style={{ position: 'absolute', left: GUTTER, right: 0, top: nowY, height: 2, backgroundColor: t.now }} /> : null}
          {ghost ? (() => {
            const g = slotOf(ghost.slot);
            return (
              <View pointerEvents="none" testID="week-ghost" style={{ position: 'absolute', left: GUTTER + g.day * colW + 1, width: colW - 2, top: (g.start - s0) * PX, height: Math.max(22, ghost.dur * PX - 2), borderRadius: RADIUS.chip, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.ink2, alignItems: 'center', justifyContent: 'flex-end' }}>
                <View style={{ position: 'absolute', top: -22, paddingHorizontal: SPACE.s1, borderRadius: RADIUS.chip, backgroundColor: t.ink }}><T k="label" c={t.flat}>{`${vm.days[g.day]?.dw} ${hhmm(g.start)}`}</T></View>
              </View>
            );
          })() : null}
          {vm.days.map((d, di) => {
            const lay = lanes(d.classes.map((x) => ({ start: minOf(x.start), end: minOf(x.start) + durOf(x) })));
            return d.classes.map((x, k) => {
              const start0 = minOf(x.start), dur = durOf(x), of = lay[k]?.of ?? 1, lane = lay[k]?.lane ?? 0, cw = (colW - 2) / of;
              const slotOfDrag = (dx: number, dy: number) => { 'worklet'; return slotId(dropSlot(di, start0, dur, dx, dy, colW, PX, s0, s1)); };
              return (
                <DragCard key={x.key} reduce={reduce} slotOf={slotOfDrag} testID={`week-cell-${x.key}`}
                  label={x.spoken} hint="Tap for attendance. Hold and drag to move it."
                  actions={[{ name: 'edit', label: 'Edit class' }]} onAction={(n) => { if (n === 'edit') act.open({ t: 'meeting', id: x.meetingId }); }}
                  onTap={() => onOpen(x)} onHold={() => onHold(x, d)} onSlot={(s) => onSlot(s === null ? null : x, s)} onDrop={(s) => onDrop(x, d, s)}
                  style={{ position: 'absolute', left: GUTTER + di * colW + 1 + lane * cw, width: cw - (of > 1 ? 1 : 0), top: (start0 - s0) * PX, height: Math.max(22, dur * PX - 2) }}>
                  <View style={{ flex: 1, flexDirection: 'row', borderRadius: RADIUS.chip, overflow: 'hidden', backgroundColor: t.glassStrong, borderWidth: StyleSheet.hairlineWidth, borderColor: x.live ? t.now : t.ring }}>
                    <View style={{ width: 3, backgroundColor: tintFor(x.courseId) }} />
                    <View style={{ flex: 1, paddingHorizontal: 3, paddingTop: 2 }}>
                      <T k="label" c={x.cancelled ? 'ink3' : 'ink'} numberOfLines={1} ellipsizeMode="clip" style={[{ fontSize: 12, lineHeight: 15, fontWeight: '600' }, x.cancelled ? { textDecorationLine: 'line-through' } : null]}>{gridName(x.name)}</T>
                      {dur * PX > 40 && x.room ? <T k="label" c="ink2" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>{x.room}</T> : null}
                    </View>
                  </View>
                </DragCard>
              );
            });
          })}
        </View>
      ) : <View style={{ height: H }} />}
    </View>
  );
}

/** The decision after a drag, or "Move…" from a hold (or TalkBack): this week only, or every week (DESIGN.md D-23). */
function MovePanel({ d, vm, hour12, onChange, onClose }: { d: Draft; vm: WeekVM; hour12: boolean; onChange: (d: Draft) => void; onClose: () => void }) {
  const { t, scheme } = useV2(), ins = useSafeAreaInsets();
  const meetings = useStore((s) => s.meetings), moves = useStore((s) => s.settings.moves) ?? [];
  const m = meetings.find((x) => x.id === d.item.meetingId);
  const to = vm.days[d.to]!, start = hhmm(d.start), end = hhmm(d.start + d.dur), fromStart = hhmm(minOf(d.item.start));
  const here = to.date === d.from.date && start === fromStart;
  const clash = !!m && !here && moveClashes(to.date, to.wd, meetings, moves, m, start, { day: d.from.date, start: fromStart });
  const thisWeek = () => {
    if (!m) return;
    act.setSettings({ moves: withMove(moves, m, d.from.date, fromStart, to.date, start, end, uid('mv')) });
    onClose();
  };
  const everyWeek = () => {
    if (!m) return;
    const moved = moveAt(moves, m.id, d.from.date, fromStart);
    if (!act.saveMeeting({ ...m, weekday: to.wd, start, end })) return;
    if (moved) act.setSettings({ moves: moves.filter((v) => v !== moved) });
    onClose();
  };
  return (
    <View style={StyleSheet.absoluteFill} testID="week-move">
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel the move" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
      {/* above the old nav bar and its + button, which this page cannot cover (they belong to the navigator), and
          opaque: nothing under the panel shows through its words */}
      <View accessibilityViewIsModal style={[glassStyle(scheme, true), { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.flat, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingBottom: navHeight(ins.bottom) + FAB + FAB_GAP + SPACE.s2, gap: SPACE.s3 }]}>
        <T k="title" accessibilityRole="header">{`Move ${d.item.name}${d.pick ? '' : ` to ${to.dw} ${start}`}?`}</T>
        <T k="bodyS" c="ink2">{`Now ${d.from.label}, ${d.item.range}. ${here ? 'Pick a new day or time.' : `New: ${to.label}, ${start}–${end}.`}`}</T>
        {d.pick ? (<>
          <View accessibilityRole="radiogroup" accessibilityLabel="Day" style={{ flexDirection: 'row', gap: SPACE.s1 }}>
            {vm.days.map((x, k) => (
              <Tap key={x.day} role="radio" selected={k === d.to} onPress={() => onChange({ ...d, to: k })} label={x.label} testID={`move-day-${k}`}
                style={{ flex: 1, minHeight: TOUCH, borderRadius: RADIUS.control, alignItems: 'center', justifyContent: 'center', backgroundColor: k === d.to ? t.ink : t.fill }}>
                <T k="label" c={k === d.to ? t.flat : 'ink'} style={{ fontWeight: '600' }}>{x.dw}</T>
              </Tap>
            ))}
          </View>
          <TimeField label="Starts" value={d.start} hour12={hour12} max={1435 - d.dur} onChange={(v) => onChange({ ...d, start: v })} />
        </>) : null}
        {clash ? <T k="bodyS" c="bad">{`${d.item.name} already starts at ${start} on ${to.dw}. Two of them could never be marked apart.`}</T> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.s2 }}>
          <Button kind="filled" label="This week only" testID="move-week" disabled={here || clash || !m} onPress={thisWeek} />
          <Button kind="tonal" label="Every week" testID="move-every" disabled={here || clash || !m} onPress={everyWeek} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Button small kind="text" label="Edit class" onPress={() => { onClose(); act.open({ t: 'meeting', id: d.item.meetingId }); }} />
          <Button small kind="text" label="Cancel" testID="move-cancel" onPress={onClose} />
        </View>
      </View>
    </View>
  );
}

/**
 * Week v2 (DESIGN.md D-12, PLAN R2): a focused day on a rail under the week strip, or the whole week as a grid where
 * a class is held and dragged to move it (D-23): "This week only" (a one-off move, `domain/moves.ts`) or "Every week"
 * (the timetable). Under reduced motion nothing drags: holding a class opens the same choice with a day and a time.
 * One face (the top bar's, `pageFace('Week')`); a timetable with no classes at all is the page-wide empty state.
 */
export function WeekV2({ onClassic }: { onClassic?: () => void }) {
  const meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), variants = useStore((s) => s.variants), attendance = useStore((s) => s.attendance);
  const dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks), hour12 = useStore((s) => s.settings.hour12), moves = useStore((s) => s.settings.moves), skyMode = useStore((s) => s.settings.sky);
  const { t, scheme } = useV2(), ins = useSafeAreaInsets(), reduce = useReduceMotion(), live = useScreenLive();
  const now = useNow(live ? 30_000 : 0);
  const [off, setOff] = useState(0), [sel, setSel] = useState<number | null>(null), [view, setView] = useState<'day' | 'grid'>('day');
  const [draft, setDraft] = useState<Draft | null>(null), [ghost, setGhost] = useState<{ slot: number; dur: number } | null>(null);
  const vm = useMemo(() => weekView({ now, off, sel, meetings, courses, variants, attendance, dayMarks, tasks, hour12, moves }), [now, off, sel, meetings, courses, variants, attendance, dayMarks, tasks, hour12, moves]);
  const empty = meetings.length === 0;
  const { face, play } = useFaceMoment(pageFace('Week', { hour: new Date(now).getHours() }), live);
  const [tip, setTip] = useState<string | null>(null);
  useEffect(() => { if (!tip) return; const id = setTimeout(() => setTip(null), MOMENTS.tip.holdMs); return () => clearTimeout(id); }, [tip]);
  const tintFor = (id: string) => tintOf(id, courses, scheme);
  const open = (x: ClassItem) => act.open({ t: 'status', mode: 'class', key: x.key, title: x.name, date: x.date });
  const pick = (x: ClassItem, d: WeekDay) => setDraft({ item: x, from: d, to: vm.days.indexOf(d), start: minOf(x.start), dur: durOf(x), pick: true });
  const dropped = (x: ClassItem, d: WeekDay, slot: number) => {
    const s = slotOf(slot);
    setDraft({ item: x, from: d, to: s.day, start: s.start, dur: durOf(x), pick: s.day === vm.days.indexOf(d) && s.start === minOf(x.start) });
  };
  return (
    <View style={{ flex: 1 }} testID="week-v2">
      <Sky mode={skyMode} scheme={scheme} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: ins.top + SPACE.s3, paddingHorizontal: SPACE.gutter, paddingBottom: Math.max(pageBottomPad(ins.bottom), islandSpace(ins.bottom)), gap: SPACE.s3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.s2 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T k="titleL" accessibilityRole="header">Week</T>
            <T k="bodyS" c="ink2">{`${vm.when} · ${vm.label}`}</T>
          </View>
          {!empty ? (
            <Tap onPress={() => { play('tip'); setTip(WEEK_TIPS[(Math.floor(now / 86_400_000) + (tip ? 1 : 0)) % WEEK_TIPS.length]!); }} label={`Jot, ${FACES[face.name].label}. Tap for a tip`} testID="week-face"
              style={{ minWidth: TOUCH, minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Face {...face} size={28} scheme={scheme} awake={live} decorative />
            </Tap>
          ) : null}
          <Tap onPress={() => act.open({ t: 'settings' })} label="Settings" testID="open-settings" style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="gear" size={24} color={t.ink2} />
          </Tap>
        </View>
        {tip ? (
          <Animated.View entering={reduce ? undefined : FadeIn.duration(200)} accessibilityLiveRegion="polite" style={[glassStyle(scheme, true), { alignSelf: 'flex-end', maxWidth: 300, marginTop: -SPACE.s2, paddingVertical: SPACE.s2, paddingHorizontal: SPACE.s3 }]}>
            <T k="voice">{tip}</T>
          </Animated.View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s1 }}>
          <Tap onPress={() => { setOff(off - 1); setSel(null); }} label="Previous week" testID="week-prev" style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}><Glyph name="back" size={20} color={t.ink} /></Tap>
          <Tap onPress={() => { setOff(off + 1); setSel(null); }} label="Next week" testID="week-next" style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}><Glyph name="chevron" size={20} color={t.ink} /></Tap>
          {off !== 0 ? <Button small kind="text" label="This week" onPress={() => { setOff(0); setSel(null); }} /> : null}
          <View style={{ flex: 1 }} />
          <View style={{ width: 168 }}><Segmented label="View" testID="week-view" value={view} options={[['day', 'Day'], ['grid', 'Grid']] as const} onChange={setView} /></View>
        </View>
        {empty ? (
          <View style={[glassStyle(scheme), { alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s5 }]}>
            <Face name={emptyFace('weekNoClasses') ?? 'sleepy'} size={64} scheme={scheme} awake={live} decorative />
            <T k="voice" c="ink2" style={{ textAlign: 'center' }}>No timetable yet. Add your first class and the week fills in.</T>
            <Button kind="filled" label="Add a class" onPress={() => act.open({ t: 'meeting' })} />
          </View>
        ) : view === 'day' ? (<>
          <View style={[glassStyle(scheme), { padding: SPACE.s2 }]}>
            <WeekStrip week={vm.pills} onPick={(d) => setSel(d)} />
          </View>
          <DayRail day={vm.sel} isToday={vm.sel.isToday} now={now} tintFor={tintFor} onOpen={open} onHold={(x) => pick(x, vm.sel)} />
        </>) : (
          <View style={[glassStyle(scheme), { paddingHorizontal: SPACE.s2 }]}>
            <Grid vm={vm} now={now} reduce={reduce} ghost={ghost} tintFor={tintFor} onOpen={open} onHold={pick}
              onSlot={(x, s) => setGhost(x && s !== null ? { slot: s, dur: durOf(x) } : null)} onDrop={dropped}
              onDay={(d) => { setSel(d.day); setView('day'); }} />
          </View>
        )}
        {!empty ? (
          <GlassCard scheme={scheme} title="Due this week" summary={vm.dueCount ? `${vm.dueCount} due` : 'nothing due'}>
            {vm.due.length === 0 ? <T k="voice" c="ink2" style={{ paddingVertical: SPACE.s2 }}>Nothing due this week.</T> : vm.due.map((g) => (
              <View key={g.day} style={{ marginTop: SPACE.s1 }}>
                <T k="label" c="ink3" accessibilityRole="header">{g.label}</T>
                {g.rows.map((r) => (
                  <Tap key={r.id} onPress={() => act.open({ t: 'task', id: r.id })} label={`${r.title}, due ${r.when}`} hint="Opens the task" testID={`week-due-${r.id}`} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: SPACE.s1 }}>
                    <T k="body" numberOfLines={2}>{r.title}</T>
                    <T k="bodyS" c={r.late ? 'bad' : 'ink3'}>{[r.course, r.when].filter(Boolean).join(' · ')}</T>
                  </Tap>
                ))}
              </View>
            ))}
          </GlassCard>
        ) : null}
        {!empty ? <Button small kind="text" label="Add a class" a11y={`Add a class on ${vm.sel.dw}`} onPress={() => act.open({ t: 'meeting', weekday: vm.sel.wd })} style={{ alignSelf: 'flex-start' }} /> : null}
        {onClassic ? <Button small kind="text" label="Classic Week" a11y="Show the classic Week, from version 0.6" testID="week-classic" onPress={onClassic} style={{ alignSelf: 'center', marginTop: SPACE.s2 }} /> : null}
      </ScrollView>
      {draft ? <MovePanel d={draft} vm={vm} hour12={hour12} onChange={setDraft} onClose={() => setDraft(null)} /> : null}
    </View>
  );
}
