import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { HandBox, Icon, Txt } from '../ui/kit';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { hexA } from '../tokens/theme';
import { fx } from '../services/fx';

/**
 * Onboarding page 2: what the app is made of, shown rather than described. Each row is a small working
 * replica of the real thing (the deck counts down, the bar dims what has passed) beside one precise line.
 * Rows are placed onto the page one after another when it opens, like cards dealt onto a desk; touching
 * one lifts it and tells Scrap where to look.
 */
const ROWS = [
  { key: 'deck', title: 'The class you are in', line: 'Now, time left, and what is next.' },
  { key: 'add', title: 'The + button', line: 'Add a subject, class, task, mark or note.' },
  { key: 'stamp', title: 'Attendance stamps', line: 'Tap a class to stamp it.' },
  { key: 'focus', title: 'Focus', line: 'A quiet timer for study.' },
  { key: 'tabs', title: 'Five pages', line: 'Today, Week, To-do, Grades, Stats.' },
] as const;

function MiniDeck() {
  const { c } = useTheme(), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  /* A 50-minute period that started 21 minutes "ago" whenever the page opened, ticking for real. */
  const [t0] = useState(() => Date.now() - 21 * 60_000), left = Math.max(0, t0 + 50 * 60_000 - now), p = 1 - left / (50 * 60_000);
  const mm = String(Math.floor(left / 60_000)).padStart(2, '0'), ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');
  return (
    <HandBox seed="legend-deck" fill={c.deck} cut="torn" style={{ width: 128, height: 76, paddingHorizontal: 10, paddingTop: 8, gap: 1 }}>
      <Txt f="marker" s={12.5} c="deckInk" numberOfLines={1}>Discrete Maths</Txt>
      <Txt f="type" s={19} c="deckInk">{mm}:{ss}</Txt>
      {/* elapsed time is DIMMED, never slid past: the bar rule the whole app keeps */}
      <View style={{ flexDirection: 'row', gap: 1.5, marginTop: 3 }}>
        {Array.from({ length: 22 }, (_, i) => <View key={i} style={{ flex: 1, height: 6, borderRadius: 1, backgroundColor: c.deckInk, opacity: i / 22 < p ? 0.3 : 0.95 }} />)}
      </View>
    </HandBox>
  );
}
function MiniAdd() {
  const { c } = useTheme();
  return <View style={{ width: 128, alignItems: 'center' }}><HandBox seed="legend-add" fill={c.acc} cut="cut" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={26} color={c.onAcc} sw={2.6} /></HandBox></View>;
}
function MiniStamps() {
  const { c } = useTheme();
  const S = [['✓', c.ok], ['L', c.warn], ['✕', c.bad]] as const;
  return (
    <View style={{ width: 128, flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
      {S.map(([g, col], i) => (
        <View key={g} style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: col, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${(i - 1) * 9}deg` }] }}>
          <Txt f="marker" s={17} c={col}>{g}</Txt>
        </View>
      ))}
    </View>
  );
}
function MiniFocus() {
  const { c } = useTheme();
  return <View style={{ width: 128, alignItems: 'center' }}><HandBox seed="legend-focus" fill={c.ink} cut="cut" style={{ height: 38, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="timer" size={17} color={c.paper} /><Txt f="type" s={17} c="paper">25:00</Txt></HandBox></View>;
}
function MiniTabs() {
  const { c } = useTheme();
  return (
    <View style={{ width: 128, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      {['today', 'week', 'tasks', 'grades', 'stats'].map((n, i) => <Icon key={n} name={n} size={19} color={i === 0 ? c.acc : c.mut} />)}
    </View>
  );
}
const MINI = { deck: MiniDeck, add: MiniAdd, stamp: MiniStamps, focus: MiniFocus, tabs: MiniTabs };

function Row({ i, row, active, on, onPress }: { i: number; row: (typeof ROWS)[number]; active: boolean; on: boolean; onPress: () => void }) {
  const { c } = useTheme(), reduce = useReduceMotion(), place = useSharedValue(reduce ? 1 : 0), lift = useSharedValue(0);
  /* Dealt in when the page becomes the one on screen: each card arrives from a little below and a little
     turned, and settles flat, 70 ms after the one before it. */
  useEffect(() => { if (active && !reduce) { place.set(0); place.set(withDelay(80 + i * 70, withSpring(1, { duration: 520, dampingRatio: 0.72 }))); } else place.set(1); }, [active, reduce, i, place]);
  useEffect(() => { lift.set(reduce ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 180, easing: Easing.out(Easing.quad) })); }, [on, reduce, lift]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - place.get()) * 26 - lift.get() * 3 }, { rotate: `${(1 - place.get()) * (i % 2 ? 3 : -3)}deg` }, { scale: 1 + lift.get() * 0.015 }] }));
  const Mini = MINI[row.key];
  return (
    <Animated.View style={st}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${row.title}. ${row.line}`} accessibilityState={{ selected: on }}>
        <HandBox seed={`legend-${row.key}`} fill={on ? c.card : hexA(c.card, 0.86)} stroke={on ? c.acc : undefined} sw={2} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10 }}>
          <Mini />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt f="bold" s={17}>{row.title}</Txt>
            <Txt f="serif" s={14.5} c="mut">{row.line}</Txt>
          </View>
        </HandBox>
      </Pressable>
    </Animated.View>
  );
}

export function Legend({ active, onLook }: { active: boolean; onLook: (index: number, of: number) => void }) {
  const [on, setOn] = useState(-1);
  return (
    <View style={{ gap: 9 }}>
      {ROWS.map((r, i) => <Row key={r.key} i={i} row={r} active={active} on={on === i} onPress={() => { fx.select(); setOn(i); onLook(i, ROWS.length); }} />)}
    </View>
  );
}
