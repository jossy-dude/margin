import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import { HandBox, Icon, Tape, Txt } from '../kit';
import { useReduceMotion, useTheme } from '../theme-context';
import { FS } from '../fit';
import { fmtDay, fmtTime, startOfDay } from '../../domain/time';
import type { Notice } from '../../domain/types';
import { NOTE_LEVEL, noteDate } from './notes';

/**
 * A pinned note on Today, coloured by how much it matters (owner: priorities should look different, with an
 * icon, and a note can have a date). Four papers: a plain note on card, a heads-up on sky, an important one on
 * the yellow sticky, an urgent one on blush with red tape and a bell that gives a shake now and then.
 * The note itself is written in a hand (`script`): it is something you scribbled, not a form you filled in.
 */
export function NoteCard({ n, subject, i, now, live, hour12, onPress }: { n: Notice; subject: string | null; i: number; now: number; live: boolean; hour12: boolean; onPress: () => void }) {
  const { c, tints } = useTheme(), lvl = NOTE_LEVEL[n.priority] ?? NOTE_LEVEL[0], urgent = n.priority === 3;
  const bg = n.priority === 0 ? c.card : n.priority === 1 ? tints.sky : n.priority === 2 ? c.hl : tints.blush;
  const date = noteDate(n, now), sameDay = date !== null && startOfDay(date) === startOfDay(now);
  const when = date === null ? null : sameDay ? (new Date(date).getHours() || new Date(date).getMinutes() ? `today ${fmtTime(date, hour12)}` : 'today') : fmtDay(date, now);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${lvl.word}: ${n.text}${subject ? `, ${subject}` : ''}${when ? `, for ${when}` : ''}`} onPress={onPress} style={{ transform: [{ rotate: `${(i % 3 - 1) * 1.6}deg` }] }}>
      <HandBox seed={n.id} fill={bg} style={{ width: 222, minHeight: 120, padding: 12, paddingTop: 16, gap: 4 }}>
        <Tape w={46} rot={-6} style={{ top: -9, left: 88, ...(urgent ? { opacity: 1 } : null) }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {urgent ? <Shake live={live}><Icon name={lvl.icon} size={16} color={c.bad} sw={2.2} /></Shake> : <Icon name={lvl.icon} size={15} color={c.ink} />}
          <Txt f="bold" s={14} c={urgent ? 'bad' : 'ink'} maxFontSizeMultiplier={FS}>{lvl.word}</Txt>
          {/* `mut` fails on the yellow sticky in some palettes (4.02:1), so from Important up the subject is ink. */}
          {subject ? <Txt f="serif" s={13} c={n.priority >= 2 ? c.ink : 'mut'} numberOfLines={1} style={{ flex: 1 }}>· {subject}</Txt> : null}
        </View>
        <Txt f="script" s={23} numberOfLines={4} style={{ lineHeight: 25 }}>{n.text}</Txt>
        {when ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' }}><Icon name="clock" size={13} color={n.priority >= 2 ? c.ink : c.mut} /><Txt f="type" s={13} c={n.priority >= 2 ? c.ink : 'mut'}>for {when}</Txt></View> : null}
      </HandBox>
    </Pressable>
  );
}

/** A bell that rings: a quick shake every few seconds, only while the page is on screen. */
function Shake({ children, live }: { children: React.ReactNode; live: boolean }) {
  const reduce = useReduceMotion(), r = useSharedValue(0);
  useEffect(() => {
    if (reduce || !live) { cancelAnimation(r); r.set(0); return; }
    r.set(withRepeat(withSequence(withTiming(14, { duration: 60 }), withTiming(-12, { duration: 80 }), withTiming(9, { duration: 80 }), withTiming(-6, { duration: 70 }), withTiming(0, { duration: 70 }), withDelay(3200, withTiming(0, { duration: 1 }))), -1));
    return () => cancelAnimation(r);
  }, [reduce, live, r]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}
